// Relieve propio a partir de teselas Terrarium (Mapterhorn).
// El mismo modelo da la lámina, el perfil y la altitud de cada observación.

const TESELA = 512;
const URL_DEM = (z, x, y) => `https://tiles.mapterhorn.com/${z}/${x}/${y}.webp`;
const Z_MAX = 12; // último nivel con cobertura mundial

export const lonAX = (lon, z) => ((lon + 180) / 360) * 2 ** z;
export const latAY = (lat, z) => {
  const s = Math.sin((lat * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 2 ** z;
};
const xALon = (x, z) => (x / 2 ** z) * 360 - 180;
const yALat = (y, z) => {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (Math.atan(Math.sinh(n)) * 180) / Math.PI;
};

// Decodifica un píxel Terrarium a metros.
export const alturaDe = (r, g, b) => r * 256 + g + b / 256 - 32768;

export function zoomPara(caja, anchoPx) {
  for (let z = Z_MAX; z >= 1; z--) {
    const px = (lonAX(caja.nelng, z) - lonAX(caja.swlng, z)) * TESELA;
    const nx = Math.ceil(lonAX(caja.nelng, z)) - Math.floor(lonAX(caja.swlng, z)) + 1;
    const ny = Math.ceil(latAY(caja.swlat, z)) - Math.floor(latAY(caja.nelat, z)) + 1;
    if (px <= anchoPx * 1.15 && nx * ny <= 16) return z;
  }
  return 1;
}

// Amplía la caja de la ruta hasta el formato pedido, con margen.
export function cajaLamina(caja, aspecto, margen = 0.28) {
  const z = 12;
  let x0 = lonAX(caja.swlng, z), x1 = lonAX(caja.nelng, z);
  let y0 = latAY(caja.nelat, z), y1 = latAY(caja.swlat, z);
  let w = Math.max(x1 - x0, 0.02), h = Math.max(y1 - y0, 0.02);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  w *= 1 + margen * 2; h *= 1 + margen * 2;
  if (w / h < aspecto) w = h * aspecto; else h = w / aspecto;
  return {
    swlng: xALon(cx - w / 2, z), nelng: xALon(cx + w / 2, z),
    nelat: yALat(cy - h / 2, z), swlat: yALat(cy + h / 2, z),
  };
}

async function teselaAPixeles(z, x, y) {
  const n = 2 ** z;
  const r = await fetch(URL_DEM(z, ((x % n) + n) % n, y));
  if (!r.ok) throw new Error('dem');
  const bmp = await createImageBitmap(await r.blob());
  const c = new OffscreenCanvas(TESELA, TESELA);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  return ctx.getImageData(0, 0, TESELA, TESELA).data;
}

function suavizar(datos, w, h, radio) {
  if (radio < 1) return datos;
  const tmp = new Float32Array(datos.length);
  const out = new Float32Array(datos.length);
  const ancho = radio * 2 + 1;
  for (let pasada = 0; pasada < 2; pasada++) {
    const fuente = pasada === 0 ? datos : out;
    for (let y = 0; y < h; y++) {
      let s = 0;
      for (let k = -radio; k <= radio; k++) s += fuente[y * w + Math.min(w - 1, Math.max(0, k))];
      for (let x = 0; x < w; x++) {
        tmp[y * w + x] = s / ancho;
        s += fuente[y * w + Math.min(w - 1, x + radio + 1)] - fuente[y * w + Math.max(0, x - radio)];
      }
    }
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -radio; k <= radio; k++) s += tmp[Math.min(h - 1, Math.max(0, k)) * w + x];
      for (let y = 0; y < h; y++) {
        out[y * w + x] = s / ancho;
        s += tmp[Math.min(h - 1, y + radio + 1) * w + x] - tmp[Math.max(0, y - radio) * w + x];
      }
    }
  }
  return out;
}

export async function cargarDem(caja, anchoPx) {
  const z = zoomPara(caja, anchoPx);
  const fx0 = lonAX(caja.swlng, z), fx1 = lonAX(caja.nelng, z);
  const fy0 = latAY(caja.nelat, z), fy1 = latAY(caja.swlat, z);
  const tx0 = Math.floor(fx0), tx1 = Math.floor(fx1), ty0 = Math.floor(fy0), ty1 = Math.floor(fy1);
  const W = (tx1 - tx0 + 1) * TESELA, H = (ty1 - ty0 + 1) * TESELA;
  const crudo = new Float32Array(W * H);

  const pendientes = [];
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      pendientes.push(teselaAPixeles(z, tx, ty).then((px) => {
        const ox = (tx - tx0) * TESELA, oy = (ty - ty0) * TESELA;
        for (let y = 0; y < TESELA; y++) {
          for (let x = 0; x < TESELA; x++) {
            const i = (y * TESELA + x) * 4;
            crudo[(oy + y) * W + ox + x] = alturaDe(px[i], px[i + 1], px[i + 2]);
          }
        }
      }));
    }
  }
  await Promise.all(pendientes);

  // El dato de origen ronda los 30 m. Un radio corto quita el escalón sin borrar el relieve.
  const latMedia = ((caja.swlat + caja.nelat) / 2) * Math.PI / 180;
  const mPx = (40075016 * Math.cos(latMedia)) / (2 ** z * TESELA);
  const datos = suavizar(crudo, W, H, Math.max(1, Math.round(16 / mPx)));
  const ax = (fx0 - tx0) * TESELA, ay = (fy0 - ty0) * TESELA;
  const ancho = Math.round((fx1 - fx0) * TESELA), alto = Math.round((fy1 - fy0) * TESELA);

  const aPixel = (lat, lon) => [(lonAX(lon, z) - tx0) * TESELA - ax, (latAY(lat, z) - ty0) * TESELA - ay];
  const altura = (lat, lon) => {
    const [px, py] = aPixel(lat, lon);
    const x = px + ax, y = py + ay;
    const x0 = Math.floor(x), y0 = Math.floor(y);
    if (x0 < 0 || y0 < 0 || x0 >= W - 1 || y0 >= H - 1) return null;
    const dx = x - x0, dy = y - y0;
    const i = y0 * W + x0;
    return datos[i] * (1 - dx) * (1 - dy) + datos[i + 1] * dx * (1 - dy) + datos[i + W] * (1 - dx) * dy + datos[i + W + 1] * dx * dy;
  };
  const metrosPx = (40075016 * Math.cos((((caja.swlat + caja.nelat) / 2) * Math.PI) / 180)) / (2 ** z * TESELA);
  return { z, W, H, datos, ax, ay, ancho, alto, aPixel, altura, metrosPx, caja };
}

const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

function tablaColor(rampa) {
  const c = rampa.map(hexRgb);
  const t = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const f = (i / 255) * (c.length - 1);
    const a = Math.min(c.length - 2, Math.floor(f));
    const k = f - a;
    for (let n = 0; n < 3; n++) t[i * 3 + n] = c[a][n] + (c[a + 1][n] - c[a][n]) * k;
  }
  return t;
}

export function intervaloCurvas(rango) {
  for (const i of [5, 10, 20, 25, 50, 100, 200, 500]) if (rango / i <= 20) return i;
  return 1000;
}

export function rangoAlturas(dem) {
  const { W, datos, ax, ay, ancho, alto } = dem;
  const vals = [];
  const paso = Math.max(1, Math.floor(Math.sqrt((ancho * alto) / 40000)));
  for (let y = 0; y < alto; y += paso) {
    for (let x = 0; x < ancho; x += paso) vals.push(datos[Math.floor(y + ay) * W + Math.floor(x + ax)]);
  }
  vals.sort((a, b) => a - b);
  return { min: vals[Math.floor(vals.length * 0.01)], max: vals[Math.floor(vals.length * 0.995)] };
}

// Pinta color por altura, sombreado y curvas de nivel con borde suave.
// rampa: colores de bajo a alto (base.css). claro: sombreado suave y curvas oscuras.
// rango { min, max }: reparte la rampa en ese tramo de altitud en vez del de toda la zona.
export function pintarRelieve(canvas, dem, { rampa, claro = false, curvas = true, escala = 1, rango = null }) {
  const { W, datos, ax, ay, ancho, alto, metrosPx } = dem;
  const w = Math.round(ancho * escala), h = Math.round(alto * escala);
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  const px = img.data;
  const tabla = tablaColor(rampa);
  const { min, max } = rango || rangoAlturas(dem);
  const inv = 1 / Math.max(1, max - min);
  const intervalo = intervaloCurvas(max - min);

  // Luz del noroeste, a 40 grados, como en la cartografía clásica.
  const az = (315 * Math.PI) / 180, alt = (40 * Math.PI) / 180;
  const lx = Math.sin(az) * Math.cos(alt), ly = -Math.cos(az) * Math.cos(alt), lz = Math.sin(alt);
  const exag = 1.6;

  const en = (x, y) => {
    const xf = x / escala + ax, yf = y / escala + ay;
    const x0 = Math.min(W - 2, Math.max(0, Math.floor(xf))), y0 = Math.floor(yf);
    const dx = xf - x0, dy = yf - y0;
    const i = Math.min(datos.length - W - 2, Math.max(0, y0 * W + x0));
    return datos[i] * (1 - dx) * (1 - dy) + datos[i + 1] * dx * (1 - dy) + datos[i + W] * (1 - dx) * dy + datos[i + W + 1] * dx * dy;
  };

  const d = 1 / escala;
  // La pendiente se mide a un píxel del modelo: dentro de una celda sale plana y dibuja cuadros.
  const k = Math.max(1, Math.round(escala));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const e = en(x, y);
      const gx = (en(x + k, y) - en(x - k, y)) / (2 * k * d * metrosPx);
      const gy = (en(x, y + k) - en(x, y - k)) / (2 * k * d * metrosPx);
      const nz = 1 / Math.sqrt(exag * exag * (gx * gx + gy * gy) + 1);
      const luz = Math.max(0, (-exag * gx * lx - exag * gy * ly + lz) * nz);
      const sombra = claro ? 0.72 + luz * 0.42 : 0.42 + luz * 1.05;

      const t = Math.max(0, Math.min(255, ((e - min) * inv) ** 0.85 * 255)) | 0;
      let r = tabla[t * 3] * sombra, g = tabla[t * 3 + 1] * sombra, b = tabla[t * 3 + 2] * sombra;

      if (curvas) {
        const grad = Math.sqrt(gx * gx + gy * gy) * metrosPx * d; // metros por píxel de salida
        const fr = e / intervalo - Math.floor(e / intervalo);
        const dist = Math.min(fr, 1 - fr) * intervalo / Math.max(grad, 0.02);
        const maestra = Math.round(e / intervalo) % 5 === 0;
        const a = Math.max(0, 1 - dist / (maestra ? 1.1 : 0.7)) * (maestra ? 0.34 : 0.16);
        const tono = claro ? 70 : 245;
        r += (tono - r) * a; g += (tono - g) * a; b += (tono - b) * a;
      }
      const i = (y * w + x) * 4;
      px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { min, max, intervalo };
}
