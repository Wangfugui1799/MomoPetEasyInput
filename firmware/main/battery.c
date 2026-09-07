#include "battery.h"
#include "driver/gpio.h"
#include "esp_adc/adc_oneshot.h"
#include "esp_adc/adc_cali.h"
#include "esp_adc/adc_cali_scheme.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
int battery_percent(void){
 static adc_oneshot_unit_handle_t unit;
 static adc_cali_handle_t calibration;
 if(!unit){
  adc_oneshot_unit_init_cfg_t init={.unit_id=ADC_UNIT_1};
  if(adc_oneshot_new_unit(&init,&unit)!=ESP_OK)return -1;
  adc_oneshot_chan_cfg_t channel={.atten=ADC_ATTEN_DB_12,.bitwidth=ADC_BITWIDTH_DEFAULT};
  if(adc_oneshot_config_channel(unit,ADC_CHANNEL_3,&channel)!=ESP_OK)return -1;
  adc_cali_curve_fitting_config_t cal={.unit_id=ADC_UNIT_1,.chan=ADC_CHANNEL_3,.atten=ADC_ATTEN_DB_12,.bitwidth=ADC_BITWIDTH_DEFAULT};
  if(adc_cali_create_scheme_curve_fitting(&cal,&calibration)!=ESP_OK)return -1;
  gpio_set_level(GPIO_NUM_5,0);gpio_set_direction(GPIO_NUM_5,GPIO_MODE_OUTPUT);
 }
 if(!calibration)return -1;
 gpio_set_level(GPIO_NUM_5,1);vTaskDelay(pdMS_TO_TICKS(10));
 int total=0,raw,mv;
 for(int i=0;i<16;i++){
  if(adc_oneshot_read(unit,ADC_CHANNEL_3,&raw)!=ESP_OK||adc_cali_raw_to_voltage(calibration,raw,&mv)!=ESP_OK){gpio_set_level(GPIO_NUM_5,0);return -1;}
  total+=mv;
 }
 gpio_set_level(GPIO_NUM_5,0);
 int voltage=total/8;
 if(voltage<2500||voltage>4500)return -1;
 int percent=voltage*100/4200;
 return percent>100?100:percent;
}
