#include "../main/input_logic.h"
#include <assert.h>
#include <stdio.h>
int main(void){
  momo_button b;momo_button_init(&b,false,0);
  assert(momo_button_update(&b,true,1)==0);
  assert(momo_button_update(&b,false,5)==0);
  assert(momo_button_update(&b,true,8)==0);
  assert(momo_button_update(&b,true,27)==0);
  assert(momo_button_update(&b,true,28)==INPUT_DOWN);
  assert(momo_button_update(&b,true,100)==0);
  assert(momo_button_update(&b,false,120)==0);
  assert(momo_button_update(&b,false,140)==INPUT_SHORT);
  assert(momo_button_update(&b,false,160)==0);
  momo_button_init(&b,false,0);momo_button_update(&b,true,0);assert(momo_button_update(&b,true,20)==INPUT_DOWN);
  assert(momo_button_update(&b,true,619)==0);assert(momo_button_update(&b,true,620)==INPUT_LONG);assert(momo_button_update(&b,true,900)==0);
  momo_button_update(&b,false,1000);assert(momo_button_update(&b,false,1020)==0);
  momo_button_init(&b,true,0);assert(momo_button_update(&b,true,900)==0);momo_button_update(&b,false,1000);assert(momo_button_update(&b,false,1020)==0);
  momo_button_init(&b,false,UINT32_MAX-10);momo_button_update(&b,true,UINT32_MAX-9);assert(momo_button_update(&b,true,12)==INPUT_DOWN);
  momo_encoder e;momo_encoder_init(&e,3);int sum=0;uint8_t cw[]={1,0,2,3};for(unsigned i=0;i<4;i++)sum+=momo_encoder_update(&e,cw[i]);assert(sum==1);
  uint8_t ccw[]={2,0,1,3};sum=0;for(unsigned i=0;i<4;i++)sum+=momo_encoder_update(&e,ccw[i]);assert(sum==-1);
  momo_encoder_init(&e,3);uint8_t bounce[]={1,3,1,3,1,0,2,3};sum=0;for(unsigned i=0;i<8;i++)sum+=momo_encoder_update(&e,bounce[i]);assert(sum==1);
  momo_encoder_init(&e,3);assert(momo_encoder_update(&e,0)==0);assert(e.accumulator==0);
  momo_encoder_init(&e,3);for(unsigned i=0;i<100;i++)assert(momo_encoder_update(&e,3)==0);
  puts("PASS: debounce, single press, long press, boot-held input, clock wrap, quadrature, reverse, bounce, invalid transition, idle");return 0;
}
