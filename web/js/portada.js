// Portada: idioma, soltar un GPX y arranque de cada sección.

import { registrar, aplicar, iniciarSelector, alCambiarIdioma, t } from './i18n.js';
import { leerGpx, simplificar } from './geo.js';
import { TEXTOS } from './i18n-portada.js';
import { iniciarHeroe } from './heroe.js';
import { fmt } from './heroe-tira.js';
import { iniciarCorte, pintarMes, pintarMetodo } from './portada-figuras.js';
import { iniciarAnatomia, iniciarPaginas } from './portada-anatomia.js';

registrar(TEXTOS);
iniciarSelector();

const CLAVE_GPX = 'wikinatu.gpx';
const LEYENDA = ['plantas', 'insectos', 'aves', 'herpetos', 'mamiferos', 'hongos', 'otros'];
const CLAVE_GRUPO = { herpetos: 'g_herpetos' };

/* Soltar un GPX: valida, lo deja en sessionStorage y abre el visor. */

const error = document.getElementById('gpx-error');
const entrada = document.getElementById('gpx-fichero');
const capaSoltar = document.getElementById('soltar');

function avisar(clave) {
  error.dataset.t = clave;
  error.textContent = t(clave);
  error.hidden = false;
  error.scrollIntoView({ block: 'center' });
}

// Sin fechas ni extensiones: solo para un GPX que no cabe tal cual en sessionStorage.
function gpxReducido({ nombre, puntos }) {
  const filas = simplificar(puntos).map((p) => `<trkpt lat="${p.lat}" lon="${p.lon}">${p.ele == null ? '' : `<ele>${p.ele}</ele>`}</trkpt>`);
  const seguro = nombre.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<?xml version="1.0"?><gpx version="1.1"><trk><name>${seguro}</name><trkseg>${filas.join('')}</trkseg></trk></gpx>`;
}

async function abrirGpx(fichero) {
  error.hidden = true;
  let texto, leido;
  try {
    texto = await fichero.text();
    leido = leerGpx(texto, fichero.name);
  } catch {
    avisar('gpx_malo');
    return;
  }
  try {
    sessionStorage.setItem(CLAVE_GPX, texto);
  } catch {
    try { sessionStorage.setItem(CLAVE_GPX, gpxReducido(leido)); } catch { avisar('gpx_grande'); return; }
  }
  location.href = 'ruta.html';
}

function iniciarSoltar() {
  document.querySelectorAll('[data-gpx-elegir]').forEach((b) => b.addEventListener('click', () => entrada.click()));
  entrada.addEventListener('change', () => { if (entrada.files[0]) abrirGpx(entrada.files[0]); entrada.value = ''; });

  let dentro = 0;
  const conFichero = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  addEventListener('dragenter', (e) => { if (!conFichero(e)) return; e.preventDefault(); dentro++; capaSoltar.hidden = false; });
  addEventListener('dragover', (e) => { if (conFichero(e)) e.preventDefault(); });
  addEventListener('dragleave', (e) => { if (!conFichero(e)) return; dentro = Math.max(0, dentro - 1); if (!dentro) capaSoltar.hidden = true; });
  addEventListener('drop', (e) => {
    if (!conFichero(e)) return;
    e.preventDefault();
    dentro = 0; capaSoltar.hidden = true;
    const f = [...e.dataTransfer.files].find((x) => /\.gpx$/i.test(x.name)) || e.dataTransfer.files[0];
    if (f) abrirGpx(f);
  });
}

/* Textos que dependen de datos o del dispositivo. */

function textosVivos(datos) {
  document.title = t('titulo_doc');
  const tactil = matchMedia('(hover: none)').matches;
  document.querySelectorAll('[data-gpx-elegir][data-t="heroe_soltar"], [data-gpx-elegir][data-t="heroe_soltar_movil"]').forEach((b) => {
    b.dataset.t = tactil ? 'heroe_soltar_movil' : 'heroe_soltar';
    b.textContent = t(b.dataset.t);
  });
  if (!error.hidden && error.dataset.t) error.textContent = t(error.dataset.t);
  if (!datos) return;

  const presentes = new Set(datos.puntos.map((p) => datos.especies.find((e) => e.id === p.taxon)?.color));
  document.getElementById('heroe-leyenda').replaceChildren(...LEYENDA.filter((c) => presentes.has(c)).map((c) => {
    const li = document.createElement('li');
    const marca = document.createElement('i');
    marca.style.background = `var(--c-${c})`;
    li.append(marca, t(CLAVE_GRUPO[c] || `g_${c}`));
    return li;
  }));
  const r = datos.resumen;
  const poner = (id, texto) => { document.getElementById(id).textContent = texto; };
  poner('heroe-nombre', datos.nombre);
  poner('heroe-rotulo', t('heroe_rotulo', { km: fmt(r.km, 2), puntos: fmt(datos.puntos.length, 0) }));
  poner('dato-km', `${fmt(r.km, 2)} km`);
  poner('dato-nombre', datos.nombre);
  poner('dato-desnivel', `+${fmt(r.desnivel, 0)} m`);
  poner('dato-especies', fmt(r.especies, 0));
  poner('dato-obs', fmt(r.observaciones, 0));
}

async function arrancar() {
  aplicar();
  iniciarSoltar();
  textosVivos(null);
  const r = await fetch('data/tristaina.json');
  const datos = await r.json();
  textosVivos(datos);
  pintarMes(datos);
  pintarMetodo(datos);
  const heroe = iniciarHeroe(datos);
  const repintarCorte = iniciarCorte(datos);
  const repintarAnatomia = iniciarAnatomia(datos);
  const repintarPaginas = iniciarPaginas(datos);
  alCambiarIdioma(() => {
    textosVivos(datos);
    pintarMes(datos);
    pintarMetodo(datos);
    repintarCorte();
    repintarAnatomia();
    repintarPaginas();
  });
  await heroe;
}

arrancar();
