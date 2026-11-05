// Cliente de iNaturalist. Una petición por segundo, en serie, con caché.
// Límite: inaturalist.org/pages/api+recommended+practices (leído el 2026-11-05).

const API = 'https://api.inaturalist.org';
const INTERVALO_MS = 1050;
const CACHE = 'wikinatu-v1';
const CADUCIDAD_MS = 3 * 24 * 3600 * 1000;
export const LOTE_TAXONES = 30; // tope de /v1/taxa/{ids}

// Identificadores comprobados contra la API el 2026-11-05.
// El orden importa: gana el primer antecesor que coincide.
export const GRUPOS = [
  { id: 'aves', taxon: 3, color: 'aves' },
  { id: 'mamiferos', taxon: 40151, color: 'mamiferos' },
  { id: 'reptiles', taxon: 26036, color: 'herpetos' },
  { id: 'anfibios', taxon: 20978, color: 'herpetos' },
  { id: 'peces', taxon: 47178, color: 'otros' },
  { id: 'insectos', taxon: 47158, color: 'insectos' },
  { id: 'aracnidos', taxon: 47119, color: 'otros' },
  { id: 'artropodos', taxon: 47120, color: 'otros' },
  { id: 'moluscos', taxon: 47115, color: 'otros' },
  { id: 'anelidos', taxon: 47491, color: 'otros' },
  { id: 'cnidarios', taxon: 47534, color: 'otros' },
  { id: 'equinodermos', taxon: 47549, color: 'otros' },
  { id: 'poriferos', taxon: 48824, color: 'otros' },
  { id: 'plantas', taxon: 47126, color: 'plantas' },
  { id: 'hongos', taxon: 47170, color: 'hongos' },
];

const LICENCIAS_ABIERTAS = new Set(['cc0', 'cc-by', 'cc-by-sa', 'cc-by-nc', 'cc-by-nc-sa', 'cc-by-nd', 'cc-by-nc-nd', 'pd']);

export function grupoDe(taxon) {
  const ancestros = new Set(taxon.ancestor_ids || []);
  for (const g of GRUPOS) if (ancestros.has(g.taxon)) return g;
  return { id: 'otros', taxon: 0, color: 'otros' };
}

// El CC0 de iNaturalist solo nombra al autor en «uploaded by», y esa parte se recorta al enseñarla.
const atribucion = (f) => (/^no rights reserved/i.test(f.attribution) && f.attribution_name
  ? `${f.attribution_name}, no rights reserved (${f.license_code.toUpperCase()})` : f.attribution);

// Foto usable: licencia abierta, autor y ningún aviso pendiente. Sin autor no se enseña.
function fotoAbierta(foto) {
  if (!foto || !LICENCIAS_ABIERTAS.has(foto.license_code) || !foto.medium_url || !foto.attribution) return null;
  if (foto.flags?.some((f) => !f.resolved)) return null;
  return {
    url: foto.medium_url,
    pequena: foto.medium_url.replace('/medium.', '/small.'),
    autor: atribucion(foto),
    licencia: foto.license_code.toUpperCase(),
  };
}

export const fotoDe = (taxon) => fotoAbierta(taxon.default_photo);

// Segundo paso de la cadena: la primera foto abierta del taxón, en el orden de iNaturalist.
export function fotoDeTaxon(taxon) {
  for (const foto of [taxon.default_photo, ...(taxon.taxon_photos || []).map((p) => p.photo)]) {
    const f = fotoAbierta(foto);
    if (f) return f;
  }
  return null;
}

const urlWikipedia = (url) => (url ? url.replace(/^http:/, 'https:').replace(/ /g, '_') : null);

export function filaDe(taxon, count) {
  return {
    id: taxon.id,
    cientifico: taxon.name,
    rango: taxon.rank,
    nombre: taxon.preferred_common_name || null,
    nombreEn: taxon.english_common_name || null,
    nombreLocal: null,
    grupo: grupoDe(taxon),
    observaciones: count,
    foto: fotoDe(taxon),
    wikipedia: urlWikipedia(taxon.wikipedia_url),
  };
}

let ultima = 0;
let cola = Promise.resolve();
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

export async function leerCache(url) {
  try {
    const c = await caches.open(CACHE);
    const r = await c.match(url);
    if (!r) return null;
    if (Date.now() - Number(r.headers.get('x-guardado')) > CADUCIDAD_MS) { await c.delete(url); return null; }
    return r.json();
  } catch { return null; }
}

export async function guardarCache(url, texto) {
  try {
    const c = await caches.open(CACHE);
    await c.put(url, new Response(texto, { headers: { 'content-type': 'application/json', 'x-guardado': String(Date.now()) } }));
  } catch { /* sin caché la web sigue funcionando */ }
}

async function pedirRed(url) {
  for (let intento = 0; intento < 4; intento++) {
    const hueco = ultima + INTERVALO_MS - Date.now();
    if (hueco > 0) await espera(hueco);
    ultima = Date.now();
    const r = await fetch(url);
    if (r.ok) {
      const texto = await r.text();
      await guardarCache(url, texto);
      return JSON.parse(texto);
    }
    if (r.status !== 429 && r.status < 500) throw new Error(`inat_${r.status}`);
    await espera(5000 * (intento + 1)); // iNaturalist pide frenar ante un 429
  }
  throw new Error('inat_ocupado');
}

function pedir(ruta, params) {
  const q = new URLSearchParams(params).toString();
  const url = `${API}${ruta}${q ? `?${q}` : ''}`;
  const tarea = cola.then(async () => (await leerCache(url)) || pedirRed(url));
  cola = tarea.catch(() => {});
  return tarea;
}

export function parametros({ meses, calidad }) {
  const p = {};
  if (calidad === 'verificable') p.verifiable = 'true'; else p.quality_grade = 'research';
  if (meses && meses.length && meses.length < 12) p.month = meses.join(',');
  return p;
}

// Suma exacta por especie: los tramos no se solapan.
export async function contarEspecies(tramos, filtros, locale, alAvanzar, cancelado = () => false) {
  const total = new Map();
  let hechas = 0;
  for (const caja of tramos) {
    let pagina = 1;
    for (;;) {
      if (cancelado()) return null;
      const d = await pedir('/v1/observations/species_counts', {
        ...caja, ...parametros(filtros), locale, per_page: 500, page: pagina,
      });
      for (const r of d.results) {
        const e = total.get(r.taxon.id);
        if (e) e.count += r.count; else total.set(r.taxon.id, { taxon: r.taxon, count: r.count });
      }
      if (pagina * 500 >= d.total_results) break;
      pagina += 1;
    }
    hechas += 1;
    alAvanzar?.(hechas, tramos.length, total);
  }
  return total;
}

// Ficha completa de hasta LOTE_TAXONES especies, con taxon_photos y wikipedia_url.
export async function taxones(ids) {
  const d = await pedir(`/v1/taxa/${ids.join(',')}`, {});
  return (d.results || []).map((t) => ({ ...t, wikipedia_url: urlWikipedia(t.wikipedia_url) }));
}

// Puntos reales de una lista de especies, con sus coordenadas públicas.
export async function puntosDe(caja, ids, filtros, maxPaginas = 6, cancelado = () => false, alAvanzar = null) {
  const puntos = [];
  for (let pagina = 1; pagina <= maxPaginas; pagina++) {
    if (cancelado()) return null;
    const d = await pedir('/v2/observations', {
      ...caja, ...parametros(filtros), taxon_id: ids.join(','), per_page: 200, page: pagina,
      geoprivacy: 'open', taxon_geoprivacy: 'open',
      fields: 'id,location,observed_on,taxon.id',
    });
    for (const o of d.results) {
      if (!o.location || !o.taxon) continue;
      const [lat, lon] = o.location.split(',').map(Number);
      puntos.push({ id: o.id, lat, lon, taxon: o.taxon.id, dia: o.observed_on });
    }
    alAvanzar?.(pagina, Math.max(1, Math.min(maxPaginas, Math.ceil(d.total_results / 200))));
    if (pagina * 200 >= d.total_results) break;
  }
  return puntos;
}

// Observaciones por mes del año de una especie en la caja de la ruta.
export async function porMes(caja, taxonId, calidad) {
  const d = await pedir('/v1/observations/histogram', {
    ...caja, ...parametros({ calidad }), taxon_id: taxonId,
    date_field: 'observed', interval: 'month_of_year',
  });
  const m = d.results?.month_of_year || {};
  return Array.from({ length: 12 }, (_, i) => m[i + 1] || 0);
}
