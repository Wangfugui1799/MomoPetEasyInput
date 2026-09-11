#pragma once
#include "sound_commands.h"
#include <stdint.h>
typedef enum {MIC_NONE=0,MIC_USB=1,MIC_WIFI=2} mic_transport;
// All microphone state remains owned by the main task.
bool microphone_command_byte(command_buffer *b,char byte,char *reply,size_t size,uint32_t now);
bool microphone_command_byte_from(command_buffer *b,char byte,char *reply,size_t size,uint32_t now,mic_transport source);
mic_transport microphone_owner(void);
void microphone_disconnect(mic_transport source);
bool microphone_poll(char *frame,size_t size,uint32_t now);
void microphone_transport_failed(void);
bool microphone_active(void);
