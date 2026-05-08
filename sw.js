// Service Worker para Maia.
// Cachea el "shell" de la app (HTML/CSS/JS/iconos) para que la PWA arranque sin red.
// El modelo de IA se cachea por separado vía la lógica de WebLLM (Cache API + IndexedDB).

const VERSION = "maia-shell-v1";
const SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) =>
      cache.addAll(SHELL).catch(() => {})
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith("maia-shell-") && k !== VERSION)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // No interceptar pesos del modelo ni recursos de WebLLM CDN — WebLLM
  // gestiona su propia caché y rangos. Servirlos por SW puede romper la descarga.
  if (
    url.hostname.includes("huggingface.co") ||
    url.hostname.includes("hf.co") ||
    url.hostname.includes("raw.githubusercontent.com") ||
    url.hostname.includes("jsdelivr.net") ||
    url.hostname.includes("esm.run") ||
    url.hostname.includes("esm.sh") ||
    url.pathname.endsWith(".wasm") ||
    url.pathname.endsWith(".bin")
  ) {
    return;
  }

  // Solo cacheamos misma origen.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) {
        // Refresca en segundo plano (stale-while-revalidate).
        fetch(req).then((res) => {
          if (res && res.ok) {
            caches.open(VERSION).then((c) => c.put(req, res.clone()));
          }
        }).catch(() => {});
        return cached;
      }
      return fetch(req)
        .then((res) => {
          if (res && res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match("./index.html"));
    })
  );
});
