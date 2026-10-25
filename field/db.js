let connection;
function open() {
 if (!connection) connection = new Promise((resolve,reject) => {
  const r = indexedDB.open('maia-field-v2',1);
  r.onupgradeneeded = () => { r.result.createObjectStore('docs',{keyPath:'id'}); r.result.createObjectStore('settings'); };
  r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
 });
 return connection;
}
export async function db(store, operation, value, key) {
 const database = await open();
 return new Promise((resolve,reject) => {
  const tx = database.transaction(store, ['get','getAll'].includes(operation) ? 'readonly':'readwrite');
  const s = tx.objectStore(store);
  const r = operation === 'put' ? (key === undefined ? s.put(value) : s.put(value,key)) : operation === 'getAll' ? s.getAll() : s[operation](value);
  let result; r.onsuccess = () => {result = r.result;};
  tx.oncomplete = () => resolve(result); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || Error('Almacenamiento cancelado'));
 });
}
