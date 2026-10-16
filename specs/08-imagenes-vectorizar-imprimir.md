# 08 · Imágenes, vectorizar e imprimir

## Imágenes

- **Colocar** (Mayús+Ctrl+P): elegir archivo; el cursor muestra miniatura; clic = tamaño original (a 72 ppp de documento o la resolución del archivo); arrastre = tamaño definido. Colocación múltiple: varias imágenes en cola (contador en el cursor).
- Arrastrar y soltar desde el Explorador o pegar desde el portapapeles.
- Vinculadas o incrustadas (botón Incrustar/Desincrustar en Propiedades). Vínculos rotos → diálogo de reubicación.
- Recortar imagen (botón en Propiedades, como Illustrator CC): tiradores de recorte no destructivos (internamente un `clipGroup`) + "Aplicar recorte" destructivo.
- Máscara de recorte (Ctrl+7) y liberar (Alt+Ctrl+7).
- Información: ppp efectivos según la escala (alerta si < 150 ppp al imprimir).

## Acomodar para imprimir

Flujo común del usuario; debe ser cómodo:
1. Crear mesa A4/Carta (preset).
2. Colocar varias imágenes.
3. Panel **Espaciado › Rejilla**: filas × columnas, separación, escalar al tamaño de celda (encajar/rellenar), centrar en la mesa con márgenes.
4. **Repetir hasta llenar** (botón): duplica la selección en rejilla hasta llenar la mesa.
5. Imprimir.

## Calco de imagen (Vectorizar)

Panel y botón en Propiedades cuando hay una imagen seleccionada.

- Ajustes preestablecidos: Alta fidelidad, Baja fidelidad, 3 colores, 6 colores, 16 colores, Tonos de gris, Blanco y negro, Silueta, Arte lineal, Dibujo técnico, Logotipo.
- Modo: Color / Escala de grises / Blanco y negro. Paleta: limitada o automática. Colores (2–30). Umbral (B/N).
- Avanzado: trazados (ajuste), esquinas, ruido (px), método (abutting/overlapping), rellenos/trazos, ignorar blanco, ajustar curvas a líneas.
- Vista: Resultado, Resultado con contornos, Contornos, Contornos con imagen original, Imagen original.
- Es un objeto **vivo** (`traceNode` con referencia a imagen + parámetros). **Expandir** lo convierte en grupo de trazados.
- Implementación: cuantización de color (k-means en espacio Lab, o mediana de corte) → por cada color una máscara binaria → potrace (WASM) en Worker → trazados Bézier. Previsualización progresiva con barra de progreso y botón Cancelar.

## Exportar

**Archivo › Exportar › Exportar para pantallas** (sin atajo): lista de mesas (de todos los Espacios, con filtro por Espacio) con casillas; formatos múltiples a la vez (PNG 1x/2x/3x, SVG, PDF, JPG), sufijos, carpeta destino, "Abrir carpeta al terminar".
**Exportar como…**: un archivo SVG/PNG/JPG/PDF con opciones.
**Guardar copia como PDF**: todas las mesas como páginas.

## Imprimir (Ctrl+P)

Diálogo propio (no solo el nativo) con previsualización:
- Impresora, copias, rango de mesas (todas / rango / del Espacio activo / de todos los Espacios).
- Tamaño de papel, orientación, **escala** (no escalar / ajustar a página / personalizado %), posición (cuadrícula 3×3).
- **Marcas**: marcas de corte (Japonés / Occidental), grosor, desplazamiento; incluir sangrado.
- Imprimir capas visibles e imprimibles / todas.
- Implementación: generar PDF en memoria con pdf-lib y enviarlo a `platform.print()`:
  - Windows: `webContents.print` desde una ventana oculta que carga el PDF (sin márgenes, escala 100 %).
  - Linux: `webContents.print` sobre CUPS; fallback `lp -d <impresora> -o fit-to-page=false -o media=<papel>` con el PDF temporal.
- Debe imprimir **a escala real** en ambos sistemas (verificación 100 mm = 100 mm en papel).

## Formatos EPS y AI (Fase 11)

Investigación (Adobe no publica la especificación de los datos privados de Illustrator moderno; lo que sigue se apoya en documentación pública y en lo que hacen Inkscape, Scribus o Ghostscript):

- **Un `.ai` moderno es un PDF** con los datos nativos de Illustrator en un flujo privado (`AIPrivateData`, comprimido y **no documentado**). Si se guardó con «Crear archivo compatible con PDF», el PDF contiene el dibujo completo; si no, solo existen los datos privados y ninguna otra aplicación puede abrirlo. Los `.ai` anteriores a CS (v3–v8) son PostScript/EPS con comentarios `%AI5_…` y sí tienen especificación pública.
- **Conclusión sobre «abrirlo del todo, tal cual en Illustrator»: no es posible con garantías.** Lo que Illustrator guarda más allá del PDF (formas vivas, apariencias con varios rellenos y trazos, efectos, símbolos, pinceles, estilos gráficos, capas con nombres exactos, texto enlazado, perfiles de color) vive en los datos privados. Leemos solo el PDF incrustado, igual que cualquier otro programa. Se pierden la edición de esos elementos, pero no el aspecto.

### Importar `.ai`
- Si el archivo empieza por `%PDF`: importar con el mismo camino que PDF (pdf.js → trazados, degradados, texto, imágenes, máscaras de recorte), **una mesa por mesa de Illustrator** cuando el PDF las declara (cajas `ArtBox`/páginas) y, si no, una por página.
- **Texto**: como texto editable si la fuente instalada coincide por familia + estilo; si no, como contornos (con aviso) para no cambiar el aspecto.
- **Capas**: se recuperan de los contenidos opcionales (`OCG`) del PDF cuando existen; si no, una sola capa.
- Sin PDF incrustado (guardado sin compatibilidad): mensaje claro «Este archivo se guardó sin contenido compatible con PDF; vuelve a guardarlo en Illustrator marcando “Crear archivo compatible con PDF”». Sin intentar leer los datos privados.
- **Fuera de alcance**: filtros y efectos de Photoshop (rasterizados en el PDF: se importan como imagen), efectos vivos (se importan ya aplicados), símbolos y pinceles (expandidos), sobreimpresión y tintas planas (se pasan a su equivalente de proceso).
- Los `.ai` antiguos en PostScript (v3–v8) se leen con el intérprete de EPS de abajo.

### Importar EPS
- EPS de **Illustrator** (`%!PS-Adobe-3.0 EPSF-3.0` con `%%Creator: Adobe Illustrator`): intérprete propio de los operadores del formato AI (`m l c v y h f F s S b B n`, `Xa/XA` y degradados por `%AI5_BeginGradient`, capas `%AI5_BeginLayer`, texto como contornos si no hay fuente). Sin dependencias externas.
- EPS **genérico** (cualquier PostScript): se usa la vista previa incrustada solo para mostrar, y el contenido se convierte con **Ghostscript** si está instalado (`gs -sDEVICE=pdfwrite` → importar el PDF). No se distribuye Ghostscript (licencia AGPL): se detecta en el sistema y, si falta, se informa y se ofrece colocar la vista previa como imagen. Decisión pendiente de confirmar con el usuario antes de implementarlo.
- Cabecera DOS EPS (`C5 D0 D3 C6`) y vista previa TIFF/WMF: se omiten correctamente al leer.

### Guardar como EPS
- **Archivo › Guardar como… › EPS** y **Exportar › EPS**: PostScript nivel 3, `%%BoundingBox` y `%%HiResBoundingBox` de la mesa (un archivo por mesa, como las demás exportaciones), colores RGB o CMYK según el modo del documento, trazados, formas, degradados (`shfill`), máscaras de recorte (`clip`), imágenes incrustadas (`image` con ASCII85 + Flate) y texto **convertido en contornos** (EPS no incrusta fuentes de forma fiable). Opciones: vista previa (ninguna / TIFF de 8 bits), transparencia (aplanar a 300 ppp), incluir páginas de color CMYK.
- Lo no representable en PostScript (modos de fusión, opacidad, modificadores de apariencia) se **aplana** a ráster a 300 ppp, como el PDF.
- No es ida y vuelta: al reabrir un EPS creado por Victoria se obtienen trazados y contornos, no formas vivas ni texto. El formato nativo de edición sigue siendo `.vict`.

### Guardar como AI
- **No se escribe `.ai` nativo** (formato propietario). Se ofrece **Exportar › PDF compatible con Illustrator** (PDF con extensión `.pdf`) y, a petición, el mismo PDF con extensión `.ai`: Illustrator lo abre como un PDF importado (texto editable, trazados, degradados, capas por `OCG`) pero **sin** formas vivas ni apariencias de Illustrator. Se avisa de ello en el diálogo.

### Criterios de aceptación (Fase 11)
- Un `.ai` de Illustrator CC con PDF incrustado se abre con el mismo aspecto (comparación visual de página completa, tolerancia ≤ 1 % de píxeles distintos) con sus mesas y capas.
- Un `.ai` guardado sin compatibilidad PDF muestra el mensaje y no falla.
- Un EPS de Illustrator con trazados, degradado y máscara se abre y su geometría coincide con la del PDF equivalente; un EPS creado por Victoria se abre en Illustrator, Inkscape y Ghostscript con el mismo tamaño de mesa.
