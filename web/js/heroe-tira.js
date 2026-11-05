// Tira inferior del héroe: el perfil real de la ruta y el cuadro que se va escribiendo.
// Es SVG: rótulos nítidos a cualquier tamaño y texto que cambia con el idioma.

import { idiomaActual } from './i18n.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (nombre, attrs = {}, padre) => {
  const n = document.createElementNS(NS, nombre);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  padre?.append(n);
  return n;
};

const LOCALES = { es: 'es-ES', en: 'en-GB' };
export const fmt = (v, d = 0) => new Intl.NumberFormat(LOCALES[idiomaActual()], {
  minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: 'always',
}).format(v);

const mayuscula = (s) => s.charAt(0).toLocaleUpperCase('es') + s.slice(1);
export const nombreDe = (e) => mayuscula(e.nombre[idiomaActual()] || e.nombre.en || e.cientifico);

function suavizarAlturas(ruta, radio = 3) {
  return ruta.map((_, i) => {
    let s = 0, n = 0;
    for (let k = Math.max(0, i - radio); k <= Math.min(ruta.length - 1, i + radio); k++) { s += ruta[k].alt; n++; }
    return s / n;
  });
}

// Las especies más vistas con reparto entre grupos, para que el cuadro no sea solo de plantas.
export function elegirEspecies(datos, n) {
  const lang = idiomaActual();
  const porTaxon = new Map();
  for (const p of datos.puntos) {
    if (!porTaxon.has(p.taxon)) porTaxon.set(p.taxon, []);
    porTaxon.get(p.taxon).push(p.km);
  }
  const candidatas = datos.especies
    .filter((e) => porTaxon.has(e.id))
    .sort((a, b) => Number(Boolean(b.nombre[lang])) - Number(Boolean(a.nombre[lang])) || b.observaciones - a.observaciones);
  const cupo = Math.ceil(n * 0.42);
  const usados = {};
  const out = [];
  for (const e of candidatas) {
    if (out.length >= n) break;
    if ((usados[e.color] || 0) >= cupo) continue;
    usados[e.color] = (usados[e.color] || 0) + 1;
    const kms = porTaxon.get(e.id).sort((a, b) => a - b);
    out.push({ e, km: kms[Math.floor(kms.length / 2)] });
  }
  return out.sort((a, b) => a.km - b.km);
}

function repartir(xs, min, max, hueco) {
  const out = xs.slice();
  for (let i = 0; i < out.length; i++) out[i] = Math.max(out[i], i ? out[i - 1] + hueco : min);
  for (let i = out.length - 1; i >= 0; i--) out[i] = Math.min(out[i], i < out.length - 1 ? out[i + 1] - hueco : max);
  return out;
}

export function dibujarTira(svg, datos, { w, h, km = 0 }) {
  const ruta = datos.ruta;
  const total = ruta[ruta.length - 1].km;
  const ancho = w >= 900;
  const pie = document.querySelector('.heroe-pie').offsetHeight;
  const banda = Math.min(84, Math.max(44, h * 0.085));
  const suelo = h - pie - 30;
  const cima = suelo - banda;
  const pies = cima - (ancho ? 12 : 10);
  const zona = ancho ? 158 : 112;
  const margen = ancho ? Math.min(56, w * 0.04) : 16;
  const alts = suavizarAlturas(ruta);
  const aMin = Math.min(...alts), aMax = Math.max(...alts);
  const X = (k) => margen + (k / total) * (w - margen * 2);
  const Y = (a) => suelo - ((a - aMin) / (aMax - aMin)) * banda;
  const altEn = (k) => {
    let i = 1;
    while (i < ruta.length - 1 && ruta[i].km < k) i++;
    return alts[i];
  };

  svg.replaceChildren();
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('width', w);
  svg.setAttribute('height', h);

  const linea = ruta.map((p, i) => `${i ? 'L' : 'M'}${X(p.km).toFixed(1)} ${Y(alts[i]).toFixed(1)}`).join('');
  const defs = el('defs', {}, svg);
  const recorte = el('clipPath', { id: 'tira-andado' }, defs);
  const rect = el('rect', { x: 0, y: 0, width: X(km), height: h }, recorte);

  // Silueta: tinta plana hasta el borde y plumeado de grabado bajo la cresta.
  el('path', { class: 'tira-monte', d: `M0 ${Y(alts[0])}L${linea.slice(1)}L${w} ${Y(alts[alts.length - 1])}V${h}H0Z` }, svg);
  let plumas = '';
  let plumasFinas = '';
  for (let x = margen, n = 0; x <= w - margen; x += 3, n++) {
    const k = ((x - margen) / (w - margen * 2)) * total;
    const y = Y(altEn(k));
    const largo = 9 + ((y - cima) / banda) * -6 + (Math.sin(n * 1.7) + Math.sin(n * 0.61)) * 3 + 10;
    if (n % 2) plumasFinas += `M${x} ${(y + 3).toFixed(1)}v${(largo * 0.6).toFixed(1)}`;
    else plumas += `M${x} ${(y + 3).toFixed(1)}v${largo.toFixed(1)}`;
  }
  el('path', { class: 'tira-pluma', d: plumas }, svg);
  el('path', { class: 'tira-pluma fina', d: plumasFinas }, svg);
  el('path', { class: 'tira-cresta', d: linea }, svg);
  el('path', { class: 'tira-andada', d: linea, 'clip-path': 'url(#tira-andado)' }, svg);

  // Marcas de km y las dos altitudes extremas, en el borde.
  for (let k = 0; k <= Math.floor(total); k++) {
    el('path', { class: 'tira-marca', d: `M${X(k)} ${suelo + 5}v5` }, svg);
    const n = el('text', { class: 'tira-km', x: X(k), y: suelo + 21, 'text-anchor': k ? 'middle' : 'start' }, svg);
    n.textContent = k ? String(k) : '0 km';
  }

  const capaEtiquetas = el('g', {}, svg);
  const caminante = el('circle', { class: 'tira-caminante', r: 4, cx: X(km), cy: Y(altEn(km)) }, svg);

  let etiquetas = [];
  function rotular() {
    capaEtiquetas.replaceChildren();
    const elegidas = elegirEspecies(datos, ancho ? Math.min(24, Math.round(w / 60)) : Math.floor(w / 42));
    const conCientifico = w >= 1280 && h >= 820;
    const derecha = w - (conCientifico ? 240 : ancho ? 150 : 84);
    const xs = repartir(elegidas.map(({ km: k }) => X(k)), margen + 6, derecha, Math.min(ancho ? 48 : 34, (derecha - margen) / elegidas.length));
    etiquetas = elegidas.map(({ e, km: k }, i) => {
      const g = el('g', { class: 'tira-etiqueta' }, capaEtiquetas);
      const ax = X(k), ay = Y(altEn(k));
      el('path', { class: 'tira-guia', d: `M${ax} ${ay}L${xs[i]} ${pies}`, pathLength: 1 }, g);
      el('circle', { class: 'tira-punto', cx: ax, cy: ay, r: ancho ? 3.4 : 3, fill: `var(--c-${e.color})` }, g);
      const texto = el('text', { class: 'tira-nombre', transform: `translate(${xs[i] + 2} ${pies - 3}) rotate(-55)` }, g);
      const a = el('tspan', {}, texto); a.textContent = nombreDe(e);
      if (conCientifico) {
        const b = el('tspan', { class: 'tira-cientifico', dx: 6 }, texto);
        b.textContent = e.cientifico;
      }
      return { g, km: k };
    });
    avanzar(ultimoKm);
  }

  let ultimoKm = km;
  function avanzar(k) {
    ultimoKm = k;
    rect.setAttribute('width', X(k));
    caminante.setAttribute('cx', X(k));
    caminante.setAttribute('cy', Y(altEn(k)));
    caminante.classList.toggle('llega', k >= total);
    for (const et of etiquetas) et.g.classList.toggle('encendida', k >= et.km);
  }

  rotular();
  return { techo: pies - zona, avanzar, limpiar: () => avanzar(0), rotular };
}
