// Acabado de plancha sobre el relieve de terrain.js: normales de costa y grano.
// Trabaja sobre el canvas ya pintado. No conoce la ruta ni las observaciones.

// Bajo este valor es mar. El modelo suavizado no llega a 0 justo en la orilla.
export const UMBRAL_MAR = 1.2;

// El mar trae batimetría: si entra en la rampa aplasta la tierra. Se pinta aparte.
export function separarMar(dem) {
  const { W, datos, ax, ay, ancho, alto } = dem;
  let mar = 0;
  const paso = 4;
  for (let y = 0; y < alto; y += paso) {
    for (let x = 0; x < ancho; x += paso) if (datos[Math.floor(y + ay) * W + Math.floor(x + ax)] <= UMBRAL_MAR) mar++;
  }
  const hayMar = mar / ((ancho / paso) * (alto / paso)) > 0.004;
  if (!hayMar) return { dem, hayMar };
  const plano = new Float32Array(datos.length);
  for (let i = 0; i < datos.length; i++) plano[i] = datos[i] > 0 ? datos[i] : 0;
  return { dem: { ...dem, datos: plano }, hayMar };
}

// Distancia a la costa por chaflán, en píxeles de salida.
function distanciaACosta(esMar, w, h) {
  const d = new Float32Array(w * h);
  const G = 1e6;
  for (let i = 0; i < d.length; i++) d[i] = esMar[i] ? G : 0;
  const A = 1, B = Math.SQRT2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!d[i]) continue;
      let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + A);
      if (y > 0) {
        v = Math.min(v, d[i - w] + A);
        if (x > 0) v = Math.min(v, d[i - w - 1] + B);
        if (x < w - 1) v = Math.min(v, d[i - w + 1] + B);
      }
      d[i] = v;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!d[i]) continue;
      let v = d[i];
      if (x < w - 1) v = Math.min(v, d[i + 1] + A);
      if (y < h - 1) {
        v = Math.min(v, d[i + w] + A);
        if (x < w - 1) v = Math.min(v, d[i + w + 1] + B);
        if (x > 0) v = Math.min(v, d[i + w - 1] + B);
      }
      d[i] = v;
    }
  }
  return d;
}

// Normales de costa: líneas paralelas a la orilla, cada vez más separadas y más tenues.
// mar: { fondo, fondo2, linea } en [r, g, b].
export function grabarMar(canvas, dem, { mar: c, escala, unidad }) {
  const { W, datos, ax, ay } = dem;
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d');
  const img = ctx.getImageData(0, 0, w, h);
  const px = img.data;
  const esMar = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = y / escala + ay, y0 = Math.floor(fy), dy = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = x / escala + ax, x0 = Math.floor(fx), dx = fx - x0;
      const i = y0 * W + x0;
      const e = datos[i] * (1 - dx) * (1 - dy) + datos[i + 1] * dx * (1 - dy) + datos[i + W] * (1 - dx) * dy + datos[i + W + 1] * dx * dy;
      esMar[y * w + x] = e <= UMBRAL_MAR ? 1 : 0;
    }
  }
  const dist = distanciaACosta(esMar, w, h);
  const lineas = [];
  let p = 3;
  for (let n = 0; n < 9; n++) { lineas.push(p); p += 3.6 + n * 1.9; }
  const ancho = 0.6;
  for (let i = 0; i < esMar.length; i++) {
    if (!esMar[i]) continue;
    const d = dist[i] / unidad;
    const lejos = Math.min(1, d / 90);
    let r = c.fondo[0] + (c.fondo2[0] - c.fondo[0]) * (1 - lejos);
    let g = c.fondo[1] + (c.fondo2[1] - c.fondo[1]) * (1 - lejos);
    let b = c.fondo[2] + (c.fondo2[2] - c.fondo[2]) * (1 - lejos);
    for (let n = 0; n < lineas.length; n++) {
      const cerca = Math.abs(d - lineas[n]);
      if (cerca > ancho) continue;
      const a = (1 - cerca / ancho) * (0.7 - n * 0.07);
      r += (c.linea[0] - r) * a; g += (c.linea[1] - g) * a; b += (c.linea[2] - b) * a;
      break;
    }
    const k = i * 4;
    px[k] = r; px[k + 1] = g; px[k + 2] = b;
  }
  ctx.putImageData(img, 0, 0);
}

// Grano de tinta y viñeta leve: la plancha no es un degradado digital.
export function grabarGrano(canvas, { claro }) {
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d');
  const img = ctx.getImageData(0, 0, w, h);
  const px = img.data;
  let s = 987654321;
  const fuerza = claro ? 5 : 7;
  for (let y = 0; y < h; y++) {
    const vy = (y / h - 0.5) * 2;
    for (let x = 0; x < w; x++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const n = ((s >> 16) & 255) / 255 - 0.5;
      const vx = (x / w - 0.5) * 2;
      const v = claro ? 1 : 1 - 0.17 * Math.max(0, vx * vx + vy * vy - 0.5);
      const i = (y * w + x) * 4;
      px[i] = px[i] * v + n * fuerza;
      px[i + 1] = px[i + 1] * v + n * fuerza;
      px[i + 2] = px[i + 2] * v + n * fuerza;
    }
  }
  ctx.putImageData(img, 0, 0);
}
