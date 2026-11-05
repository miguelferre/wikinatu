// Estado de carga del visor. Todo se deriva de S.carga: una sola función lo pinta,
// y da igual qué consulta cancelada o qué relieve lo pida.
//
// Con datos viejos en pantalla el aviso espera RETARDO_MS: lo que sale de caché no parpadea.
// El relieve no espera: bloquea el hilo al pintarse y ahí no hay nada que leer.

import { t } from './i18n.js';
import { resumenCarga } from './analisis.js';
import { S, formato, ventanaTexto } from './visor.js';

const RETARDO_MS = 200;
const MINIMO_MS = 320;

const $ = (id) => document.getElementById(id);
let entrada = 0, salida = 0, desde = 0, anunciado = '';

// #estado es la única región viva: recibe fases, no cada tramo.
export function anunciar(texto) {
  if (texto === anunciado) return;
  anunciado = texto;
  $('estado').textContent = texto;
}

const parcialTexto = () => {
  const n = S.carga.parcial;
  if (!n) return '';
  return n === 1 ? t('carga_parcial_una') : t('carga_parcial', { n: formato(n) });
};

function pasoTexto(r) {
  if (!r.paso) return '';
  return t(r.etapa === 'puntos' ? 'carga_pagina' : 'carga_tramo', r.paso);
}

const unir = (...partes) => partes.filter(Boolean).join(', ');

// Lo que se lee en el aviso de la lámina: qué hace, y por dónde va.
function detalle(r) {
  const avance = unir(pasoTexto(r), r.etapa === 'especies' ? parcialTexto() : '');
  return r.fase === 'relieve' && r.etapa ? `${t(`carga_${r.etapa}`)}: ${avance}` : avance;
}

// Valor de la fila Especies de la cartela.
export function especiesCartela(n) {
  if (S.completa) return formato(n);
  if (S.fallo) return t('c_sin_datos');
  return S.carga.parcial ? t('c_parcial', { n: formato(S.carga.parcial) }) : t('c_consultando');
}

function pintarLinea(id, visible, texto, f) {
  const caja = $(id);
  caja.hidden = !visible;
  if (!visible) return;
  caja.querySelector('.carga-linea-texto').textContent = texto;
  const barra = caja.querySelector('.carga-barra');
  barra.hidden = f == null;
  if (f != null) barra.style.setProperty('--f', f);
}

export function botonGuia(ocupado) {
  const b = $('btnGuia');
  const clave = ocupado ? 'guia_preparando' : S.completa && !S.filas.length ? 'guia_sin_especies' : 'descargar_guia';
  b.dataset.ancho = t('descargar_guia');
  if (b.dataset.t === clave) return;
  b.dataset.t = clave;
  b.textContent = t(clave);
}

function pintar(r) {
  const vista = S.carga.mostrada;
  const f = r.fraccion;
  const viejos = S.filas.length > 0;

  const caja = $('carga');
  caja.hidden = !vista;
  if (vista) {
    if (r.fase) $('cargaQue').textContent = t(`carga_${r.fase}`);
    $('cargaSup').textContent = viejos && !S.completa ? t('carga_actualiza', { ventana: ventanaTexto() }) : t('carga_sup');
    $('cargaPaso').textContent = detalle(r);
    $('cargaNota').hidden = !r.etapa;
    $('cargaBarra').style.setProperty('--f', f ?? 0);
  }

  const p = $('progreso');
  p.classList.toggle('fin', !vista);
  if (vista) p.style.setProperty('--f', f ?? 0);
  if (vista && r.fase) anunciar(t(`carga_${r.fase}`));
  if (!r.activa) anunciar(S.carga.final);

  // Datos viejos: atenuados hasta que lleguen los nuevos, y también si la consulta falla.
  const atenuar = viejos && !S.completa && (vista || S.fallo);
  const atenuarCuadro = (viejos || S.obs.length > 0) && !S.obsListas && (vista || S.fallo);
  $('especies').classList.toggle('actualizando', atenuar);
  $('filtroGrupos').classList.toggle('actualizando', atenuar);
  $('cartela').classList.toggle('actualizando', vista && !S.completa);
  $('cuadro').classList.toggle('actualizando', atenuarCuadro);
  S.lamina?.atenuar(atenuarCuadro);

  const dd = $('cartela').querySelector('[data-c="especies"]');
  if (dd) dd.textContent = especiesCartela(S.filas.length);
  const ventana = $('cartela').querySelector('[data-c="ventana"]');
  if (ventana && vista) ventana.textContent = ventanaTexto();

  const fase = r.etapa ? t(`carga_${r.etapa}`) : '';
  const linea = `${viejos && !S.completa ? t('carga_actualiza', { ventana: ventanaTexto() }) : fase}. ${unir(pasoTexto(r), r.etapa === 'especies' ? parcialTexto() : '')}`;
  const fallo = t(viejos ? 'carga_fallo_viejos' : 'carga_fallo');
  pintarLinea('inventarioCarga', S.fallo || (vista && r.etapa && (!S.completa || r.etapa === 'nombres')), S.fallo ? fallo : linea, S.fallo ? null : f);
  pintarLinea('cuadroCarga', S.fallo || (vista && r.etapa && !S.obsListas), S.fallo ? fallo : linea, S.fallo ? null : f);

  botonGuia(S.guiaOcupada || (vista && r.etapa != null));
}

export function pintarCarga() {
  const r = resumenCarga(S.carga);
  if (r.activa) {
    clearTimeout(salida); salida = 0;
    if (!S.carga.mostrada) {
      if (S.carga.relieve === 'cargando') mostrar();
      else if (!entrada) entrada = setTimeout(() => { entrada = 0; mostrar(); }, RETARDO_MS);
    }
  } else {
    clearTimeout(entrada); entrada = 0;
    // Lo que ya se vio se queda un instante: un aviso que entra y sale de golpe es un parpadeo.
    if (S.carga.mostrada && !salida) {
      salida = setTimeout(() => { salida = 0; S.carga.mostrada = false; pintar(resumenCarga(S.carga)); }, Math.max(0, desde + MINIMO_MS - performance.now()));
    }
  }
  pintar(r);
}

function mostrar() {
  S.carga.mostrada = true;
  desde = performance.now();
  pintar(resumenCarga(S.carga));
}
