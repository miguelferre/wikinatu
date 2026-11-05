import test from 'node:test';
import assert from 'node:assert/strict';
import { filaDe, fotoDe, fotoDeTaxon } from '../web/js/inat.js';
import { autorDe, fotoWiki, imagenUtil, licenciaLibre, tituloDe } from '../web/js/visor-wiki.js';
import { aplicarConocidas, completarFotos } from '../web/js/visor-fotos.js';

const abierta = (id, autor = 'Ana') => ({ license_code: 'cc-by', medium_url: `https://i/${id}/medium.jpg`, attribution: `(c) ${autor}, some rights reserved (CC BY)` });
const cerrada = (id) => ({ license_code: null, medium_url: `https://i/${id}/medium.jpg`, attribution: '(c) Ana, all rights reserved' });
const meta = (o) => Object.fromEntries(Object.entries(o).map(([k, value]) => [k, { value }]));

test('la cadena de iNaturalist prefiere default_photo y sigue con taxon_photos', () => {
  const taxon = { default_photo: abierta(1), taxon_photos: [{ photo: abierta(2) }] };
  assert.equal(fotoDeTaxon(taxon).url, 'https://i/1/medium.jpg');
  const segundo = { default_photo: cerrada(1), taxon_photos: [{ photo: cerrada(2) }, { photo: abierta(3) }, { photo: abierta(4) }] };
  assert.equal(fotoDe(segundo), null);
  assert.equal(fotoDeTaxon(segundo).url, 'https://i/3/medium.jpg');
  assert.equal(fotoDeTaxon({ default_photo: cerrada(1), taxon_photos: [{ photo: cerrada(2) }] }), null);
});

test('una foto sin autor o con aviso pendiente no se enseña', () => {
  assert.equal(fotoDeTaxon({ taxon_photos: [{ photo: { ...abierta(1), attribution: '' } }] }), null);
  assert.equal(fotoDeTaxon({ taxon_photos: [{ photo: { ...abierta(1), flags: [{ resolved: false }] } }] }), null);
  assert.ok(fotoDeTaxon({ taxon_photos: [{ photo: { ...abierta(1), flags: [{ resolved: true }] } }] }));
});

test('una foto CC0 conserva el nombre aunque iNaturalist lo deje en «uploaded by»', () => {
  const foto = { license_code: 'cc0', medium_url: 'https://i/1/medium.jpg', attribution: 'no rights reserved, uploaded by Ana', attribution_name: 'Ana' };
  assert.equal(fotoDe({ default_photo: foto }).autor, 'Ana, no rights reserved (CC0)');
});

test('el enlace de Wikipedia con espacios queda como URL válida', () => {
  const f = filaDe({ id: 1, name: 'A b', ancestor_ids: [], wikipedia_url: 'http://en.wikipedia.org/wiki/Polygonatum arisanense' }, 1);
  assert.equal(f.wikipedia, 'https://en.wikipedia.org/wiki/Polygonatum_arisanense');
});

test('solo pasan licencias libres comprobadas', () => {
  assert.equal(licenciaLibre(meta({ License: 'cc-by-sa-4.0', LicenseShortName: 'CC BY-SA 4.0' })), 'CC BY-SA 4.0');
  assert.equal(licenciaLibre(meta({ License: 'cc-by-2.0', LicenseShortName: 'CC BY 2.0' })), 'CC BY 2.0');
  assert.equal(licenciaLibre(meta({ License: 'cc0', LicenseShortName: 'CC0' })), 'CC0');
  assert.equal(licenciaLibre(meta({ License: 'pd', LicenseShortName: 'Public domain' })), 'Public domain');
  assert.equal(licenciaLibre(meta({ LicenseShortName: 'Public domain' })), 'Public domain');
  for (const m of [
    { License: 'cc-by-nc-4.0', LicenseShortName: 'CC BY-NC 4.0' },
    { License: 'cc-by-nd-4.0', LicenseShortName: 'CC BY-ND 4.0' },
    { License: 'cc-by-sa-4.0', LicenseShortName: 'CC BY-SA 4.0', NonFree: 'true' },
    { License: 'fair use', LicenseShortName: 'Fair use' },
    { LicenseShortName: 'All rights reserved' },
    {},
  ]) assert.equal(licenciaLibre(meta(m)), null, JSON.stringify(m));
  assert.equal(licenciaLibre(undefined), null);
});

test('el autor sale limpio del HTML', () => {
  assert.equal(autorDe('<a href="//x">Ana &amp; Luis</a>'), 'Ana & Luis');
  assert.equal(autorDe('<bdi>Jos&#233;&#160;Mar&iacute;a</bdi>').startsWith('José'), true);
  assert.equal(autorDe('  '), '');
  assert.equal(autorDe('<span>Unknown author</span>'), '');
  assert.ok(autorDe('x'.repeat(200)).length <= 70);
  assert.equal(autorDe('no rights reserved'), '');
  assert.equal(autorDe('No machine-readable author provided. <a href="x">Ana</a> assumed (based on copyright claims).'), 'Ana');
  assert.equal(autorDe('self', 'Luis'), 'Luis');
  assert.equal(autorDe('me', 'Luis'), 'Luis');
  assert.equal(autorDe('self'), '');
});

test('la foto de Wikipedia lleva autor y licencia, o no hay foto', () => {
  const info = {
    mime: 'image/jpeg',
    thumburl: 'https://upload.wikimedia.org/thumb/a/500px-A.jpg',
    url: 'https://upload.wikimedia.org/a/A.jpg',
    descriptionurl: 'https://commons.wikimedia.org/wiki/File:A.jpg',
    extmetadata: meta({ License: 'cc-by-sa-3.0', LicenseShortName: 'CC BY-SA 3.0', Artist: '<a href="x">Ana</a>' }),
  };
  const f = fotoWiki(info);
  assert.equal(f.url, info.thumburl);
  assert.equal(f.pequena, 'https://upload.wikimedia.org/thumb/a/250px-A.jpg');
  assert.equal(f.licencia, 'CC BY-SA 3.0');
  assert.equal(f.autor, 'Ana, CC BY-SA 3.0, Wikimedia Commons');
  assert.equal(f.fuente, info.descriptionurl);
  assert.equal(fotoWiki({ ...info, extmetadata: meta({ License: 'cc-by-sa-3.0', LicenseShortName: 'CC BY-SA 3.0' }) }), null);
  assert.equal(fotoWiki({ ...info, extmetadata: meta({ License: 'cc-by-nc-3.0', Artist: 'Ana' }) }), null);
  assert.equal(fotoWiki({ ...info, mime: 'image/svg+xml' }), null);
  assert.equal(fotoWiki(null), null);
});

test('una redirección al género no da la imagen de otra especie', () => {
  const fila = { cientifico: 'Geisha distinctissima' };
  assert.equal(imagenUtil('Geisha_distinctissima_01.JPG', fila, { fiable: false, redirigida: true }), true);
  assert.equal(imagenUtil('Geisha_otra_01.JPG', fila, { fiable: false, redirigida: true }), false);
  assert.equal(imagenUtil('Eurasian_Teal.jpg', fila, { fiable: true, redirigida: true }), true);
  assert.equal(imagenUtil('Otra.jpg', fila, { fiable: false, redirigida: false }), true);
});

test('un mapa de distribución o un SVG no cuentan como foto', () => {
  const op = { fiable: true, redirigida: false };
  const fila = { cientifico: 'A b' };
  assert.equal(imagenUtil('Anas_crecca_distribution_map.png', fila, op), false);
  assert.equal(imagenUtil('Mapa_de_A.jpg', fila, op), false);
  assert.equal(imagenUtil('Status_iucn3.1_LC.svg', fila, op), false);
  assert.equal(imagenUtil(null, fila, op), false);
  assert.equal(imagenUtil('Maple_leaf.jpg', fila, op), true);
});

test('el título sale del enlace de iNaturalist en su idioma y si no, del nombre científico', () => {
  const f = { cientifico: 'Pomatorhinus musicus', wikipedia: 'https://en.wikipedia.org/wiki/Taiwan_scimitar_babbler' };
  assert.deepEqual(tituloDe(f, 'en'), { titulo: 'Taiwan scimitar babbler', fiable: true });
  assert.deepEqual(tituloDe(f, 'zh'), { titulo: 'Pomatorhinus musicus', fiable: false });
  assert.deepEqual(tituloDe({ cientifico: 'A b', wikipedia: null }, 'en'), { titulo: 'A b', fiable: false });
});

// Red simulada: taxa por id, páginas y ficheros por título.
function simular({ taxa = {}, paginas = {}, fallaInat = false } = {}) {
  const pedidas = [];
  globalThis.fetch = async (url) => {
    const u = new URL(url);
    pedidas.push(u);
    const responder = (o) => new Response(JSON.stringify(o), { status: 200 });
    if (u.hostname === 'api.inaturalist.org') {
      if (fallaInat) return new Response('', { status: 404 });
      const ids = u.pathname.split('/').pop().split(',').map(Number);
      return responder({ results: ids.flatMap((id) => (taxa[id] ? [{ id, ...taxa[id] }] : [])) });
    }
    if (u.hostname.endsWith('.wikipedia.org')) {
      const titulos = u.searchParams.get('titles').split('|');
      return responder({ query: { pages: titulos.map((title) => ({ title, ...(paginas[title] ? { pageimage: paginas[title] } : {}) })) } });
    }
    const titulos = u.searchParams.get('titles').split('|');
    return responder({
      query: {
        pages: titulos.map((title) => ({
          title,
          imageinfo: [{
            mime: 'image/jpeg', url: `https://w/${title}`, thumburl: `https://w/500px-${title}`,
            extmetadata: meta({ License: 'cc-by-4.0', LicenseShortName: 'CC BY 4.0', Artist: 'Luis' }),
          }],
        })),
      },
    });
  };
  return pedidas;
}

const fila = (id, cientifico, extra = {}) => ({ id, cientifico, foto: null, wikipedia: null, ...extra });

test('la cadena rellena por pasos, avisa de cada cambio y recuerda lo resuelto', async () => {
  const pedidas = simular({
    taxa: {
      101: { taxon_photos: [{ photo: cerrada(1) }, { photo: abierta(2) }] },
      102: { taxon_photos: [{ photo: cerrada(3) }], wikipedia_url: 'https://en.wikipedia.org/wiki/Especie_dos' },
      103: { taxon_photos: [] },
    },
    paginas: { 'Especie dos': 'Especie_dos.jpg' },
  });
  const filas = [fila(100, 'A a', { foto: { url: 'x' } }), fila(101, 'B b'), fila(102, 'C c'), fila(103, 'D d')];
  const cambios = [];
  await completarFotos(filas, { alCambiar: (f) => cambios.push(f.id) });
  assert.equal(filas[0].foto.url, 'x');
  assert.equal(filas[1].foto.url, 'https://i/2/medium.jpg');
  assert.equal(filas[2].foto.licencia, 'CC BY 4.0');
  assert.equal(filas[2].foto.autor, 'Luis, CC BY 4.0, Wikimedia Commons');
  assert.equal(filas[2].wikipedia, 'https://en.wikipedia.org/wiki/Especie_dos');
  assert.equal(filas[3].foto, null);
  assert.deepEqual(cambios, [101, 102]);
  assert.equal(pedidas.filter((u) => u.hostname === 'api.inaturalist.org').length, 1);
  assert.equal(pedidas[0].pathname, '/v1/taxa/101,102,103');
  assert.equal(pedidas.find((u) => u.hostname.endsWith('wikipedia.org')).searchParams.get('origin'), '*');

  pedidas.length = 0;
  const nuevas = [fila(101, 'B b'), fila(103, 'D d')];
  aplicarConocidas(nuevas);
  assert.ok(nuevas[0].foto);
  await completarFotos(nuevas);
  assert.equal(pedidas.length, 0, 'lo resuelto no se vuelve a pedir');
});

test('pide de 30 en 30 y dos llamadas a la vez no repiten trabajo', async () => {
  const taxa = Object.fromEntries(Array.from({ length: 31 }, (_, i) => [200 + i, { taxon_photos: [{ photo: abierta(i) }] }]));
  const pedidas = simular({ taxa });
  const filas = Array.from({ length: 31 }, (_, i) => fila(200 + i, `E ${i}`));
  await Promise.all([completarFotos(filas), completarFotos(filas.slice(0, 5))]);
  const inat = pedidas.filter((u) => u.hostname === 'api.inaturalist.org');
  assert.deepEqual(inat.map((u) => u.pathname.split('/').pop().split(',').length), [30, 1]);
  assert.ok(filas.every((f) => f.foto));
});

test('un fallo de la API no rompe nada y la siguiente llamada reintenta', async () => {
  simular({ fallaInat: true });
  const filas = [fila(300, 'F f')];
  await completarFotos(filas);
  assert.equal(filas[0].foto, null);
  const pedidas = simular({ taxa: { 300: { taxon_photos: [{ photo: abierta(9) }] } } });
  await completarFotos(filas);
  assert.equal(pedidas.length, 1);
  assert.ok(filas[0].foto);
});

test('cancelar para la cadena antes del siguiente lote', async () => {
  const pedidas = simular();
  await completarFotos([fila(400, 'G g')], { cancelado: () => true });
  assert.equal(pedidas.length, 0);
});
