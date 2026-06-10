# 🚗 Auto Cotizador White-Label · Seguros vehiculares para Ecuador

Cotizador de seguros de auto **100% client-side** (React + Vite, sin backend) que una
aseguradora o broker embebe en su sitio web o usa internamente. Todo —logo, colores,
nombre, tarifas y coberturas— se personaliza desde un panel, **sin tocar código**.

> Modelo de negocio sugerido: **$300–$800 de implementación + $99/mes** por empresa cliente.

## Rutas de la app

| Ruta | Para quién | Qué hace |
|---|---|---|
| `#/` | La aseguradora (prospecto) | Landing B2B de ventas del producto |
| `#/demo` | La aseguradora (prospecto) | Formulario de solicitud de demo (guarda el lead) |
| `#/cotizador` | El cliente final | Wizard de cotización en 3 pasos |
| `#/cotizador?embed=1` | El cliente final | Igual, sin cabecera/pie — para `<iframe>` |
| `#/historial` | Cliente final / asesor | Cotizaciones anteriores (localStorage) |
| `#/admin` | La aseguradora | Panel de configuración white-label |

## Instalación y uso

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # build de producción en dist/ (servible desde cualquier carpeta/CDN)
```

## Estructura de archivos

```
src/
├── main.jsx                    # punto de entrada
├── App.jsx                     # enrutado por hash + layout (cabecera/pie)
├── styles.css                  # estilos mobile-first; tema vía variables CSS
├── config/
│   └── defaultConfig.js        # ★ configuración white-label por defecto
├── context/
│   └── ConfigContext.jsx       # distribuye la config y aplica el tema en vivo
├── data/
│   └── catalogos.js            # marcas/modelos, ciudades, licencias de Ecuador
├── motor/
│   └── cotizador.js            # ★ motor de cálculo de primas (documentado)
├── utils/
│   ├── storage.js              # localStorage: config, historial, leads
│   └── pdf.js                  # PDF de la cotización con jsPDF
└── components/
    ├── Landing.jsx             # landing B2B de ventas
    ├── DemoForm.jsx            # captura de leads
    ├── Cotizador.jsx           # wizard de 3 pasos
    ├── FormVehiculo.jsx        # paso 1
    ├── FormConductor.jsx       # paso 2
    ├── Resultados.jsx          # paso 3: los 3 planes + desglose
    ├── Historial.jsx           # cotizaciones guardadas
    └── PanelAdmin.jsx          # panel de configuración white-label
```

## Lógica de cálculo de primas

Por cada plan (Básico 3.2% · Estándar 4.3% · Premium 5.6%, configurables):

```
prima neta = valor asegurado × tasa del plan × Π(factores de riesgo)
             (con piso de prima mínima, $250 por defecto)

factores de riesgo (multiplicativos, configurables):
  edad         <25: ×1.30 · 25–29: ×1.15 · 30–64: ×1.00 · 65+: ×1.20
  ciudad       Guayaquil ×1.20 · Quito ×1.10 · Durán ×1.25 · Loja ×0.95 …
  uso          particular ×1.00 · comercial ×1.25 · transporte ×1.45
  antigüedad   0–3 años ×1.00 · 4–7 ×1.10 · 8–12 ×1.25 · >12 ×1.40
  siniestros   0: ×0.95 (descuento) · 1: ×1.10 · 2: ×1.30 · 3+: ×1.60
  licencia     profesional (C/D/E): ×0.95 · no profesional en uso
               comercial/transporte: ×1.20

recargos legales de Ecuador (sobre la prima neta):
  + 3.5%  contribución Superintendencia de Compañías, Valores y Seguros
  + 0.5%  aporte al Seguro Social Campesino
  + derechos de emisión (tabla por rango de prima: $0.50 a $9.00)
  ────────────────
  = subtotal
  + 15% IVA
  ────────────────
  = PRIMA TOTAL ANUAL (USD)

cuota mensual = total × 1.05 (recargo de financiamiento) / 12
```

Cada cotización se "firma" con un número único (`COT-AAAA-XXXXX`) y un código de
verificación (hash del contenido) que aparece en pantalla y en el PDF.

## Personalización por cliente (white-label)

1. Abre `#/admin` → cambia nombre, eslogan, logo, colores, contacto, registro SCVS,
   tasas, factores, límites y coberturas. Todo se guarda en `localStorage` y se aplica en vivo.
2. **Exporta la configuración como JSON** desde el panel para respaldarla o clonarla.
3. Para entregar el producto pre-configurado: pega el JSON exportado como valores en
   `src/config/defaultConfig.js` y haz `npm run build`. Un repo, N clientes.

## Embeber en el sitio de la aseguradora

```html
<iframe src="https://cotizador.suaseguradora.com.ec/#/cotizador?embed=1"
        style="width:100%;min-height:900px;border:0"
        title="Cotizador de seguros"></iframe>
```

## Cumplimiento (Ecuador)

- Moneda: dólares de los EE. UU. (USD), moneda oficial del Ecuador.
- Desglose con contribución SCVS (3.5%), Seguro Social Campesino (0.5%), derechos de
  emisión e IVA vigente (15%) — todos editables si la normativa cambia.
- Tipos de licencia A/B/C/D/E según la Agencia Nacional de Tránsito.
- El texto legal y el registro ante la Superintendencia de Compañías, Valores y
  Seguros aparecen en cada cotización y en el PDF. La cotización es referencial; la
  emisión de la póliza sigue el proceso de suscripción de cada compañía.

## Stack

React 18 · Vite · jsPDF · localStorage — **sin backend ni claves de API**.

## Material de ventas

El guión de 1 página para presentar el producto a aseguradoras está en
[`docs/GUION_VENTAS_COTIZADOR.md`](docs/GUION_VENTAS_COTIZADOR.md).
