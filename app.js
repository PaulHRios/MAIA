// Maia — chat IA offline en el navegador con WebLLM + WebGPU.
// El modelo se descarga una sola vez y se cachea en el dispositivo.

import * as webllm from "https://esm.run/@mlc-ai/web-llm@0.2.79";

// Modelos curados. IDs corresponden a los publicados por mlc-ai en HuggingFace
// y soportados por WebLLM. Se ordenan de menor a mayor uso de memoria.
const RECOMMENDED_MODEL = "Qwen2.5-3B-Instruct-q4f16_1-MLC";
const MODELS = [
  {
    id: "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    label: "Llama 3.2 1B (rápido, ~880 MB)",
    sizeMb: 880,
    note: "El más liviano. Funciona en cualquier iPhone con iOS 18+.",
  },
  {
    id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
    label: "Qwen 2.5 1.5B (~950 MB)",
    sizeMb: 950,
    note: "Bueno en español, equilibrado.",
  },
  {
    id: "gemma-2-2b-it-q4f16_1-MLC",
    label: "Gemma 2 2B (~1.4 GB)",
    sizeMb: 1400,
    note: "Más capaz, sigue siendo razonable para iPhone.",
  },
  {
    id: "Llama-3.2-3B-Instruct-q4f16_1-MLC",
    label: "Llama 3.2 3B (~2.0 GB)",
    sizeMb: 2000,
    note: "Mucha calidad. iPhone 14 Pro o superior.",
  },
  {
    id: "Phi-3.5-mini-instruct-q4f16_1-MLC",
    label: "Phi 3.5 mini (~2.2 GB)",
    sizeMb: 2200,
    note: "Fuerte en código y razonamiento técnico.",
  },
  {
    id: "Qwen2.5-3B-Instruct-q4f16_1-MLC",
    label: "★ Qwen 2.5 3B (recomendado, ~2.0 GB)",
    sizeMb: 2000,
    note: "Lo más potente que corre estable en iPhone. Excelente en español.",
  },
  {
    id: "Hermes-3-Llama-3.2-3B-q4f16_1-MLC",
    label: "Hermes 3 Llama 3.2 3B (~2.0 GB)",
    sizeMb: 2000,
    note: "Fine-tune comunitario, respuestas más directas.",
  },
  {
    id: "Qwen2.5-7B-Instruct-q4f16_1-MLC",
    label: "Qwen 2.5 7B (potente, ~4.5 GB)",
    sizeMb: 4500,
    note: "El más capaz disponible. iPhone 15 Pro/16 con buena RAM, o escritorio. Puede fallar en móviles con <8 GB.",
  },
  {
    id: "Llama-3.1-8B-Instruct-q4f16_1-MLC",
    label: "Llama 3.1 8B (potente, ~5 GB)",
    sizeMb: 5000,
    note: "Solo escritorio o iPad Pro / iPhone 16 Pro Max. Probablemente no cargue en iPhones más antiguos.",
  },
  {
    id: "Phi-3.5-vision-instruct-q4f16_1-MLC",
    label: "👁 Phi 3.5 Vision (imágenes, ~5.6 GB)",
    sizeMb: 5600,
    vision: true,
    note: "Único modelo que entiende imágenes (plantas, hongos, texto). Pesado: probablemente solo cargue en iPad Pro o escritorio. iPhone Safari suele quedarse sin memoria con este tamaño.",
  },
];

const VISION_MODELS = new Set(MODELS.filter((m) => m.vision).map((m) => m.id));

const DEFAULT_SYSTEM = `Eres Maia, una asistente de IA que vive dentro del dispositivo del usuario y funciona sin internet.
Sé clara, directa y útil. Responde en el idioma del usuario.
Si no sabes algo, dilo. Si una pregunta es ambigua, pide aclaración breve.
Estructura respuestas largas con listas o pasos cuando ayude.`;

const STORAGE = {
  history: "maia.history",
  system: "maia.system",
  model: "maia.model",
  temp: "maia.temp",
  topP: "maia.topP",
  maxTokens: "maia.maxTokens",
};

// ---------------- Estado ----------------
const state = {
  engine: null,
  modelId: null,
  loading: false,
  generating: false,
  abort: null,
  history: [],
};

// ---------------- DOM ----------------
const $ = (id) => document.getElementById(id);
const els = {
  menuBtn: $("menuBtn"),
  newChatBtn: $("newChatBtn"),
  sidebar: $("sidebar"),
  backdrop: $("sidebarBackdrop"),
  modelSelect: $("modelSelect"),
  modelSize: $("modelSize"),
  modelLabel: $("modelLabel"),
  loadModelBtn: $("loadModelBtn"),
  loadProgress: $("loadProgress"),
  loadBar: $("loadBar"),
  loadText: $("loadText"),
  systemPrompt: $("systemPrompt"),
  temperature: $("temperature"),
  tempVal: $("tempVal"),
  topP: $("topP"),
  topPVal: $("topPVal"),
  maxTokens: $("maxTokens"),
  maxTokVal: $("maxTokVal"),
  clearChatBtn: $("clearChatBtn"),
  clearCacheBtn: $("clearCacheBtn"),
  storageInfo: $("storageInfo"),
  welcome: $("welcome"),
  messages: $("messages"),
  chat: $("chat"),
  composer: $("composer"),
  input: $("input"),
  sendBtn: $("sendBtn"),
  stopBtn: $("stopBtn"),
  unsupported: $("unsupported"),
  continueAnywayBtn: $("continueAnywayBtn"),
  imageInput: $("imageInput"),
  attachBtn: $("attachBtn"),
  attachPreview: $("attachPreview"),
  attachThumb: $("attachThumb"),
  attachRemove: $("attachRemove"),
};

// Imagen pendiente de envío (data URL JPEG redimensionada).
let pendingImage = null;

// ---------------- Init ----------------
function init() {
  populateModels();
  loadSettings();
  loadHistory();
  bindUI();
  checkWebGPU();
  updateStorageInfo();
  registerSW();
}

function populateModels() {
  els.modelSelect.innerHTML = "";
  for (const m of MODELS) {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.label;
    els.modelSelect.appendChild(opt);
  }
  els.modelSelect.addEventListener("change", () => {
    localStorage.setItem(STORAGE.model, els.modelSelect.value);
    updateModelSize();
  });
}

function updateModelSize() {
  const m = MODELS.find((x) => x.id === els.modelSelect.value);
  els.modelSize.textContent = m ? m.note : "";
}

function loadSettings() {
  const savedModel = localStorage.getItem(STORAGE.model);
  if (savedModel && MODELS.some((m) => m.id === savedModel)) {
    els.modelSelect.value = savedModel;
  } else {
    els.modelSelect.value = RECOMMENDED_MODEL;
  }
  updateModelSize();

  els.systemPrompt.value = localStorage.getItem(STORAGE.system) || DEFAULT_SYSTEM;
  els.temperature.value = localStorage.getItem(STORAGE.temp) || "0.7";
  els.topP.value = localStorage.getItem(STORAGE.topP) || "0.95";
  els.maxTokens.value = localStorage.getItem(STORAGE.maxTokens) || "1024";
  els.tempVal.textContent = els.temperature.value;
  els.topPVal.textContent = els.topP.value;
  els.maxTokVal.textContent = els.maxTokens.value;

  els.systemPrompt.addEventListener("input", () => {
    localStorage.setItem(STORAGE.system, els.systemPrompt.value);
  });
  for (const [el, valEl, key] of [
    [els.temperature, els.tempVal, STORAGE.temp],
    [els.topP, els.topPVal, STORAGE.topP],
    [els.maxTokens, els.maxTokVal, STORAGE.maxTokens],
  ]) {
    el.addEventListener("input", () => {
      valEl.textContent = el.value;
      localStorage.setItem(key, el.value);
    });
  }
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE.history);
    state.history = raw ? JSON.parse(raw) : [];
    if (state.history.length) {
      els.welcome.classList.add("hidden");
      for (const m of state.history) {
        const text = typeof m.content === "string" ? m.content : extractText(m.content);
        const img = m.image || extractImage(m.content);
        renderMessage(m.role, text, false, img);
      }
    }
  } catch {
    state.history = [];
  }
}

function extractText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.filter((p) => p.type === "text").map((p) => p.text).join("\n");
  }
  return "";
}
function extractImage(content) {
  if (Array.isArray(content)) {
    const p = content.find((p) => p.type === "image_url");
    return p?.image_url?.url || null;
  }
  return null;
}

function saveHistory() {
  // Para no reventar localStorage, no persistimos data URLs de imágenes,
  // solo dejamos un marcador. La conversación se mantiene en memoria
  // dentro de la sesión actual.
  try {
    const slim = state.history.map((m) => {
      if (typeof m.content === "string") return { role: m.role, content: m.content };
      const text = extractText(m.content);
      const hasImg = !!extractImage(m.content);
      return hasImg
        ? { role: m.role, content: text, hadImage: true }
        : { role: m.role, content: text };
    });
    localStorage.setItem(STORAGE.history, JSON.stringify(slim));
  } catch {}
}

function bindUI() {
  els.menuBtn.addEventListener("click", () => toggleSidebar(true));
  els.backdrop.addEventListener("click", () => toggleSidebar(false));
  els.newChatBtn.addEventListener("click", clearChat);
  els.clearChatBtn.addEventListener("click", () => {
    clearChat();
    toggleSidebar(false);
  });
  els.clearCacheBtn.addEventListener("click", clearModelCache);
  els.loadModelBtn.addEventListener("click", () => loadModel(els.modelSelect.value));

  els.composer.addEventListener("submit", (e) => {
    e.preventDefault();
    sendMessage();
  });
  els.input.addEventListener("input", autoresize);
  els.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !isMobile()) {
      e.preventDefault();
      sendMessage();
    }
  });
  els.stopBtn.addEventListener("click", () => {
    if (state.abort) state.abort();
  });

  document.querySelectorAll(".chip").forEach((c) => {
    c.addEventListener("click", () => {
      els.input.value = c.textContent;
      autoresize();
      els.input.focus();
    });
  });

  els.continueAnywayBtn.addEventListener("click", () => {
    els.unsupported.classList.add("hidden");
  });

  els.imageInput.addEventListener("change", onImagePicked);
  els.attachRemove.addEventListener("click", clearPendingImage);
}

async function onImagePicked(e) {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;

  if (!VISION_MODELS.has(els.modelSelect.value) && state.modelId && !VISION_MODELS.has(state.modelId)) {
    const proceed = confirm(
      "El modelo actual no entiende imágenes. Para analizar fotos cambia a 'Phi 3.5 Vision' en el menú y descárgalo. ¿Quieres continuar y elegir el modelo de visión ahora?"
    );
    if (proceed) {
      els.modelSelect.value = "Phi-3.5-vision-instruct-q4f16_1-MLC";
      localStorage.setItem(STORAGE.model, els.modelSelect.value);
      updateModelSize();
      toggleSidebar(true);
    }
    return;
  }

  try {
    const dataUrl = await fileToResizedDataURL(file, 672);
    pendingImage = dataUrl;
    els.attachThumb.src = dataUrl;
    els.attachPreview.classList.remove("hidden");
    els.sendBtn.disabled = false;
    if (!els.input.value.trim()) {
      els.input.placeholder = "Pregunta sobre la imagen (ej: ¿qué es esto? ¿es comestible?)";
    }
  } catch (err) {
    alert("No pude leer la imagen: " + (err.message || err));
  }
}

function clearPendingImage() {
  pendingImage = null;
  els.attachPreview.classList.add("hidden");
  els.attachThumb.src = "";
  els.input.placeholder = "Escribe a Maia...";
  els.sendBtn.disabled = !els.input.value.trim();
}

function fileToResizedDataURL(file, maxDim) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const { naturalWidth: w0, naturalHeight: h0 } = img;
      const scale = Math.min(1, maxDim / Math.max(w0, h0));
      const w = Math.max(1, Math.round(w0 * scale));
      const h = Math.max(1, Math.round(h0 * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      try {
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(new Error("formato de imagen no soportado (¿HEIC sin convertir?)"));
    };
    img.src = url;
  });
}

function isMobile() {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

function toggleSidebar(open) {
  els.sidebar.classList.toggle("open", open);
  els.backdrop.classList.toggle("hidden", !open);
  els.sidebar.setAttribute("aria-hidden", String(!open));
}

function autoresize() {
  els.input.style.height = "auto";
  els.input.style.height = Math.min(els.input.scrollHeight, window.innerHeight * 0.3) + "px";
  els.sendBtn.disabled = (!els.input.value.trim() && !pendingImage) || state.generating;
}

async function checkWebGPU() {
  if (!("gpu" in navigator)) {
    els.unsupported.classList.remove("hidden");
    return false;
  }
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      els.unsupported.classList.remove("hidden");
      return false;
    }
  } catch {
    els.unsupported.classList.remove("hidden");
    return false;
  }
  return true;
}

// ---------------- Modelo ----------------
async function loadModel(modelId) {
  if (state.loading) return;
  state.loading = true;
  els.loadModelBtn.disabled = true;
  els.loadProgress.classList.remove("hidden");
  setLoadProgress(0, "Iniciando...");

  try {
    if (state.engine && state.modelId !== modelId) {
      try { await state.engine.unload(); } catch {}
      state.engine = null;
    }

    const initProgressCallback = (report) => {
      const pct = typeof report.progress === "number" ? Math.round(report.progress * 100) : 0;
      setLoadProgress(pct, report.text || `Descargando... ${pct}%`);
    };

    if (!state.engine) {
      state.engine = await webllm.CreateMLCEngine(modelId, {
        initProgressCallback,
      });
    } else {
      await state.engine.reload(modelId, undefined, { initProgressCallback });
    }

    state.modelId = modelId;
    const m = MODELS.find((x) => x.id === modelId);
    els.modelLabel.textContent = m ? m.label.split(" (")[0] : modelId;
    setLoadProgress(100, "Modelo listo. Ya puedes chatear sin internet.");
    setTimeout(() => els.loadProgress.classList.add("hidden"), 1500);
    updateStorageInfo();
  } catch (err) {
    console.error(err);
    setLoadProgress(0, "Error: " + (err.message || err));
  } finally {
    state.loading = false;
    els.loadModelBtn.disabled = false;
    els.sendBtn.disabled = !els.input.value.trim();
  }
}

function setLoadProgress(pct, text) {
  els.loadBar.style.width = pct + "%";
  els.loadText.textContent = text;
}

// ---------------- Chat ----------------
function renderMessage(role, content, isStreaming, imageUrl) {
  els.welcome.classList.add("hidden");
  const div = document.createElement("div");
  div.className = "msg " + role + (isStreaming ? " streaming" : "");
  div.dataset.role = role;
  if (imageUrl) {
    const img = document.createElement("img");
    img.className = "msg-image";
    img.src = imageUrl;
    img.alt = "imagen adjunta";
    div.appendChild(img);
  }
  if (content) {
    const txt = document.createElement("span");
    txt.className = "msg-text";
    txt.textContent = content;
    div.appendChild(txt);
  }
  els.messages.appendChild(div);
  scrollToBottom();
  return div;
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    els.chat.scrollTop = els.chat.scrollHeight;
  });
}

function clearChat() {
  state.history = [];
  saveHistory();
  els.messages.innerHTML = "";
  els.welcome.classList.remove("hidden");
}

async function sendMessage() {
  const text = els.input.value.trim();
  const image = pendingImage;
  if ((!text && !image) || state.generating) return;

  if (!state.engine) {
    alert("Primero descarga un modelo desde el menú.");
    toggleSidebar(true);
    return;
  }

  if (image && !VISION_MODELS.has(state.modelId)) {
    alert("El modelo cargado no procesa imágenes. Carga 'Phi 3.5 Vision' desde el menú.");
    return;
  }

  const userContent = image
    ? [
        {
          type: "text",
          text: text || "Describe esta imagen con detalle. Si es una planta, hongo o animal, propón identificación (nombre común y científico) con tu nivel de confianza, y lista propiedades conocidas, usos tradicionales y advertencias de seguridad. Si no estás seguro, dilo claramente y NUNCA recomiendes consumir algo silvestre solo en base a una foto: pide confirmación a un experto.",
        },
        { type: "image_url", image_url: { url: image } },
      ]
    : text;

  state.history.push({ role: "user", content: userContent });
  saveHistory();
  renderMessage("user", text, false, image);
  els.input.value = "";
  clearPendingImage();
  autoresize();

  const assistantDiv = renderMessage("assistant", "", true);
  state.generating = true;
  els.sendBtn.classList.add("hidden");
  els.stopBtn.classList.remove("hidden");

  let aborted = false;
  state.abort = () => {
    aborted = true;
    try { state.engine.interruptGenerate(); } catch {}
  };

  const messages = [
    { role: "system", content: els.systemPrompt.value || DEFAULT_SYSTEM },
    ...state.history.map((m) => ({ role: m.role, content: m.content })),
  ];

  // Tras cada turno con visión, para no inflar el contexto, descartamos
  // imágenes de turnos previos al construir el prompt — solo dejamos
  // la imagen del último turno del usuario.
  let lastUserWithImage = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user" && Array.isArray(messages[i].content) && extractImage(messages[i].content)) {
      lastUserWithImage = i;
      break;
    }
  }
  for (let i = 0; i < messages.length; i++) {
    if (i !== lastUserWithImage && Array.isArray(messages[i].content)) {
      messages[i] = { role: messages[i].role, content: extractText(messages[i].content) || "(imagen)" };
    }
  }

  try {
    const stream = await state.engine.chat.completions.create({
      messages,
      stream: true,
      temperature: parseFloat(els.temperature.value),
      top_p: parseFloat(els.topP.value),
      max_tokens: parseInt(els.maxTokens.value, 10),
    });

    let acc = "";
    for await (const chunk of stream) {
      if (aborted) break;
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        acc += delta;
        assistantDiv.textContent = acc;
        scrollToBottom();
      }
    }

    assistantDiv.classList.remove("streaming");
    if (acc) {
      state.history.push({ role: "assistant", content: acc });
      saveHistory();
    } else if (aborted) {
      assistantDiv.textContent = "(detenido)";
    }
  } catch (err) {
    console.error(err);
    assistantDiv.classList.remove("streaming");
    assistantDiv.textContent = "Error: " + (err.message || err);
  } finally {
    state.generating = false;
    state.abort = null;
    els.stopBtn.classList.add("hidden");
    els.sendBtn.classList.remove("hidden");
    els.sendBtn.disabled = !els.input.value.trim();
  }
}

// ---------------- Cache / storage ----------------
async function clearModelCache() {
  if (!confirm("¿Borrar todos los modelos descargados? Tendrás que volver a descargarlos.")) return;
  try {
    if (state.engine) {
      try { await state.engine.unload(); } catch {}
      state.engine = null;
      state.modelId = null;
      els.modelLabel.textContent = "sin modelo";
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("webllm")).map((k) => caches.delete(k)));
    }
    if (indexedDB.databases) {
      const dbs = await indexedDB.databases();
      for (const db of dbs) {
        if (db.name && /webllm|mlc/i.test(db.name)) {
          indexedDB.deleteDatabase(db.name);
        }
      }
    }
    alert("Caché borrada.");
    updateStorageInfo();
  } catch (e) {
    alert("No se pudo borrar todo: " + e.message);
  }
}

async function updateStorageInfo() {
  if (!navigator.storage || !navigator.storage.estimate) return;
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    const used = (usage / 1024 / 1024).toFixed(0);
    const total = (quota / 1024 / 1024).toFixed(0);
    els.storageInfo.textContent = `Almacenamiento usado: ${used} MB de ~${total} MB disponibles.`;
  } catch {}
}

// ---------------- Service Worker ----------------
function registerSW() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      const swUrl = new URL("sw.js", document.baseURI).href;
      navigator.serviceWorker.register(swUrl).catch((err) => {
        console.warn("SW no registrado:", err);
      });
      navigator.storage?.persist?.().catch(() => {});
    });
  }
}

init();
