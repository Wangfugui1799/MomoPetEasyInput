#include "microphone.h"
#include "microphone_logic.h"
#include "driver/i2s_std.h"
#include "cJSON.h"
#include <string.h>
#include <stdio.h>
#include <math.h>
#include <inttypes.h>
static mic_lease lease;
static i2s_chan_handle_t rx;
static bool enabled;
static volatile bool overflow;
static const char *fault;
static int32_t samples[MIC_SAMPLES*2];
static size_t used;
static bool on_overflow(i2s_chan_handle_t channel,i2s_event_data_t *event,void *ctx){(void)channel;(void)event;(void)ctx;overflow=true;return false;}
static void stop(void){lease.active=false;if(enabled){i2s_channel_disable(rx);enabled=false;}used=0;}
static bool start(void){
  if(!rx){
    i2s_chan_config_t channel=I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_1,I2S_ROLE_MASTER);
    channel.dma_desc_num=8;channel.dma_frame_num=MIC_SAMPLES;
    if(i2s_new_channel(&channel,NULL,&rx)!=ESP_OK)return false;
    i2s_std_config_t config={.clk_cfg=I2S_STD_CLK_DEFAULT_CONFIG(16000),.slot_cfg=I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_32BIT,I2S_SLOT_MODE_STEREO),.gpio_cfg={.mclk=I2S_GPIO_UNUSED,.bclk=9,.ws=10,.dout=I2S_GPIO_UNUSED,.din=11}};
    i2s_event_callbacks_t callbacks={.on_recv_q_ovf=on_overflow};
    if(i2s_channel_init_std_mode(rx,&config)!=ESP_OK||i2s_channel_register_event_callback(rx,&callbacks,NULL)!=ESP_OK){i2s_del_channel(rx);rx=NULL;return false;}
  }
  used=0;overflow=false;
  // Do not touch GPIO8: the existing sound initialization owns the shared rail.
  if(i2s_channel_enable(rx)!=ESP_OK)return false;
  enabled=true;return true;
}
static void state(char *reply,size_t size,int id,bool ok,const char *error){snprintf(reply,size,"\n{\"protocol\":\"momo-easyinput/1\",\"type\":\"mic_state\",\"id\":%d,\"stream\":%" PRIu32 ",\"ok\":%s,\"active\":%s,\"rate\":16000,\"error\":\"%s\"}\n",id,lease.stream,ok?"true":"false",lease.active?"true":"false",error);}
static bool scalar_json(const char *s){bool quoted=false,escape=false;int depth=0;for(;*s;s++){if(quoted){if(escape)escape=false;else if(*s=='\\')escape=true;else if(*s=='"')quoted=false;}else if(*s=='"')quoted=true;else if(*s=='[')return false;else if(*s=='{'&&++depth>1)return false;else if(*s=='}')depth--;}return !quoted&&depth==0;}
static bool integer(const cJSON *v){return cJSON_IsNumber(v)&&isfinite(v->valuedouble)&&v->valuedouble>=1&&v->valuedouble<=2147483647&&floor(v->valuedouble)==v->valuedouble;}
static bool command(const char *line,char *reply,size_t size,uint32_t now){
  if(!scalar_json(line))return false;
  cJSON *root=cJSON_ParseWithOpts(line,NULL,true);if(!root)return false;
  const cJSON *p=cJSON_GetObjectItemCaseSensitive(root,"protocol"),*t=cJSON_GetObjectItemCaseSensitive(root,"type"),*id=cJSON_GetObjectItemCaseSensitive(root,"id"),*stream=cJSON_GetObjectItemCaseSensitive(root,"stream");
  if(!cJSON_IsString(p)||strcmp(p->valuestring,"momo-easyinput/1")||!cJSON_IsString(t)||!integer(id)||!integer(stream)){cJSON_Delete(root);return false;}
  bool begin=!strcmp(t->valuestring,"mic_start"),ping=!strcmp(t->valuestring,"mic_ping"),end=!strcmp(t->valuestring,"mic_stop");
  if(!begin&&!ping&&!end){cJSON_Delete(root);return false;}
  if(mic_expire(&lease,now))stop();
  bool ok=false;const char *error="stale_stream";
  if(begin){if(lease.active){error="busy";}else {lease.stream=stream->valueint;if(start()){ok=mic_begin(&lease,stream->valueint,now);fault=NULL;}else error="i2s_start";}}
  else if(ping)ok=mic_renew(&lease,stream->valueint,now);
  else if(mic_end(&lease,stream->valueint)){stop();fault=NULL;ok=true;}
  state(reply,size,id->valueint,ok,ok?"none":error);cJSON_Delete(root);return true;
}
bool microphone_command_byte(command_buffer *b,char byte,char *reply,size_t size,uint32_t now){
  if(byte=='\n'){bool ready=false;if(!b->dropping){b->data[b->used]=0;ready=command(b->data,reply,size,now);}b->used=0;b->dropping=false;return ready;}
  if(!b->dropping){if(byte=='\0'||b->used>=sizeof(b->data)-1){b->dropping=true;b->used=0;}else b->data[b->used++]=byte;}return false;
}
bool microphone_poll(char *frame,size_t size,uint32_t now){
  if(mic_expire(&lease,now)){stop();fault="lease_expired";}
  if(lease.active&&overflow){stop();fault="overrun";}
  if(fault){state(frame,size,0,false,fault);fault=NULL;return true;}
  if(!lease.active)return false;
  size_t bytes=0;esp_err_t result=i2s_channel_read(rx,(uint8_t *)samples+used,sizeof(samples)-used,&bytes,0);used+=bytes;
  if(result!=ESP_OK&&result!=ESP_ERR_TIMEOUT){stop();state(frame,size,0,false,"i2s_read");return true;}
  if(used!=sizeof(samples))return false;
  used=0;char pcm[345];mic_pcm_base64(samples,pcm,sizeof(pcm));
  snprintf(frame,size,"\n{\"protocol\":\"momo-easyinput/1\",\"type\":\"mic_audio\",\"stream\":%" PRIu32 ",\"seq\":%" PRIu32 ",\"pcm\":\"%s\"}\n",lease.stream,lease.seq++,pcm);return true;
}
void microphone_transport_failed(void){if(lease.active){stop();fault="usb_backpressure";}}
bool microphone_active(void){return lease.active;}
