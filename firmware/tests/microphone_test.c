#include "../main/microphone_logic.h"
#include <assert.h>
#include <string.h>
#include <stdio.h>
int main(void){
  mic_lease s={0};assert(!mic_renew(&s,1,0));assert(!mic_begin(&s,0,0));
  assert(mic_begin(&s,123,100));assert(!mic_begin(&s,124,101));
  assert(!mic_renew(&s,124,200));assert(!mic_end(&s,124));assert(s.active);
  assert(mic_renew(&s,123,2000));assert(!mic_expire(&s,4999));assert(mic_expire(&s,5000));assert(!mic_renew(&s,123,5001));
  assert(mic_begin(&s,124,0xfffffff0));assert(!mic_expire(&s,20));assert(mic_expire(&s,4000));
  assert(mic_begin(&s,125,5000));assert(mic_end(&s,125));assert(!s.active);
  int32_t stereo[MIC_SAMPLES*2]={0};char base64[345];assert(!mic_pcm_base64(stereo,base64,344));assert(mic_pcm_base64(stereo,base64,sizeof(base64))==344);assert(strlen(base64)==344);assert(!strcmp(base64+342,"=="));
  // Left slot is ignored; right slot endpoints become little-endian signed PCM16.
  stereo[0]=0x12340000;stereo[1]=0x7fff0000;stereo[3]=(int32_t)0x80000000;stereo[5]=(int32_t)0xffff0000;
  mic_pcm_base64(stereo,base64,sizeof(base64));assert(!strncmp(base64,"/38AgP//",8));
  puts("microphone: lease, wraparound, stale commands and PCM encoding passed");
}
