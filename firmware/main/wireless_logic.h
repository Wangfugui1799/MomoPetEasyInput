#pragma once
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#define WIRELESS_CONFIG_MAX 544
typedef struct {uint8_t data[WIRELESS_CONFIG_MAX];size_t used;uint8_t next,total;uint32_t started;} wireless_fragments;
// 1 complete, 0 pending, -1 invalid; completion still requires AEAD authentication.
int wireless_fragment(wireless_fragments *s,const uint8_t *data,size_t size,uint32_t now);
bool wireless_ipv4(const char *host);
bool wireless_hex_key(const char *hex,uint8_t key[32]);
