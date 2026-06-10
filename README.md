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

## 🔐 Seguridad (API key)

La clave de Groq vive **solo en el servidor**: el navegador llama a `/api/quote`
(serverless function en `api/quote.js`) y esa función habla con Groq usando
`GROQ_API_KEY`. La key nunca se expone al cliente.

## ☁️ Despliegue en Vercel

1. Importa el repo en Vercel (detecta Vite automáticamente; `api/quote.js` se
   publica como Serverless Function).
2. En **Settings → Environment Variables** agrega:
   - `GROQ_API_KEY` = tu clave de Groq
   - `GROQ_MODEL` (opcional) = `llama-3.3-70b-versatile`
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

## Stack

React 18 · Vite · SheetJS (xlsx) · Groq API (proxy serverless) · Clerk · Upstash Redis (opcional)
