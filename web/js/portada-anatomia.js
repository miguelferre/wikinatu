// «Cómo se lee» y las páginas de muestra de la guía, con los módulos reales del visor.

import { crearLamina } from './lamina.js';
import { dibujarCuadro } from './cuadro.js';
import { perfilDe, altitudEn } from './analisis.js';
import { t, idiomaActual } from './i18n.js';
import { elegirEspecies, nombreDe, fmt } from './heroe-tira.js';
import { cuandoCerca } from './portada-figuras.js';

const CLAVE_GRUPO = { herpetos: 'g_herpetos' };

function observaciones(datos) {
  const por = new Map(datos.especies.map((e) => [e.id, e]));
  return datos.puntos.filter((p) => por.has(p.taxon)).map((p) => ({
    lat: p.lat, lon: p.lon, taxon: p.taxon, color: por.get(p.taxon).color, nombre: nombreDe(por.get(p.taxon)),
  }));
}

function perfilReal(lam, datos) {
  const ruta = datos.ruta;
  if (lam.dem && !lam.dem.sinDatos) return perfilDe(ruta, lam.dem.altura);
  return ruta.map((p) => ({ km: p.km, alt: p.alt }));
}

function datosCuadro(datos, perfil, maximo) {
  const etiquetas = elegirEspecies(datos, maximo).map(({ e, km }) => ({
    km, alt: altitudEn(perfil, km), nombre: nombreDe(e), cientifico: e.cientifico, color: e.color, taxon: e.id, n: e.observaciones,
  }));
  const colores = [...new Set(etiquetas.map((e) => e.color))];
  const leyenda = colores.map((c) => ({ color: c, etiqueta: t(CLAVE_GRUPO[c] || `g_${c}`) }));
  return { perfil, etiquetas: etiquetas.sort((a, b) => b.n - a.n), leyenda };
}

function partes(ol, claves, vars = {}) {
  ol.replaceChildren(...claves.map(([n, clave]) => {
    const li = document.createElement('li');
    const num = document.createElement('span');
    num.className = 'llamada-num num';
    num.textContent = n;
    const texto = document.createElement('p');
    const fuerte = document.createElement('b');
    fuerte.textContent = t(`${clave}_t`);
    texto.append(fuerte, ` ${t(clave, vars)}`);
    li.append(num, texto);
    return li;
  }));
}

function llamada(capa, n, titulo, x, y, lado = 1) {
  const d = document.createElement('div');
  d.className = `llamada${lado < 0 ? ' izquierda' : ''}`;
  d.style.setProperty('--x', `${x}px`);
  d.style.setProperty('--y', `${y}px`);
  const num = document.createElement('span');
  num.className = 'llamada-num num';
  num.textContent = n;
  const texto = document.createElement('span');
  texto.className = 'llamada-texto';
  texto.textContent = titulo;
  d.append(num, texto);
  capa.append(d);
}

export function iniciarAnatomia(datos) {
  const lienzoL = document.getElementById('anatomia-lamina');
  const lienzoC = document.getElementById('anatomia-cuadro');
  const capaL = document.getElementById('llamadas-lamina');
  const capaC = document.getElementById('llamadas-cuadro');
  const olL = document.getElementById('partes-lamina');
  const olC = document.getElementById('partes-cuadro');
  const foco = document.getElementById('especies-foco');
  let lam = null, cuadro = null, perfil = null, elegido = null, intervalo = null;

  const marcar = (taxon) => {
    lam?.resaltar(taxon);
    cuadro?.resaltar(taxon);
    foco.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.taxon) === taxon)));
  };

  function colocarLlamadas() {
    if (!lam) return;
    capaL.replaceChildren();
    const r = datos.ruta;
    const w = lienzoL.clientWidth, h = lienzoL.clientHeight;
    const enRuta = r[Math.floor(r.length * 0.24)];
    const [rx, ry] = lam.proyectar(enRuta.lat, enRuta.lon);
    const obs = datos.puntos.filter((p) => datos.especies.find((e) => e.id === p.taxon)?.color !== 'plantas').sort((a, b) => b.distancia - a.distancia)[0];
    const [ox, oy] = lam.proyectar(obs.lat, obs.lon);
    llamada(capaL, 1, t('p1_t'), w * 0.2, h * 0.3);
    llamada(capaL, 2, t('p2_t'), w * 0.84, h * 0.5, -1);
    llamada(capaL, 3, t('p3_t'), rx - 6, ry, -1);
    llamada(capaL, 4, t('p4_t'), ox + 6, oy);
    llamada(capaL, 5, t('p5_t'), w * 0.5, 13);

    capaC.replaceChildren();
    const svg = lienzoC.querySelector('svg');
    const et = lienzoC.querySelector('.et');
    if (!svg || !et) return;
    const base = lienzoC.getBoundingClientRect();
    // La línea guía más larga es la que mejor se ve.
    const guia = [...lienzoC.querySelectorAll('.guia')].map((g) => g.getBoundingClientRect()).sort((a, b) => b.height - a.height)[0];
    const rotulo = et.querySelector('text').getBoundingClientRect();
    llamada(capaC, 6, t('p6_t'), base.width * 0.84, base.height * 0.8, -1);
    llamada(capaC, 7, t('p7_t'), rotulo.left - base.left - 6, rotulo.top - base.top + rotulo.height * 0.42, -1);
    llamada(capaC, 8, t('p8_t'), guia.right - base.left + 6, guia.top + guia.height * 0.55 - base.top);
  }

  function pintarCuadro() {
    cuadro?.destruir();
    const maximo = lienzoC.clientWidth >= 760 ? 22 : 9;
    cuadro = dibujarCuadro(lienzoC, datosCuadro(datos, perfil, maximo), {
      alResaltar: (x) => { lam?.resaltar(x); },
    });
  }

  function textos() {
    partes(olL, [[1, 'p1'], [2, 'p2'], [3, 'p3'], [4, 'p4'], [5, 'p5']], { n: fmt(intervalo ?? 0, 0) });
    partes(olC, [[6, 'p6'], [7, 'p7'], [8, 'p8']]);
    document.getElementById('lamina-pie').textContent = t('lamina_pie', { nombre: datos.nombre, puntos: fmt(datos.puntos.length, 0) });
    elegido = elegirEspecies(datos, 40).sort((a, b) => b.e.observaciones - a.e.observaciones);
    const unaPorGrupo = [];
    const vistos = new Set();
    for (const { e } of elegido) {
      if (vistos.has(e.color) || !e.nombre[idiomaActual()]) continue;
      vistos.add(e.color);
      unaPorGrupo.push(e);
    }
    for (const { e } of elegido) if (unaPorGrupo.length < 7 && !unaPorGrupo.includes(e) && e.nombre[idiomaActual()]) unaPorGrupo.push(e);
    foco.replaceChildren(...unaPorGrupo.map((e) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.taxon = e.id;
      b.setAttribute('aria-pressed', 'false');
      const marca = document.createElement('i');
      marca.style.background = `var(--c-${e.color})`;
      b.append(marca, nombreDe(e));
      b.addEventListener('click', () => marcar(b.getAttribute('aria-pressed') === 'true' ? null : e.id));
      return b;
    }));
  }

  textos();
  cuandoCerca(lienzoL, async () => {
    const aspecto = lienzoL.clientWidth >= 760 ? 1.42 : 0.92;
    lam = await crearLamina(lienzoL, { puntos: datos.ruta, nombre: datos.nombre }, {
      aspecto, marco: true, alResaltar: (x) => { cuadro?.resaltar(x); },
    });
    lam.ponerObservaciones(observaciones(datos));
    intervalo = lam.rango?.intervalo ?? null;
    perfil = perfilReal(lam, datos);
    pintarCuadro();
    textos();
    colocarLlamadas();
    await document.fonts.ready;
    colocarLlamadas();
  });

  let ancho = 0, medida = 0;
  new ResizeObserver(() => {
    clearTimeout(medida);
    medida = setTimeout(() => {
      if (Math.abs(lienzoL.clientWidth - ancho) < 2) return;
      ancho = lienzoL.clientWidth;
      if (perfil) { pintarCuadro(); colocarLlamadas(); }
    }, 200);
  }).observe(lienzoL);

  return () => {
    textos();
    if (lam) lam.ponerObservaciones(observaciones(datos));
    if (perfil) { pintarCuadro(); colocarLlamadas(); }
  };
}

/* Páginas de la guía: portada con la lámina, cuadro y especies reales. */

function especieFila(e) {
  const fila = document.createElement('div');
  fila.className = 'pag-especie';
  const img = document.createElement('img');
  img.src = e.foto.pequena; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; img.width = 44; img.height = 44;
  const texto = document.createElement('div');
  const b = document.createElement('b'); b.textContent = nombreDe(e);
  const i = document.createElement('i'); i.textContent = e.cientifico;
  const s = document.createElement('small'); s.textContent = `${t('pag_obs', { n: fmt(e.observaciones, 0) })} · ${e.foto.autor}`;
  texto.append(b, i, s);
  fila.append(img, texto);
  return fila;
}

export function iniciarPaginas(datos) {
  const portada = document.getElementById('pagina-portada');
  const pagCuadro = document.getElementById('pagina-cuadro');
  const pagEspecies = document.getElementById('pagina-especies');
  let perfil = null, cuadro = null;

  const fechaLarga = () => new Date(`${datos.consultado}T12:00:00`).toLocaleDateString(idiomaActual() === 'es' ? 'es-ES' : 'en-GB');
  const portadaTexto = document.createElement('div');
  portadaTexto.className = 'pag-titulo';
  const lienzo = document.createElement('div');
  lienzo.className = 'pag-lamina';
  const grupos = document.createElement('ul');
  grupos.className = 'pag-grupos';
  portada.append(portadaTexto, lienzo, grupos);

  function textos() {
    const nodo = (tag, txt) => { const n = document.createElement(tag); n.textContent = txt; return n; };
    portadaTexto.replaceChildren(
      nodo('small', t('pag_guia')), nodo('h4', datos.nombre),
      nodo('p', t('pag_datos', { km: fmt(datos.resumen.km, 2), especies: fmt(datos.resumen.especies, 0) })),
      nodo('p', t('pag_consulta', { fecha: fechaLarga() })),
    );
    const cuenta = new Map();
    for (const e of datos.especies) cuenta.set(e.color, (cuenta.get(e.color) || 0) + 1);
    const orden = [...cuenta].sort((a, b) => b[1] - a[1]).slice(0, 4);
    grupos.replaceChildren(...orden.map(([color, n]) => {
      const li = document.createElement('li');
      const barra = document.createElement('i');
      barra.style.cssText = `width:${(n / orden[0][1]) * 100}%;background:var(--c-${color})`;
      li.append(nodo('span', t(`g_${color}`)), barra);
      return li;
    }));
    const lista = datos.especies.filter((e) => e.foto && e.nombre[idiomaActual()]).slice(0, 5);
    pagEspecies.replaceChildren(nodo('h4', t('pag_especies')), ...lista.map(especieFila));
    if (perfil) {
      cuadro?.destruir();
      cuadro = dibujarCuadro(pagCuadro, datosCuadro(datos, perfil, 8), { ancho: 380, altoMontana: 110 });
      pagCuadro.querySelector('svg')?.removeAttribute('width');
      pagCuadro.querySelector('svg')?.removeAttribute('height');
      pagCuadro.querySelectorAll('[tabindex]').forEach((n) => n.removeAttribute('tabindex'));
    }
  }

  textos();
  cuandoCerca(portada, async () => {
    const lam = await crearLamina(lienzo, { puntos: datos.ruta, nombre: datos.nombre }, { aspecto: 1.7, papel: true, marco: false });
    perfil = perfilReal(lam, datos);
    textos();
  });
  return textos;
}
