#include "wireless_crypto.h"
#include "mbedtls/md.h"
#include "mbedtls/gcm.h"
#include "mbedtls/platform_util.h"
#include <string.h>
bool wireless_derive(const uint8_t key[32],const char *purpose,uint8_t out[32]){
  return mbedtls_md_hmac(mbedtls_md_info_from_type(MBEDTLS_MD_SHA256),key,32,(const uint8_t *)purpose,strlen(purpose),out)==0;
}
bool wireless_decrypt(const uint8_t key[32],const uint8_t nonce[12],const uint8_t *data,size_t size,char *plain,size_t capacity){
  if(size<17||capacity<=size-16)return false;
  static const unsigned char aad[]="momo-provision-v1";uint8_t derived[32];
  if(!wireless_derive(key,"momo-ble-v1",derived))return false;
  mbedtls_gcm_context gcm;mbedtls_gcm_init(&gcm);
  int err=mbedtls_gcm_setkey(&gcm,MBEDTLS_CIPHER_ID_AES,derived,256);
  if(!err)err=mbedtls_gcm_auth_decrypt(&gcm,size-16,nonce,12,aad,sizeof(aad)-1,data+size-16,16,data,(uint8_t *)plain);
  mbedtls_gcm_free(&gcm);mbedtls_platform_zeroize(derived,sizeof(derived));
  if(err){mbedtls_platform_zeroize(plain,capacity);return false;}
  plain[size-16]=0;return memchr(plain,0,size-16)==NULL;
}
