// Ficha de especie en <dialog>: foto, nombres, 12 barras por mes y mini lámina con sus puntos.

import { t } from './i18n.js';
import { porMes, puntosDe } from './inat.js';
import { autorCorto, nombreVisible } from './analisis.js';
import { crearLamina } from './lamina.js';
import { S, filtrosActuales, formato, mesesFiltro } from './visor.js';
import { nombreLocalEl, textoObs, urlInat } from './inventario.js';

const $ = (id) => document.getElementById(id);
let mini = null;
let turno = 0;

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
  if (f.foto) {
    const img = el('img');
    img.src = f.foto.url; img.alt = nombreVisible(f);
    izq.append(img, el('p', 'ficha-credito', autorCorto(f.foto.autor)));
  } else {
    izq.append(el('p', 'ficha-sinfoto', t('sin_foto')));
  }

  const der = el('div', 'ficha-datos');
  const grupo = el('p', 'esp-grupo');
  const punto = el('span', 'punto');
  punto.style.background = `var(--c-${f.grupo.color})`;
  grupo.append(punto, el('span', null, t(`g_${f.grupo.id}`)));
  const h = el('h2', 'ficha-nombre', nombreVisible(f));
  h.id = 'fichaNombre';
  der.append(grupo, h);
  if (f.nombreLocal) der.append(nombreLocalEl(f));
  if (nombreVisible(f) !== f.cientifico) der.append(el('p', 'ficha-cientifico cientifico', f.cientifico));
  der.append(el('p', 'esp-obs', textoObs(f.observaciones)));

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
    .then((v) => { if (yo === turno) barras(cajaBarras, v); })
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
    if (!puntos.length) notaMini.textContent = t('f_sin_puntos');
  } catch {
    if (yo === turno) notaMini.textContent = t('err_puntos');
  }
}

export function iniciarFicha() {
  const d = $('ficha');
  d.addEventListener('close', () => { turno += 1; cerrarMini(); });
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
}
