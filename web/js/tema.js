// Tema elegido con ?tema=nombre. Script clásico en <head>: actúa antes del primer pintado.
// Sin elección no hace nada y queda el aspecto publicado. ?tema= a secas vuelve a él.
// La elección dura lo que la pestaña, para pasar de la portada al visor.

(function () {
  var TEMAS = ['papel', 'coral', 'oronoche', 'lindis', 'violeta', 'pastel'];
  var CLAVE = 'wikinatu.tema';
  var pedido = new URLSearchParams(location.search).get('tema');
  var tema = pedido;
  try {
    if (pedido !== null) sessionStorage.setItem(CLAVE, pedido);
    tema = sessionStorage.getItem(CLAVE);
  } catch (e) { /* sin almacenamiento vale solo la URL */ }
  if (TEMAS.indexOf(tema) >= 0) document.documentElement.dataset.tema = tema;
})();
