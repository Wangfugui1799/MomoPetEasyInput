#pragma once
#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>
#define MIC_SAMPLES 128
#define MIC_LEASE_MS 3000
// All state is owned by the main task. An expired stream cannot be renewed.
typedef struct {uint32_t stream, renewed, seq; bool active;} mic_lease;
bool mic_expire(mic_lease *s,uint32_t now);
bool mic_begin(mic_lease *s,uint32_t stream,uint32_t now);
bool mic_renew(mic_lease *s,uint32_t stream,uint32_t now);
bool mic_end(mic_lease *s,uint32_t stream);
size_t mic_pcm_base64(const int32_t *stereo,char *out,size_t size);
