import {VERSION,chunks,retrieve,riskRoute,makeMessages,cleanAnswer} from './core.js';
import {GUIDES,REVIEWED,guideMatches} from './guides.js';
import {db} from './db.js';
const $=id=>document.getElementById(id);
let worker,serial=0,pending=new Map(),busy=false,photo=null,docs=[],history=[],registration,recorder,recordCancel=false;
let settings={model:'Qwen3-4B-q4f16_1-MLC',tacoma:'',lexus:'',memory:'',checks:{}};
const urls=[];
function status(text){$('status').textContent=text;}
function error(e){status('No completado: '+(e?.message||e));}
function go(page){document.querySelectorAll('.page').forEach(p=>p.hidden=p.id!==page);document.querySelectorAll('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===page));window.scrollTo(0,0);}
function setBusy(value){busy=value;document.querySelectorAll('[data-ai]').forEach(b=>b.disabled=value&&b.id!=='mic');$('mic').disabled=value&&!recorder;$('cancel').hidden=!value;}
async function work(fn){if(busy)return;setBusy(true);let lock;try{try{lock=await navigator.wakeLock?.request('screen');}catch{}await fn();}catch(e){error(e);}finally{try{await lock?.release();}catch{}setBusy(false);}}
function makeWorker(){
 if(worker)return;
 worker=new Worker(new URL('./runtime-worker.js',import.meta.url),{type:'module'});
 worker.onmessage=({data:{id,type,data}})=>{const p=pending.get(id);if(!p)return;if(type==='progress')status(data);else if(type==='text')p.onText?.(data);else{clearTimeout(p.timer);pending.delete(id);type==='done'?p.resolve(data):p.reject(Error(data));}};
 worker.onerror=e=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error(e.message||'El motor se cerró. Prueba un modelo más pequeño.'));}pending.clear();worker?.terminate();worker=null;};
}
function rpc(cmd,payload={},onText){makeWorker();const id=++serial;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{cancel();},20*60*1000);pending.set(id,{resolve,reject,onText,timer});worker.postMessage({id,cmd,payload});});}
function cancel(){recordCancel=true;if(recorder?.state==='recording')recorder.stop();worker?.terminate();worker=null;for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Operación cancelada. Las descargas completas se conservan.'));}pending.clear();status('Cancelado.');}
function node(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
function bubble(role,text='',label){const box=node('article',undefined,'message '+role);box.append(node('div',label||(role==='user'?'TÚ':'MAIA · RESULTADO NO VERIFICADO'),'label'));const content=node('div',text,'content');box.append(content);$('messages').append(box);return {box,content};}
function evidenceView(parent,items){if(!items.length)return;const d=node('details'),s=node('summary','Fragmentos recuperados · comprobar en el original');d.append(s);items.forEach((p,i)=>{d.append(node('strong',`[D${i+1}] ${p.title} · página ${p.page||'sin número'}`),node('p',p.text));});d.append(node('small','La coincidencia por palabras no valida una reparación ni la interpretación de la IA.'));parent.append(d);}
async function save(){await db('settings','put',settings,'profile');await db('settings','put',history.slice(-100),'history');}
function updateMode(){const mode=$('mode').value;$('vehicle-wrap').hidden=mode!=='mecanica';const note={general:'Conversación local con contexto limitado. Guarda datos importantes en Preparar → Notas.',naturaleza:'Exploración, no identificación fiable. Nunca uses una respuesta o foto para decidir qué comer.',mecanica:'Solo se consultan documentos del vehículo seleccionado. No hay manuales de fábrica incluidos.',medicina:'Modo conservador: muestra fichas con fuentes, no diagnósticos ni tratamientos generados.'};$('mode-note').textContent=note[mode];}
function renderGuides(){const root=$('guide-list');root.replaceChildren();for(const g of GUIDES){const card=node('details');card.id='guide-'+g.id;card.append(node('summary',g.title),node('p',g.text));const a=node('a',g.source+' · consultar fuente con conexión');a.href=g.url;a.target='_blank';a.rel='noopener noreferrer';card.append(a,node('p','Síntesis editorial · fuentes consultadas '+REVIEWED+' · no revisada clínicamente.','fine'));root.append(card);}}
function showFixed(question,route){const selected=route==='fungi'?[GUIDES.find(g=>g.id==='fungi')]:guideMatches(question);const gs=selected.length?selected:[GUIDES[0]];const text=gs.map(g=>g.title+'\n\n'+g.text+'\n\nFuente: '+g.source+'\n'+g.url).join('\n\n');bubble('assistant',text,'FICHA LOCAL · NO GENERADA AL CONSULTAR');return text;}
async function prepareRuntime(){
 const res=await fetch(new URL('../runtime-assets.json',import.meta.url));if(!res.ok)throw Error('Falta el manifiesto de módulos. Actualiza la aplicación con conexión.');const list=await res.json();const cache=await caches.open('maia-field-runtime-v1');
 for(let i=0;i<list.length;i++){const url=new URL(list[i],new URL('../',import.meta.url)).href;if(await cache.match(url))continue;if(!navigator.onLine)throw Error('Faltan componentes de voz/visión. Prepáralos con Wi-Fi antes de salir.');status(`Preparando motor local ${i+1}/${list.length}`);const r=await fetch(url);if(!r.ok)throw Error('No se pudo descargar '+list[i]);await cache.put(url,r);}
}
async function sendQuestion(){
 const question=$('question').value.trim();if(!question&&!photo)return;
 const mode=$('mode').value,vehicle=$('vehicle').value,q=question||'Describe los rasgos visibles sin identificar especies ni seguridad.';
 const original=photo;
 bubble('user',q);$('question').value='';
 const route=riskRoute(q,mode);
 if(route){const answer=showFixed(q,route);history.push({role:'user',content:q},{role:'assistant',content:answer});await save();status('Ficha local. Para emergencias, solicita ayuda real.');return;}
 const scope=mode==='mecanica'?vehicle:mode==='naturaleza'?'naturaleza':'all';
 const hits=retrieve(q,docs,scope,3);
 if(mode==='mecanica'&&(!settings[vehicle]||!docs.some(d=>d.scope===vehicle&&d.parts?.length)||!hits.length)){
  const text='No tengo evidencia suficiente para un procedimiento específico de este vehículo. Completa año, modelo, motor y transmisión en Preparar; importa el manual correcto en Biblioteca, asignado a '+vehicle+'. Puedes buscar un término exacto del manual. No voy a inventar valores de torque, fusibles, presiones o conexiones.';
  bubble('assistant',text,'MECÁNICA · FALTA DOCUMENTACIÓN');history.push({role:'user',content:q},{role:'assistant',content:text});await save();return;
 }
 let visual='';
 if(original){await prepareRuntime();status('Observando foto localmente…');visual=await rpc('vision',{image:original});if(!visual?.trim())throw Error('El modelo no produjo una descripción.');bubble('assistant',visual,'OBSERVACIÓN VISUAL EXPERIMENTAL · PUEDE SER INCORRECTA');if(!navigator.onLine){settings.checks.vision=new Date().toISOString();await save();}removePhoto();}
 const result=bubble('assistant');evidenceView(result.box,hits);
 try{
  const messages=makeMessages({question:q,history,evidence:hits,mode,memory:settings.memory,vehicle:mode==='mecanica'?settings[vehicle]:'',visual});
  status('Cargando conversación. Al cambiar de módulo se libera el anterior.');
  const out=await rpc('chat',{model:settings.model,messages},t=>{result.content.textContent=cleanAnswer(t)||'Procesando respuesta…';});
  const clean=cleanAnswer(out);if(!clean)throw Error('No hubo respuesta final dentro del límite. Prueba una pregunta más concreta.');
  result.content.textContent=clean;history.push({role:'user',content:q+(visual?'\nObservación visual no verificada: '+visual:'')},{role:'assistant',content:clean});await save();
  status('Respuesta local terminada. Comprueba los hechos y las fuentes.');
  if(!navigator.onLine){settings.checks.chat={at:new Date().toISOString(),model:settings.model};await save();}
 }catch(e){result.content.textContent='No se completó la respuesta. '+e.message;throw e;}
 finally{renderReadiness();}
}
function removePhoto(){photo=null;$('preview').hidden=true;$('preview-image').removeAttribute('src');$('photo').value='';}
async function imageData(file){if(file.size>25*1024*1024)throw Error('Foto demasiado grande (máximo 25 MB).');const url=URL.createObjectURL(file);try{const image=new Image();image.src=url;await image.decode();const scale=Math.min(1,672/Math.max(image.naturalWidth,image.naturalHeight));const c=document.createElement('canvas');c.width=Math.max(1,Math.round(image.naturalWidth*scale));c.height=Math.max(1,Math.round(image.naturalHeight*scale));c.getContext('2d').drawImage(image,0,0,c.width,c.height);return c.toDataURL('image/jpeg',0.85);}finally{URL.revokeObjectURL(url);}}
async function importFile(file){
 if(file.size>40*1024*1024)throw Error('Máximo 40 MB por documento.');
 if(/\.json$/i.test(file.name)){
  const data=JSON.parse(await file.text());if(data.format!=='maia-field-backup-v1'||!Array.isArray(data.documents))throw Error('Este JSON no es un respaldo MAIA.');
  for(const d of data.documents){if(typeof d.title!=='string'||!Array.isArray(d.parts)||!['tacoma','lexus','naturaleza','general'].includes(d.scope))throw Error('Respaldo no válido.');if(d.parts.some(p=>typeof p.text!=='string'))throw Error('Fragmento no válido.');await db('docs','put',{id:crypto.randomUUID(),title:d.title,scope:d.scope,parts:d.parts,imported:new Date().toISOString()});}
  status('Textos del respaldo restaurados. No se sobrescribieron tus notas ni conversación actuales.');return;
 }
 let parts=[],blob;
 if(/\.pdf$/i.test(file.name)){
  const pdfjs=await import('pdfjs-dist');pdfjs.GlobalWorkerOptions.workerSrc=new URL('../vendor/pdf.worker.min.mjs',import.meta.url).href;
  const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,disableFontFace:true,useSystemFonts:true});
  try{const pdf=await task.promise;if(pdf.numPages>600)throw Error('Divide el PDF en archivos de hasta 600 páginas.');for(let page=1;page<=pdf.numPages;page++){status(`Extrayendo texto: ${file.name} · ${page}/${pdf.numPages}`);const p=await pdf.getPage(page);const text=(await p.getTextContent()).items.map(x=>x.str||'').join(' ');parts.push(...chunks(text).map(text=>({page,text})));p.cleanup();if(page%15===0)await new Promise(r=>setTimeout(r,0));}blob=file;}finally{await task.destroy();}
 }else if(/\.(txt|md)$/i.test(file.name)){parts=chunks(await file.text()).map(text=>({page:1,text}));blob=file;}else throw Error('Usa PDF, TXT, MD o un respaldo JSON de MAIA.');
 await db('docs','put',{id:crypto.randomUUID(),title:file.name,scope:$('doc-scope').value,parts,blob,imported:new Date().toISOString()});
 status(parts.length?'Documento guardado e indexado localmente.':'Original guardado, pero no contiene texto extraíble. No hay OCR de escaneos.');
}
async function loadDocs(){docs=await db('docs','getAll');renderDocs();}
function renderDocs(){
 for(const u of urls)URL.revokeObjectURL(u);urls.length=0;const root=$('document-list');root.replaceChildren();if(!docs.length)root.append(node('p','Todavía no hay documentos importados.','muted'));
 for(const d of docs){const card=node('article',undefined,'card');card.append(node('strong',d.title),node('p',`${d.scope} · ${(d.parts||[]).length} fragmentos · ${d.imported?.slice(0,10)||''}`,'fine'));if(d.blob){const u=URL.createObjectURL(d.blob);urls.push(u);const a=node('a','Abrir original local','button');a.href=u;a.target='_blank';a.rel='noopener';card.append(a);}const b=node('button','Eliminar');b.onclick=async()=>{if(confirm('¿Eliminar este documento de MAIA?')){try{await db('docs','delete',d.id);await loadDocs();}catch(e){error(e);}}};card.append(b);root.append(card);}
}
function searchLibrary(){const root=$('search-results');root.replaceChildren();const q=$('library-search').value.trim();if(!q)return;const found=retrieve(q,docs,$('doc-scope').value,5);if(!found.length)root.append(node('p','Sin coincidencias en la categoría seleccionada.'));else evidenceView(root,found);}
async function exportBackup(){const data={format:'maia-field-backup-v1',version:VERSION,created:new Date().toISOString(),settings,history,documents:docs.map(({blob,...d})=>d)};const u=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=node('a');a.href=u;a.download='maia-respaldo-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),60000);status('Respaldo exportado. Los PDF originales no están incluidos.');}
async function audit(){const r=await fetch(new URL('../asset-manifest.json',import.meta.url));if(!r.ok)throw Error('No se pudo leer el manifiesto offline.');const list=await r.json();let missing=0;for(const p of list)if(!await caches.match(new URL(p,new URL('../',import.meta.url)).href))missing++;const size=await navigator.storage?.estimate();settings.checks.shell={at:new Date().toISOString(),missing};await save();renderReadiness();status(`${missing?'Faltan '+missing+' archivos base.':'Archivos base presentes.'} Uso del sitio: ${size?.usage?(size.usage/1024**3).toFixed(2)+' GB':'no disponible'}; cuota: ${size?.quota?(size.quota/1024**3).toFixed(2)+' GB':'no disponible'}. No demuestra que los modelos estén completos.`);}
function renderReadiness(){const c=settings.checks||{};const val=x=>x?new Date(typeof x==='string'?x:x.at).toLocaleString():'pendiente';$('readiness').textContent=`Archivos base: ${c.shell?c.shell.missing+' faltantes ('+val(c.shell)+')':'pendiente'}\nChat sin red: ${val(c.chat)}${c.chat?.model?'\n  Modelo probado: '+c.chat.model:''}\nFoto sin red: ${val(c.vision)}\nDictado sin red: ${val(c.voice)}\nLectura sin red: ${val(c.tts)}\nSon registros de ejecución, NO una garantía de exactitud.`;}
async function verify(){if(navigator.onLine)throw Error('Activa modo avión y desactiva Wi-Fi. Cierra MAIA, abre su icono y repite esta prueba.');await audit();status('Prueba real de inferencia sin red…');const out=await rpc('chat',{model:settings.model,messages:[{role:'user',content:'Responde únicamente: LISTO. /no_think'}]});if(!cleanAnswer(out))throw Error('No hubo respuesta válida.');settings.checks.chat={at:new Date().toISOString(),model:settings.model};await save();renderReadiness();status('El modelo respondió con el navegador sin red. Falta probar foto y dictado, y no se ha validado su exactitud.');}
function speak(text){
 if(!('speechSynthesis'in window))throw Error('Lectura de voz no disponible.');
 const voices=speechSynthesis.getVoices().filter(v=>v.localService&&/^es/i.test(v.lang));
 if(!voices.length)throw Error('iOS no expone una voz local en español. No se usará una voz remota. Prueba de nuevo tras instalar una voz del sistema.');
 speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(text.slice(0,2400));utterance.voice=voices[0];utterance.lang=voices[0].lang;utterance.rate=0.95;
 utterance.onend=async()=>{if(!navigator.onLine){settings.checks.tts=new Date().toISOString();await save();renderReadiness();}status('Lectura terminada.');};utterance.onerror=()=>error(Error('iOS no pudo reproducir la voz local.'));speechSynthesis.speak(utterance);
}
async function captureAudio(){
 if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw Error('Este navegador no admite grabación.');
 const Audio=window.AudioContext||window.webkitAudioContext;const ctx=new Audio();await ctx.resume();let stream;
 try{stream=await navigator.mediaDevices.getUserMedia({audio:true});recordCancel=false;const type=['audio/mp4','audio/webm;codecs=opus','audio/webm'].find(t=>MediaRecorder.isTypeSupported(t));recorder=new MediaRecorder(stream,type?{mimeType:type}:{});
 const result=await new Promise((resolve,reject)=>{const pieces=[];const timer=setTimeout(()=>{if(recorder?.state==='recording')recorder.stop();},20000);recorder.ondataavailable=e=>{if(e.data.size)pieces.push(e.data);};recorder.onerror=e=>{clearTimeout(timer);reject(Error(e.error?.message||'Error al grabar'));};recorder.onstop=()=>{clearTimeout(timer);resolve(new Blob(pieces,{type:recorder.mimeType}));};recorder.start();$('mic').disabled=false;$('mic').textContent='Terminar dictado';status('Grabando localmente. Toca Terminar dictado.');});
 if(recordCancel)throw Error('Dictado cancelado.');const decoded=await ctx.decodeAudioData(await result.arrayBuffer());const offline=new OfflineAudioContext(1,Math.max(1,Math.ceil(decoded.duration*16000)),16000);const source=offline.createBufferSource();source.buffer=decoded;source.connect(offline.destination);source.start();const audio=(await offline.startRendering()).getChannelData(0);let power=0;for(const x of audio)power+=x*x;if(Math.sqrt(power/audio.length)<0.003)throw Error('La grabación es demasiado silenciosa. No se enviará silencio al transcriptor.');return audio;
 }finally{stream?.getTracks().forEach(t=>t.stop());recorder=null;$('mic').textContent='Dictar';await ctx.close();}
}
async function dictation(){const audio=await captureAudio();await prepareRuntime();status('Transcribiendo localmente…');const text=await rpc('transcribe',{audio});if(!text?.trim())throw Error('No se reconoció voz.');$('question').value=($('question').value+' '+text.trim()).trim().slice(0,1800);status('Revisa las palabras y números antes de enviar.');if(!navigator.onLine){settings.checks.voice=new Date().toISOString();await save();renderReadiness();}}
async function init(){
 try{settings={...settings,...(await db('settings','get','profile')||{})};settings.checks||={};history=await db('settings','get','history')||[];await loadDocs();}catch(e){error(Error('No se pudo abrir almacenamiento local. Evita navegación privada. '+e.message));}
 for(const m of history.slice(-20))bubble(m.role,m.content);$('model').value=settings.model;$('profile-tacoma').value=settings.tacoma;$('profile-lexus').value=settings.lexus;$('memory').value=settings.memory;
 renderGuides();renderReadiness();updateMode();
 const network=()=>{$('network').textContent=navigator.onLine?'Red disponible':'Sin red detectada';};network();addEventListener('online',network);addEventListener('offline',network);
 if(matchMedia('(display-mode: standalone)').matches||navigator.standalone)$('install').hidden=true;
 try{const adapter=await navigator.gpu?.requestAdapter();$('device').textContent=adapter?'WebGPU detectado · FP16: '+(adapter.features.has('shader-f16')?'sí':'no')+'. La RAM utilizable no se conoce; hay que probar cada modelo.':'WebGPU no disponible: no cargará conversación/visión. Guías, biblioteca y dictado WASM pueden seguir disponibles.';}catch(e){$('device').textContent='No se pudo iniciar WebGPU: '+e.message;}
 if('serviceWorker'in navigator){try{registration=await navigator.serviceWorker.register('./sw.js');const show=()=>{$('update').hidden=false;};if(registration.waiting)show();registration.addEventListener('updatefound',()=>{const sw=registration.installing;sw?.addEventListener('statechange',()=>{if(sw.state==='installed'&&navigator.serviceWorker.controller)show();});});navigator.serviceWorker.addEventListener('controllerchange',()=>{status('Archivos base instalados. Revisa Preparar antes de salir.');});}catch(e){error(Error('No se pudo instalar el paquete offline: '+e.message));}}
 status('Biblioteca local lista. Prepara los modelos antes de salir.');
}
document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>go(b.dataset.page));$('emergency').onclick=()=>{go('guides');$('guide-urgent').open=true;};$('mode').onchange=updateMode;
$('composer').onsubmit=e=>{e.preventDefault();work(sendQuestion);};$('cancel').onclick=cancel;
$('photo-button').onclick=()=>{if(!busy)$('photo').click();};$('remove-photo').onclick=removePhoto;
$('photo').onchange=async()=>{try{const file=$('photo').files[0];if(!file)return;photo=await imageData(file);$('preview-image').src=photo;$('preview').hidden=false;}catch(e){error(e);}};
$('mic').onclick=()=>{if(recorder?.state==='recording')recorder.stop();else work(dictation);};
$('speak').onclick=()=>{try{const last=history.filter(m=>m.role==='assistant').at(-1);if(!last)throw Error('Todavía no hay respuesta para leer.');speak(last.content);}catch(e){error(e);}};
$('test-speech').onclick=()=>{try{speak('Prueba local de MAIA. Comprueba también esta voz con el teléfono en modo avión.');}catch(e){error(e);}};
$('new-chat').onclick=async()=>{if(busy)return;if(history.length&&!confirm('¿Vaciar la conversación? Tus documentos y notas se conservan.'))return;history=[];$('messages').replaceChildren();removePhoto();try{await save();status('Nueva conversación.');}catch(e){error(e);}};
$('model').onchange=async()=>{settings.model=$('model').value;try{await save();}catch(e){error(e);}};
$('load-chat').onclick=()=>work(async()=>{await rpc('load-chat',{model:settings.model});status('Modelo de conversación cargado. Aún falta probarlo tras cerrar la app y sin red.');});
$('load-vision').onclick=()=>work(async()=>{await prepareRuntime();await rpc('load-vision');status('Visión cargada. Prueba una foto sin red; no se certifica identificación.');});
$('load-voice').onclick=()=>work(async()=>{await prepareRuntime();await rpc('load-voice');status('Dictado cargado. Prueba una grabación corta sin red.');});
$('release').onclick=()=>work(async()=>{await rpc('release');status('Modelos liberados de RAM; descargas conservadas.');});
$('verify').onclick=()=>work(verify);$('audit').onclick=()=>work(audit);
$('persist').onclick=()=>work(async()=>{const ok=await navigator.storage?.persist?.();status(ok?'El navegador concedió persistencia. Conserva también un respaldo.':'El navegador no concedió persistencia. No se puede garantizar retención de los datos.');});
$('save-profile').onclick=async()=>{settings.tacoma=$('profile-tacoma').value.trim().slice(0,180);settings.lexus=$('profile-lexus').value.trim().slice(0,180);settings.memory=$('memory').value.slice(0,350);try{await save();status('Perfiles y notas guardados solo en este dispositivo.');}catch(e){error(e);}};
$('documents').onchange=()=>work(async()=>{try{for(const f of $('documents').files)await importFile(f);await loadDocs();}finally{$('documents').value='';}});
$('library-search').oninput=searchLibrary;$('doc-scope').onchange=searchLibrary;$('export').onclick=()=>work(exportBackup);
$('apply-update').onclick=()=>{if(busy){status('Cancela la tarea actual antes de actualizar.');return;}if(registration?.waiting){navigator.serviceWorker.addEventListener('controllerchange',()=>location.reload(),{once:true});registration.waiting.postMessage('ACTIVATE_UPDATE');}else location.reload();};
$('locate').onclick=()=>{if(!navigator.geolocation){error(Error('Geolocalización no disponible'));return;}status('Solicitando ubicación al dispositivo…');navigator.geolocation.getCurrentPosition(async p=>{const text=`Latitud: ${p.coords.latitude.toFixed(6)}\nLongitud: ${p.coords.longitude.toFixed(6)}\nPrecisión estimada: ±${Math.round(p.coords.accuracy)} m\nHora: ${new Date(p.timestamp).toLocaleString()}\nNo es una ruta ni garantiza una posición precisa.`;$('coordinates').textContent=text;status('Ubicación mostrada. No se ha enviado a nadie.');},e=>error(Error('No se obtuvo ubicación: '+e.message)),{enableHighAccuracy:true,timeout:15000,maximumAge:0});};
init().catch(error);
