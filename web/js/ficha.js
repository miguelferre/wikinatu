// Ficha de especie en <dialog>: foto, nombres, 12 barras por mes y mini lámina con sus puntos.

import { t } from './i18n.js';
import { porMes, puntosDe } from './inat.js';
import { autorCorto, nombreVisible } from './analisis.js';
import { crearLamina } from './lamina.js';
import { S, filtrosActuales, formato, mesesFiltro } from './visor.js';
import { nombreLocalEl, urlInat } from './inventario.js';

const $ = (id) => document.getElementById(id);
let mini = null;
let turno = 0;
let abierta = null;

const el = (etiqueta, clase, texto) => {
  const e = document.createElement(etiqueta);
  if (clase) e.className = clase;
  if (texto != null) e.textContent = texto;
  return e;
};

function barras(caja, valores) {
  const max = Math.max(...valores, 1);
  const marcados = mesesFiltro() || [];
  const ini = t('meses_ini');
  const nombres = t('meses');
  const lista = el('ol', 'barras');
  valores.forEach((v, i) => {
    const li = el('li', marcados.includes(i + 1) ? 'marcado' : '');
    li.title = `${nombres[i]}: ${formato(v)}`;
    const columna = el('span', 'barra-col');
    const b = el('span', 'barra');
    b.style.height = `${(v / max) * 100}%`;
    columna.append(b);
    li.append(el('span', 'barra-n', v ? formato(v) : ''), columna, el('span', 'barra-mes', ini[i]));
    li.setAttribute('aria-label', `${nombres[i]}: ${formato(v)}`);
    lista.append(li);
  });
  caja.replaceChildren(lista);
}

// Una fila de cifras. La caja se rellena cuando llega su dato; sin dato queda oculta.
function cifra(caja, titulo, valor = null) {
  const d = el('div');
  const dd = el('dd', 'num', valor);
  d.hidden = valor == null;
  d.append(el('dt', null, titulo), dd);
  caja.append(d);
  return (texto) => { dd.textContent = texto; d.hidden = false; };
}

const mayuscula = (s) => s.charAt(0).toLocaleUpperCase() + s.slice(1);

// «Junio a agosto» si los meses van seguidos; si no, la lista corta.
function textoMeses(valores) {
  const nombres = t('meses');
  const con = valores.flatMap((v, i) => (v ? [i] : []));
  if (!con.length) return null;
  if (con.length === 1) return mayuscula(nombres[con[0]]);
  const seguidos = con.at(-1) - con[0] + 1 === con.length;
  return seguidos ? t('f_meses_de', { a: mayuscula(nombres[con[0]]), b: nombres[con.at(-1)] }) : mayuscula(con.map((i) => nombres[i].slice(0, 3)).join(', '));
}

const km1 = (k) => new Intl.NumberFormat(document.documentElement.lang === 'en' ? 'en-GB' : 'es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(k);

// Kilómetros de la ruta entre los que se vio y distancia del punto más cercano.
function enLaRuta(puntos) {
  const p = puntos.map((q) => S.proyectar(q.lat, q.lon));
  const kms = p.map((q) => q.km);
  const a = Math.min(...kms), b = Math.max(...kms);
  return {
    ruta: km1(a) === km1(b) ? t('f_km', { a: km1(a) }) : t('f_km_de', { a: km1(a), b: km1(b) }),
    cerca: t('f_a_m', { n: formato(Math.round(Math.min(...p.map((q) => q.distanciaKm)) * 1000)) }),
  };
}

function pintarFoto(caja, f) {
  if (!f.foto) { caja.replaceChildren(el('p', 'ficha-sinfoto', t('sin_foto'))); return; }
  const img = el('img');
  img.src = f.foto.url; img.alt = nombreVisible(f);
  const credito = el('p', 'ficha-credito', autorCorto(f.foto.autor));
  if (f.foto.fuente) {
    const a = el('a', null, t('f_fuente'));
    a.href = f.foto.fuente; a.rel = 'noopener'; a.target = '_blank';
    credito.append(' ', a);
  }
  caja.replaceChildren(img, credito);
}

// La foto llegó con la ficha abierta.
export function fotoEnFicha(f) {
  if (abierta === f.id && $('ficha').open) pintarFoto($('ficha').querySelector('.ficha-foto'), f);
}

function cerrarMini() {
  mini?.destruir();
  mini = null;
}

export async function abrirFicha(taxon) {
  const f = S.porId.get(taxon);
  if (!f) return;
  const yo = ++turno;
  const d = $('ficha');
  cerrarMini();
  d.replaceChildren();

  const cerrar = el('button', 'ficha-cerrar');
  cerrar.type = 'button';
  cerrar.setAttribute('aria-label', t('cerrar'));
  cerrar.innerHTML = '<svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true"><path d="M2 2l10 10M12 2 2 12" stroke="currentColor" stroke-width="1.4"/></svg>';
  cerrar.addEventListener('click', () => d.close());

  const izq = el('div', 'ficha-foto');
  pintarFoto(izq, f);
  abierta = f.id;

  const der = el('div', 'ficha-datos');
  const grupo = el('p', 'ficha-grupo', t(`g_${f.grupo.id}`));
  const h = el('h2', 'ficha-nombre', nombreVisible(f));
  h.id = 'fichaNombre';
  der.append(grupo, h);
  if (f.nombreLocal) der.append(nombreLocalEl(f));
  if (nombreVisible(f) !== f.cientifico) der.append(el('p', 'ficha-cientifico cientifico', f.cientifico));
  const cifras = el('dl', 'ficha-cifras');
  cifra(cifras, t('f_observaciones'), formato(f.observaciones));
  const ponerMeses = cifra(cifras, t('c_meses'));
  const ponerRuta = cifra(cifras, t('f_en_ruta'));
  const ponerCerca = cifra(cifras, t('f_mas_cerca'));
  der.append(cifras);

  const tit = el('h3', 'ficha-sub', t('f_por_mes'));
  const cajaBarras = el('div', 'ficha-barras');
  cajaBarras.append(el('p', 'ficha-cargando', t('f_cargando')));
  const titMapa = el('h3', 'ficha-sub', t('f_mapa'));
  const cajaMini = el('div', 'ficha-mini');
  const notaMini = el('p', 'ficha-nota');

  const enlaces = el('p', 'ficha-enlaces');
  const inat = el('a', null, t('ver_inat'));
  inat.href = urlInat(f.id); inat.rel = 'noopener'; inat.target = '_blank';
  enlaces.append(inat);
  if (f.wikipedia) {
    const w = el('a', null, t('ver_wiki'));
    w.href = f.wikipedia; w.rel = 'noopener'; w.target = '_blank';
    enlaces.append(w);
  }
  der.append(tit, cajaBarras, titMapa, cajaMini, notaMini, enlaces);
  d.append(cerrar, izq, der);
  d.showModal();
  cerrar.focus();

  porMes(S.caja, f.id, S.calidad)
    .then((v) => {
      if (yo !== turno) return;
      barras(cajaBarras, v);
      const meses = textoMeses(v);
      if (meses) ponerMeses(meses);
    })
    .catch(() => { if (yo === turno) cajaBarras.replaceChildren(el('p', 'ficha-cargando', t('err_api'))); });

  try {
    const l = await crearLamina(cajaMini, { puntos: S.ruta.puntos, nombre: nombreVisible(f) }, { marco: false, aspecto: 1.9 });
    if (yo !== turno || !d.open) { l.destruir(); return; }
    mini = l;
    const crudos = await puntosDe(S.caja, [f.id], filtrosActuales(), 2);
    if (yo !== turno || !crudos) return;
    const puntos = crudos.filter((p) => S.tramos.contiene(p.lat, p.lon))
      .map((p) => ({ lat: p.lat, lon: p.lon, taxon: f.id, color: f.grupo.color, nombre: nombreVisible(f) }));
    l.ponerObservaciones(puntos);
    if (!puntos.length) { notaMini.textContent = t('f_sin_puntos'); return; }
    const { ruta, cerca } = enLaRuta(puntos);
    ponerRuta(ruta);
    ponerCerca(cerca);
  } catch {
    if (yo === turno) notaMini.textContent = t('err_puntos');
  }
}

export function iniciarFicha() {
  const d = $('ficha');
  d.addEventListener('close', () => { turno += 1; cerrarMini(); });
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
}
