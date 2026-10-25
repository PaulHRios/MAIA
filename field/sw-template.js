const CACHE = 'maia-field-shell-__BUILD__';
const SHELL = __SHELL__;
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); });
self.addEventListener('activate', e => { e.waitUntil((async()=>{ for(const k of await caches.keys()) if((k.startsWith('maia-field-shell-') && k!==CACHE) || k==='maia-shell-v1') await caches.delete(k); await self.clients.claim(); })()); });
self.addEventListener('message', e => { if(e.data==='ACTIVATE_UPDATE') self.skipWaiting(); });
self.addEventListener('fetch', e => {
 const req=e.request, u=new URL(req.url);
 if(req.method!=='GET' || u.origin!==self.location.origin || !u.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
 e.respondWith((async()=>{
  const cache=await caches.open(CACHE);
  const hit=await cache.match(req,{ignoreSearch:req.mode==='navigate'});
  if(hit) return hit;
  const optional=await (await caches.open('maia-field-runtime-v1')).match(req); if(optional) return optional;
  try { const res=await fetch(req); return res; }
  catch(err) { if(req.mode==='navigate') {const home=await cache.match(new URL('./index.html',self.registration.scope)); if(home)return home;} throw err; }
 })());
});
