// Bandas de paisaje: agrupa los vectores de AlphaEarth del perfil y nombra cada clase
// con la planta más observada en ella. Lógica pura: sin DOM, también corre en node.

// Generador con semilla (mulberry32): el mismo resultado en cada carga.
export function aleatorio(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const punto = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

function normalizar(v) {
  const n = Math.sqrt(punto(v, v));
  if (!(n > 0)) return null;
  return v.map((x) => x / n);
}

// k-means de coseno con arranque k-means++. Los vectores ya tienen norma 1.
export function kmeansCoseno(vectores, k, semilla = 1, iteraciones = 60) {
  const n = vectores.length;
  if (n < k) return null;
  const azar = aleatorio(semilla);
  const centros = [Array.from(vectores[Math.floor(azar() * n)])];
  const dist = new Float64Array(n).fill(Infinity);
  while (centros.length < k) {
    const c = centros[centros.length - 1];
    let total = 0;
    for (let i = 0; i < n; i++) { dist[i] = Math.min(dist[i], Math.max(0, 1 - punto(vectores[i], c))); total += dist[i]; }
    if (!(total > 0)) return null; // menos vectores distintos que clases
    let r = azar() * total, elegido = n - 1;
    for (let i = 0; i < n; i++) { r -= dist[i]; if (r <= 0) { elegido = i; break; } }
    centros.push(Array.from(vectores[elegido]));
  }
  const asignacion = new Int32Array(n).fill(-1);
  for (let it = 0; it < iteraciones; it++) {
    let cambios = 0;
    for (let i = 0; i < n; i++) {
      let mejor = 0, sim = -Infinity;
      for (let j = 0; j < k; j++) { const s = punto(vectores[i], centros[j]); if (s > sim + 1e-12) { sim = s; mejor = j; } }
      if (asignacion[i] !== mejor) { asignacion[i] = mejor; cambios++; }
    }
    if (!cambios) break;
    for (let j = 0; j < k; j++) {
      const suma = new Array(vectores[0].length).fill(0);
      let m = 0;
      for (let i = 0; i < n; i++) if (asignacion[i] === j) { m++; for (let d = 0; d < suma.length; d++) suma[d] += vectores[i][d]; }
      const c = m ? normalizar(suma) : null;
      if (c) centros[j] = c;
    }
  }
  const tamanos = new Array(k).fill(0);
  for (const a of asignacion) tamanos[a]++;
  if (tamanos.some((t) => t === 0)) return null;
  return { asignacion: Array.from(asignacion), centros };
}

// Silueta media con distancia de coseno. Sobre puntos repetidos, se pondera por su cuenta.
export function silueta(vectores, asignacion, k) {
  const unicos = new Map();
  vectores.forEach((v, i) => {
    const clave = `${asignacion[i]}|${Array.from(v).join(',')}`;
    const u = unicos.get(clave);
    if (u) u.peso++; else unicos.set(clave, { v, c: asignacion[i], peso: 1 });
  });
  const lista = [...unicos.values()];
  let suma = 0, pesos = 0;
  for (const p of lista) {
    const porClase = new Array(k).fill(0), cuenta = new Array(k).fill(0);
    for (const q of lista) {
      const d = Math.max(0, 1 - punto(p.v, q.v));
      porClase[q.c] += d * q.peso;
      cuenta[q.c] += q.peso;
    }
    const propios = cuenta[p.c] - 1;
    let s = 0;
    if (propios > 0) {
      const a = porClase[p.c] / propios;
      let b = Infinity;
      for (let j = 0; j < k; j++) if (j !== p.c && cuenta[j]) b = Math.min(b, porClase[j] / cuenta[j]);
      s = Math.max(a, b) > 0 ? (b - a) / Math.max(a, b) : 0;
    }
    suma += s * p.peso;
    pesos += p.peso;
  }
  return pesos ? suma / pesos : 0;
}

// Prueba k de kMin a kMax y se queda con la mejor silueta. A igualdad, la k menor.
export function agrupar(vectores, { kMin = 4, kMax = 6, semilla = 2025 } = {}) {
  let mejor = null;
  for (let k = kMin; k <= kMax; k++) {
    const r = kmeansCoseno(vectores, k, semilla + k);
    if (!r) continue;
    const s = silueta(vectores, r.asignacion, k);
    if (!mejor || s > mejor.silueta + 1e-9) mejor = { ...r, k, silueta: s };
  }
  return mejor;
}

// Tramos consecutivos de la misma clase: [{ clase, inicio, fin }] con fin exclusivo.
export function tramosDe(clases) {
  const out = [];
  clases.forEach((c, i) => {
    const u = out[out.length - 1];
    if (u && u.clase === c) u.fin = i + 1; else out.push({ clase: c, inicio: i, fin: i + 1 });
  });
  return out;
}

// Un tramo de menos de `minimo` muestras pasa al vecino más largo, para que la franja no parpadee.
// Los huecos sin dato (null) no se rellenan ni absorben a nadie.
export function unirTramosCortos(clases, minimo = 3) {
  const c = clases.slice();
  for (let vuelta = 0; vuelta < c.length; vuelta++) {
    const tramos = tramosDe(c);
    const cortos = tramos.map((t, i) => ({ ...t, i, largo: t.fin - t.inicio }))
      .filter((t) => t.clase != null && t.largo < minimo);
    if (!cortos.length) break;
    let hecho = false;
    for (const t of cortos.sort((a, b) => a.largo - b.largo || a.inicio - b.inicio)) {
      const izq = tramos[t.i - 1], der = tramos[t.i + 1];
      const vale = (v) => v && v.clase != null;
      const li = vale(izq) ? izq.fin - izq.inicio : -1, ld = vale(der) ? der.fin - der.inicio : -1;
      if (li < 0 && ld < 0) continue;
      const destino = li >= ld ? izq.clase : der.clase;
      for (let j = t.inicio; j < t.fin; j++) c[j] = destino;
      hecho = true;
      break; // se recalculan los tramos tras cada unión
    }
    if (!hecho) break;
  }
  return c;
}

// Clases renumeradas por orden de aparición a lo largo de la ruta.
export function renumerar(clases) {
  const mapa = new Map();
  return clases.map((c) => {
    if (c == null) return null;
    if (!mapa.has(c)) mapa.set(c, mapa.size);
    return mapa.get(c);
  });
}

// Muestra del perfil más cercana a cada observación (distancia en el plano local, en grados corregidos).
export function muestraCercana(perfil, lat, lon) {
  const k = Math.cos((lat * Math.PI) / 180);
  let mejor = -1, d = Infinity;
  for (let i = 0; i < perfil.length; i++) {
    const p = perfil[i];
    if (p.lat == null) continue;
    const dx = (p.lon - lon) * k, dy = p.lat - lat;
    const e = dx * dx + dy * dy;
    if (e < d) { d = e; mejor = i; }
  }
  return mejor;
}

// Observaciones de plantas por clase: la muestra del perfil más cercana decide la clase.
export function cuentasPorClase(clases, perfil, observaciones, n) {
  const porClase = Array.from({ length: n }, () => new Map());
  const total = new Map();
  for (const o of observaciones) {
    if (o.color !== 'plantas') continue;
    const i = muestraCercana(perfil, o.lat, o.lon);
    const c = clases[i];
    if (i < 0 || c == null) continue;
    porClase[c].set(o.taxon, (porClase[c].get(o.taxon) || 0) + 1);
    total.set(o.taxon, (total.get(o.taxon) || 0) + 1);
  }
  return { porClase, total };
}

// Nombre de cada clase. Una clase sin plantas se queda sin nombre.
// 'caracteristica': la planta con mayor parte de sus observaciones en esa clase, entre las que
//   tienen al menos `minimo` allí. A igualdad, la más observada. Si ninguna llega, la más observada.
// 'mas_vista': la planta con más observaciones en la clase.
export function nombrarClases(clases, perfil, observaciones, n, { criterio = 'caracteristica', minimo = 3 } = {}) {
  const { porClase, total } = cuentasPorClase(clases, perfil, observaciones, n);
  const mejor = (lista, clave) => lista.reduce((a, b) => {
    if (!a) return b;
    const d = clave(b) - clave(a);
    if (Math.abs(d) > 1e-12) return d > 0 ? b : a;
    if (b.n !== a.n) return b.n > a.n ? b : a;
    return b.taxon < a.taxon ? b : a;
  }, null);
  return porClase.map((m) => {
    const lista = [...m].map(([taxon, v]) => ({ taxon, n: v, cuota: v / total.get(taxon) }));
    if (!lista.length) return null;
    const masVista = mejor(lista, (x) => x.n);
    if (criterio === 'mas_vista') return masVista;
    const candidatas = lista.filter((x) => x.n >= minimo);
    return candidatas.length ? mejor(candidatas, (x) => x.cuota) : masVista;
  });
}

// Agrupación del perfil: depende solo de los vectores, se calcula una vez por ruta.
// vectores: [Float32Array | null] alineados con el perfil.
export function clasesDelPerfil(vectores, opciones = {}) {
  const validos = [], indices = [];
  vectores.forEach((v, i) => { if (v) { validos.push(v); indices.push(i); } });
  if (validos.length < (opciones.minimo ?? 12)) return null;
  const g = agrupar(validos, opciones);
  if (!g) return null;
  const crudas = new Array(vectores.length).fill(null);
  indices.forEach((i, j) => { crudas[i] = g.asignacion[j]; });
  const clases = renumerar(unirTramosCortos(crudas, opciones.tramoMinimo ?? 3));
  const n = clases.reduce((m, c) => (c == null ? m : Math.max(m, c + 1)), 0);
  return { clases, n, k: g.k, silueta: g.silueta };
}

// Franja lista para el cuadro: tramos en km y una entrada de leyenda por clase.
export function franjaPaisaje(perfil, agrupacion, observaciones, filaDe, opciones = {}) {
  if (!agrupacion) return null;
  const { clases, n } = agrupacion;
  const nombres = nombrarClases(clases, perfil, observaciones, n, opciones);
  const km = (i) => perfil[Math.min(i, perfil.length - 1)].km;
  // Cada muestra cubre de la mitad con la anterior a la mitad con la siguiente.
  const borde = (i) => (i <= 0 ? km(0) : i >= perfil.length ? km(perfil.length - 1) : (km(i - 1) + km(i)) / 2);
  const tramos = tramosDe(clases).filter((t) => t.clase != null)
    .map((t) => ({ clase: t.clase, km0: borde(t.inicio), km1: borde(t.fin) }));
  const leyenda = nombres.map((nm, clase) => {
    const f = nm ? filaDe(nm.taxon) : null;
    return { clase, taxon: nm?.taxon ?? null, nombre: f ? f.nombre : null, cientifico: f ? f.cientifico : null };
  });
  return { tramos, leyenda };
}
