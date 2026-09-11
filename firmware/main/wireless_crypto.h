#pragma once
#include <stdbool.h>
#include <stdint.h>
#include <stddef.h>
bool wireless_derive(const uint8_t key[32],const char *purpose,uint8_t out[32]);
bool wireless_decrypt(const uint8_t key[32],const uint8_t nonce[12],const uint8_t *data,size_t size,char *plain,size_t capacity);
