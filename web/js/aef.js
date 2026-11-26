// AlphaEarth Foundations: vector de paisaje de 64 dimensiones para cada punto de la ruta.
// Datos: gs://alphaearth_foundations, embeddings anuales, CC-BY 4.0.
// «The AlphaEarth Foundations Satellite Embedding dataset is produced by Google and Google DeepMind.»
// Formato: developers.google.com/earth-engine/guides/aef_on_gcs_readme (consultado el 2026-11-25).
//
// Cada fichero es un COG de 8192 x 8192 px a 10 m, 64 bandas int8, ZSTD, una banda por bloque.
// Se leen la cabecera y las IFD con peticiones Range, se elige la vista reducida más cercana
// a 160 m y se piden solo los bloques que tocan los puntos. Del GPX solo sale la zona UTM
// (para elegir el índice) y el rango de bytes de cada fichero: nunca las coordenadas.
//
// vectoresAef(puntos, opciones) -> [Float32Array(64) | null], uno por punto.

import { decompress } from './vendor/fzstd.js';
import { leerCache, guardarCache } from './inat.js';

export const BANDAS = 64;
export const NODATA = -128;
const BUCKET = 'https://storage.googleapis.com/storage/v1/b/alphaearth_foundations/o/';
const PREFIJO = 'satellite_embedding/v1/annual';
const CABECERA = 64 * 1024; // primer trozo: cabecera e IFD de un COG suelen caber
const HUECO = 64 * 1024; // une rangos separados por menos de esto
const MAX_RANGO = 8 * 1024 * 1024;
const EN_PARALELO = 4;

// La API JSON da CORS; la URL directa del bucket no (probado con curl el 2026-11-25).
export const urlObjeto = (ruta) => `${BUCKET}${encodeURIComponent(ruta)}?alt=media`;

// ---------- Decuantización ----------

// v = (raw / 127.5)^2 * signo(raw), y después norma 1. Con NoData en alguna banda, null.
export function decuantizar(raw) {
  const v = new Float32Array(raw.length);
  let s = 0;
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    if (r === NODATA) return null;
    const x = (r / 127.5) ** 2 * Math.sign(r);
    v[i] = x;
    s += x * x;
  }
  if (!(s > 0)) return null;
  const n = Math.sqrt(s);
  for (let i = 0; i < v.length; i++) v[i] /= n;
  return v;
}

// ---------- UTM (WGS84, serie de Krüger hasta n^3) ----------

const A_ELIP = 6378137;
const F_ELIP = 1 / 298.257223563;
const K0 = 0.9996;
const N_ = F_ELIP / (2 - F_ELIP);
const A_RECT = (A_ELIP / (1 + N_)) * (1 + N_ ** 2 / 4 + N_ ** 4 / 64);
const ALFA = [N_ / 2 - (2 / 3) * N_ ** 2 + (5 / 16) * N_ ** 3, (13 / 48) * N_ ** 2 - (3 / 5) * N_ ** 3, (61 / 240) * N_ ** 3];
const C_ = (2 * Math.sqrt(N_)) / (1 + N_);

export const zonaUtm = (lon) => Math.min(60, Math.max(1, Math.floor((lon + 180) / 6) + 1));
export const nombreZona = (zona, sur) => `${zona}${sur ? 'S' : 'N'}`;

export function aUtm(lat, lon, zona, sur = lat < 0) {
  const phi = (lat * Math.PI) / 180;
  const dl = ((lon - (zona * 6 - 183)) * Math.PI) / 180;
  const s = Math.sin(phi);
  const t = Math.sinh(Math.atanh(s) - C_ * Math.atanh(C_ * s));
  const xi = Math.atan2(t, Math.cos(dl));
  const eta = Math.atanh(Math.sin(dl) / Math.sqrt(1 + t * t));
  let e = eta, n = xi;
  for (let j = 1; j <= 3; j++) {
    e += ALFA[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
    n += ALFA[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
  }
  return { x: 500000 + K0 * A_RECT * e, y: (sur ? 10000000 : 0) + K0 * A_RECT * n };
}

// ---------- TIFF y BigTIFF ----------

const TAM = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 16: 8, 17: 8, 18: 8 };
const PEREZOSAS = new Set([324, 325]); // TileOffsets y TileByteCounts: solo se leen para la vista elegida

function valores(dv, off, tipo, n, le) {
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const p = off + i * TAM[tipo];
    switch (tipo) {
      case 1: case 2: case 7: out[i] = dv.getUint8(p); break;
      case 6: out[i] = dv.getInt8(p); break;
      case 3: out[i] = dv.getUint16(p, le); break;
      case 8: out[i] = dv.getInt16(p, le); break;
      case 4: out[i] = dv.getUint32(p, le); break;
      case 9: out[i] = dv.getInt32(p, le); break;
      case 11: out[i] = dv.getFloat32(p, le); break;
      case 12: out[i] = dv.getFloat64(p, le); break;
      case 16: out[i] = Number(dv.getBigUint64(p, le)); break;
      case 17: out[i] = Number(dv.getBigInt64(p, le)); break;
      case 5: out[i] = dv.getUint32(p, le) / dv.getUint32(p + 4, le); break;
      case 10: out[i] = dv.getInt32(p, le) / dv.getInt32(p + 4, le); break;
      default: throw new Error(`tiff_tipo_${tipo}`);
    }
  }
  return out;
}

// Lector con un trozo inicial en memoria. Lo que cae fuera se pide aparte.
function lector(fuente, prefijo) {
  return async (off, n) => {
    if (off + n <= prefijo.length) return prefijo.subarray(off, off + n);
    return fuente(off, n);
  };
}

const vista = (u8) => new DataView(u8.buffer, u8.byteOffset, u8.byteLength);

// fuente(inicio, n) -> Promise<Uint8Array>. Devuelve las IFD de imagen (sin máscaras), la 0 primero.
export async function leerIfds(fuente, tamCabecera = CABECERA) {
  const prefijo = await fuente(0, tamCabecera);
  const leer = lector(fuente, prefijo);
  const h = vista(await leer(0, 16));
  const orden = String.fromCharCode(h.getUint8(0), h.getUint8(1));
  if (orden !== 'II' && orden !== 'MM') throw new Error('tiff_no');
  const le = orden === 'II';
  const magia = h.getUint16(2, le);
  if (magia !== 42 && magia !== 43) throw new Error('tiff_no');
  const big = magia === 43;
  let sig = big ? Number(h.getBigUint64(8, le)) : h.getUint32(4, le);
  const ifds = [];
  const vistas = new Set();
  while (sig && !vistas.has(sig) && ifds.length < 64) {
    vistas.add(sig);
    const cab = vista(await leer(sig, big ? 8 : 2));
    const n = big ? Number(cab.getBigUint64(0, le)) : cab.getUint16(0, le);
    const tamEntrada = big ? 20 : 12;
    const bloque = await leer(sig + (big ? 8 : 2), n * tamEntrada + (big ? 8 : 4));
    const dv = vista(bloque);
    const tags = {};
    const perezosas = {};
    for (let i = 0; i < n; i++) {
      const p = i * tamEntrada;
      const tag = dv.getUint16(p, le);
      const tipo = dv.getUint16(p + 2, le);
      const cuenta = big ? Number(dv.getBigUint64(p + 4, le)) : dv.getUint32(p + 4, le);
      if (!TAM[tipo]) continue;
      const bytes = cuenta * TAM[tipo];
      const enLinea = bytes <= (big ? 8 : 4);
      const pv = p + (big ? 12 : 8);
      const off = enLinea ? null : (big ? Number(dv.getBigUint64(pv, le)) : dv.getUint32(pv, le));
      if (PEREZOSAS.has(tag) && !enLinea) { perezosas[tag] = { tipo, cuenta, off }; continue; }
      if (enLinea) tags[tag] = valores(dv, pv, tipo, cuenta, le);
      else tags[tag] = valores(vista(await leer(off, bytes)), 0, tipo, cuenta, le);
    }
    sig = big ? Number(dv.getBigUint64(n * tamEntrada, le)) : dv.getUint32(n * tamEntrada, le);
    const tipoSub = tags[254]?.[0] ?? 0;
    if (tipoSub & 4) continue; // máscara
    const ifd = {
      ancho: tags[256][0], alto: tags[257][0],
      anchoBloque: tags[322]?.[0], altoBloque: tags[323]?.[0],
      muestras: tags[277]?.[0] ?? 1, bits: tags[258]?.[0] ?? 1,
      formato: tags[339]?.[0] ?? 1, planar: tags[284]?.[0] ?? 1,
      compresion: tags[259]?.[0] ?? 1, predictor: tags[317]?.[0] ?? 1,
      offsets: tags[324] ?? null, cuentas: tags[325] ?? null,
      _perezosas: perezosas,
    };
    if (!ifds.length) {
      ifd.escala = tags[33550] ?? null;
      ifd.amarre = tags[33922] ?? null;
      ifd.matriz = tags[34264] ?? null;
      ifd.geoclaves = tags[34735] ?? null;
      ifd.nodata = tags[42113] ? String.fromCharCode(...tags[42113]).replace(/\0/g, '').trim() : null;
    }
    ifds.push(ifd);
  }
  if (!ifds.length) throw new Error('tiff_sin_ifd');
  const cargar = async (ifd) => {
    for (const [tag, campo] of [[324, 'offsets'], [325, 'cuentas']]) {
      if (ifd[campo]) continue;
      const z = ifd._perezosas[tag];
      if (!z) throw new Error('tiff_sin_bloques');
      ifd[campo] = valores(vista(await leer(z.off, z.cuenta * TAM[z.tipo])), 0, z.tipo, z.cuenta, le);
    }
    return ifd;
  };
  return { ifds, le, big, cargar };
}

// Claves GeoTIFF: { clave: valor } de las que van en línea (tipo SHORT).
export function geoclaves(dir) {
  const out = {};
  if (!dir || dir.length < 4) return out;
  for (let i = 0; i < dir[3]; i++) {
    const [k, loc, , v] = dir.slice(4 + i * 4, 8 + i * 4);
    if (loc === 0) out[k] = v;
  }
  return out;
}

// Geotransform al estilo GDAL: [x0, dx, rx, y0, ry, dy]. X = x0 + col*dx, Y = y0 + fila*dy.
// AlphaEarth guarda dy POSITIVO: la fila 0 es el sur.
export function geotransform(ifd0) {
  let gt;
  if (ifd0.matriz) {
    const m = ifd0.matriz;
    gt = [m[3], m[0], m[1], m[7], m[4], m[5]];
  } else if (ifd0.escala && ifd0.amarre) {
    const [sx, sy] = ifd0.escala;
    const [i, j, , x, y] = ifd0.amarre;
    gt = [x - i * sx, sx, 0, y + j * sy, 0, -sy];
  } else throw new Error('tiff_sin_geo');
  if (geoclaves(ifd0.geoclaves)[1025] === 2) { // PixelIsPoint: el valor es el centro del píxel
    gt[0] -= gt[1] / 2;
    gt[3] -= gt[5] / 2;
  }
  return gt;
}

// Píxel (columna, fila) de una vista de ancho x alto, a partir de coordenadas UTM.
export function pixelDe(x, y, gt, ancho0, alto0, ancho = ancho0, alto = alto0) {
  const col = (x - gt[0]) / gt[1];
  const fila = (y - gt[3]) / gt[5];
  const c = Math.floor((col * ancho) / ancho0);
  const f = Math.floor((fila * alto) / alto0);
  if (!(c >= 0 && c < ancho && f >= 0 && f < alto)) return null;
  return { c, f };
}

// Vista cuya resolución queda más cerca de la pedida, en escala logarítmica.
export function elegirNivel(ifds, pasoBase, objetivo) {
  let mejor = 0, dist = Infinity;
  ifds.forEach((ifd, i) => {
    const paso = (pasoBase * ifds[0].ancho) / ifd.ancho;
    const d = Math.abs(Math.log(paso / objetivo));
    if (d < dist - 1e-9) { dist = d; mejor = i; }
  });
  return mejor;
}

export function indiceBloque(ifd, tx, ty, banda) {
  const ancho = Math.ceil(ifd.ancho / ifd.anchoBloque);
  const alto = Math.ceil(ifd.alto / ifd.altoBloque);
  const plano = ifd.planar === 2 ? banda : 0;
  return plano * ancho * alto + ty * ancho + tx;
}

// Bloque comprimido -> Int8Array con el predictor deshecho.
export function abrirBloque(ifd, comprimido) {
  let datos;
  if (ifd.compresion === 50000) datos = decompress(comprimido);
  else if (ifd.compresion === 1) datos = comprimido.slice();
  else throw new Error(`tiff_compresion_${ifd.compresion}`);
  if (ifd.bits !== 8) throw new Error('tiff_bits');
  if (ifd.predictor === 2) {
    const paso = ifd.planar === 2 ? 1 : ifd.muestras;
    const fila = ifd.anchoBloque * paso;
    for (let f = 0; f < ifd.altoBloque; f++) {
      const o = f * fila;
      for (let i = o + paso; i < o + fila; i++) datos[i] = (datos[i] + datos[i - paso]) & 255;
    }
  } else if (ifd.predictor !== 1) throw new Error('tiff_predictor');
  return new Int8Array(datos.buffer, datos.byteOffset, datos.byteLength);
}

// Agrupa rangos de bytes cercanos para hacer menos peticiones.
export function unirRangos(rangos, hueco = HUECO, maximo = MAX_RANGO) {
  const orden = [...rangos].sort((a, b) => a.off - b.off);
  const out = [];
  for (const r of orden) {
    const u = out[out.length - 1];
    if (u && r.off - u.fin <= hueco && Math.max(u.fin, r.off + r.n) - u.off <= maximo) {
      u.fin = Math.max(u.fin, r.off + r.n);
      u.partes.push(r);
    } else out.push({ off: r.off, fin: r.off + r.n, partes: [r] });
  }
  return out;
}

// ---------- Red ----------

export function nuevasCifras() {
  return { peticiones: 0, bytes: 0, desdeCache: 0, ficheros: 0, errores: [] };
}

function fuenteHttp(url, cifras) {
  return async (inicio, n) => {
    const r = await fetch(url, { headers: { Range: `bytes=${inicio}-${inicio + n - 1}` } });
    if (r.status !== 206 && r.status !== 200) throw new Error(`aef_${r.status}`);
    const b = new Uint8Array(await r.arrayBuffer());
    cifras.peticiones++;
    cifras.bytes += b.length;
    if (r.status === 200) return b.subarray(inicio, inicio + n); // servidor sin Range
    return b;
  };
}

async function enPool(tareas, n) {
  const out = new Array(tareas.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, tareas.length) }, async () => {
    while (i < tareas.length) { const k = i++; out[k] = await tareas[k](); }
  }));
  return out;
}

// ---------- Índice por zona ----------

const indices = new Map();
function indiceZona(base, anio, zona) {
  const url = new URL(`${anio}/${zona}.json`, base).href;
  if (!indices.has(url)) {
    indices.set(url, fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  }
  return indices.get(url);
}

// Zona del punto y sus dos vecinas: los ficheros de una zona pueden asomar a la de al lado.
function zonasCandidatas(lat, lon) {
  const z = zonaUtm(lon);
  const sur = lat < 0;
  return [z, z === 1 ? 60 : z - 1, z === 60 ? 1 : z + 1].map((n) => ({ n, sur, nombre: nombreZona(n, sur) }));
}

const dentro = (caja, x, y) => x >= caja[0] && x < caja[2] && y >= caja[1] && y < caja[3];

export function buscarFichero(indice, zona, lat, lon) {
  if (!indice?.ficheros) return null;
  for (const f of indice.ficheros) {
    if (!dentro(f.wgs84, lon, lat)) continue;
    const sur = f.crs ? /^EPSG:327/.test(f.crs) : zona.sur;
    const { x, y } = aUtm(lat, lon, zona.n, sur);
    if (dentro(f.utm, x, y)) return { fichero: f, x, y };
  }
  return null;
}

// ---------- Lectura de un fichero ----------

const metas = new Map();
async function metaDe(ruta, cifras) {
  if (metas.has(ruta)) return metas.get(ruta);
  const tarea = (async () => {
    const url = urlObjeto(ruta);
    const clave = `${url}&aef=ifd`;
    const guardada = await leerCache(clave);
    if (guardada) { cifras.desdeCache++; return guardada; }
    const { ifds, cargar } = await leerIfds(fuenteHttp(url, cifras));
    const gt = geotransform(ifds[0]);
    const niveles = ifds.map((d) => ({
      ancho: d.ancho, alto: d.alto, anchoBloque: d.anchoBloque, altoBloque: d.altoBloque,
      muestras: d.muestras, bits: d.bits, formato: d.formato, planar: d.planar,
      compresion: d.compresion, predictor: d.predictor,
    }));
    return { gt, niveles, nodata: ifds[0].nodata, ifds, cargar };
  })();
  metas.set(ruta, tarea);
  try { return await tarea; } catch (e) { metas.delete(ruta); throw e; }
}

// Lee los píxeles pedidos de un fichero: { "c,f": Int8Array(64) | null }.
async function leerPixeles(ruta, meta, nivel, pixeles, cifras) {
  const d = meta.niveles[nivel];
  if (d.formato !== 2 || d.bits !== 8 || d.muestras !== BANDAS) throw new Error('aef_formato');
  const url = urlObjeto(ruta);
  const porBloque = new Map();
  for (const p of pixeles) {
    const tx = Math.floor(p.c / d.anchoBloque), ty = Math.floor(p.f / d.altoBloque);
    const k = `${tx}_${ty}`;
    if (!porBloque.has(k)) porBloque.set(k, { tx, ty, pixeles: [] });
    porBloque.get(k).pixeles.push(p);
  }
  const out = {};
  const pendientes = [];
  for (const [k, b] of porBloque) {
    const clave = `${url}&aef=n${nivel}b${k}`;
    const guardado = (await leerCache(clave)) || {};
    const faltan = b.pixeles.filter((p) => !(`${p.c},${p.f}` in guardado));
    for (const p of b.pixeles) {
      const g = guardado[`${p.c},${p.f}`];
      if (g !== undefined) out[`${p.c},${p.f}`] = g && Int8Array.from(g);
    }
    if (faltan.length) pendientes.push({ ...b, clave, guardado });
    else cifras.desdeCache++;
  }
  if (!pendientes.length) return out;
  // Los rangos de bytes vienen de la cabecera: si la meta salió de la caché, hay que leerla.
  if (!meta.ifds) Object.assign(meta, await metaFresca(ruta, cifras));
  const ifd = await meta.cargar(meta.ifds[nivel]);
  const rangos = [];
  for (const b of pendientes) {
    b.bloques = new Array(ifd.planar === 2 ? BANDAS : 1);
    for (let banda = 0; banda < b.bloques.length; banda++) {
      const i = indiceBloque(ifd, b.tx, b.ty, banda);
      rangos.push({ off: ifd.offsets[i], n: ifd.cuentas[i], b, banda });
    }
  }
  const fuente = fuenteHttp(url, cifras);
  await enPool(unirRangos(rangos.filter((r) => r.n > 0)).map((u) => async () => {
    const datos = await fuente(u.off, u.fin - u.off);
    for (const r of u.partes) r.b.bloques[r.banda] = datos.subarray(r.off - u.off, r.off - u.off + r.n);
  }), EN_PARALELO);
  for (const b of pendientes) {
    const abiertos = b.bloques.map((x) => (x ? abrirBloque(ifd, x) : null));
    for (const p of b.pixeles) {
      const lc = p.c - b.tx * ifd.anchoBloque, lf = p.f - b.ty * ifd.altoBloque;
      const raw = new Int8Array(BANDAS);
      for (let banda = 0; banda < BANDAS; banda++) {
        if (ifd.planar === 2) {
          const blq = abiertos[banda];
          raw[banda] = blq ? blq[lf * ifd.anchoBloque + lc] : NODATA;
        } else raw[banda] = abiertos[0][(lf * ifd.anchoBloque + lc) * BANDAS + banda];
      }
      out[`${p.c},${p.f}`] = raw;
      b.guardado[`${p.c},${p.f}`] = Array.from(raw);
    }
    await guardarCache(b.clave, JSON.stringify(b.guardado));
  }
  return out;
}

async function metaFresca(ruta, cifras) {
  const url = urlObjeto(ruta);
  const { ifds, cargar } = await leerIfds(fuenteHttp(url, cifras));
  return { ifds, cargar };
}

// ---------- Entrada ----------

export async function vectoresAef(puntos, opciones = {}) {
  const {
    anio = 2025,
    base = new URL('../data/aef/', import.meta.url),
    resolucion = 160,
    cifras = nuevasCifras(),
  } = opciones;
  const out = new Array(puntos.length).fill(null);
  const porFichero = new Map();
  for (let i = 0; i < puntos.length; i++) {
    const { lat, lon } = puntos[i];
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    for (const zona of zonasCandidatas(lat, lon)) {
      const indice = await indiceZona(base, anio, zona.nombre);
      const hallado = buscarFichero(indice, zona, lat, lon);
      if (!hallado) continue;
      const pre = indice.prefijo || `${PREFIJO}/${anio}/${zona.nombre}`;
      const ruta = hallado.fichero.path.includes('/') ? hallado.fichero.path : `${pre}/${hallado.fichero.path}`;
      if (!porFichero.has(ruta)) porFichero.set(ruta, []);
      porFichero.get(ruta).push({ i, x: hallado.x, y: hallado.y });
      break;
    }
  }
  cifras.ficheros = porFichero.size;
  for (const [ruta, lista] of porFichero) {
    try {
      const meta = await metaDe(ruta, cifras);
      const nivel = elegirNivel(meta.niveles, meta.gt[1], resolucion);
      const d = meta.niveles[nivel];
      const n0 = meta.niveles[0];
      const pix = [];
      for (const p of lista) {
        const px = pixelDe(p.x, p.y, meta.gt, n0.ancho, n0.alto, d.ancho, d.alto);
        if (px) { p.px = px; pix.push(px); }
      }
      const unicos = [...new Map(pix.map((p) => [`${p.c},${p.f}`, p])).values()];
      const raws = await leerPixeles(ruta, meta, nivel, unicos, cifras);
      if (meta.ifds) {
        const { ifds, cargar, ...guardable } = meta;
        await guardarCache(`${urlObjeto(ruta)}&aef=ifd`, JSON.stringify(guardable));
      }
      const vectores = new Map();
      for (const p of lista) {
        if (!p.px) continue;
        const k = `${p.px.c},${p.px.f}`;
        if (!vectores.has(k)) vectores.set(k, raws[k] ? decuantizar(raws[k]) : null);
        out[p.i] = vectores.get(k);
      }
    } catch (e) {
      cifras.errores.push(`${ruta}: ${e.message}`);
    }
  }
  return out;
}

// Atribución obligatoria (CC-BY 4.0).
export const ATRIBUCION_AEF = 'The AlphaEarth Foundations Satellite Embedding dataset is produced by Google and Google DeepMind.';
