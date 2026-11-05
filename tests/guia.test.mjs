import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANIMALES, POR_DEFECTO, compactarGrupos, coordenadasTexto, gruposDeAtajo, gruposPortada, opcionesIniciales, paginasGuia, seleccionGuia,
} from '../web/js/guia-filtro.js';
import { GRUPOS } from '../web/js/inat.js';

const fila = (id, grupo) => ({ id, grupo: { id: grupo } });
// De más a menos vistas, como S.filas.
const filas = [
  ...Array.from({ length: 70 }, (_, i) => fila(i, 'plantas')),
  ...Array.from({ length: 40 }, (_, i) => fila(100 + i, 'aves')),
  ...Array.from({ length: 10 }, (_, i) => fila(200 + i, 'insectos')),
  fila(300, 'hongos'),
];
const presentes = ['plantas', 'aves', 'insectos', 'hongos'];

test('sin filtro entran todas: 60 con foto y el resto en lista', () => {
  const s = seleccionGuia(filas, POR_DEFECTO);
  assert.equal(s.filas.length, 121);
  assert.equal(s.conFoto.length, 60);
  assert.equal(s.resto.length, 61);
  assert.equal(s.conFoto[0].id, 0);
});

test('el filtro de grupos manda sobre foto, lista y recuento', () => {
  const s = seleccionGuia(filas, { grupos: ['aves'], fotos: 30, resto: true });
  assert.equal(s.filas.length, 40);
  assert.ok([...s.conFoto, ...s.resto].every((f) => f.grupo.id === 'aves'));
  assert.equal(s.conFoto.length, 30);
  assert.equal(s.resto.length, 10);
});

test('todas con foto deja la lista vacía; sin lista, el resto no entra', () => {
  assert.equal(seleccionGuia(filas, { fotos: 'todas' }).resto.length, 0);
  assert.equal(seleccionGuia(filas, { fotos: 'todas' }).conFoto.length, 121);
  assert.equal(seleccionGuia(filas, { fotos: 30, resto: false }).resto.length, 0);
  assert.equal(seleccionGuia(filas, { fotos: 30, resto: false }).filas.length, 121);
});

test('un filtro sin especies da cero en todo', () => {
  for (const grupos of [[], ['peces']]) {
    const s = seleccionGuia(filas, { grupos });
    assert.deepEqual([s.filas.length, s.conFoto.length, s.resto.length], [0, 0, 0]);
    assert.equal(paginasGuia({ ...s, cuadro: true }), 0);
  }
});

test('los atajos eligen sobre los grupos de la ruta', () => {
  assert.equal(gruposDeAtajo('todo', presentes), null);
  assert.deepEqual(gruposDeAtajo('animales', presentes), ['aves', 'insectos']);
  assert.deepEqual(gruposDeAtajo('aves', presentes), ['aves']);
  assert.deepEqual(gruposDeAtajo('plantas', ['aves']), ['plantas']);
});

test('animales cubre todos los grupos de GRUPOS salvo plantas y hongos', () => {
  const fuera = GRUPOS.map((g) => g.id).filter((id) => !ANIMALES.includes(id));
  assert.deepEqual(fuera.sort(), ['hongos', 'plantas']);
});

test('elegir todos los grupos vuelve a ser «todos»', () => {
  assert.equal(compactarGrupos([...presentes].reverse(), presentes), null);
  assert.equal(compactarGrupos(null, presentes), null);
  assert.deepEqual(compactarGrupos(['hongos', 'aves'], presentes), ['aves', 'hongos']);
  assert.deepEqual(compactarGrupos([], presentes), []);
});

test('el diálogo abre con lo recordado, sin romperse con datos viejos', () => {
  const guardado = JSON.stringify({ grupos: ['aves'], fotos: 120, cuadro: false, resto: false });
  assert.deepEqual(opcionesIniciales(guardado, presentes), { grupos: ['aves'], fotos: 120, cuadro: false, resto: false });
  assert.deepEqual(opcionesIniciales(null, presentes), POR_DEFECTO);
  assert.deepEqual(opcionesIniciales('{roto', presentes), POR_DEFECTO);
  assert.equal(opcionesIniciales(JSON.stringify({ fotos: 7 }), presentes).fotos, 60);
  assert.equal(opcionesIniciales(JSON.stringify({ fotos: 'todas' }), presentes).fotos, 'todas');
});

test('lo recordado se ajusta a la ruta: un grupo que aquí no hay no deja la guía vacía', () => {
  assert.equal(opcionesIniciales(JSON.stringify({ grupos: ['peces'] }), presentes).grupos, null);
  assert.deepEqual(opcionesIniciales(JSON.stringify({ grupos: ['peces', 'aves'] }), presentes).grupos, ['aves']);
  assert.equal(opcionesIniciales(JSON.stringify({ grupos: [] }), presentes).grupos, null);
});

test('el filtro activo del visor manda sobre lo recordado', () => {
  const guardado = JSON.stringify({ grupos: ['plantas'], fotos: 30 });
  const o = opcionesIniciales(guardado, presentes, 'aves');
  assert.deepEqual(o.grupos, ['aves']);
  assert.equal(o.fotos, 30);
  assert.deepEqual(opcionesIniciales(guardado, presentes, 'peces').grupos, ['plantas']);
});

test('las páginas crecen con el contenido', () => {
  const base = paginasGuia({ ...seleccionGuia(filas, { fotos: 30 }), cuadro: false });
  const mas = paginasGuia({ ...seleccionGuia(filas, { fotos: 120 }), cuadro: false });
  const conCuadro = paginasGuia({ ...seleccionGuia(filas, { fotos: 30 }), cuadro: true });
  assert.ok(mas > base);
  assert.equal(conCuadro, base + 1);
});

test('la portada resume los grupos pequeños sin perder especies', () => {
  const recuento = Array.from({ length: 12 }, (_, i) => ({ id: `g${i}`, color: 'otros', n: 12 - i }));
  const l = gruposPortada(recuento);
  assert.equal(l.length, 9);
  assert.equal(l.at(-1).resto, true);
  assert.equal(l.reduce((s, g) => s + g.n, 0), recuento.reduce((s, g) => s + g.n, 0));
  assert.equal(gruposPortada(recuento.slice(0, 3)).length, 3);
});

test('las coordenadas llevan su hemisferio', () => {
  assert.equal(coordenadasTexto(25.1697, 121.5542), '25°10′11″ N, 121°33′15″ E');
  assert.equal(coordenadasTexto(-33.5, -70.25), '33°30′00″ S, 70°15′00″ O');
});
