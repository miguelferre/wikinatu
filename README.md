# WikiNatu

WikiNatu dibuja el cuadro de la naturaleza de una ruta. Sueltas un GPX y la web cruza la ruta con las observaciones de iNaturalist. Da cuatro cosas:

- **Lámina**: relieve propio de la zona, con la ruta y las observaciones.
- **Cuadro**: perfil de la ruta con las especies rotuladas a su altura, al modo del *Naturgemälde* de Humboldt (1807).
- **Inventario**: lista completa de especies, con foto, nombres y recuento.
- **Guía**: PDF en A5 para llevar.

El GPX no sale del navegador. Solo salen cajas de coordenadas hacia iNaturalist.

Web: <https://miguelferre.github.io/wikinatu/>

## Cómo correrlo

No hay build ni dependencias. La carpeta publicada es `web/`.

```
python -m http.server 8000 --bind 127.0.0.1 --directory web
npm test
```

`node scripts/ejemplo.mjs "ruta/al.gpx"` regenera los datos de la ruta de ejemplo en `web/data/`. Consulta iNaturalist a una petición por segundo.

## Fuentes y licencias

- Observaciones y fotos: [iNaturalist](https://www.inaturalist.org) y sus observadores. Solo se enseñan fotos con licencia abierta, con autor y licencia.
- Relieve: [Mapterhorn](https://mapterhorn.com/attribution).
- Paisaje: franja bajo el perfil del cuadro, con [AlphaEarth Foundations](https://developers.google.com/earth-engine/guides/aef_on_gcs_readme), embeddings anuales de 2025, CC-BY 4.0. Índice por zona en `web/data/aef/`, generado con `node scripts/aef-indice.mjs 2025`. The AlphaEarth Foundations Satellite Embedding dataset is produced by Google and Google DeepMind. Descompresión ZSTD con [fzstd](https://github.com/101arrowz/fzstd) 0.1.1, licencia MIT, en `web/js/vendor/fzstd.js`.
- Tipografía: [Anton](https://github.com/googlefonts/AntonFont) y [Barlow](https://github.com/jpt/barlow), con licencia OFL. Ver `web/fonts/OFL.txt`.
- Ruta de ejemplo: Lagos de Tristaina, de Miguel Ferreiro.
- Código: licencia MIT. Ver `LICENSE`.
