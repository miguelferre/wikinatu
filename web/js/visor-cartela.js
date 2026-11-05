// Cartela de la lámina: nombre, medidas, especies y clave de colores. En HTML: se lee y se selecciona.

import { t } from './i18n.js';
import { cajaDe } from './geo.js';

const el = (etiqueta, clase, texto) => {
  const e = document.createElement(etiqueta);
  if (clase) e.className = clase;
  if (texto != null) e.textContent = texto;
  return e;
};

const ORDEN = ['plantas', 'aves', 'insectos', 'hongos', 'mamiferos', 'herpetos', 'otros'];

function fila(dt, dd, clave = null) {
  const d = el('div');
  const valor = el('dd', null, dd);
  if (clave) valor.dataset.c = clave;
  d.append(el('dt', null, dt), valor);
  return d;
}

function urlOsm(puntos) {
  const c = cajaDe(puntos);
  const lat = (c.swlat + c.nelat) / 2, lon = (c.swlng + c.nelng) / 2;
  const ext = Math.max(c.nelat - c.swlat, c.nelng - c.swlng, 0.001);
  const z = Math.max(5, Math.min(16, Math.round(Math.log2(360 / ext)) - 1));
  return `https://www.openstreetmap.org/#map=${z}/${lat.toFixed(4)}/${lon.toFixed(4)}`;
}

export function pintarCartela(caja, { nombre, resumen, filas, ventana, puntos, esquina, sinRelieve, formato, textoEspecies }) {
  caja.dataset.esquina = esquina;
  const dl = el('dl');
  if (resumen) {
    const km = new Intl.NumberFormat(document.documentElement.lang === 'en' ? 'en-GB' : 'es-ES', { maximumFractionDigits: 1 }).format(resumen.km);
    dl.append(fila(t('c_distancia'), `${km} km`));
    if (resumen.sube != null) {
      dl.append(fila(t('c_desnivel'), `+${formato(resumen.sube)} m`));
      dl.append(fila(t('c_altitud'), t('c_alt_rango', { min: formato(resumen.min), max: formato(resumen.max) })));
    }
  }
  dl.append(fila(t('c_especies'), textoEspecies(filas.length), 'especies'));
  dl.append(fila(t('c_meses'), ventana, 'ventana'));

  const clave = el('ul', 'cartela-clave');
  const ruta = el('li');
  ruta.append(el('span', 'punto punto-ruta'), el('span', null, t('c_ruta')));
  clave.append(ruta);
  const presentes = new Set(filas.slice(0, 40).map((f) => f.grupo.color));
  for (const c of ORDEN) {
    if (!presentes.has(c)) continue;
    const li = el('li');
    const p = el('span', 'punto');
    p.style.background = `var(--c-${c})`;
    li.append(p, el('span', null, t(`l_${c}`)));
    clave.append(li);
  }

  const pie = el('p', 'cartela-pie');
  const a = el('a', null, t('c_osm'));
  a.href = urlOsm(puntos);
  a.rel = 'noopener';
  a.target = '_blank';
  pie.append(a);

  const partes = [el('p', 'cartela-sup', t('cartela_sup')), el('p', 'cartela-titulo', nombre), dl, clave];
  if (sinRelieve) partes.push(el('p', 'cartela-pie', t('c_sin_relieve')));
  partes.push(pie);
  caja.replaceChildren(...partes);
}
