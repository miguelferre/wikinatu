import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ventanaMeses, textoVentana, enTaiwan, centroDe, localeLocal, soloEspecies, nombreVisible, mediana,
  perfilDe, altitudEn, resumenPerfil, elegirEtiquetas, repartir, pasoKm, pasoAltura, filtrarInventario, recuentoGrupos,
} from '../web/js/analisis.js';
import { formatoGrados, longitudEscala, pasoGrados } from '../web/js/lamina-marco.js';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

test('la ventana de meses da la vuelta al año', () => {
  assert.deepEqual(ventanaMeses(11), [10, 11, 12]);
  assert.deepEqual(ventanaMeses(12), [11, 12, 1]);
  assert.deepEqual(ventanaMeses(1), [12, 1, 2]);
});

test('el texto de la ventana nombra los extremos', () => {
  assert.equal(textoVentana([10, 11, 12], MESES), 'octubre a diciembre');
  assert.equal(textoVentana([12, 1, 2], MESES), 'diciembre a febrero');
  assert.equal(textoVentana(null, MESES), 'todo el año');
});

test('Taiwán activa zh-TW solo en automático', () => {
  assert.equal(enTaiwan(23.51, 120.8), true);
  assert.equal(enTaiwan(42.9, -9.1), false);
  assert.equal(localeLocal('auto', { lat: 23.51, lon: 120.8 }), 'zh-TW');
  assert.equal(localeLocal('auto', { lat: 42.9, lon: -9.1 }), null);
  assert.equal(localeLocal('ninguno', { lat: 23.51, lon: 120.8 }), null);
  assert.equal(localeLocal('ja', { lat: 42.9, lon: -9.1 }), 'ja');
});

test('el centro es la media de los puntos', () => {
  assert.deepEqual(centroDe([{ lat: 1, lon: 2 }, { lat: 3, lon: 4 }]), { lat: 2, lon: 3 });
});

test('quita géneros y familias y conserva especies y subespecies', () => {
  const e = [10, 5, 20, 30].map((rank_level) => ({ taxon: { rank_level } }));
  assert.deepEqual(soloEspecies(e).map((x) => x.taxon.rank_level), [10, 5]);
});

test('el nombre visible cae a inglés y a científico', () => {
  assert.equal(nombreVisible({ nombre: 'Garza', nombreEn: 'Heron', cientifico: 'Ardea' }), 'Garza');
  assert.equal(nombreVisible({ nombre: null, nombreEn: 'Heron', cientifico: 'Ardea' }), 'Heron');
  assert.equal(nombreVisible({ nombre: null, nombreEn: null, cientifico: 'Ardea' }), 'Ardea');
});

test('la mediana sirve con pares e impares', () => {
  assert.equal(mediana([3, 1, 2]), 2);
  assert.equal(mediana([4, 1, 2, 3]), 2.5);
  assert.equal(mediana([]), null);
});

test('el perfil rellena huecos del modelo y llega al final', () => {
  const puntos = [{ lat: 0, lon: 0 }, { lat: 0, lon: 0.01 }, { lat: 0, lon: 0.02 }];
  const altura = (lat, lon) => (lon < 0.005 ? null : lon * 10000);
  const p = perfilDe(puntos, altura, 20);
  assert.ok(p.every((q) => q.alt != null));
  assert.ok(Math.abs(p[p.length - 1].km - 2.224) < 0.01);
  assert.equal(p[0].alt, p.find((q) => q.alt != null).alt);
});

test('altitudEn interpola entre muestras', () => {
  const p = [{ km: 0, alt: 100 }, { km: 1, alt: 200 }, { km: 2, alt: 100 }];
  assert.equal(altitudEn(p, 0.5), 150);
  assert.equal(altitudEn(p, 1.5), 150);
});

test('el resumen no inventa cifras sin modelo', () => {
  assert.deepEqual(resumenPerfil([{ km: 0, alt: null }, { km: 3, alt: null }]), { km: 3, sube: null, min: null, max: null });
  const r = resumenPerfil([{ km: 0, alt: 10 }, { km: 1, alt: 110 }, { km: 2, alt: 60 }]);
  assert.deepEqual(r, { km: 2, sube: 100, min: 10, max: 110 });
});

test('las etiquetas siguen el orden de observaciones y salta especies sin puntos', () => {
  const filas = [
    { id: 1, cientifico: 'A a', nombre: 'Uno', grupo: { color: 'aves' }, observaciones: 9 },
    { id: 2, cientifico: 'B b', nombre: null, grupo: { color: 'plantas' }, observaciones: 8 },
    { id: 3, cientifico: 'C c', nombre: 'Tres', grupo: { color: 'hongos' }, observaciones: 7 },
  ];
  const obs = [{ taxon: 1, lat: 1, lon: 0 }, { taxon: 1, lat: 3, lon: 0 }, { taxon: 3, lat: 2, lon: 0 }];
  const perfil = [{ km: 0, alt: 0 }, { km: 4, alt: 400 }];
  const e = elegirEtiquetas(filas, obs, perfil, (lat) => ({ km: lat }), 2);
  assert.deepEqual(e.map((x) => x.taxon), [1, 3]);
  assert.equal(e[0].km, 2);
  assert.equal(e[0].alt, 200);
  assert.equal(e[1].color, 'hongos');
});

test('repartir no deja choques y respeta los topes', () => {
  const x = repartir([50, 50, 50, 51, 200], 10, 0, 300);
  for (let i = 1; i < x.length; i++) assert.ok(x[i] - x[i - 1] >= 10 - 1e-9);
  assert.ok(Math.abs(x[4] - 200) < 1e-9);
  const y = repartir([90, 95, 99], 10, 0, [100, 100, 100]);
  assert.ok(y[2] <= 100 + 1e-9 && y[1] <= y[2] - 10 + 1e-9);
  assert.deepEqual(repartir([], 10, 0, 100), []);
});

test('los pasos de ejes salen redondos', () => {
  assert.equal(pasoKm(9), 1);
  assert.equal(pasoKm(40), 5);
  assert.equal(pasoAltura(600), 100);
  assert.equal(longitudEscala(780), 500);
  assert.equal(longitudEscala(2400), 2000);
});

test('los grados del marco se escriben en grados y minutos', () => {
  assert.equal(formatoGrados(-9.1333333, 1 / 60, 'E', 'O'), '9°08′ O');
  assert.equal(formatoGrados(23.5125, 15 / 3600, 'N', 'S'), '23°30′45″ N');
  assert.ok(Math.abs(pasoGrados(0.05, 5) - 1 / 60) < 1e-9);
});

test('el buscador ignora acentos y mira todos los nombres', () => {
  const filas = [
    { nombre: 'Garceta común', cientifico: 'Egretta garzetta', grupo: { id: 'aves', color: 'aves' } },
    { nombre: null, nombreLocal: '臺灣獼猴', cientifico: 'Macaca cyclopis', grupo: { id: 'mamiferos', color: 'mamiferos' } },
  ];
  assert.equal(filtrarInventario(filas, { texto: 'comun' }).length, 1);
  assert.equal(filtrarInventario(filas, { texto: '獼猴' }).length, 1);
  assert.equal(filtrarInventario(filas, { grupo: 'aves' }).length, 1);
  assert.deepEqual(recuentoGrupos(filas).map((g) => g.n), [1, 1]);
});

test('el perfil prefiere la altitud del GPX a la del modelo', () => {
  const puntos = Array.from({ length: 12 }, (_, i) => ({ lat: 42 + i * 0.001, lon: 1, ele: 2000 }));
  const perfil = perfilDe(puntos, () => 2500); // el modelo mide la montaña sobre el túnel
  assert.ok(perfil.every((p) => p.alt === 2000));
});

test('sin altitud en el GPX, el perfil usa el modelo', () => {
  const puntos = Array.from({ length: 12 }, (_, i) => ({ lat: 42 + i * 0.001, lon: 1, ele: null }));
  assert.ok(perfilDe(puntos, () => 2500).every((p) => p.alt === 2500));
});
