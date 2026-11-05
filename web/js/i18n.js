// Idioma de la interfaz. Cada página registra su diccionario con `registrar`.

const CLAVE = 'wikinatu.idioma';
const textos = { es: {}, en: {} };
const oyentes = new Set();

const COMUNES = {
  es: {
    g_aves: 'Aves', g_mamiferos: 'Mamíferos', g_reptiles: 'Reptiles', g_anfibios: 'Anfibios', g_peces: 'Peces',
    g_insectos: 'Insectos', g_aracnidos: 'Arácnidos', g_artropodos: 'Otros artrópodos', g_moluscos: 'Moluscos',
    g_anelidos: 'Anélidos', g_cnidarios: 'Cnidarios', g_equinodermos: 'Equinodermos', g_poriferos: 'Esponjas',
    g_plantas: 'Plantas', g_hongos: 'Hongos', g_otros: 'Otros',
    meses: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
    meses_ini: ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'],
  },
  en: {
    g_aves: 'Birds', g_mamiferos: 'Mammals', g_reptiles: 'Reptiles', g_anfibios: 'Amphibians', g_peces: 'Fish',
    g_insectos: 'Insects', g_aracnidos: 'Arachnids', g_artropodos: 'Other arthropods', g_moluscos: 'Molluscs',
    g_anelidos: 'Annelids', g_cnidarios: 'Cnidarians', g_equinodermos: 'Echinoderms', g_poriferos: 'Sponges',
    g_plantas: 'Plants', g_hongos: 'Fungi', g_otros: 'Others',
    meses: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    meses_ini: ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'],
  },
};

function inicial() {
  try {
    const guardado = localStorage.getItem(CLAVE);
    if (guardado === 'es' || guardado === 'en') return guardado;
  } catch { /* sin almacenamiento */ }
  return (navigator.language || 'es').toLowerCase().startsWith('es') ? 'es' : 'en';
}

let idioma = inicial();

export const idiomaActual = () => idioma;

export function registrar(dic) {
  Object.assign(textos.es, dic.es);
  Object.assign(textos.en, dic.en);
}

export function t(clave, vars) {
  let s = textos[idioma][clave] ?? COMUNES[idioma][clave] ?? clave;
  if (vars && typeof s === 'string') for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
}

// data-t pone textContent, data-t-html pone innerHTML (solo textos propios), data-t-aria y data-t-ph atributos.
export function aplicar(raiz = document) {
  document.documentElement.lang = idioma;
  raiz.querySelectorAll('[data-t]').forEach((e) => { e.textContent = t(e.dataset.t); });
  raiz.querySelectorAll('[data-t-html]').forEach((e) => { e.innerHTML = t(e.dataset.tHtml); });
  raiz.querySelectorAll('[data-t-aria]').forEach((e) => e.setAttribute('aria-label', t(e.dataset.tAria)));
  raiz.querySelectorAll('[data-t-ph]').forEach((e) => e.setAttribute('placeholder', t(e.dataset.tPh)));
  raiz.querySelectorAll('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === idioma)));
}

export function cambiarIdioma(nuevo) {
  idioma = nuevo;
  try { localStorage.setItem(CLAVE, nuevo); } catch { /* sin almacenamiento */ }
  aplicar();
  oyentes.forEach((f) => f(nuevo));
}

export const alCambiarIdioma = (f) => oyentes.add(f);

export function iniciarSelector(raiz = document) {
  raiz.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => cambiarIdioma(b.dataset.lang)));
}
