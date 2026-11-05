// Lógica pura del visor. Sin DOM, sin i18n: también corre en node (tests/analisis.test.mjs).

import { acumulado, desnivel } from './geo.js';

// Mes central y sus dos vecinos, con vuelta de diciembre a enero. Meses de 1 a 12.
export function ventanaMeses(mes) {
  const m = ((mes - 1 + 12) % 12) + 1;
  return [((m + 10) % 12) + 1, m, (m % 12) + 1];
}

// «octubre a diciembre». Sin meses: todo el año.
export function textoVentana(meses, nombres, palabras = { todo: 'todo el año', a: 'a' }) {
  if (!meses || !meses.length || meses.length >= 12) return palabras.todo;
  if (meses.length === 1) return nombres[meses[0] - 1];
  return `${nombres[meses[0] - 1]} ${palabras.a} ${nombres[meses[meses.length - 1] - 1]}`;
}

export const enTaiwan = (lat, lon) => lat >= 22 && lat <= 25.5 && lon >= 120 && lon <= 122.2;

export function centroDe(puntos) {
  let lat = 0, lon = 0;
  for (const p of puntos) { lat += p.lat; lon += p.lon; }
  return { lat: lat / puntos.length, lon: lon / puntos.length };
}

// Selector de nombre local: 'auto', 'ninguno' o un locale de iNaturalist.
export function localeLocal(seleccion, centro) {
  if (seleccion === 'ninguno') return null;
  if (seleccion && seleccion !== 'auto') return seleccion;
  return enTaiwan(centro.lat, centro.lon) ? 'zh-TW' : null;
}

// species_counts mezcla géneros y familias cuando nadie afinó más. Solo quedan especies o menos.
export const soloEspecies = (entradas) => entradas.filter((e) => (e.taxon.rank_level ?? 10) <= 10);

export const nombreVisible = (f) => f.nombre || f.nombreEn || f.cientifico;

// La atribución de iNaturalist repite al autor: basta con autor y licencia.
export const autorCorto = (s) => s.replace(/,\s*(uploaded by|subido por).*$/i, '');

export function mediana(valores) {
  const v = [...valores].sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

// Perfil de la ruta a paso regular, con altitud del modelo. Los huecos toman el valor vecino.
export function perfilDe(puntos, altura, muestras = 420) {
  const km = acumulado(puntos);
  const total = km[km.length - 1];
  const n = Math.max(2, Math.min(muestras, puntos.length * 4));
  const out = [];
  let i = 0;
  for (let k = 0; k < n; k++) {
    const d = (total * k) / (n - 1);
    while (i < km.length - 2 && km[i + 1] < d) i++;
    const tramo = km[i + 1] - km[i] || 1;
    const f = Math.min(1, Math.max(0, (d - km[i]) / tramo));
    const lat = puntos[i].lat + (puntos[i + 1].lat - puntos[i].lat) * f;
    const lon = puntos[i].lon + (puntos[i + 1].lon - puntos[i].lon) * f;
    out.push({ km: d, alt: altura(lat, lon) });
  }
  let ultimo = out.find((p) => p.alt != null)?.alt ?? null;
  for (const p of out) { if (p.alt == null) p.alt = ultimo; else ultimo = p.alt; }
  return out;
}

export function altitudEn(perfil, km) {
  let a = 0, b = perfil.length - 1;
  while (b - a > 1) {
    const m = (a + b) >> 1;
    if (perfil[m].km <= km) a = m; else b = m;
  }
  const t = perfil[b].km - perfil[a].km || 1;
  return perfil[a].alt + (perfil[b].alt - perfil[a].alt) * Math.min(1, Math.max(0, (km - perfil[a].km) / t));
}

export function resumenPerfil(perfil) {
  const alts = perfil.map((p) => p.alt).filter((a) => a != null);
  if (!alts.length) return { km: perfil[perfil.length - 1]?.km ?? 0, sube: null, min: null, max: null };
  return {
    km: perfil[perfil.length - 1].km,
    sube: desnivel(alts),
    min: Math.round(Math.min(...alts)),
    max: Math.round(Math.max(...alts)),
  };
}

// Las más vistas con puntos en la ruta, en orden de observaciones. Cada una lleva su km mediano.
export function elegirEtiquetas(filas, observaciones, perfil, proyectar, maximo = 24) {
  const porTaxon = new Map();
  for (const o of observaciones) {
    if (!porTaxon.has(o.taxon)) porTaxon.set(o.taxon, []);
    porTaxon.get(o.taxon).push(proyectar(o.lat, o.lon).km);
  }
  const out = [];
  for (const f of filas) {
    const kms = porTaxon.get(f.id);
    if (!kms) continue;
    const km = mediana(kms);
    out.push({ km, alt: altitudEn(perfil, km), taxon: f.id, nombre: nombreVisible(f), cientifico: f.cientifico, color: f.grupo.color, n: f.observaciones });
    if (out.length >= maximo) break;
  }
  return out;
}

// Reparto sin choques: mínimo desplazamiento con separación d, entre lo y tope[i].
// Regresión isótona (agrupar vecinos que violan) sobre x[i] - i*d.
export function repartir(xs, d, lo, topes) {
  const n = xs.length;
  if (!n) return [];
  const bloques = [];
  for (let i = 0; i < n; i++) {
    bloques.push({ suma: xs[i] - i * d, n: 1 });
    while (bloques.length > 1) {
      const b = bloques[bloques.length - 1], a = bloques[bloques.length - 2];
      if (a.suma / a.n <= b.suma / b.n) break;
      a.suma += b.suma; a.n += b.n;
      bloques.pop();
    }
  }
  const out = [];
  for (const b of bloques) for (let k = 0; k < b.n; k++) out.push(b.suma / b.n + out.length * d);
  const tope = (i) => (Array.isArray(topes) ? topes[i] : topes);
  for (let i = n - 1; i >= 0; i--) {
    const siguiente = i < n - 1 ? out[i + 1] - d : Infinity;
    out[i] = Math.min(out[i], tope(i), siguiente);
  }
  for (let i = 0; i < n; i++) out[i] = Math.max(out[i], i ? out[i - 1] + d : lo);
  return out;
}

export function pasoKm(total) {
  return [0.5, 1, 2, 5, 10, 20, 50, 100].find((p) => total / p <= 12) || 200;
}

export function pasoAltura(rango, marcas = 6) {
  return [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find((p) => rango / p <= marcas) || 2000;
}

const sinAcentos = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export function filtrarInventario(filas, { grupo = null, texto = '' } = {}) {
  const q = sinAcentos(texto.trim());
  return filas.filter((f) => {
    if (grupo && f.grupo.id !== grupo) return false;
    if (!q) return true;
    return [f.nombre, f.nombreEn, f.nombreLocal, f.cientifico].some((n) => n && sinAcentos(n).includes(q));
  });
}

export function recuentoGrupos(filas) {
  const m = new Map();
  for (const f of filas) {
    const e = m.get(f.grupo.id);
    if (e) e.n += 1; else m.set(f.grupo.id, { id: f.grupo.id, color: f.grupo.color, n: 1 });
  }
  return [...m.values()].sort((a, b) => b.n - a.n);
}
