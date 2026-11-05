// Último paso de la cadena de fotos: la imagen del artículo de Wikipedia.
// La licencia y el autor se comprueban en Wikimedia Commons, fichero a fichero.
// Sin DOM: también corre en node (tests/fotos.test.mjs).

import { guardarCache, leerCache } from './inat.js';

const COMMONS = 'https://commons.wikimedia.org/w/api.php';
const LOTE = 40;
const ANCHO = 500, ANCHO_PEQUENA = 250;
const META = 'LicenseShortName|License|Artist|Attribution|NonFree';
const ESPERA_MS = 20000;

// El artículo de una especie a veces abre con su mapa de distribución.
const NO_ES_FOTO = /(\.svg|\.gif|\.tiff?|\.pdf)$|(^|[\s_(-])(map|mapa|range|distribution|distribuci[oó]n)([\s_).-]|$)/i;

export function licenciaLibre(meta = {}) {
  const v = (k) => String(meta[k]?.value ?? '').trim();
  if (/^true$/i.test(v('NonFree'))) return null;
  const codigo = v('License').toLowerCase();
  const corto = v('LicenseShortName');
  const libre = codigo
    ? /^(cc0|pd)$/.test(codigo) || /^cc-by(-sa)?-\d/.test(codigo)
    : /^(cc0|public domain|cc by(-sa)? \d)/i.test(corto);
  return libre ? corto || codigo.toUpperCase() : null;
}

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

// Valores de Artist que no nombran a nadie. «self» y compañía sí dicen algo: el autor es quien lo subió.
const SIN_NOMBRE = /^(unknown|anonymous|desconocid|an[oó]nimo|no rights reserved)/i;
const QUIEN_SUBE = /^(self|me|myself|i|own work)\.?$/i;

// Artist llega en HTML, a veces con plantillas enteras. Sin un nombre legible no hay foto.
export function autorDe(html, subio = '') {
  const texto = String(html ?? '')
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (todo, e) => {
      if (e[0] !== '#') return ENTIDADES[e.toLowerCase()] ?? todo;
      return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
    })
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^No machine-readable author provided\.\s*/i, '')
    .replace(/\s*assumed \(based on copyright claims\)\.?$/i, '')
    .replace(/^Author:\s*/i, '');
  if (!texto || SIN_NOMBRE.test(texto)) return '';
  if (QUIEN_SUBE.test(texto)) return subio ? autorDe(subio) : '';
  return texto.length > 70 ? `${texto.slice(0, 69).trimEnd()}…` : texto;
}

export function fotoWiki(info) {
  if (!info || !/^image\/(jpeg|png|webp)$/.test(info.mime || '')) return null;
  const licencia = licenciaLibre(info.extmetadata);
  const autor = autorDe(info.extmetadata?.Artist?.value, info.user) || autorDe(info.extmetadata?.Attribution?.value);
  const url = (info.thumburl || info.url || '').split('?')[0];
  if (!licencia || !autor || !url) return null;
  return {
    url,
    pequena: url.replace(`/${ANCHO}px-`, `/${ANCHO_PEQUENA}px-`),
    autor: `${autor}, ${licencia}, Wikimedia Commons`,
    licencia,
    fuente: info.descriptionurl || null,
  };
}

// Título del artículo. El enlace de iNaturalist es de fiar; el nombre científico puede
// redirigir al género, y entonces la imagen sería de otra especie.
export function tituloDe(fila, idioma) {
  const m = /^https:\/\/([a-z-]+)\.wikipedia\.org\/wiki\/(.+)$/.exec(fila.wikipedia || '');
  if (m && m[1] === idioma) {
    try { return { titulo: decodeURIComponent(m[2]).replace(/_/g, ' '), fiable: true }; } catch { /* enlace roto */ }
  }
  return { titulo: fila.cientifico, fiable: false };
}

export function imagenUtil(nombre, fila, { fiable, redirigida }) {
  if (!nombre || NO_ES_FOTO.test(nombre)) return false;
  if (fiable || !redirigida) return true;
  const epiteto = fila.cientifico.split(' ').at(-1).toLowerCase();
  return nombre.toLowerCase().includes(epiteto);
}

let cola = Promise.resolve();

function pedirWiki(url) {
  const tarea = cola.then(async () => {
    const guardado = await leerCache(url);
    if (guardado) return guardado;
    const r = await fetch(url, { signal: AbortSignal.timeout(ESPERA_MS) });
    if (!r.ok) throw new Error(`wiki_${r.status}`);
    const texto = await r.text();
    const d = JSON.parse(texto);
    if (d.error) throw new Error(`wiki_${d.error.code}`);
    await guardarCache(url, texto);
    return d;
  });
  cola = tarea.catch(() => {});
  return tarea;
}

const consulta = (base, params) => `${base}?${new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', origin: '*', ...params })}`;

const trocear = (lista, n) => Array.from({ length: Math.ceil(lista.length / n) }, (_, i) => lista.slice(i * n, (i + 1) * n));

// [{ fila, titulo, fiable }] -> [{ ..., imagen, redirigida }] con lo que encontró ese Wikipedia.
async function imagenesDe(idioma, pedidos) {
  const d = await pedirWiki(consulta(`https://${idioma}.wikipedia.org/w/api.php`, {
    prop: 'pageimages', piprop: 'name', pilimit: String(LOTE), redirects: '1',
    titles: [...new Set(pedidos.map((p) => p.titulo))].join('|'),
  }));
  const normal = new Map((d.query?.normalized || []).map((r) => [r.from, r.to]));
  const redir = new Map((d.query?.redirects || []).map((r) => [r.from, r.to]));
  const paginas = new Map((d.query?.pages || []).map((p) => [p.title, p]));
  return pedidos.map((p) => {
    let titulo = normal.get(p.titulo) ?? p.titulo;
    let redirigida = false;
    for (let i = 0; i < 5 && redir.has(titulo); i++) { titulo = redir.get(titulo); redirigida = true; }
    return { ...p, redirigida, imagen: paginas.get(titulo)?.pageimage ?? null };
  });
}

// Nombre de fichero -> imageinfo. Solo vale lo que está en Commons.
async function fichas(nombres) {
  const titulos = nombres.map((n) => `File:${n}`);
  const d = await pedirWiki(consulta(COMMONS, {
    prop: 'imageinfo', iiprop: 'url|mime|user|extmetadata', iiurlwidth: String(ANCHO),
    iiextmetadatafilter: META, titles: titulos.join('|'),
  }));
  const normal = new Map((d.query?.normalized || []).map((r) => [r.from, r.to]));
  const paginas = new Map((d.query?.pages || []).map((p) => [p.title, p]));
  return new Map(nombres.map((n, i) => {
    const titulo = titulos[i];
    return [n, paginas.get(normal.get(titulo) ?? titulo)?.imageinfo?.[0] ?? null];
  }));
}

// Devuelve id -> foto de las filas que la tienen. Prueba los idiomas en orden.
export async function fotosWiki(filas, idiomas = ['en']) {
  const fotos = new Map();
  for (const idioma of idiomas) {
    const faltan = filas.filter((f) => !fotos.has(f.id));
    for (const lote of trocear(faltan, LOTE)) {
      const pedidos = lote.map((fila) => ({ fila, ...tituloDe(fila, idioma) }));
      const halladas = (await imagenesDe(idioma, pedidos)).filter((h) => imagenUtil(h.imagen, h.fila, h));
      if (!halladas.length) continue;
      const info = await fichas([...new Set(halladas.map((h) => h.imagen))]);
      for (const h of halladas) {
        const foto = fotoWiki(info.get(h.imagen));
        if (foto) fotos.set(h.fila.id, foto);
      }
    }
  }
  return fotos;
}
