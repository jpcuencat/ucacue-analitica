import { createCanvas } from "@napi-rs/canvas";

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
