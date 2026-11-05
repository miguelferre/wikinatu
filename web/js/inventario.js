// Inventario: filtros de grupo, buscador, orden por observaciones y carga por tandas.

import { t } from './i18n.js';
import { autorCorto, filtrarInventario, nombreVisible, recuentoGrupos } from './analisis.js';
import { S, formato, ventanaTexto } from './visor.js';

const $ = (id) => document.getElementById(id);
const TANDA = 48;

const estado = { filas: [], grupo: null, texto: '', visibles: TANDA };
let abrir = () => {};

const el = (etiqueta, clase, texto) => {
  const e = document.createElement(etiqueta);
  if (clase) e.className = clase;
  if (texto != null) e.textContent = texto;
  return e;
};

export const urlInat = (id) => `https://www.inaturalist.org/taxa/${id}`;
export const textoObs = (n) => (n === 1 ? t('obs_una') : t('obs_varias', { n: formato(n) }));

export function nombreLocalEl(f) {
  const e = el('p', 'esp-local', f.nombreLocal);
  if (/[぀-鿿]/.test(f.nombreLocal)) e.classList.add('zh');
  e.lang = S.local === 'auto' ? 'zh-TW' : S.local;
  return e;
}

function tarjeta(f, i) {
  const li = el('li', `especie${f.foto ? '' : ' sin-foto'}`);
  const num = el('span', 'esp-num', String(i + 1).padStart(3, '0'));
  if (f.foto) {
    const b = el('button', 'esp-abrir');
    b.type = 'button';
    b.setAttribute('aria-label', nombreVisible(f));
    const img = el('img');
    img.src = f.foto.pequena;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.width = 240; img.height = 240;
    b.append(img);
    b.addEventListener('click', () => abrir(f.id));
    li.append(b);
  }
  const texto = el('div', 'esp-texto');
  const cabeza = el('p', 'esp-grupo');
  const punto = el('span', 'punto');
  punto.style.background = `var(--c-${f.grupo.color})`;
  cabeza.append(punto, el('span', null, t(`g_${f.grupo.id}`)), num);
  const nombre = el('h3', 'esp-nombre');
  const boton = el('button', 'esp-titulo', nombreVisible(f));
  boton.type = 'button';
  boton.addEventListener('click', () => abrir(f.id));
  nombre.append(boton);
  texto.append(cabeza, nombre);
  if (f.nombreLocal) texto.append(nombreLocalEl(f));
  if (nombreVisible(f) !== f.cientifico) texto.append(el('p', 'esp-cientifico cientifico', f.cientifico));
  texto.append(el('p', 'esp-obs', textoObs(f.observaciones)));
  if (f.foto) {
    texto.append(el('p', 'esp-autor', autorCorto(f.foto.autor)));
  } else {
    const a = el('a', 'esp-enlace', t('ver_inat'));
    a.href = urlInat(f.id); a.rel = 'noopener'; a.target = '_blank';
    texto.append(el('p', 'esp-autor', t('sin_foto')), a);
  }
  li.append(texto);
  return li;
}

function pintarGrupos() {
  const caja = $('filtroGrupos');
  const grupos = recuentoGrupos(estado.filas);
  const boton = (id, etiqueta, n, color) => {
    const b = el('button', 'grupo');
    b.type = 'button';
    b.setAttribute('aria-pressed', String(estado.grupo === id));
    if (color) {
      const p = el('span', 'punto');
      p.style.background = `var(--c-${color})`;
      b.append(p);
    }
    b.append(el('span', null, etiqueta), el('span', 'grupo-n', formato(n)));
    b.addEventListener('click', () => {
      estado.grupo = estado.grupo === id ? null : id;
      estado.visibles = TANDA;
      pintar();
    });
    return b;
  };
  caja.replaceChildren(boton(null, t('todos'), estado.filas.length, null), ...grupos.map((g) => boton(g.id, t(`g_${g.id}`), g.n, g.color)));
}

function pintar() {
  pintarGrupos();
  const lista = filtrarInventario(estado.filas, estado);
  const ver = lista.slice(0, estado.visibles);
  $('especies').replaceChildren(...ver.map((f) => tarjeta(f, estado.filas.indexOf(f))));
  const resto = lista.length - ver.length;
  const mas = $('btnMas');
  mas.hidden = resto <= 0;
  mas.textContent = t('ver_mas', { n: formato(Math.min(TANDA, resto)) });
  $('inventarioFin').textContent = !lista.length && estado.filas.length ? t('sin_coincidencias')
    : lista.length ? t('mostrando', { a: formato(ver.length), b: formato(lista.length) }) : '';
  const obs = estado.filas.reduce((s, f) => s + f.observaciones, 0);
  $('inventarioNota').textContent = estado.filas.length
    ? t('inventario_nota', { n: formato(estado.filas.length), obs: formato(obs), ventana: ventanaTexto(), m: formato(S.pasilloM) }) : '';
}

export function ponerInventario(filas) {
  estado.filas = filas;
  estado.visibles = TANDA;
  if (estado.grupo && !filas.some((f) => f.grupo.id === estado.grupo)) estado.grupo = null;
  pintar();
}

export function iniciarInventario({ alAbrir }) {
  abrir = alAbrir;
  let espera = 0;
  $('buscar').addEventListener('input', (e) => {
    clearTimeout(espera);
    espera = setTimeout(() => {
      estado.texto = e.target.value;
      estado.visibles = TANDA;
      pintar();
    }, 120);
  });
  $('btnMas').addEventListener('click', () => {
    const antes = estado.visibles;
    estado.visibles += TANDA;
    pintar();
    $('especies').children[antes]?.querySelector('button, a')?.focus();
  });
}
