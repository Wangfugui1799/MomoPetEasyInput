#pragma once
#include <stddef.h>
#include <stdbool.h>
typedef struct {char data[513];size_t used;bool dropping;} command_buffer;
// Returns true when an entire JSON command has produced a reply.
bool sound_command_byte(command_buffer *buffer,char byte,char *reply,size_t size);
