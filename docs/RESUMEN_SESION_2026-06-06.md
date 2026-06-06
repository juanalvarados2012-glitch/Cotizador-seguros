# 🗂️ Resumen de la sesión — 2026-06-06

Registro de todo lo trabajado y decidido en esta sesión. Sirve para retomar el
proyecto sin perder el hilo. (Complementa `docs/BITACORA.md`.)

---

## 🎯 La decisión grande de negocio

Pasar de "app de suscripción individual" a **vender la herramienta a empresas**.
Tras analizar el producto, se aclaró quién es el cliente real:

> **El cliente NO es un broker — es el área de SUSCRIPCIÓN DE RAMOS GENERALES de
> una ASEGURADORA.** La app llena la respuesta de la aseguradora a las plantillas
> de coberturas que mandan los brokers.

- **Mercado elegido:** Ecuador.
- **Modelo:** licencia por empresa (no suscripción individual). Cobro: empezar
  con piloto gratis, luego mensual.

---

## 🛠️ Cambios técnicos hechos en la app (todo en vivo en `main`)

1. **Memoria por empresa (Clerk Organizations):** si hay empresa activa, el scope
   es `org_<id>`; si no, es personal. Compatible hacia atrás.
2. **Bilingüe ES/EN:** `src/i18n.js`, detecta idioma del navegador, botón 🌐, y
   traduce toda la UI + el reporte Excel exportado.
3. **Base de memoria GENÉRICA (importante):** se quitó el criterio real de Seguros
   Cóndor de la semilla. Ahora trae 54 coberturas estándar con respuestas neutras.
   La app nace neutra y aprende el criterio de cada cliente en el piloto.
   (Confidencialidad + credibilidad.)
4. **Botón "🗑 Vaciar"** memoria (deja en 0) + se respeta la memoria vacía al
   recargar.
5. **Orientación a empresa:** marca de la empresa (🏢 nombre) en la cabecera,
   **roles** (solo Admin puede Vaciar/Base/Importar el cerebro compartido), e
   invitación a crear empresa en la pantalla de inicio.

### ⚠️ Pendiente técnico (el "siguiente nivel" real)
- **Memoria compartida en la NUBE:** hoy la memoria sigue siendo por navegador.
  Para que un equipo comparta cerebro entre computadoras hace falta una base de
  datos pequeña (hay opciones GRATIS: Vercel KV / Upstash). El código se escribe;
  el usuario solo crea la base (~10 min) y pega una clave.

---

## 💵 Precio y costos

**Planes (sugeridos, USD):**
- **Piloto:** 30 días GRATIS, con criterio de éxito (ej. ≥70% autollenado).
- **Starter:** $249/mes (hasta 3 suscriptores).
- **Pro:** $499/mes (hasta 8).
- **Enterprise:** desde $899/mes (ilimitado + soporte prioritario).
- **Onboarding:** $350 (gratis al primer cliente).
- **Cóndor (cliente fundador):** $199/mes congelado el 1er año por testimonio.

**Costo de IA (Groq):** trivial. Aun con el modelo bueno (70B) y 2.000
cotizaciones/mes ≈ **$11/mes**. El costo es <1% de la licencia → **no se suben los
precios** por usar Groq premium.
- **Acción del usuario:** activar el **Developer tier** de Groq (agregar tarjeta) →
  10x límites + 25% descuento. No cambia el código.
- Modelo en código: se dejó en **8B** (rápido). Opción futura: 70B o híbrido.

---

## 🎯 Las 3 empresas objetivo + a quién contactar

| Empresa | Persona #1 (campeón) | Correo |
|---|---|---|
| 🦅 **Seguros Cóndor** | **Marianela Núñez** — Subg. Suscripción y Siniestros | mnunez@seguroscondor.com |
| 🛡️ **Hispana de Seguros** | **Jose Almeida** — VP Tecnología e Innovación | jalmeida@hispanadeseguros.com (verificar) |
| 🏢 **Equisuiza** (ex Equinoccial + Ecuatoriano Suiza) | **Juan Manuel Loaiza** — Dir. Procesos y PMO | jloaiza@equisuiza.com (verificar) |

- Patrón de correo Cóndor confirmado: **inicial + apellido @seguroscondor.com**.
- Equinoccial se fusionó con Ecuatoriano Suiza → ahora **Equisuiza**.
- ⚠️ Antes de demo a cualquiera que NO sea Cóndor → **resetear memoria**.
- Los correos listos para enviar están en `docs/CONTACTOS_Y_CORREOS.md`.

---

## 📄 Materiales de venta creados (en `docs/`)

- `PITCHES.md` — los 3 pitches + precios y condiciones.
- `PLAYBOOK_VENTA.md` — a quién/cómo contactar + guion general.
- `GUIA-01-SEGUROS-CONDOR.md` — guía a fondo (modo enseñanza).
- `GUIA-02-HISPANA-DE-SEGUROS.md` / `GUIA-03-SEGUROS-EQUINOCCIAL.md`.
- `GUIONES_REUNION.md` — guion del "buenos días" al "gracias", por empresa.
- `VIDEO_GUION.md` — narración del video-demo de 2 min.
- `presentacion.html` — presentación para la reunión (abrir en navegador).
- `MENSAJE_LINKEDIN.md` — mensajes humanos de LinkedIn.
- `CONTACTOS_Y_CORREOS.md` — contactos reales + correos listos.
- `PLAN_VERANO.md` — plan semana por semana (de cero al primer pitch).

---

## 🧑‍💻 Contexto del usuario
- Estudiante; ~2 meses de verano full para el proyecto (jun → mediados de agosto).
- Meta: hacer su **primer pitch** pronto (ideal en las primeras 2 semanas).

---

## ✅ Próximos pasos inmediatos
1. Rellenar nombre/teléfono/correo en los correos y **enviar el de Cóndor a
   Marianela Núñez** (mejor tiro).
2. Crear un correo limpio y profesional (`nombreapellido@gmail.com`) si hace falta.
3. Verificar correos/cargos (LinkedIn o central).
4. Probar la app con un Excel real antes de demostrar.
5. Llevar una lista de seguimiento (empresa · persona · estado · fecha).
6. (Cuando se decida) construir la **memoria en la nube** para volverla enterprise.

---

## 🌿 Estado del repo
- Rama de trabajo: `claude/greeting-vyntb`. Producción: `main` (Vercel).
- Todos los cambios técnicos están **publicados en `main`** (en vivo).
- URL: `cotizador-seguros-beta.vercel.app`.
