// Diálogo previo a la guía: grupos, cuántas especies van con foto y qué partes lleva.

import { t } from './i18n.js';
import { recuentoGrupos } from './analisis.js';
import { CLAVE_GUIA, OPCIONES_FOTOS, compactarGrupos, gruposDeAtajo, opcionesIniciales, paginasGuia, seleccionGuia } from './guia-filtro.js';
import { S, formato } from './visor.js';
import { grupoActivo } from './inventario.js';
import { descargarGuia } from './guia.js';

const $ = (id) => document.getElementById(id);
const ATAJOS = [['todo', 'gd_todo'], ['animales', 'gd_animales'], ['aves', 'g_aves'], ['plantas', 'g_plantas']];

let op = null;
let grupos = [];

const el = (etiqueta, clase, texto) => {
  const e = document.createElement(etiqueta);
  if (clase) e.className = clase;
  if (texto != null) e.textContent = texto;
  return e;
};

const presentes = () => grupos.map((g) => g.id);
const hayPerfil = () => S.perfil.some((p) => p.alt != null);

function guardar() {
  try { localStorage.setItem(CLAVE_GUIA, JSON.stringify(op)); } catch { /* sin almacenamiento */ }
}

function textoCuenta(sel, cuadro) {
  const especies = sel.filas.length === 1 ? t('gd_especie') : t('gd_especies', { n: formato(sel.filas.length) });
  const paginas = paginasGuia({ ...sel, cuadro });
  const partes = [especies, t('gd_con_foto', { n: formato(sel.conFoto.length) })];
  if (sel.resto.length) partes.push(t('gd_en_lista', { n: formato(sel.resto.length) }));
  return `${partes.join(', ')}. ${t('gd_paginas', { n: formato(paginas) })}`;
}

// Todo lo que depende de la elección. Las casillas no se rehacen: el foco sigue donde estaba.
function actualizar() {
  const ids = presentes();
  const elegidos = op.grupos ?? ids;
  for (const c of $('guiaGrupos').querySelectorAll('input')) c.checked = elegidos.includes(c.value);
  for (const b of $('guiaAtajos').querySelectorAll('button')) {
    const objetivo = gruposDeAtajo(b.dataset.atajo, ids) ?? ids;
    const igual = objetivo.length === elegidos.length && objetivo.every((g) => elegidos.includes(g));
    b.setAttribute('aria-pressed', String(igual && objetivo.length > 0));
  }
  const sel = seleccionGuia(S.filas, op);
  const resto = seleccionGuia(S.filas, { ...op, resto: true }).resto.length;
  const cuadro = op.cuadro && hayPerfil();
  const chkResto = $('guiaResto');
  chkResto.checked = op.resto;
  chkResto.disabled = !resto;
  $('guiaRestoN').textContent = resto ? formato(resto) : '';
  const chkCuadro = $('guiaCuadro');
  chkCuadro.checked = cuadro;
  chkCuadro.disabled = !hayPerfil();
  $('guiaCuadroNota').hidden = hayPerfil();
  const vacio = !sel.filas.length;
  const cuenta = $('guiaCuenta');
  cuenta.textContent = vacio ? t('gd_cero') : textoCuenta(sel, cuadro);
  cuenta.classList.toggle('vacio-aviso', vacio);
  $('guiaCrear').disabled = vacio;
}

function elegirGrupos(lista) {
  op.grupos = compactarGrupos(lista, presentes());
  guardar();
  actualizar();
}

function casillaGrupo(g) {
  const label = el('label', 'dg-casilla');
  const c = el('input');
  c.type = 'checkbox'; c.value = g.id;
  c.addEventListener('change', () => {
    const antes = op.grupos ?? presentes();
    elegirGrupos(c.checked ? [...antes, g.id] : antes.filter((x) => x !== g.id));
  });
  const punto = el('span', 'punto');
  punto.style.background = `var(--c-${g.color})`;
  label.append(c, punto, el('span', 'dg-nombre', t(`g_${g.id}`)), el('span', 'dg-n', formato(g.n)));
  return label;
}

function opcionFotos(valor) {
  const label = el('label', 'dg-opcion');
  const r = el('input');
  r.type = 'radio'; r.name = 'guiaFotos'; r.value = String(valor);
  r.checked = op.fotos === valor;
  r.addEventListener('change', () => { op.fotos = valor; guardar(); actualizar(); });
  label.append(r, el('span', null, valor === 'todas' ? t('gd_todas') : formato(valor)));
  return label;
}

export function abrirDialogoGuia() {
  let guardado = null;
  try { guardado = localStorage.getItem(CLAVE_GUIA); } catch { /* sin almacenamiento */ }
  grupos = recuentoGrupos(S.filas);
  op = opcionesIniciales(guardado, presentes(), grupoActivo());
  $('guiaGrupos').replaceChildren(...grupos.map(casillaGrupo));
  $('guiaFotosOpciones').replaceChildren(...OPCIONES_FOTOS.map(opcionFotos));
  actualizar();
  $('dialogoGuia').showModal();
  $('guiaAtajos').querySelector('button').focus();
}

export function iniciarDialogoGuia() {
  const d = $('dialogoGuia');
  $('guiaAtajos').replaceChildren(...ATAJOS.map(([atajo, clave]) => {
    const b = el('button', 'grupo');
    b.type = 'button';
    b.dataset.atajo = atajo;
    b.dataset.t = clave;
    b.textContent = t(clave);
    b.addEventListener('click', () => elegirGrupos(gruposDeAtajo(atajo, presentes()) ?? presentes()));
    return b;
  }));
  $('guiaCuadro').addEventListener('change', (e) => { op.cuadro = e.target.checked; guardar(); actualizar(); });
  $('guiaResto').addEventListener('change', (e) => { op.resto = e.target.checked; guardar(); actualizar(); });
  $('guiaCerrar').addEventListener('click', () => d.close());
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  $('guiaForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if ($('guiaCrear').disabled) return;
    guardar();
    d.close();
    descargarGuia({ ...op, cuadro: op.cuadro && hayPerfil() });
  });
}
