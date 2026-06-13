# 🦅 Auto-Cotizador

App web para automatizar las cotizaciones de seguros. Sube la plantilla Excel del broker y la app:

- ⚡ Llena al instante las coberturas que ya conoce (sin gastar llamadas a IA)
- 🧠 Aprende: cada respuesta que corriges queda guardada para la próxima vez
- 🤖 Usa IA (Groq) solo para coberturas nuevas/sin precedente
- 📄 Te devuelve el **mismo Excel del broker respondido** + una hoja resumen

## Cómo funciona

1. Subes el archivo del broker (`.xlsx`, `.xls`, `.xlsm`)
2. La app detecta las hojas de coberturas y la columna donde va tu respuesta
3. Match híbrido por cada ítem: `Exacta` → `Similar` → `Pendiente`
4. Botón **Completar con IA** resuelve solo los pendientes (con indicador de confianza)
5. Buscas/filtras, revisas y editas (todo lo editado se aprende)
6. Exportas el archivo respondido

## Instalación

```bash
npm install
cp .env.example .env   # pon tu GROQ_API_KEY
npm run dev
```

Abre http://localhost:5173 — el endpoint `/api/quote` corre dentro del mismo `npm run dev`.

## Build de producción

```bash
npm run build
npm run preview
```

## 🔐 Seguridad (API key + acceso)

La clave de Groq vive **solo en el servidor**: el navegador llama a `/api/quote`
(serverless function en `api/quote.js`) y esa función habla con Groq usando
`GROQ_API_KEY`. La key nunca se expone al cliente.

Además, **`/api/quote` no es de acceso anónimo**: exige un token de sesión de
Clerk válido (la app ya está detrás de login) y aplica un **límite de uso por
usuario** (configurable con `QUOTE_RL_PER_MIN` / `QUOTE_RL_PER_DAY`). Así, nadie
que descubra la URL puede quemar tu cuota/dinero de Groq. Lo mismo aplica a
`/api/kb`: el servidor verifica la firma del token y toma la empresa del token,
nunca de un parámetro del cliente.

## ☁️ Despliegue en Vercel

1. Importa el repo en Vercel (detecta Vite automáticamente; `api/quote.js` y
   `api/kb.js` se publican como Serverless Functions).
2. En **Settings → Environment Variables** agrega:
   - `GROQ_API_KEY` = tu clave de Groq
   - `VITE_CLERK_PUBLISHABLE_KEY` = clave pública de Clerk (login)
   - `CLERK_SECRET_KEY` = clave secreta de Clerk (autentica `/api/quote` y `/api/kb`)
   - `GROQ_MODEL` (opcional) = `llama-3.3-70b-versatile`
   - `QUOTE_RL_PER_MIN` / `QUOTE_RL_PER_DAY` (opcional) = límites de uso de IA
3. Deploy. Listo.

## Memoria

Las respuestas aprendidas se guardan en el navegador (localStorage) por usuario o
por empresa (Clerk Organization). El navegador es siempre la copia de trabajo:
rápida y disponible sin internet.

### ☁️ Memoria compartida del equipo (nube)

Con una base Redis configurada, la memoria de cada **empresa** se sincroniza
automáticamente entre todas las computadoras del equipo: lo que corrige un
suscriptor lo aprovechan todos. Cómo activarla:

1. Crea una base gratis en [Upstash](https://console.upstash.com) (o instala
   **Upstash for Redis** desde el Marketplace de Vercel, que crea las variables solo).
2. Agrega en Vercel (y en tu `.env` local):
   - `KV_REST_API_URL` + `KV_REST_API_TOKEN` (o `UPSTASH_REDIS_REST_URL`/`_TOKEN`)
3. Redeploy. El panel de Memoria mostrará "☁ Memoria compartida con todo el equipo".

Detalles: la sincronización es por entrada (gana la edición más reciente), los
borrados se propagan con lápidas, y el servidor verifica el token de Clerk — la
empresa sale del token firmado, nunca de un parámetro del cliente. Sin las
variables, la app funciona igual pero solo-local (el indicador muestra ☁✕).

## 📈 Resultados (ROI)

El botón **📈 ROI** de la cabecera muestra, por mes o histórico: plantillas
procesadas, % de autollenado, tiempo recuperado y ahorro estimado en dólares
(costo/hora editable). Incluye **reporte de 1 página** listo para imprimir o
guardar como PDF y reenviar a gerencia — es el argumento de compra del piloto.

## 🧪 Desarrollo y calidad

```bash
npm test        # corre la suite de pruebas (Vitest)
npm run lint    # ESLint (cliente React + servidor node)
npm run build   # build de producción
```

La lógica delicada está cubierta por pruebas: el **matching** de coberturas
(`src/matching.js`), la **sincronización** de memoria (`src/cloudSync.js` y
`api/_merge.js`) y la **exportación de alta fidelidad** del Excel
(`src/xlsxExport.js`, con un round-trip real que reabre el archivo generado).
Cada push y PR ejecuta lint + tests + build en GitHub Actions (`.github/workflows/ci.yml`).

### Estructura

- `src/App.jsx` — UI y orquestación.
- `src/matching.js` — matching de coberturas + extracción del Excel (lógica pura).
- `src/cloudSync.js` — fusión de memoria del equipo (cliente).
- `src/xlsxExport.js` — exportación que preserva el formato del broker.
- `api/quote.js` — proxy de IA (auth Clerk + rate limit).
- `api/kb.js` — memoria del equipo (auth Clerk + compare-and-swap).
- `api/_auth.js` · `api/_kv.js` · `api/_merge.js` · `api/_ratelimit.js` — módulos
  compartidos del servidor (los `_` no se publican como funciones en Vercel).

## Stack

React 18 · Vite · SheetJS (xlsx) · Groq API (proxy serverless) · Clerk · Upstash Redis (opcional) · Vitest · ESLint
