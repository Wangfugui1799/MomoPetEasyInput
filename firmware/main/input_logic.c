#include "input_logic.h"
void momo_button_init(momo_button *b,bool pressed,uint32_t now){*b=(momo_button){.stable=pressed,.candidate=pressed,.armed=!pressed,.changed_at=now,.pressed_at=now};}
int momo_button_update(momo_button *b,bool pressed,uint32_t now){
  int result=INPUT_NONE;
  if(pressed!=b->candidate){b->candidate=pressed;b->changed_at=now;}
  if(b->candidate!=b->stable && (uint32_t)(now-b->changed_at)>=20){
    b->stable=b->candidate;
    if(b->stable){b->pressed_at=now;b->long_sent=false;if(b->armed)result=INPUT_DOWN;}
    else{if(b->armed&&!b->long_sent)result=INPUT_SHORT;b->armed=true;}
  }
  if(b->stable&&b->armed&&!b->long_sent&&(uint32_t)(now-b->pressed_at)>=600){b->long_sent=true;result|=INPUT_LONG;}
  return result;
}
void momo_encoder_init(momo_encoder *e,uint8_t ab){*e=(momo_encoder){.previous=ab&3,.accumulator=0};}
int momo_encoder_update(momo_encoder *e,uint8_t ab){
  static const int8_t transitions[16]={0,-1,1,0,1,0,0,-1,-1,0,0,1,0,1,-1,0};
  ab&=3;
  if((e->previous^ab)==3){e->accumulator=0;e->previous=ab;return 0;}
  e->accumulator+=transitions[e->previous*4+ab];e->previous=ab;
  if(e->accumulator>=4){e->accumulator=0;return 1;}
  if(e->accumulator<=-4){e->accumulator=0;return -1;}
  return 0;
}
