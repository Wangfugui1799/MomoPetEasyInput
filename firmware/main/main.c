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
#include "momo_ble.h"
#include "battery.h"
#include "input_sound.h"
#include "sound_commands.h"
#include "microphone.h"
#include "wireless.h"

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
  for(;;){uint32_t now=millis();for(int i=0;i<9;i++){int result=momo_button_update(&buttons[i],gpio_get_level(KEY_PINS[i])==0,now);if(result&INPUT_DOWN)input_sound_trigger(i<8?SOUND_KEY:SOUND_PRESS,now);if(i<8&&(result&INPUT_DOWN))enqueue(1,i+1);if(i==8&&(result&INPUT_SHORT))enqueue(3,0);if(i==8&&(result&INPUT_LONG))enqueue(4,0);}int delta=momo_encoder_update(&encoder,encoder_ab());if(delta){input_sound_trigger(SOUND_ROTATE,now);enqueue(2,delta);}vTaskDelayUntil(&wake,pdMS_TO_TICKS(1));}
}
static void write_line(const char *line){
  size_t len=strlen(line);
  // Each frame starts with a newline so a partially transmitted predecessor cannot splice a valid frame.
  usb_serial_jtag_write_bytes(line,len,pdMS_TO_TICKS(5));
  uart_write_bytes(UART_NUM_0,line,len);
}
void app_main(void){
  // Latch every shared consumer safe before input_sound_init enables the rail.
  ESP_ERROR_CHECK(gpio_set_level(SHARED_POWER,0));ESP_ERROR_CHECK(gpio_set_direction(SHARED_POWER,GPIO_MODE_OUTPUT));
  const gpio_num_t safe_outputs[]={9,10,12,13,14,15};
  for(unsigned i=0;i<sizeof(safe_outputs)/sizeof(safe_outputs[0]);i++){ESP_ERROR_CHECK(gpio_set_level(safe_outputs[i],0));ESP_ERROR_CHECK(gpio_set_direction(safe_outputs[i],GPIO_MODE_OUTPUT));}
  ESP_ERROR_CHECK(gpio_set_direction(GPIO_NUM_11,GPIO_MODE_DISABLE));ESP_ERROR_CHECK(gpio_set_pull_mode(GPIO_NUM_11,GPIO_FLOATING));
  uint64_t mask=(1ULL<<ENCODER_A)|(1ULL<<ENCODER_B);for(int i=0;i<9;i++)mask|=1ULL<<KEY_PINS[i];
  gpio_config_t config={.pin_bit_mask=mask,.mode=GPIO_MODE_INPUT,.pull_up_en=GPIO_PULLUP_ENABLE,.pull_down_en=GPIO_PULLDOWN_DISABLE,.intr_type=GPIO_INTR_DISABLE};ESP_ERROR_CHECK(gpio_config(&config));
  usb_serial_jtag_driver_config_t usb={.tx_buffer_size=2048,.rx_buffer_size=256};ESP_ERROR_CHECK(usb_serial_jtag_driver_install(&usb));
  uart_config_t uart={.baud_rate=115200,.data_bits=UART_DATA_8_BITS,.parity=UART_PARITY_DISABLE,.stop_bits=UART_STOP_BITS_1,.flow_ctrl=UART_HW_FLOWCTRL_DISABLE,.source_clk=UART_SCLK_DEFAULT};
  ESP_ERROR_CHECK(uart_param_config(UART_NUM_0,&uart));ESP_ERROR_CHECK(uart_set_pin(UART_NUM_0,43,44,UART_PIN_NO_CHANGE,UART_PIN_NO_CHANGE));ESP_ERROR_CHECK(uart_driver_install(UART_NUM_0,256,2048,0,NULL,0));
  input_sound_init();
  momo_ble_init();
  wireless_init();
  events=xQueueCreate(32,sizeof(input_event));configASSERT(events);
  BaseType_t created=xTaskCreate(sample_inputs,"momo_inputs",3072,NULL,5,NULL);configASSERT(created==pdPASS);
  uint32_t last_battery=millis()-10000;
  uint32_t last_hello=millis()-2000,mic_connection=0;static char line[512],wifi_line[512];static command_buffer usb_commands={0},uart_commands={0},mic_commands={0},wireless_commands={0},wifi_commands={0};
  for(;;){
    uint32_t now=millis();
    if(microphone_owner()==MIC_WIFI&&mic_connection!=wireless_connection())microphone_disconnect(MIC_WIFI);
    if((uint32_t)(now-last_hello)>=2000){last_hello=now;momo_ble_send(0,0);portENTER_CRITICAL(&dropped_lock);uint32_t dropped=dropped_events;portEXIT_CRITICAL(&dropped_lock);snprintf(line,sizeof(line),"\n{\"protocol\":\"%s\",\"type\":\"hello\",\"board\":\"easyinput-v2\",\"firmware\":\"0.6.0\",\"sound\":true,\"dropped\":%" PRIu32 "}\n",PROTOCOL,dropped);uart_write_bytes(UART_NUM_0,line,strlen(line));
      // Advertise microphone only on the native USB port.
      snprintf(line,sizeof(line),"\n{\"protocol\":\"%s\",\"type\":\"hello\",\"board\":\"easyinput-v2\",\"firmware\":\"0.6.0\",\"sound\":true,\"mic\":\"pcm16-usb-v1\",\"wireless\":true,\"device\":\"%s\",\"dropped\":%" PRIu32 "}\n",PROTOCOL,wireless_device(),dropped);
      usb_serial_jtag_write_bytes(line,strlen(line),pdMS_TO_TICKS(5));
      snprintf(line,sizeof(line),"{\"protocol\":\"%s\",\"type\":\"hello\",\"board\":\"easyinput-v2\",\"firmware\":\"0.6.0\",\"mic\":\"pcm16-wifi-v1\",\"device\":\"%s\"}\n",PROTOCOL,wireless_device());
      wireless_send(line,wireless_connection());}
    if((uint32_t)(millis()-last_battery)>=10000){last_battery=millis();int percent=battery_percent();momo_ble_send(5,percent<0?255:percent);snprintf(line,sizeof(line),"\n{\"protocol\":\"%s\",\"type\":\"battery\",\"percent\":%d}\n",PROTOCOL,percent);write_line(line);}
    char rx[64];int count=usb_serial_jtag_read_bytes(rx,sizeof(rx),0);
    for(int i=0;i<count;i++){
      if(sound_command_byte(&usb_commands,rx[i],line,sizeof(line)))usb_serial_jtag_write_bytes(line,strlen(line),pdMS_TO_TICKS(5));
      if(microphone_command_byte(&mic_commands,rx[i],line,sizeof(line),millis()))usb_serial_jtag_write_bytes(line,strlen(line),pdMS_TO_TICKS(5));
      if(wireless_usb_byte(&wireless_commands,rx[i],line,sizeof(line)))usb_serial_jtag_write_bytes(line,strlen(line),pdMS_TO_TICKS(5));
    }
    uint32_t source_connection;
    for(int n=0;n<4&&wireless_next_command(wifi_line,sizeof(wifi_line),&source_connection);n++){
      memset(&wifi_commands,0,sizeof(wifi_commands));
      for(const char *p=wifi_line;*p;p++)if(microphone_command_byte_from(&wifi_commands,*p,line,sizeof(line),millis(),MIC_WIFI)){
        if(microphone_owner()==MIC_WIFI)mic_connection=source_connection;
        if(!wireless_send(line,source_connection))microphone_disconnect(MIC_WIFI);
      }
    }
    for(int i=0;i<4;i++){
      mic_transport owner=microphone_owner();if(!microphone_poll(line,sizeof(line),millis()))break;
      if(owner==MIC_WIFI){if(!wireless_send(line,mic_connection)){microphone_disconnect(MIC_WIFI);break;}}
      else {size_t len=strlen(line);if(usb_serial_jtag_write_bytes(line,len,pdMS_TO_TICKS(5))!=(int)len){microphone_transport_failed();break;}}
    }
    count=uart_read_bytes(UART_NUM_0,rx,sizeof(rx),0);
    for(int i=0;i<count;i++)if(sound_command_byte(&uart_commands,rx[i],line,sizeof(line)))uart_write_bytes(UART_NUM_0,line,strlen(line));
    input_event e;if(xQueueReceive(events,&e,pdMS_TO_TICKS(microphone_active()?1:5))==pdTRUE){
      if(e.type==1)snprintf(line,sizeof(line),"\n{\"protocol\":\"%s\",\"type\":\"key\",\"key\":%d}\n",PROTOCOL,e.value);
      else if(e.type==2)snprintf(line,sizeof(line),"\n{\"protocol\":\"%s\",\"type\":\"rotate\",\"delta\":%d}\n",PROTOCOL,e.value);
      else {snprintf(line,sizeof(line),"\n{\"protocol\":\"%s\",\"type\":\"%s\"}\n",PROTOCOL,e.type==3?"press":"long_press");}
      write_line(line);
      momo_ble_send(e.type,e.value);
    }
  }
}
