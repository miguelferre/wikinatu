// Tira circular de 12 meses e interruptores. Cada cambio repite la consulta.

import { t } from './i18n.js';
import { ventanaMeses } from './analisis.js';
import { S } from './visor.js';

const $ = (id) => document.getElementById(id);
let avisar = () => {};

export function pintarTira() {
  const tira = $('tiraMeses');
  const nombres = t('meses');
  const elegidos = ventanaMeses(S.mes);
  tira.classList.toggle('anio', S.todoAnio);
  tira.replaceChildren(...nombres.map((nombre, i) => {
    const m = i + 1;
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = nombre.slice(0, 3);
    b.setAttribute('aria-label', nombre);
    const dentro = !S.todoAnio && elegidos.includes(m);
    b.setAttribute('aria-pressed', String(dentro));
    if (!S.todoAnio) {
      if (m === S.mes) b.className = 'centro';
      else if (dentro) b.className = 'vecino';
    }
    b.addEventListener('click', () => {
      S.mes = m;
      S.todoAnio = false;
      pintarTira();
      avisar();
      tira.children[i].focus();
    });
    return b;
  }));
  $('btnAnio').setAttribute('aria-pressed', String(S.todoAnio));
}

export function iniciarFiltros({ alCambiar, alCambiarLocal }) {
  avisar = alCambiar;
  pintarTira();
  $('btnAnio').addEventListener('click', () => {
    S.todoAnio = !S.todoAnio;
    pintarTira();
    alCambiar();
  });
  $('chkSinConfirmar').addEventListener('change', (e) => {
    S.calidad = e.target.checked ? 'verificable' : 'investigacion';
    alCambiar();
  });
  $('selLocal').addEventListener('change', (e) => {
    S.local = e.target.value;
    alCambiarLocal();
  });
}
