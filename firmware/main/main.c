#include <stdio.h>
#include <string.h>
#include <inttypes.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"
#include "driver/gpio.h"
#include "driver/uart.h"
#include "driver/usb_serial_jtag.h"
#include "esp_timer.h"
#include "input_logic.h"

// EasyInput V2.0 / PCB AI Keyboard V2.1. These are physical board pins.
static const gpio_num_t KEY_PINS[9]={2,47,38,41,1,6,7,48,18};
#define ENCODER_A GPIO_NUM_17
#define ENCODER_B GPIO_NUM_16
#define SHARED_POWER GPIO_NUM_8
#define PROTOCOL "momo-easyinput/1"
typedef struct {int type;int value;} input_event;
static QueueHandle_t events;
static uint32_t dropped_events;
static portMUX_TYPE dropped_lock=portMUX_INITIALIZER_UNLOCKED;
static uint32_t millis(void){return (uint32_t)(esp_timer_get_time()/1000);}
static uint8_t encoder_ab(void){return (gpio_get_level(ENCODER_A)<<1)|gpio_get_level(ENCODER_B);}
static void enqueue(int type,int value){input_event e={type,value};if(xQueueSend(events,&e,0)!=pdTRUE){portENTER_CRITICAL(&dropped_lock);dropped_events++;portEXIT_CRITICAL(&dropped_lock);}}
static void sample_inputs(void *unused){
  (void)unused;momo_button buttons[9];momo_encoder encoder;
  for(int i=0;i<9;i++)momo_button_init(&buttons[i],gpio_get_level(KEY_PINS[i])==0,millis());
  momo_encoder_init(&encoder,encoder_ab());TickType_t wake=xTaskGetTickCount();
  for(;;){uint32_t now=millis();for(int i=0;i<9;i++){int result=momo_button_update(&buttons[i],gpio_get_level(KEY_PINS[i])==0,now);if(i<8&&(result&INPUT_DOWN))enqueue(1,i+1);if(i==8&&(result&INPUT_SHORT))enqueue(3,0);if(i==8&&(result&INPUT_LONG))enqueue(4,0);}int delta=momo_encoder_update(&encoder,encoder_ab());if(delta)enqueue(2,delta);vTaskDelayUntil(&wake,pdMS_TO_TICKS(1));}
}
static void write_line(const char *line){
  size_t len=strlen(line);
  // Each frame starts with a newline so a partially transmitted predecessor cannot splice a valid frame.
  usb_serial_jtag_write_bytes(line,len,pdMS_TO_TICKS(5));
  uart_write_bytes(UART_NUM_0,line,len);
}
void app_main(void){
  // No LED/audio consumer in V0.1. Latch safe states before enabling output directions; rail stays OFF.
  ESP_ERROR_CHECK(gpio_set_level(SHARED_POWER,0));ESP_ERROR_CHECK(gpio_set_direction(SHARED_POWER,GPIO_MODE_OUTPUT));
  const gpio_num_t safe_outputs[]={9,10,12,13,14,15};
  for(unsigned i=0;i<sizeof(safe_outputs)/sizeof(safe_outputs[0]);i++){ESP_ERROR_CHECK(gpio_set_level(safe_outputs[i],0));ESP_ERROR_CHECK(gpio_set_direction(safe_outputs[i],GPIO_MODE_OUTPUT));}
  ESP_ERROR_CHECK(gpio_set_direction(GPIO_NUM_11,GPIO_MODE_DISABLE));ESP_ERROR_CHECK(gpio_set_pull_mode(GPIO_NUM_11,GPIO_FLOATING));
  uint64_t mask=(1ULL<<ENCODER_A)|(1ULL<<ENCODER_B);for(int i=0;i<9;i++)mask|=1ULL<<KEY_PINS[i];
  gpio_config_t config={.pin_bit_mask=mask,.mode=GPIO_MODE_INPUT,.pull_up_en=GPIO_PULLUP_ENABLE,.pull_down_en=GPIO_PULLDOWN_DISABLE,.intr_type=GPIO_INTR_DISABLE};ESP_ERROR_CHECK(gpio_config(&config));
  usb_serial_jtag_driver_config_t usb={.tx_buffer_size=2048,.rx_buffer_size=256};ESP_ERROR_CHECK(usb_serial_jtag_driver_install(&usb));
  uart_config_t uart={.baud_rate=115200,.data_bits=UART_DATA_8_BITS,.parity=UART_PARITY_DISABLE,.stop_bits=UART_STOP_BITS_1,.flow_ctrl=UART_HW_FLOWCTRL_DISABLE,.source_clk=UART_SCLK_DEFAULT};
  ESP_ERROR_CHECK(uart_param_config(UART_NUM_0,&uart));ESP_ERROR_CHECK(uart_set_pin(UART_NUM_0,43,44,UART_PIN_NO_CHANGE,UART_PIN_NO_CHANGE));ESP_ERROR_CHECK(uart_driver_install(UART_NUM_0,256,2048,0,NULL,0));
  events=xQueueCreate(32,sizeof(input_event));configASSERT(events);
  BaseType_t created=xTaskCreate(sample_inputs,"momo_inputs",3072,NULL,5,NULL);configASSERT(created==pdPASS);
  uint32_t last_hello=millis()-2000;char line[256];
  for(;;){
    uint32_t now=millis();if((uint32_t)(now-last_hello)>=2000){last_hello=now;portENTER_CRITICAL(&dropped_lock);uint32_t dropped=dropped_events;portEXIT_CRITICAL(&dropped_lock);snprintf(line,sizeof(line),"\n{\"protocol\":\"%s\",\"type\":\"hello\",\"board\":\"easyinput-v2\",\"firmware\":\"0.1.0\",\"dropped\":%" PRIu32 "}\n",PROTOCOL,dropped);write_line(line);}
    input_event e;if(xQueueReceive(events,&e,pdMS_TO_TICKS(5))==pdTRUE){
      if(e.type==1)snprintf(line,sizeof(line),"\n{\"protocol\":\"%s\",\"type\":\"key\",\"key\":%d}\n",PROTOCOL,e.value);
      else if(e.type==2)snprintf(line,sizeof(line),"\n{\"protocol\":\"%s\",\"type\":\"rotate\",\"delta\":%d}\n",PROTOCOL,e.value);
      else {snprintf(line,sizeof(line),"\n{\"protocol\":\"%s\",\"type\":\"%s\"}\n",PROTOCOL,e.type==3?"press":"long_press");}
      write_line(line);
    }
  }
}
