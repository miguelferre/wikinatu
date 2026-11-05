// Página 1 de la guía: título, ventana, datos clave, mapa de situación y grupos.

import { t } from './i18n.js';
import { crearLamina } from './lamina.js';
import { recuentoGrupos } from './analisis.js';
import { coordenadasTexto, gruposPortada } from './guia-filtro.js';
import { S, fechaTexto, formato, ventanaTexto } from './visor.js';
import { ponerTitulo } from './visor-cartela.js';

const TITULO_MAX_PT = 50, TITULO_MIN_PT = 13, TITULO_ALTO_MM = 40, ANCHO_MM = 132;

const el = (etiqueta, clase, texto) => {
  const e = document.createElement(etiqueta);
  if (clase) e.className = clase;
  if (texto != null) e.textContent = texto;
  return e;
};

// Viñeta sin marco: el relieve y la ruta, nada más. Ni puntos ni retícula.
async function imagenMapa() {
  const caja = el('div');
  caja.style.cssText = 'position:fixed;left:-20000px;top:0;width:520px;height:520px;';
  document.body.append(caja);
  const l = await crearLamina(caja, { puntos: S.ruta.puntos, nombre: S.ruta.nombre }, { papel: true, densidad: 2, marco: false });
  const url = l.lienzoComoImagen('image/jpeg', 0.9);
  l.destruir();
  caja.remove();
  return url;
}

// El mayor cuerpo con el que el título cabe en su caja sin partir palabras latinas.
async function cuerpoTitulo(texto) {
  await document.fonts?.load('400 40px Anton').catch(() => {});
  const m = ponerTitulo(el('div', 'g-medida'), texto);
  m.style.width = `${ANCHO_MM}mm`;
  document.body.append(m);
  const altoMax = (TITULO_ALTO_MM / 25.4) * 96;
  let pt = TITULO_MAX_PT;
  for (; pt > TITULO_MIN_PT; pt -= 1) {
    m.style.fontSize = `${pt}pt`;
    if (m.scrollHeight <= altoMax && m.scrollWidth <= m.clientWidth) break;
  }
  m.remove();
  return pt;
}

function datos(filas) {
  const dl = el('dl', 'g-datos');
  const r = S.resumen;
  const km = new Intl.NumberFormat(document.documentElement.lang === 'en' ? 'en-GB' : 'es-ES', { maximumFractionDigits: (r?.km ?? 0) < 10 ? 2 : 1 }).format(r?.km ?? 0);
  const lista = [[t('c_distancia'), `${km} km`]];
  if (r?.sube != null) {
    lista.push([t('c_desnivel'), `+${formato(r.sube)} m`]);
    lista.push([t('c_altitud'), t('c_alt_rango', { min: formato(r.min), max: formato(r.max) })]);
  }
  lista.push([t('c_especies'), formato(filas.length)]);
  for (const [a, b] of lista) {
    const d = el('div');
    d.append(el('dt', null, a), el('dd', null, b));
    dl.append(d);
  }
  return dl;
}

function mapa(url) {
  const f = el('figure', 'g-mapa');
  const img = el('img');
  img.src = url; img.alt = '';
  const p = S.ruta.puntos[0];
  f.append(img, el('figcaption', null, t('g_inicio', { c: coordenadasTexto(p.lat, p.lon) })));
  return f;
}

function barras(filas) {
  const s = el('div', 'g-barras-caja');
  const lista = gruposPortada(recuentoGrupos(filas));
  const mayor = Math.max(...lista.map((g) => g.n), 1);
  const ul = el('ul', 'g-barras');
  for (const g of lista) {
    const li = el('li');
    const pista = el('span', 'g-barra-pista');
    const b = el('span', 'g-barra');
    b.style.width = `${Math.max(1.5, (g.n / mayor) * 100)}%`;
    b.style.background = `var(--c-${g.color})`;
    pista.append(b);
    li.append(el('span', 'g-barra-nombre', g.resto ? t('g_otros_grupos') : t(`g_${g.id}`)), pista, el('span', 'g-barra-n', formato(g.n)));
    ul.append(li);
  }
  s.append(el('h2', 'g-sub', t('g_por_grupo')), ul);
  return s;
}

// «Aves» o «Aves, Anfibios». Con muchos grupos basta la cifra.
function textoSeleccion(grupos) {
  if (!grupos) return null;
  const nombres = recuentoGrupos(S.filas).filter((g) => grupos.includes(g.id)).map((g) => t(`g_${g.id}`));
  return t('g_seleccion', { grupos: nombres.length <= 3 ? nombres.join(', ') : t('g_n_grupos', { n: formato(nombres.length) }) });
}

export async function crearPortada(filas, grupos) {
  const [url, cuerpo] = await Promise.all([imagenMapa(), cuerpoTitulo(S.ruta.nombre)]);
  const s = el('section', 'g-portada');
  const cab = el('header', 'g-cab');
  cab.append(el('span', 'g-marca', 'WikiNatu'), el('span', 'g-sup', t('g_titulo_sup')));
  const titulo = ponerTitulo(el('h1', 'g-titulo'), S.ruta.nombre);
  titulo.style.fontSize = `${cuerpo}pt`;
  const lema = el('div', 'g-lema');
  lema.append(el('p', 'g-ventana', ventanaTexto()));
  const seleccion = textoSeleccion(grupos);
  if (seleccion) lema.append(el('p', 'g-seleccion', seleccion));
  const centro = el('div', 'g-centro');
  centro.append(mapa(url), datos(filas));
  const nota = el('p', 'g-nota', `${t('g_datos_del', { fecha: fechaTexto() })}. ${S.calidad === 'verificable' ? t('g_sin_confirmar') : t('g_investigacion')}`);
  s.append(cab, el('span', 'g-filete'), titulo, lema, centro, barras(filas), nota);
  return s;
}
