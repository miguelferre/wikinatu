// Entrada de rutas: soltar, botón, sessionStorage, ?ruta= y barra guardada en localStorage.

import { leerGpx, simplificar, acumulado } from './geo.js';
import { t } from './i18n.js';

const CLAVE = 'wikinatu.rutas';
const MAX_RUTAS = 24;

const redondear = (x) => Math.round(x * 1e6) / 1e6;

export function leerGuardadas() {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE) || '[]');
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

function escribir(lista) {
  // Si el almacén está lleno se olvidan las rutas más antiguas.
  for (let n = lista.length; n > 0; n--) {
    try {
      localStorage.setItem(CLAVE, JSON.stringify(lista.slice(0, n)));
      return;
    } catch { /* probar con menos */ }
  }
}

const idDe = (nombre, p) => `${nombre}|${p.length}|${p[0][0]},${p[0][1]}`;

export function aRuta(guardada) {
  return { id: guardada.id, nombre: guardada.nombre, puntos: guardada.p.map(([lat, lon, ele]) => ({ lat, lon, ele: ele ?? null })) };
}

// Convierte un GPX en ruta y la deja en la barra. Lanza 'gpx_vacio' si no vale.
export function rutaDesdeGpx(texto, nombreFichero, { recordar = true } = {}) {
  if (!/<gpx[\s>]/i.test(texto)) throw new Error('gpx_vacio');
  const { nombre, puntos } = leerGpx(texto, nombreFichero);
  const validos = puntos.filter((p) => Math.abs(p.lat) <= 85 && Math.abs(p.lon) <= 180);
  // Un paso fino conserva la distancia real: a 8 m la pista de las Hermanas perdía un 10 %.
  const kmTotal = validos.length ? acumulado(validos).at(-1) : 0;
  const limpios = simplificar(validos, Math.max(0.002, kmTotal / 3000));
  if (limpios.length < 2) throw new Error('gpx_vacio');
  const p = limpios.map((q) => (q.ele == null ? [redondear(q.lat), redondear(q.lon)] : [redondear(q.lat), redondear(q.lon), Math.round(q.ele)]));
  const ruta = { id: idDe(nombre, p), nombre, p };
  if (recordar) {
    const lista = leerGuardadas().filter((r) => r.id !== ruta.id);
    lista.unshift(ruta);
    escribir(lista.slice(0, MAX_RUTAS));
  }
  return aRuta(ruta);
}

export function olvidar(id) {
  escribir(leerGuardadas().filter((r) => r.id !== id));
}

export function pintarBarra(actualId, { alAbrir, alQuitar }) {
  const ul = document.getElementById('listaRutas');
  ul.replaceChildren(...leerGuardadas().map((r) => {
    const li = document.createElement('li');
    const abrir = document.createElement('button');
    abrir.type = 'button';
    abrir.className = 'ruta-chip';
    abrir.textContent = r.nombre;
    abrir.title = r.nombre;
    abrir.setAttribute('aria-current', String(r.id === actualId));
    abrir.addEventListener('click', () => alAbrir(aRuta(r)));
    const quitar = document.createElement('button');
    quitar.type = 'button';
    quitar.className = 'ruta-quitar';
    quitar.setAttribute('aria-label', t('quitar_ruta', { n: r.nombre }));
    quitar.innerHTML = '<svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" stroke-width="1.4"/></svg>';
    quitar.addEventListener('click', () => alQuitar(r.id));
    li.append(abrir, quitar);
    return li;
  }));
}

async function leerFicheros(ficheros, alRuta, alError) {
  let primera = null;
  for (const f of ficheros) {
    try {
      const ruta = rutaDesdeGpx(await f.text(), f.name);
      primera ||= ruta;
    } catch {
      alError(t('err_gpx', { n: f.name }));
    }
  }
  if (primera) alRuta(primera);
}

// Soltar en cualquier parte de la página, con capa que lo anuncia.
export function iniciarEntrada({ alRuta, alError }) {
  const capa = document.getElementById('soltar');
  const fichero = document.getElementById('fichero');
  let dentro = 0;
  const conFicheros = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  addEventListener('dragenter', (e) => {
    if (!conFicheros(e)) return;
    e.preventDefault();
    dentro += 1;
    capa.hidden = false;
  });
  addEventListener('dragover', (e) => { if (conFicheros(e)) e.preventDefault(); });
  addEventListener('dragleave', () => {
    dentro = Math.max(0, dentro - 1);
    if (!dentro) capa.hidden = true;
  });
  addEventListener('drop', (e) => {
    if (!conFicheros(e)) return;
    e.preventDefault();
    dentro = 0;
    capa.hidden = true;
    leerFicheros([...e.dataTransfer.files], alRuta, alError);
  });
  for (const id of ['btnGpx', 'btnGpx2']) document.getElementById(id).addEventListener('click', () => fichero.click());
  fichero.addEventListener('change', () => {
    leerFicheros([...fichero.files], alRuta, alError);
    fichero.value = '';
  });
}

// Ruta que pide la propia URL o la portada. Devuelve null si no pide nada.
export async function rutaInicial() {
  const params = new URLSearchParams(location.search);
  const slug = params.get('ruta');
  if (slug) {
    if (!/^[a-z0-9-]+$/.test(slug)) throw new Error('ejemplo');
    const r = await fetch(`data/${slug}.gpx`);
    if (!r.ok) throw new Error('ejemplo');
    return rutaDesdeGpx(await r.text(), `${slug}.gpx`, { recordar: false });
  }
  let texto = null;
  try {
    texto = sessionStorage.getItem('wikinatu.gpx');
    sessionStorage.removeItem('wikinatu.gpx');
  } catch { /* sin almacenamiento */ }
  if (texto) return rutaDesdeGpx(texto, 'ruta.gpx');
  const guardadas = leerGuardadas();
  return guardadas.length ? aRuta(guardadas[0]) : null;
}
