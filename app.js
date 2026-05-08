// Maia — chat IA offline en el navegador con WebLLM + WebGPU.
// El modelo se descarga una sola vez y se cachea en el dispositivo.

import * as webllm from "https://esm.run/@mlc-ai/web-llm@0.2.79";

// Modelos curados. IDs corresponden a los publicados por mlc-ai en HuggingFace
// y soportados por WebLLM. Se ordenan de menor a mayor uso de memoria.
const MODELS = [
  {
    id: "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    label: "Llama 3.2 1B (rápido, ~880 MB)",
    sizeMb: 880,
    note: "Mejor opción para iPhone. Equilibrio entre velocidad y calidad.",
  },
  {
    id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
    label: "Qwen 2.5 1.5B (~950 MB)",
    sizeMb: 950,
    note: "Bueno en español y razonamiento.",
  },
  {
    id: "gemma-2-2b-it-q4f16_1-MLC",
    label: "Gemma 2 2B (~1.4 GB)",
    sizeMb: 1400,
    note: "Más capaz pero pesado para móviles antiguos.",
  },
  {
    id: "Llama-3.2-3B-Instruct-q4f16_1-MLC",
    label: "Llama 3.2 3B (~2.0 GB)",
    sizeMb: 2000,
    note: "Mucha calidad. iPhone 15 Pro o superior recomendado.",
  },
  {
    id: "Phi-3.5-mini-instruct-q4f16_1-MLC",
    label: "Phi 3.5 mini (~2.2 GB)",
    sizeMb: 2200,
    note: "Bueno en código y razonamiento técnico.",
  },
  {
    id: "Qwen2.5-3B-Instruct-q4f16_1-MLC",
    label: "Qwen 2.5 3B (~2.0 GB)",
    sizeMb: 2000,
    note: "Multilingüe fuerte.",
  },
  {
    id: "Hermes-3-Llama-3.2-3B-q4f16_1-MLC",
    label: "Hermes 3 Llama 3.2 3B (~2.0 GB)",
    sizeMb: 2000,
    note: "Fine-tune comunitario, respuestas más directas.",
  },
];

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
};

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
      for (const m of state.history) renderMessage(m.role, m.content, false);
    }
  } catch {
    state.history = [];
  }
}

function saveHistory() {
  try {
    localStorage.setItem(STORAGE.history, JSON.stringify(state.history));
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
  els.sendBtn.disabled = !els.input.value.trim() || state.generating;
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
function renderMessage(role, content, isStreaming) {
  els.welcome.classList.add("hidden");
  const div = document.createElement("div");
  div.className = "msg " + role + (isStreaming ? " streaming" : "");
  div.dataset.role = role;
  div.textContent = content;
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
  if (!text || state.generating) return;

  if (!state.engine) {
    alert("Primero descarga un modelo desde el menú.");
    toggleSidebar(true);
    return;
  }

  state.history.push({ role: "user", content: text });
  saveHistory();
  renderMessage("user", text, false);
  els.input.value = "";
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
