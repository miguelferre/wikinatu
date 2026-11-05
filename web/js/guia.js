// Guía en PDF: monta un documento oculto y llama a window.print(). print.css le da forma A5.

import { t } from './i18n.js';
import { dibujarCuadro } from './cuadro.js';
import { autorCorto, elegirEtiquetas, nombreVisible } from './analisis.js';
import { puntosDe } from './inat.js';
import { completarFotos } from './visor-fotos.js';
import { seleccionGuia } from './guia-filtro.js';
import { crearPortada } from './guia-portada.js';
import { PAGINAS_PUNTOS, S, filtrosActuales, fotoNueva, formato, idiomasFotos, observacionesDe, ventanaTexto } from './visor.js';
import { botonGuia } from './carga.js';

const $ = (id) => document.getElementById(id);
const COLORES = ['plantas', 'aves', 'insectos', 'hongos', 'mamiferos', 'herpetos', 'otros'];
const CON_PUNTOS = 40;

const el = (etiqueta, clase, texto) => {
  const e = document.createElement(etiqueta);
  if (clase) e.className = clase;
  if (texto != null) e.textContent = texto;
  return e;
};

const esCjk = (s) => /[぀-鿿]/.test(s);

function fuera(ancho) {
  const d = el('div');
  d.style.cssText = `position:fixed;left:-20000px;top:0;width:${ancho}px;`;
  document.body.append(d);
  return d;
}

// El visor solo trae puntos de sus 40 más vistas: con un filtro hay que pedir los de ese grupo.
async function puntosGuia(filas, grupos, cancelado) {
  if (!grupos) return S.obs;
  const ids = new Set(filas.map((f) => f.id));
  try {
    const crudos = await puntosDe(S.caja, filas.slice(0, CON_PUNTOS).map((f) => f.id), filtrosActuales(), PAGINAS_PUNTOS, cancelado);
    return crudos ? observacionesDe(crudos) : [];
  } catch {
    return S.obs.filter((o) => ids.has(o.taxon));
  }
}

function svgCuadro(filas, obs) {
  const caja = fuera(680);
  const etiquetas = elegirEtiquetas(filas, obs, S.perfil, S.proyectar, 24);
  const n = new Map();
  for (const f of filas) n.set(f.grupo.color, (n.get(f.grupo.color) || 0) + 1);
  const leyenda = COLORES.filter((c) => n.has(c)).map((c) => ({ color: c, etiqueta: t(`l_${c}`), n: formato(n.get(c)) }));
  const c = dibujarCuadro(caja, { perfil: S.perfil, etiquetas, leyenda }, {
    ancho: 680, altoMontana: 300, titulo: t('g_cuadro'),
    marcas: obs.map((o) => ({ km: S.proyectar(o.lat, o.lon).km, color: o.color })),
  });
  const svg = c.comoSvg();
  c.destruir();
  caja.remove();
  return svg;
}

function seccionCuadro(filas, obs) {
  const c = el('section', 'g-cuadro');
  c.append(el('h2', 'g-h', t('g_cuadro')));
  const figura = el('div', 'g-cuadro-svg');
  figura.innerHTML = svgCuadro(filas, obs);
  c.append(figura, el('p', 'g-nota', obs.length ? t('cuadro_nota') : t('cuadro_vacio')));
  return c;
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

function destacadas(filas, total) {
  const s = el('section', 'g-especies');
  s.append(el('h2', 'g-h', t(filas.length === total ? 'g_todas' : 'g_mas_vistas', { n: formato(filas.length) })));
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

function cierre(conCuadro) {
  const s = el('section', 'g-cierre');
  for (const [titulo, claves] of [
    ['g_leer', ['g_leer_1', ...(conCuadro ? ['g_leer_2'] : []), 'g_leer_3']],
    ['g_limites', ['g_lim_1', 'g_lim_2', 'g_lim_3']],
    ['g_creditos', ['g_cred_1', 'g_cred_2', 'g_cred_3']],
  ]) {
    s.append(el('h2', 'g-h', t(titulo)), ...claves.map((c) => el('p', null, t(c, { m: formato(S.pasilloM) }))));
  }
  return s;
}

// Una foto que no carga no deja un hueco roto en el papel.
const esperarImagenes = (raiz) => Promise.all([...raiz.querySelectorAll('img')].map(async (i) => {
  const ok = await Promise.race([
    i.decode().then(() => true, () => false),
    new Promise((r) => setTimeout(() => r(null), 15000)),
  ]);
  const tarjeta = i.closest('.g-esp');
  if (ok !== false || !tarjeta) return;
  tarjeta.querySelector('.g-autor')?.remove();
  i.replaceWith(el('div', 'g-sinfoto', t('sin_foto')));
}));

export async function montarGuia(opciones, cancelado = () => false) {
  const g = $('guia');
  g.replaceChildren();
  const sel = seleccionGuia(S.filas, opciones);
  const conCuadro = opciones.cuadro !== false && S.perfil.some((p) => p.alt != null);
  const [, obs, cubierta] = await Promise.all([
    completarFotos(sel.conFoto, { idiomas: idiomasFotos(), cancelado, alCambiar: fotoNueva }),
    conCuadro ? puntosGuia(sel.filas, opciones.grupos, cancelado) : [],
    crearPortada(sel.filas, opciones.grupos),
  ]);
  if (cancelado()) return;
  const partes = [cubierta];
  if (conCuadro) partes.push(seccionCuadro(sel.filas, obs));
  partes.push(destacadas(sel.conFoto, sel.filas.length));
  if (sel.resto.length) partes.push(resto(sel.resto));
  partes.push(cierre(conCuadro));
  g.append(...partes);
  await esperarImagenes(g);
}

export async function descargarGuia(opciones) {
  const boton = $('btnGuia');
  const estado = $('estado');
  const antes = estado.textContent;
  const consulta = S.token;
  const cancelado = () => consulta !== S.token;
  boton.disabled = true;
  S.guiaOcupada = true;
  botonGuia(true);
  estado.textContent = t('g_preparando');
  const titulo = document.title;
  try {
    await montarGuia(opciones, cancelado);
    if (cancelado()) { estado.textContent = antes; return; }
    document.title = `WikiNatu - ${S.ruta.nombre} - ${ventanaTexto()}`;
    estado.textContent = t('g_lista');
    addEventListener('afterprint', () => {
      document.title = titulo;
      estado.textContent = antes;
    }, { once: true });
    window.print();
  } finally {
    // Una consulta nueva pudo empezar mientras tanto: el botón espera a que acabe.
    boton.disabled = !S.carga.final;
    S.guiaOcupada = false;
    botonGuia(false);
    if (!boton.disabled) boton.focus();
  }
}
