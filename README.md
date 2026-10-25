# MAIA Campo · 2.0 beta

PWA personal en español para instalar desde Safari mediante Compartir → Añadir a pantalla de inicio. No requiere App Store, cuenta ni API key.

**Prototipo experimental. No es un dispositivo médico, identificador fiable de especies ni sustituto de rescate. No está validado en un iPhone real.**

## Qué incluye

- Chat local con WebLLM y selección Qwen3 1.7B / 4B / 8B. Los modelos mayores pueden exceder la memoria de iOS. El catálogo se comprueba contra el motor instalado, no contra nombres inventados.
- Descripción visual experimental con SmolVLM 500M. No determina comestibilidad, seguridad ni diagnóstico. Una descripción errónea puede contaminar la respuesta posterior; siempre aparece separada y marcada como no verificada.
- Dictado de hasta 20 segundos con Whisper Tiny multilingüe, local vía WASM. El texto se revisa antes de enviarlo. Lectura con voces de iOS solo si se identifican como locales y en español.
- Un solo tipo de modelo en memoria: se libera el anterior antes de cargar chat, imagen o dictado. Cambiar de función puede ser lento.
- Biblioteca IndexedDB: PDF con texto, TXT, MD; búsqueda por palabras con ranking BM25, página y fragmento. Los documentos Tacoma/Lexus se separan por etiqueta. No se incluyen manuales de fábrica ni una base de hongos validada. PDFs escaneados y diagramas no se interpretan.
- Seis fichas breves que no necesitan modelo: emergencias, hemorragia, frío, calor, hongos y desorientación. Las fuentes y la fecha de consulta aparecen en cada ficha. Son síntesis editoriales no revisadas clínicamente, no un curso ni manual exhaustivo.
- Modo primeros auxilios sin generación médica; consultas de riesgo detectadas pasan a fichas. El filtro de texto no es un sistema de triaje completo.
- Coordenadas por permiso explícito del usuario, sin enviar ubicación. No hay mapas, navegación ni envío de SOS.
- Copia exportable de textos, notas y conversación. Al reimportar JSON solo se añaden documentos; no se restauran ni sobrescriben automáticamente ajustes o conversaciones. No incluye PDF originales ni pesos.

## Instalar y probar

1. Abrir la URL publicada en Safari y añadir a pantalla de inicio. Usar siempre ese icono y no navegación privada.
2. En Preparar, descargar conversación, visión y dictado con Wi-Fi. El chat puede ocupar varios GB; las librerías, runtimes, voz y visión añaden espacio. Mantener la app visible durante la preparación.
3. Completar los vehículos con año, variante, motor y transmisión; importar los manuales correctos y asignarlos al vehículo correspondiente. Los perfiles y documentos quedan solo en el navegador.
4. Revisar archivos/espacio. Solicitar persistencia; el navegador puede denegarla y puede borrar datos incluso posteriormente.
5. Activar modo avión con Wi-Fi apagado, cerrar la app y abrir su icono. Probar conversación sin red. Después hacer una pregunta con foto, un dictado y una lectura. Las marcas de prueba solo registran que la operación terminó con `navigator.onLine === false`, no que la información sea correcta.
6. Conservar manuales y guías originales también en Archivos, y medios de navegación, primeros auxilios y comunicaciones independientes.

## Ingeniería offline

El build empaqueta JavaScript y copia los runtimes a la misma web. No hay importaciones CDN en el arranque. El service worker instala atómicamente el shell y chunks JavaScript; WASM de voz/visión se prepara y verifica por separado. Los modelos usan las cachés de sus motores. No se muestra un estado global «seguro para el bosque». Un fallo de descarga no se silencia ni se reemplaza con una API en la nube.

Una nueva versión espera confirmación antes de activarse. La caché propia de MAIA puede renovarse; no se borran cachés de otros proyectos alojados en el mismo origen. Los archivos antiguos de la primera MAIA quedan en Git y sus datos en localStorage no se eliminan; esta beta usa una base nueva y no migra automáticamente conversaciones antiguas.

Los documentos y resultados se insertan como texto, no HTML. Los PDF se procesan con evaluación de JavaScript deshabilitada. Las notas/documentos se marcan como datos, no instrucciones, en el prompt; esto mitiga pero no elimina prompt injection ni alucinaciones. Las referencias recuperadas no verifican afirmaciones del modelo. Los valores mecánicos deben comprobarse en el original.

El contexto está limitado a 4096 tokens. Se envían turnos completos recientes y notas explícitas cortas, no una memoria ilimitada. Qwen3 4B es un candidato a evaluar, no una mejora de inteligencia demostrada frente a la app anterior.

## Desarrollo

Node 22. `npm install`, `npm test`, `npm run build`. Servir `dist/` mediante HTTPS (localhost también sirve para pruebas). `npx playwright install chromium webkit` y `npm run test:browser` ejecutan pruebas de interfaz, caché y persistencia. Estas pruebas NO descargan modelos, NO prueban inferencia real, NO validan medicina ni identificación.

GitHub Actions construye y prueba antes de publicar `dist/` en Pages. Las dependencias directas están fijadas; el lock resuelto de cada ejecución se conserva como artefacto de CI. Este primer corte no incluye un lock transitivo versionado, por lo que la reproducibilidad de dependencias transitivas queda pendiente.

## Fuentes

- https://www.redcross.org/take-a-class/resources/learn-first-aid/bleeding-life-threatening-external
- https://www.redcross.org/take-a-class/resources/learn-first-aid/hypothermia
- https://www.redcross.org/take-a-class/resources/learn-first-aid/heat-stroke
- https://www.poison.org/articles/wild-mushroom-warning
- https://www.poison.org/
- https://www.nps.gov/articles/gtgemergencyplan.htm
- https://webllm.mlc.ai/docs/
- https://huggingface.co/HuggingFaceTB/SmolVLM-500M-Instruct
- https://huggingface.co/onnx-community/whisper-tiny

Consultadas el 25 de octubre de 2026. La aplicación no está avalada por esas organizaciones. Cada modelo y dependencia conserva su licencia; código de la aplicación bajo MIT como en el proyecto original.
