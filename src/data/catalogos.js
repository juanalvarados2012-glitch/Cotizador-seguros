// ─── Catálogos de datos de Ecuador ───────────────────────────────────────────
// Marcas/modelos más vendidos en el mercado ecuatoriano, ciudades principales
// y tipos de licencia según la Ley Orgánica de Transporte Terrestre (LOTTTSV).

// Marcas y modelos comunes en Ecuador. La opción "Otro" siempre está
// disponible para no bloquear ninguna cotización.
export const MARCAS_MODELOS = {
  Chevrolet: ["Sail", "Onix", "Aveo", "Spark", "D-Max", "Tracker", "Captiva", "Otro"],
  Kia: ["Picanto", "Rio", "Soluto", "Sportage", "Seltos", "Sorento", "Otro"],
  Hyundai: ["Accent", "Grand i10", "Tucson", "Creta", "Santa Fe", "Otro"],
  Toyota: ["Yaris", "Corolla", "Hilux", "Fortuner", "RAV4", "Otro"],
  Nissan: ["Versa", "Sentra", "March", "Frontier", "Kicks", "X-Trail", "Otro"],
  Mazda: ["Mazda 2", "Mazda 3", "CX-30", "CX-5", "BT-50", "Otro"],
  Renault: ["Kwid", "Logan", "Sandero", "Duster", "Stepway", "Otro"],
  Suzuki: ["Swift", "Baleno", "Vitara", "Jimny", "S-Cross", "Otro"],
  Volkswagen: ["Gol", "Polo", "Virtus", "T-Cross", "Amarok", "Otro"],
  Ford: ["EcoSport", "Escape", "Explorer", "Ranger", "F-150", "Otro"],
  "Great Wall": ["Wingle", "Poer", "Haval H6", "Jolion", "Otro"],
  Chery: ["Arrizo", "Tiggo 2", "Tiggo 4", "Tiggo 7", "Otro"],
  JAC: ["S2", "S3", "S4", "T8", "Otro"],
  Otro: ["Otro"],
};

// Ciudades principales con su factor de riesgo (siniestralidad y robo).
// 1.00 = referencia nacional. Editable según la experiencia de cada compañía.
export const CIUDADES = [
  { nombre: "Quito", factor: 1.1 },
  { nombre: "Guayaquil", factor: 1.2 },
  { nombre: "Cuenca", factor: 1.0 },
  { nombre: "Santo Domingo", factor: 1.1 },
  { nombre: "Machala", factor: 1.1 },
  { nombre: "Durán", factor: 1.25 },
  { nombre: "Manta", factor: 1.1 },
  { nombre: "Portoviejo", factor: 1.05 },
  { nombre: "Loja", factor: 0.95 },
  { nombre: "Ambato", factor: 1.0 },
  { nombre: "Esmeraldas", factor: 1.15 },
  { nombre: "Quevedo", factor: 1.1 },
  { nombre: "Riobamba", factor: 0.95 },
  { nombre: "Milagro", factor: 1.1 },
  { nombre: "Ibarra", factor: 0.95 },
  { nombre: "Babahoyo", factor: 1.05 },
  { nombre: "Latacunga", factor: 0.95 },
  { nombre: "Otra ciudad", factor: 1.0 },
];

// Tipos de licencia de conducir en Ecuador (Agencia Nacional de Tránsito).
export const LICENCIAS = [
  { tipo: "A", descripcion: "A · Motocicletas y similares", profesional: false },
  { tipo: "B", descripcion: "B · Vehículos particulares (autos y camionetas)", profesional: false },
  { tipo: "C", descripcion: "C · Profesional: taxis y vehículos livianos", profesional: true },
  { tipo: "D", descripcion: "D · Profesional: buses y transporte de pasajeros", profesional: true },
  { tipo: "E", descripcion: "E · Profesional: camiones y carga pesada", profesional: true },
];

// Tipos de uso del vehículo.
export const USOS = [
  { id: "particular", nombre: "Particular", descripcion: "Uso personal y familiar" },
  { id: "comercial", nombre: "Comercial", descripcion: "Trabajo, reparto o flota liviana" },
  { id: "transporte", nombre: "Transporte", descripcion: "Taxi, pasajeros o carga" },
];

// Rango de años disponible para el formulario de vehículo.
export function aniosDisponibles(antiguedadMaxima = 20) {
  const actual = new Date().getFullYear();
  const anios = [];
  // Se incluye el año siguiente porque los concesionarios venden el "año modelo"
  // siguiente desde mitad de año.
  for (let a = actual + 1; a >= actual - antiguedadMaxima; a--) anios.push(a);
  return anios;
}
