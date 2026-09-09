const {sameOrigin}=require('./serial-policy.cjs');
function allowMicrophone(contents,permission,requestingOrigin,ownerId,origin,details={},request=false){
  if(permission!=='media'||contents?.id!==ownerId||!sameOrigin(requestingOrigin,origin)||!sameOrigin(contents.getURL(),origin))return false;
  return request?details.isMainFrame===true&&Array.isArray(details.mediaTypes)&&details.mediaTypes.length>0&&details.mediaTypes.every(t=>t==='audio'):details.mediaType==='audio';
}
module.exports={allowMicrophone};
