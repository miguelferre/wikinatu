// Lectura de GPX y geometría de la ruta. Sin dependencias: también corre en node.

const R_TIERRA = 6371;
const rad = (g) => (g * Math.PI) / 180;

export function distanciaKm(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_TIERRA * Math.asin(Math.sqrt(h));
}

const limpiar = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g, '').trim();

function atributo(attrs, nombre) {
  const m = attrs.match(new RegExp(`\\b${nombre}\\s*=\\s*["']([^"']+)["']`));
  return m ? Number(m[1]) : NaN;
}

function leerPuntos(texto, etiqueta) {
  const puntos = [];
  const re = new RegExp(`<${etiqueta}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${etiqueta}>)`, 'g');
  for (const m of texto.matchAll(re)) {
    const lat = atributo(m[1], 'lat');
    const lon = atributo(m[1], 'lon');
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const ele = m[2] ? m[2].match(/<ele>\s*([-\d.]+)\s*<\/ele>/) : null;
    puntos.push({ lat, lon, ele: ele ? Number(ele[1]) : null });
  }
  return puntos;
}

export function leerGpx(texto, nombreFichero = '') {
  let puntos = leerPuntos(texto, 'trkpt');
  if (!puntos.length) puntos = leerPuntos(texto, 'rtept');
  if (!puntos.length) puntos = leerPuntos(texto, 'wpt');
  if (!puntos.length) throw new Error('gpx_vacio');

  const trk = texto.match(/<trk\b[\s\S]*?<name>([\s\S]*?)<\/name>/);
  const meta = texto.match(/<metadata\b[\s\S]*?<name>([\s\S]*?)<\/name>/);
  const crudo = limpiar((trk || meta || [])[1] || '').replace(/\s*[-–|]\s*wikiloc.*$/i, '');
  const nombre = crudo || nombreFichero.replace(/\.gpx$/i, '') || 'Ruta';
  return { nombre, puntos };
}

// Quita puntos más cercanos que `paso` km. Conserva el primero y el último.
export function simplificar(puntos, pasoKm = 0.008) {
  if (puntos.length < 3) return puntos.slice();
  const out = [puntos[0]];
  for (let i = 1; i < puntos.length - 1; i++) {
    if (distanciaKm(out[out.length - 1], puntos[i]) >= pasoKm) out.push(puntos[i]);
  }
  out.push(puntos[puntos.length - 1]);
  return out;
}

export function acumulado(puntos) {
  const km = new Float64Array(puntos.length);
  for (let i = 1; i < puntos.length; i++) km[i] = km[i - 1] + distanciaKm(puntos[i - 1], puntos[i]);
  return km;
}

export function cajaDe(puntos) {
  let swlat = 90, swlng = 180, nelat = -90, nelng = -180;
  for (const p of puntos) {
    if (p.lat < swlat) swlat = p.lat;
    if (p.lat > nelat) nelat = p.lat;
    if (p.lon < swlng) swlng = p.lon;
    if (p.lon > nelng) nelng = p.lon;
  }
  return { swlat, swlng, nelat, nelng };
}

// Desnivel positivo con umbral, para no sumar el ruido del GPS.
export function desnivel(elevaciones, umbral = 4) {
  let sube = 0;
  let ref = elevaciones[0];
  for (const e of elevaciones) {
    if (e == null || !Number.isFinite(e)) continue;
    if (ref == null) ref = e;
    if (e - ref >= umbral) { sube += e - ref; ref = e; } else if (ref - e >= umbral) ref = e;
  }
  return Math.round(sube);
}

// Punto de la ruta más cercano a una observación. Devuelve km recorridos y distancia.
export function crearProyector(puntos) {
  const km = acumulado(puntos);
  const cosLat = Math.cos(rad(puntos[Math.floor(puntos.length / 2)].lat));
  return function proyectar(lat, lon) {
    let mejor = Infinity;
    let i0 = 0;
    for (let i = 0; i < puntos.length; i++) {
      const dx = (puntos[i].lon - lon) * cosLat;
      const dy = puntos[i].lat - lat;
      const d = dx * dx + dy * dy;
      if (d < mejor) { mejor = d; i0 = i; }
    }
    return { km: km[i0], distanciaKm: Math.sqrt(mejor) * 111.2 };
  };
}
