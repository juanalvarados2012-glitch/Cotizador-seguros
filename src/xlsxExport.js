// ─── Exportación de alta fidelidad (preserva el formato del Excel del broker) ──
// La librería `xlsx` (community) NO escribe estilos de celda al guardar: si
// regeneramos el archivo, se pierden colores, bordes, fuentes y se rompen las
// celdas que apuntaban a esos estilos. La forma robusta de devolver el MISMO
// archivo del broker con las respuestas puestas es no regenerarlo: un .xlsx es
// un ZIP de XML, así que editamos quirúrgicamente SOLO las celdas de respuesta
// dentro del XML de cada hoja y dejamos intacto todo lo demás (estilos, celdas
// combinadas, fórmulas, validaciones, imágenes…).
//
// La hoja resumen ("✓ Respuestas") se agrega como una hoja nueva registrándola
// en workbook.xml, sus rels y [Content_Types].xml.
//
// Si cualquier paso falla, el llamador hace fallback al método clásico de xlsx,
// de modo que exportar nunca se rompe.

import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";

const SUMMARY_PATH = "xl/worksheets/sheet_cotz_resumen.xml";

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function unescapeXml(s) {
  return String(s)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export function colToNum(letters) {
  let n = 0;
  for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
  return n;
}

export function numToCol(n) {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// Construye el XML de una celda inline-string preservando el índice de estilo `s`.
function inlineCell(addr, value, styleAttr) {
  return `<c r="${addr}"${styleAttr} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

// Extrae el atributo s="N" (índice de estilo) de un fragmento de celda, si existe.
function styleAttrOf(cellXml) {
  const m = cellXml.match(/\ss="(\d+)"/);
  return m ? ` s="${m[1]}"` : "";
}

// Aplica un mapa de ediciones { "B2": "valor", … } al XML de una hoja.
// Solo toca <sheetData>; el resto del XML queda byte a byte igual.
export function applyEditsToSheet(xml, edits) {
  const open = xml.match(/<sheetData\b[^>]*>/);
  // <sheetData/> vacío: lo convertimos en bloque abierto para poder insertar filas.
  if (!open) {
    const selfClose = xml.match(/<sheetData\b[^>]*\/>/);
    if (!selfClose) return xml;
    xml = xml.replace(selfClose[0], "<sheetData></sheetData>");
    return applyEditsToSheet(xml, edits);
  }
  const startInner = open.index + open[0].length;
  const endInner = xml.indexOf("</sheetData>", startInner);
  if (endInner < 0) return xml;
  let inner = xml.slice(startInner, endInner);

  // Agrupa ediciones por número de fila.
  const byRow = new Map();
  for (const [addr, val] of edits) {
    const m = addr.match(/^([A-Z]+)(\d+)$/);
    if (!m) continue;
    const row = +m[2];
    if (!byRow.has(row)) byRow.set(row, []);
    byRow.get(row).push({ addr, col: m[1], colNum: colToNum(m[1]), val });
  }

  // Parsea las filas existentes en orden.
  const rowRe = /<row\b([^>]*?)\/>|<row\b([^>]*?)>([\s\S]*?)<\/row>/g;
  const rows = [];
  let mm;
  while ((mm = rowRe.exec(inner))) {
    const attrs = mm[1] != null ? mm[1] : mm[2];
    const body = mm[1] != null ? "" : mm[3];
    const rNum = (attrs.match(/\br="(\d+)"/) || [])[1];
    rows.push({ rNum: rNum ? +rNum : null, attrs, body });
  }

  const rowMap = new Map();
  for (const r of rows) if (r.rNum != null) rowMap.set(r.rNum, r);

  for (const [rowNum, cells] of byRow) {
    let row = rowMap.get(rowNum);
    if (!row) {
      row = { rNum: rowNum, attrs: ` r="${rowNum}"`, body: "" };
      rowMap.set(rowNum, row);
      rows.push(row);
    }
    for (const { addr, colNum, val } of cells) {
      // ¿Existe la celda en la fila? (con o sin cuerpo / auto-cerrada)
      const cellRe = new RegExp(`<c\\b[^>]*\\br="${addr}"[^>]*(?:/>|>[\\s\\S]*?</c>)`);
      const existing = row.body.match(cellRe);
      if (existing) {
        row.body = row.body.replace(existing[0], inlineCell(addr, val, styleAttrOf(existing[0])));
      } else {
        // Insertar respetando el orden ascendente por columna.
        const newCell = inlineCell(addr, val, "");
        const allCells = [...row.body.matchAll(/<c\b[^>]*\br="([A-Z]+)\d+"[^>]*(?:\/>|>[\s\S]*?<\/c>)/g)];
        let insertAt = row.body.length;
        for (const c of allCells) {
          if (colToNum(c[1]) > colNum) { insertAt = c.index; break; }
        }
        row.body = row.body.slice(0, insertAt) + newCell + row.body.slice(insertAt);
      }
    }
  }

  // Reensambla las filas en orden ascendente.
  rows.sort((a, b) => (a.rNum || 0) - (b.rNum || 0));
  inner = rows.map((r) => `<row${r.attrs}>${r.body}</row>`).join("");

  let out = xml.slice(0, open.index) + open[0] + inner + xml.slice(endInner);

  // Amplía <dimension> si las ediciones caen fuera (evita avisos de Excel).
  out = out.replace(/<dimension ref="([A-Z]+\d+)(?::([A-Z]+\d+))?"\/>/, (full, a, b) => {
    const end = b || a;
    const em = end.match(/^([A-Z]+)(\d+)$/);
    if (!em) return full;
    let maxC = colToNum(em[1]);
    let maxR = +em[2];
    for (const [addr] of edits) {
      const m = addr.match(/^([A-Z]+)(\d+)$/);
      if (!m) continue;
      maxC = Math.max(maxC, colToNum(m[1]));
      maxR = Math.max(maxR, +m[2]);
    }
    return `<dimension ref="${a}:${numToCol(maxC)}${maxR}"/>`;
  });

  return out;
}

// Mapea nombre de hoja → ruta del XML dentro del zip (vía workbook.xml + rels).
function sheetPathMap(files) {
  const wbXml = strFromU8(files["xl/workbook.xml"]);
  const relsXml = strFromU8(files["xl/_rels/workbook.xml.rels"]);
  const relById = {};
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/g)) {
    relById[m[1]] = m[2];
  }
  const map = {};
  for (const m of wbXml.matchAll(/<sheet\b[^>]*\/>/g)) {
    const tag = m[0];
    const rawName = (tag.match(/name="([^"]*)"/) || [])[1];
    const name = rawName == null ? null : unescapeXml(rawName);
    const rid = (tag.match(/r:id="([^"]+)"/) || [])[1];
    if (name == null || !rid || !relById[rid]) continue;
    let target = relById[rid].replace(/^\//, "");
    if (!target.startsWith("xl/")) target = "xl/" + target;
    map[name] = target;
  }
  return map;
}

// Genera el XML de la hoja resumen a partir de un array-de-arrays.
function buildSummarySheet(aoa, { cols = [], merges = [], autofilter = "" }) {
  const colsXml = cols.length
    ? `<cols>${cols
        .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
        .join("")}</cols>`
    : "";
  const rowsXml = aoa
    .map((row, ri) => {
      const r = ri + 1;
      const cells = (row || [])
        .map((val, ci) => {
          if (val == null || val === "") return "";
          const addr = `${numToCol(ci + 1)}${r}`;
          if (typeof val === "number") return `<c r="${addr}"><v>${val}</v></c>`;
          return inlineCell(addr, val, "");
        })
        .join("");
      return `<row r="${r}">${cells}</row>`;
    })
    .join("");
  const mergesXml = merges.length
    ? `<mergeCells count="${merges.length}">${merges.map((ref) => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells>`
    : "";
  const afXml = autofilter ? `<autoFilter ref="${autofilter}"/>` : "";
  // Orden de elementos según el esquema: cols → sheetData → autoFilter → mergeCells.
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `${colsXml}<sheetData>${rowsXml}</sheetData>${afXml}${mergesXml}</worksheet>`
  );
}

// Registra la hoja resumen en workbook.xml, sus rels y [Content_Types].xml.
function registerSummary(files, sheetName) {
  // 1) rels: nuevo Id único.
  const relsKey = "xl/_rels/workbook.xml.rels";
  let rels = strFromU8(files[relsKey]);
  let maxRid = 0;
  for (const m of rels.matchAll(/Id="rId(\d+)"/g)) maxRid = Math.max(maxRid, +m[1]);
  const newRid = `rId${maxRid + 1}`;
  rels = rels.replace(
    "</Relationships>",
    `<Relationship Id="${newRid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/${SUMMARY_PATH.split("/").pop()}"/></Relationships>`
  );
  files[relsKey] = strToU8(rels);

  // 2) workbook.xml: nuevo sheetId único + referencia r:id.
  const wbKey = "xl/workbook.xml";
  let wb = strFromU8(files[wbKey]);
  let maxSid = 0;
  for (const m of wb.matchAll(/sheetId="(\d+)"/g)) maxSid = Math.max(maxSid, +m[1]);
  const sheetTag = `<sheet name="${escapeXml(sheetName)}" sheetId="${maxSid + 1}" r:id="${newRid}"/>`;
  wb = wb.replace("</sheets>", `${sheetTag}</sheets>`);
  files[wbKey] = strToU8(wb);

  // 3) [Content_Types].xml: Override para la hoja nueva.
  const ctKey = "[Content_Types].xml";
  let ct = strFromU8(files[ctKey]);
  ct = ct.replace(
    "</Types>",
    `<Override PartName="/${SUMMARY_PATH}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`
  );
  files[ctKey] = strToU8(ct);
}

// API principal. Devuelve un Uint8Array (.xlsx) o lanza si el archivo no es apto.
//   originalBytes : ArrayBuffer/Uint8Array del archivo ORIGINAL del broker
//   editsBySheet  : { [nombreHoja]: Map<addr, valor> }  respuestas a escribir
//   summary       : { name, aoa, cols, merges, autofilter } | null
export function exportPreservingFormat(originalBytes, editsBySheet, summary) {
  const files = unzipSync(new Uint8Array(originalBytes));
  if (!files["xl/workbook.xml"] || !files["xl/_rels/workbook.xml.rels"]) {
    throw new Error("No es un .xlsx OOXML estándar");
  }
  const paths = sheetPathMap(files);

  for (const [sheetName, edits] of Object.entries(editsBySheet)) {
    if (!edits || edits.size === 0) continue;
    const path = paths[sheetName];
    if (!path || !files[path]) continue; // hoja sin XML (raro): se omite
    const xml = strFromU8(files[path]);
    files[path] = strToU8(applyEditsToSheet(xml, edits));
  }

  if (summary && summary.aoa && summary.aoa.length) {
    files[SUMMARY_PATH] = strToU8(buildSummarySheet(summary.aoa, summary));
    registerSummary(files, summary.name);
  }

  return zipSync(files, { level: 6 });
}
