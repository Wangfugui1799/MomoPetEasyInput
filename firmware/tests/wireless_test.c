#include "../main/wireless_logic.h"
#include <assert.h>
#include <string.h>
#include <stdio.h>
int main(void){
 wireless_fragments s={0};uint8_t p[20]={1,0,2};memset(p+3,7,17);
 assert(wireless_fragment(&s,p,20,0)==0);p[1]=1;assert(wireless_fragment(&s,p,10,1)==1&&s.used==24);
 assert(wireless_fragment(&s,p,10,2)==-1);p[1]=0;assert(wireless_fragment(&s,p,20,0)==0);p[1]=1;assert(wireless_fragment(&s,p,10,3001)==-1);
 p[1]=0;assert(wireless_fragment(&s,p,20,UINT32_MAX-100)==0);p[1]=1;assert(wireless_fragment(&s,p,10,100)==1);
 p[1]=0;assert(wireless_fragment(&s,p,5,0)==-1);p[2]=33;assert(wireless_fragment(&s,p,20,0)==-1);
 assert(wireless_ipv4("192.168.1.8")&&wireless_ipv4("172.31.1.1")&&wireless_ipv4("10.0.0.1"));
 assert(!wireless_ipv4("127.0.0.1")&&!wireless_ipv4("8.8.8.8")&&!wireless_ipv4("192.168.1.8evil")&&!wireless_ipv4("192.168.001.8")&&!wireless_ipv4("192.168.1.999"));
 uint8_t key[32];assert(wireless_hex_key("4242424242424242424242424242424242424242424242424242424242424242",key));for(int i=0;i<32;i++)assert(key[i]==0x42);
 assert(!wireless_hex_key("short",key)&&!wireless_hex_key("gg42424242424242424242424242424242424242424242424242424242424242",key));
 puts("wireless: fragmentation, reorder, expiry, wraparound and config bounds passed");
}
