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

Las respuestas aprendidas se guardan en `localStorage` del navegador (clave `cotizador_condor_kb_v1`).
Para una versión multi-usuario o que sincronice entre equipos, conviene moverla a una base de datos.

## Stack

React 18 · Vite · SheetJS (xlsx) · Groq API (proxy serverless)
