#include "wireless.h"
#include "wireless_logic.h"
#include "wireless_crypto.h"
#include "microphone.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"
#include "freertos/semphr.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "esp_wifi.h"
#include "esp_mac.h"
#include "esp_random.h"
#include "esp_timer.h"
#include "esp_tls.h"
#include "nvs.h"
#include "mbedtls/platform_util.h"
#include "mbedtls/ssl_ciphersuites.h"
#include "cJSON.h"
#include <stdatomic.h>
#include <string.h>
#include <stdio.h>
#include <fcntl.h>
#include <math.h>

typedef struct {uint8_t version,key[32];char ssid[33],password[64],host[16];} settings;
typedef struct {uint8_t data[WIRELESS_CONFIG_MAX],nonce[12];size_t size;unsigned revision;} provision;
typedef struct {char line[512];uint32_t connection,created;} message;
static settings saved;
static SemaphoreHandle_t lock;
static QueueHandle_t config_queue,tx_queue,rx_queue;
static wireless_fragments fragments;
static uint8_t mac[6],nonce[12];
static char identity[13];
static atomic_uint revision=1,connected,status_code,config_error;
static atomic_bool wifi_up,transport_failed;
static atomic_bool ready;
static uint32_t now_ms(void){return (uint32_t)(esp_timer_get_time()/1000);}
const char *wireless_device(void){return identity;}

static bool store_settings(const settings *value){
  nvs_handle_t handle;esp_err_t e=nvs_open("momo_wireless",NVS_READWRITE,&handle);
  if(e!=ESP_OK)return false;
  e=nvs_set_blob(handle,"settings",value,sizeof(*value));if(e==ESP_OK)e=nvs_commit(handle);nvs_close(handle);
  return e==ESP_OK;
}
void wireless_status(uint8_t out[20]){
  memset(out,0,20);out[0]=1;out[1]=8;memcpy(out+2,mac,6);
  if(!ready)return;
  xSemaphoreTake(lock,portMAX_DELAY);
  // Every new read starts a fresh challenge, including retry after an incomplete
  // transfer. Re-encrypting a changed payload must never reuse an AES-GCM nonce.
  esp_fill_random(nonce,sizeof(nonce));memset(&fragments,0,sizeof(fragments));
  unsigned error=atomic_load(&config_error);
  out[1]=saved.version?(error?error:atomic_load(&status_code)):0;memcpy(out+8,nonce,12);xSemaphoreGive(lock);
}
void wireless_provision_reset(void){if(!ready)return;xSemaphoreTake(lock,portMAX_DELAY);memset(&fragments,0,sizeof(fragments));xSemaphoreGive(lock);}
bool wireless_provision_write(const uint8_t *data,size_t length){
  if(!ready)return false;
  xSemaphoreTake(lock,portMAX_DELAY);
  if(!saved.version){xSemaphoreGive(lock);return false;}
  int result=wireless_fragment(&fragments,data,length,now_ms());
  bool ok=result>=0;
  if(result==1){
    provision item={.size=fragments.used,.revision=atomic_load(&revision)};
    memcpy(item.data,fragments.data,item.size);memcpy(item.nonce,nonce,12);
    // A completed attempt consumes its challenge even when authentication fails.
    esp_fill_random(nonce,sizeof(nonce));memset(&fragments,0,sizeof(fragments));
    ok=xQueueSend(config_queue,&item,0)==pdTRUE;atomic_store(&config_error,ok?0:8);atomic_store(&status_code,2);
    mbedtls_platform_zeroize(&item,sizeof(item));
  }
  xSemaphoreGive(lock);return ok;
}
static void apply_provision(provision *item){
  settings next;char plain[WIRELESS_CONFIG_MAX+1];
  xSemaphoreTake(lock,portMAX_DELAY);next=saved;xSemaphoreGive(lock);
  if(item->revision!=atomic_load(&revision)||!next.version||item->size<17)goto invalid;
  if(!wireless_decrypt(next.key,item->nonce,item->data,item->size,plain,sizeof(plain))){atomic_store(&config_error,6);goto done;}
  // The ciphertext must contain a complete, scalar-only JSON object.
  if(memchr(plain,0,item->size-16))goto invalid;
  cJSON *root=cJSON_ParseWithOpts(plain,NULL,true);if(!root)goto invalid;
  const cJSON *ssid=cJSON_GetObjectItemCaseSensitive(root,"ssid"),*password=cJSON_GetObjectItemCaseSensitive(root,"password"),*host=cJSON_GetObjectItemCaseSensitive(root,"host"),*port=cJSON_GetObjectItemCaseSensitive(root,"port");
  bool valid=cJSON_IsString(ssid)&&strlen(ssid->valuestring)>0&&strlen(ssid->valuestring)<=32&&cJSON_IsString(password)&&strlen(password->valuestring)>=8&&strlen(password->valuestring)<=63&&cJSON_IsString(host)&&wireless_ipv4(host->valuestring)&&cJSON_IsNumber(port)&&port->valuedouble==4786;
  if(valid)for(const unsigned char *p=(const unsigned char *)password->valuestring;*p;p++)if(*p<32||*p>126)valid=false;
  if(valid){memset(next.ssid,0,sizeof(next.ssid));memset(next.password,0,sizeof(next.password));memset(next.host,0,sizeof(next.host));strcpy(next.ssid,ssid->valuestring);strcpy(next.password,password->valuestring);strcpy(next.host,host->valuestring);}
  cJSON_Delete(root);if(!valid)goto invalid;
  xSemaphoreTake(lock,portMAX_DELAY);
  if(item->revision!=atomic_load(&revision)){xSemaphoreGive(lock);goto invalid;}
  if(!store_settings(&next)){xSemaphoreGive(lock);atomic_store(&config_error,8);goto done;}
  saved=next;atomic_fetch_add(&revision,1);atomic_store(&status_code,2);xSemaphoreGive(lock);goto done;
invalid:
  atomic_store(&config_error,7);
done:
  mbedtls_platform_zeroize(plain,sizeof(plain));mbedtls_platform_zeroize(&next,sizeof(next));mbedtls_platform_zeroize(item,sizeof(*item));
}
bool wireless_usb_byte(command_buffer *buffer,char byte,char *reply,size_t size){
  if(byte!='\n'){
    if(!buffer->dropping){if(byte=='\0'||buffer->used>=sizeof(buffer->data)-1){buffer->dropping=true;buffer->used=0;}else buffer->data[buffer->used++]=byte;}return false;
  }
  bool accepted=false;buffer->data[buffer->used]=0;
  cJSON *root=buffer->dropping?NULL:cJSON_ParseWithOpts(buffer->data,NULL,true);
  if(root){
    cJSON *p=cJSON_GetObjectItemCaseSensitive(root,"protocol"),*t=cJSON_GetObjectItemCaseSensitive(root,"type"),*id=cJSON_GetObjectItemCaseSensitive(root,"id"),*key=cJSON_GetObjectItemCaseSensitive(root,"key");
    if(cJSON_IsString(p)&&!strcmp(p->valuestring,"momo-easyinput/1")&&cJSON_IsString(t)&&!strcmp(t->valuestring,"wireless_bind")&&cJSON_IsNumber(id)&&isfinite(id->valuedouble)&&id->valuedouble>=1&&id->valuedouble<=2147483647&&floor(id->valuedouble)==id->valuedouble){
      settings next={.version=1};bool ok=false;const char *error="invalid_key";
      if(ready&&cJSON_IsString(key)&&wireless_hex_key(key->valuestring,next.key)){
        if(microphone_active())error="mic_busy";
        else {xSemaphoreTake(lock,portMAX_DELAY);ok=store_settings(&next);if(ok){saved=next;esp_fill_random(nonce,sizeof(nonce));memset(&fragments,0,sizeof(fragments));atomic_fetch_add(&revision,1);atomic_store(&connected,0);atomic_store(&config_error,0);atomic_store(&status_code,1);}xSemaphoreGive(lock);error=ok?"none":"storage";}
      }
      snprintf(reply,size,"\n{\"protocol\":\"momo-easyinput/1\",\"type\":\"wireless_state\",\"id\":%d,\"ok\":%s,\"device\":\"%s\",\"error\":\"%s\"}\n",id->valueint,ok?"true":"false",identity,error);
      if(cJSON_IsString(key))mbedtls_platform_zeroize(key->valuestring,strlen(key->valuestring));
      mbedtls_platform_zeroize(&next,sizeof(next));accepted=true;
    }
    cJSON_Delete(root);
  }
  mbedtls_platform_zeroize(buffer->data,sizeof(buffer->data));buffer->used=0;buffer->dropping=false;return accepted;
}
uint32_t wireless_connection(void){return atomic_load(&connected);}
bool wireless_next_command(char *line,size_t size,uint32_t *connection){
  if(!ready)return false;
  message item;
  while(xQueueReceive(rx_queue,&item,0)==pdTRUE){if(item.connection==wireless_connection()&&item.connection&&(uint32_t)(now_ms()-item.created)<500){snprintf(line,size,"%s",item.line);*connection=item.connection;return true;}}
  return false;
}
bool wireless_send(const char *line,uint32_t connection){
  if(!ready||!connection||connection!=wireless_connection())return false;
  message item={.connection=connection,.created=now_ms()};
  if(strlen(line)>=sizeof(item.line)){atomic_store(&transport_failed,true);return false;}
  strcpy(item.line,line);
  if(xQueueSend(tx_queue,&item,0)!=pdTRUE){atomic_store(&transport_failed,true);return false;}return true;
}
static void wifi_event(void *arg,esp_event_base_t base,int32_t id,void *data){
  (void)arg;(void)data;
  if(base==IP_EVENT&&id==IP_EVENT_STA_GOT_IP){atomic_store(&wifi_up,true);atomic_store(&status_code,3);}
  if(base==WIFI_EVENT&&id==WIFI_EVENT_STA_DISCONNECTED){atomic_store(&wifi_up,false);atomic_store(&status_code,5);}
}
static bool would_block(int error){return error==ESP_TLS_ERR_SSL_WANT_READ||error==ESP_TLS_ERR_SSL_WANT_WRITE;}
static void session(const settings *config,unsigned version){
  uint8_t key[32];if(!wireless_derive(config->key,"momo-wifi-v1",key))return;
  psk_hint_key_t psk={.key=key,.key_size=32,.hint=identity};
  static const int ciphers[]={MBEDTLS_TLS_ECDHE_PSK_WITH_CHACHA20_POLY1305_SHA256,0};
  esp_tls_cfg_t cfg={.psk_hint_key=&psk,.timeout_ms=2000,.ciphersuites_list=ciphers,.tls_version=ESP_TLS_VER_TLS_1_2};
  esp_tls_t *tls=esp_tls_init();if(!tls)goto end;
  if(esp_tls_conn_new_sync(config->host,strlen(config->host),4786,&cfg,tls)!=1)goto destroy;
  int fd;if(esp_tls_get_conn_sockfd(tls,&fd)!=ESP_OK||fcntl(fd,F_SETFL,O_NONBLOCK)<0)goto destroy;
  static uint32_t next=0;uint32_t generation=++next;if(!generation)generation=++next;
  xQueueReset(rx_queue);xQueueReset(tx_queue);atomic_store(&transport_failed,false);atomic_store(&connected,generation);atomic_store(&status_code,4);
  message outgoing={0},incoming={.connection=generation};size_t offset=0,used=0;bool sending=false;uint32_t last_receive=now_ms();
  while(atomic_load(&revision)==version&&!uxQueueMessagesWaiting(config_queue)&&atomic_load(&wifi_up)&&!atomic_load(&transport_failed)&&(uint32_t)(now_ms()-last_receive)<6000){
    if(!sending&&xQueueReceive(tx_queue,&outgoing,0)==pdTRUE){if(outgoing.connection!=generation)continue;offset=0;sending=true;}
    if(sending){
      if((uint32_t)(now_ms()-outgoing.created)>500)break;
      int n=esp_tls_conn_write(tls,outgoing.line+offset,strlen(outgoing.line)-offset);
      if(n>0){offset+=n;if(offset==strlen(outgoing.line))sending=false;}else if(!would_block(n))break;
    }
    char bytes[512];int n=esp_tls_conn_read(tls,bytes,sizeof(bytes));
    if(n==0||(n<0&&!would_block(n)))break;
    if(n>0){last_receive=now_ms();for(int i=0;i<n;i++){
      unsigned char b=bytes[i];
      if(b=='\n'){
        if(used){incoming.line[used++]='\n';incoming.line[used]=0;incoming.created=now_ms();if(xQueueSend(rx_queue,&incoming,0)!=pdTRUE)atomic_store(&transport_failed,true);}used=0;
      }else if(b<32||b>126||used>=sizeof(incoming.line)-2){atomic_store(&transport_failed,true);break;}
      else incoming.line[used++]=b;
    }}
    // At least 1 ms per iteration, independent of the UI and input sampling task.
    vTaskDelay(pdMS_TO_TICKS(1));
  }
  atomic_store(&connected,0);atomic_store(&status_code,atomic_load(&wifi_up)?3:5);
destroy:
  esp_tls_conn_destroy(tls);
end:
  mbedtls_platform_zeroize(key,sizeof(key));
}
static void worker(void *unused){
  (void)unused;unsigned applied=0;bool started=false;uint32_t retry=0;
  for(;;){
    provision item;while(xQueueReceive(config_queue,&item,0)==pdTRUE)apply_provision(&item);
    settings config;xSemaphoreTake(lock,portMAX_DELAY);config=saved;unsigned version=atomic_load(&revision);xSemaphoreGive(lock);
    if(version!=applied){
      if(started){esp_wifi_stop();started=false;}atomic_store(&wifi_up,false);applied=version;
      if(config.version&&config.ssid[0]&&wireless_ipv4(config.host)){
        wifi_config_t wifi={0};memcpy(wifi.sta.ssid,config.ssid,strlen(config.ssid));memcpy(wifi.sta.password,config.password,strlen(config.password));wifi.sta.threshold.authmode=WIFI_AUTH_WPA2_PSK;wifi.sta.pmf_cfg.capable=true;
        if(esp_wifi_set_config(WIFI_IF_STA,&wifi)==ESP_OK&&esp_wifi_start()==ESP_OK){started=true;esp_wifi_set_ps(WIFI_PS_NONE);esp_wifi_connect();retry=now_ms();}else atomic_store(&status_code,5);
        mbedtls_platform_zeroize(&wifi,sizeof(wifi));
      }
    }
    if(started&&atomic_load(&wifi_up))session(&config,version);
    else if(started&&(uint32_t)(now_ms()-retry)>=5000){esp_wifi_connect();retry=now_ms();}
    mbedtls_platform_zeroize(&config,sizeof(config));vTaskDelay(pdMS_TO_TICKS(500));
  }
}
void wireless_init(void){
  esp_read_mac(mac,ESP_MAC_WIFI_STA);snprintf(identity,sizeof(identity),"%02x%02x%02x%02x%02x%02x",mac[0],mac[1],mac[2],mac[3],mac[4],mac[5]);
  lock=xSemaphoreCreateMutex();config_queue=xQueueCreate(1,sizeof(provision));tx_queue=xQueueCreate(24,sizeof(message));rx_queue=xQueueCreate(8,sizeof(message));
  if(!lock||!config_queue||!tx_queue||!rx_queue)return;
  nvs_handle_t handle;if(nvs_open("momo_wireless",NVS_READONLY,&handle)==ESP_OK){size_t size=sizeof(saved);if(nvs_get_blob(handle,"settings",&saved,&size)!=ESP_OK||size!=sizeof(saved)||saved.version!=1)memset(&saved,0,sizeof(saved));nvs_close(handle);}
  saved.ssid[32]=0;saved.password[63]=0;saved.host[15]=0;
  // BLE is already initialized, giving esp_fill_random an active RF entropy source.
  esp_fill_random(nonce,sizeof(nonce));atomic_store(&status_code,saved.version?1:0);
  if(esp_netif_init()!=ESP_OK)return;
  esp_err_t e=esp_event_loop_create_default();if(e!=ESP_OK&&e!=ESP_ERR_INVALID_STATE)return;
  if(!esp_netif_create_default_wifi_sta())return;
  wifi_init_config_t cfg=WIFI_INIT_CONFIG_DEFAULT();
  if(esp_wifi_init(&cfg)!=ESP_OK||esp_wifi_set_storage(WIFI_STORAGE_RAM)!=ESP_OK||esp_wifi_set_mode(WIFI_MODE_STA)!=ESP_OK)return;
  if(esp_event_handler_register(WIFI_EVENT,ESP_EVENT_ANY_ID,wifi_event,NULL)!=ESP_OK||esp_event_handler_register(IP_EVENT,IP_EVENT_STA_GOT_IP,wifi_event,NULL)!=ESP_OK)return;
  ready=xTaskCreate(worker,"momo_wireless",10240,NULL,3,NULL)==pdPASS;
}
