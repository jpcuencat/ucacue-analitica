import { createCanvas, loadImage } from "@napi-rs/canvas";

// Especificación de datos a graficar (misma forma que produce el frontend).
export type VizSpec = {
  titulo?: string;
  categorias?: string[];
  series?: { nombre: string; valores: number[] }[];
};

const COLORS = ["#2563eb", "#16a34a", "#f59e0b"]; // azul · verde · ámbar
const AXIS = "#475569";
const GRID = "#e2e8f0";
const TEXT = "#0f172a";

// Redondea hacia arriba a un tope "bonito" (1/2/5 × 10^n) para el eje Y.
function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

// Normaliza una imagen cualquiera (p.ej. la captura del gráfico del chat) al
// formato que WhatsApp espera en el header de plantilla: fondo BLANCO OPACO (la
// captura del navegador llega en RGBA con alfa) y proporción horizontal 1.91:1
// recomendada por Meta. La imagen se escala completa y se centra, sin recortar.
// Si algo falla, devuelve null para que el llamador use su respaldo.
export async function normalizarParaWhatsApp(png: Buffer | Uint8Array): Promise<Buffer | null> {
  try {
    const img = await loadImage(png);
    const W = 1200;
    const H = 628; // 1200/628 ≈ 1.91:1
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff"; // aplana el alfa
    ctx.fillRect(0, 0, W, H);
    const pad = 16;
    const escala = Math.min((W - pad * 2) / img.width, (H - pad * 2) / img.height);
    const w = img.width * escala;
    const h = img.height * escala;
    ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
    return canvas.toBuffer("image/png");
  } catch {
    return null;
  }
}

// Tarjeta de texto: imagen de respaldo cuando la respuesta no tiene gráfico
// (la plantilla de WhatsApp siempre necesita una imagen en el header).
// Quita el markdown inline: **negrita**, *cursiva*, `código`, encabezados y
// viñetas. En una imagen esos caracteres no aportan nada y ensucian el texto.
function sinMarkdown(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(^|\s)\*(\S(?:.*?\S)?)\*(?=\s|$)/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s*/, "")
    .replace(/^\s*[-*]\s+/, "• ")
    .trim();
}

const esFilaTabla = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const esSeparadorTabla = (l: string) => /^\s*\|[\s:|-]+\|\s*$/.test(l);
const celdas = (l: string) =>
  l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => sinMarkdown(c));

// Tarjeta de texto: imagen de respaldo cuando la respuesta no tiene gráfico.
// Las tablas markdown se dibujan como TABLA (no como texto con pipes), que es
// el caso típico de un desglose por carrera o facultad.
export function renderTextCardPNG(titulo: string, cuerpo: string): Buffer {
  const W = 1200;
  const H = 628; // 1.91:1, la proporción del header de plantilla de WhatsApp
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#2563eb";
  ctx.fillRect(0, 0, W, 8); // franja superior

  const pad = 48;
  const maxW = W - pad * 2;
  const limiteY = H - 34;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  ctx.fillStyle = TEXT;
  ctx.font = "bold 27px sans-serif";
  ctx.fillText(truncate(sinMarkdown(titulo), 58), pad, 34);
  let y = 88;

  // Agrupa las líneas en bloques: tabla (filas contiguas) o párrafo.
  const lineas = cuerpo.split("\n");
  type Bloque = { tipo: "tabla"; filas: string[][] } | { tipo: "texto"; texto: string };
  const bloques: Bloque[] = [];
  for (const raw of lineas) {
    if (esFilaTabla(raw)) {
      if (esSeparadorTabla(raw)) continue; // |---|---:| no se dibuja
      const ultimo = bloques[bloques.length - 1];
      if (ultimo?.tipo === "tabla") ultimo.filas.push(celdas(raw));
      else bloques.push({ tipo: "tabla", filas: [celdas(raw)] });
    } else {
      const t = sinMarkdown(raw);
      if (t) bloques.push({ tipo: "texto", texto: t });
    }
  }

  const cortado = () => {
    ctx.fillStyle = "#64748b";
    ctx.font = "italic 16px sans-serif";
    ctx.fillText("… (respuesta completa en el chat)", pad, Math.min(y, limiteY));
  };

  for (const b of bloques) {
    if (y > limiteY - 24) { cortado(); break; }

    if (b.tipo === "texto") {
      ctx.font = "17px sans-serif";
      ctx.fillStyle = "#1e293b";
      let linea = "";
      for (const palabra of b.texto.split(/\s+/)) {
        const probe = linea ? `${linea} ${palabra}` : palabra;
        if (ctx.measureText(probe).width > maxW && linea) {
          ctx.fillText(linea, pad, y);
          y += 25;
          linea = palabra;
          if (y > limiteY - 24) break;
        } else linea = probe;
      }
      if (linea && y <= limiteY - 24) { ctx.fillText(linea, pad, y); y += 25; }
      y += 6;
      continue;
    }

    // ── Tabla ──────────────────────────────────────────────────────────────
    const filas = b.filas;
    const nCols = Math.max(...filas.map((f) => f.length));
    ctx.font = "bold 16px sans-serif";
    const anchos = Array.from({ length: nCols }, (_, i) =>
      Math.max(...filas.map((f) => ctx.measureText(f[i] ?? "").width)) + 26,
    );
    // Si excede el ancho disponible, se reparte proporcionalmente.
    const total = anchos.reduce((a, b2) => a + b2, 0);
    if (total > maxW) {
      const k = maxW / total;
      for (let i = 0; i < anchos.length; i++) anchos[i] *= k;
    }
    const filaH = 30;

    filas.forEach((fila, idx) => {
      if (y > limiteY - filaH) return;
      const esCabecera = idx === 0;
      if (esCabecera) {
        ctx.fillStyle = "#eef2f7";
        ctx.fillRect(pad, y - 4, Math.min(total, maxW), filaH);
      }
      let x = pad;
      fila.forEach((c, i) => {
        ctx.fillStyle = esCabecera ? TEXT : "#1e293b";
        ctx.font = `${esCabecera ? "bold " : ""}16px sans-serif`;
        // Recorta la celda al ancho de su columna.
        let txt = c;
        while (txt && ctx.measureText(txt).width > anchos[i] - 18) txt = txt.slice(0, -1);
        if (txt !== c && txt.length > 1) txt = txt.slice(0, -1) + "…";
        ctx.fillText(txt, x + 9, y + 2);
        x += anchos[i];
      });
      y += filaH;
      ctx.strokeStyle = GRID;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad, y - 4);
      ctx.lineTo(pad + Math.min(total, maxW), y - 4);
      ctx.stroke();
    });
    y += 12;
    if (y > limiteY - 24) { cortado(); break; }
  }

  return canvas.toBuffer("image/png");
}

// Convierte a número una celda de tabla. Devuelve null si no es numérica o si
// es un porcentaje: mezclar 474 con 30.6% en un mismo eje sería engañoso.
function celdaNumerica(s: string): number | null {
  if (!s || s.includes("%")) return null;
  const t = s.replace(/[^\d-]/g, "");
  if (!t) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

// Extrae un VizSpec de la primera tabla markdown del texto. Se usa cuando la
// respuesta trae un desglose demasiado largo para dibujarlo como tabla.
export function specDesdeTablaMarkdown(texto: string): VizSpec | null {
  const filas: string[][] = [];
  for (const l of texto.split("\n")) {
    if (esFilaTabla(l)) {
      if (!esSeparadorTabla(l)) filas.push(celdas(l));
    } else if (filas.length > 1) break; // solo la primera tabla
  }
  if (filas.length < 3) return null; // cabecera + 2 filas como mínimo
  const cabecera = filas[0];
  const cuerpo = filas.slice(1).filter((f) => f.some((c) => c));
  const nCols = cabecera.length;

  // Cada columna es numérica, de porcentaje o de texto. Los porcentajes se
  // IGNORAN: no se grafican (otra escala) ni sirven como etiqueta.
  const numericas: number[] = [];
  const textuales: number[] = [];
  const umbral = Math.ceil(cuerpo.length * 0.7);
  for (let i = 0; i < nCols; i++) {
    const pct = cuerpo.filter((f) => (f[i] ?? "").includes("%")).length;
    if (pct >= umbral) continue; // columna de porcentaje → fuera
    const n = cuerpo.filter((f) => celdaNumerica(f[i] ?? "") !== null).length;
    if (n >= umbral) numericas.push(i);
    else textuales.push(i);
  }
  if (!numericas.length || !textuales.length) return null;

  // Las etiquetas juntan las columnas de texto. La primera suele venir vacía en
  // las filas siguientes (una sede que agrupa varias facultades): se arrastra.
  const arrastre: string[] = [];
  const categorias = cuerpo.map((f) => {
    const partes: string[] = [];
    textuales.forEach((c, idx) => {
      const v = (f[c] ?? "").trim();
      if (v) arrastre[idx] = v;
      if (arrastre[idx]) partes.push(arrastre[idx]);
    });
    return partes.join(" · ");
  });

  const series = numericas.slice(0, 2).map((c) => ({
    nombre: cabecera[c] || "Valor",
    valores: cuerpo.map((f) => celdaNumerica(f[c] ?? "") ?? 0),
  }));

  const ejeEtiqueta = cabecera[textuales[textuales.length - 1]] || "categoría";
  return { titulo: `${series[0].nombre} por ${ejeEtiqueta.toLowerCase()}`, categorias, series };
}

// Barras HORIZONTALES (1-2 series): la forma legible cuando las etiquetas son
// largas, como los nombres de facultad o carrera.
export function renderHBarChartPNG(spec: VizSpec): Buffer {
  const W = 1200;
  const H = 628;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  const series = (spec.series ?? []).slice(0, 2).filter((s) => s?.valores);
  let cats = (spec.categorias ?? []).map(String);
  if (!cats.length || !series.length) return renderTextCardPNG(spec.titulo ?? "Reporte", "Sin datos para graficar.");

  // Orden descendente por la primera serie y recorte a lo que cabe.
  const orden = cats.map((_, i) => i).sort((a, b) => (series[0].valores[b] ?? 0) - (series[0].valores[a] ?? 0));
  const MAX = 14;
  const total = cats.length;
  const usados = orden.slice(0, MAX);
  cats = usados.map((i) => cats[i]);
  const vals = series.map((s) => usados.map((i) => Number(s.valores[i]) || 0));

  ctx.fillStyle = TEXT;
  ctx.font = "bold 24px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(truncate(spec.titulo ?? "Desglose", 62), 40, 28);

  const mL = 430; // espacio para las etiquetas
  const mR = 96;
  const top = 78;
  const bottom = total > MAX ? 82 : 60; // eje + leyenda + nota, sin encimarse
  const plotW = W - mL - mR;
  const plotH = H - top - bottom;
  const maxV = Math.max(1, ...vals.flat());
  const niceMax = niceCeil(maxV);

  const filaH = plotH / cats.length;
  const barH = Math.min(18, (filaH - 6) / series.length);

  // Rejilla vertical + escala
  ctx.textAlign = "center";
  ctx.font = "12px sans-serif";
  for (let k = 0; k <= 4; k++) {
    const x = mL + (plotW * k) / 4;
    ctx.strokeStyle = GRID;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, top + plotH);
    ctx.stroke();
    ctx.fillStyle = AXIS;
    ctx.fillText(String(Math.round((niceMax * k) / 4)), x, top + plotH + 8);
  }

  cats.forEach((c, i) => {
    const yFila = top + i * filaH;
    // Etiqueta
    ctx.fillStyle = "#1e293b";
    ctx.font = "13px sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    let etq = c;
    while (etq && ctx.measureText(etq).width > mL - 52) etq = etq.slice(0, -1);
    if (etq !== c && etq.length > 1) etq = etq.slice(0, -1) + "…";
    ctx.fillText(etq, mL - 14, yFila + filaH / 2);
    // Barras
    series.forEach((_, s) => {
      const v = vals[s][i];
      const w = (Math.max(0, v) / niceMax) * plotW;
      const y = yFila + filaH / 2 - (series.length * barH) / 2 + s * barH;
      ctx.fillStyle = COLORS[s % COLORS.length];
      ctx.fillRect(mL, y, Math.max(1, w), Math.max(4, barH - 2));
      ctx.fillStyle = TEXT;
      ctx.font = "12px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(String(Math.round(v)), mL + w + 6, y + barH / 2 - 1);
    });
  });

  // Eje vertical
  ctx.strokeStyle = AXIS;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(mL, top);
  ctx.lineTo(mL, top + plotH);
  ctx.stroke();

  // Leyenda
  ctx.font = "13px sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  let lx = mL;
  const yLeg = H - (total > MAX ? 42 : 22);
  series.forEach((s, i) => {
    ctx.fillStyle = COLORS[i % COLORS.length];
    ctx.fillRect(lx, yLeg - 6, 12, 12);
    ctx.fillStyle = TEXT;
    const nombre = truncate(s.nombre, 26);
    ctx.fillText(nombre, lx + 18, yLeg);
    lx += 18 + ctx.measureText(nombre).width + 24;
  });

  // Nota honesta si se recortaron filas.
  if (total > MAX) {
    ctx.fillStyle = "#64748b";
    ctx.font = "italic 13px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`Top ${MAX} de ${total} — el detalle completo está en el chat`, 40, H - 16);
  }

  return canvas.toBuffer("image/png");
}

// Renderiza un gráfico de barras agrupadas (1-3 series) a PNG.
export function renderBarChartPNG(spec: VizSpec): Buffer {
  const W = 920;
  const H = 520;
  const cats = spec.categorias ?? [];
  const series = (spec.series ?? []).slice(0, 3).filter((s) => s && s.valores);

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // Fondo
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // Título
  ctx.fillStyle = TEXT;
  ctx.font = "bold 22px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(truncate(spec.titulo ?? "Reporte", 60), W / 2, 18);

  if (!cats.length || !series.length) {
    ctx.font = "16px sans-serif";
    ctx.fillStyle = AXIS;
    ctx.fillText("Sin datos para graficar", W / 2, H / 2);
    return canvas.toBuffer("image/png");
  }

  // Con muchas categorías o nombres largos, rotamos las etiquetas para que no
  // se encimen (típico en facultades). Si no, se dibujan horizontales.
  const rotarLabels = cats.length > 5 || cats.some((c) => c.length > 12);
  const mL = 70;
  const mR = 30;
  const plotTop = 64;
  const mB = rotarLabels ? 168 : 96; // etiquetas de categoría + leyenda
  const plotX0 = mL;
  const plotX1 = W - mR;
  const plotW = plotX1 - plotX0;
  const plotY1 = H - mB; // línea base
  const plotH = plotY1 - plotTop;

  // Escala
  const maxV = Math.max(1, ...series.flatMap((s) => s.valores.map((v) => (Number.isFinite(v) ? v : 0))));
  const niceMax = niceCeil(maxV);
  const STEPS = 4;

  // Grillas + etiquetas del eje Y
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.font = "12px sans-serif";
  for (let k = 0; k <= STEPS; k++) {
    const val = (niceMax * k) / STEPS;
    const y = plotY1 - (plotH * k) / STEPS;
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plotX0, y);
    ctx.lineTo(plotX1, y);
    ctx.stroke();
    ctx.fillStyle = AXIS;
    ctx.fillText(String(Math.round(val)), plotX0 - 8, y);
  }

  // Eje
  ctx.strokeStyle = AXIS;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(plotX0, plotTop);
  ctx.lineTo(plotX0, plotY1);
  ctx.lineTo(plotX1, plotY1);
  ctx.stroke();

  // Barras agrupadas
  const groupW = plotW / cats.length;
  const innerPad = groupW * 0.15;
  const barsW = groupW - innerPad * 2;
  const barW = barsW / series.length;

  ctx.textAlign = "center";
  for (let i = 0; i < cats.length; i++) {
    const gx = plotX0 + i * groupW + innerPad;
    for (let s = 0; s < series.length; s++) {
      const v = Number(series[s].valores[i]) || 0;
      const h = (Math.max(0, v) / niceMax) * plotH;
      const x = gx + s * barW;
      const y = plotY1 - h;
      ctx.fillStyle = COLORS[s % COLORS.length];
      ctx.fillRect(x + 1, y, Math.max(1, barW - 2), h);
      // Valor encima de la barra
      if (h > 0) {
        ctx.fillStyle = TEXT;
        ctx.font = "11px sans-serif";
        ctx.textBaseline = "bottom";
        ctx.fillText(String(Math.round(v)), x + barW / 2, y - 2);
      }
    }
    // Etiqueta de categoría
    ctx.fillStyle = AXIS;
    ctx.font = "12px sans-serif";
    const cx = plotX0 + i * groupW + groupW / 2;
    if (rotarLabels) {
      ctx.save();
      ctx.translate(cx, plotY1 + 10);
      ctx.rotate(-Math.PI / 5); // ~-36°
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(truncate(cats[i], 28), 0, 0);
      ctx.restore();
      ctx.textAlign = "center";
    } else {
      ctx.textBaseline = "top";
      ctx.fillText(truncate(cats[i], 16), cx, plotY1 + 8);
    }
  }

  // Leyenda (abajo, centrada)
  const legendY = H - 30;
  ctx.font = "13px sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  const items = series.map((s) => truncate(s.nombre, 24));
  const itemW = (nombre: string) => 18 + ctx.measureText(nombre).width + 22;
  const totalW = items.reduce((acc, n) => acc + itemW(n), 0);
  let lx = (W - totalW) / 2;
  for (let s = 0; s < series.length; s++) {
    ctx.fillStyle = COLORS[s % COLORS.length];
    ctx.fillRect(lx, legendY - 6, 12, 12);
    ctx.fillStyle = TEXT;
    ctx.fillText(items[s], lx + 18, legendY);
    lx += itemW(items[s]);
  }

  return canvas.toBuffer("image/png");
}
