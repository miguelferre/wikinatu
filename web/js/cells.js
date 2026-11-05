// Pasillo de la ruta como tramos de rejilla que no se solapan.
// Cada observación cae en un solo tramo, así que la suma por especie es exacta.

export const PASO_BASE = 0.005; // grados, unos 500 m
const MAX_TRAMOS = 60;

const clave = (i, j) => `${i},${j}`;
const redondear = (x) => Math.round(x * 1e6) / 1e6;

function celdasDe(puntos, paso) {
  const celdas = new Set();
  const marcar = (lat, lon) => {
    const i = Math.floor(lat / paso);
    const j = Math.floor(lon / paso);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) celdas.add(clave(i + a, j + b));
  };
  for (let n = 0; n < puntos.length; n++) {
    const p = puntos[n];
    marcar(p.lat, p.lon);
    const q = puntos[n + 1];
    if (!q) continue;
    // Un GPX con puntos separados no debe dejar huecos en el pasillo.
    const pasos = Math.ceil(Math.max(Math.abs(q.lat - p.lat), Math.abs(q.lon - p.lon)) / paso);
    for (let k = 1; k < pasos; k++) {
      marcar(p.lat + ((q.lat - p.lat) * k) / pasos, p.lon + ((q.lon - p.lon) * k) / pasos);
    }
  }
  return celdas;
}

function unirPorFilas(celdas, paso) {
  const filas = new Map();
  for (const c of celdas) {
    const [i, j] = c.split(',').map(Number);
    if (!filas.has(i)) filas.set(i, []);
    filas.get(i).push(j);
  }
  const tramos = [];
  for (const i of [...filas.keys()].sort((a, b) => a - b)) {
    const js = filas.get(i).sort((a, b) => a - b);
    let ini = js[0];
    let prev = js[0];
    for (let n = 1; n <= js.length; n++) {
      if (n < js.length && js[n] === prev + 1) { prev = js[n]; continue; }
      tramos.push({
        swlat: redondear(i * paso), swlng: redondear(ini * paso),
        nelat: redondear((i + 1) * paso), nelng: redondear((prev + 1) * paso),
      });
      ini = prev = js[n];
    }
  }
  return tramos;
}

export function tramosDeRuta(puntos, pasoInicial = PASO_BASE) {
  let paso = pasoInicial;
  let celdas = celdasDe(puntos, paso);
  let tramos = unirPorFilas(celdas, paso);
  // Una ruta larga usa celdas mayores para no pasar de MAX_TRAMOS peticiones.
  while (tramos.length > MAX_TRAMOS) {
    paso *= 2;
    celdas = celdasDe(puntos, paso);
    tramos = unirPorFilas(celdas, paso);
  }
  return {
    paso,
    tramos,
    contiene: (lat, lon) => celdas.has(clave(Math.floor(lat / paso), Math.floor(lon / paso))),
  };
}

export function haySolape(tramos) {
  for (let a = 0; a < tramos.length; a++) {
    for (let b = a + 1; b < tramos.length; b++) {
      const x = tramos[a];
      const y = tramos[b];
      if (x.swlat < y.nelat && y.swlat < x.nelat && x.swlng < y.nelng && y.swlng < x.nelng) return true;
    }
  }
  return false;
}
