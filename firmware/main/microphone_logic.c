#include "microphone_logic.h"
bool mic_expire(mic_lease *s,uint32_t now){if(s->active&&(uint32_t)(now-s->renewed)>=MIC_LEASE_MS){s->active=false;return true;}return false;}
bool mic_begin(mic_lease *s,uint32_t stream,uint32_t now){if(!stream||s->active)return false;*s=(mic_lease){.stream=stream,.renewed=now,.active=true};return true;}
bool mic_renew(mic_lease *s,uint32_t stream,uint32_t now){mic_expire(s,now);if(!s->active||s->stream!=stream)return false;s->renewed=now;return true;}
bool mic_end(mic_lease *s,uint32_t stream){if(s->stream!=stream)return false;s->active=false;return true;}
size_t mic_pcm_base64(const int32_t *stereo,char *out,size_t size){
  static const char alphabet[]="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  if(size<345)return 0;
  uint8_t bytes[MIC_SAMPLES*2];
  // Board SELECT is tied high: right slot, 24-bit signed I2S left aligned in 32 bits.
  // Keep the upper 16 bits, without a guessed gain or clipping amplification.
  for(size_t i=0;i<MIC_SAMPLES;i++){uint16_t pcm=(uint32_t)stereo[i*2+1]>>16;bytes[i*2]=pcm&255;bytes[i*2+1]=pcm>>8;}
  size_t n=sizeof(bytes),pos=0;
  for(size_t i=0;i<n;i+=3){uint32_t v=(uint32_t)bytes[i]<<16;if(i+1<n)v|=(uint32_t)bytes[i+1]<<8;if(i+2<n)v|=bytes[i+2];out[pos++]=alphabet[v>>18];out[pos++]=alphabet[(v>>12)&63];out[pos++]=i+1<n?alphabet[(v>>6)&63]:'=';out[pos++]=i+2<n?alphabet[v&63]:'=';}
  out[pos]=0;return pos;
}
