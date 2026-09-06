#include "../main/sound_commands.h"
#include "../main/input_sound.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>
static sound_status status={.config={true,30},.ready=true,.error="none",.storage_error="none"};
static bool save_ok=true;static int saves,previews;
int64_t esp_timer_get_time(void){return 0;}
sound_status input_sound_status(void){return status;}
bool input_sound_save(sound_config c){saves++;if(save_ok)status.config=c;return save_ok;}
void input_sound_trigger(sound_kind kind,uint32_t now){(void)now;assert(kind==SOUND_KEY);previews++;}
static command_buffer buffer;static char reply[512];
static bool send(const char *line){bool result=false;while(*line)result|=sound_command_byte(&buffer,*line++,reply,sizeof(reply));return result;}
int main(void){
  assert(!send("{\"protocol\":\"momo-easyinput/1\","));
  assert(send("\"type\":\"sound_get\",\"id\":1}\n"));assert(strstr(reply,"\"volume\":30"));
  assert(!send("{\"protocol\":\"other\",\"type\":\"sound_set\",\"id\":1,\"enabled\":true,\"volume\":30}\n"));assert(saves==0);
  assert(send("{\"protocol\":\"momo-easyinput/1\",\"type\":\"sound_set\",\"id\":2,\"enabled\":true,\"volume\":1000}\n"));assert(strstr(reply,"invalid_settings"));assert(saves==0);
  assert(send("{\"protocol\":\"momo-easyinput/1\",\"type\":\"sound_set\",\"id\":2,\"enabled\":false,\"volume\":42}\n"));assert(strstr(reply,"\"enabled\":false"));assert(saves==1);
  save_ok=false;assert(send("{\"protocol\":\"momo-easyinput/1\",\"type\":\"sound_set\",\"id\":3,\"enabled\":true,\"volume\":50}\n"));assert(strstr(reply,"\"ok\":false"));assert(strstr(reply,"\"volume\":42"));
  assert(send("{\"protocol\":\"momo-easyinput/1\",\"type\":\"sound_preview\",\"id\":4}\n"));assert(previews==1);
  status.ready=false;status.error="audio_write";assert(send("{\"protocol\":\"momo-easyinput/1\",\"type\":\"sound_preview\",\"id\":5}\n"));assert(previews==1);assert(strstr(reply,"audio_write"));
  for(int i=0;i<600;i++)sound_command_byte(&buffer,'x',reply,sizeof(reply));assert(!send("\n"));
  assert(send("{\"protocol\":\"momo-easyinput/1\",\"type\":\"sound_get\",\"id\":6}\n"));
  assert(!send("{\"protocol\":\"momo-easyinput/1\",\"type\":\"sound_get\",\"id\":7}garbage\n"));
  assert(!send("{\"nested\":{\"nested\":{}}}\n"));
  puts("PASS: device command fragmentation, range checks, storage failure, preview failure, overlong recovery, trailing garbage");
}
