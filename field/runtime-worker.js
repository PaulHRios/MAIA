// Exactly one model family is resident at a time. No inference server or API keys.
let chat, currentChat, vision, processor, recognizer, tf, busy = false;
const VISION = 'HuggingFaceTB/SmolVLM-500M-Instruct';
const SPEECH = 'onnx-community/whisper-tiny';
const send = (id, type, data) => self.postMessage({id,type,data});
async function free() {
 if (chat) await chat.unload();
 if (vision) await vision.dispose();
 if (recognizer) await recognizer.dispose();
 chat = currentChat = vision = processor = recognizer = null;
}
async function transformers() {
 if (!tf) {
  tf = await import('@huggingface/transformers');
  tf.env.allowLocalModels = false;
  tf.env.useBrowserCache = true;
  tf.env.backends.onnx.wasm.numThreads = 1;
  tf.env.backends.onnx.wasm.wasmPaths = new URL('../vendor/ort/', import.meta.url).href;
 }
 return tf;
}
function progress(id) { return p => send(id,'progress',p.text || `${p.file || p.status || 'Preparando'}${typeof p.progress === 'number' ? ' · ' + Math.round(p.progress) + '%' : ''}`); }
async function loadChat(id, modelId) {
 if (chat && currentChat === modelId) return;
 await free();
 const m = await import('@mlc-ai/web-llm');
 if (!m.prebuiltAppConfig.model_list.some(r => r.model_id === modelId)) throw Error('Modelo no incluido en esta versión del motor. Elige otra opción.');
 chat = await m.CreateMLCEngine(modelId, {initProgressCallback:progress(id)}, {context_window_size:4096});
 currentChat = modelId;
}
async function loadVision(id) {
 if (vision) return;
 await free();
 const m = await transformers();
 const adapter = await navigator.gpu?.requestAdapter();
 if (!adapter) throw Error('Visión requiere WebGPU. Las guías y la biblioteca siguen disponibles.');
 processor = await m.AutoProcessor.from_pretrained(VISION, {progress_callback:progress(id)});
 vision = await m.AutoModelForVision2Seq.from_pretrained(VISION, {
  device:'webgpu', dtype:{embed_tokens:adapter.features.has('shader-f16') ? 'fp16' : 'fp32',vision_encoder:'q4',decoder_model_merged:'q4'}, progress_callback:progress(id)
 });
}
async function loadVoice(id) {
 if (recognizer) return;
 await free();
 const m = await transformers();
 recognizer = await m.pipeline('automatic-speech-recognition', SPEECH, {device:'wasm',dtype:'q8',progress_callback:progress(id)});
}
self.onmessage = async ({data:{id,cmd,payload = {}}}) => {
 if (busy) { send(id,'error','El motor está ocupado. Cancela la operación anterior.'); return; }
 busy = true;
 try {
  let result;
  if (cmd === 'catalog') { const m = await import('@mlc-ai/web-llm'); result = m.prebuiltAppConfig.model_list.filter(r => /^Qwen3-(1\.7B|4B|8B)-q4f(16|32)_1-MLC$/.test(r.model_id)).map(r => ({id:r.model_id,ram:r.vram_required_MB})); }
  else if (cmd === 'load-chat') { await loadChat(id,payload.model); result = {model:currentChat}; }
  else if (cmd === 'chat') {
   await loadChat(id,payload.model);
   const stream = await chat.chat.completions.create({messages:payload.messages,temperature:0.25,top_p:0.9,max_tokens:800,stream:true});
   let text = ''; for await (const chunk of stream) { const delta = chunk.choices[0]?.delta?.content || ''; text += delta; send(id,'text',text); }
   result = text;
  }
  else if (cmd === 'load-vision') { await loadVision(id); result = {model:VISION}; }
  else if (cmd === 'vision') {
   await loadVision(id);
   const image = await tf.RawImage.fromURL(payload.image);
   const prompt = 'Describe only visible shapes, colors, textures and parts. State missing visual details. Do not identify species, edibility, medical conditions, or safety. Do not guess hidden details.';
   const text = processor.apply_chat_template([{role:'user',content:[{type:'image'},{type:'text',text:prompt}]}], {add_generation_prompt:true});
   const inputs = await processor(text,[image]);
   const output = await vision.generate({...inputs,max_new_tokens:150,do_sample:false});
   const generated = output.slice(null,[inputs.input_ids.dims.at(-1),null]);
   result = processor.batch_decode(generated,{skip_special_tokens:true})[0];
   // Release tensors retained by an inference; model weights stay until next task.
   for (const v of Object.values(inputs)) if (v && typeof v.dispose === 'function') v.dispose();
   if (typeof output.dispose === 'function') output.dispose();
  }
  else if (cmd === 'load-voice') { await loadVoice(id); result = {model:SPEECH}; }
  else if (cmd === 'transcribe') { await loadVoice(id); const out = await recognizer(payload.audio,{language:payload.language || 'spanish',task:'transcribe'}); result = out.text; }
  else if (cmd === 'release') { await free(); result = true; }
  else throw Error('Operación desconocida');
  send(id,'done',result);
 } catch (e) { send(id,'error',e?.message || String(e)); }
 finally { busy = false; }
};
