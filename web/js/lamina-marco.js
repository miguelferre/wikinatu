// Marco de la plancha: filetes, banda graduada, grados, retícula, escala y norte.
// Todo en lienzo para que la imagen de la guía lleve la misma tipografía.

const PASOS = [
  1 / 3600, 2 / 3600, 5 / 3600, 10 / 3600, 15 / 3600, 30 / 3600,
  1 / 60, 2 / 60, 5 / 60, 10 / 60, 15 / 60, 30 / 60, 1, 2, 5, 10,
];

export function pasoGrados(extension, marcas = 5) {
  return PASOS.find((p) => extension / p <= marcas) || 20;
}

export function formatoGrados(v, paso, positivo, negativo) {
  const a = Math.abs(v);
  let g = Math.floor(a + 1e-9);
  let m = Math.floor((a - g) * 60 + 1e-7);
  let s = Math.round(((a - g) * 60 - m) * 60);
  if (s === 60) { s = 0; m += 1; }
  if (m === 60) { m = 0; g += 1; }
  const letra = v >= 0 ? positivo : negativo;
  if (paso >= 1) return `${g}° ${letra}`;
  if (paso >= 1 / 60) return `${g}°${String(m).padStart(2, '0')}′ ${letra}`;
  return `${g}°${String(m).padStart(2, '0')}′${String(s).padStart(2, '0')}″ ${letra}`;
}

export function longitudEscala(metros) {
  const base = 10 ** Math.floor(Math.log10(metros));
  for (const f of [5, 2, 1]) if (f * base <= metros) return f * base;
  return base;
}

function halo(ctx, tema, texto, x, y, ancho) {
  ctx.lineJoin = 'round';
  ctx.lineWidth = ancho;
  ctx.strokeStyle = tema.halo;
  ctx.strokeText(texto, x, y);
  ctx.fillStyle = tema.tinta;
  ctx.fillText(texto, x, y);
}

function norte(ctx, x, y, h, tema) {
  // Aguja fina de medio relleno, como en las cartas de marear.
  const w = h * 0.2;
  ctx.save();
  ctx.lineJoin = 'miter';
  ctx.beginPath();
  ctx.moveTo(x, y - h / 2); ctx.lineTo(x + w, y + h / 2); ctx.lineTo(x, y + h * 0.3); ctx.lineTo(x - w, y + h / 2);
  ctx.closePath();
  ctx.lineWidth = 2.6; ctx.strokeStyle = tema.halo; ctx.stroke();
  ctx.fillStyle = tema.halo; ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x, y - h / 2); ctx.lineTo(x + w, y + h / 2); ctx.lineTo(x, y + h * 0.3);
  ctx.closePath();
  ctx.fillStyle = tema.tinta; ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x, y - h / 2); ctx.lineTo(x + w, y + h / 2); ctx.lineTo(x, y + h * 0.3); ctx.lineTo(x - w, y + h / 2);
  ctx.closePath();
  ctx.lineWidth = 0.9; ctx.strokeStyle = tema.tinta; ctx.stroke();
  ctx.font = `600 ${h * 0.46}px Barlow, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  halo(ctx, tema, 'N', x, y - h / 2 - h * 0.1, 3);
  ctx.restore();
}

function escalaGrafica(ctx, geo, dem, tema, esquina) {
  const { M, iw, ih, W } = geo;
  const metrosPlancha = dem.metrosPx * (dem.ancho / iw); // metros por px CSS
  const pequena = W < 520;
  const maxPx = iw * (pequena ? 0.34 : 0.2);
  const largo = longitudEscala(metrosPlancha * maxPx);
  const px = largo / metrosPlancha;
  const partes = String(largo)[0] === '5' ? 5 : String(largo)[0] === '2' ? 4 : 5;
  const margen = pequena ? 12 : 20;
  const alto = pequena ? 4 : 5;
  const y = M + ih - margen - 8;
  const izquierda = esquina === 'sw';
  const x0 = izquierda ? M + margen + 8 : M + iw - margen - px - 10;
  ctx.save();
  // Base oscura: la barra se lee sobre cualquier ladera.
  ctx.fillStyle = tema.halo;
  const anchoCaja = px + 58;
  const xCaja = izquierda ? x0 - 8 : x0 - 42;
  ctx.fillRect(xCaja, y - 32, anchoCaja, 44);
  ctx.lineWidth = 0.7;
  ctx.strokeStyle = tema.suave;
  ctx.strokeRect(xCaja, y - 32, anchoCaja, 44);
  for (let i = 0; i < partes; i++) {
    const a = x0 + (px / partes) * i;
    ctx.fillStyle = i % 2 ? tema.blanco : tema.tinta;
    ctx.fillRect(a, y, px / partes, alto);
  }
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = tema.tinta;
  ctx.strokeRect(x0, y, px, alto);
  ctx.font = `600 ${pequena ? 11 : 12.5}px Barlow, sans-serif`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = tema.tinta;
  ctx.textAlign = 'left';
  ctx.fillText('0', x0, y - 5);
  ctx.textAlign = 'right';
  const texto = largo >= 1000 ? `${largo / 1000} km` : `${largo} m`;
  ctx.fillText(texto, x0 + px + 4, y - 5);
  ctx.restore();
  // Norte junto a la barra.
  const nx = izquierda ? x0 + px + 28 : x0 - 22;
  norte(ctx, nx, y - 5, pequena ? 20 : 24, tema);
}

export function dibujarMarco(ctx, _u, { geo, dem, caja, tema, esquinaEscala }) {
  const { W, H, M, iw, ih } = geo;
  const pequena = W < 520;
  const banda = pequena ? 3.5 : 5;
  ctx.save();

  const aX = (lon) => M + dem.aPixel(caja.nelat, lon)[0] * (iw / dem.ancho);
  const aY = (lat) => M + dem.aPixel(lat, caja.swlng)[1] * (ih / dem.alto);
  const marcas = pequena ? 3 : 6;
  const pLon = pasoGrados(caja.nelng - caja.swlng, marcas);
  const pLat = pasoGrados(caja.nelat - caja.swlat, Math.max(3, Math.round(marcas * (ih / iw) + 0.6)));
  const lons = [], lats = [];
  for (let v = Math.ceil(caja.swlng / pLon) * pLon; v < caja.nelng; v += pLon) lons.push(v);
  for (let v = Math.ceil(caja.swlat / pLat) * pLat; v < caja.nelat; v += pLat) lats.push(v);

  // Retícula: hilo muy fino con cruces en las intersecciones.
  ctx.lineWidth = 0.55;
  ctx.strokeStyle = tema.tinta;
  ctx.globalAlpha = 0.2;
  ctx.beginPath();
  for (const v of lons) { const x = aX(v); ctx.moveTo(x, M); ctx.lineTo(x, M + ih); }
  for (const v of lats) { const y = aY(v); ctx.moveTo(M, y); ctx.lineTo(M + iw, y); }
  ctx.stroke();
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  for (const a of lons) {
    for (const b of lats) {
      const x = aX(a), y = aY(b);
      ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y); ctx.moveTo(x, y - 5); ctx.lineTo(x, y + 5);
    }
  }
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Banda graduada: tramos alternos, con la mitad del paso de la retícula.
  const fino = (p) => p / 4;
  const tramos = (ini, fin, paso, aPos) => {
    const out = [];
    const v0 = Math.floor(ini / paso) * paso;
    let n = Math.round(v0 / paso);
    for (let v = v0; v < fin; v += paso, n++) out.push([aPos(v), aPos(v + paso), n & 1]);
    return out;
  };
  ctx.fillStyle = tema.marco;
  for (const [a, b, par] of tramos(caja.swlng, caja.nelng, fino(pLon), aX)) {
    if (!par) continue;
    const x = Math.max(M, a), w = Math.min(M + iw, b) - x;
    if (w <= 0) continue;
    ctx.fillRect(x, M - banda, w, banda);
    ctx.fillRect(x, M + ih, w, banda);
  }
  for (const [a, b, par] of tramos(caja.swlat, caja.nelat, fino(pLat), aY)) {
    if (!par) continue;
    const y = Math.max(M, Math.min(a, b)), h = Math.min(M + ih, Math.max(a, b)) - y;
    if (h <= 0) continue;
    ctx.fillRect(M - banda, y, banda, h);
    ctx.fillRect(M + iw, y, banda, h);
  }

  // Filetes: interior, exterior de banda y doble filete de borde.
  ctx.strokeStyle = tema.marco;
  ctx.lineWidth = 0.8;
  ctx.strokeRect(M + 0.4, M + 0.4, iw - 0.8, ih - 0.8);
  ctx.strokeRect(M - banda, M - banda, iw + 2 * banda, ih + 2 * banda);

  // Grados en el margen, en el espacio entre filetes.
  const cuerpo = pequena ? 9.5 : 12.5;
  ctx.font = `500 ${cuerpo}px Barlow, sans-serif`;
  ctx.fillStyle = tema.marcoSuave;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  const en = document.documentElement.lang === 'en';
  const yArriba = (5 + M - banda) / 2, yAbajo = H - yArriba;
  lons.forEach((v) => {
    const s = formatoGrados(v, pLon, 'E', en ? 'W' : 'O');
    const medio = ctx.measureText(s).width / 2;
    if (aX(v) - medio < M + 2 || aX(v) + medio > M + iw - 2) return;
    ctx.fillText(s, aX(v), yArriba);
    ctx.fillText(s, aX(v), yAbajo);
  });
  lats.forEach((v) => {
    const s = formatoGrados(v, pLat, 'N', 'S');
    // Junto a una esquina el rótulo chocaría con el de la banda vecina.
    const medio = ctx.measureText(s).width / 2;
    if (aY(v) - medio < M + 2 || aY(v) + medio > M + ih - 2) return;
    for (const [x, giro] of [[yArriba, -Math.PI / 2], [W - yArriba, Math.PI / 2]]) {
      ctx.save();
      ctx.translate(x, aY(v));
      ctx.rotate(giro);
      ctx.fillText(s, 0, 0);
      ctx.restore();
    }
  });
  ctx.restore();

  if (!dem.sinDatos || dem.metrosPx) escalaGrafica(ctx, geo, dem, tema, esquinaEscala);
}
