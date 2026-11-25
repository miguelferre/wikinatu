// Índice de AlphaEarth por zona UTM para un año.
// Lee aef_index.csv en streaming (unos 800 MB) y escribe web/data/aef/<año>/<zona>.json.
// Sin dependencias.
//
// Uso:
//   node scripts/aef-indice.mjs [año] [--csv <ruta local o URL>] [--salida <carpeta>]
// Por defecto: año 2025, CSV del bucket público por la API JSON, salida web/data/aef.
//
// Columnas del CSV: WKT, crs, path, year, utm_zone, utm_west, utm_south, utm_east, utm_north,
// wgs84_west, wgs84_south, wgs84_east, wgs84_north. WKT va entre comillas y lleva comas.

import { createReadStream } from 'node:fs';
import { mkdir, writeFile, readdir, stat, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const CSV_URL = 'https://storage.googleapis.com/storage/v1/b/alphaearth_foundations/o/'
  + encodeURIComponent('satellite_embedding/v1/annual/aef_index.csv') + '?alt=media';

// Analizador de CSV por trozos: comillas dobles, comas dentro de comillas y "" como comilla.
export function analizadorCsv(alFila) {
  let campo = '', fila = [], comillas = false, previaComilla = false;
  return {
    trozo(texto) {
      for (let i = 0; i < texto.length; i++) {
        const ch = texto[i];
        if (comillas) {
          if (previaComilla) {
            previaComilla = false;
            if (ch === '"') { campo += '"'; continue; }
            comillas = false; // la comilla anterior cerraba el campo
          } else if (ch === '"') { previaComilla = true; continue; } else { campo += ch; continue; }
        }
        if (ch === '"' && campo === '') comillas = true;
        else if (ch === ',') { fila.push(campo); campo = ''; }
        else if (ch === '\n') { fila.push(campo); alFila(fila); fila = []; campo = ''; }
        else if (ch !== '\r') campo += ch;
      }
    },
    fin() {
      if (previaComilla) { comillas = false; previaComilla = false; }
      if (campo !== '' || fila.length) { fila.push(campo); alFila(fila); }
      fila = []; campo = '';
    },
  };
}

const r6 = (x) => Math.round(Number(x) * 1e6) / 1e6;
const r2 = (x) => Math.round(Number(x) * 100) / 100;

// Fila del CSV -> entrada del índice, o null si es de otro año.
export function entradaDe(fila, col, anio) {
  if (Number(fila[col.year]) !== anio) return null;
  const nombre = fila[col.path].split('/').pop();
  return {
    zona: fila[col.utm_zone],
    entrada: {
      path: nombre,
      crs: fila[col.crs],
      utm: [fila[col.utm_west], fila[col.utm_south], fila[col.utm_east], fila[col.utm_north]].map(r2),
      wgs84: [fila[col.wgs84_west], fila[col.wgs84_south], fila[col.wgs84_east], fila[col.wgs84_north]].map(r6),
    },
    prefijo: fila[col.path].slice(0, -nombre.length).replace(/^gs:\/\/alphaearth_foundations\//, '').replace(/\/$/, ''),
  };
}

async function abrir(origen) {
  if (/^https?:/.test(origen)) {
    const r = await fetch(origen);
    if (!r.ok) throw new Error(`HTTP ${r.status} al pedir ${origen}`);
    return Readable.fromWeb(r.body);
  }
  return createReadStream(origen);
}

async function principal() {
  const args = process.argv.slice(2);
  const opcion = (n) => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : null; };
  const origen = opcion('--csv') || CSV_URL;
  const salida = opcion('--salida') || join(RAIZ, 'web', 'data', 'aef');
  const anio = Number(args[0] || 2025);
  if (!Number.isInteger(anio)) throw new Error('El año debe ser un número, p. ej. 2025');

  const zonas = new Map();
  let col = null, filas = 0, delAnio = 0;
  const csv = analizadorCsv((fila) => {
    if (!col) {
      col = Object.fromEntries(fila.map((n, i) => [n.trim(), i]));
      for (const n of ['crs', 'path', 'year', 'utm_zone', 'utm_west', 'utm_south', 'utm_east', 'utm_north', 'wgs84_west', 'wgs84_south', 'wgs84_east', 'wgs84_north']) {
        if (!(n in col)) throw new Error(`Falta la columna ${n}`);
      }
      return;
    }
    filas++;
    const e = entradaDe(fila, col, anio);
    if (!e) return;
    delAnio++;
    if (!zonas.has(e.zona)) zonas.set(e.zona, { prefijos: new Set(), ficheros: [] });
    const z = zonas.get(e.zona);
    z.prefijos.add(e.prefijo);
    z.ficheros.push({ ...e.entrada, prefijo: e.prefijo });
  });

  const t0 = Date.now();
  const flujo = await abrir(origen);
  flujo.setEncoding('utf8');
  let leidos = 0, aviso = 0;
  for await (const t of flujo) {
    csv.trozo(t);
    leidos += t.length;
    if (leidos - aviso > 50e6) { aviso = leidos; process.stderr.write(`  ${Math.round(leidos / 1e6)} M caracteres, ${filas} filas\n`); }
  }
  csv.fin();

  const dir = join(salida, String(anio));
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  for (const [zona, z] of [...zonas].sort()) {
    z.ficheros.sort((a, b) => a.wgs84[1] - b.wgs84[1] || a.wgs84[0] - b.wgs84[0]);
    const prefijo = z.prefijos.size === 1 ? [...z.prefijos][0] : null;
    const ficheros = z.ficheros.map(({ prefijo: p, ...f }) => (prefijo ? f : { ...f, path: `${p}/${f.path}` }));
    const doc = { anio, zona, prefijo, fuente: 'gs://alphaearth_foundations/satellite_embedding/v1/annual/aef_index.csv', ficheros };
    await writeFile(join(dir, `${zona}.json`), JSON.stringify(doc));
  }

  let total = 0, mayor = { zona: null, bytes: 0, ficheros: 0 };
  for (const f of await readdir(dir)) {
    const b = (await stat(join(dir, f))).size;
    total += b;
    if (b > mayor.bytes) mayor = { zona: f.replace('.json', ''), bytes: b, ficheros: zonas.get(f.replace('.json', '')).ficheros.length };
  }
  console.log(JSON.stringify({ anio, filas, delAnio, zonas: zonas.size, bytesTotales: total, mayor, segundos: Math.round((Date.now() - t0) / 1000) }, null, 1));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  principal().catch((e) => { console.error(e.message); process.exit(1); });
}
