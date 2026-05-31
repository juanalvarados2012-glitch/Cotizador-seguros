# 📓 Bitácora del proyecto — Auto-Cotizador

Registro de las decisiones y cambios trabajados en la app. Sirve como memoria
del proyecto para retomar el trabajo más adelante.

> Última actualización: 2026-05-31

---

## 🎯 Qué es la app

Herramienta web que automatiza cotizaciones de seguros: se sube el **Excel del
broker**, la app responde las coberturas (con memoria + IA) y **devuelve el mismo
Excel respondido** + una hoja resumen. Stack: **React + Vite**, IA vía **Groq**
(proxy serverless en `/api/quote`), desplegada en **Vercel**.

- **Rama de producción:** `main` (Vercel publica desde aquí)
- **URL de producción:** `cotizador-seguros-beta.vercel.app`

---

## ✅ Trabajo realizado en esta sesión

### Publicación / Vercel
- Se desactivó la **Deployment Protection** para que la app sea pública.
- Se aclaró que Vercel publica desde `main`; los cambios deben ir a esa rama.
- La caché del navegador hacía ver versiones viejas → recargar con
  `Ctrl/Cmd + Shift + R` o usar incógnito.

### Rediseño del landing
- Hero con resplandor animado, métricas, comparativo *antes/después* y CTA.
- Bloque **"100% compatible con Excel"** (Importa → Responde → Exporta).

### Cambios de marca (texto visible)
- Se quitó **"Seguros Cóndor"** y **"Ramos Generales"** de la interfaz.
- Encabezados neutros: "NUESTRA RESPUESTA", hoja "✓ Respuestas".
- Nota: la clave interna de `localStorage` se mantuvo para no borrar la memoria.

### Arreglos de funcionamiento (rama claude/export-update-delays)
- **Exportar no descargaba:** se cambió `XLSX.writeFile` por descarga vía
  **Blob + ancla** (`URL.createObjectURL` + `<a download>`), método robusto en
  el navegador. `writeFile` podía fallar en silencio con archivos grandes/con
  estilos o si el navegador bloqueaba la descarga interna.
- **"Se queda pensando" sin actualizar:** la IA procesaba lotes de 25 **uno tras
  otro** (con pausa y timeout de 45s), así que pasaban minutos entre cada
  refresco. Ahora corre **3 lotes en paralelo** (concurrencia controlada) con
  **lotes de 12**, refrescando la pantalla cada vez que un lote responde y con
  timeout de 30s: termina antes y el avance se ve fluido.

### Arreglos de funcionamiento
- **Error 429 de Groq:** ahora procesa en **lotes de 25**, con **reintentos** y
  pausa entre lotes, y envía solo la memoria relevante (menos tokens).
- **Error al exportar ("Worksheet already exists"):** la hoja resumen previa se
  elimina de `Sheets` **y** `SheetNames` antes de re-agregarla.
- **Exportar tras recargar:** reconstruye el workbook desde la sesión guardada
  y avisa claramente si no hay archivo (ya no falla en silencio).

### Funciones nuevas
- **Autoguardado de sesión:** respuestas en `localStorage` + archivo original en
  `IndexedDB`. Al recargar, recupera todo. "Otro archivo" limpia la sesión.
- **Resaltado de "por revisar":** detecta baja confianza / "REVISAR" / match
  flojo. Tarjeta **POR REVISAR**, filtro **⚠ Revisar**, filas resaltadas y
  columna **"¿REVISAR?"** en el Excel exportado.

---

## 🔭 Ideas / próximos pasos

### Para volverlo vendible (si se comercializa)
- Seguridad y privacidad de datos (confidencialidad de pólizas).
- Cuentas de usuario y **memoria separada por empresa**.
- Plan **pago de IA** (Groq gratis tiene límites) → incluir el costo en el precio.
- Confiabilidad y soporte.
- Validar con un caso real (medir tiempo antes/después) antes de poner precio.
- Enfocar la venta en **"el equipo cotiza más rápido y atiende más"**, no en recortes.

### Mejoras técnicas pendientes (elegidas, no hechas aún)
- **Procesar más rápido:** varios lotes en paralelo (controlado, sin disparar 429).
- **Auto-llenar más:** afinar el motor de coincidencias para usar menos IA.

---

## 💡 Notas útiles
- Tras cualquier cambio: esperar 1-2 min al deploy de Vercel y recargar sin caché.
- Para confirmar un deploy: Vercel → **Deployments** → el de arriba debe decir
  *Production / Ready* con el último commit.
