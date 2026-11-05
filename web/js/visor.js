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
import { iniciarInventario, ponerInventario, repintarFoto } from './inventario.js';
import { abrirFicha, fotoEnFicha, iniciarFicha } from './ficha.js';
import { abrirDialogoGuia, iniciarDialogoGuia } from './guia-dialogo.js';
import { aplicarConocidas, completarFotos } from './visor-fotos.js';
import { especiesCartela, pintarCarga } from './carga.js';

registrar(TEXTOS_VISOR);

const $ = (id) => document.getElementById(id);
const COLORES = ['plantas', 'aves', 'insectos', 'hongos', 'mamiferos', 'herpetos', 'otros'];
export const PAGINAS_PUNTOS = 6;

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
  // Fases de la carga en curso: ver resumenCarga. obsListas: los puntos ya no van a cambiar.
  carga: { relieve: null, especies: null, puntos: null, nombres: null, parcial: null, mostrada: false, final: '' },
  obsListas: false, fallo: false, guiaOcupada: false,
};

export const formato = (n) => new Intl.NumberFormat(idiomaActual() === 'es' ? 'es-ES' : 'en-GB', { useGrouping: 'always' }).format(n);
export const mesesFiltro = () => (S.todoAnio ? null : ventanaMeses(S.mes));
export const filtrosActuales = () => ({ meses: mesesFiltro(), calidad: S.calidad });
export const ventanaTexto = () => textoVentana(mesesFiltro(), t('meses'), { todo: t('todo_anio').toLowerCase(), a: idiomaActual() === 'es' ? 'a' : 'to' });

// Idiomas de Wikipedia para el último paso de la cadena de fotos.
export const idiomasFotos = () => [...new Set(['en', idiomaActual(), localeLocal(S.local, centroDe(S.ruta.puntos))?.split('-')[0]].filter(Boolean))];

// Una fila ha ganado foto en segundo plano: se repinta su tarjeta, no la lista.
export function fotoNueva(f) {
  if (S.porId.get(f.id) !== f) return;
  repintarFoto(f);
  fotoEnFicha(f);
}

// Puntos crudos de iNaturalist que caen en el pasillo, con el color y el nombre de su especie.
export function observacionesDe(crudos) {
  return crudos.filter((p) => S.tramos.contiene(p.lat, p.lon) && S.porId.has(p.taxon)).map((p) => {
    const f = S.porId.get(p.taxon);
    return { lat: p.lat, lon: p.lon, taxon: p.taxon, color: f.grupo.color, nombre: nombreDe(f) };
  });
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
    nombre: S.ruta.nombre, resumen: S.resumen, filas: S.filas, ventana: ventanaTexto(), puntos: S.ruta.puntos,
    esquina: S.lamina?.esquinaLibre() ?? 'ne', sinRelieve: !!S.lamina?.dem?.sinDatos, formato, textoEspecies: especiesCartela,
  });
}

function pintarCuadroActual() {
  // Sin relieve aún no hay perfil: crearPlancha repinta al terminar.
  if (S.carga.relieve === 'cargando') return;
  const caja = $('cuadro');
  S.cuadro?.destruir?.();
  S.cuadro = null;
  const hayPerfil = S.perfil.some((p) => p.alt != null);
  $('cuadroNota').textContent = !hayPerfil ? t('cuadro_sin_dem') : S.obs.length || !S.obsListas ? t('cuadro_nota') : t('cuadro_vacio');
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
  S.carga.relieve = 'cargando';
  pintarCarga();
  const lamina = await crearLamina(caja, { puntos: S.ruta.puntos, nombre: S.ruta.nombre }, {
    alPulsar: abrirFicha, alResaltar: (x) => S.cuadro?.resaltar(x),
  });
  if (yo !== S.versionLamina) { lamina.destruir(); return; }
  S.aspecto = caja.clientWidth / caja.clientHeight;
  caja.classList.remove('cargando');
  caja.classList.add('lista');
  S.lamina = lamina;
  S.carga.relieve = 'listo';
  if (!S.perfil.length) {
    S.perfil = perfilDe(S.ruta.puntos, lamina.dem.altura);
    S.resumen = resumenPerfil(S.perfil);
  }
  refrescarCartela();
  ponerPuntosEnLamina();
  pintarCuadroActual();
  pintarCarga();
}

function ponerPuntosEnLamina() {
  S.lamina?.ponerObservaciones(S.obs);
}

async function nombresLocales(tk, filtros) {
  const loc = localeLocal(S.local, centroDe(S.ruta.puntos));
  for (const f of S.filas) f.nombreLocal = null;
  if (!loc || loc === idiomaActual()) return;
  const mapa = await contarEspecies(S.tramos.tramos, filtros, loc,
    (a, b) => { if (tk === S.token) { S.carga.nombres = { a, b }; pintarCarga(); } }, () => tk !== S.token);
  if (!mapa || tk !== S.token) return;
  for (const f of S.filas) {
    const e = mapa.get(f.id);
    const nombre = e?.taxon.preferred_common_name;
    if (nombre && nombre !== f.cientifico) f.nombreLocal = nombre;
  }
}

function fallar(e) {
  Object.assign(S.carga, { especies: null, puntos: null, nombres: null, parcial: null });
  S.fallo = true;
  aviso(errorApi(e), consultar);
  ponerInventario(S.filas);
  refrescarCartela();
  pintarCarga();
}

export async function consultar() {
  if (!S.ruta) return;
  const tk = ++S.token;
  const cancelado = () => tk !== S.token;
  const filtros = filtrosActuales();
  const n = S.tramos.tramos.length;
  const loc = localeLocal(S.local, centroDe(S.ruta.puntos));
  aviso('');
  S.completa = false; S.obsListas = false; S.fallo = false;
  S.carga.final = '';
  $('btnGuia').disabled = true;
  Object.assign(S.carga, {
    especies: { a: 0, b: n }, puntos: { a: 0, b: PAGINAS_PUNTOS },
    nombres: loc && loc !== idiomaActual() ? { a: 0, b: n } : null, parcial: null,
  });
  pintarCarga();
  let mapa;
  try {
    mapa = await contarEspecies(S.tramos.tramos, filtros, idiomaActual(), (a, b, parcial) => {
      if (cancelado()) return;
      S.carga.especies = { a, b };
      S.carga.parcial = soloEspecies([...parcial.values()]).length;
      pintarCarga();
    }, cancelado);
  } catch (e) {
    if (!cancelado()) fallar(e);
    return;
  }
  if (!mapa || cancelado()) return;

  S.fecha = new Date();
  S.filas = soloEspecies([...mapa.values()]).map((e) => filaDe(e.taxon, e.count)).sort((a, b) => b.observaciones - a.observaciones);
  S.porId = new Map(S.filas.map((f) => [f.id, f]));
  aplicarConocidas(S.filas);
  S.obs = [];
  S.completa = true;
  S.carga.parcial = null;
  refrescarCartela();
  ponerPuntosEnLamina();
  ponerInventario(S.filas);
  if (!S.filas.length) {
    S.obsListas = true;
    Object.assign(S.carga, { puntos: null, nombres: null });
    aviso(t('sin_especies', { ventana: ventanaTexto() }));
    pintarCuadroActual();
    pintarCarga();
    return;
  }
  pintarCarga();

  // Puntos de las 40 más vistas. Si falla, la lista ya está en pantalla.
  try {
    const ids = S.filas.slice(0, 40).map((f) => f.id);
    const crudos = await puntosDe(S.caja, ids, filtros, PAGINAS_PUNTOS, cancelado, (a, b) => {
      if (cancelado()) return;
      S.carga.puntos = { a, b };
      pintarCarga();
    });
    if (!crudos || cancelado()) return;
    S.obs = observacionesDe(crudos);
  } catch {
    if (cancelado()) return;
    aviso(t('err_puntos'), consultar);
  }
  S.obsListas = true;
  S.carga.puntos = { a: S.carga.puntos.b, b: S.carga.puntos.b };
  ponerPuntosEnLamina();
  pintarCuadroActual();
  pintarCarga();
  // En segundo plano: comparte la cola de iNaturalist con los nombres, y los puntos ya están.
  completarFotos(S.filas, { idiomas: idiomasFotos(), cancelado, alCambiar: fotoNueva });

  try {
    await nombresLocales(tk, filtros);
    if (cancelado()) return;
    ponerInventario(S.filas);
  } catch {
    if (cancelado()) return;
    aviso(t('err_local'));
  }
  if (S.carga.nombres) S.carga.nombres = { a: S.carga.nombres.b, b: S.carga.nombres.b };
  // La guía necesita puntos y nombres locales: el botón espera a tenerlos.
  $('btnGuia').disabled = false;
  S.carga.final = t('listo', { fecha: fechaTexto() });
  pintarCarga();
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
  Object.assign(S.carga, { relieve: null, especies: null, puntos: null, nombres: null, parcial: null, final: '' });
  pintarCarga();
  aviso('');
  document.title = 'WikiNatu';
  barra();
}

export function abrirRuta(ruta) {
  Object.assign(S, { ruta, perfil: [], resumen: null, filas: [], porId: new Map(), obs: [], completa: false, obsListas: false, fallo: false });
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
  iniciarDialogoGuia();
  $('btnGuia').addEventListener('click', abrirDialogoGuia);
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
