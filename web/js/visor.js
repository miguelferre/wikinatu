// Visor: une ruta, filtros, consulta, lámina, cuadro, inventario, ficha y guía.

import { alCambiarIdioma, aplicar, idiomaActual, iniciarSelector, registrar, t } from './i18n.js';
import { TEXTOS_VISOR } from './i18n-visor.js';
import { tramosDeRuta } from './cells.js';
import { crearProyector } from './geo.js';
import { contarEspecies, filaDe, puntosDe } from './inat.js';
import { crearLamina } from './lamina.js';
import { dibujarCuadro } from './cuadro.js';
import { centroDe, elegirEtiquetas, localeLocal, perfilDe, resumenPerfil, soloEspecies, textoVentana, ventanaMeses } from './analisis.js';
import { iniciarEntrada, olvidar, pintarBarra, rutaInicial } from './visor-rutas.js';
import { iniciarFiltros, pintarTira } from './visor-filtros.js';
import { pintarCartela } from './visor-cartela.js';
import { iniciarInventario, ponerInventario } from './inventario.js';
import { abrirFicha, iniciarFicha } from './ficha.js';
import { descargarGuia } from './guia.js';

registrar(TEXTOS_VISOR);

const $ = (id) => document.getElementById(id);
const COLORES = ['plantas', 'aves', 'insectos', 'hongos', 'mamiferos', 'herpetos', 'otros'];

// ?mes=7 fija el mes de entrada; sin él, el mes actual.
function mesInicial() {
  const m = Number(new URLSearchParams(location.search).get('mes'));
  return Number.isInteger(m) && m >= 1 && m <= 12 ? m : new Date().getMonth() + 1;
}

export const S = {
  ruta: null, perfil: [], resumen: null, tramos: null, caja: null, proyectar: null,
  filas: [], porId: new Map(), obs: [], fecha: new Date(), completa: false,
  mes: mesInicial(), todoAnio: false, calidad: 'investigacion', local: 'auto',
  lamina: null, cuadro: null, token: 0, versionLamina: 0, aspecto: 0, pasilloM: 500,
};

export const formato = (n) => new Intl.NumberFormat(idiomaActual() === 'es' ? 'es-ES' : 'en-GB', { useGrouping: 'always' }).format(n);
export const mesesFiltro = () => (S.todoAnio ? null : ventanaMeses(S.mes));
export const filtrosActuales = () => ({ meses: mesesFiltro(), calidad: S.calidad });
export const ventanaTexto = () => textoVentana(mesesFiltro(), t('meses'), { todo: t('todo_anio').toLowerCase(), a: idiomaActual() === 'es' ? 'a' : 'to' });

function estado(texto, f = null) {
  $('estado').textContent = texto;
  const p = $('progreso');
  p.classList.toggle('fin', f == null);
  if (f != null) p.style.setProperty('--f', f);
}

function aviso(texto, reintentar = null) {
  const a = $('aviso');
  a.replaceChildren();
  a.hidden = !texto;
  if (!texto) return;
  const p = document.createElement('span');
  p.textContent = texto;
  a.append(p);
  if (reintentar) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'boton boton-fino'; b.textContent = t('reintentar');
    b.addEventListener('click', reintentar);
    a.append(b);
  }
}

const errorApi = (e) => (e?.message === 'inat_ocupado' ? t('err_ocupado') : e instanceof TypeError ? t('err_red') : t('err_api'));

function refrescarCartela() {
  if (!S.ruta) return;
  pintarCartela($('cartela'), {
    nombre: S.ruta.nombre, resumen: S.resumen, filas: S.filas, ventana: ventanaTexto(), puntos: S.ruta.puntos, completa: S.completa,
    esquina: S.lamina?.esquinaLibre() ?? 'ne', sinRelieve: !!S.lamina?.dem?.sinDatos, formato,
  });
}

function pintarCuadroActual() {
  const caja = $('cuadro');
  S.cuadro?.destruir?.();
  S.cuadro = null;
  const hayPerfil = S.perfil.some((p) => p.alt != null);
  $('cuadroNota').textContent = !hayPerfil ? t('cuadro_sin_dem') : S.obs.length || !S.completa ? t('cuadro_nota') : t('cuadro_vacio');
  if (!hayPerfil) { caja.replaceChildren(); return; }
  const etiquetas = elegirEtiquetas(S.filas, S.obs, S.perfil, S.proyectar, 24);
  const n = new Map();
  for (const f of S.filas) n.set(f.grupo.color, (n.get(f.grupo.color) || 0) + 1);
  const leyenda = COLORES.filter((c) => n.has(c)).map((c) => ({ color: c, etiqueta: t(`l_${c}`), n: formato(n.get(c)) }));
  S.cuadro = dibujarCuadro(caja, { perfil: S.perfil, etiquetas, leyenda }, {
    titulo: t('cuadro_titulo'), marcas: S.obs.map((o) => ({ km: S.proyectar(o.lat, o.lon).km, color: o.color })),
    alPulsar: abrirFicha, alResaltar: (x) => S.lamina?.resaltar(x),
  });
}

async function crearPlancha() {
  const yo = ++S.versionLamina;
  const caja = $('lienzo');
  S.lamina?.destruir();
  S.lamina = null;
  caja.classList.remove('lista');
  caja.classList.add('cargando');
  const lamina = await crearLamina(caja, { puntos: S.ruta.puntos, nombre: S.ruta.nombre }, {
    alPulsar: abrirFicha, alResaltar: (x) => S.cuadro?.resaltar(x),
  });
  if (yo !== S.versionLamina) { lamina.destruir(); return; }
  S.aspecto = caja.clientWidth / caja.clientHeight;
  caja.classList.remove('cargando');
  caja.classList.add('lista');
  S.lamina = lamina;
  if (!S.perfil.length) {
    S.perfil = perfilDe(S.ruta.puntos, lamina.dem.altura);
    S.resumen = resumenPerfil(S.perfil);
  }
  refrescarCartela();
  ponerPuntosEnLamina();
  pintarCuadroActual();
}

function ponerPuntosEnLamina() {
  S.lamina?.ponerObservaciones(S.obs);
}

async function nombresLocales(tk, filtros) {
  const loc = localeLocal(S.local, centroDe(S.ruta.puntos));
  for (const f of S.filas) f.nombreLocal = null;
  if (!loc || loc === idiomaActual()) return;
  const mapa = await contarEspecies(S.tramos.tramos, filtros, loc,
    (a, b) => { if (tk === S.token) estado(t('nombres_locales', { a, b }), a / b); }, () => tk !== S.token);
  if (!mapa || tk !== S.token) return;
  for (const f of S.filas) {
    const e = mapa.get(f.id);
    const nombre = e?.taxon.preferred_common_name;
    if (nombre && nombre !== f.cientifico) f.nombreLocal = nombre;
  }
}

export async function consultar() {
  if (!S.ruta) return;
  const tk = ++S.token;
  const cancelado = () => tk !== S.token;
  const filtros = filtrosActuales();
  aviso('');
  S.completa = false;
  $('btnGuia').disabled = true;
  estado(t('tramo', { a: 0, b: S.tramos.tramos.length }), 0);
  let mapa;
  try {
    mapa = await contarEspecies(S.tramos.tramos, filtros, idiomaActual(),
      (a, b) => { if (tk === S.token) estado(t('tramo', { a, b }), a / b); }, cancelado);
  } catch (e) {
    if (tk !== S.token) return;
    estado('');
    aviso(errorApi(e), consultar);
    return;
  }
  if (!mapa || cancelado()) return;

  S.fecha = new Date();
  S.filas = soloEspecies([...mapa.values()]).map((e) => filaDe(e.taxon, e.count)).sort((a, b) => b.observaciones - a.observaciones);
  S.porId = new Map(S.filas.map((f) => [f.id, f]));
  S.obs = [];
  S.completa = true;
  refrescarCartela();
  ponerPuntosEnLamina();
  ponerInventario(S.filas);
  $('btnGuia').disabled = !S.filas.length;
  if (!S.filas.length) {
    estado('');
    aviso(t('sin_especies', { ventana: ventanaTexto() }));
    pintarCuadroActual();
    return;
  }

  // Puntos de las 40 más vistas. Si falla, la lista ya está en pantalla.
  estado(t('puntos'), 1);
  try {
    const ids = S.filas.slice(0, 40).map((f) => f.id);
    const crudos = await puntosDe(S.caja, ids, filtros, 6, cancelado);
    if (!crudos || cancelado()) return;
    S.obs = crudos.filter((p) => S.tramos.contiene(p.lat, p.lon) && S.porId.has(p.taxon)).map((p) => {
      const f = S.porId.get(p.taxon);
      return { lat: p.lat, lon: p.lon, taxon: p.taxon, color: f.grupo.color, nombre: nombreDe(f) };
    });
  } catch {
    if (cancelado()) return;
    aviso(t('err_puntos'), consultar);
  }
  ponerPuntosEnLamina();
  pintarCuadroActual();

  try {
    await nombresLocales(tk, filtros);
    if (cancelado()) return;
    ponerInventario(S.filas);
  } catch {
    if (cancelado()) return;
    aviso(t('err_local'));
  }
  estado(t('listo', { fecha: fechaTexto() }));
}

const nombreDe = (f) => f.nombre || f.nombreEn || f.cientifico;
export const fechaTexto = () => new Intl.DateTimeFormat(idiomaActual() === 'es' ? 'es-ES' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(S.fecha);

function vaciar() {
  S.ruta = null;
  S.token += 1; S.versionLamina += 1;
  S.lamina?.destruir(); S.lamina = null;
  S.cuadro?.destruir?.(); S.cuadro = null;
  for (const id of ['filtros', 'plancha', 'seccionCuadro', 'seccionInventario']) $(id).hidden = true;
  $('vacio').hidden = false;
  $('btnGuia').disabled = true;
  aviso('');
  document.title = 'WikiNatu';
  barra();
}

export function abrirRuta(ruta) {
  Object.assign(S, { ruta, perfil: [], resumen: null, filas: [], porId: new Map(), obs: [], completa: false });
  S.tramos = tramosDeRuta(ruta.puntos);
  // Cada punto marca su celda y las vecinas: el pasillo mide al menos un paso a cada lado.
  S.pasilloM = Math.floor((S.tramos.paso * 111000 * Math.cos((ruta.puntos[0].lat * Math.PI) / 180)) / 50) * 50;
  const cs = S.tramos.tramos;
  S.caja = {
    swlat: Math.min(...cs.map((c) => c.swlat)), swlng: Math.min(...cs.map((c) => c.swlng)),
    nelat: Math.max(...cs.map((c) => c.nelat)), nelng: Math.max(...cs.map((c) => c.nelng)),
  };
  S.proyectar = crearProyector(ruta.puntos);
  $('vacio').hidden = true;
  for (const id of ['filtros', 'plancha', 'seccionCuadro', 'seccionInventario']) $(id).hidden = false;
  $('titulo').textContent = `WikiNatu: ${ruta.nombre}`;
  document.title = `${ruta.nombre} | WikiNatu`;
  barra();
  pintarTira();
  ponerInventario([]);
  refrescarCartela();
  crearPlancha();
  consultar();
}

function barra() {
  pintarBarra(S.ruta?.id, {
    alAbrir: abrirRuta,
    alQuitar: (id) => {
      olvidar(id);
      if (S.ruta?.id === id) vaciar(); else barra();
    },
  });
}

function vigilarTamano() {
  let espera = 0;
  addEventListener('resize', () => {
    clearTimeout(espera);
    espera = setTimeout(() => {
      if (!S.lamina) return;
      const caja = $('lienzo');
      caja.classList.remove('lista');
      const nuevo = caja.clientWidth / caja.clientHeight;
      caja.classList.add('lista');
      if (Math.abs(nuevo / S.aspecto - 1) > 0.18) crearPlancha();
    }, 260);
  });
}

async function arrancar() {
  aplicar();
  iniciarSelector();
  iniciarEntrada({ alRuta: abrirRuta, alError: aviso });
  iniciarFiltros({ alCambiar: consultar, alCambiarLocal: consultar });
  iniciarInventario({ alAbrir: abrirFicha });
  iniciarFicha();
  $('btnGuia').addEventListener('click', descargarGuia);
  vigilarTamano();
  alCambiarIdioma(() => { pintarTira(); refrescarCartela(); S.lamina?.redibujar(); ponerInventario(S.filas); consultar(); });
  try {
    const ruta = await rutaInicial();
    if (ruta) abrirRuta(ruta); else vaciar();
  } catch (e) {
    vaciar();
    aviso(e.message === 'ejemplo' ? t('err_ejemplo') : t('err_gpx', { n: 'ruta.gpx' }));
  }
}

arrancar();
