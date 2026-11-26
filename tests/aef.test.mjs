import test from 'node:test';
import assert from 'node:assert/strict';
import { zstdCompressSync } from 'node:zlib';
import {
  decuantizar, aUtm, zonaUtm, pixelDe, geotransform, elegirNivel, leerIfds, indiceBloque,
  abrirBloque, unirRangos, buscarFichero, BANDAS,
} from '../web/js/aef.js';
import { analizadorCsv, entradaDe } from '../scripts/aef-indice.mjs';

// ---------- Decuantización y norma ----------

test('decuantiza con (raw/127.5)^2 * signo y deja norma 1', () => {
  const raw = new Int8Array(BANDAS).fill(0);
  raw[0] = 127; raw[1] = -64; raw[2] = 10;
  const v = decuantizar(raw);
  const bruto = [127, -64, 10].map((r) => (r / 127.5) ** 2 * Math.sign(r));
  const n = Math.hypot(...bruto);
  assert.ok(Math.abs(v[0] - bruto[0] / n) < 1e-6);
  assert.ok(Math.abs(v[1] - bruto[1] / n) < 1e-6);
  assert.ok(v[1] < 0, 'conserva el signo');
  assert.ok(Math.abs(Math.hypot(...v) - 1) < 1e-6);
  assert.equal(v[3], 0);
});

test('NoData (-128) o un vector nulo dan null', () => {
  const raw = new Int8Array(BANDAS).fill(5);
  raw[7] = -128;
  assert.equal(decuantizar(raw), null);
  assert.equal(decuantizar(new Int8Array(BANDAS)), null);
});

// ---------- UTM y píxel ----------

test('UTM: origen de la zona y un punto de Tristaina', () => {
  assert.deepEqual(aUtm(0, 3, 31), { x: 500000, y: 0 });
  // Referencia: fórmulas de Snyder (USGS PP 1395), calculadas aparte. Diferencia < 1 cm.
  const p = aUtm(42.6317, 1.482745, 31);
  assert.ok(Math.abs(p.x - 375593.753) < 0.01 && Math.abs(p.y - 4721032.790) < 0.01);
  const s = aUtm(-33.9, 18.4, 34, true);
  assert.ok(Math.abs(s.x - 259583.222) < 0.01 && Math.abs(s.y - 6245888.045) < 0.01);
  assert.equal(zonaUtm(1.48), 31);
  assert.equal(zonaUtm(-180), 1);
  assert.equal(zonaUtm(180), 60);
});

test('con escala Y positiva, la fila 0 es el sur', () => {
  // Fichero de 8192 px a 10 m cuyo borde sur está en y = 4 700 000.
  const gt = [360000, 10, 0, 4700000, 0, 10];
  assert.deepEqual(pixelDe(360005, 4700005, gt, 8192, 8192), { c: 0, f: 0 });
  assert.deepEqual(pixelDe(360005, 4700000 + 81915, gt, 8192, 8192), { c: 0, f: 8191 });
  // El punto de Tristaina, en la vista de 512 px (160 m).
  const p = aUtm(42.6317, 1.482745, 31);
  const px = pixelDe(p.x, p.y, gt, 8192, 8192, 512, 512);
  assert.deepEqual(px, { c: Math.floor((p.x - 360000) / 160), f: Math.floor((p.y - 4700000) / 160) });
  assert.equal(pixelDe(359999, 4700005, gt, 8192, 8192), null);
  assert.equal(pixelDe(360005, 4700000 + 81920, gt, 8192, 8192), null);
});

test('geotransform: escala de píxel con Y negativa en la etiqueta equivale a dy positivo', () => {
  const gt = geotransform({ escala: [10, -10, 0], amarre: [0, 0, 0, 360000, 4700000, 0] });
  assert.deepEqual(gt, [360000, 10, 0, 4700000, 0, 10]);
  const norte = geotransform({ escala: [10, 10, 0], amarre: [0, 0, 0, 360000, 4781920, 0] });
  assert.deepEqual(norte, [360000, 10, 0, 4781920, 0, -10]);
  const m = geotransform({ matriz: [10, 0, 0, 360000, 0, 10, 0, 4700000, 0, 0, 0, 0, 0, 0, 0, 1] });
  assert.deepEqual(m, [360000, 10, 0, 4700000, 0, 10]);
});

test('elige la vista más cercana a 160 m', () => {
  const ifds = [8192, 4096, 2048, 1024, 512, 256, 128].map((a) => ({ ancho: a }));
  assert.equal(elegirNivel(ifds, 10, 160), 4);
  assert.equal(elegirNivel(ifds, 10, 10), 0);
  assert.equal(elegirNivel(ifds, 10, 100), 3);
});

test('une rangos cercanos y respeta el tope', () => {
  const u = unirRangos([{ off: 100, n: 10 }, { off: 0, n: 50 }, { off: 1e6, n: 5 }], 64);
  assert.equal(u.length, 2);
  assert.deepEqual([u[0].off, u[0].fin, u[0].partes.length], [0, 110, 2]);
});

// ---------- TIFF pequeño generado aquí ----------

// Escribe un TIFF (o BigTIFF) little-endian con IFD encadenadas y bloques al final.
function tiff(ifds, big) {
  const TAM = { 2: 1, 3: 2, 4: 4, 12: 8, 16: 8 };
  const ent = big ? 20 : 12, cab = big ? 16 : 8, enLinea = big ? 8 : 4;
  // Primera pasada: tamaño de cada IFD y de sus datos fuera de línea.
  let pos = cab;
  const planes = ifds.map((d) => {
    const tags = [...d.tags].sort((a, b) => a.tag - b.tag);
    const inicio = pos;
    pos += (big ? 8 : 2) + tags.length * ent + (big ? 8 : 4);
    const fuera = tags.map((t) => {
      const n = t.valores.length * TAM[t.tipo];
      if (n <= enLinea) return null;
      const o = pos; pos += n + (n % 2); return o;
    });
    return { tags, inicio, fuera };
  });
  const bloquesInicio = pos;
  const bloques = ifds.flatMap((d) => d.bloques);
  const total = bloquesInicio + bloques.reduce((s, b) => s + b.length, 0);
  // Las IFD apuntan a los bloques: rellena los offsets ahora que se conocen.
  let ob = bloquesInicio;
  ifds.forEach((d, k) => {
    const offs = d.bloques.map((b) => { const o = ob; ob += b.length; return o; });
    planes[k].tags.find((t) => t.tag === 324).valores = offs;
  });
  const buf = new Uint8Array(total);
  const dv = new DataView(buf.buffer);
  buf.set([73, 73]);
  dv.setUint16(2, big ? 43 : 42, true);
  if (big) { dv.setUint16(4, 8, true); dv.setBigUint64(8, BigInt(planes[0].inicio), true); } else dv.setUint32(4, planes[0].inicio, true);
  const escribir = (p, tipo, v) => {
    if (tipo === 2) dv.setUint8(p, v); else if (tipo === 3) dv.setUint16(p, v, true); else if (tipo === 4) dv.setUint32(p, v, true);
    else if (tipo === 12) dv.setFloat64(p, v, true); else dv.setBigUint64(p, BigInt(v), true);
  };
  planes.forEach((pl, k) => {
    let p = pl.inicio;
    if (big) { dv.setBigUint64(p, BigInt(pl.tags.length), true); p += 8; } else { dv.setUint16(p, pl.tags.length, true); p += 2; }
    pl.tags.forEach((t, i) => {
      dv.setUint16(p, t.tag, true); dv.setUint16(p + 2, t.tipo, true);
      if (big) dv.setBigUint64(p + 4, BigInt(t.valores.length), true); else dv.setUint32(p + 4, t.valores.length, true);
      const pv = p + (big ? 12 : 8);
      const destino = pl.fuera[i] ?? pv;
      if (pl.fuera[i] != null) { if (big) dv.setBigUint64(pv, BigInt(destino), true); else dv.setUint32(pv, destino, true); }
      t.valores.forEach((v, j) => escribir(destino + j * TAM[t.tipo], t.tipo, v));
      p += ent;
    });
    const sig = planes[k + 1]?.inicio ?? 0;
    if (big) dv.setBigUint64(p, BigInt(sig), true); else dv.setUint32(p, sig, true);
  });
  let o = bloquesInicio;
  for (const b of bloques) { buf.set(b, o); o += b.length; }
  return buf;
}

// Imagen de prueba: banda b, píxel (c, f) vale ((b * 7 + c + 3 * f) % 200) - 100.
const valorDe = (b, c, f) => ((b * 7 + c + 3 * f) % 200) - 100;

function imagen(ancho, bloque, { predictor = 1, extra = [] } = {}) {
  const porLado = Math.ceil(ancho / bloque);
  const bloques = [];
  for (let b = 0; b < BANDAS; b++) {
    for (let ty = 0; ty < porLado; ty++) {
      for (let tx = 0; tx < porLado; tx++) {
        const raw = new Int8Array(bloque * bloque);
        for (let f = 0; f < bloque; f++) for (let c = 0; c < bloque; c++) raw[f * bloque + c] = valorDe(b, tx * bloque + c, ty * bloque + f);
        const u8 = new Uint8Array(raw.buffer);
        if (predictor === 2) for (let f = 0; f < bloque; f++) for (let c = bloque - 1; c > 0; c--) u8[f * bloque + c] = (u8[f * bloque + c] - u8[f * bloque + c - 1]) & 255;
        bloques.push(new Uint8Array(zstdCompressSync(u8)));
      }
    }
  }
  const tags = [
    { tag: 256, tipo: 3, valores: [ancho] }, { tag: 257, tipo: 3, valores: [ancho] },
    { tag: 258, tipo: 3, valores: Array(BANDAS).fill(8) }, { tag: 259, tipo: 4, valores: [50000] },
    { tag: 277, tipo: 3, valores: [BANDAS] }, { tag: 284, tipo: 3, valores: [2] },
    { tag: 317, tipo: 3, valores: [predictor] },
    { tag: 322, tipo: 3, valores: [bloque] }, { tag: 323, tipo: 3, valores: [bloque] },
    { tag: 324, tipo: 4, valores: bloques.map(() => 0) }, { tag: 325, tipo: 4, valores: bloques.map((x) => x.length) },
    { tag: 339, tipo: 3, valores: Array(BANDAS).fill(2) },
    ...extra,
  ];
  return { tags, bloques };
}

for (const big of [false, true]) {
  test(`lee IFD, vistas reducidas y bloques de un ${big ? 'BigTIFF' : 'TIFF clásico'} generado`, async () => {
    const geo = [
      { tag: 33550, tipo: 12, valores: [10, -10, 0] },
      { tag: 33922, tipo: 12, valores: [0, 0, 0, 360000, 4700000, 0] },
      { tag: 34735, tipo: 3, valores: [1, 1, 0, 1, 1025, 0, 1, 1] },
      { tag: 42113, tipo: 2, valores: [...'-128'].map((c) => c.charCodeAt(0)).concat(0) },
    ];
    const base = imagen(32, 16, { extra: geo });
    const vista = imagen(16, 16, { predictor: 2, extra: [{ tag: 254, tipo: 4, valores: [1] }] });
    const mascara = imagen(16, 16, { extra: [{ tag: 254, tipo: 4, valores: [5] }] });
    const bytes = tiff([base, mascara, vista], big);
    let peticiones = 0;
    const fuente = async (o, n) => { peticiones++; return bytes.subarray(o, Math.min(bytes.length, o + n)); };
    const { ifds, cargar } = await leerIfds(fuente, 256); // cabecera corta: obliga a leer fuera del trozo
    assert.equal(ifds.length, 2, 'la máscara se descarta');
    assert.deepEqual([ifds[0].ancho, ifds[1].ancho, ifds[0].planar, ifds[0].compresion, ifds[0].formato], [32, 16, 2, 50000, 2]);
    assert.equal(ifds[0].nodata, '-128');
    assert.deepEqual(geotransform(ifds[0]), [360000, 10, 0, 4700000, 0, 10]);
    assert.ok(peticiones > 1);
    // Base: bloque (1, 1) de la banda 5.
    const d0 = await cargar(ifds[0]);
    const i0 = indiceBloque(d0, 1, 1, 5);
    assert.equal(i0, 5 * 4 + 1 * 2 + 1);
    const b0 = abrirBloque(d0, bytes.subarray(d0.offsets[i0], d0.offsets[i0] + d0.cuentas[i0]));
    assert.equal(b0[3 * 16 + 2], valorDe(5, 18, 19));
    // Vista reducida con predictor horizontal: banda 63.
    const d1 = await cargar(ifds[1]);
    const i1 = indiceBloque(d1, 0, 0, 63);
    const b1 = abrirBloque(d1, bytes.subarray(d1.offsets[i1], d1.offsets[i1] + d1.cuentas[i1]));
    for (const [c, f] of [[0, 0], [15, 0], [7, 9], [15, 15]]) assert.equal(b1[f * 16 + c], valorDe(63, c, f));
  });
}

// ---------- Índice ----------

test('el CSV del índice admite comas y comillas dentro del WKT', () => {
  const filas = [];
  const csv = analizadorCsv((f) => filas.push(f));
  const texto = 'WKT,crs,path,year\n"POLYGON((1 2,3 4))",EPSG:32631,gs://a/b.tiff,2025\r\n"con ""comillas""",x,y,2024';
  csv.trozo(texto.slice(0, 17));
  csv.trozo(texto.slice(17, 40));
  csv.trozo(texto.slice(40));
  csv.fin();
  assert.deepEqual(filas[1], ['POLYGON((1 2,3 4))', 'EPSG:32631', 'gs://a/b.tiff', '2025']);
  assert.deepEqual(filas[2], ['con "comillas"', 'x', 'y', '2024']);
});

test('entrada del índice y búsqueda del fichero que cubre un punto', () => {
  const cab = ['WKT', 'crs', 'path', 'year', 'utm_zone', 'utm_west', 'utm_south', 'utm_east', 'utm_north', 'wgs84_west', 'wgs84_south', 'wgs84_east', 'wgs84_north'];
  const col = Object.fromEntries(cab.map((n, i) => [n, i]));
  const fila = ['P', 'EPSG:32631', 'gs://alphaearth_foundations/satellite_embedding/v1/annual/2025/31N/abc.tiff', '2025', '31N',
    '327680', '4669440', '409600', '4751360', '0.88', '42.15', '1.92', '42.92'];
  const e = entradaDe(fila, col, 2025);
  assert.equal(e.zona, '31N');
  assert.equal(e.prefijo, 'satellite_embedding/v1/annual/2025/31N');
  assert.deepEqual(e.entrada.utm, [327680, 4669440, 409600, 4751360]);
  assert.equal(entradaDe(fila, col, 2024), null);
  const indice = { ficheros: [e.entrada] };
  assert.equal(buscarFichero(indice, { n: 31, sur: false }, 42.6317, 1.482745).fichero.path, 'abc.tiff');
  assert.equal(buscarFichero(indice, { n: 31, sur: false }, 43.5, 1.48), null);
});
