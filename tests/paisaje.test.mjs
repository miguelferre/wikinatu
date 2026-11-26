import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aleatorio, kmeansCoseno, silueta, agrupar, unirTramosCortos, tramosDe, renumerar,
  nombrarClases, clasesDelPerfil, franjaPaisaje,
} from '../web/js/paisaje.js';

// Vectores de prueba: cuatro direcciones base de 8 dimensiones con algo de ruido fijo.
function datos(n = 120, grupos = 4, semilla = 7) {
  const azar = aleatorio(semilla);
  const out = [], verdad = [];
  for (let i = 0; i < n; i++) {
    const g = Math.floor((i * grupos) / n);
    const v = Array.from({ length: 8 }, (_, d) => (d === g ? 1 : 0) + (azar() - 0.5) * 0.3);
    const nrm = Math.hypot(...v);
    out.push(Float32Array.from(v.map((x) => x / nrm)));
    verdad.push(g);
  }
  return { vectores: out, verdad };
}

test('el generador con semilla repite la serie', () => {
  const a = aleatorio(42), b = aleatorio(42), c = aleatorio(43);
  const sa = [a(), a(), a()], sb = [b(), b(), b()];
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, [c(), c(), c()]);
});

test('k-means da el mismo resultado con la misma semilla', () => {
  const { vectores } = datos();
  const r1 = kmeansCoseno(vectores, 4, 11);
  const r2 = kmeansCoseno(vectores, 4, 11);
  assert.deepEqual(r1.asignacion, r2.asignacion);
  assert.deepEqual(agrupar(vectores), agrupar(vectores));
});

test('k-means de coseno separa grupos claros y la silueta elige su número', () => {
  const { vectores, verdad } = datos(120, 5);
  const g = agrupar(vectores, { kMin: 4, kMax: 6 });
  assert.equal(g.k, 5);
  // Misma partición que la verdad, salvo el nombre de cada clase.
  const mapa = new Map();
  g.asignacion.forEach((c, i) => {
    if (!mapa.has(c)) mapa.set(c, verdad[i]);
    assert.equal(mapa.get(c), verdad[i]);
  });
  assert.ok(silueta(vectores, g.asignacion, g.k) > 0.5);
});

test('sin vectores distintos suficientes no hay agrupación', () => {
  const v = Float32Array.from([1, 0, 0]);
  assert.equal(kmeansCoseno(Array(20).fill(v), 4, 1), null);
  assert.equal(clasesDelPerfil(Array(20).fill(v)), null);
  assert.equal(clasesDelPerfil([null, null]), null);
});

test('los tramos de menos de 3 muestras pasan al vecino más largo', () => {
  assert.deepEqual(unirTramosCortos([0, 0, 0, 1, 0, 0, 0]), [0, 0, 0, 0, 0, 0, 0]);
  // El tramo corto de 2 va al vecino más largo (el 2, de 4 muestras).
  assert.deepEqual(unirTramosCortos([0, 0, 0, 1, 1, 2, 2, 2, 2]), [0, 0, 0, 2, 2, 2, 2, 2, 2]);
  // Al principio solo hay un vecino.
  assert.deepEqual(unirTramosCortos([1, 0, 0, 0]), [0, 0, 0, 0]);
  // Varios cortos seguidos acaban en tramos de al menos 3.
  const r = unirTramosCortos([0, 0, 0, 1, 2, 1, 2, 3, 3, 3]);
  assert.ok(tramosDe(r).every((t) => t.fin - t.inicio >= 3), JSON.stringify(r));
  // Un hueco sin dato se queda como está.
  assert.deepEqual(unirTramosCortos([0, 0, 0, null, 1, 1, 1]), [0, 0, 0, null, 1, 1, 1]);
  assert.deepEqual(unirTramosCortos([0, 0, 0, null, 1, null, 2, 2, 2]), [0, 0, 0, null, 1, null, 2, 2, 2]);
});

test('las clases se numeran por orden de aparición', () => {
  assert.deepEqual(renumerar([3, 3, 1, null, 3, 0]), [0, 0, 1, null, 0, 2]);
});

// Perfil recto de 10 muestras hacia el este.
const perfil = Array.from({ length: 10 }, (_, i) => ({ km: i * 0.1, alt: 2000, lat: 42.6, lon: 1.4 + i * 0.001 }));

test('cada clase toma el nombre de la planta más observada en ella', () => {
  const clases = [0, 0, 0, 0, 0, 1, 1, 1, 1, 1];
  const obs = [
    { lat: 42.6001, lon: 1.4005, taxon: 10, color: 'plantas' },
    { lat: 42.6, lon: 1.4011, taxon: 11, color: 'plantas' },
    { lat: 42.6, lon: 1.4021, taxon: 11, color: 'plantas' },
    { lat: 42.6, lon: 1.4022, taxon: 99, color: 'aves' }, // un ave no cuenta
    { lat: 42.6, lon: 1.4023, taxon: 99, color: 'aves' },
    { lat: 42.6, lon: 1.4071, taxon: 12, color: 'plantas' }, // muestra 7: clase 1
  ];
  const r = nombrarClases(clases, perfil, obs, 2, { criterio: 'mas_vista' });
  assert.deepEqual(r.map((x) => [x.taxon, x.n]), [[11, 2], [12, 1]]);
});

test('una clase sin plantas se queda sin nombre', () => {
  const clases = [0, 0, 0, 0, 0, 1, 1, 1, 1, 1];
  const obs = [{ lat: 42.6, lon: 1.401, taxon: 10, color: 'plantas' }, { lat: 42.6, lon: 1.408, taxon: 5, color: 'insectos' }];
  const nombres = nombrarClases(clases, perfil, obs, 2);
  assert.equal(nombres[0].taxon, 10);
  assert.equal(nombres[1], null);
  const franja = franjaPaisaje(perfil, { clases, n: 2 }, obs, (id) => ({ nombre: `Planta ${id}`, cientifico: `P. ${id}` }));
  assert.deepEqual(franja.leyenda.map((l) => l.nombre), ['Planta 10', null]);
  assert.deepEqual(franja.tramos.map((t) => [t.clase, t.km0, t.km1].map((x) => Math.round(x * 100) / 100)), [[0, 0, 0.45], [1, 0.45, 0.9]]);
});

test('clasesDelPerfil devuelve clases alineadas con el perfil, sin tramos cortos', () => {
  const { vectores } = datos(120, 4);
  const conHueco = vectores.map((v, i) => (i >= 50 && i < 54 ? null : v));
  const r = clasesDelPerfil(conHueco);
  assert.equal(r.clases.length, 120);
  assert.equal(r.clases[0], 0);
  assert.ok([50, 51, 52, 53].every((i) => r.clases[i] === null));
  assert.ok(tramosDe(r.clases).filter((t) => t.clase != null).every((t) => t.fin - t.inicio >= 3));
  assert.deepEqual(clasesDelPerfil(conHueco), r);
});

test('la planta más característica: la que concentra sus observaciones en la clase', () => {
  const clases = [0, 0, 0, 0, 0, 1, 1, 1, 1, 1];
  const en = (i, taxon) => ({ lat: 42.6, lon: 1.4 + i * 0.001, taxon, color: 'plantas' });
  // El 1 es el más visto en las dos clases. El 2 vive solo en la clase 1, con 3 observaciones.
  const obs = [
    ...[0, 1, 2, 3, 4, 0].map((i) => en(i, 1)), // 6 en la clase 0
    ...[5, 6, 7, 8].map((i) => en(i, 1)), // 4 en la clase 1
    ...[5, 6, 7].map((i) => en(i, 2)), // 3 en la clase 1
    en(1, 3), en(2, 3), // 2 en la clase 0: no llega al mínimo de 3
  ];
  const mas = nombrarClases(clases, perfil, obs, 2, { criterio: 'mas_vista' });
  assert.deepEqual(mas.map((x) => x.taxon), [1, 1]);
  const car = nombrarClases(clases, perfil, obs, 2);
  assert.deepEqual(car.map((x) => x.taxon), [1, 2]);
  assert.equal(car[1].cuota, 1);
  // Sin ninguna planta con 3 observaciones, se vuelve a la más vista.
  const pocas = nombrarClases(clases, perfil, [en(0, 7), en(1, 7), en(2, 8)], 2);
  assert.equal(pocas[0].taxon, 7);
});

test('la más característica no premia a una planta rara solo por estar concentrada', () => {
  const clases = [0, 0, 0, 0, 0, 1, 1, 1, 1, 1];
  const en = (i, taxon, veces) => Array.from({ length: veces }, () => ({ lat: 42.6, lon: 1.4 + i * 0.001, taxon, color: 'plantas' }));
  // A: 16 en la clase 0 y 15 en la 1 (peso 16·16/31 = 8,3). B: 7 de 8 en la clase 0 (peso 6,1).
  const obs = [...en(0, 'A', 16), ...en(6, 'A', 15), ...en(1, 'B', 7), ...en(7, 'B', 1)];
  assert.equal(nombrarClases(clases, perfil, obs, 2)[0].taxon, 'A');
});
