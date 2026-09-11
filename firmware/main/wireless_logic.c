#include "wireless_logic.h"
#include <stdio.h>
#include <string.h>
int wireless_fragment(wireless_fragments *s,const uint8_t *data,size_t size,uint32_t now){
  if(size<4||size>20||data[0]!=1||!data[2]||data[2]>32||data[1]>=data[2]){memset(s,0,sizeof(*s));return -1;}
  if(data[1]==0){memset(s,0,sizeof(*s));s->started=now;s->total=data[2];}
  if(data[1]!=s->next||data[2]!=s->total||(uint32_t)(now-s->started)>3000||s->used+size-3>sizeof(s->data)||(data[1]+1<data[2]&&size!=20)){memset(s,0,sizeof(*s));return -1;}
  memcpy(s->data+s->used,data+3,size-3);s->used+=size-3;s->next++;
  return s->next==s->total?1:0;
}
bool wireless_ipv4(const char *host){
  unsigned a,b,c,d;char tail;
  if(!host||sscanf(host,"%u.%u.%u.%u%c",&a,&b,&c,&d,&tail)!=4||a>255||b>255||c>255||d>255)return false;
  char canonical[16];snprintf(canonical,sizeof(canonical),"%u.%u.%u.%u",a,b,c,d);
  return !strcmp(host,canonical)&&(a==10||(a==172&&b>=16&&b<=31)||(a==192&&b==168)||(a==169&&b==254));
}
bool wireless_hex_key(const char *hex,uint8_t key[32]){
  if(!hex||strlen(hex)!=64)return false;
  for(size_t i=0;i<32;i++){unsigned v=0;for(size_t j=0;j<2;j++){char c=hex[i*2+j];unsigned digit;if(c>='0'&&c<='9')digit=c-'0';else if(c>='a'&&c<='f')digit=c-'a'+10;else return false;v=v*16+digit;}key[i]=(uint8_t)v;}return true;
}
