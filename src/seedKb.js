// ─── Base de conocimiento semilla (genérica de ramos generales) ───────────────
// Base ILUSTRATIVA con coberturas estándar del mercado y respuestas neutras, solo
// para que la app funcione en la demo. NO contiene el criterio de ninguna
// aseguradora en particular: cada cliente afina su propio criterio durante el uso
// (la memoria aprende de sus correcciones). Las respuestas reales —límites,
// deducibles, exclusiones— las define el suscriptor de cada compañía.

import { normalize } from "./cloudSync";

export const SEED_KB = [
  { cobertura: "Incendio y/o rayo y/o humo", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "HMACC AMIT Huelga Motín Asonada Conmoción Civil Actos Malintencionados de Terceros", respuesta: "Sujeto a evaluación del suscriptor" },
  { cobertura: "Terremoto tsunami temblor erupción volcánica maremoto convulsión de la naturaleza", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "Tifón huracán tornado ciclón granizada perturbación atmosférica", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "Lluvia e Inundación", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "Explosión", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "Daños por agua", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "Colapso", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "Desprendimiento de tierra o rocas alud", respuesta: "Sujeto a evaluación del suscriptor" },
  { cobertura: "Daños por fuego subterráneo", respuesta: "Sujeto a evaluación del suscriptor" },
  { cobertura: "Choque con un vehículo terrestre o animal", respuesta: "Sujeto a evaluación del suscriptor" },
  { cobertura: "Contaminación de producto", respuesta: "Sujeto a evaluación del suscriptor" },
  { cobertura: "Todo riesgo de rotura de maquinaria", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "Lucro cesante por interrupción del negocio incendio", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "Robo y/o Asalto a primer riesgo absoluto", respuesta: "Cubierto a primer riesgo (límite a definir)" },
  { cobertura: "Remoción de escombros", respuesta: "Cubierto (sublímite a definir)" },
  { cobertura: "Honorarios de Profesionales gastos de viaje y estadía", respuesta: "Cubierto (sublímite a definir)" },
  { cobertura: "Documentos y modelos", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "Rotura de vidrios y cristales", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "Gastos de extinción de incendio", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "Gastos para aminorar la pérdida", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "Terrorismo y Sabotaje", respuesta: "Sujeto a evaluación del suscriptor" },
  { cobertura: "Combustión espontánea", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "Arrendamientos alquiler", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "Extintores y Otros Medios de Extinción", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "Refrigeración", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "Suspensión de los servicios de energía eléctrica agua o gas", respuesta: "Sujeto a evaluación del suscriptor" },
  { cobertura: "Hurto excepto Mercaderías y Dinero", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "Gastos por Anulación y Duplicación de Documentos", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "Saqueo", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "Ajustadores", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "Cláusula de Cobertura de Alteraciones y Reparaciones", respuesta: "Cubierto (sublímite a definir)" },
  { cobertura: "Amparo automático nuevos predios propiedades y activos", respuesta: "Cubierto (plazo y límite a definir)" },
  { cobertura: "Autoridad civil", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "Avisos y letreros", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "Bienes a la intemperie", respuesta: "Sujeto a evaluación del suscriptor" },
  { cobertura: "Bienes del asegurado bajo responsabilidad de terceros", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "Equipos móviles y portátiles", respuesta: "Cubierto mediante endoso (a definir)" },
  { cobertura: "Obras civiles en curso", respuesta: "Sujeto a evaluación del suscriptor" },
  { cobertura: "Propiedad Horizontal", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "Reposición o reemplazo ramos técnicos", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "Restitución Automática del Valor Asegurado", respuesta: "Sujeto a evaluación del suscriptor" },
  { cobertura: "Salvamento", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "Equipo Electrónico Todo riesgo", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "Responsabilidad Civil frente a terceros", respuesta: "Cubierto (límite a definir)" },
  { cobertura: "Transporte de mercadería", respuesta: "Sujeto a evaluación del suscriptor" },
  // Deducibles (genéricos: el valor real lo define cada aseguradora)
  { cobertura: "Deducible terremoto lluvia inundación colapso eventos naturaleza", respuesta: "Según tabla de deducibles de la póliza" },
  { cobertura: "Deducible otros eventos caída accidental", respuesta: "Según tabla de deducibles de la póliza" },
  { cobertura: "Deducible vidrios", respuesta: "Según tabla de deducibles de la póliza" },
  { cobertura: "Deducible robo asalto", respuesta: "Según tabla de deducibles de la póliza" },
  { cobertura: "Deducible hurto", respuesta: "Según tabla de deducibles de la póliza" },
  { cobertura: "Deducible rotura de maquinaria", respuesta: "Según tabla de deducibles de la póliza" },
  { cobertura: "Deducible equipo electrónico", respuesta: "Según tabla de deducibles de la póliza" },
  { cobertura: "Deducible responsabilidad civil", respuesta: "Según tabla de deducibles de la póliza" },
].map((k) => ({ ...k, count: 1 }));

// Coberturas de la base semilla (normalizadas): sirven para distinguir en el
// panel de memoria lo que vino "de fábrica" de lo aprendido durante el uso.
export const SEED_SET = new Set(SEED_KB.map((k) => normalize(k.cobertura)));
