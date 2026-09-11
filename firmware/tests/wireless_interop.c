// Native test only: the firmware's actual crypto helpers with its SDK Mbed TLS.
#include "../main/wireless_crypto.h"
#include "mbedtls/net_sockets.h"
#include "mbedtls/ssl.h"
#include "mbedtls/entropy.h"
#include "mbedtls/ctr_drbg.h"
#include "mbedtls/base64.h"
#include "cJSON.h"
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
static int write_all(mbedtls_ssl_context *ssl,const char *text){size_t offset=0,size=strlen(text);while(offset<size){int n=mbedtls_ssl_write(ssl,(const unsigned char *)text+offset,size-offset);if(n<=0)return n;offset+=n;}return 0;}
int main(int argc,char **argv){
 uint8_t root[32];memset(root,0x42,sizeof(root));
 if(argc==1){
   uint8_t encrypted[544],nonce[12];char plain[545];memset(nonce,19,12);size_t size=fread(encrypted,1,sizeof(encrypted),stdin);
   if(!wireless_decrypt(root,nonce,encrypted,size,plain,sizeof(plain)))return 2;
   puts(plain);return 0;
 }
 mbedtls_net_context net;mbedtls_ssl_context ssl;mbedtls_ssl_config config;mbedtls_entropy_context entropy;mbedtls_ctr_drbg_context random;
 mbedtls_net_init(&net);mbedtls_ssl_init(&ssl);mbedtls_ssl_config_init(&config);mbedtls_entropy_init(&entropy);mbedtls_ctr_drbg_init(&random);
 int result=1,err;uint8_t key[32];const char *identity="010203040506";
 if(!wireless_derive(root,"momo-wifi-v1",key))goto done;
 if((err=mbedtls_ctr_drbg_seed(&random,mbedtls_entropy_func,&entropy,(const unsigned char *)"momo-test",9)))goto failed;
 if((err=mbedtls_ssl_config_defaults(&config,MBEDTLS_SSL_IS_CLIENT,MBEDTLS_SSL_TRANSPORT_STREAM,MBEDTLS_SSL_PRESET_DEFAULT)))goto failed;
 mbedtls_ssl_conf_rng(&config,mbedtls_ctr_drbg_random,&random);
 // Authentication uses PSK; no X.509 certificate participates in this suite.
 mbedtls_ssl_conf_authmode(&config,MBEDTLS_SSL_VERIFY_NONE);
 mbedtls_ssl_conf_min_tls_version(&config,MBEDTLS_SSL_VERSION_TLS1_2);mbedtls_ssl_conf_max_tls_version(&config,MBEDTLS_SSL_VERSION_TLS1_2);
 static const int suites[]={MBEDTLS_TLS_ECDHE_PSK_WITH_CHACHA20_POLY1305_SHA256,0};mbedtls_ssl_conf_ciphersuites(&config,suites);
 if((err=mbedtls_ssl_conf_psk(&config,key,32,(const unsigned char *)identity,strlen(identity))))goto failed;
 if((err=mbedtls_ssl_setup(&ssl,&config)))goto failed;
 if((err=mbedtls_net_connect(&net,"127.0.0.1",argv[1],MBEDTLS_NET_PROTO_TCP)))goto failed;
 mbedtls_ssl_set_bio(&ssl,&net,mbedtls_net_send,mbedtls_net_recv,NULL);
 if((err=mbedtls_ssl_handshake(&ssl)))goto failed;
 if((err=write_all(&ssl,"{\"protocol\":\"momo-easyinput/1\",\"type\":\"hello\",\"device\":\"010203040506\",\"board\":\"easyinput-v2\",\"firmware\":\"0.6.0\",\"mic\":\"pcm16-wifi-v1\"}\n")))goto failed;
 char input[512];size_t used=0;int stops=0;
 while(stops<3){
   unsigned char byte;err=mbedtls_ssl_read(&ssl,&byte,1);if(err<=0)goto failed;
   if(byte!='\n'){if(used>=sizeof(input)-1)goto done;input[used++]=byte;continue;}
   input[used]=0;used=0;cJSON *request=cJSON_Parse(input);if(!request)goto done;
   cJSON *t=cJSON_GetObjectItem(request,"type"),*id=cJSON_GetObjectItem(request,"id"),*stream=cJSON_GetObjectItem(request,"stream");
   if(cJSON_IsString(t)&&cJSON_IsNumber(id)&&cJSON_IsNumber(stream)){
     bool stop=!strcmp(t->valuestring,"mic_stop"),start=!strcmp(t->valuestring,"mic_start");char reply[512];
     snprintf(reply,sizeof(reply),"{\"protocol\":\"momo-easyinput/1\",\"type\":\"mic_state\",\"id\":%d,\"stream\":%d,\"active\":%s,\"ok\":true,\"rate\":16000,\"error\":\"none\"}\n",id->valueint,stream->valueint,stop?"false":"true");
     err=write_all(&ssl,reply);if(err){cJSON_Delete(request);goto failed;}
     if(start){unsigned char pcm[256]={0},encoded[345];size_t size;mbedtls_base64_encode(encoded,sizeof(encoded),&size,pcm,sizeof(pcm));snprintf(reply,sizeof(reply),"{\"protocol\":\"momo-easyinput/1\",\"type\":\"mic_audio\",\"stream\":%d,\"seq\":0,\"pcm\":\"%s\"}\n",stream->valueint,encoded);err=write_all(&ssl,reply);if(err){cJSON_Delete(request);goto failed;}}
     if(stop)stops++;
   }
   cJSON_Delete(request);
 }
 puts("Mbed TLS: three PCM turns passed");result=0;goto done;
failed:
 fprintf(stderr,"Mbed TLS failure: -0x%04x\n",-err);
done:
 mbedtls_ssl_close_notify(&ssl);mbedtls_net_free(&net);mbedtls_ssl_free(&ssl);mbedtls_ssl_config_free(&config);mbedtls_ctr_drbg_free(&random);mbedtls_entropy_free(&entropy);return result;
}
