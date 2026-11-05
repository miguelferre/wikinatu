// Lámina: relieve de la zona con la ruta y las observaciones, con marco, retícula, escala y norte.
//
// crearLamina(contenedor, { puntos, nombre }, opciones) es asíncrona.
// opciones: aspecto, rampa 'noche'|'papel', marco, animarRuta,
//   alAvanzar(fraccion), alPulsar(taxon), alResaltar(taxon|null), densidad, escala.
// Devuelve: dem, ponerObservaciones(obs), resaltar(taxon|null), lienzoComoImagen(tipo, calidad), destruir().
// Además: progresoRuta(f) dibuja la ruta hasta la fracción f, pausar(), reanudar(),
//   proyectar(lat, lon) da [x, y] en px CSS del contenedor, esquinaLibre() da 'ne'|'nw'|'se'|'sw',
//   rango { min, max, intervalo } del relieve.
// obs: [{ lat, lon, taxon, color, nombre? }]. Sin textos con idioma: solo cifras, grados, N y km.

import { acumulado, cajaDe } from './geo.js';
import { RAMPAS, cajaLamina, cargarDem, latAY, lonAX, pintarRelieve } from './terrain.js';
import { RAMPA_PAPEL, RAMPA_PLANCHA, grabarGrano, grabarMar, separarMar } from './grabado.js';
import { grabarCurvas } from './grabado-curvas.js';
import { dibujarMarco } from './lamina-marco.js';

const TEMAS = {
  noche: { fondo: '#0b1d24', tinta: '#f2ead8', suave: '#a9b8b4', halo: 'rgba(7,20,26,.82)', casing: '#07161c', anillo: '#f6efdf', blanco: '#f2ead8' },
  papel: { fondo: '#fdfbf5', tinta: '#26363a', suave: '#55666a', halo: 'rgba(253,251,245,.88)', casing: '#fdfbf5', anillo: '#ffffff', blanco: '#fdfbf5' },
};

const reducido = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

let colores = null;
function color(nombre) {
  if (!colores) {
    const css = getComputedStyle(document.documentElement);
    colores = {};
    for (const c of ['plantas', 'herpetos', 'aves', 'mamiferos', 'insectos', 'hongos', 'otros']) {
      colores[c] = css.getPropertyValue(`--c-${c}`).trim() || '#7d9440';
    }
    colores.ruta = css.getPropertyValue('--ruta').trim() || '#ff7a59';
  }
  return colores[nombre] || colores.otros;
}

function estilos() {
  if (document.getElementById('lamina-estilos')) return;
  const s = document.createElement('style');
  s.id = 'lamina-estilos';
  s.textContent = `
.lamina { position: relative; width: 100%; overflow: hidden; touch-action: pan-y; }
.lamina.llena { height: 100%; }
.lamina canvas { position: absolute; display: block; }
.lamina .sobre { inset: 0; width: 100%; height: 100%; }
.lamina.llena canvas { inset: 0; width: 100%; height: 100%; object-fit: cover; }
.lamina-rotulo { position: absolute; left: 0; top: 0; pointer-events: none; z-index: 3; max-width: 240px;
  padding: 3px 8px 4px; background: var(--noche, #0b1d24); color: var(--fg, #f2ead8); border: 1px solid var(--linea-2, #4a6a70);
  font: 500 15px/1.2 var(--display, serif); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  transition: opacity var(--dur-rapida-salida, 60ms) var(--ease-salida, ease); }
.lamina-rotulo[hidden] { display: block !important; opacity: 0; visibility: hidden; }`;
  document.head.append(s);
}

// Sin red no hay modelo: la ruta se dibuja igual sobre la plancha vacía.
function demVacio(caja, anchoPx) {
  const z = Math.max(1, Math.floor(Math.log2(anchoPx / 256 / ((caja.nelng - caja.swlng) / 360))));
  const x0 = lonAX(caja.swlng, z), y0 = latAY(caja.nelat, z);
  const ancho = Math.max(1, Math.round((lonAX(caja.nelng, z) - x0) * 256));
  const alto = Math.max(1, Math.round((latAY(caja.swlat, z) - y0) * 256));
  const metrosPx = (40075016 * Math.cos((((caja.swlat + caja.nelat) / 2) * Math.PI) / 180)) / (2 ** z * 256);
  return {
    sinDatos: true, z, ancho, alto, caja, metrosPx, altura: () => null,
    aPixel: (lat, lon) => [(lonAX(lon, z) - x0) * 256, (latAY(lat, z) - y0) * 256],
  };
}

function esquinas(geo, ruta) {
  const { M, iw, ih } = geo;
  const c = { nw: [M, M], ne: [M + iw, M], sw: [M, M + ih], se: [M + iw, M + ih] };
  const lejos = Object.entries(c).map(([k, [x, y]]) => {
    let d = Infinity;
    for (let i = 0; i < ruta.length; i += 3) d = Math.min(d, Math.hypot((ruta[i][0] - x) / iw, (ruta[i][1] - y) / ih));
    return [k, d];
  });
  return lejos.sort((a, b) => b[1] - a[1]).map((e) => e[0]);
}

export async function crearLamina(contenedor, { puntos, nombre }, opciones = {}) {
  const o = { aspecto: null, rampa: 'noche', marco: true, animarRuta: false, ...opciones };
  estilos();
  const tema = TEMAS[o.rampa] || TEMAS.noche;
  const caja0 = contenedor.getBoundingClientRect();
  const W = caja0.width > 40 ? caja0.width : 1200;
  const llena = !o.marco && caja0.height > 40;
  const aspecto = o.aspecto || (caja0.height > 40 ? caja0.width / caja0.height : 1.5);
  const H = W / aspecto;
  const M = o.marco ? Math.round(Math.min(46, Math.max(24, W * 0.034))) : 0;
  const geo = { W, H, M, iw: W - 2 * M, ih: H - 2 * M };
  const densidad = o.densidad || Math.min(2, window.devicePixelRatio || 1);

  const raiz = document.createElement('div');
  raiz.className = `lamina${llena ? ' llena' : ''}`;
  raiz.style.background = tema.fondo;
  if (!llena) raiz.style.aspectRatio = `${W} / ${H}`;
  const base = document.createElement('canvas');
  base.className = 'relieve';
  if (!llena) {
    base.style.left = `${(M / W) * 100}%`; base.style.top = `${(M / H) * 100}%`;
    base.style.width = `${(geo.iw / W) * 100}%`; base.style.height = `${(geo.ih / H) * 100}%`;
  }
  const sobre = document.createElement('canvas');
  sobre.className = 'sobre';
  const rotulo = document.createElement('div');
  rotulo.className = 'lamina-rotulo';
  rotulo.hidden = true;
  raiz.append(base, sobre, rotulo);
  raiz.setAttribute('role', 'img');
  raiz.setAttribute('aria-label', nombre || '');
  contenedor.append(raiz);

  const cajaRuta = cajaDe(puntos);
  const caja = cajaLamina(cajaRuta, geo.iw / geo.ih);
  const anchoPx = geo.iw * Math.min(densidad, 2);
  let dem;
  try {
    dem = await cargarDem(caja, anchoPx);
  } catch {
    dem = demVacio(caja, anchoPx);
  }

  let rango = null;
  if (!dem.sinDatos) {
    // El lienzo sigue a la pantalla: una ruta corta llega al zoom máximo y se amplía aquí.
    const techo = Math.sqrt(3.4e6 / (dem.ancho * dem.alto));
    const escala = o.escala || Math.max(1, Math.min(12, techo, (geo.iw * densidad) / dem.ancho));
    base.getContext('2d', { willReadFrequently: true });
    const { dem: seco, hayMar } = separarMar(dem);
    // pintarRelieve lee RAMPAS por nombre: el cambio dura solo esta llamada síncrona.
    const original = { noche: RAMPAS.noche, papel: RAMPAS.papel };
    Object.assign(RAMPAS, { noche: RAMPA_PLANCHA, papel: RAMPA_PAPEL });
    rango = pintarRelieve(base, seco, { rampa: o.rampa, curvas: false, escala });
    Object.assign(RAMPAS, original);
    // Unidad: cuántos píxeles de lienzo vale un píxel CSS de la plancha.
    const unidad = base.width / geo.iw;
    if (hayMar) grabarMar(base, dem, { rampa: o.rampa, escala, unidad });
    await document.fonts?.load('italic 500 12px Alegreya').catch(() => {});
    grabarCurvas(base, seco, { rampa: o.rampa, escala, unidad, intervalo: rango.intervalo, cota: o.marco });
    grabarGrano(base, { rampa: o.rampa });
  } else {
    base.width = 8; base.height = 8;
    const c = base.getContext('2d');
    c.fillStyle = o.rampa === 'papel' ? '#eef0e8' : '#10262e';
    c.fillRect(0, 0, 8, 8);
  }

  const sx = geo.iw / dem.ancho, sy = geo.ih / dem.alto;
  const aPlancha = (lat, lon) => {
    const [x, y] = dem.aPixel(lat, lon);
    return [M + x * sx, M + y * sy];
  };
  const ruta = puntos.map((p) => aPlancha(p.lat, p.lon));
  const kms = acumulado(puntos);
  const totalKm = kms[kms.length - 1] || 0;
  const orden = esquinas(geo, ruta);

  let obs = [];
  let marcas = [];
  let foco = null;
  let progreso = o.animarRuta && !reducido() ? 0 : 1;
  const estado = { vivo: true, raf: 0, pausado: false };
  const cancela = new AbortController();
  const fuentesListas = document.fonts?.ready ?? Promise.resolve();

  // Sobre papel el coral se pierde: la misma ruta va en un rojo de imprenta.
  const tinta = () => (o.rampa === 'papel' ? '#c8341a' : color('ruta'));

  const trazarRuta = (ctx, f) => {
    const n = Math.max(2, Math.ceil(ruta.length * f));
    ctx.beginPath();
    ctx.moveTo(ruta[0][0], ruta[0][1]);
    for (let i = 1; i < n; i++) ctx.lineTo(ruta[i][0], ruta[i][1]);
  };

  const hitosKm = () => {
    const pasos = [0.5, 1, 2, 5, 10, 20, 50, 100];
    const paso = pasos.find((p) => totalKm / p <= 12) || 200;
    const out = [];
    let i = 0;
    for (let k = paso; k < totalKm - paso * 0.3; k += paso) {
      while (i < kms.length - 1 && kms[i] < k) i++;
      out.push({ k, p: ruta[i], q: ruta[Math.max(0, i - 1)] });
    }
    return out;
  };
  // Sin marco la plancha es una viñeta: no lleva hitos.
  const hitos = o.marco ? hitosKm() : [];

  function dibujarRuta(ctx, u) {
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    trazarRuta(ctx, progreso);
    ctx.strokeStyle = tema.casing; ctx.lineWidth = 5.4 * u; ctx.globalAlpha = 0.86; ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = tinta(); ctx.lineWidth = 2.5 * u; ctx.stroke();
    if (progreso < 1) return;
    // Hitos de km: enlazan la lámina con el eje del cuadro.
    ctx.font = `600 ${11 * u}px Alegreya, serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const { k, p, q } of hitos) {
      const a = Math.atan2(p[1] - q[1], p[0] - q[0]) + Math.PI / 2;
      const d = 11 * u;
      const lado = Math.cos(a) < 0 ? -1 : 1;
      const tx = p[0] + Math.cos(a) * d * lado, ty = p[1] + Math.sin(a) * d * lado;
      ctx.beginPath(); ctx.arc(p[0], p[1], 2.3 * u, 0, 7);
      ctx.fillStyle = tema.blanco; ctx.fill();
      ctx.strokeStyle = tema.casing; ctx.lineWidth = 1 * u; ctx.stroke();
      ctx.lineWidth = 3 * u; ctx.strokeStyle = tema.halo; const texto = k.toLocaleString(document.documentElement.lang || 'es');
      ctx.strokeText(texto, tx, ty);
      ctx.fillStyle = tema.tinta; ctx.fillText(texto, tx, ty);
    }
    // Inicio lleno, fin hueco.
    const fin = ruta[ruta.length - 1], ini = ruta[0];
    ctx.beginPath(); ctx.arc(fin[0], fin[1], 5.2 * u, 0, 7);
    ctx.fillStyle = tema.casing; ctx.fill();
    ctx.lineWidth = 2 * u; ctx.strokeStyle = tema.blanco; ctx.stroke();
    ctx.beginPath(); ctx.arc(ini[0], ini[1], 6 * u, 0, 7);
    ctx.fillStyle = tinta(); ctx.fill();
    ctx.lineWidth = 1.8 * u; ctx.strokeStyle = tema.blanco; ctx.stroke();
  }

  function dibujarMarcas(ctx, u) {
    const r = (W < 500 ? 3.2 : 3.8) * u;
    const anillo = 1.5 * u;
    for (const m of marcas) {
      if (foco != null && m.taxon === foco) continue;
      ctx.globalAlpha = foco != null ? 0.22 : 1;
      ctx.beginPath(); ctx.arc(m.x, m.y, r, 0, 7);
      ctx.fillStyle = color(m.color); ctx.fill();
      if (foco == null) { ctx.lineWidth = anillo; ctx.strokeStyle = tema.anillo; ctx.stroke(); }
    }
    ctx.globalAlpha = 1;
    if (foco == null) return;
    for (const m of marcas) {
      if (m.taxon !== foco) continue;
      ctx.beginPath(); ctx.arc(m.x, m.y, r * 1.6, 0, 7);
      ctx.fillStyle = color(m.color); ctx.fill();
      ctx.lineWidth = anillo * 1.2; ctx.strokeStyle = tema.anillo; ctx.stroke();
    }
  }

  function pintar(ctx, u) {
    if (o.marco) {
      dibujarMarco(ctx, u, { geo, dem, caja: dem.caja, tema, ruta, esquinaEscala: orden.find((e) => e[0] === 's' && e !== orden[0]) || 'sw' });
    }
    dibujarMarcas(ctx, u);
    dibujarRuta(ctx, u);
  }

  function redibujar() {
    if (!estado.vivo) return;
    const ancho = raiz.clientWidth || W;
    const px = llena ? 1 : ancho / W;
    const k = Math.min(3, px * densidad);
    sobre.width = Math.round(W * k); sobre.height = Math.round(H * k);
    const ctx = sobre.getContext('2d');
    ctx.setTransform(k, 0, 0, k, 0, 0);
    pintar(ctx, 1);
  }

  const obsRes = new ResizeObserver(() => redibujar());
  obsRes.observe(raiz);
  fuentesListas.then(() => redibujar());
  redibujar();
  await Promise.race([fuentesListas, new Promise((r) => setTimeout(r, 800))]);
  redibujar();

  // Relación entre px CSS del contenedor y la plancha. Con object-fit: cover hay recorte.
  function ajuste() {
    const b = raiz.getBoundingClientRect();
    const s = llena ? Math.max(b.width / W, b.height / H) : b.width / W;
    return { b, s, ox: (b.width - W * s) / 2, oy: (b.height - H * s) / 2 };
  }

  function buscar(ev) {
    const { b, s, ox, oy } = ajuste();
    const x = (ev.clientX - b.left - ox) / s, y = (ev.clientY - b.top - oy) / s;
    const radio = (ev.pointerType === 'touch' ? 20 : 11) / s;
    let mejor = null, dMin = radio * radio;
    for (const m of marcas) {
      const d = (m.x - x) ** 2 + (m.y - y) ** 2;
      if (d < dMin) { dMin = d; mejor = m; }
    }
    return mejor;
  }

  function mostrarRotulo(m, ev) {
    if (!m || !m.nombre) { rotulo.hidden = true; return; }
    const { b } = ajuste();
    rotulo.textContent = m.nombre;
    rotulo.hidden = false;
    const w = rotulo.offsetWidth, h = rotulo.offsetHeight;
    const x = Math.min(b.width - w - 6, Math.max(6, ev.clientX - b.left + 12));
    const y = Math.max(6, ev.clientY - b.top - h - 10);
    rotulo.style.transform = `translate(${x}px, ${y}px)`;
  }

  const sig = { signal: cancela.signal };
  let ultima = null;
  raiz.addEventListener('pointermove', (ev) => {
    const m = buscar(ev);
    raiz.style.cursor = m ? 'pointer' : '';
    mostrarRotulo(m, ev);
    const t = m ? m.taxon : null;
    if (t !== ultima) { ultima = t; o.alResaltar?.(t); }
  }, sig);
  raiz.addEventListener('pointerleave', () => {
    rotulo.hidden = true;
    if (ultima != null) { ultima = null; o.alResaltar?.(null); }
  }, sig);
  // Con el dedo no hay hover: el primer toque da el nombre y el segundo abre la especie.
  let tocada = null;
  raiz.addEventListener('click', (ev) => {
    const m = buscar(ev);
    if (ev.pointerType === 'touch') {
      mostrarRotulo(m, ev);
      o.alResaltar?.(m ? m.taxon : null);
      if (!m || m.taxon !== tocada) { tocada = m ? m.taxon : null; return; }
    }
    if (m) o.alPulsar?.(m.taxon);
  }, sig);

  const api = {
    dem,
    rango,
    raiz,
    ponerObservaciones(lista) {
      obs = lista || [];
      marcas = obs.map((p) => {
        const [x, y] = aPlancha(p.lat, p.lon);
        return { ...p, x, y };
      }).filter((m) => m.x >= M && m.x <= M + geo.iw && m.y >= M && m.y <= M + geo.ih);
      redibujar();
    },
    resaltar(taxon) {
      if (foco === (taxon ?? null)) return;
      foco = taxon ?? null;
      redibujar();
    },
    progresoRuta(f) {
      progreso = Math.max(0, Math.min(1, f));
      redibujar();
    },
    pausar() { estado.pausado = true; },
    reanudar() { estado.pausado = false; },
    proyectar(lat, lon) {
      const { s, ox, oy } = ajuste();
      const [x, y] = aPlancha(lat, lon);
      return [ox + x * s, oy + y * s];
    },
    esquinaLibre: () => orden[0],
    redibujar,
    lienzoComoImagen(tipo = 'image/png', calidad = 0.92) {
      const c = document.createElement('canvas');
      c.width = sobre.width; c.height = sobre.height;
      const ctx = c.getContext('2d');
      const k = c.width / W;
      ctx.fillStyle = tema.fondo;
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(base, M * k, M * k, geo.iw * k, geo.ih * k);
      ctx.drawImage(sobre, 0, 0);
      return c.toDataURL(tipo, calidad);
    },
    destruir() {
      estado.vivo = false;
      cancelAnimationFrame(estado.raf);
      obsRes.disconnect();
      cancela.abort();
      raiz.remove();
    },
  };

  if (o.animarRuta && !reducido()) {
    const dur = o.duracionRuta || 16000;
    let previo = performance.now();
    const paso = (ahora) => {
      if (!estado.vivo) return;
      if (!estado.pausado) progreso = Math.min(1, progreso + (ahora - previo) / dur);
      previo = ahora;
      redibujar();
      o.alAvanzar?.(progreso);
      if (progreso < 1) estado.raf = requestAnimationFrame(paso);
    };
    estado.raf = requestAnimationFrame(paso);
  } else {
    o.alAvanzar?.(1);
  }
  return api;
}
