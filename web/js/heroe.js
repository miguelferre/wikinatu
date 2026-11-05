// Héroe de la portada: una lámina a oscuras. Una lámpara camina la ruta real, revela el
// relieve a su paso y enciende cada especie en el punto donde alguien la vio. Debajo,
// el perfil va escribiendo el cuadro. Todo son datos de web/data/tristaina.json.

import { cargarDem, pintarRelieve, lonAX, latAY, RAMPAS } from './terrain.js';
import { cajaDe } from './geo.js';
import { t, idiomaActual, alCambiarIdioma } from './i18n.js';
import { grabarCurvas } from './grabado-curvas.js';
import { dibujarTira, nombreDe, fmt } from './heroe-tira.js';

const Z = 12;
const SEGUNDOS = 64;        // una vuelta a la ruta
const RESPIRO = 8;          // lámina completa antes de empezar otra vez
const MAX_RES = 1800;       // lado mayor del canvas
const SEPARACION_AVISOS = 1.7;
const VIDA_AVISO = 4.2;
const MAX_AVISOS = 3;

// Plancha: la misma lámina casi sin color, para que solo se lean las curvas de nivel.
RAMPAS.plancha = ['#061217', '#08171c', '#0a1b21', '#0b1e25', '#0c2128', '#0e242c', '#0f2730', '#112a33', '#122d37'];

const COLOR = {};
const leerColores = () => {
  const s = getComputedStyle(document.documentElement);
  for (const c of ['plantas', 'herpetos', 'aves', 'mamiferos', 'insectos', 'hongos', 'otros']) COLOR[c] = s.getPropertyValue(`--c-${c}`).trim();
  COLOR.ruta = s.getPropertyValue('--ruta').trim();
  COLOR.fg = s.getPropertyValue('--fg').trim();
  COLOR.noche = s.getPropertyValue('--noche').trim();
  COLOR.oro = s.getPropertyValue('--oro').trim();
};

const xALon = (x) => (x / 2 ** Z) * 360 - 180;
const yALat = (y) => (Math.atan(Math.sinh(Math.PI - (2 * Math.PI * y) / 2 ** Z)) * 180) / Math.PI;

// Encaja la ruta en un rectángulo seguro de la pantalla y deduce la caja de toda la lámina.
function encuadrar(ruta, w, h, seguro) {
  const c = cajaDe(ruta);
  const x0 = lonAX(c.swlng, Z), x1 = lonAX(c.nelng, Z), y0 = latAY(c.nelat, Z), y1 = latAY(c.swlat, Z);
  const k = Math.min((seguro.x1 - seguro.x0) / (x1 - x0), (seguro.y1 - seguro.y0) / (y1 - y0));
  const izq = (x0 + x1) / 2 - (seguro.x0 + seguro.x1) / 2 / k;
  const arr = (y0 + y1) / 2 - (seguro.y0 + seguro.y1) / 2 / k;
  return {
    caja: { swlng: xALon(izq), nelng: xALon(izq + w / k), nelat: yALat(arr), swlat: yALat(arr + h / k) },
    proy: (lat, lon) => [(lonAX(lon, Z) - izq) * k, (latAY(lat, Z) - arr) * k],
  };
}

function reticula(ctx, caja, w, h, proy, dpr) {
  const paso = (caja.nelng - caja.swlng) > 0.08 ? 1 / 30 : 1 / 60; // dos minutos o uno
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.strokeStyle = 'rgba(242,234,216,.075)';
  ctx.lineWidth = 1;
  ctx.font = '500 11px "Alegreya Sans SC", sans-serif';
  ctx.fillStyle = 'rgba(242,234,216,.55)';
  const grado = (v, a, b) => {
    const g = Math.floor(v + 1e-9), m = Math.round((v - g) * 60);
    return `${g}° ${String(m).padStart(2, '0')}′ ${v >= 0 ? a : b}`;
  };
  const margen = 18;
  // Borde de atlas: tramos alternos en el canto derecho, de unos 40 px.
  const pxGrado = Math.abs(proy(caja.swlat + 0.01, caja.swlng)[1] - proy(caja.swlat, caja.swlng)[1]) * 100;
  const medio = [1 / 60, 1 / 120, 1 / 240, 1 / 600, 1 / 1200].find((m) => m * pxGrado < 70);
  for (let n = Math.floor(caja.swlat / medio); n * medio < caja.nelat; n++) {
    const ya = proy(n * medio, caja.swlng)[1], yb = proy((n + 1) * medio, caja.swlng)[1];
    ctx.fillStyle = n % 2 ? 'rgba(242,234,216,.62)' : 'rgba(8,24,31,.95)';
    ctx.fillRect(w - 7, yb, 7, ya - yb);
  }
  ctx.fillStyle = 'rgba(242,234,216,.6)';
  for (let lon = Math.ceil(caja.swlng / paso) * paso; lon < caja.nelng; lon += paso) {
    const [x] = proy(caja.nelat, lon);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let lat = Math.ceil(caja.swlat / paso) * paso; lat < caja.nelat; lat += paso) {
    const [, y] = proy(lat, caja.swlng);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    ctx.textAlign = 'right';
    if (y > 70) ctx.fillText(grado(lat, 'N', 'S'), w - margen, y - 4);
  }
  ctx.restore();
}

// Barra de escala y norte, arriba a la derecha.
function escala(ctx, caja, w, y, proy, dpr) {
  const lat = (caja.swlat + caja.nelat) / 2;
  const mPorGrado = 111320 * Math.cos((lat * Math.PI) / 180);
  const pxPorM = (proy(lat, caja.swlng + 0.01)[0] - proy(lat, caja.swlng)[0]) / (0.01 * mPorGrado);
  const metros = pxPorM * 500 > 150 ? 250 : 500;
  const largo = metros * pxPorM;
  const x = w - 34 - largo;
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.strokeStyle = 'rgba(242,234,216,.8)';
  ctx.fillStyle = 'rgba(242,234,216,.8)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x, y); ctx.lineTo(x + largo, y); ctx.lineTo(x + largo, y - 4); ctx.stroke();
  ctx.fillRect(x, y - 1.5, largo / 2, 3);
  ctx.font = '500 12px "Alegreya Sans", sans-serif'; // en versalitas, m parecería M
  ctx.textAlign = 'right';
  ctx.fillText(`${metros} m`, x + largo, y - 8);
  ctx.textAlign = 'left';
  ctx.fillText('N', x - 22, y - 2);
  ctx.beginPath(); ctx.moveTo(x - 18, y - 22); ctx.lineTo(x - 21.5, y - 14); ctx.lineTo(x - 14.5, y - 14); ctx.closePath(); ctx.fill();
  ctx.restore();
}

export function iniciarHeroe(datos) {
  leerColores();
  const seccion = document.getElementById('arriba');
  const base = document.getElementById('heroe-base');
  const luz = document.getElementById('heroe-luz');
  const tinta = document.getElementById('heroe-tinta');
  const avisos = document.getElementById('heroe-avisos');
  const lectura = document.getElementById('heroe-lectura');
  const pausa = document.getElementById('heroe-pausa');
  const reducido = matchMedia('(prefers-reduced-motion: reduce)');

  const especies = new Map(datos.especies.map((e) => [e.id, e]));
  const ruta = datos.ruta;
  const total = ruta[ruta.length - 1].km;
  const puntos = datos.puntos.filter((p) => especies.has(p.taxon));
  const altDe = (km) => {
    let i = 1;
    while (i < ruta.length - 1 && ruta[i].km < km) i++;
    const a = ruta[i - 1], b = ruta[i], f = b.km > a.km ? (km - a.km) / (b.km - a.km) : 0;
    return a.alt + (b.alt - a.alt) * Math.min(1, Math.max(0, f));
  };

  let w = 0, h = 0, dpr = 1, proy = null, rutaPx = [], puntosPx = [];
  let relieve = null, mascara = null, mctx = null, escalaM = 1 / 3, radio = 60;
  let reloj = 0, ultimo = 0, km = 0, siguiente = 0, sellado = 0, indiceSello = 0;
  let enPausa = false, visible = true, marcha = false, raf = 0, ultimoAviso = -9;
  let vistos = new Set(), estallidos = [], activos = [], tira = null, version = 0;

  const sello = (x, y) => {
    const r = radio * escalaM;
    const g = mctx.createRadialGradient(x * escalaM, y * escalaM, 0, x * escalaM, y * escalaM, r);
    g.addColorStop(0, 'rgba(0,0,0,.2)');
    g.addColorStop(.55, 'rgba(0,0,0,.09)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    mctx.fillStyle = g;
    mctx.fillRect(x * escalaM - r, y * escalaM - r, r * 2, r * 2);
  };

  function reiniciar() {
    reloj = 0; km = 0; siguiente = 0; sellado = 0; indiceSello = 0; ultimoAviso = -9;
    vistos = new Set(); estallidos = [];
    activos.forEach((a) => a.nodo.remove()); activos = [];
    mctx?.clearRect(0, 0, mascara.width, mascara.height);
    tira?.limpiar();
  }

  function aviso(p, x, y, ahora) {
    const e = especies.get(p.taxon);
    const nodo = document.createElement('div');
    nodo.className = `heroe-aviso${x > w * 0.72 ? ' izquierda' : ''}`;
    nodo.style.setProperty('--x', `${x}px`);
    nodo.style.setProperty('--y', `${y}px`);
    nodo.style.setProperty('--color', `var(--c-${e.color})`);
    const n = document.createElement('b'); n.textContent = nombreDe(e);
    const c = document.createElement('i'); c.textContent = e.cientifico;
    nodo.append(n, c);
    avisos.append(nodo);
    activos.push({ nodo, hasta: ahora + VIDA_AVISO, x, y });
  }

  // Avanza el caminante: revela, enciende y escribe.
  function avanzar(dt) {
    reloj += dt;
    km = Math.min(total, (reloj / SEGUNDOS) * total);
    while (indiceSello < rutaPx.length && ruta[indiceSello].km <= km) {
      if (mctx) sello(rutaPx[indiceSello][0], rutaPx[indiceSello][1]);
      indiceSello++;
    }
    while (siguiente < puntosPx.length && puntosPx[siguiente].p.km <= km) {
      const q = puntosPx[siguiente++];
      estallidos.push({ x: q.x, y: q.y, color: q.color, t: reloj });
      if (vistos.has(q.p.taxon)) continue;
      vistos.add(q.p.taxon);
      // Solo las que tienen nombre en el idioma de la página: las demás ya salen en el recuento.
      const conNombre = especies.get(q.p.taxon).nombre[idiomaActual()];
      const libre = conNombre && activos.length < MAX_AVISOS && reloj - ultimoAviso > SEPARACION_AVISOS;
      const lejos = activos.every((a) => Math.hypot(a.x - q.x, a.y - q.y) > 90);
      if (libre && lejos) { aviso(q.p, q.x, q.y, reloj); ultimoAviso = reloj; }
    }
    tira?.avanzar(km);
    activos = activos.filter((a) => {
      if (reloj < a.hasta) return true;
      a.nodo.classList.add('sale');
      setTimeout(() => a.nodo.remove(), 200);
      return false;
    });
    escribirLectura();
    if (reloj > SEGUNDOS + RESPIRO) reiniciar();
  }

  function escribirLectura() {
    const v = vistos.size;
    lectura.textContent = t('heroe_lectura', { km: fmt(km, 2), alt: fmt(altDe(km), 0), n: fmt(v, 0) });
  }

  function pintarLuz(lamparaX, lamparaY, lampara) {
    if (!relieve) return;
    const c = luz.getContext('2d');
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, luz.width, luz.height);
    c.drawImage(mascara, 0, 0, luz.width, luz.height);
    if (lampara) {
      const r = radio * 1.9 * dpr, x = lamparaX * dpr, y = lamparaY * dpr;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(.45, 'rgba(0,0,0,.7)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    c.globalCompositeOperation = 'source-in';
    c.drawImage(relieve, 0, 0, luz.width, luz.height);
  }

  function trazarRuta(c, hasta) {
    c.beginPath();
    let empezado = false;
    for (let i = 0; i < rutaPx.length; i++) {
      if (ruta[i].km > hasta) break;
      if (!empezado) { c.moveTo(rutaPx[i][0], rutaPx[i][1]); empezado = true; } else c.lineTo(rutaPx[i][0], rutaPx[i][1]);
    }
    return empezado;
  }

  function posicion(k) {
    let i = 1;
    while (i < ruta.length - 1 && ruta[i].km < k) i++;
    const a = ruta[i - 1], b = ruta[i], f = b.km > a.km ? Math.min(1, Math.max(0, (k - a.km) / (b.km - a.km))) : 0;
    return [rutaPx[i - 1][0] + (rutaPx[i][0] - rutaPx[i - 1][0]) * f, rutaPx[i - 1][1] + (rutaPx[i][1] - rutaPx[i - 1][1]) * f];
  }

  function pintarTinta(lampara) {
    const c = tinta.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    // Puntos por pasar: solo un rastro.
    c.fillStyle = 'rgba(242,234,216,.2)';
    for (let i = siguiente; i < puntosPx.length; i++) {
      c.beginPath(); c.arc(puntosPx[i].x, puntosPx[i].y, 1.3, 0, 7); c.fill();
    }
    // Especies encendidas: color de su grupo, anillo claro de 1,5 px.
    const rPunto = w < 900 ? 2.5 : 3.6;
    for (let i = 0; i < siguiente; i++) {
      const q = puntosPx[i];
      c.beginPath(); c.arc(q.x, q.y, rPunto, 0, 7);
      c.fillStyle = q.color; c.fill();
      c.lineWidth = 1.5; c.strokeStyle = COLOR.fg; c.stroke();
    }
    // Ruta andada, con casing oscuro.
    if (trazarRuta(c, km)) {
      const [px, py] = posicion(km);
      c.lineTo(px, py);
      c.lineJoin = 'round'; c.lineCap = 'round';
      c.strokeStyle = 'rgba(8,24,31,.85)'; c.lineWidth = 5; c.stroke();
      c.strokeStyle = COLOR.ruta; c.lineWidth = 2.4; c.stroke();
    }
    estallidos = estallidos.filter((e) => reloj - e.t < 1.2);
    for (const e of estallidos) {
      const f = (reloj - e.t) / 1.2;
      c.beginPath(); c.arc(e.x, e.y, 4 + f * 24, 0, 7);
      c.strokeStyle = e.color; c.globalAlpha = (1 - f) * .9; c.lineWidth = 1.5; c.stroke();
      c.globalAlpha = 1;
    }
    if (lampara) {
      const [x, y] = posicion(km);
      c.beginPath(); c.arc(x, y, 5, 0, 7);
      c.fillStyle = COLOR.fg; c.fill();
      c.lineWidth = 1.5; c.strokeStyle = COLOR.noche; c.stroke();
    }
  }

  function cuadroDeFrame() {
    const lampara = km < total;
    const [x, y] = rutaPx.length ? posicion(km) : [0, 0];
    pintarLuz(x, y, lampara);
    pintarTinta(lampara);
  }

  function bucle(ms) {
    raf = 0;
    if (!marcha) return;
    const dt = Math.min(0.1, (ms - ultimo) / 1000 || 0);
    ultimo = ms;
    avanzar(dt);
    cuadroDeFrame();
    raf = requestAnimationFrame(bucle);
  }

  function actualizarMarcha() {
    const debe = !enPausa && visible && !document.hidden && !reducido.matches;
    if (debe === marcha) return;
    marcha = debe;
    if (marcha) { ultimo = performance.now(); raf = requestAnimationFrame(bucle); } else if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }

  // Imagen fija: lámina acabada, sin caminante.
  function mostrarFija() {
    reiniciar();
    km = total; reloj = SEGUNDOS; siguiente = puntosPx.length; indiceSello = rutaPx.length;
    if (mctx) rutaPx.forEach(([x, y]) => { sello(x, y); sello(x, y); });
    puntosPx.forEach((q) => vistos.add(q.p.taxon));
    tira?.avanzar(total);
    escribirLectura();
    cuadroDeFrame();
  }

  async function montar() {
    const mio = ++version;
    const caja0 = seccion.getBoundingClientRect();
    w = Math.round(caja0.width); h = Math.round(caja0.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2, MAX_RES / Math.max(w, h));
    for (const c of [base, luz, tinta]) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }

    tira = dibujarTira(document.getElementById('heroe-cuadro'), datos, { w, h, km: reducido.matches ? total : 0 });
    const ancho = w >= 900;
    const texto = document.getElementById('heroe-texto').getBoundingClientRect();
    const seguro = ancho
      ? { x0: Math.max(texto.right + 40, w * .52), x1: w - 90, y0: 112, y1: Math.min(tira.techo - 8, 112 + h * .47) }
      : { x0: 28, x1: w - 28, y0: texto.bottom - caja0.top + 14, y1: tira.techo - 4 };
    const e = encuadrar(ruta, w, h, seguro);
    proy = e.proy;
    rutaPx = ruta.map((p) => proy(p.lat, p.lon));
    puntosPx = puntos.map((p) => {
      const [x, y] = proy(p.lat, p.lon);
      return { p, x, y, color: COLOR[especies.get(p.taxon).color] };
    }).sort((a, b) => a.p.km - b.p.km);
    radio = Math.max(34, Math.abs(rutaPx[0][1] - proy(ruta[0].lat + 0.0016, ruta[0].lon)[1]));

    mascara = document.createElement('canvas');
    mascara.width = Math.round(w * escalaM); mascara.height = Math.round(h * escalaM);
    mctx = mascara.getContext('2d');

    const continuar = km;
    reiniciar();
    if (reducido.matches) mostrarFija();
    else if (continuar > 0) { reloj = (continuar / total) * SEGUNDOS - 0.001; avanzarSinEfectos(); }
    cuadroDeFrame();
    seccion.dataset.estado = 'listo';

    // El relieve llega después: el titular no lo espera.
    await new Promise((r) => setTimeout(r, 30));
    try {
      const dem = await cargarDem(e.caja, w);
      if (mio !== version) return;
      const k = base.width / dem.ancho;
      const plancha = document.createElement('canvas');
      const { intervalo } = pintarRelieve(plancha, dem, { rampa: 'plancha', curvas: false, escala: k });
      grabarCurvas(plancha, dem, { rampa: 'noche', escala: k, unidad: dpr, intervalo, cota: false });
      const c = base.getContext('2d');
      c.drawImage(plancha, 0, 0, base.width, base.height);
      if (!ancho) { // en pantalla pequeña el grabado pesa más: se baja
        c.fillStyle = 'rgba(11,29,36,.42)';
        c.fillRect(0, 0, base.width, base.height);
      }
      // El grabado se apaga bajo el texto.
      const fin = ancho ? (texto.right + 90) * dpr : (texto.bottom - caja0.top + 30) * dpr;
      const velo = ancho ? c.createLinearGradient(0, 0, fin, 0) : c.createLinearGradient(0, 0, 0, fin);
      velo.addColorStop(0, 'rgba(11,29,36,.9)');
      velo.addColorStop(.72, 'rgba(11,29,36,.78)');
      velo.addColorStop(1, 'rgba(11,29,36,0)');
      c.fillStyle = velo;
      c.fillRect(0, 0, base.width, base.height);
      reticula(c, e.caja, w, h, proy, dpr);
      escala(c, e.caja, w, ancho ? 88 : seguro.y0 + 6, proy, dpr);
      seccion.dataset.estado = 'relieve';
      await new Promise((r) => setTimeout(r, 30));
      if (mio !== version) return;
      const lleno = document.createElement('canvas');
      pintarRelieve(lleno, dem, { rampa: 'noche', curvas: true, escala: k });
      relieve = lleno;
      cuadroDeFrame();
    } catch {
      relieve = null; // sin red: la ruta y las especies siguen sobre el fondo de noche
    }
  }

  // Tras un cambio de tamaño, recupera lo andado sin repetir efectos.
  function avanzarSinEfectos() {
    km = Math.min(total, (reloj / SEGUNDOS) * total);
    while (indiceSello < rutaPx.length && ruta[indiceSello].km <= km) { sello(rutaPx[indiceSello][0], rutaPx[indiceSello][1]); indiceSello++; }
    while (siguiente < puntosPx.length && puntosPx[siguiente].p.km <= km) vistos.add(puntosPx[siguiente++].p.taxon);
    tira?.avanzar(km);
  }

  pausa.addEventListener('click', () => {
    enPausa = !enPausa;
    pausa.setAttribute('aria-pressed', String(enPausa));
    pausa.dataset.t = enPausa ? 'heroe_seguir' : 'heroe_pausa';
    pausa.textContent = t(pausa.dataset.t);
    actualizarMarcha();
  });
  document.addEventListener('visibilitychange', actualizarMarcha);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; actualizarMarcha(); }, { threshold: 0.05 }).observe(seccion);
  reducido.addEventListener('change', () => { pausa.hidden = reducido.matches; if (reducido.matches) mostrarFija(); actualizarMarcha(); });
  pausa.hidden = reducido.matches;

  let tMedida = 0, ultimoW = 0, ultimoH = 0;
  new ResizeObserver(() => {
    clearTimeout(tMedida);
    tMedida = setTimeout(() => {
      const r = seccion.getBoundingClientRect();
      // La barra del móvil cambia la altura al hacer scroll: no se repinta por eso.
      if (Math.abs(r.width - ultimoW) < 2 && Math.abs(r.height - ultimoH) < 120) return;
      ultimoW = r.width; ultimoH = r.height;
      montar().then(actualizarMarcha);
    }, 220);
  }).observe(seccion);

  alCambiarIdioma(() => {
    tira?.rotular();
    activos.forEach((a) => a.nodo.remove()); activos = [];
    escribirLectura();
  });

  const r0 = seccion.getBoundingClientRect();
  ultimoW = r0.width; ultimoH = r0.height;
  return montar().then(actualizarMarcha);
}
