// Qué entra en la guía. Lógica pura: también corre en node (tests/guia.test.mjs).

import { formatoGrados } from './lamina-marco.js';

export const ANIMALES = ['aves', 'mamiferos', 'reptiles', 'anfibios', 'peces', 'insectos', 'aracnidos', 'artropodos', 'moluscos', 'anelidos', 'cnidarios', 'equinodermos', 'poriferos'];
export const OPCIONES_FOTOS = [30, 60, 120, 'todas'];
export const POR_DEFECTO = { grupos: null, fotos: 60, cuadro: true, resto: true };
export const CLAVE_GUIA = 'wikinatu.guia';

// grupos: null es «todos»; una lista son solo esos, y puede quedar vacía.
export function seleccionGuia(filas, { grupos = null, fotos = 60, resto = true } = {}) {
  const elegidos = grupos ? new Set(grupos) : null;
  const lista = elegidos ? filas.filter((f) => elegidos.has(f.grupo.id)) : filas;
  const n = fotos === 'todas' ? lista.length : Math.min(fotos, lista.length);
  return { filas: lista, conFoto: lista.slice(0, n), resto: resto ? lista.slice(n) : [] };
}

// Atajos del diálogo sobre los grupos presentes en la ruta. null es «todos».
export function gruposDeAtajo(atajo, presentes) {
  if (atajo === 'todo') return null;
  if (atajo === 'animales') return presentes.filter((g) => ANIMALES.includes(g));
  return [atajo];
}

// «Todos» se guarda como null: un grupo nuevo en otra ruta entra por defecto.
export function compactarGrupos(grupos, presentes) {
  if (!grupos) return null;
  return presentes.every((g) => grupos.includes(g)) ? null : presentes.filter((g) => grupos.includes(g));
}

// Elección con la que abre el diálogo. Manda el filtro del visor; después, lo recordado
// que siga teniendo sentido en esta ruta. El texto guardado puede venir roto.
export function opcionesIniciales(guardado, presentes, grupoVisor = null) {
  let g = null;
  try { g = guardado ? JSON.parse(guardado) : null; } catch { /* se ignora */ }
  const o = { ...POR_DEFECTO };
  if (g && typeof g === 'object') {
    if (OPCIONES_FOTOS.includes(g.fotos)) o.fotos = g.fotos;
    if (typeof g.cuadro === 'boolean') o.cuadro = g.cuadro;
    if (typeof g.resto === 'boolean') o.resto = g.resto;
    if (Array.isArray(g.grupos)) {
      const validos = presentes.filter((p) => g.grupos.includes(p));
      if (validos.length) o.grupos = compactarGrupos(validos, presentes);
    }
  }
  if (grupoVisor && presentes.includes(grupoVisor)) o.grupos = compactarGrupos([grupoVisor], presentes);
  return o;
}

// Estimado sobre el PDF de Qixingshan (2026-11-06): 14 tarjetas por página, unas 100 líneas
// de lista, media tarjeta por rótulo de grupo y algo más de media página de cierre.
const TARJETAS_PAGINA = 14, LINEAS_PAGINA = 100, CIERRE = 0.6;

export function paginasGuia({ conFoto, resto, cuadro }) {
  const n = conFoto.length;
  if (!n) return 0;
  const grupos = new Set(conFoto.map((f) => f.grupo.id)).size;
  const tarjetas = (n + grupos / 2) / TARJETAS_PAGINA;
  return Math.ceil(1 + (cuadro ? 1 : 0) + tarjetas + resto.length / LINEAS_PAGINA + CIERRE);
}

// Filas de la portada: grupos de más a menos especies. Los pequeños se suman en una.
export function gruposPortada(recuento, maximo = 9) {
  if (recuento.length <= maximo) return recuento.map((g) => ({ ...g, resto: false }));
  const cabeza = recuento.slice(0, maximo - 1).map((g) => ({ ...g, resto: false }));
  const n = recuento.slice(maximo - 1).reduce((s, g) => s + g.n, 0);
  return [...cabeza, { id: 'otros', color: 'otros', n, resto: true }];
}

export const coordenadasTexto = (lat, lon) => `${formatoGrados(lat, 1 / 3600, 'N', 'S')}, ${formatoGrados(lon, 1 / 3600, 'E', 'O')}`;
