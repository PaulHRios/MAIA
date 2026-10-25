let connection;
function open() {
 if (!connection) connection = new Promise((resolve,reject) => {
  const request = indexedDB.open('maia-field-v2',1);
  request.onupgradeneeded = () => { request.result.createObjectStore('docs',{keyPath:'id'}); request.result.createObjectStore('settings'); };
  request.onsuccess = () => {
   const database=request.result;
   database.onversionchange=()=>{database.close();connection=null;};
   resolve(database);
  };
  request.onerror = () => {connection=null;reject(request.error || Error('No se pudo abrir la base local'));};
  request.onblocked = () => {connection=null;reject(Error('Cierra las otras pestañas de MAIA y vuelve a abrirla.'));};
 });
 return connection;
}
function restoreDocument(record) {
 if (!record || !(record.blob instanceof ArrayBuffer)) return record;
 return {...record,blob:new Blob([record.blob],{type:record.blobType || 'application/octet-stream'})};
}
export async function db(store, operation, value, key) {
 // Store owned bytes, not browser-managed File handles. WebKit may reject the
 // latter after the file input's backing resource has been revoked.
 if (store === 'docs' && operation === 'put' && value?.blob instanceof Blob) {
  const file=value.blob;
  value={...value,blob:await file.arrayBuffer(),blobType:file.type || 'application/octet-stream'};
 }
 const database = await open();
 return new Promise((resolve,reject) => {
  const tx=database.transaction(store,['get','getAll'].includes(operation)?'readonly':'readwrite');
  const s=tx.objectStore(store);
  let request;
  try {request=operation==='put'?(key===undefined?s.put(value):s.put(value,key)):operation==='getAll'?s.getAll():s[operation](value);}
  catch(e){reject(e);return;}
  let result,requestError;
  request.onsuccess=()=>{result=request.result;};
  request.onerror=()=>{requestError=request.error;};
  tx.oncomplete=()=>{
   if(store==='docs'&&operation==='getAll') result=result.map(restoreDocument);
   else if(store==='docs'&&operation==='get') result=restoreDocument(result);
   resolve(result);
  };
  const fail=()=>reject(requestError || tx.error || Error('El navegador no pudo guardar el archivo. Comprueba espacio y evita navegación privada.'));
  tx.onerror=fail;tx.onabort=fail;
 });
}
