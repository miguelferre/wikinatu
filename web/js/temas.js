// Lee de css/temas.css los colores que se pintan en lienzo y en SVG.
// Solo se llama al pintar, nunca al importar: las pruebas de node no tienen DOM.

export const token = (nombre) => getComputedStyle(document.documentElement).getPropertyValue(`--${nombre}`).trim();

export const rampaDe = (nombre) => token(`rampa-${nombre}`).split(',').map((c) => c.trim());

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

const curvas = (p) => ({
  fina: token(`${p}-curva-fina`), maestra: token(`${p}-curva-maestra`),
  halo: token(`${p}-curva-halo`), cota: token(`${p}-curva-cota`),
});

// modo: 'noche' en pantalla, 'papel' en la guía.
export function pinturaLamina(modo) {
  const p = modo === 'papel' ? 'gui' : 'lam';
  const v = (k) => token(`${p}-${k}`);
  return {
    rampa: rampaDe(modo), claro: v('claro') === '1',
    fondo: v('fondo'), tinta: v('tinta'), suave: v('suave'), halo: v('halo'), casing: v('casing'),
    anillo: v('anillo'), blanco: v('blanco'), ruta: v('ruta'), vacio: v('vacio'),
    mar: { fondo: rgb(v('mar-fondo')), fondo2: rgb(v('mar-fondo2')), linea: rgb(v('mar-linea')) },
    curvas: curvas(p),
  };
}

export function pinturaCuadro(modo) {
  const p = modo === 'papel' ? 'cug' : 'cua';
  const v = (k) => token(`${p}-${k}`);
  return {
    rampa: rampaDe(modo), fondo: v('fondo'), tinta: v('tinta'), suave: v('suave'),
    cielo: v('cielo'), sombra: v('sombra'), anillo: v('anillo'),
  };
}

export function pinturaHeroe() {
  return {
    rampa: rampaDe('heroe'), fondo: rampaDe('heroe-fondo'), claro: token('heroe-claro') === '1',
    hilo: token('heroe-hilo'), base: token('heroe-base'), velo: token('heroe-velo'), casing: token('heroe-casing'),
    lavado: Number(token('heroe-lavado')), curvas: curvas('lam'),
  };
}
