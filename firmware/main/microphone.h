#pragma once
#include "sound_commands.h"
#include <stdint.h>
// Only native USB feeds this command parser. UART and BLE do not transport PCM.
bool microphone_command_byte(command_buffer *b,char byte,char *reply,size_t size,uint32_t now);
bool microphone_poll(char *frame,size_t size,uint32_t now);
void microphone_transport_failed(void);
bool microphone_active(void);
