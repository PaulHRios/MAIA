import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
const root=resolve('dist');
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.wasm':'application/wasm','.png':'image/png','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{try{let path=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/MAIA\//,'/');if(path.endsWith('/'))path+='index.html';const file=resolve(root,'.'+path);if(!file.startsWith(root+'/'))throw Error('path');res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.statusCode=404;res.end('not found');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/MAIA/`;
await mkdir('test-results',{recursive:true});const reports=[];
try{
 for(const [name,engine] of Object.entries({chromium,webkit})){
  const browser=await engine.launch({headless:true});const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:1});let page=await context.newPage();const errors=[],consoleErrors=[];
  const observe=p=>{p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});};observe(page);
  let stage='initial application load';
  try{
   await page.goto(url);
   // Status messages are intentionally transient: service-worker activation may replace them.
   await page.locator('#guide-list details').first().waitFor({state:'attached'});
   await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
   console.log(name+': application and service worker ready');
   stage='bundled model catalog';
   const catalog=await page.evaluate(()=>new Promise((resolve,reject)=>{const w=new Worker('./assets/runtime-worker.js',{type:'module'});const t=setTimeout(()=>{w.terminate();reject(Error('catalog timeout'));},45000);w.onmessage=({data})=>{if(data.type==='done'){clearTimeout(t);w.terminate();resolve(data.data);}if(data.type==='error'){clearTimeout(t);w.terminate();reject(Error(data.data));}};w.onerror=e=>{clearTimeout(t);w.terminate();reject(Error(e.message));};w.postMessage({id:1,cmd:'catalog'});}));assert.ok(catalog.some(r=>r.id==='Qwen3-4B-q4f16_1-MLC'));
   stage='profile and document persistence';
   await page.locator('[data-page="setup"]').click();await page.locator('#profile-tacoma').fill('TEST vehicle profile');await page.locator('#save-profile').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Perfiles y notas guardados'));
   await page.locator('[data-page="library"]').click();await page.locator('#documents').setInputFiles({name:'test-manual.txt',mimeType:'text/plain',buffer:Buffer.from('Prueba de biblioteca. Alternador conector de diagnóstico. Documento de prueba, no usar para reparar. <script>window.pwned=true</script>')});await page.locator('#document-list').getByText('test-manual.txt',{exact:true}).waitFor();
   await page.locator('#library-search').fill('alternador');await page.locator('#search-results summary').waitFor();assert.equal(await page.evaluate(()=>window.pwned),undefined);
   stage='fixed safety routing';
   await page.locator('[data-page="chat"]').click();await page.locator('#question').fill('¿Puedo comer este hongo?');await page.locator('#send').click();await page.waitForFunction(()=>document.querySelector('#messages').textContent.includes('1-800-222-1222'));
   await page.waitForFunction(()=>!document.querySelector('#send').disabled);
   stage='cache completeness';
   await page.locator('[data-page="setup"]').click();await page.locator('#audit').click();await page.waitForFunction(()=>document.querySelector('#readiness').textContent.includes('0 faltantes'));
   stage='new page without network';
   await context.setOffline(true);await page.close();page=await context.newPage();observe(page);await page.goto(url);
   await page.locator('#guide-list details').first().waitFor({state:'attached'});
   await page.locator('#emergency').click();await page.locator('#guide-urgent[open]').waitFor();assert.ok((await page.locator('#guides').textContent()).includes('911'));
   await page.locator('[data-page="library"]').click();await page.locator('#document-list').getByText('test-manual.txt',{exact:true}).waitFor();await page.locator('#library-search').fill('alternador');await page.locator('#search-results summary').waitFor();
   await page.locator('[data-page="setup"]').click();assert.equal(await page.locator('#profile-tacoma').inputValue(),'TEST vehicle profile');
   await page.locator('[data-page="chat"]').click();await page.screenshot({path:`test-results/${name}-mobile-offline.png`,fullPage:true});
   assert.equal(errors.length,0,'Uncaught page errors: '+errors.join('; '));
   reports.push({browser:name,passed:true,tests:['bundled model catalog','vehicle profile persistence','document import','local search','untrusted text handling','fungus safety route without inference','shell cache completeness','new page opened offline','guides offline','document persistence offline'],notTested:['real iPhone','WebGPU inference','vision accuracy','microphone','speech quality','field reliability']});
   console.log(name+': offline shell, library, safety routing and persistence PASS');
  }catch(e){
   const diagnostics={browser:name,passed:false,stage,error:e.message,pageErrors:errors,consoleErrors,status:await page.locator('#status').textContent().catch(()=>null),body:await page.locator('body').innerText().catch(()=>null)};
   reports.push(diagnostics);console.error('BROWSER FAILURE '+JSON.stringify(diagnostics));await page.screenshot({path:`test-results/${name}-failure.png`,fullPage:true}).catch(()=>{});throw e;
  }finally{await writeFile('test-results/report.json',JSON.stringify(reports,null,2));await browser.close();}
 }
}finally{server.close();}
