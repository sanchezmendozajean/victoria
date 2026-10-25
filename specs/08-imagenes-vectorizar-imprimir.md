# 08 · Imágenes, vectorizar e imprimir

## Imágenes

- **Colocar** (Mayús+Ctrl+P): elegir archivo; el cursor muestra miniatura; clic = tamaño original (a 72 ppp de documento o la resolución del archivo); arrastre = tamaño definido. Colocación múltiple: varias imágenes en cola (contador en el cursor).
- Arrastrar y soltar desde el Explorador o pegar desde el portapapeles.
- Vinculadas o incrustadas (botón Incrustar/Desincrustar en Propiedades). Vínculos rotos → diálogo de reubicación.
- Recortar imagen (botón en Propiedades, como Illustrator CC): tiradores de recorte no destructivos (internamente un `clipGroup`) + "Aplicar recorte" destructivo.
- Máscara de recorte (Ctrl+7) y liberar (Alt+Ctrl+7).
- Información: ppp efectivos según la escala (alerta si < 150 ppp al imprimir).

### Reglas añadidas en la Fase 11 (etapa 11.1)

- **Bytes fuera del documento**:  guarda solo ancho, alto y formato; los bytes viven en  (, indexado por **SHA-256 del contenido**, que es también el nombre del archivo en el ). Dos archivos idénticos comparten un recurso. Al guardar solo se escriben las imágenes que el documento aún lista, así que deshacer una colocación no deja basura en el archivo.
- **Formatos**: PNG, JPEG y WebP. El tamaño se lee de la cabecera, sin decodificar (el core no tiene DOM). En JPEG se aplica la orientación EXIF (5–8 intercambian ancho y alto), como hace el navegador al dibujar.
- **Tamaño natural**: la resolución que declara el archivo (PNG , JPEG JFIF) o 72 ppp si no declara ninguna; 1 px = 1 pt a 72 ppp.
- **Colocar (Mayús+Ctrl+P) y soltar archivos**: cada imagen es un objeto incrustado, sin relleno ni trazo, en la capa de la selección (o la elegida en Capas, o la más alta libre), centrado en la mesa activa o en el punto donde se soltó. Varias imágenes a la vez se escalonan 24 pt. Un paso de deshacer por imagen; las colocadas quedan seleccionadas.
- Las imágenes se decodifican de forma asíncrona () con una caché de 64 por contenido; mientras cargan, el lienzo dibuja el marcador gris con aspas.
- **Pendiente de esta etapa**: colocar con clic o arrastre y miniatura en el cursor, cola de varias imágenes, pegar desde el portapapeles, Incrustar/Desincrustar y reubicar vínculos (11.6).

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

## Formatos EPS y AI

Decisiones del usuario: **el AI queda para mucho después** (fuera del plan actual); **el lector de EPS simples se implementa ya** (ya existe, ver abajo); los EPS «exóticos» y la escritura de EPS quedan para otra oportunidad. No se distribuye ni se exige Ghostscript por ahora.

### Importar EPS simples (implementado)
- **Qué es «simple»**: EPS vectorial hecho de trazados, colores sólidos (gris, RGB, CMYK), trazos (grosor, extremos, esquinas, límite de inglete, guiones), rellenos (regla par-impar con `eofill`), recorte (`clip`/`eoclip`), transformaciones, procedimientos y control de flujo (`def`, `dict`, `if`, `ifelse`, `for`, `repeat`…), tal como lo escriben Cairo, Inkscape, matplotlib o el propio Illustrator. Cabecera DOS EPS (`C5 D0 D3 C6`) admitida.
- **Dialecto de Illustrator (AI3–AI8)**: operadores compactos (`m l c v y h f F s S b B n N`, `g G k K Xa XA x X`, `w j J M d D`), grupos (`u U`), trazados compuestos (`*u *U`) y grupos de recorte (`q W Q`). Se omiten el prólogo y las capas (todo va a una capa).
- **Implementación**: `core/io/eps.ts` (`readEps`), un intérprete PostScript mínimo en TypeScript puro, sin dependencias. Un EPS se abre como **documento nuevo sin guardar**, con una mesa del tamaño del `%%BoundingBox` (Y invertida, origen en la esquina de la caja). Límites de seguridad: 4 millones de pasos y 200 000 objetos.
- **Lo que no lee (lo avisa al abrir, no falla)**: texto y fuentes, imágenes (`image`, `colorimage`, datos `currentfile`/`eexec`; el intérprete se detiene ahí y conserva lo dibujado), degradados, motivos, `shfill`, `arc`/`arcn` y operadores desconocidos. Son los EPS «exóticos»: pendientes.
- **Reglas supuestas del dialecto AI** (sin especificación a mano; verificar con archivos reales): `1 D` = par-impar; el tinte de un color personalizado `x`/`X` se aplica como `1 − tinte`; dentro de `*u … *U` los subtrazados terminan en `n` y el último operador de pintura fija la apariencia.

### Pendiente (otra oportunidad)
- EPS exóticos: texto (como contornos o como texto), imágenes, degradados y motivos de Illustrator, `arc`, capas con nombre. Opciones estudiadas: Ghostscript como proceso aparte (AGPL: exige incluir licencia y oferta de código; solo si el proyecto lo asume) o detectar el del sistema.
- **Guardar EPS**: PostScript nivel 3, un archivo por mesa, trazados, degradados (`shfill`), recorte e imágenes; texto como contornos; transparencia aplanada a 300 ppp. No es ida y vuelta (el formato de edición es `.vict`).

### AI (muy posterior)
- Un `.ai` moderno es un PDF con los datos nativos de Illustrator en un flujo privado (`AIPrivateData`) **comprimido y sin documentación pública**. Sin «Crear archivo compatible con PDF» solo existen esos datos y ninguna otra aplicación puede abrirlo. Abrirlo «tal cual» en Victoria no es posible con garantías: lo único recuperable es el PDF incrustado (aspecto, no formas vivas, apariencias, efectos, símbolos ni pinceles). Los `.ai` v3–v8 son EPS y se leen ya con el lector de arriba.
- Cuando llegue: importar el PDF incrustado por el camino del PDF (una mesa por mesa declarada, capas desde `OCG`, texto editable si la fuente coincide); sin PDF incrustado, un mensaje claro. Escribir: **no** se escribe `.ai` nativo; como mucho, un PDF con extensión `.ai` que Illustrator abre como PDF importado.
- Filtros y efectos de Photoshop quedan fuera.

### Migrar diseños desde Illustrator mientras tanto
Desde Illustrator: **Archivo › Guardar como… › SVG** (la vía recomendada; Fase 11 trae el importador), **EPS** (importable ya si es simple: convertir el texto en contornos y expandir degradados, efectos y pinceles antes), o **PDF** (Fase 11). Para que se parezcan lo más posible: Objeto › Expandir y Objeto › Expandir apariencia, Texto › Crear contornos, y guardar sin perfiles ni transparencia compleja.
