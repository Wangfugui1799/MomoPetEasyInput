#include <assert.h>
#include <stdatomic.h>
#include <string.h>
#include "nimble/nimble_port.h"
#include "nimble/nimble_port_freertos.h"
#include "host/ble_hs.h"
#include "services/gap/ble_svc_gap.h"
#include "services/gatt/ble_svc_gatt.h"
#include "momo_ble.h"
// UUID bytes are little endian, matching the browser's canonical UUID strings.
static const ble_uuid128_t service=BLE_UUID128_INIT(0x01,0,0,0,0,0,0,0,0,0,0,0,0,0,0x4d,0x4d);
static const ble_uuid128_t event_uuid=BLE_UUID128_INIT(0x02,0,0,0,0,0,0,0,0,0,0,0,0,0,0x4d,0x4d);
static uint16_t value_handle;
static atomic_uint connection=BLE_HS_CONN_HANDLE_NONE;
static atomic_bool subscribed;
static uint8_t address_type;
static int access_event(uint16_t c,uint16_t a,struct ble_gatt_access_ctxt *ctx,void *arg){
 (void)c;(void)a;(void)arg;const uint8_t hello[]={1,0,0};
 return os_mbuf_append(ctx->om,hello,sizeof hello)==0?0:BLE_ATT_ERR_INSUFFICIENT_RES;
}
static const struct ble_gatt_svc_def services[]={
 {.type=BLE_GATT_SVC_TYPE_PRIMARY,.uuid=&service.u,.characteristics=(struct ble_gatt_chr_def[]){
 {.uuid=&event_uuid.u,.access_cb=access_event,.flags=BLE_GATT_CHR_F_READ|BLE_GATT_CHR_F_NOTIFY,.val_handle=&value_handle},{0}}},{0}};
static void advertise(void);
static int gap(struct ble_gap_event *e,void *arg){
 (void)arg;
 switch(e->type){
 case BLE_GAP_EVENT_CONNECT:if(e->connect.status==0)atomic_store(&connection,e->connect.conn_handle);else advertise();break;
 case BLE_GAP_EVENT_DISCONNECT:atomic_store(&subscribed,false);atomic_store(&connection,BLE_HS_CONN_HANDLE_NONE);advertise();break;
 case BLE_GAP_EVENT_SUBSCRIBE:if(e->subscribe.attr_handle==value_handle)atomic_store(&subscribed,e->subscribe.cur_notify);break;
 case BLE_GAP_EVENT_ADV_COMPLETE:advertise();break;
 }return 0;
}
static void advertise(void){
 struct ble_hs_adv_fields fields={0};fields.flags=BLE_HS_ADV_F_DISC_GEN|BLE_HS_ADV_F_BREDR_UNSUP;
 fields.uuids128=(ble_uuid128_t*)&service;fields.num_uuids128=1;fields.uuids128_is_complete=1;
 if(ble_gap_adv_set_fields(&fields))return;
 struct ble_hs_adv_fields scan={0};scan.name=(uint8_t*)ble_svc_gap_device_name();scan.name_len=strlen((char*)scan.name);scan.name_is_complete=1;
 if(ble_gap_adv_rsp_set_fields(&scan))return;
 struct ble_gap_adv_params params={0};params.conn_mode=BLE_GAP_CONN_MODE_UND;params.disc_mode=BLE_GAP_DISC_MODE_GEN;
 ble_gap_adv_start(address_type,NULL,BLE_HS_FOREVER,&params,gap,NULL);
}
static void sync_host(void){if(ble_hs_id_infer_auto(0,&address_type)==0)advertise();}
static void reset_host(int reason){(void)reason;atomic_store(&subscribed,false);atomic_store(&connection,BLE_HS_CONN_HANDLE_NONE);}
static void host_task(void *arg){(void)arg;nimble_port_run();nimble_port_freertos_deinit();}
void momo_ble_init(void){
 if(nimble_port_init()!=ESP_OK)return;
 ble_svc_gap_init();ble_svc_gatt_init();ble_svc_gap_device_name_set("Momo EasyInput");
 assert(ble_gatts_count_cfg(services)==0);assert(ble_gatts_add_svcs(services)==0);
 ble_hs_cfg.sync_cb=sync_host;ble_hs_cfg.reset_cb=reset_host;nimble_port_freertos_init(host_task);
}
void momo_ble_send(int type,int value){
 unsigned conn=atomic_load(&connection);if(conn==BLE_HS_CONN_HANDLE_NONE||!atomic_load(&subscribed))return;
 uint8_t data[]={1,(uint8_t)type,(uint8_t)value};struct os_mbuf *om=ble_hs_mbuf_from_flat(data,sizeof data);
 if(om)ble_gatts_notify_custom(conn,value_handle,om);
}
