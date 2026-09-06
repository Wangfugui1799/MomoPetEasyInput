#pragma once
#include "input_sound_logic.h"
typedef struct { sound_config config; bool ready; const char *error; const char *storage_error; } sound_status;
void input_sound_init(void);
void input_sound_trigger(sound_kind kind,uint32_t now);
sound_status input_sound_status(void);
bool input_sound_save(sound_config config);
