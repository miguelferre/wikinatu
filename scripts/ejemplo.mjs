// Genera los datos públicos de la ruta de ejemplo: web/data/tristaina.gpx y tristaina.json.
// Uso: node scripts/ejemplo.mjs ["ruta al GPX de origen"]
// El GPX de salida solo lleva nombre, latitud, longitud y altitud: sin fechas ni autor.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { leerGpx, simplificar, acumulado, cajaDe, desnivel, crearProyector } from '../web/js/geo.js';
import { tramosDeRuta } from '../web/js/cells.js';
import { contarEspecies, puntosDe, filaDe } from '../web/js/inat.js';

const ORIGEN = process.argv[2];
if (!ORIGEN) throw new Error('Uso: node scripts/ejemplo.mjs <ruta.gpx>');
const DATOS = fileURLToPath(new URL('../web/data/', import.meta.url));
const MAX_PUNTOS = 300;
const MAX_ESPECIES = 200;
const ESPECIES_CON_FOTO = 40;

// inat.js ya va a 1 petición por segundo. Aquí solo se identifica el cliente.
const fetchNativo = globalThis.fetch;
globalThis.fetch = (url, op = {}) => fetchNativo(url, { ...op, headers: { ...op.headers, 'User-Agent': 'wikinatu' } });

const redondear = (x, d) => Number(x.toFixed(d));
const escapar = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function escribirGpx(nombre, puntos) {
  const filas = puntos.map((p) => {
    const ele = p.ele == null ? '' : `<ele>${redondear(p.ele, 1)}</ele>`;
    return `<trkpt lat="${redondear(p.lat, 6)}" lon="${redondear(p.lon, 6)}">${ele}</trkpt>`;
  });
  const gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="WikiNatu" xmlns="http://www.topografix.com/GPX/1/1">\n<trk><name>${escapar(nombre)}</name><trkseg>\n${filas.join('\n')}\n</trkseg></trk>\n</gpx>\n`;
  writeFileSync(`${DATOS}tristaina.gpx`, gpx);
}

// Reparte el cupo entre especies para que las más vistas no se coman todos los puntos.
function repartir(puntos, cupo) {
  const porEspecie = new Map();
  for (const p of puntos) {
    if (!porEspecie.has(p.taxon)) porEspecie.set(p.taxon, []);
    porEspecie.get(p.taxon).push(p);
  }
  for (const lista of porEspecie.values()) lista.sort((a, b) => a.km - b.km);
  const elegidos = [];
  for (let ronda = 0; elegidos.length < cupo; ronda++) {
    let quedan = false;
    for (const lista of porEspecie.values()) {
      if (ronda >= lista.length) continue;
      quedan = true;
      // Se toman alternando extremos y centro, para cubrir toda la ruta.
      const i = ronda % 2 === 0 ? Math.floor(ronda / 2) : lista.length - 1 - Math.floor(ronda / 2);
      elegidos.push(lista[Math.min(lista.length - 1, Math.max(0, i))]);
      if (elegidos.length >= cupo) break;
    }
    if (!quedan) break;
  }
  return [...new Set(elegidos)];
}

const { nombre, puntos } = leerGpx(readFileSync(ORIGEN, 'utf8'), 'Lagos de Tristaina');
escribirGpx(nombre, puntos);
console.log(`GPX escrito: ${puntos.length} puntos`);

const ruta = simplificar(puntos, 0.015);
// La ruta simplificada acorta la distancia: se reescala a la del GPX completo.
const factorKm = acumulado(puntos).at(-1) / acumulado(ruta).at(-1);
const km = acumulado(ruta).map((k) => k * factorKm);
const elevaciones = puntos.map((p) => p.ele).filter((e) => e != null);
const caja = cajaDe(puntos);
const { tramos, contiene, paso } = tramosDeRuta(puntos);
const proyectar = crearProyector(ruta);
console.log(`Ruta: ${km[km.length - 1].toFixed(2)} km, ${ruta.length} puntos, ${tramos.length} tramos`);

const filtros = { meses: [], calidad: 'investigacion' };
const total = await contarEspecies(tramos, filtros, 'es', (a, b) => console.log(`Tramo ${a} de ${b}`));
const filas = [...total.values()]
  .filter(({ taxon }) => !(taxon.rank_level > 10))
  .map(({ taxon, count }) => filaDe(taxon, count))
  .sort((a, b) => b.observaciones - a.observaciones);
const observaciones = filas.reduce((s, f) => s + f.observaciones, 0);
console.log(`${filas.length} especies, ${observaciones} observaciones`);

// Recuento por mes: especies distintas en cada mes del año.
// Si ya se midió hoy, no repite las 60 peticiones.
const hoy = new Date().toISOString().slice(0, 10);
const previo = existsSync(`${DATOS}tristaina.json`) ? JSON.parse(readFileSync(`${DATOS}tristaina.json`, 'utf8')) : null;
const porMes = previo?.consultado === hoy ? previo.porMes : [];
for (let m = porMes.length + 1; m <= 12; m++) {
  const r = await contarEspecies(tramos, { meses: [m], calidad: 'investigacion' }, 'es');
  const especies = [...r.values()].filter(({ taxon }) => !(taxon.rank_level > 10));
  porMes.push({ mes: m, especies: especies.length, observaciones: especies.reduce((s, e) => s + e.count, 0) });
  console.log(`Mes ${m}: ${porMes[m - 1].especies} especies`);
}

const ids = filas.slice(0, MAX_ESPECIES).map((f) => f.id);
const crudos = await puntosDe(caja, ids, filtros, 6);
const validos = new Set(ids);
const dentro = crudos.filter((p) => contiene(p.lat, p.lon) && validos.has(p.taxon)).map((p) => {
  const { km: kmSimple, distanciaKm } = proyectar(p.lat, p.lon);
  const kmP = kmSimple * factorKm;
  return {
    lat: redondear(p.lat, 5), lon: redondear(p.lon, 5), taxon: p.taxon,
    km: redondear(kmP, 3), distancia: Math.round(distanciaKm * 1000),
    mes: p.dia ? Number(p.dia.slice(5, 7)) : null,
  };
});
const elegidos = repartir(dentro, MAX_PUNTOS).sort((a, b) => a.km - b.km);
console.log(`${crudos.length} puntos en la caja, ${dentro.length} en el pasillo, ${elegidos.length} elegidos`);

const con = new Set(elegidos.map((p) => p.taxon));
const especies = filas.slice(0, MAX_ESPECIES).map((f, i) => ({
  id: f.id,
  cientifico: f.cientifico,
  nombre: { es: f.nombre, en: f.nombreEn },
  grupo: f.grupo.id,
  color: f.grupo.color,
  observaciones: f.observaciones,
  conPuntos: con.has(f.id),
  foto: i < ESPECIES_CON_FOTO ? f.foto : null,
}));

const salida = {
  nombre,
  consultado: hoy,
  fuente: 'iNaturalist, grado de investigación, todo el año',
  ruta: ruta.map((p, i) => ({ lat: redondear(p.lat, 6), lon: redondear(p.lon, 6), alt: p.ele == null ? null : Math.round(p.ele), km: redondear(km[i], 3) })),
  resumen: {
    km: redondear(km[km.length - 1], 2),
    desnivel: desnivel(elevaciones),
    altMin: Math.round(Math.min(...elevaciones)),
    altMax: Math.round(Math.max(...elevaciones)),
    tramos: tramos.length,
    pasoGrados: paso,
    especies: filas.length,
    observaciones,
  },
  porMes,
  especies,
  puntos: elegidos,
};
writeFileSync(`${DATOS}tristaina.json`, `${JSON.stringify(salida)}\n`);
console.log(`JSON escrito: ${(JSON.stringify(salida).length / 1024).toFixed(0)} KB`);
