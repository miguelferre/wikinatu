// Tira de tarjetas del héroe: las especies que la ruta va dejando atrás, con su foto abierta.
// Aquí viven también los formatos y la selección de especies que usa la portada.

import { idiomaActual, t } from './i18n.js';

const LOCALES = { es: 'es-ES', en: 'en-GB' };
export const fmt = (v, d = 0) => new Intl.NumberFormat(LOCALES[idiomaActual()], {
  minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: 'always',
}).format(v);

const mayuscula = (s) => s.charAt(0).toLocaleUpperCase('es') + s.slice(1);
export const nombreDe = (e) => mayuscula(e.nombre[idiomaActual()] || e.nombre.en || e.cientifico);

// Las especies más vistas con reparto entre grupos, para que la lista no sea solo de plantas.
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

const ANCHO_MIN = 226; // px de una tarjeta
const MAX_TARJETAS = 4;

// «(c) Nombre, some rights reserved (CC BY-NC), uploaded by...» pasa a «Nombre, CC BY-NC».
const credito = (foto) => t('heroe_foto', {
  autor: foto.autor.replace(/^\(c\)\s*/i, '').split(',')[0],
  licencia: foto.licencia.replace('-', ' '),
});

const nodo = (etiqueta, clase, texto) => {
  const n = document.createElement(etiqueta);
  if (clase) n.className = clase;
  if (texto != null) n.textContent = texto;
  return n;
};

function contenido(li, e) {
  const img = nodo('img');
  img.src = e.foto.pequena; img.alt = ''; img.decoding = 'async'; img.width = 92; img.height = 92;
  const grupo = nodo('p', 'tarjeta-grupo');
  const punto = nodo('i');
  punto.style.background = `var(--c-${e.color})`;
  grupo.append(punto, t(`g_${e.color}`));
  const texto = nodo('div', 'tarjeta-texto');
  texto.append(grupo, nodo('h3', null, nombreDe(e)), nodo('p', 'cientifico', e.cientifico), nodo('p', 'tarjeta-foto', credito(e.foto)));
  li.replaceChildren(img, texto);
}

export const conFoto = (e) => Boolean(e.foto && e.nombre[idiomaActual()]);

// caja: la lista. Cada tarjeta ocupa un hueco; al entrar una nueva, las demás se deslizan.
export function crearTarjetas(caja) {
  let vivas = [];
  const cupo = () => Math.max(1, Math.min(MAX_TARJETAS, Math.floor(caja.clientWidth / ANCHO_MIN)));

  function colocar() {
    const n = cupo();
    caja.style.setProperty('--n', n);
    vivas.forEach((v, i) => v.li.style.setProperty('--i', i));
  }

  function poner(e) {
    const li = nodo('li', 'tarjeta');
    contenido(li, e);
    caja.append(li);
    vivas.push({ e, li });
    while (vivas.length > cupo()) {
      const vieja = vivas.shift();
      vieja.li.classList.add('sale');
      setTimeout(() => vieja.li.remove(), 200);
    }
    colocar();
  }

  function limpiar() {
    vivas = [];
    caja.classList.remove('fija');
    caja.replaceChildren();
  }

  // Movimiento reducido: una fila quieta, que en móvil se recorre con el dedo.
  function fija(lista) {
    limpiar();
    caja.classList.add('fija');
    for (const e of lista) {
      const li = nodo('li', 'tarjeta');
      contenido(li, e);
      caja.append(li);
      vivas.push({ e, li });
    }
  }

  return {
    cupo, poner, limpiar, fija, colocar,
    rotular: () => vivas.forEach((v) => contenido(v.li, v.e)),
  };
}
