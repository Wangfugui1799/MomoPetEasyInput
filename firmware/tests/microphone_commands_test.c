#include "../main/microphone.h"
#include "driver/i2s_std.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>
static bool capturing,fail_start;static i2s_event_callbacks_t callbacks;
esp_err_t i2s_new_channel(const i2s_chan_config_t *c,i2s_chan_handle_t *tx,i2s_chan_handle_t *rx){(void)c;(void)tx;*rx=(void *)1;return 0;}
esp_err_t i2s_channel_init_std_mode(i2s_chan_handle_t h,const i2s_std_config_t *c){(void)h;assert(c->clk_cfg==16000&&c->slot_cfg==64);assert(c->gpio_cfg.bclk==9&&c->gpio_cfg.ws==10&&c->gpio_cfg.din==11);return 0;}
esp_err_t i2s_channel_register_event_callback(i2s_chan_handle_t h,const i2s_event_callbacks_t *c,void *ctx){(void)h;(void)ctx;callbacks=*c;return 0;}
esp_err_t i2s_channel_enable(i2s_chan_handle_t h){(void)h;if(fail_start)return 2;capturing=true;return 0;}
esp_err_t i2s_channel_disable(i2s_chan_handle_t h){(void)h;capturing=false;return 0;}
esp_err_t i2s_del_channel(i2s_chan_handle_t h){(void)h;return 0;}
esp_err_t i2s_channel_read(i2s_chan_handle_t h,void *data,size_t size,size_t *read,uint32_t timeout){(void)h;(void)timeout;assert(capturing);memset(data,0,size);*read=size;return 0;}
static char reply[512];static command_buffer buffer;
static bool feed(const char *s,uint32_t now){bool result=false;for(;*s;s++)if(microphone_command_byte(&buffer,*s,reply,sizeof(reply),now))result=true;return result;}
static void command(const char *type,int stream,uint32_t now){char line[256];snprintf(line,sizeof(line),"{\"protocol\":\"momo-easyinput/1\",\"type\":\"%s\",\"id\":5,\"stream\":%d}\n",type,stream);assert(feed(line,now));}
int main(void){
 assert(!microphone_active()&&!capturing);assert(!feed("{\"a\":[[[[0]]]]}\n",0));assert(!feed("{\"protocol\":\"other\",\"type\":\"mic_start\",\"id\":1,\"stream\":1}\n",0));
 assert(!feed("{\"protocol\":\"momo-easyinput/1\",\"type\":\"mic_start\",\"id\":1,\"stream\":0}\n",0));
 fail_start=true;command("mic_start",10,0);assert(strstr(reply,"i2s_start")&&strstr(reply,"\"stream\":10")&&!capturing);fail_start=false;
 command("mic_start",11,0);assert(capturing&&microphone_active()&&strstr(reply,"\"ok\":true"));
 command("mic_stop",10,1);assert(strstr(reply,"stale_stream")&&capturing);
 command("mic_start",12,2);assert(strstr(reply,"busy")&&capturing);
 assert(microphone_poll(reply,sizeof(reply),8)&&strlen(reply)<512&&strstr(reply,"\"seq\":0"));
 assert(microphone_poll(reply,sizeof(reply),16)&&strstr(reply,"\"seq\":1"));
 command("mic_ping",11,2000);assert(microphone_poll(reply,sizeof(reply),4999)&&capturing);
 assert(microphone_poll(reply,sizeof(reply),5000)&&strstr(reply,"lease_expired")&&!capturing);
 command("mic_ping",11,5001);assert(strstr(reply,"stale_stream")&&!capturing);
 command("mic_start",12,5002);callbacks.on_recv_q_ovf(NULL,NULL,NULL);assert(microphone_poll(reply,sizeof(reply),5003)&&strstr(reply,"overrun")&&!capturing);
 command("mic_start",13,6000);microphone_transport_failed();assert(!capturing);assert(microphone_poll(reply,sizeof(reply),6001)&&strstr(reply,"usb_backpressure"));
 command("mic_start",14,7000);command("mic_stop",14,7001);assert(!capturing&&!microphone_active());
 for(int i=0;i<600;i++)microphone_command_byte(&buffer,'x',reply,sizeof(reply),8000);
 assert(!feed("\n",8000));command("mic_start",15,8001);assert(capturing);command("mic_stop",15,8002);
 const char *wifi="{\"protocol\":\"momo-easyinput/1\",\"type\":\"mic_start\",\"id\":7,\"stream\":42}\n";
 for(const char *p=wifi;*p;p++)microphone_command_byte_from(&buffer,*p,reply,sizeof(reply),9000,MIC_WIFI);
 assert(capturing&&microphone_owner()==MIC_WIFI);
 command("mic_ping",42,9001);assert(strstr(reply,"busy")&&capturing);
 command("mic_stop",42,9002);assert(strstr(reply,"busy")&&capturing);
 microphone_disconnect(MIC_USB);assert(capturing);microphone_disconnect(MIC_WIFI);assert(!capturing);
 command("mic_start",43,9100);assert(capturing&&microphone_owner()==MIC_USB);microphone_disconnect(MIC_USB);assert(!capturing);
 puts("microphone commands: capability framing, stale stream, timeout, overflow, USB failure and stop passed");
 return 0;
}
