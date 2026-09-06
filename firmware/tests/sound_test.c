#include "../main/input_sound_logic.h"
#include "../main/input_logic.h"
#include <assert.h>
#include <stdio.h>
int main(void){
  sound_config c={true,30},out; assert(sound_config_decode(sound_config_encode(c),&out));
  assert(out.enabled&&out.volume==30);assert(!sound_config_decode(0,&out));
  assert(!sound_config_decode(0x4d5301ff,&out));assert(!sound_config_decode(0x4d530264,&out));
  sound_scheduler s={0};sound_offer(&s,SOUND_ROTATE,0);sound_offer(&s,SOUND_KEY,0);
  sound_offer(&s,SOUND_ROTATE,1);assert(sound_take(&s,1,c)==SOUND_KEY);
  for(int t=2;t<26;t++){sound_offer(&s,SOUND_ROTATE,t);assert(sound_take(&s,t,c)==SOUND_NONE);}
  assert(sound_take(&s,26,c)==SOUND_ROTATE);assert(sound_take(&s,80,c)==SOUND_NONE);
  sound_offer(&s,SOUND_KEY,90);assert(sound_take(&s,116,c)==SOUND_NONE); // stale, never backfill
  sound_offer(&s,SOUND_PRESS,120);assert(sound_take(&s,120,(sound_config){false,30})==SOUND_NONE);
  assert(sound_take(&s,150,c)==SOUND_NONE); // enabling cannot replay muted input
  sound_offer(&s,SOUND_KEY,151);assert(sound_take(&s,151,(sound_config){true,0})==SOUND_NONE);
  s=(sound_scheduler){0};sound_offer(&s,SOUND_KEY,UINT32_MAX-9);assert(sound_take(&s,UINT32_MAX-9,c)==SOUND_KEY);
  sound_offer(&s,SOUND_PRESS,14);assert(sound_take(&s,14,c)==SOUND_NONE);assert(sound_take(&s,15,c)==SOUND_PRESS);
  momo_button b;momo_button_init(&b,false,0);int sounds=0;
  for(uint32_t t=0;t<1000;t++){int e=momo_button_update(&b,t>=10&&t<800,t);if(e&INPUT_DOWN)sounds++;}
  assert(sounds==1); // long press and release must not produce more sound
  int16_t pcm[SOUND_SAMPLES*2];
  for(int k=SOUND_ROTATE;k<=SOUND_PRESS;k++){
    sound_render(k,100,pcm,SOUND_SAMPLES,0);bool nonzero=false;
    for(int i=0;i<SOUND_SAMPLES;i++){assert(pcm[i*2]==pcm[i*2+1]);assert(pcm[i*2]<=6000&&pcm[i*2]>=-6000);nonzero|=pcm[i*2]!=0;}
    assert(nonzero);assert(pcm[0]==0&&pcm[SOUND_SAMPLES*2-1]==0);
    sound_render(k,0,pcm,SOUND_SAMPLES,0);for(int i=0;i<SOUND_SAMPLES*2;i++)assert(pcm[i]==0);
  }
  sound_render(SOUND_KEY,100,pcm,10,SOUND_SAMPLES);for(int i=0;i<20;i++)assert(pcm[i]==0);
  puts("PASS: sound priority, coalescing, stale expiry, mute, rollover, long press, persistence validation, PCM bounds/envelope");
}
