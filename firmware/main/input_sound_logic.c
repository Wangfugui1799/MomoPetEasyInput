#include "input_sound_logic.h"
#include <math.h>
bool sound_config_decode(uint32_t value,sound_config *out){
  if((value&0xfffffe00u)!=0x4d530000u || (value&255)>100)return false;
  *out=(sound_config){.enabled=(value&256)!=0,.volume=value&255};return true;
}
uint32_t sound_config_encode(sound_config c){return 0x4d530000u|(c.enabled?256:0)|c.volume;}
void sound_offer(sound_scheduler *s,sound_kind kind,uint32_t now){
  if(kind<SOUND_ROTATE||kind>SOUND_PRESS)return;
  if(s->pending==SOUND_NONE||(uint32_t)(now-s->at)>SOUND_GAP_MS||kind>=s->pending){s->pending=kind;s->at=now;}
}
sound_kind sound_take(sound_scheduler *s,uint32_t now,sound_config c){
  if(!c.enabled||!c.volume||(uint32_t)(now-s->at)>SOUND_GAP_MS){s->pending=SOUND_NONE;return SOUND_NONE;}
  if(s->started&&(uint32_t)(now-s->last_start)<SOUND_GAP_MS)return SOUND_NONE;
  sound_kind k=s->pending;s->pending=SOUND_NONE;
  if(k!=SOUND_NONE){s->started=true;s->last_start=now;}return k;
}
void sound_render(sound_kind kind,uint8_t volume,int16_t *stereo,size_t frames,size_t offset){
  float frequency=kind==SOUND_ROTATE?1800.0f:kind==SOUND_PRESS?1100.0f:750.0f;
  float gain=6000.0f*(volume>100?100:volume)/100.0f*(kind==SOUND_ROTATE?0.5f:1.0f);
  for(size_t i=0;i<frames;i++){
    size_t n=offset+i;int16_t sample=0;
    if(kind!=SOUND_NONE&&n<SOUND_SAMPLES){
      // Smooth, zero-ended envelope; duplicated L/R works for any amp channel selection.
      float envelope=sinf(3.14159265358979323846f*n/(SOUND_SAMPLES-1));
      sample=(int16_t)(gain*envelope*envelope*sinf(6.28318530717958647692f*frequency*n/SOUND_RATE));
    }
    stereo[2*i]=stereo[2*i+1]=sample;
  }
}
