// Guía en PDF: monta un documento oculto y llama a window.print(). print.css le da forma A5.

import { t } from './i18n.js';
import { crearLamina } from './lamina.js';
import { dibujarCuadro } from './cuadro.js';
import { autorCorto, elegirEtiquetas, nombreVisible } from './analisis.js';
import { S, fechaTexto, formato, ventanaTexto } from './visor.js';
import { botonGuia } from './carga.js';

const $ = (id) => document.getElementById(id);
const COLORES = ['plantas', 'aves', 'insectos', 'hongos', 'mamiferos', 'herpetos', 'otros'];
const DESTACADAS = 60;

const el = (etiqueta, clase, texto) => {
  const e = document.createElement(etiqueta);
  if (clase) e.className = clase;
  if (texto != null) e.textContent = texto;
  return e;
};

const esCjk = (s) => /[぀-鿿]/.test(s);

function fuera(ancho, alto) {
  const d = el('div');
  d.style.cssText = `position:fixed;left:-20000px;top:0;width:${ancho}px;${alto ? `height:${alto}px;` : ''}`;
  document.body.append(d);
  return d;
}

async function imagenLamina() {
  // Plancha pequeña a densidad 3: en A5 el texto del marco queda en unos 6 pt.
  const caja = fuera(760, 900);
  const l = await crearLamina(caja, { puntos: S.ruta.puntos, nombre: S.ruta.nombre }, { rampa: 'papel', densidad: 3, marco: true });
  l.ponerObservaciones(S.obs);
  const url = l.lienzoComoImagen('image/jpeg', 0.9);
  l.destruir();
  caja.remove();
  return url;
}

function svgCuadro() {
  const caja = fuera(680);
  const etiquetas = elegirEtiquetas(S.filas, S.obs, S.perfil, S.proyectar, 24);
  const n = new Map();
  for (const f of S.filas) n.set(f.grupo.color, (n.get(f.grupo.color) || 0) + 1);
  const leyenda = COLORES.filter((c) => n.has(c)).map((c) => ({ color: c, etiqueta: t(`l_${c}`), n: formato(n.get(c)) }));
  const c = dibujarCuadro(caja, { perfil: S.perfil, etiquetas, leyenda }, {
    tema: 'papel', ancho: 680, altoMontana: 300, titulo: t('g_cuadro'),
    marcas: S.obs.map((o) => ({ km: S.proyectar(o.lat, o.lon).km, color: o.color })),
  });
  const svg = c.comoSvg();
  c.destruir();
  caja.remove();
  return svg;
}

function datos() {
  const dl = el('dl', 'g-datos');
  const km = new Intl.NumberFormat(document.documentElement.lang === 'en' ? 'en-GB' : 'es-ES', { maximumFractionDigits: 1 }).format(S.resumen?.km ?? 0);
  const filas = [[t('c_distancia'), `${km} km`]];
  if (S.resumen?.sube != null) {
    filas.push([t('c_desnivel'), `+${formato(S.resumen.sube)} m`]);
    filas.push([t('c_altitud'), t('c_alt_rango', { min: formato(S.resumen.min), max: formato(S.resumen.max) })]);
  }
  filas.push([t('c_especies'), formato(S.filas.length)]);
  for (const [a, b] of filas) {
    const d = el('div');
    d.append(el('dt', null, a), el('dd', null, b));
    dl.append(d);
  }
  return dl;
}

function portada(url) {
  const s = el('section', 'g-portada');
  const img = el('img', 'g-lamina');
  img.src = url; img.alt = '';
  const pie = el('div', 'g-portada-pie');
  const titulos = el('div');
  titulos.append(el('p', 'g-sup', `${t('g_titulo_sup')} · WikiNatu`), el('h1', 'g-titulo', S.ruta.nombre), el('p', 'g-ventana', ventanaTexto()));
  pie.append(titulos, datos());
  const nota = el('p', 'g-nota', `${t('g_datos_del', { fecha: fechaTexto() })}. ${S.calidad === 'verificable' ? t('g_sin_confirmar') : t('g_investigacion')}`);
  s.append(img, pie, nota);
  return s;
}

function tarjeta(f) {
  const a = el('article', 'g-esp');
  if (f.foto) {
    const img = el('img');
    img.src = f.foto.pequena; img.alt = ''; img.loading = 'eager';
    a.append(img);
  } else {
    a.append(el('div', 'g-sinfoto', t('sin_foto')));
  }
  const d = el('div', 'g-esp-texto');
  d.append(el('h4', null, nombreVisible(f)));
  if (f.nombreLocal) d.append(el('p', `g-local${esCjk(f.nombreLocal) ? ' zh' : ''}`, f.nombreLocal));
  if (nombreVisible(f) !== f.cientifico) d.append(el('p', 'g-cient', f.cientifico));
  d.append(el('p', 'g-obs', f.observaciones === 1 ? t('obs_una') : t('obs_varias', { n: formato(f.observaciones) })));
  if (f.foto) d.append(el('p', 'g-autor', autorCorto(f.foto.autor)));
  a.append(d);
  return a;
}

function destacadas(filas) {
  const s = el('section', 'g-especies');
  s.append(el('h2', 'g-h', t('g_mas_vistas', { n: formato(filas.length) })));
  const grupos = new Map();
  for (const f of filas) {
    if (!grupos.has(f.grupo.id)) grupos.set(f.grupo.id, []);
    grupos.get(f.grupo.id).push(f);
  }
  for (const [id, lista] of grupos) {
    const h = el('h3', 'g-grupo');
    const p = el('span', 'g-punto');
    p.style.background = `var(--c-${lista[0].grupo.color})`;
    h.append(p, el('span', null, `${t(`g_${id}`)} · ${formato(lista.length)}`));
    const rejilla = el('div', 'g-rejilla');
    rejilla.append(...lista.map(tarjeta));
    s.append(h, rejilla);
  }
  return s;
}

function resto(filas) {
  const s = el('section', 'g-resto-sec');
  s.append(el('h2', 'g-h', `${t('g_resto')} · ${formato(filas.length)}`));
  const ul = el('ul', 'g-resto');
  for (const f of filas) {
    const li = el('li');
    const n = nombreVisible(f);
    if (n !== f.cientifico) {
      li.append(`${n} `);
      if (f.nombreLocal) li.append(el('span', esCjk(f.nombreLocal) ? 'zh' : '', `${f.nombreLocal} `));
    }
    li.append(el('i', null, f.cientifico), el('span', 'g-n', ` ${formato(f.observaciones)}`));
    ul.append(li);
  }
  s.append(ul);
  return s;
}

function cierre() {
  const s = el('section', 'g-cierre');
  for (const [titulo, claves] of [
    ['g_leer', ['g_leer_1', 'g_leer_2', 'g_leer_3']],
    ['g_limites', ['g_lim_1', 'g_lim_2', 'g_lim_3']],
    ['g_creditos', ['g_cred_1', 'g_cred_2', 'g_cred_3']],
  ]) {
    s.append(el('h2', 'g-h', t(titulo)), ...claves.map((c) => el('p', null, t(c, { m: formato(S.pasilloM) }))));
  }
  return s;
}

const esperarImagenes = (raiz) => Promise.all([...raiz.querySelectorAll('img')].map((i) => Promise.race([
  i.decode().catch(() => {}),
  new Promise((r) => setTimeout(r, 15000)),
])));

export async function montarGuia() {
  const g = $('guia');
  g.replaceChildren();
  const url = await imagenLamina();
  const partes = [portada(url)];
  if (S.perfil.some((p) => p.alt != null)) {
    const c = el('section', 'g-cuadro');
    c.append(el('h2', 'g-h', t('g_cuadro')));
    const figura = el('div', 'g-cuadro-svg');
    figura.innerHTML = svgCuadro();
    c.append(figura, el('p', 'g-nota', t('cuadro_nota')));
    partes.push(c);
  }
  partes.push(destacadas(S.filas.slice(0, DESTACADAS)));
  if (S.filas.length > DESTACADAS) partes.push(resto(S.filas.slice(DESTACADAS)));
  partes.push(cierre());
  g.append(...partes);
  await esperarImagenes(g);
}

export async function descargarGuia() {
  const boton = $('btnGuia');
  const estado = $('estado');
  const antes = estado.textContent;
  boton.disabled = true;
  S.guiaOcupada = true;
  botonGuia(true);
  estado.textContent = t('g_preparando');
  const titulo = document.title;
  try {
    await montarGuia();
    document.title = `WikiNatu - ${S.ruta.nombre} - ${ventanaTexto()}`;
    estado.textContent = t('g_lista');
    addEventListener('afterprint', () => {
      document.title = titulo;
      estado.textContent = antes;
    }, { once: true });
    window.print();
  } finally {
    boton.disabled = false;
    S.guiaOcupada = false;
    botonGuia(false);
  }
}
