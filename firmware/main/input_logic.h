#pragma once
#include <stdbool.h>
#include <stdint.h>
enum { INPUT_NONE=0, INPUT_DOWN=1, INPUT_SHORT=2, INPUT_LONG=4 };
typedef struct { bool stable,candidate,armed,long_sent;uint32_t changed_at,pressed_at; } momo_button;
void momo_button_init(momo_button *b,bool pressed,uint32_t now);
int momo_button_update(momo_button *b,bool pressed,uint32_t now);
typedef struct {uint8_t previous;int accumulator;} momo_encoder;
void momo_encoder_init(momo_encoder *e,uint8_t ab);
int momo_encoder_update(momo_encoder *e,uint8_t ab);
