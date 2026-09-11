#pragma once
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include "sound_commands.h"
void wireless_init(void);
const char *wireless_device(void);
void wireless_status(uint8_t status[20]);
bool wireless_provision_write(const uint8_t *data,size_t length);
void wireless_provision_reset(void);
bool wireless_usb_byte(command_buffer *buffer,char byte,char *reply,size_t size);
uint32_t wireless_connection(void);
bool wireless_next_command(char *line,size_t size,uint32_t *connection);
bool wireless_send(const char *line,uint32_t connection);
