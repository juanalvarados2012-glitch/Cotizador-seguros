# 📓 Bitácora del proyecto — Auto-Cotizador

Registro de las decisiones y cambios trabajados en la app. Sirve como memoria
del proyecto para retomar el trabajo más adelante.

> Última actualización: 2026-06-09

---

## ✅ Mejoras gratis para venta a aseguradoras de Ecuador (2026-06-09)

- **Detección de hojas con respaldo:** si ninguna hoja del Excel coincide por
  nombre con un ramo conocido, la app ahora analiza TODAS las hojas (menos
  listados) y acepta las que tengan al menos 3 filas de cobertura. Antes, un
  archivo con hojas llamadas "Hoja1", "Slip" o el nombre del cliente decía
  "no detecté hojas". También se agregaron ramos típicos de Ecuador a la lista
  de nombres reconocidos (equipo electrónico, fidelidad, cumplimiento, anticipo,
  accidentes, lucro cesante, rotura, todo riesgo, casco).
- **Filtro de encabezados:** celdas que son encabezado de tabla ("COBERTURA /
  ÍTEM", "DESCRIPCIÓN", "RESPUESTA ASEGURADORA", etc.) ya no entran como
  coberturas pendientes ni se aprenden como pares basura desde el archivo base.
  Solo se excluyen coincidencias exactas de toda la celda, así no se pierden
  coberturas reales que empiecen igual ("Cobertura automática para…").
- **Control de calidad al exportar:** si quedan ítems sin responder o marcados
  "por revisar", la app pide confirmación antes de exportar, para no enviarle
  al broker una cotización incompleta por error.
- **Columna de respuesta:** ahora también se reconoce por los encabezados
  "PROPUESTA" y "CONDICIONES OFERTADAS" (comunes en slips de Ecuador).
- **IA por fila consistente:** el botón 🤖 de una sola fila ahora también envía
  las instrucciones del usuario (antes solo el llenado por lotes las usaba).
- **Prompt con contexto Ecuador:** la IA recibe la regla de responder cifras en
  dólares USD (moneda de Ecuador) con formato $5,000.
- **Endpoint `/api/quote` endurecido:** máximo 60 coberturas por llamada y
  recortes de tamaño en textos y memoria (controla tokens y payloads abusivos).

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

### Más orientada a empresas (sin costo ni infraestructura nueva)
- **Marca de la empresa:** la cabecera muestra el nombre de la agencia (🏢) y si
  el usuario es Admin, cuando hay una empresa activa (Clerk Organization).
- **Roles:** solo el **administrador** de la empresa puede modificar el "cerebro"
  compartido (botones Vaciar / ↺ Base / Importar). Los suscriptores (miembros) lo
  usan pero no pueden borrarlo. En uso personal hay control total. Evita que
  alguien borre la memoria del equipo por error.
- **Invitación a crear empresa:** banner en la pantalla de inicio (solo en uso
  individual) que invita a crear la empresa para compartir memoria entre el equipo.
- **Pendiente (siguiente nivel real):** memoria compartida en la NUBE (que el
  equipo comparta entre distintas computadoras). Requiere una base de datos
  pequeña (hay opciones gratis); el código actual aún guarda por navegador.

### Memoria semilla GENÉRICA (quita el criterio de Cóndor de la base)
- La base de conocimiento semilla (`SEED_KB`) ya **no contiene criterio real de
  ninguna aseguradora**: coberturas estándar del mercado con respuestas neutras
  ("Cubierto según condiciones generales", "Sujeto a evaluación del suscriptor",
  "Según tabla de deducibles…"). Sin límites, deducibles ni notas específicas.
- Motivo: confidencialidad y credibilidad. La app debe **nacer neutra** y aprender
  el criterio de cada cliente durante el uso/piloto, no traer data de un tercero.
- También se neutralizaron referencias internas a "condor" (clave de migración
  antigua y palabra clave del detector de columnas).
- ⚠️ **Ojo:** en un navegador que YA usó la app, la memoria vieja sigue guardada
  localmente. Para limpiarla en el equipo donde se hará la demo: botón
  **"↺ Base"** del panel de Memoria (ahora carga la base genérica) o borrar los
  datos del sitio.

### Giro de modelo: de suscripción individual a vender a brokers (B2B)
- **Decisión de negocio:** la app ya no apunta a suscripción individual, sino a
  **venderla a agencias/brokers de USA** como herramienta para su equipo
  (licencia por empresa). Idioma objetivo: **bilingüe ES/EN** (pendiente).
- **Memoria compartida por empresa (Clerk Organizations):** el "scope" de la
  memoria y el historial ahora puede ser una **empresa**, no solo una persona.
  - Si el usuario tiene una **Organización (empresa) activa** en Clerk, el scope
    es `org_<idEmpresa>`: **todo el equipo comparte la misma memoria** (lo que
    aprende uno lo aprovechan todos). La tarjeta de memoria muestra "EQUIPO 👥".
  - Si no hay empresa activa, sigue el comportamiento de siempre (memoria
    personal por cuenta). **Cambio 100% compatible hacia atrás.**
  - Se agregó `<OrganizationSwitcher>` en el encabezado para crear/cambiar de
    empresa e invitar miembros. El panel de Privacidad explica si la memoria es
    compartida por la empresa o personal.
  - La migración de datos antiguos (sin cuenta) solo aplica a uso personal: una
    empresa arranca limpia con la base de conocimiento semilla.
  - **Pendiente de configuración:** habilitar **Organizations** en el panel de
    Clerk (Dashboard → Organizations → Enable) para que el selector funcione.

### Interfaz bilingüe ES/EN
- Toda la interfaz visible está en **español e inglés** (`src/i18n.js` con el
  objeto `STR = { es, en }`; las cadenas con datos variables son funciones).
- **Detección automática:** arranca en el idioma del navegador (navegadores en
  inglés, típicos en USA, abren en inglés); si el usuario eligió un idioma, se
  recuerda en `localStorage` (`cotizador_lang`).
- **Botón 🌐 ES/EN** en el encabezado para cambiar en cualquier momento.
- Cubre landing, encabezado, paneles (privacidad, historial, memoria), pantalla
  de revisión, tabla, filtros, toasts y el **reporte Excel exportado** (hoja
  resumen y sufijo del archivo, `_RESPONDIDO` / `_ANSWERED`).
- Se quitó el texto residual de "suscripción" del pie (ahora "herramienta para
  equipos de cotización" / "quoting tool for broker teams").
- **Pendiente:** el prompt del servidor (`api/quote.js`) sigue en español y la
  base de conocimiento semilla es de seguros de Ecuador; las respuestas que
  genera son códigos cortos ("Ok", "NO", límites) válidos en ambos idiomas.

### Próximos pasos de este giro (no hechos aún)
- **Landing en inglés** aún más orientado a agencias de USA (mensaje de venta).
- **Cobro por empresa:** empezar manual (factura/contrato); luego Stripe con
  plan por agencia.
- (Opcional) Adaptar el prompt/IA y una base de conocimiento en inglés para el
  mercado de USA.

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
- **Datos por usuario:** la memoria y el historial ahora se guardan por cuenta
  de Clerk (scope = userId). Las claves de localStorage y la base de IndexedDB
  llevan el id del usuario, así dos empleados en el mismo navegador no comparten
  datos. La primera vez de cada usuario migra los datos antiguos (sin cuenta).
- **Autenticación con Clerk:** login obligatorio (pantalla de inicio de sesión
  antes de usar la app) y botón de cuenta para cerrar sesión. Requiere
  `VITE_CLERK_PUBLISHABLE_KEY` en el navegador (con prefijo VITE_) y
  `CLERK_SECRET_KEY` en el servidor. Si falta la key, muestra un aviso claro.
- **Listo para empresa (mejoras gratis):** panel de **🔒 Privacidad** (qué se
  guarda local, qué se envía a la IA, qué NO), tarjeta **⏱ Ahorro estimado** en
  pantalla y en el Excel, **resumen ejecutivo** en la hoja exportada, **motor de
  coincidencias afinado** (Jaccard + contención → autollena más, menos IA),
  **modo demo** con datos de ejemplo y **respaldo/restauración en un clic**
  (memoria + historial en un JSON).
- **Historial de archivos:** los archivos completados se guardan en IndexedDB
  (metadatos ligeros + respuestas y bytes del Excel). Botón **📁 Historial** en
  la cabecera: lista por fecha, con **Abrir** (reabre para ver/editar/exportar)
  y **eliminar**. Se guarda al **exportar** y al pulsar **"Otro archivo"**.
- **Auto-aprendizaje de la IA:** al terminar el llenado, las respuestas con
  confianza alta/media (no "baja"/"REVISAR") se guardan en memoria, para que el
  mismo archivo (o uno parecido) se llene solo la próxima vez, sin IA.
- **Velocidad de la IA:** modelo `llama-3.1-8b-instant`, lotes de 30, 4 en
  paralelo y menos ejemplos de memoria por llamada (menos tokens, menos 429).
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
