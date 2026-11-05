import test from 'node:test';
import assert from 'node:assert/strict';
import { leerGpx, acumulado, simplificar, crearProyector, desnivel, distanciaKm } from '../web/js/geo.js';
import { tramosDeRuta, haySolape } from '../web/js/cells.js';
import { GRUPOS, grupoDe, fotoDe, parametros } from '../web/js/inat.js';
import { alturaDe, lonAX, latAY, cajaLamina } from '../web/js/terrain.js';

const GPX = `<?xml version="1.0"?><gpx><metadata><name><![CDATA[Metadatos]]></name></metadata>
<trk><name><![CDATA[Ruta de prueba]]></name><trkseg>
<trkpt lat="42.6000" lon="1.4000"><ele>2000</ele></trkpt>
<trkpt lon="1.4100" lat="42.6000"><ele>2010</ele></trkpt>
<trkpt lat="42.6100" lon="1.4100"><ele>2050</ele></trkpt>
</trkseg></trk></gpx>`;

test('lee nombre, puntos y altitud, con atributos en cualquier orden', () => {
  const r = leerGpx(GPX);
  assert.equal(r.nombre, 'Ruta de prueba');
  assert.equal(r.puntos.length, 3);
  assert.deepEqual(r.puntos[1], { lat: 42.6, lon: 1.41, ele: 2010 });
});

test('un GPX sin pista usa rutas o puntos de paso', () => {
  const r = leerGpx('<gpx><wpt lat="1" lon="2"/><wpt lat="3" lon="4"></wpt></gpx>', 'mi-ruta.gpx');
  assert.equal(r.puntos.length, 2);
  assert.equal(r.nombre, 'mi-ruta');
});

test('un GPX sin puntos da un error claro', () => {
  assert.throws(() => leerGpx('<gpx></gpx>'), /gpx_vacio/);
});

test('la distancia acumulada coincide con la suma de tramos', () => {
  const { puntos } = leerGpx(GPX);
  const km = acumulado(puntos);
  assert.ok(Math.abs(km[2] - (distanciaKm(puntos[0], puntos[1]) + distanciaKm(puntos[1], puntos[2]))) < 1e-9);
  assert.ok(km[2] > 1.9 && km[2] < 2.1);
});

test('simplificar conserva los extremos', () => {
  const { puntos } = leerGpx(GPX);
  const s = simplificar(puntos, 50);
  assert.deepEqual(s[0], puntos[0]);
  assert.deepEqual(s[s.length - 1], puntos[2]);
});

test('el desnivel ignora el ruido por debajo del umbral', () => {
  assert.equal(desnivel([100, 102, 100, 103, 110, 108, 120]), 20);
});

test('el proyector sitúa una observación en el km correcto', () => {
  const { puntos } = leerGpx(GPX);
  const p = crearProyector(puntos)(42.6101, 1.4101);
  assert.ok(p.km > 1.9);
  assert.ok(p.distanciaKm < 0.05);
});

test('los tramos no se solapan y cubren la ruta', () => {
  const { puntos } = leerGpx(GPX);
  const { tramos, contiene } = tramosDeRuta(puntos);
  assert.equal(haySolape(tramos), false);
  for (const p of puntos) assert.ok(contiene(p.lat, p.lon));
  assert.ok(!contiene(43, 2));
});

test('un GPX con puntos muy separados no deja huecos', () => {
  const puntos = [{ lat: 42.6, lon: 1.4 }, { lat: 42.7, lon: 1.5 }];
  const { contiene } = tramosDeRuta(puntos);
  assert.ok(contiene(42.65, 1.45));
});

test('una ruta muy larga no pasa de 60 tramos', () => {
  const puntos = Array.from({ length: 400 }, (_, i) => ({ lat: 40 + i * 0.01, lon: -3 + i * 0.01 }));
  const { tramos } = tramosDeRuta(puntos);
  assert.ok(tramos.length <= 60);
  assert.equal(haySolape(tramos), false);
});

test('los grupos llevan los identificadores comprobados', () => {
  const por = Object.fromEntries(GRUPOS.map((g) => [g.id, g.taxon]));
  assert.deepEqual(
    [por.aves, por.mamiferos, por.artropodos, por.anelidos, por.cnidarios, por.equinodermos, por.poriferos],
    [3, 40151, 47120, 47491, 47534, 47549, 48824],
  );
  assert.equal(new Set(GRUPOS.map((g) => g.taxon)).size, GRUPOS.length);
});

test('un insecto cae en insectos antes que en artrópodos', () => {
  assert.equal(grupoDe({ ancestor_ids: [1, 47120, 47158] }).id, 'insectos');
  assert.equal(grupoDe({ ancestor_ids: [1, 99] }).id, 'otros');
});

test('una foto sin licencia abierta no se enseña', () => {
  assert.equal(fotoDe({ default_photo: { license_code: null, medium_url: 'x' } }), null);
  const f = fotoDe({ default_photo: { license_code: 'cc-by-nc', medium_url: 'https://a/1/medium.jpg', attribution: 'A' } });
  assert.equal(f.licencia, 'CC-BY-NC');
  assert.equal(f.pequena, 'https://a/1/small.jpg');
});

test('los parámetros reflejan calidad y meses', () => {
  assert.deepEqual(parametros({ meses: [10, 11, 12], calidad: 'investigacion' }), { quality_grade: 'research', month: '10,11,12' });
  assert.deepEqual(parametros({ meses: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], calidad: 'verificable' }), { verifiable: 'true' });
});

test('el decodificado Terrarium da metros', () => {
  assert.equal(alturaDe(128, 0, 0), 0);
  assert.equal(alturaDe(136, 100, 0), 2148);
});

test('la proyección de teselas ubica el origen', () => {
  assert.equal(lonAX(0, 1), 1);
  assert.ok(Math.abs(latAY(0, 1) - 1) < 1e-9);
});

test('la caja de la lámina respeta el formato pedido', () => {
  const c = cajaLamina({ swlat: 42.6, nelat: 42.65, swlng: 1.45, nelng: 1.5 }, 2);
  const ancho = lonAX(c.nelng, 12) - lonAX(c.swlng, 12);
  const alto = latAY(c.swlat, 12) - latAY(c.nelat, 12);
  assert.ok(Math.abs(ancho / alto - 2) < 1e-6);
});
