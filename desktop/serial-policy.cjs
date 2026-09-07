function sameOrigin(actual,expected){try{return new URL(actual).origin===new URL(expected).origin}catch{return false}}
function allowSerial(contents,permission,requestingOrigin,ownerId,origin){return ['serial','bluetooth'].includes(permission)&&contents?.id===ownerId&&sameOrigin(requestingOrigin,origin)}
module.exports={sameOrigin,allowSerial};
