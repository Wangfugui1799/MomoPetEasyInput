#include "input_sound.h"
#include "driver/gpio.h"
#include "driver/i2s_std.h"
#include "esp_timer.h"
#include "nvs.h"
#include "nvs_flash.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static portMUX_TYPE lock=portMUX_INITIALIZER_UNLOCKED;
static sound_scheduler scheduler;
static sound_status status={.config={true,30},.error="initializing",.storage_error="none"};
static nvs_handle_t settings;
static bool storage_ready;
static uint32_t millis(void){return esp_timer_get_time()/1000;}
sound_status input_sound_status(void){portENTER_CRITICAL(&lock);sound_status s=status;portEXIT_CRITICAL(&lock);return s;}
static void audio_error(const char *error){portENTER_CRITICAL(&lock);status.ready=false;status.error=error;scheduler.pending=SOUND_NONE;portEXIT_CRITICAL(&lock);}
void input_sound_trigger(sound_kind kind,uint32_t now){
  portENTER_CRITICAL(&lock);
  if(status.ready&&status.config.enabled&&status.config.volume)sound_offer(&scheduler,kind,now);
  portEXIT_CRITICAL(&lock);
}
bool input_sound_save(sound_config config){
  if(config.volume>100)return false;
  sound_status old=input_sound_status();
  if(!storage_ready)return false;
  if(old.storage_error[0]=='n'&&old.config.enabled==config.enabled&&old.config.volume==config.volume)return true;
  esp_err_t err=nvs_set_u32(settings,"config",sound_config_encode(config));
  if(err==ESP_OK)err=nvs_commit(settings);
  portENTER_CRITICAL(&lock);
  if(err==ESP_OK){status.config=config;status.storage_error="none";scheduler.pending=SOUND_NONE;}
  else status.storage_error="storage_write";
  portEXIT_CRITICAL(&lock);return err==ESP_OK;
}
static void playback(void *unused){
  (void)unused;i2s_chan_handle_t tx=NULL;
  i2s_chan_config_t chan=I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_AUTO,I2S_ROLE_MASTER);
  chan.dma_desc_num=2;chan.dma_frame_num=64;chan.auto_clear=true;
  esp_err_t err=i2s_new_channel(&chan,&tx,NULL);
  if(err!=ESP_OK){audio_error("audio_allocate");vTaskDelete(NULL);return;}
  i2s_std_config_t config={
    .clk_cfg=I2S_STD_CLK_DEFAULT_CONFIG(SOUND_RATE),
    .slot_cfg=I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_16BIT,I2S_SLOT_MODE_STEREO),
    .gpio_cfg={.mclk=I2S_GPIO_UNUSED,.bclk=GPIO_NUM_14,.ws=GPIO_NUM_13,.dout=GPIO_NUM_15,.din=I2S_GPIO_UNUSED}
  };
  err=i2s_channel_init_std_mode(tx,&config);
  if(err!=ESP_OK){audio_error("audio_initialize");i2s_del_channel(tx);vTaskDelete(NULL);return;}
  err=i2s_channel_enable(tx);
  if(err!=ESP_OK){audio_error("audio_enable");i2s_del_channel(tx);vTaskDelete(NULL);return;}
  portENTER_CRITICAL(&lock);status.ready=true;status.error="none";portEXIT_CRITICAL(&lock);
  sound_kind active=SOUND_NONE;size_t offset=0;int16_t pcm[128];float gain=0;
  for(;;){
    portENTER_CRITICAL(&lock);
    sound_config current=status.config;sound_kind next=sound_take(&scheduler,millis(),current);
    portEXIT_CRITICAL(&lock);
    if(next!=SOUND_NONE){active=next;offset=0;}
    sound_render(active,100,pcm,64,offset);
    float target=current.enabled?current.volume/100.0f:0.0f;
    for(int i=0;i<64;i++){
      float g=gain+(target-gain)*(i+1)/64.0f;
      pcm[2*i]=(int16_t)(pcm[2*i]*g);pcm[2*i+1]=pcm[2*i];
    }
    gain=target;if(active!=SOUND_NONE){offset+=64;if(offset>=SOUND_SAMPLES)active=SOUND_NONE;}
    size_t written=0;err=i2s_channel_write(tx,pcm,sizeof(pcm),&written,20);
    if(err!=ESP_OK||written!=sizeof(pcm)){audio_error("audio_write");break;}
  }
  i2s_channel_disable(tx);i2s_del_channel(tx);
  // Shared rail remains on: only a board-wide coordinator may switch it off.
  vTaskDelete(NULL);
}
void input_sound_init(void){
  esp_err_t err=nvs_flash_init(); // Never erase NVS to recover an initialization error.
  if(err==ESP_OK)err=nvs_open("input_sound",NVS_READWRITE,&settings);
  if(err==ESP_OK){
    storage_ready=true;uint32_t value;err=nvs_get_u32(settings,"config",&value);
    if(err!=ESP_ERR_NVS_NOT_FOUND&&(err!=ESP_OK||!sound_config_decode(value,&status.config))){status.config=(sound_config){false,30};status.storage_error="storage_invalid";}
  }else{status.config=(sound_config){false,30};status.storage_error="storage_unavailable";}
  // app_main has already latched ALL shared consumers into their safe states.
  if(gpio_set_level(GPIO_NUM_8,1)!=ESP_OK){audio_error("power_enable");return;}
  // Project qualification candidate, NOT a measured board minimum. Validate rail before flashing.
  vTaskDelay(pdMS_TO_TICKS(50));
  if(xTaskCreate(playback,"input_sound",4096,NULL,4,NULL)!=pdPASS)audio_error("audio_task");
}
