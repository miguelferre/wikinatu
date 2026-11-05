import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const raiz = (f) => new URL(`../web/${f}`, import.meta.url);
const css = readFileSync(raiz('css/base.css'), 'utf8');
const crudos = Object.fromEntries([...css.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const valor = (k) => {
  const v = crudos[k];
  const r = /^var\(--([\w-]+)\)$/.exec(v ?? '');
  return r ? valor(r[1]) : v;
};

const canal = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luz = (h) => {
  const [r, g, b] = [1, 3, 5].map((i) => canal(parseInt(h.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contraste = (a, b) => {
  const [x, y] = [luz(a), luz(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

test('los temas y Alegreya ya no están', () => {
  assert.equal(existsSync(raiz('css/temas.css')), false);
  assert.equal(existsSync(raiz('js/tema.js')), false);
  assert.doesNotMatch(css, /Alegreya|data-tema/);
  for (const f of ['index.html', 'ruta.html']) assert.doesNotMatch(readFileSync(raiz(f), 'utf8'), /tema\.js|temas\.css|alegreya/i);
});

test('la lámina usa la rampa de la maqueta en pantalla y en la guía', () => {
  assert.equal(valor('rampa'), '#93d6cc, #dfeccf, #f8eed3, #fbdc9a, #f5b47c');
  assert.equal(valor('lam-claro'), '1');
});

test('el texto cumple AA sobre cada fondo', () => {
  const parejas = [
    ['tinta', 'papel'], ['suave', 'papel'], ['coral-oscuro', 'papel'], ['crema', 'tinta'], ['suave-oscuro', 'tinta'], ['ambar', 'tinta'],
    ['tinta', 'ambar'], ['crema', 'coral-oscuro'], ['crema', 'turquesa'], ['crema', 'tinta-3'], ['suave', 'papel-claro'], ['coral-oscuro', 'papel-claro'],
  ];
  for (const [texto, fondo] of parejas) {
    const c = contraste(valor(texto), valor(fondo));
    assert.ok(c >= 4.5, `${texto} sobre ${fondo} da ${c.toFixed(2)}`);
  }
});

test('los puntos de grupo se ven sobre el papel y sobre la rampa', () => {
  for (const g of ['plantas', 'herpetos', 'aves', 'mamiferos', 'insectos', 'hongos', 'otros']) {
    for (const fondo of [valor('papel'), '#f8eed3']) {
      const c = contraste(valor(`c-${g}`), fondo);
      assert.ok(c >= 3, `${g} sobre ${fondo} da ${c.toFixed(2)}`);
    }
  }
});

test('el casing separa la ruta del relieve', () => {
  const c = contraste(valor('lam-ruta'), valor('lam-casing'));
  assert.ok(c >= 3, `ruta contra casing da ${c.toFixed(2)}`);
});
