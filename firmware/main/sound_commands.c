#include "sound_commands.h"
#include "input_sound.h"
#include "cJSON.h"
#include "esp_timer.h"
#include <stdio.h>
#include <string.h>
#include <math.h>
// Commands contain only scalar fields. Reject nesting before the recursive JSON parser
// so a short but deeply nested frame cannot exhaust the embedded main task stack.
static bool flat_json(const char *line){
  bool quoted=false,escape=false;int depth=0;
  for(const char *p=line;*p;p++){
    if(quoted){if(escape)escape=false;else if(*p=='\\')escape=true;else if(*p=='"')quoted=false;continue;}
    if(*p=='"')quoted=true;
    else if(*p=='[')return false;
    else if(*p=='{'&&++depth>1)return false;
    else if(*p=='}')depth--;
  }
  return !quoted&&depth==0;
}
static bool command(const char *line,char *reply,size_t size){
  if(!flat_json(line))return false;
  cJSON *root=cJSON_ParseWithOpts(line,NULL,true);if(!root)return false;
  if(!cJSON_IsObject(root)){cJSON_Delete(root);return false;}
  const cJSON *protocol=cJSON_GetObjectItemCaseSensitive(root,"protocol"),*type=cJSON_GetObjectItemCaseSensitive(root,"type"),*id=cJSON_GetObjectItemCaseSensitive(root,"id");
  if(!cJSON_IsString(protocol)||strcmp(protocol->valuestring,"momo-easyinput/1")||!cJSON_IsString(type)||!cJSON_IsNumber(id)||!isfinite(id->valuedouble)||id->valuedouble<1||id->valuedouble>2147483647||floor(id->valuedouble)!=id->valuedouble){cJSON_Delete(root);return false;}
  bool ok=true;const char *error="none";
  if(!strcmp(type->valuestring,"sound_set")){
    const cJSON *enabled=cJSON_GetObjectItemCaseSensitive(root,"enabled"),*volume=cJSON_GetObjectItemCaseSensitive(root,"volume");
    if(!cJSON_IsBool(enabled)||!cJSON_IsNumber(volume)||!isfinite(volume->valuedouble)||volume->valuedouble<0||volume->valuedouble>100||floor(volume->valuedouble)!=volume->valuedouble){ok=false;error="invalid_settings";}
    else if(!input_sound_save((sound_config){cJSON_IsTrue(enabled),(uint8_t)volume->valueint})){ok=false;error="storage_write";}
  }else if(!strcmp(type->valuestring,"sound_preview")){
    sound_status s=input_sound_status();if(!s.ready){ok=false;error=s.error;}
    else input_sound_trigger(SOUND_KEY,esp_timer_get_time()/1000);
  }else if(strcmp(type->valuestring,"sound_get")){cJSON_Delete(root);return false;}
  sound_status s=input_sound_status();
  snprintf(reply,size,"\n{\"protocol\":\"momo-easyinput/1\",\"type\":\"sound_state\",\"id\":%d,\"ok\":%s,\"enabled\":%s,\"volume\":%u,\"ready\":%s,\"error\":\"%s\",\"audio_error\":\"%s\",\"storage_error\":\"%s\"}\n",id->valueint,ok?"true":"false",s.config.enabled?"true":"false",s.config.volume,s.ready?"true":"false",error,s.error,s.storage_error);
  cJSON_Delete(root);return true;
}
bool sound_command_byte(command_buffer *b,char byte,char *reply,size_t size){
  if(byte=='\n'){
    bool ready=false;if(!b->dropping){b->data[b->used]=0;ready=command(b->data,reply,size);}
    b->used=0;b->dropping=false;return ready;
  }
  if(!b->dropping){if(byte=='\0'||b->used>=sizeof(b->data)-1){b->dropping=true;b->used=0;}else b->data[b->used++]=byte;}
  return false;
}
