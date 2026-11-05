// Cliente de iNaturalist. Una petición por segundo, en serie, con caché.
// Límite: inaturalist.org/pages/api+recommended+practices (leído el 2026-11-05).

const API = 'https://api.inaturalist.org';
const INTERVALO_MS = 1050;
const CACHE = 'wikinatu-v1';
const CADUCIDAD_MS = 3 * 24 * 3600 * 1000;

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

export function fotoDe(taxon) {
  const foto = taxon.default_photo;
  if (!foto || !LICENCIAS_ABIERTAS.has(foto.license_code) || !foto.medium_url) return null;
  return {
    url: foto.medium_url,
    pequena: foto.medium_url.replace('/medium.', '/small.'),
    autor: foto.attribution || '',
    licencia: foto.license_code.toUpperCase(),
  };
}

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
    wikipedia: taxon.wikipedia_url ? taxon.wikipedia_url.replace(/^http:/, 'https:') : null,
  };
}

let ultima = 0;
let cola = Promise.resolve();
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function leerCache(url) {
  try {
    const c = await caches.open(CACHE);
    const r = await c.match(url);
    if (!r) return null;
    if (Date.now() - Number(r.headers.get('x-guardado')) > CADUCIDAD_MS) { await c.delete(url); return null; }
    return r.json();
  } catch { return null; }
}

async function guardarCache(url, texto) {
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
  const url = `${API}${ruta}?${new URLSearchParams(params)}`;
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
    alAvanzar?.(hechas, tramos.length);
  }
  return total;
}

// Puntos reales de una lista de especies, con sus coordenadas públicas.
export async function puntosDe(caja, ids, filtros, maxPaginas = 6, cancelado = () => false) {
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
