#pragma once
#include <stdbool.h>
#include <stdint.h>
#include <stddef.h>
typedef int esp_err_t;
typedef void *i2s_chan_handle_t;
typedef struct {int unused;} i2s_event_data_t;
typedef struct {int dma_desc_num,dma_frame_num;} i2s_chan_config_t;
typedef struct {int clk_cfg,slot_cfg;struct {int mclk,bclk,ws,dout,din;} gpio_cfg;} i2s_std_config_t;
typedef struct {bool (*on_recv_q_ovf)(i2s_chan_handle_t,i2s_event_data_t *,void *);} i2s_event_callbacks_t;
#define ESP_OK 0
#define ESP_ERR_TIMEOUT 1
#define I2S_NUM_1 1
#define I2S_ROLE_MASTER 1
#define I2S_GPIO_UNUSED -1
#define I2S_DATA_BIT_WIDTH_32BIT 32
#define I2S_SLOT_MODE_STEREO 2
#define I2S_CHANNEL_DEFAULT_CONFIG(a,b) ((i2s_chan_config_t){0})
#define I2S_STD_CLK_DEFAULT_CONFIG(rate) (rate)
#define I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(bits,slots) ((bits)*(slots))
esp_err_t i2s_new_channel(const i2s_chan_config_t *,i2s_chan_handle_t *,i2s_chan_handle_t *);
esp_err_t i2s_channel_init_std_mode(i2s_chan_handle_t,const i2s_std_config_t *);
esp_err_t i2s_channel_register_event_callback(i2s_chan_handle_t,const i2s_event_callbacks_t *,void *);
esp_err_t i2s_channel_enable(i2s_chan_handle_t);
esp_err_t i2s_channel_disable(i2s_chan_handle_t);
esp_err_t i2s_del_channel(i2s_chan_handle_t);
esp_err_t i2s_channel_read(i2s_chan_handle_t,void *,size_t,size_t *,uint32_t);
