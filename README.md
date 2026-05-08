# Maia · Chat IA Offline

Maia es una **Progressive Web App (PWA)** que ejecuta un modelo de lenguaje **dentro de tu propio dispositivo** usando WebGPU + WebAssembly (vía [WebLLM](https://github.com/mlc-ai/web-llm)).

- Sin servidor. Sin API key. Sin telemetría.
- El modelo se descarga **una sola vez** (~700 MB – 2 GB según el modelo) y queda cacheado en el navegador.
- Tras la primera carga, **funciona sin conexión a internet**.
- Se puede "instalar" en la pantalla de inicio del iPhone como una app.

## 🌐 Demo

Una vez activado GitHub Pages en este repo, la app vivirá en:

```
https://<tu-usuario>.github.io/MAIA/
```

## 📱 Instalación en iPhone

1. **Requisitos**: iPhone con **iOS 18 o superior**. WebGPU sólo está disponible en iOS reciente.
2. Abre la URL de la app en **Safari**.
3. Si aparece "WebGPU no disponible", ve a **Ajustes → Apps → Safari → Avanzado → Funciones experimentales** y activa **WebGPU**. Vuelve a Safari y recarga.
4. En Safari, toca el botón **Compartir** (cuadro con flecha) → **Añadir a pantalla de inicio**.
5. Abre **Maia** desde la pantalla de inicio. Pulsa el menú ☰ → elige un modelo → **Descargar/cargar modelo**.
6. Cuando la barra llegue al 100 %, ya puedes **activar el modo avión**: Maia seguirá respondiendo.

> Consejo: el primer modelo recomendado para iPhone es **Llama 3.2 1B** (~880 MB). Para iPhone 15 Pro o superior puedes usar 3B sin problema.

## 💻 Uso en escritorio

Abre la URL en **Chrome 121+**, **Edge 121+**, o **Safari Tech Preview**. Todo igual: elige modelo, descarga, chatea. Funciona sin internet después.

## 🧠 Modelos incluidos

| Modelo | Tamaño | Notas |
|---|---|---|
| Llama 3.2 1B Instruct | ~880 MB | Recomendado para iPhone |
| Qwen 2.5 1.5B Instruct | ~950 MB | Bueno en español |
| Gemma 2 2B IT | ~1.4 GB | Más capaz |
| Llama 3.2 3B Instruct | ~2.0 GB | iPhone 15 Pro+ |
| Phi 3.5 mini | ~2.2 GB | Bueno en código |
| Qwen 2.5 3B Instruct | ~2.0 GB | Multilingüe fuerte |
| Hermes 3 Llama 3.2 3B | ~2.0 GB | Fine-tune comunitario |

Todos son modelos open-source. Lo que el modelo responda depende del modelo, no de Maia: la app no añade ningún filtro propio sobre la respuesta.

## 🛠 Desarrollo local

No hay paso de build. Es HTML + CSS + JS estático.

```bash
# Servidor local rápido (se necesita https para SW + algunos navegadores requieren https para WebGPU)
python3 -m http.server 8000
# luego abre http://localhost:8000
```

Para probar la PWA en condiciones reales (service worker + WebGPU en iOS) necesitas **HTTPS**, así que lo más práctico es desplegar a GitHub Pages.

## 🚀 Despliegue en GitHub Pages

Este repo incluye un workflow en `.github/workflows/deploy.yml` que publica el contenido tal cual a GitHub Pages cuando haces push a `main`.

Para activarlo:

1. Sube esta rama a `main` (o haz merge desde `claude/offline-ai-chat-app-3oBqg`).
2. En GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Haz cualquier push a `main`. El workflow se ejecutará y publicará en `https://<tu-usuario>.github.io/MAIA/`.

## 🗂 Estructura

```
MAIA/
├── index.html              # UI
├── style.css               # Estilos (mobile-first, dark)
├── app.js                  # Lógica de chat + WebLLM
├── manifest.webmanifest    # Manifest PWA
├── sw.js                   # Service Worker (cachea el shell)
├── icons/                  # Iconos PWA
└── .github/workflows/
    └── deploy.yml          # Auto-deploy a Pages
```

## ⚖️ Privacidad

Todo ocurre en tu dispositivo. Las conversaciones se guardan en `localStorage` del navegador y nunca salen de él. No hay analytics ni llamadas a servidores externos durante el chat (solo durante la **primera** descarga del modelo desde HuggingFace).

## 📄 Licencia

MIT para el código de la app. Cada modelo descargado tiene su propia licencia (Llama, Gemma, Qwen, Phi, etc.) — revisa la del modelo que uses.
