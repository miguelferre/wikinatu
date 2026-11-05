import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../web/css/temas.css', import.meta.url), 'utf8');
const lanzador = readFileSync(new URL('../web/js/tema.js', import.meta.url), 'utf8');
const tokens = (texto) => Object.fromEntries([...texto.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const temas = [...css.matchAll(/:root\[data-tema="(\w+)"\] \{([\s\S]*?)\n\}/g)].map((m) => ({ nombre: m[1], t: tokens(m[2]) }));
const raiz = tokens(css.match(/^:root \{([\s\S]*?)^\}/m)[1]);

const canal = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luz = (h) => {
  const [r, g, b] = [1, 3, 5].map((i) => canal(parseInt(h.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contraste = (a, b) => {
  const [x, y] = [luz(a), luz(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

test('los temas de temas.css son los que acepta tema.js', () => {
  const lista = lanzador.match(/TEMAS = \[(.*?)\]/)[1].split(',').map((s) => s.trim().replace(/'/g, ''));
  assert.deepEqual(temas.map((x) => x.nombre).sort(), [...lista].sort());
  assert.equal(temas.length, 6);
});

test('sin tema queda la rampa publicada', () => {
  assert.equal(raiz['rampa-noche'].split(',')[0], '#16343a');
  assert.equal(raiz['lam-claro'], '0');
  assert.equal(raiz['heroe-lavado'], '0');
});

test('cada tema trae sus cuatro rampas de nueve tintas', () => {
  for (const { nombre, t } of temas) {
    for (const r of ['noche', 'papel', 'heroe', 'heroe-fondo']) {
      assert.equal(t[`rampa-${r}`]?.split(',').length, 9, `${nombre}: rampa ${r}`);
    }
  }
});

test('el texto de cada tema cumple AA en sus tres fondos', () => {
  for (const { nombre, t } of temas) {
    for (const fondo of ['noche', 'noche-2', 'noche-3']) {
      for (const texto of ['fg', 'muted', 'oro']) {
        const c = contraste(t[texto], t[fondo]);
        assert.ok(c >= 4.5, `${nombre}: ${texto} sobre ${fondo} da ${c.toFixed(2)}`);
      }
    }
  }
});

test('los textos de la guía cumplen AA sobre blanco', () => {
  for (const { nombre, t } of temas) {
    for (const k of ['p-tinta', 'p-suave', 'p-acento', 'p-cient', 'cug-suave']) {
      const c = contraste(t[k], '#ffffff');
      assert.ok(c >= 4.5, `${nombre}: ${k} da ${c.toFixed(2)}`);
    }
  }
});

test('el casing separa la ruta del relieve', () => {
  for (const { nombre, t } of temas) {
    const ruta = t['lam-ruta'] ?? t.ruta;
    const c = contraste(ruta, t['lam-casing']);
    assert.ok(c >= 3, `${nombre}: ruta contra casing da ${c.toFixed(2)}`);
  }
});
