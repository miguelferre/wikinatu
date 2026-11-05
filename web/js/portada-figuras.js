// Figuras de la portada: corte del Chimborazo, mes y sesgo, método y pie.
// La anatomía y las páginas de la guía están en portada-anatomia.js.

import { cargarDem } from './terrain.js';
import { t, idiomaActual } from './i18n.js';
import { fmt } from './heroe-tira.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (nombre, attrs = {}, padre, texto) => {
  const n = document.createElementNS(NS, nombre);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (texto != null) n.textContent = texto;
  padre?.append(n);
  return n;
};

export const cuandoCerca = (nodo, fn) => {
  const o = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    o.disconnect();
    fn();
  }, { rootMargin: '700px' });
  o.observe(nodo);
};

/* Fig. 1. Corte real del Chimborazo, de oeste a este, por la latitud de su cima. */

const CIMA = { lat: -1.46917, lon: -78.8175 }; // en.wikipedia.org/wiki/Chimborazo
const OESTE = -79.42, ESTE = -78.3;
const MUESTRAS = 720;
const TECHO_M = 7000;
const KM_GRADO = 111.3;

async function perfilChimborazo() {
  const caja = { swlat: CIMA.lat - 0.008, nelat: CIMA.lat + 0.008, swlng: OESTE, nelng: ESTE };
  const dem = await cargarDem(caja, 1400);
  const alts = [];
  for (let i = 0; i < MUESTRAS; i++) {
    const lon = OESTE + ((ESTE - OESTE) * i) / (MUESTRAS - 1);
    alts.push(dem.altura(CIMA.lat, lon) ?? 0);
  }
  return alts;
}

function pintarCorte(caja, alts, datos) {
  const w = caja.clientWidth;
  const ancho = w >= 760;
  const h = ancho ? Math.min(520, w * 0.42) : 340;
  const izq = ancho ? 58 : 40, der = ancho ? 58 : 12, arr = 16, aba = 30;
  const iw = w - izq - der, ih = h - arr - aba;
  const X = (i) => izq + (i / (MUESTRAS - 1)) * iw;
  const Y = (a) => arr + ih - (Math.max(0, a) / TECHO_M) * ih;
  const totalKm = (ESTE - OESTE) * KM_GRADO;
  const pxKm = iw / totalKm;
  const exageracion = (ih / (TECHO_M / 1000)) / pxKm;

  const svg = el('svg', { viewBox: `0 0 ${w} ${h}`, width: w, height: h, 'aria-hidden': 'true' });

  // Columnas de altura en los dos cantos, como en el cuadro de 1807.
  for (let m = 0; m <= TECHO_M; m += 1000) {
    const y = Y(m);
    el('path', { class: 'corte-nivel', d: `M${izq} ${y}H${w - der}` }, svg);
    el('text', { class: 'corte-m', x: izq - 8, y: y + 4, 'text-anchor': 'end' }, svg, fmt(m, 0));
    if (ancho) el('text', { class: 'corte-m', x: w - der + 8, y: y + 4 }, svg, fmt(m, 0));
  }
  el('path', { class: 'corte-canto', d: `M${izq} ${arr}V${arr + ih}M${w - der} ${arr}V${arr + ih}` }, svg);

  const cresta = alts.map((a, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(a).toFixed(1)}`).join('');
  el('path', { class: 'corte-monte', d: `${cresta}L${X(MUESTRAS - 1)} ${arr + ih}L${izq} ${arr + ih}Z` }, svg);
  let plumas = '';
  for (let x = izq + 2, n = 0; x < w - der; x += 3, n++) {
    const i = Math.round(((x - izq) / iw) * (MUESTRAS - 1));
    const y = Y(alts[i]);
    const largo = Math.min(arr + ih - y, 10 + (Math.sin(n * 1.7) + Math.sin(n * 0.61) + 2) * 7 + (arr + ih - y) * 0.22);
    plumas += `M${x} ${(y + 2).toFixed(1)}v${largo.toFixed(1)}`;
  }
  el('path', { class: 'corte-pluma', d: plumas }, svg);
  el('path', { class: 'corte-cresta', d: cresta }, svg);

  const iCima = alts.indexOf(Math.max(...alts));
  let iHumboldt = iCima;
  while (iHumboldt > 0 && alts[iHumboldt] > 5878) iHumboldt--;
  const r = datos.resumen;
  let iTristaina = iCima;
  while (iTristaina > 0 && alts[iTristaina] > r.altMax) iTristaina--;

  // La ruta de ejemplo, a la misma escala y a su altura, sobre la ladera oeste.
  const anchoRuta = Math.max(3, r.km * pxKm);
  const rx = X(iTristaina) - anchoRuta - 2, ry = Y((r.altMin + r.altMax) / 2);
  const rotulos = [
    { x: X(iCima), y: Y(alts[iCima]), texto: t('corte_cima'), clase: 'oro', lado: 1 },
    { x: X(iHumboldt), y: Y(5878), texto: t('corte_humboldt'), clase: 'ruta', lado: -1 },
    { x: rx + anchoRuta / 2, y: ry, texto: t('corte_ruta', { min: fmt(r.altMin, 0), max: fmt(r.altMax, 0) }), clase: 'ruta', lado: -1 },
  ];
  el('path', { class: 'corte-tramo', d: `M${rx} ${ry}h${anchoRuta}` }, svg);
  for (const q of rotulos) {
    el('circle', { class: `corte-punto ${q.clase}`, cx: q.x, cy: q.y, r: 4 }, svg);
    const dx = q.lado * (ancho ? 26 : 16), dy = -(ancho ? 26 : 16);
    el('path', { class: 'corte-guia', d: `M${q.x} ${q.y}l${dx} ${dy}h${q.lado * 8}` }, svg);
    // En móvil, los rótulos del oeste empiezan en el canto: no caben hacia la izquierda.
    const alCanto = !ancho && q.lado < 0;
    el('text', {
      class: 'corte-rotulo', x: alCanto ? izq + 5 : q.x + dx + q.lado * 12, y: q.y + dy + (alCanto ? -6 : 5),
      'text-anchor': q.lado > 0 || alCanto ? 'start' : 'end',
    }, svg, q.texto);
  }

  el('text', { class: 'corte-m', x: izq, y: h - 8 }, svg, t('corte_oeste'));
  el('text', { class: 'corte-m', x: w - der, y: h - 8, 'text-anchor': 'end' }, svg, t('corte_este'));
  const esc = 20 * pxKm, ex = izq + iw / 2 - esc / 2;
  el('path', { class: 'corte-escala', d: `M${ex} ${h - 18}v5h${esc}v-5` }, svg);
  el('text', { class: 'corte-m', x: ex + esc / 2, y: h - 2, 'text-anchor': 'middle' }, svg, t('corte_km', { n: 20 }));

  caja.replaceChildren(svg);
  document.getElementById('corte-pie').textContent = t('corte_pie', { x: fmt(exageracion, 0) });
}

export function iniciarCorte(datos) {
  const caja = document.getElementById('corte');
  let alts = null;
  let ancho = 0;
  const pintar = () => {
    if (!alts) return;
    ancho = caja.clientWidth;
    pintarCorte(caja, alts, datos);
  };
  cuandoCerca(caja, async () => {
    try {
      alts = await perfilChimborazo();
      pintar();
    } catch {
      document.getElementById('corte-pie').textContent = t('corte_pie_sin');
      caja.classList.add('vacio');
    }
  });
  new ResizeObserver(() => { if (Math.abs(caja.clientWidth - ancho) > 2) pintar(); }).observe(caja);
  return pintar;
}

/* Fig. 4 y 5. Las cifras de Hermanas son las del encargo; las de Tristaina, del JSON. */

const HERMANAS = [['embudo_ano', 1126], ['embudo_trim', 518], ['embudo_mes', 298]];

export function pintarMes(datos) {
  const embudo = document.getElementById('embudo');
  embudo.replaceChildren(...HERMANAS.map(([clave, n]) => {
    const fila = document.createElement('div');
    const dt = document.createElement('dt');
    dt.textContent = t(clave);
    const dd = document.createElement('dd');
    const barra = document.createElement('span');
    barra.style.setProperty('--f', String(n / HERMANAS[0][1]));
    const cifra = document.createElement('b');
    cifra.className = 'num';
    cifra.textContent = fmt(n, 0);
    dd.append(barra, cifra);
    fila.append(dt, dd);
    return fila;
  }));

  const meses = datos.porMes;
  const max = Math.max(...meses.map((m) => m.especies));
  const iniciales = t('meses_ini');
  const nombres = t('meses');
  const barras = document.getElementById('barras-mes');
  barras.replaceChildren(...meses.map((m, i) => {
    const col = document.createElement('div');
    col.className = 'barra-mes';
    const n = document.createElement('b');
    n.className = 'num';
    n.textContent = fmt(m.especies, 0);
    const b = document.createElement('span');
    b.style.setProperty('--f', String(m.especies / max));
    const e = document.createElement('i');
    e.textContent = iniciales[i];
    col.append(n, b, e);
    return col;
  }));
  barras.setAttribute('aria-label', t('barras_alt', { lista: meses.map((m, i) => `${nombres[i]} ${m.especies}`).join(', ') }));
  document.getElementById('barras-pie').textContent = t('barras_pie');
  const julio = meses[6].especies;
  document.getElementById('mes-p2').textContent = t('mes_p2', { julio: fmt(julio, 0), total: fmt(datos.resumen.especies, 0) });
}

export function pintarMetodo(datos) {
  document.getElementById('met1').textContent = t('met1', { n: fmt(datos.resumen.tramos, 0) });
  const fecha = new Date(`${datos.consultado}T12:00:00`).toLocaleDateString(idiomaActual() === 'es' ? 'es-ES' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  document.getElementById('pie-datos').textContent = t('pie_datos', { fecha });
}
