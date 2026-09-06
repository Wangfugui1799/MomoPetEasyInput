#pragma once
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#define SOUND_RATE 16000
#define SOUND_SAMPLES 320
#define SOUND_GAP_MS 25
// Larger values win within a pending window. At most one sound is pending.
typedef enum { SOUND_NONE, SOUND_ROTATE, SOUND_KEY, SOUND_PRESS } sound_kind;
typedef struct { bool enabled; uint8_t volume; } sound_config;
typedef struct { sound_kind pending; uint32_t at,last_start; bool started; } sound_scheduler;
bool sound_config_decode(uint32_t value, sound_config *out);
uint32_t sound_config_encode(sound_config config);
void sound_offer(sound_scheduler *s,sound_kind kind,uint32_t now);
sound_kind sound_take(sound_scheduler *s,uint32_t now,sound_config config);
void sound_render(sound_kind kind,uint8_t volume,int16_t *stereo,size_t frames,size_t offset);
