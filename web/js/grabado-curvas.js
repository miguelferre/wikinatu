// Curvas de nivel vectoriales. Sin hachuras: Miguel prefiere un relieve limpio (2026-11-05)..
// Más pendiente, trazo más grueso y filas más juntas, como en la cartografía de grabado.

import { UMBRAL_MAR } from './grabado.js';

// Recorre el modelo por celdas y entrega cada tramo de curva en píxeles del modelo.
function marchar(dem, g, intervalo, alTramo) {
  const { W, datos, ax, ay, ancho, alto } = dem;
  const x0 = Math.floor(ax), y0 = Math.floor(ay);
  const nx = Math.floor((ancho - 1) / g), ny = Math.floor((alto - 1) / g);
  const v = (i, j) => datos[(y0 + j * g) * W + x0 + i * g];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = v(i, j), b = v(i + 1, j), c = v(i + 1, j + 1), d = v(i, j + 1);
      const lo = Math.min(a, b, c, d), hi = Math.max(a, b, c, d);
      if (hi - lo < 1e-6 || hi <= UMBRAL_MAR) continue;
      const n0 = Math.ceil(lo / intervalo), n1 = Math.floor(hi / intervalo);
      for (let n = n0; n <= n1; n++) {
        const L = n * intervalo;
        if (L <= 0) continue;
        const px = [];
        if ((a < L) !== (b < L)) px.push(i + (L - a) / (b - a), j);
        if ((b < L) !== (c < L)) px.push(i + 1, j + (L - b) / (c - b));
        if ((d < L) !== (c < L)) px.push(i + (L - d) / (c - d), j + 1);
        if ((a < L) !== (d < L)) px.push(i, j + (L - a) / (d - a));
        if (px.length >= 4) alTramo(n, px[0] * g, px[1] * g, px[2] * g, px[3] * g);
        if (px.length === 8) alTramo(n, px[4] * g, px[5] * g, px[6] * g, px[7] * g);
      }
    }
  }
}

export function grabarCurvas(canvas, dem, { curvas, escala, unidad, intervalo, cota }) {
  const ctx = canvas.getContext('2d');
  const { W, datos, ax, ay, metrosPx, ancho, alto } = dem;
  const altura = (x, y) => datos[Math.floor(Math.min(alto - 1, Math.max(0, y)) + ay) * W + Math.floor(Math.min(ancho - 1, Math.max(0, x)) + ax)];
  const g = ancho > 1600 ? 2 : 1;
  const s = escala;

  ctx.save();
  // Curvas: finas y maestras. Las maestras llevan su cota.
  const finas = new Path2D(), maestras = new Path2D();
  const rotulos = [];
  const ocupado = new Set();
  const celda = 210 * unidad;
  const carro2 = new Map();
  const margen = 34 * unidad;
  marchar(dem, g, intervalo, (n, x1, y1, x2, y2) => {
    const c = n % 5 === 0 ? maestras : finas;
    c.moveTo(x1 * s, y1 * s);
    c.lineTo(x2 * s, y2 * s);
    if (n % 5 !== 0 || !cota) return;
    const acum = (carro2.get(n) || 0) + Math.hypot(x2 - x1, y2 - y1) * s;
    carro2.set(n, acum);
    if (acum < 320 * unidad) return;
    const x = ((x1 + x2) / 2) * s, y = ((y1 + y2) / 2) * s;
    if (x < margen || y < margen || x > canvas.width - margen || y > canvas.height - margen) return;
    const k = `${Math.floor(x / celda)},${Math.floor(y / celda)}`;
    if (ocupado.has(k)) return;
    ocupado.add(k);
    carro2.set(n, 0);
    let a = Math.atan2(y2 - y1, x2 - x1);
    if (a > Math.PI / 2) a -= Math.PI; else if (a < -Math.PI / 2) a += Math.PI;
    rotulos.push({ x, y, a, texto: String(n * intervalo) });
  });
  ctx.lineJoin = 'round';
  ctx.strokeStyle = curvas.fina;
  ctx.lineWidth = 0.55 * unidad;
  ctx.stroke(finas);
  ctx.strokeStyle = curvas.maestra;
  ctx.lineWidth = 0.8 * unidad;
  ctx.stroke(maestras);

  ctx.font = `italic 400 ${11.5 * unidad}px Barlow, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const r of rotulos) {
    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.rotate(r.a);
    ctx.lineWidth = 3.4 * unidad;
    ctx.strokeStyle = curvas.halo;
    ctx.strokeText(r.texto, 0, 0);
    ctx.fillStyle = curvas.cota;
    ctx.fillText(r.texto, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}
