// Cadena de fotos: default_photo abierta (ya en la fila), taxon_photos abierta, imagen de Wikipedia.
// Corre en segundo plano y por lotes. Lo que resuelve se recuerda: otra consulta no lo repite.
// Sin DOM: también corre en node (tests/fotos.test.mjs).

import { LOTE_TAXONES, fotoDeTaxon, taxones } from './inat.js';
import { fotosWiki } from './visor-wiki.js';

const hechas = new Map(); // id -> foto, o null si la cadena acabó sin ninguna
const enCurso = new Map(); // id -> promesa del trabajo que la está buscando

// Lo ya resuelto se pone antes de pintar la lista: al cambiar de mes no parpadea.
export function aplicarConocidas(filas) {
  for (const f of filas) if (!f.foto && hechas.get(f.id)) f.foto = hechas.get(f.id);
}

async function cadena(propias, { idiomas, cancelado, poner }) {
  const sinFoto = [];
  try {
    for (let i = 0; i < propias.length; i += LOTE_TAXONES) {
      if (cancelado()) return;
      const lote = propias.slice(i, i + LOTE_TAXONES);
      const porId = new Map((await taxones(lote.map((f) => f.id))).map((t) => [t.id, t]));
      for (const f of lote) {
        const taxon = porId.get(f.id);
        if (taxon?.wikipedia_url && !f.wikipedia) f.wikipedia = taxon.wikipedia_url;
        const foto = taxon ? fotoDeTaxon(taxon) : null;
        if (foto) { hechas.set(f.id, foto); poner(f, foto); } else sinFoto.push(f);
      }
    }
    if (!sinFoto.length || cancelado()) return;
    const wiki = await fotosWiki(sinFoto, idiomas);
    for (const f of sinFoto) {
      const foto = wiki.get(f.id) ?? null;
      hechas.set(f.id, foto);
      if (foto) poner(f, foto);
    }
  } catch {
    // Sin red o con la API ocupada, lo que falte queda sin foto y la próxima llamada lo reintenta.
  } finally {
    for (const f of propias) enCurso.delete(f.id);
  }
}

// Resuelve cuando las filas pedidas ya tienen su foto, o cuando la cadena acabó sin ninguna.
export async function completarFotos(filas, { idiomas = ['en'], cancelado = () => false, alCambiar = () => {} } = {}) {
  const poner = (f, foto) => {
    if (f.foto) return;
    f.foto = foto;
    alCambiar(f);
  };
  const pendientes = filas.filter((f) => !f.foto);
  for (const f of pendientes) if (hechas.get(f.id)) poner(f, hechas.get(f.id));

  const propias = pendientes.filter((f) => !f.foto && !hechas.has(f.id) && !enCurso.has(f.id));
  const ajenas = new Set(pendientes.flatMap((f) => (enCurso.has(f.id) ? [enCurso.get(f.id)] : [])));
  const trabajo = cadena(propias, { idiomas, cancelado, poner });
  for (const f of propias) if (!hechas.has(f.id)) enCurso.set(f.id, trabajo);
  await Promise.all([trabajo, ...ajenas]);

  for (const f of pendientes) if (hechas.get(f.id)) poner(f, hechas.get(f.id));
  // Otra consulta pudo cancelar el trabajo del que dependíamos: lo que quedó se pide aquí.
  const sueltas = pendientes.filter((f) => !f.foto && !hechas.has(f.id));
  if (ajenas.size && sueltas.length && !cancelado()) await completarFotos(sueltas, { idiomas, cancelado, alCambiar });
}
