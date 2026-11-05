// Cuadro: perfil de la ruta con especies rotuladas al estilo de un panorama alpino.
//
// dibujarCuadro(contenedor, { perfil, etiquetas, leyenda }, opciones)
// perfil: [{ km, alt }]. etiquetas: [{ km, alt, nombre, cientifico, color, taxon }], de más a menos vistas.
// leyenda: [{ color, etiqueta, n? }]. Sin leyenda, se deduce de los colores presentes.
// opciones: tema 'noche'|'papel', ancho, alto, marcas [{ km, color }], etiquetaEje, alPulsar, alResaltar, densa.
// Devuelve { resaltar(taxon|null), comoSvg(), destruir() }.
// Si no caben todas las etiquetas, quedan las primeras: ~24 a 1440 px y ~10 a 375 px.

import { pasoAltura, pasoKm, repartir } from './analisis.js';
import { pinturaCuadro, token } from './temas.js';

const ANGULO = 55;
const SENO = Math.sin((ANGULO * Math.PI) / 180), COSENO = Math.cos((ANGULO * Math.PI) / 180);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n1 = (v) => Math.round(v * 10) / 10;

let medidor = null;
function medir(texto, fuente) {
  medidor ||= document.createElement('canvas').getContext('2d');
  medidor.font = fuente;
  return medidor.measureText(texto).width;
}

const colorGrupo = (nombre) => token(`c-${nombre}`);

function estilos() {
  if (document.getElementById('cuadro-estilos')) return;
  const s = document.createElement('style');
  s.id = 'cuadro-estilos';
  s.textContent = `
.cuadro { display: block; width: 100%; height: auto; }
.cuadro .et { cursor: pointer; outline: none; }
.cuadro .et .guia { transition: stroke-width var(--dur-rapida-salida, 60ms) var(--ease-salida, ease), opacity var(--dur-rapida-salida, 60ms) var(--ease-salida, ease); }
.cuadro .et text { transition: opacity var(--dur-rapida-salida, 60ms) var(--ease-salida, ease); }
.cuadro.con-foco .et:not(.activa) text, .cuadro.con-foco .et:not(.activa) .guia, .cuadro.con-foco .et:not(.activa) circle { opacity: .28; }
.cuadro .et.activa .guia { stroke-width: 1.6; }
.cuadro .et:focus-visible .caja { stroke: var(--oro); stroke-width: 2; }
.cuadro .caja { fill: transparent; stroke: none; }`;
  document.head.append(s);
}

function trazo(puntos) {
  return puntos.map((p, i) => `${i ? 'L' : 'M'}${n1(p[0])} ${n1(p[1])}`).join('');
}

function leyendaDe(etiquetas) {
  return [...new Set(etiquetas.map((e) => e.color))].map((c) => ({ color: c, etiqueta: c }));
}

function geometria(W, tema) {
  const estrecho = W < 620;
  const F = estrecho ? 7 : 11; // filetes
  const ejeI = estrecho ? 36 : 54, ejeD = estrecho ? 12 : 54;
  const x0 = F + ejeI, x1 = W - F - ejeD;
  const c1 = estrecho ? 13.5 : 16.5, c2 = estrecho ? 12 : 14.5;
  const f1 = `500 ${c1}px Alegreya, serif`, f2 = `italic 400 ${c2}px Alegreya, serif`;
  const dos = (c1 + c2 + 2) / SENO, uno = (c1 + 3) / SENO;
  return { estrecho, F, x0, x1, c1, c2, f1, f2, dos, uno, tema };
}

function preparar(etiquetas, g) {
  // Con dos líneas caben menos: se prefiere una línea por rótulo si así entran todas.
  const util = g.x1 - g.x0;
  const conDos = Math.floor(util * 0.86 / g.dos);
  const sinDos = Math.floor(util * 0.86 / g.uno);
  const dosLineas = etiquetas.length <= conDos || conDos >= (g.estrecho ? 10 : 24);
  const cupo = dosLineas ? conDos : sinDos;
  const lista = etiquetas.slice(0, cupo).map((e) => {
    const nombre = e.nombre && e.nombre !== e.cientifico ? e.nombre : null;
    const a = nombre ? medir(nombre, g.f1) : 0;
    const b = medir(e.cientifico || '', g.f2);
    const largo = dosLineas ? Math.max(a, b) : (nombre ? a : b);
    return { ...e, nombre, largo: Math.min(largo, g.estrecho ? 200 : 300) };
  });
  return { lista: lista.sort((p, q) => p.km - q.km), dosLineas };
}

function marcoSvg(W, H, F, t) {
  return `<rect x="1" y="1" width="${W - 2}" height="${H - 2}" fill="none" stroke="${t.tinta}" stroke-width="1.5"/>
<rect x="${F / 2 + 1}" y="${F / 2 + 1}" width="${W - F - 2}" height="${H - F - 2}" fill="none" stroke="${t.tinta}" stroke-width=".6"/>`;
}

function fondoCielo(g, t, yCima, yBase) {
  // Cielo a buril: rayas horizontales que se abren hacia arriba.
  const lineas = [];
  let y = yBase, paso = 2.6, n = 0;
  while (y > yCima && n < 60) {
    lineas.push(`M${g.x0} ${n1(y)}H${g.x1}`);
    y -= paso; paso *= 1.075; n++;
  }
  return `<path d="${lineas.join('')}" stroke="${t.cielo}" stroke-width=".7" fill="none"/>`;
}

function pintar(contenedor, datos, o, W) {
  const { perfil, etiquetas } = datos;
  const t = pinturaCuadro(o.tema);
  const leyenda = (datos.leyenda && datos.leyenda.length ? datos.leyenda : leyendaDe(etiquetas));
  const g = geometria(W, t);
  const { lista, dosLineas } = preparar(etiquetas, g);
  const { F, x0, x1, estrecho } = g;

  const maxLargo = lista.reduce((m, e) => Math.max(m, e.largo), 120);
  const yAlto = F + 12; // tope del cielo
  const cielo = maxLargo * SENO + (dosLineas ? g.c2 : 0) * COSENO + 10;
  const montana = o.altoMontana || (estrecho ? 150 : 270);
  const yBase0 = yAlto + cielo; // línea de pie de los rótulos
  // Si los rótulos se desplazan mucho, las guías piden más aire para abrirse en abanico.
  const desvio = lista.length ? Math.max(...lista.map((e, i) => Math.abs(g.x0 + (i + 0.5) * ((g.x1 - g.x0) / lista.length) - (g.x0 + (e.km / (datos.perfil.at(-1).km || 1)) * (g.x1 - g.x0))))) : 0;
  const yCima = yBase0 + Math.min(estrecho ? 46 : 86, Math.max(estrecho ? 26 : 38, desvio * 0.16)); // cota más alta
  const yPie = yCima + montana;
  const yEje = yPie + (estrecho ? 24 : 28);

  // Leyenda en filas, con el ancho real de cada entrada.
  const fl = `500 ${estrecho ? 13 : 14.5}px "Alegreya Sans", sans-serif`;
  const filas = [[]];
  let cx = x0;
  for (const l of leyenda) {
    const texto = l.n != null ? `${l.etiqueta} ${l.n}` : l.etiqueta;
    const w = 14 + medir(texto, fl) + (estrecho ? 14 : 22);
    if (cx + w > x1 && filas[filas.length - 1].length) { filas.push([]); cx = x0; }
    filas[filas.length - 1].push({ ...l, texto, x: cx });
    cx += w;
  }
  const altoFila = estrecho ? 20 : 22;
  const yLeyenda = yEje + (estrecho ? 18 : 22);
  const H = Math.round(yLeyenda + filas.length * altoFila + F + 4);

  const alts = perfil.map((p) => p.alt).filter((a) => a != null);
  const aMin = Math.min(...alts), aMax = Math.max(...alts);
  const rangoReal = Math.max(aMax - aMin, 40);
  const suelo = aMin - rangoReal * 0.2;
  const techo = aMin + rangoReal;
  const kmMax = perfil[perfil.length - 1].km || 1;
  const X = (km) => x0 + (km / kmMax) * (x1 - x0);
  const Y = (a) => yPie - ((a - suelo) / (techo - suelo)) * (yPie - yCima);
  const cresta = perfil.map((p) => [X(p.km), Y(p.alt ?? aMin)]);
  const dSil = `${trazo(cresta)}L${x1} ${yPie}L${x0} ${yPie}Z`;
  const id = `c${Math.random().toString(36).slice(2, 8)}`;

  // Relleno por altitud, con la misma rampa de la lámina.
  const { rampa } = t;
  const stops = [...rampa].reverse().map((c, i) => `<stop offset="${(i / (rampa.length - 1)).toFixed(3)}" stop-color="${c}"/>`).join('');

  // Estratos: la cresta repetida hacia abajo, cada vez más plana.
  const media = cresta.reduce((s, p) => s + p[1], 0) / cresta.length;
  const estratos = [];
  const nE = estrecho ? 11 : 17;
  for (let k = 1; k <= nE; k++) {
    const off = k * (estrecho ? 4.2 : 5.2) + k * k * (estrecho ? 0.34 : 0.42);
    const relax = Math.min(0.92, k / (nE + 3));
    const pts = cresta.filter((_, i) => i % 2 === 0).map(([x, y]) => [x, y + (media - y) * relax + off]);
    estratos.push(`<path d="${trazo(pts)}" stroke="${t.tinta}" stroke-opacity="${(0.34 - k * 0.015).toFixed(3)}" stroke-width=".7" fill="none"/>`);
  }

  // Sombreado de buril en las laderas que miran a la derecha, contra la luz del oeste.
  let sombra = '';
  const pasoS = estrecho ? 2.4 : 2.8;
  let ultimoX = -9;
  for (let i = 1; i < cresta.length; i++) {
    const [xa, ya] = cresta[i - 1], [xb, yb] = cresta[i];
    if (xb - ultimoX < pasoS) continue;
    const pendiente = (yb - ya) / Math.max(0.2, xb - xa);
    if (pendiente <= 0.06) continue;
    const L = Math.min(estrecho ? 22 : 34, 6 + pendiente * (estrecho ? 16 : 22));
    sombra += `M${n1(xb)} ${n1(yb + 1)}l${n1(-L * 0.4)} ${n1(L)}`;
    ultimoX = xb;
  }

  const parteA = {
    W, H, g, t, id, dSil, stops, cresta, lista, dosLineas, yAlto, yBase0, yCima, yPie, yEje, yLeyenda, altoFila, filas, fl, F, x0, x1, X, Y,
    aMin, aMax, suelo, techo, kmMax, estratos, sombra, estrecho,
  };
  return dibujarSvg(contenedor, parteA, o);
}

function ejes(p) {
  const { x0, x1, X, Y, yCima, yPie, yEje, aMin, techo, suelo, kmMax, t, estrecho, F, W } = p;
  const paso = pasoAltura(techo - suelo, estrecho ? 4 : 6);
  const pasoK = pasoKm(kmMax);
  const fuente = `font-family="Alegreya, serif" font-size="${estrecho ? 11.5 : 13.5}" fill="${t.suave}"`;
  let s = '';
  let lineas = '';
  for (let a = Math.ceil(suelo / paso) * paso; a <= techo + 1; a += paso) {
    const y = Y(a);
    if (y < yCima - 8 || y > yPie - 4) continue;
    lineas += `M${x0 - 6} ${n1(y)}H${x0}M${x1} ${n1(y)}h6`;
    s += `<line x1="${x0}" x2="${x1}" y1="${n1(y)}" y2="${n1(y)}" stroke="${t.tinta}" stroke-opacity=".16" stroke-width=".6" stroke-dasharray="1 4"/>`;
    s += `<text x="${x0 - 9}" y="${n1(y + 4)}" text-anchor="end" ${fuente}>${a}</text>`;
    if (!estrecho) s += `<text x="${x1 + 9}" y="${n1(y + 4)}" ${fuente}>${a}</text>`;
  }
  s += `<text x="${x0 - 9}" y="${n1(yCima - 12)}" text-anchor="end" ${fuente}>m</text>`;
  // Eje de km con marcas mayores y menores.
  const menor = pasoK / 5;
  for (let k = 0; k <= kmMax + 1e-6; k += menor) {
    const mayor = Math.abs(k / pasoK - Math.round(k / pasoK)) < 1e-6;
    const x = X(k);
    lineas += `M${n1(x)} ${yPie}v${mayor ? 7 : 3.5}`;
    if (mayor) s += `<text x="${n1(x)}" y="${yEje - (estrecho ? 4 : 5)}" text-anchor="middle" ${fuente}>${(Math.round(k * 10) / 10).toLocaleString(document.documentElement.lang || 'es')}</text>`;
  }
  s += `<text x="${x1 + (estrecho ? 8 : 9)}" y="${yEje - (estrecho ? 4 : 5)}" text-anchor="${estrecho ? 'end' : 'start'}" ${fuente}>km</text>`;
  s += `<path d="${lineas}M${x0} ${yCima - 8}V${yPie}H${x1}V${yCima - 8}" stroke="${t.tinta}" stroke-width=".8" fill="none"/>`;
  return s;
}

function rotulos(p) {
  const { lista, dosLineas, g, X, Y, yBase0, yCima, x0, x1, W, F, t, cresta } = p;
  const sep = dosLineas ? g.dos : g.uno;
  const xs = lista.map((e) => X(e.km));
  const topes = lista.map((e) => W - F - 8 - e.largo * COSENO);
  const lx = repartir(xs, sep, x0 + 2, topes);
  const yCodo = yCima - 7;
  return lista.map((e, i) => {
    const px = X(e.km), py = Y(e.alt);
    const c = colorGrupo(e.color);
    const x = lx[i];
    const guia = `M${n1(px)} ${n1(py)}V${n1(yCodo)}L${n1(x)} ${n1(yBase0 + 3)}`;
    const linea1 = e.nombre ? `<text font-family="Alegreya, ${'&quot;Microsoft JhengHei&quot;'}, serif" font-weight="500" font-size="${g.c1}" fill="${t.tinta}">${esc(e.nombre)}</text>` : '';
    const y2 = e.nombre ? g.c2 + 1.5 : 0;
    const linea2 = dosLineas || !e.nombre
      ? `<text y="${y2}" font-family="Alegreya, serif" font-style="italic" font-size="${g.c2}" fill="${t.suave}">${esc(e.cientifico || '')}</text>` : '';
    const tit = `${e.nombre ? `${e.nombre}, ` : ''}${e.cientifico || ''}`;
    return `<g class="et" data-taxon="${esc(e.taxon)}" tabindex="0" role="button" aria-label="${esc(tit)}">
<path class="guia" d="${guia}" stroke="${c}" stroke-width=".9" fill="none"/>
<circle cx="${n1(x)}" cy="${n1(yBase0 + 3)}" r="2.2" fill="${c}"/>
<circle cx="${n1(px)}" cy="${n1(py)}" r="3.6" fill="${c}" stroke="${t.anillo}" stroke-width="1.5"/>
<g transform="translate(${n1(x)} ${n1(yBase0)}) rotate(${-ANGULO})"><rect class="caja" x="-3" y="${-g.c1}" width="${n1(e.largo + 8)}" height="${n1(g.c1 + (dosLineas ? g.c2 + 6 : 6))}"/>${linea1}${linea2}</g>
</g>`;
  }).join('');
}

function dibujarSvg(contenedor, p, o) {
  const { W, H, t, id, dSil, stops, cresta, yCima, yPie, x0, x1, yAlto, F, sombra, estratos, filas, yLeyenda, altoFila, X, kmMax, estrecho } = p;
  const rug = (o.marcas || []).map((m) => `<rect x="${n1(X(m.km) - 0.5)}" y="${yPie - 9}" width="1" height="7" fill="${colorGrupo(m.color)}"/>`).join('');
  const leyenda = filas.flatMap((fila, i) => fila.map((l) => {
    const y = yLeyenda + i * altoFila;
    return `<circle cx="${n1(l.x + 5)}" cy="${y - 4}" r="4.4" fill="${colorGrupo(l.color)}" stroke="${t.anillo}" stroke-width="1"/>
<text x="${n1(l.x + 15)}" y="${y}" font-family="&quot;Alegreya Sans&quot;, sans-serif" font-weight="500" font-size="${estrecho ? 13 : 14.5}" fill="${t.tinta}">${esc(l.texto)}</text>`;
  })).join('');
  const svg = `<svg class="cuadro" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="${esc(o.titulo || '')}">
<defs><linearGradient id="${id}g" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="${yCima}" y2="${yPie}">${stops}</linearGradient>
<clipPath id="${id}c"><path d="${dSil}"/></clipPath></defs>
<rect width="${W}" height="${H}" fill="${t.fondo}"/>
${marcoSvg(W, H, F, t)}
${fondoCielo(p.g, t, yCima - 4, yPie - 2)}
<path d="${dSil}" fill="${t.fondo}"/>
${ejes(p)}
<path d="${dSil}" fill="url(#${id}g)"/>
<g clip-path="url(#${id}c)">${estratos.join('')}<path d="${sombra}" stroke="${t.sombra}" stroke-opacity=".5" stroke-width=".6" fill="none"/>${rug}</g>
<path d="${trazo(cresta)}" stroke="${t.sombra}" stroke-width="3" fill="none" stroke-linejoin="round"/>
<path d="${trazo(cresta)}" stroke="${t.tinta}" stroke-width="1.3" fill="none" stroke-linejoin="round"/>
${rotulos(p)}
${leyenda}
</svg>`;
  contenedor.innerHTML = svg;
  return contenedor.querySelector('svg');
}

export function dibujarCuadro(contenedor, datos, opciones = {}) {
  estilos();
  const o = { tema: 'noche', ...opciones };
  let svg = null;
  let foco = null;
  let ultimoAncho = 0;

  const aplicarFoco = () => {
    if (!svg) return;
    svg.classList.toggle('con-foco', foco != null);
    svg.querySelectorAll('.et').forEach((e) => e.classList.toggle('activa', e.dataset.taxon === String(foco)));
  };

  const render = () => {
    const ancho = o.ancho || contenedor.clientWidth || 1000;
    if (!datos.perfil?.length || !datos.perfil.some((p) => p.alt != null)) { contenedor.replaceChildren(); return; }
    ultimoAncho = ancho;
    svg = pintar(contenedor, datos, o, ancho);
    aplicarFoco();
  };

  const clave = (e) => e.target.closest?.('.et')?.dataset.taxon ?? null;
  const convertir = (v) => (v != null && /^\d+$/.test(v) ? Number(v) : v);
  const cancela = new AbortController();
  const sig = { signal: cancela.signal };
  contenedor.addEventListener('pointerover', (e) => {
    const k = convertir(clave(e));
    if (k == null) return;
    foco = k; aplicarFoco(); o.alResaltar?.(k);
  }, sig);
  contenedor.addEventListener('pointerout', (e) => {
    if (clave(e) == null) return;
    foco = null; aplicarFoco(); o.alResaltar?.(null);
  }, sig);
  contenedor.addEventListener('focusin', (e) => {
    const k = convertir(clave(e));
    if (k != null) { foco = k; aplicarFoco(); o.alResaltar?.(k); }
  }, sig);
  contenedor.addEventListener('focusout', () => { foco = null; aplicarFoco(); o.alResaltar?.(null); }, sig);
  contenedor.addEventListener('click', (e) => {
    const k = convertir(clave(e));
    if (k != null) o.alPulsar?.(k);
  }, sig);
  contenedor.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const k = convertir(clave(e));
    if (k != null) { e.preventDefault(); o.alPulsar?.(k); }
  }, sig);

  render();
  document.fonts?.ready.then(() => { if (!cancela.signal.aborted) render(); });
  let raf = 0;
  const obs = o.ancho ? null : new ResizeObserver(() => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      if (Math.abs(contenedor.clientWidth - ultimoAncho) > 1) render();
    });
  });
  obs?.observe(contenedor);

  return {
    resaltar(taxon) { foco = taxon ?? null; aplicarFoco(); },
    comoSvg: () => (svg ? svg.outerHTML : ''),
    destruir() { obs?.disconnect(); cancela.abort(); contenedor.replaceChildren(); },
  };
}
