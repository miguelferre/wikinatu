// Lee de css/base.css los colores que se pintan en lienzo y en SVG.
// Solo se llama al pintar, nunca al importar: las pruebas de node no tienen DOM.

export const token = (nombre) => getComputedStyle(document.documentElement).getPropertyValue(`--${nombre}`).trim();

const lista = (nombre) => token(nombre).split(',').map((c) => c.trim());

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

const curvas = (p) => ({
  fina: token(`${p}-curva-fina`), maestra: token(`${p}-curva-maestra`),
  halo: token(`${p}-curva-halo`), cota: token(`${p}-curva-cota`),
});

// papel: true en la guía. Solo cambia el margen de la plancha: dentro todo es igual.
export function pinturaLamina({ papel = false } = {}) {
  const v = (k) => token(`lam-${k}`);
  const m = papel ? 'gui' : 'lam';
  return {
    rampa: lista('rampa'), claro: v('claro') === '1',
    fondo: token(`${m}-fondo`), marco: token(`${m}-marco`), marcoSuave: token(`${m}-marco-suave`),
    tinta: v('tinta'), suave: v('suave'), halo: v('halo'), casing: v('casing'),
    anillo: v('anillo'), blanco: v('blanco'), ruta: v('ruta'), vacio: v('vacio'),
    mar: { fondo: rgb(token('lam-mar-fondo')), fondo2: rgb(token('lam-mar-fondo2')), linea: rgb(token('lam-mar-linea')) },
    curvas: curvas('lam'),
  };
}

export function pinturaCuadro() {
  const v = (k) => token(`cua-${k}`);
  return { bandas: lista('cua-bandas'), tinta: v('tinta'), suave: v('suave'), anillo: v('anillo'), curva: v('curva') };
}

export function pinturaHeroe() {
  return {
    rampa: lista('rampa'), fondo: lista('heroe-fondo'), claro: token('lam-claro') === '1',
    hilo: token('heroe-hilo'), base: token('heroe-base'), velo: token('heroe-velo'), casing: token('heroe-casing'),
    curvas: curvas('heroe'), curvasRelieve: curvas('lam'),
  };
}
