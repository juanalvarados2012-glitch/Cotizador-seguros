// ─── Configuración white-label por defecto ───────────────────────────────────
// TODO lo que una aseguradora quiera personalizar vive aquí: marca, colores,
// tarifas y coberturas. El Panel de Configuración (#/admin) edita una copia
// de este objeto en localStorage, así que NUNCA hace falta tocar código para
// adaptar la herramienta a un nuevo cliente.
//
// Para entregar el producto pre-configurado a un cliente, basta con editar
// este archivo (o importar un JSON desde el panel) y volver a hacer build.

export const CONFIG_VERSION = 1;

export const defaultConfig = {
  version: CONFIG_VERSION,

  // ── Identidad de la aseguradora ────────────────────────────────────────────
  empresa: {
    nombre: "Su Aseguradora S.A.",
    eslogan: "Protegemos lo que más valoras",
    // Logo en base64 (data URL) o URL absoluta. Se sube desde el panel admin.
    logo: "",
    telefono: "(02) 234-5678",
    whatsapp: "+593 99 123 4567",
    email: "cotizaciones@suaseguradora.com.ec",
    direccion: "Av. Amazonas y Naciones Unidas, Quito - Ecuador",
    // Registro ante el ente de control (obligatorio mostrarlo en la cotización)
    registroSuperintendencia: "Resolución SCVS-XXX-XXXX",
  },

  // ── Tema visual (colores corporativos) ─────────────────────────────────────
  // Colores neutros corporativos por defecto; cada aseguradora pone los suyos.
  tema: {
    colorPrimario: "#1B2A4A", // azul corporativo profundo
    colorAcento: "#C8963E", // dorado sobrio
    colorFondo: "#F5F6F8",
  },

  // ── Parámetros del motor de cotización ─────────────────────────────────────
  tarifas: {
    // Tasa anual sobre el valor asegurado, por plan (en %).
    // Rango típico del mercado ecuatoriano: 3% a 6% del valor del vehículo.
    tasaBasica: 3.2,
    tasaEstandar: 4.3,
    tasaPremium: 5.6,

    // Prima neta mínima anual (USD). Ninguna cotización baja de este piso.
    primaMinima: 250,

    // Recargo por pago mensual (financiamiento de la prima, en %).
    recargoMensual: 5,

    // Límites de aceptación del riesgo.
    valorMinimoVehiculo: 5000,
    valorMaximoVehiculo: 150000,
    antiguedadMaxima: 20, // años; vehículos más antiguos no se cotizan en línea
    edadMinima: 18,
    edadMaxima: 80,

    // ── Factores de riesgo (multiplicadores sobre la prima base) ────────────
    // 1.00 = neutro · >1 recargo · <1 descuento. Editables desde el panel.
    factores: {
      // Edad del conductor
      edad: {
        menor25: 1.3, // conductores jóvenes: mayor frecuencia de siniestros
        de25a29: 1.15,
        de30a64: 1.0, // tramo de referencia
        mayor64: 1.2,
      },
      // Tipo de uso del vehículo
      uso: {
        particular: 1.0,
        comercial: 1.25, // reparto, trabajo, flotas livianas
        transporte: 1.45, // taxi, transporte de pasajeros o carga
      },
      // Antigüedad del vehículo (año actual - año del vehículo)
      antiguedad: {
        de0a3: 1.0,
        de4a7: 1.1,
        de8a12: 1.25,
        mayor12: 1.4,
      },
      // Siniestros declarados en los últimos 3 años
      siniestros: {
        cero: 0.95, // descuento por buen historial
        uno: 1.1,
        dos: 1.3,
        tresOMas: 1.6,
      },
      // Licencia profesional (C, D, E) conduce con más horas de experiencia
      licenciaProfesional: 0.95,
      // Conducir transporte/comercial SIN licencia profesional es riesgo agravado
      licenciaNoProfesionalUsoComercial: 1.2,
    },

    // ── Recargos legales de Ecuador (sobre la prima neta) ───────────────────
    // Valores vigentes de mercado; ajustables si la normativa cambia.
    legales: {
      contribucionSuperintendencia: 3.5, // % · Superintendencia de Compañías, Valores y Seguros
      seguroCampesino: 0.5, // % · aporte al Seguro Social Campesino
      iva: 15, // % · IVA vigente en Ecuador
      // Derechos de emisión de la póliza según rango de prima (tabla de mercado)
      derechosEmision: [
        { hasta: 250, valor: 0.5 },
        { hasta: 500, valor: 1.0 },
        { hasta: 1000, valor: 3.0 },
        { hasta: 2000, valor: 5.0 },
        { hasta: 4000, valor: 7.0 },
        { hasta: Infinity, valor: 9.0 },
      ],
    },

    // Deducible por plan: % del valor del siniestro con un mínimo en USD.
    deducibles: {
      basico: { porcentaje: 10, minimo: 300 },
      estandar: { porcentaje: 8, minimo: 250 },
      premium: { porcentaje: 6, minimo: 200 },
    },
  },

  // ── Coberturas por plan (se muestran en resultados y en el PDF) ───────────
  coberturas: {
    basico: [
      "Responsabilidad civil hasta $25.000",
      "Pérdida total por choque o volcadura",
      "Pérdida total por robo",
      "Asistencia legal básica",
    ],
    estandar: [
      "Responsabilidad civil hasta $50.000",
      "Pérdida total y parcial por choque",
      "Robo total y parcial",
      "Grúa y asistencia vial 24/7",
      "Auto sustituto (7 días)",
      "Asistencia legal completa",
    ],
    premium: [
      "Responsabilidad civil hasta $100.000",
      "Cobertura total: choque, robo, incendio y fenómenos naturales",
      "Grúa y asistencia vial 24/7 a nivel nacional",
      "Auto sustituto (15 días)",
      "Accidentes personales para ocupantes ($5.000 por persona)",
      "Gastos médicos y ambulancia",
      "Asistencia legal y gestoría completa",
    ],
  },

  // ── Texto legal que aparece al pie de la cotización y del PDF ──────────────
  textoLegal:
    "Cotización referencial sujeta a inspección del vehículo y políticas de " +
    "suscripción de la compañía. Vigencia: 15 días calendario. Valores en " +
    "dólares de los Estados Unidos de América (USD), moneda de curso legal en " +
    "Ecuador. Esta compañía está controlada por la Superintendencia de " +
    "Compañías, Valores y Seguros del Ecuador. El SPPAT (accidentes de " +
    "tránsito) es un pago público independiente y no está incluido.",
};
