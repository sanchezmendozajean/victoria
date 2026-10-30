# Changelog

## Fase 12 — Pulido (en curso)

### 12.1 Preferencias
- **Edición › Preferencias…** (Ctrl+K): diálogo con efecto inmediato (sin Aceptar) y **Restablecer**. Primeras opciones: **añadir y eliminar puntos automáticamente con la Pluma** (antes una constante), **fidelidad del Lápiz 1–5** (de 5 px a 1 px de tolerancia; 3 es el 2,5 px de siempre) y **intervalo de autoguardado** (1–30 min; el manager lo lee en cada ciclo, así que el cambio vale para documentos ya abiertos).
- Se guardan por usuario en el almacenamiento del navegador (no en el documento) y lo leído se valida: un valor desconocido o fuera de rango vuelve al predeterminado (`renderer/prefs/preferences.ts`, con su almacén de Zustand para la interfaz y `getPreferences()` para herramientas y gestor).
- Pruebas: 3 unitarias de preferencias y autoguardado, 1 de la Pluma con la opción apagada y 1 e2e (abrir con Ctrl+K, cambiar, recargar y comprobar que se recuerda, Restablecer).

### Pendiente
- Preferencias: faltan **Atajos** (reasignar, y las alternativas para los atajos que Linux reserva, spec 09), «usar barra de título del sistema» (exige recrear la ventana), unidades de los documentos nuevos y tamaño de la interfaz.
- Fase 12: espacios de trabajo de paneles y pantalla de inicio (12.2), rendimiento (12.3), instalador firmado y manual breve (12.4).

## Fase 11 — Imágenes, exportar, imprimir (en curso)

### 11.1 Colocar imágenes
- **Archivo › Colocar** (Mayús+Ctrl+P) abre el diálogo nativo (varias imágenes a la vez) y **soltar archivos sobre el lienzo** coloca PNG, JPEG y WebP incrustados, a su tamaño natural (la resolución del archivo o 72 ppp), centrados en la mesa o en el punto donde se soltaron. Un paso de deshacer por imagen.
- El lienzo **pinta las imágenes** (antes solo un marcador): decodificación asíncrona con caché por contenido.
- **Los bytes viajan en el `.vict`**: nuevo `ImageStore` por documento (SHA-256 propio, el core no tiene DOM); el gestor ya los conserva al guardar, abrir, autoguardar y recuperar (antes se descartaban).
- Lectura de cabeceras sin decodificar (`sniffImage`): formato, tamaño, ppp y orientación EXIF.
- Pruebas: 712 unitarias en total (la etapa añade 20) y 1 e2e (colocar, pintar, deshacer, rehacer). La prueba de la API expuesta incluye `openImages`.

### 11.2 Portapapeles, Transformación libre y Previsualizar píxeles
- **Portapapeles**: Edición › Copiar, Cortar y Pegar, Pegar por delante, por detrás, en el mismo lugar y en todas las mesas (Ctrl+C/X/V, Ctrl+F/B, Mayús+Ctrl+V, Alt+Mayús+Ctrl+V). Los objetos viajan en el portapapeles del sistema con su propio formato (`web application/x-victoria-clip`, un ZIP con `clip.json` e imágenes) junto con las muestras, degradados e imágenes que usan, así que también se pegan en otro documento. Una imagen copiada en otro programa se pega como imagen. Un paso de deshacer por pegado. Mientras se edita texto sigue mandando el portapapeles del campo de texto.
- **Transformación libre (E)** con el widget de cuatro modos junto al cuadro: *Restringir* (escala proporcional), *Transformación libre* (como Selección; Ctrl en un lado = sesgo, Ctrl en una esquina = distorsión libre, Ctrl+Alt+Mayús en una esquina = perspectiva), *Distorsión de perspectiva* y *Distorsión libre*. Las dos distorsiones cambian la geometría de verdad (las formas vivas pasan a trazado; el texto y las imágenes se rechazan con un aviso) y se calculan siempre desde el original, un paso de deshacer por arrastre; Esc lo revierte.
- **Previsualizar píxeles (Alt+Ctrl+Y)**: con zoom mayor del 100 % el dibujo se rasteriza a 72 ppp y se muestra con sus píxeles.
- Dependencias: ninguna. Núcleo nuevo: `core/clipboard`, `core/geometry/distort.ts`.
- Pruebas: 751 unitarias en total (la etapa añade 39) y 5 e2e nuevos (copiar/pegar con el portapapeles real del sistema, cortar y pegar en el lugar, imagen externa, distorsión desde el widget, píxeles).

### 11.3 Exportar
- **Archivo › Exportar…** (PNG, JPG, SVG, PDF; mesa activa, mesas del Espacio o todos los Espacios; PNG a 72/150/300 ppp o a medida con fondo transparente, blanco o el de la mesa; JPG con calidad; SVG minificado; PDF de todas las mesas en un archivo; sangrado opcional) y **Exportar para pantallas…** (lista de mesas con filtro por Espacio, varios formatos a la vez con escala 1x/2x/3x y sufijo, carpeta de destino, abrir la carpeta al terminar). Un archivo pasa por el diálogo de guardar; varios, por la carpeta elegida. «Guardar copia como PDF» es Exportar… › PDF › todos los Espacios. **Archivo › Guardar una copia…** escribe un `.vict` aparte sin tocar el documento.
- **Una sola escena** (`core/export/scene.ts`) con la geometría evaluada (modificadores, Contornear trazo, perfiles de ancho, puntas de flecha, guiones alineados, sombras y resplandores, grupos de recorte, imágenes, texto como contornos) que leen el escritor **SVG** (degradados en su espacio unitario, trazos dentro/fuera con recortes, efectos como filtros, imágenes incrustadas una vez) y el escritor **PDF** vectorial (`pdf-lib`: degradados como patrones de sombreado, opacidad y mezcla como estados gráficos, PNG y JPEG incrustados). PNG y JPG los pinta el mismo pintor del lienzo, con la resolución anotada en el archivo (`pHYs` / JFIF).
- Avisos tras exportar: sombras y resplandores no existen en PDF, la transparencia de los degradados no se conserva en PDF, una imagen WebP no cabe en un PDF, falta el archivo de una imagen. Un PNG por encima de 16 384 px por lado se rechaza con un mensaje.
- El proceso principal solo escribe en carpetas que el usuario eligió en un diálogo, con nombres de archivo simples; nombres seguros y únicos en Windows y Linux.
- Corregido por el camino: los mensajes de error y resultado quedaban **debajo** de los diálogos de formulario (ahora van por encima).
- Dependencia nueva: **pdf-lib 1.17.1** (MIT, JavaScript puro) para el PDF, como pide la spec 01.
- Pruebas: 782 unitarias en total (la etapa añade 31) y 7 e2e nuevos con archivos reales: PNG con su tamaño y ppp, SVG, PDF, exportar para pantallas, texto como contornos, copia `.vict` y **paridad**: el SVG exportado, dibujado por Chromium, coincide con el PNG pintado por el lienzo.

### 11.4 Importar SVG y PDF
- **Archivo › Abrir** acepta `.svg` (documento nuevo con una mesa del tamaño del dibujo) y `.pdf` (un **Espacio por página**, cada uno con su mesa; hasta 50 páginas). **Archivo › Colocar** y **soltar archivos** aceptan también SVG (un grupo con el nombre del archivo, centrado, un paso de deshacer) y PDF (su primera página).
- **SVG** (`core/io/svg`, lector XML propio porque el core no tiene DOM): trazados con todas sus órdenes (arcos y cuadráticas pasan a cúbicas), rectángulos y elipses como **formas vivas**, líneas y polígonos, grupos, `<use>`, transformaciones, atributos de presentación, `<style>` con selectores simples y `style=""`, colores (hex, `rgb()`, `hsl()`, nombres), degradados lineales y radiales (cajas o espacio de usuario, herencia por `href`, puntos medios), recortes como grupos de recorte, imágenes `data:` incrustadas, texto simple y unidades físicas (mm, cm, in). Lo que no entiende (filtros, máscaras, motivos, `textPath`, imágenes externas, selectores complejos) se avisa al terminar.
- **PDF** (`core/io/pdf` sobre las listas de operadores de **pdf.js**): trazados y trazados compuestos con relleno y trazo, recortes y cajas de formularios como grupos de recorte, degradados axiales y radiales, opacidad y modo de fusión, imágenes (convertidas a PNG) y texto como texto de punto sin la fuente original. El convertidor no depende de pdf.js (se prueba con listas sintéticas); `renderer/import/pdfjs.ts` lo conduce, con el *worker* como recurso aparte y carga perezosa.
- **Exportación**: un relleno y un trazo centrado del mismo contorno salen ahora como **un solo elemento** SVG (como en Illustrator o Inkscape), de modo que la ida y vuelta conserva un objeto por objeto.
- Dependencia nueva: **pdfjs-dist 6.4.299** (Apache-2.0), el lector de PDF de la spec 01.
- Pruebas: 849 unitarias en total (la etapa añade 67), con una **ida y vuelta real** exportar → importar para SVG y para PDF (con pdf.js), y 4 e2e en Electron: abrir SVG, exportar a PDF y reabrirlo (con el *worker* de pdf.js bajo la CSP y desde `file://`), colocar SVG y rechazar un SVG dañado. Encontró un error real: la lista de operadores de pdf.js **no** incluye la transformación de la vista (un rectángulo simétrico lo ocultaba).

### 11.5 Imprimir
- **Archivo › Imprimir…** (Ctrl+P) con diálogo propio y **vista previa vectorial** de cada página (la dibuja el mismo código que imprime): impresora y copias; mesas (activa, del Espacio, de todos los Espacios) con **rango** («1-3, 5»); papel (A5, A4, A3, Carta, Oficio, Tabloide o medida propia) y orientación (automática según la mesa, vertical, horizontal); escala (**100 %**, ajustar a la página, personalizada); **posición** en una cuadrícula 3 × 3; **marcas de corte** (occidentales o japonesas, grosor y desplazamiento) y sangrado. Avisa cuando el dibujo no cabe en la página. Recuerda lo último elegido.
- **Cómo se imprime** (cambio respecto a la spec): cada página es un **SVG a tamaño real** (1 unidad = 1 pt) que una ventana oculta de Chromium muestra con `@page` del tamaño del papel y sin márgenes; de ahí sale a la impresora (`webContents.print`, silencioso, con el tamaño de página en micras), en Windows y en Linux (CUPS), con `lp -o fit-to-page=false` como respaldo en Linux. Se descartó el PDF de la spec 08 porque el visor de PDF de Chromium decide márgenes y escala y no se puede comprobar; así el resultado es **vectorial, con sombras y efectos**, y verificable.
- Maquetación pura en `core/export/print.ts` (papel, escala, posición, marcas, rango) con 12 pruebas; validación del trabajo y HTML en `main/printJob.ts` (22 pruebas con el resto del proceso principal). El proceso principal solo acepta impresoras que el sistema lista y trabajos de tamaño acotado.
- Punto de prueba: con `VICTORIA_PRINT_TO_PDF=<archivo>` no se imprime, se escribe el PDF que Chromium habría impreso (y se ofrece una «impresora» de pruebas), lo que permite verificar el tamaño en máquinas sin impresora.
- Pruebas: 878 unitarias en total (la etapa añade 29) y 3 e2e en Electron que **leen de vuelta el PDF que produce Chromium**: un cuadrado de 100 mm mide 100 mm en una página A4 al 100 % y está donde estaba en la mesa; las marcas y la posición desplazan el dibujo lo esperado; el diálogo valida el rango y avisa del desborde.

### 11.6 Recortar, vínculos y resolución
- **Recortar imagen** (Propiedades › Imagen): no destructivo. La imagen pasa a un grupo de recorte con una máscara rectangular que sigue su rotación y escala; los cuatro bordes se mueven con campos numéricos (en las unidades del documento) y cada cambio se puede deshacer. **Aplicar recorte** corta de verdad los píxeles (a píxeles enteros, sin remuestrear, PNG sin pérdida) y deja una imagen más pequeña en el mismo lugar y escala; **Quitar recorte** devuelve la imagen entera. Lo hace `core/commands/crop.ts`; el corte de píxeles es lo único que usa el lienzo (`renderer/canvas/cropBitmap.ts`).
- **Máscara de recorte** (Ctrl+7 / Alt+Ctrl+7) ya existía para cualquier objeto y se reutiliza.
- **Incrustar / Desincrustar / Reubicar** (`core/commands/link.ts`): Desincrustar guarda la imagen en un archivo elegido y la vincula a él; el `.vict` deja de llevar sus bytes (solo viaja lo que alguna imagen incrustada usa). Al abrir, las imágenes vinculadas se leen del disco (`readLinkedImage`: solo rutas absolutas de PNG/JPEG/WebP de tamaño razonable); si el archivo cambió se ve su contenido actual, y si falta se dibuja el marcador y se avisa una vez. Reubicar apunta todas las imágenes rotas con la misma ruta al nuevo archivo.
- **ppp efectivos** en Propiedades (en rojo por debajo de 150) y aviso en el diálogo de Imprimir con el número de imágenes que saldrían con menos de 150 ppp a la escala elegida.
- Sin dependencias nuevas. Pruebas: 8 unitarias de núcleo y 2 e2e (recortar → aplicar → deshacer → quitar; desincrustar → incrustar).

### 11.7 Calco de imagen
- **Propiedades › Calco de imagen**: con una imagen seleccionada, **Calcar** la convierte en un **grupo vivo** de trazados de colores planos, en el mismo lugar, tamaño, opacidad y modo de fusión (`GroupNode.trace` guarda la imagen de origen y los ajustes; no hace falta un tipo de objeto nuevo, así que lienzo, exportación, portapapeles e importación lo tratan como un grupo más). Con el grupo seleccionado se ven los ajustes: los 11 preestablecidos (Alta y Baja fidelidad, 3, 6 y 16 colores, Tonos de gris, Blanco y negro, Silueta, Arte lineal, Dibujo técnico, Logotipo), modo (color, grises, blanco y negro), colores (2–30), umbral, ruido, esquinas, ajuste de trazados, método (superpuesto o contiguo) e ignorar blanco. Cada cambio vuelve a calcar (un paso de deshacer). **Expandir** deja los trazados y corta el vínculo.
- **Worker con progreso y Cancelar**: el cálculo corre en un Web Worker (`renderer/trace`); la barra muestra el avance por capas y Cancelar lo detiene al instante. Las imágenes de más de 1 600 px se calcan desde una copia reducida y los trazados se escalan de vuelta.
- **Algoritmo propio en `core/trace`** (TypeScript puro, se prueba en Node): cuantización en Lab con k-means sembrado por puntos lejanos (determinista) → una máscara por color → contornos de los bordes de los píxeles, con agujeros y despeckle (ruido) → simplificación Ramer-Douglas-Peucker → curvas Bézier, con esquinas vivas o suavizadas según el umbral de esquinas. Los colores se apilan (sin huecos) o quedan contiguos.
- **Decisión sobre la dependencia**: la spec pedía potrace en WASM, pero potrace (y su portación a JS) es **GPL-2.0**, incompatible con distribuir Victoria con otra licencia; por eso no se añade ninguna dependencia y el trazador es propio. No reproduce las curvas óptimas de potrace (son algo menos compactas), pero cumple el criterio de aceptación con margen.
- Pruebas: 8 del trazador (disco, anillo con agujero, cuadrado con 4 esquinas y sin manijas, ruido, colores apilados y contiguos, transparencia y blanco, progreso y cancelación), 2 de comandos (reemplazo, nuevo calco, Expandir, ida y vuelta por `.vict`) y 1 e2e en Electron que ejecuta el Worker real bajo la CSP. **Un logotipo de 1 000 px se calca en ~1,1 s** (criterio: < 3 s).

### Pendiente
- Calco de imagen: faltan las **vistas** (resultado con contornos, contornos, imagen original), ajustar curvas a líneas, trazos en lugar de rellenos y la lista de colores editable del panel; las curvas no son las óptimas de potrace.
- Imprimir: **no hay verificación con una impresora física ni con el controlador del sistema** (solo con el PDF de Chromium): la regla «100 mm = 100 mm en papel» sigue siendo de comprobación manual en Windows y en Linux. Falta «Imprimir capas visibles e imprimibles / todas» (el modelo no tiene aún el atributo «imprimible» de las capas), «propiedades de la impresora» del sistema y fusionar varias mesas en un pliego. De 11.6 queda: tiradores de recorte directamente en el lienzo (hoy son campos numéricos o la herramienta de selección directa sobre la máscara) y vincular al colocar.
- Colocar con clic o arrastre y cola de varias imágenes; Incrustar/Desincrustar y reubicar vínculos; miniaturas de Espacios con imágenes reales.
- Importar: texto en trazado (`textPath`), máscaras, filtros y motivos de SVG; en PDF, texto con su fuente real, máscaras de transparencia, motivos de mosaico y el operador `sh`; el texto de PDF llega como texto de punto negro con la fuente por defecto; imágenes de PDF solo tras decodificar con canvas (no verificado con PDFs reales de otros programas).
- Portapapeles: no se escriben todavía SVG ni PNG para otras aplicaciones; sin verificar en Wayland.
- Exportación: el PDF no lleva sombras ni transparencia de degradados; la paridad lienzo/SVG está probada con el documento de demostración, no con texto en trazado (la paridad de texto en PDF queda por comprobar con un visor); opacidad de grupo aproximada como en el lienzo (por forma, no como grupo); sin barra de progreso cancelable; sin perfiles de color (RGB).
- Transformación libre: los modos de distorsión usan la caja alineada con los ejes (con un objeto girado, Ctrl+esquina no distorsiona); las curvas se deforman moviendo anclas y manejadores (aproximación, como Illustrator); los botones del widget son glifos dibujados en el lienzo, sin tooltip propio (el nombre aparece en la etiqueta de medida).
- Etapas 11.3 a 11.7 (ver el plan). Sin verificar: Linux y el instalador de Windows.
- Ya fallaba antes de esta fase: el e2e «Ctrl+rueda hace zoom en el cursor» (canvas.spec.ts) no encuentra el píxel oscuro esperado tras el zoom.

## Fase 10 — Espacios, interfaz completa (en revisión)

### Añadido
- **Panel Espacios**: lista con miniatura (el renderizador del lienzo), color, nombre, número de mesas y objetos, ojo de exportación y atajo; clic para ir, doble clic para renombrar; Nuevo, Duplicar, Subir, Bajar y Eliminar.
- **Mover a Espacio** (Objeto, clic derecho en el lienzo y «Mover selección aquí» en la pestaña): conserva coordenadas, un solo paso de deshacer, y «Nuevo Espacio…» crea el destino en el mismo paso.
- **Menú contextual del lienzo** con Agrupar, Desagrupar, Traer al frente, Enviar al fondo y Mover a Espacio.
- **Barra de Espacios**: reordenar pestañas arrastrando. **Propiedades del Espacio**: cuadrícula (tamaño, subdivisiones) y color del lienzo.
- **Atajos**: Alt+1…9 (ir al Espacio n; Ctrl+Alt+2, 3 y 7 ya son de Illustrator) y Ctrl+Mayús+RePág/AvPág (Espacio anterior/siguiente, el mismo en Windows y Linux); Ventana › Espacios.
- **Alcance de exportación** en el núcleo (`exportTargets`: mesa activa, mesas del Espacio, todos los Espacios sin los excluidos); la interfaz de exportar e imprimir llega en la Fase 11.
- Pruebas: un documento de 3 Espacios guardado y reabierto, deshacer entre Espacios, mover a Espacio nuevo, alcance de exportación y e2e del panel, atajos, menús y propiedades.

### Pendiente
- Exportar/imprimir por Espacio solo existe como función del núcleo (Fase 11). Sin verificar: Linux y el instalador de Windows.

## Fase 9 — Modificadores (en revisión)

### Añadido
- **Registro de modificadores** (`core/modifiers`): funciones puras y deterministas (los aleatorios, con semilla guardada), un `schema` por modificador que genera su diálogo y una evaluación cacheada por nodo.
- **Catálogo v1 (17)**: Desplazar trazado, Contornear trazo, Buscatrazos vivo (Unir, Menos frente, Intersecar, Excluir), Redondear esquinas, Zigzag, Fruncir y engordar, Hacer áspero, Transformar, Arco, Bandera, Onda, Inflar, Sombra paralela y Resplandor exterior; el resto del menú Modificador aparece con la etiqueta «v2».
- **Panel Apariencia** (Mayús+F6): lista de relleno, trazo y modificadores con ojo, doble clic para editar, subir/bajar, duplicar, eliminar; botones de añadir trazo y relleno, **fx**, borrar apariencia y aplicar. Botón fx también en Propiedades.
- **Menú Modificador** funcional por categorías, **Aplicar último modificador** (Mayús+Ctrl+E) y **Último modificador…** (Alt+Mayús+Ctrl+E); **Objeto › Aplicar modificadores** (Alt+Ctrl+E).
- **Diálogo generado por esquema** con Previsualizar (un solo paso de deshacer; Cancelar lo revierte), rueda y expresiones aritméticas en los campos.
- **Buscatrazos vivo**: Alt+clic en un modo de forma del panel Buscatrazos; «Expandir» ya funciona.
- El pintado y la selección por clic usan la geometría evaluada; las sombras y resplandores se pintan en el lienzo; los modificadores se guardan en el `.vict`.
- Dependencias: `paper` ya estaba (Fase 8). Se probó `clipper2-js` para el desplazamiento y se descartó (resultados erróneos); el desplazamiento es propio sobre paper.js.
- Pruebas: instantáneas de geometría por modificador, órdenes, Aplicar, Buscatrazos vivo, persistencia y 4 e2e.

- **Zonas** (ajuste posterior): los modificadores se aplican a un relleno o trazo concreto (anidados bajo él) o a **Todo el objeto** (etiqueta bajo los rellenos), y se arrastran entre zonas; las sombras se proyectan desde el relleno y el contorno del objeto entero.

### Decisiones y aproximaciones (spec 05 · «Reglas añadidas en la Fase 9»)
- La caja delimitadora y la alineación usan los contornos originales; el pintado y la selección por clic, los evaluados.
- Fruncir/engordar, Hacer áspero, las deformaciones, la sombra (sin modo de fusión) y el resplandor son aproximaciones propias: la spec no da fórmulas, hay que compararlas con Illustrator a mano.
- Al aplicar, la sombra pasa a ser un objeto aparte **sin desenfoque** y el resplandor se pierde.

### Pendiente
- Preajustes de modificadores, preferencia de límites de previsualización, los modificadores v2 y Contornear objeto; exportación SVG/PDF de los efectos (Fase 11).
- Sin verificar: Linux y el instalador de Windows; rendimiento solo medido en Windows (modificadores con miles de objetos sin medir).

## Fase 8 — Construcción de formas (en revisión)

### Añadido
- **Panel Buscatrazos** (Mayús+Ctrl+F9): Unir, Menos frente, Intersecar, Excluir, Dividir, Recortar, Combinar, Cortar, Contorno y Menos detrás sobre la selección (grupos incluidos, objetos transformados), cada uno en un paso de deshacer.
- **Creador de formas (Mayús+M)**: regiones de la selección con resaltado de puntos, clic = regiones independientes, arrastrar = unir, Alt = eliminar.
- **Motor booleano** con **paper.js** en `core/geometry/booleans.ts`, que mantiene las curvas Bézier (unir dos círculos da 8 nodos, no un polígono; tres círculos dan las 7 regiones del diagrama de Venn).
- Dependencia nueva: `paper` 0.12 (MIT), ya prevista en el stack; el core sigue probándose en Node.
- Pruebas: 646 → 667 unitarias (la fase añade 21) y 3 e2e nuevos.

### Pendiente
- Buscatrazos vivo (Alt+clic) y «Expandir»: dependen de los modificadores (Fase 9); hoy Alt+clic aplica la operación normal.
- Contorno duplica los bordes compartidos; opciones del Creador de formas y eliminar aristas abiertas con Alt.
- Sin verificar: Linux y el instalador de Windows; el rendimiento solo se midió en Windows (20 círculos solapados → 111 regiones en ~0,2 s); con cientos de objetos puede notarse.

## Lector de EPS simples (entre las fases 7 y 8)

### Añadido
- **Archivo › Abrir** ahora lista también `.eps` / `.epsf`: un EPS simple se abre como documento nuevo sin guardar, con una mesa del tamaño de su `%%BoundingBox`. Lee trazados, colores (gris, RGB, CMYK), trazos y guiones, regla par-impar, recorte, transformaciones, procedimientos y flujo de control PostScript, el dialecto compacto de Illustrator AI3–AI8 (grupos, trazados compuestos, grupos de recorte) y la cabecera DOS EPS. Intérprete propio en `core/io/eps.ts`, sin dependencias nuevas.
- Lo que no entiende (texto, imágenes, degradados, motivos, `arc`) se omite y se avisa al abrir; un programa que no termina o es enorme se corta con límites de seguridad conservando lo dibujado.
- Pruebas: 12 del intérprete y 1 de apertura (el EPS se probó solo con archivos escritos a mano: **falta probarlo con EPS reales** de Illustrator, Inkscape y Cairo).

### Decisiones (spec 08)
- AI queda para mucho después; EPS exóticos y guardar EPS, para otra oportunidad; no se distribuye Ghostscript.
- Reglas del dialecto AI supuestas sin especificación (regla par-impar con `1 D`, tinte de color personalizado, subtrazados con `n`): verificar con archivos reales.

## Fase 7 — Texto (en revisión)

### Añadido
- **Herramientas de texto**: Texto (T, clic = punto, arrastre = área), Texto de área (clic en trazado cerrado) y Texto en trazado (clic en trazado abierto o cerrado). Se escribe en una entrada oculta del lienzo (acentos, IME y portapapeles funcionan); cursor parpadeante, selección por arrastre, doble clic = palabra, triple = párrafo, flechas / Inicio / Fin / Ctrl+flechas con Mayús, Alt+←→ tracking, Alt+↑↓ interlineado, Ctrl+Mayús+< > tamaño, copiar/cortar/pegar con estilo. Una ráfaga de escritura es un paso de deshacer; Esc vuelve a Selección.
- **Motor de texto** en `core/text`: layout (párrafos, ajuste de línea, kerning, tracking, escalas, versalitas, super/subíndice, subrayado, tachado, sangrías, espaciado, justificación), texto en trazado con los 5 efectos, alineación, espaciado y voltear, geometría compartida, **Crear contornos** (Mayús+Ctrl+O).
- **Fuentes del sistema**: listado en el proceso principal (tablas `name` de sfnt, fontconfig en Linux), carga bajo demanda con opentype.js; se resuelven por familia + estilo.
- **Paneles Carácter (Ctrl+T) y Párrafo (Alt+Ctrl+T)** con selector de fuente (búsqueda, vista previa en la propia fuente, favoritas y recientes), estilo, tamaño, interlineado, kerning, tracking, escalas, línea base, rotación, mayúsculas/versalitas/super/subíndice/subrayado/tachado, idioma, alineación y justificación, sangrías, espaciado y guionado. Valores mixtos en blanco.
- **Selección**: doble clic sobre texto lo edita; círculo de conversión punto ↔ área; tres corchetes del texto en trazado (inicio, fin, centro que desliza y voltea); escalar un texto de área cambia el marco, no la fuente.
- Menú Texto: Crear contornos y Opciones de texto en trazado (diálogo con efecto, alineación, espaciado y voltear).
- Pruebas: 633 unitarias en total (la fase añade 19 en el cliente y 40 en el core) y 5 e2e de texto con fuentes reales del sistema.

### Decisiones tomadas (detalladas en la spec 07 · «Reglas añadidas en la Fase 7»)
- El marco o trazado viaja dentro del objeto y sustituye al trazado original; un texto vacío se elimina; Esc vuelve a Selección.
- Se prefieren los nombres de fuente en inglés (Windows en español lista «Negreta»).
- Los paneles actúan sobre el rango editado, los siguientes caracteres (cursor sin selección), los textos seleccionados o los valores por defecto.

### Pendiente
- Opciones de texto de área (columnas, márgenes, alineación vertical): el menú está desactivado. Ligaduras. Diálogo «Buscar fuente» (solo hay resaltado rosa). Incrustar fuentes en `.vict`. Sección de texto en Propiedades. El guionado es una heurística simple.
- **Paridad con SVG y PDF**: los exportadores son de la Fase 11; hoy se verifica por geometría compartida (lienzo y contornos), no con archivos exportados.
- Sin verificar: Linux (listado con fontconfig y carga de fuentes), el instalador de Windows (`spawn EPERM`); rendimiento solo medido en Windows.

## Fase 6 — Color, trazo y paneles principales (en revisión)

### Añadido
- **Relleno y color**: superposición relleno/trazo (barra de herramientas y panel) con intercambiar, valores por defecto y los botones Color / Degradado / Ninguno (atajos D, X, Mayús+X, `,` `.` `/`); modelos RGB, HSB, CMYK y grises con deslizadores de su propio degradado, HEX, rampa de color, cuentagotas de pantalla, colores recientes, opacidad y modo de fusión; **selector de color completo** con vista previa en vivo y «solo colores web». Un arrastre de deslizador es un solo paso de deshacer.
- **Aspecto actual**: los objetos nuevos nacen con el relleno y el trazo actuales (las herramientas de dibujo y el diálogo de formas lo usan); la barra de control edita relleno, trazo, grosor y opacidad.
- **Valores mixtos**: todos los paneles muestran el valor compartido o dejan el campo vacío.
- **Muestras**: cuadrícula/lista, grupos, globales, nueva desde la selección, opciones, eliminar, importar `.gpl` y `.ase`, biblioteca básica (29).
- **Degradado**: panel con tipo, ángulo, relación de aspecto, barra de paradas (añadir, mover, quitar arrastrando hacia abajo, puntos medios), color y opacidad por parada, invertir; **herramienta Degradado (G)** con anotador sobre el objeto; el radial se pinta como elipse. Editar copia el degradado si lo comparten otros objetos.
- **Trazo completo**: grosor, extremos, esquinas, límite de inglete, alinear trazo, línea discontinua (6 valores y alineación a esquinas), 7 puntas de flecha (escala y alineación), 7 perfiles de ancho con voltear.
- **Alineación** (alinear, distribuir, objeto clave, mesa, límites de previsualización) y **Espaciado** (espacio exacto o auto, indicador, rejilla, ajustar a mesa con margen), con su geometría pura en `core/layout`.
- **Transformar** (X/Y/An/Al con punto de referencia, ángulo, distorsión, reflejar, «escalar trazos y efectos» en todo escalado) y parámetros de **formas vivas**; **Capas** (árbol con ojo, candado, nombre editable, destino, selección, arrastrar para reordenar, capa activa, máscaras de recorte, localizar, eliminar); **Propiedades** contextual; **Cuentagotas (I)**.
- Core: conversión entre modelos de color, lectura de valores mixtos, comandos de apariencia (`setPaint`, `patchStroke`, `editGradients`, `copyAppearance`, `scaleStrokeWidths`…), geometría de degradados, flechas, perfiles y recorte de trazos, importadores de paletas, `translateNodes`, `combineCommands`.
- Pruebas: 545 unitarias y 81 e2e en total (la fase añade 94 unitarias y 13 e2e).

### Decisiones tomadas (la spec no las cubría; detalladas en la spec 06 · «Reglas añadidas en la Fase 6»)
- El aspecto actual vive en la interfaz y adopta el del último objeto seleccionado.
- «Escalar trazos y efectos» desactivado por defecto (como Illustrator).
- Las paradas del anotador del degradado cuelgan 14 px bajo el eje para no tapar el origen y el final.
- Un perfil de ancho no se combina con guiones; las puntas de flecha recortan el trazo.
- Editar el color de un objeto que usa una muestra lo hace sólido.
- Se corrigió un fallo heredado de los campos numéricos: con 0 decimales los enteros acabados en cero perdían sus ceros («100» se veía «1»).

### Pendiente
- Degradado aplicado a lo largo o a través del trazo; los degradados de trazo usan una aproximación circular.
- Panel Apariencia (Fase 9), Carácter y Párrafo (Fase 7), Buscatrazos (Fase 8), Espacios y Mesas (Fase 10), Calco (Fase 11): sus pestañas siguen vacías.
- Miniaturas reales en Capas y arrastrar objetos dentro de grupos; «Aislar» y ajustes finos de la columna de paneles.
- Portapapeles, «Previsualizar píxeles» y Transformación libre siguen sin implementar.
- Lo no verificado de la Fase 1 (instalador de Windows, Linux) sigue sin verificar; el rendimiento solo se midió en Windows. La sensación de uso de los paneles frente a Illustrator es de revisión manual.

## Fase 5 — Dibujo (en revisión)

### Añadido
- **Pluma (P)** con los 11 puntos de la spec 03: clic = esquina, arrastre = suave simétrico, Alt (rompe y se mantiene roto), Espacio (mueve el ancla) y Mayús (45°) durante el arrastre; clic sobre el último ancla retrae el manejador y arrastrar crea uno independiente; banda elástica; cerrar con clic o arrastre; terminar con Esc, Intro o Ctrl+clic; continuar y unir trazados abiertos; añadir/eliminar automático sobre el trazado seleccionado; Ctrl = Selección directa y Alt sobre un ancla = Convertir; seis cursores con insignia. **Cada ancla es un paso de deshacer** (Ctrl+Z quita el último punto).
- **Añadir (+), Eliminar (−) y Convertir ancla (Mayús+C)**, **Curvatura (Mayús+~)** (spline Catmull-Rom en Béziers editables), **Lápiz (N)** (ajuste de curvas de Schneider; continúa y une trazados) y **Tijeras (C)**.
- **Formas vivas**: rectángulo (M), rectángulo redondeado, elipse (L), polígono, estrella y línea (\) con Alt/Mayús/Espacio, ↑/↓ (lados y puntas) y Ctrl (radio interior); un clic abre el diálogo de dimensiones exactas. Un arrastre es un único paso de deshacer.
- **Widgets**: círculos de esquina de rectángulos, polígonos y estrellas (todas las esquinas, Alt = una; Alt+clic cicla redonda/invertida/chaflán), tiradores de tarta de la elipse y **esquinas vivas de trazados** (`Anchor.cornerRadius`, aplicado a la geometría sin tocar las anclas).
- **Acciones sobre anclas**: Suprimir elimina las anclas seleccionadas; Unir (Ctrl+J: cerrar, unir dos extremos o encadenar); Promediar (Alt+Ctrl+J, con diálogo de eje); cortar en el ancla, convertir a esquina/suave y mostrar/ocultar manejadores en la barra de control.
- **Core** (`core/geometry/anchors.ts`, `fit.ts`): insertar, eliminar, convertir, cortar, unir, cerrar, invertir, promediar, curvatura, esquinas vivas y ajuste de curvas; comandos `editPaths`, `replaceNode(s)`, `joinPathNodes`, `setPathGeometry`, `redrawShape`; fábricas `createPolygon`, `createStar`, `createLine`.
- La barra de herramientas **recuerda si estaba en 1 o 2 columnas** entre sesiones (preferencia de interfaz en `localStorage`, nunca datos del documento).
- Pruebas: 447 unitarias y 67 e2e en total (la fase añade 121 unitarias y 8 e2e). La Pluma tiene pruebas de máquina de estados para cada regla; hay pruebas del corazón, la gota y el engranaje, y un e2e que dibuja el corazón con la Pluma.

### Decisiones tomadas (la spec no las cubría; detalladas en la spec 03 · «Reglas añadidas en la Fase 5»)
- Las herramientas de ancla convierten las formas vivas **sin aviso** (el aviso es de Selección directa).
- Fidelidad del Lápiz fija en 2,5 px de pantalla y añadir/eliminar automático de la Pluma siempre activo hasta que exista Preferencias.
- Promediar: «Horizontal» = misma Y, «Vertical» = misma X.
- Los objetos se crean en la capa del objeto seleccionado o, si no hay selección, en la capa visible y desbloqueada más alta (no hay aún «capa activa»; llegará con el panel Capas, Fase 6).
- Un widget de polígono o estrella gobierna todos los vértices con un solo círculo.

### Pendiente
- Dibujar dentro de un grupo aislado crea el objeto en la capa, no dentro del grupo.
- Lápiz: editar/redibujar el tramo central de un trazado; Suavizar, Borrador de trazado y Pincel de manchas (v2).
- Arco y Espiral (v2); Cuchilla (v2).
- Las esquinas vivas de trazados solo redondean anclas de esquina entre segmentos rectos.
- Preferencias (fidelidad del Lápiz, añadir/eliminar automático, paso de flechas).
- Portapapeles, «Previsualizar píxeles» y Transformación libre siguen sin implementar (Fases siguientes).
- Lo no verificado de la Fase 1 (instalador de Windows, Linux) sigue sin verificar; el rendimiento solo se midió en Windows. La prueba manual guiada (corazón, gota, engranaje «sin sorpresas para alguien habituado a Illustrator») es del usuario: lo automatizado cubre la mecánica, no la sensación.

## Fase 4 — Selección y transformación (en revisión)

### Añadido
- **Core**: evaluador aritmético sin `eval` (`+ - * / ^`, paréntesis, coma o punto decimal, unidades como `2 cm + 5 mm`), marcos y límites en coordenadas del mundo, consultas de marco y de lazo, matemática de manijas y segmentos (`moveHandle`, `reshapeSpan`), motor de imán (guías, cuadrícula, mesas, objetos y puntos de ancla con prioridad guía < ancla < borde/centro < mesa < cuadrícula) y modelo de selección de puntos de ancla. Comandos nuevos: `setPathAnchors`, `convertShapeToPath`, `duplicateNodes`, `setAllNodesProps`, `ungroupNodes`; `session.rollback()`.
- **Selección (V)**: clic, Mayús, marco (toca o contiene), mover con Mayús a 45°, Alt+arrastre duplica, flechas (Mayús = 10 pt), caja con escala y rotación, aislamiento de grupo con doble clic y barra de aislamiento, bloqueados y ocultos respetados.
- **Selección directa (A)** y **Lazo (Q)**: puntos de ancla, manijas con las reglas de Illustrator (suave conserva colinealidad y longitud, Alt rompe a esquina, Mayús a 45°), remodelar segmentos arrastrándolos, marco de anclas, y aviso de «convertir forma viva a trazado» como un solo paso de deshacer.
- **Rotar (R), Escala (S), Reflejar (O)** con origen por clic, Alt+clic abre el diálogo, Alt+arrastre copia, Mayús restringe; **Ctrl+D** repite la transformación; menú Objeto › Transformar (Mover, Rotar, Escala, Reflejar) con diálogo y vista previa.
- **Guías inteligentes e imán** con etiquetas (alinear, centro, ancla) y medidas.
- **Barra de control**: X/Y/An/Al reales con punto de referencia y proporciones enlazadas, ángulo, y campos de punto de ancla. Campos numéricos (`NumberInput`) con rueda, flechas y expresiones.
- Menú Objeto y Selección: agrupar, desagrupar, bloquear, ocultar, mostrar todo, desbloquear todo, organizar, seleccionar todo / nada / de nuevo / en la mesa.
- Pruebas: 326 unitarias y 59 e2e en total (la fase añade 134 unitarias y 7 e2e).

### Decisiones tomadas (la spec no las cubría)
- El cuadro de selección usa los límites geométricos (sin trazo); Alt+clic con herramientas de transformación fija el origen y abre el diálogo.
- El lazo selecciona puntos de ancla, no objetos completos.
- Un campo numérico no confirma dos veces al pulsar Intro (corregido durante la fase: el desenfoque repetía la orden).

### Pendiente
- Portapapeles (copiar/pegar) no implementado.
- Eliminar, convertir, cortar, unir y promediar anclas, y los widgets de esquina viva, pasan a la Fase 5; «Previsualizar píxeles» sigue sin implementar; la herramienta Transformación libre (E) queda inactiva.
- Opacidad de grupo aproximada (ver Fase 3).
- Lo no verificado de la Fase 1 (instalador de Windows, Linux) sigue sin verificar; el rendimiento solo se midió en Windows.

## Fase 3 — Lienzo (en revisión)

### Añadido
- **Geometría en el core** (`src/core/geometry`): formas vivas convertidas a contornos Bézier (rectángulo con esquinas redondas, chaflán o invertidas, elipse y sector, polígono, estrella, línea), extremos exactos de cada curva, aplanado con tolerancia, límites con trazo y con transformaciones, y caché por objeto inmutable.
- **Índice espacial** (`rbush`) por Espacio, reconstruido solo cuando el Espacio cambia, y **hit-testing**: relleno y contorno, huecos de trazados compuestos (par-impar y no cero), alineación del trazo (centro, dentro, fuera), tolerancia de 4 px, rotación y escala, grupos (devuelve la cadena de grupos y el objetivo de selección), máscaras de recorte, subcapas, y objetos ocultos o bloqueados excluidos. 10 000 objetos: construcción del índice < 500 ms y hit-test medio < 2 ms (prueba automatizada).
- **Viewport** (`src/core/viewport`): zoom en el cursor, desplazamiento, escalera de zoom de Illustrator, ajustar a un rectángulo, marco de zoom; 3 %–64 000 %.
- **Renderer Canvas 2D**: mesas con sombra, borde activo, sangrado, marcas de centro y seguridad de vídeo, nombre de mesa; rejilla con subdivisiones; relleno y trazo con extremos, uniones, discontinuas y alineación; degradados y muestras; opacidad y modos de fusión; grupos y máscaras de recorte; **modo Contorno** (Ctrl+Y) con el color de capa; HiDPI. Dos capas: contenido (se repinta si cambia algo) y superposición (guías, resaltado, vistas previas de herramientas).
- **Rendimiento**: recorte por visibilidad y `Path2D` en caché por objeto. Medido con 10 000 objetos visibles: repintado completo ≈ 36 ms; durante pan y zoom el lienzo reutiliza el último mapa de bits y repinta con precisión 110 ms después, con **16,7 ms por fotograma de media (p95 17,3 ms)** en pan y en zoom (prueba e2e automatizada).
- **Interacción**: rueda = desplazamiento vertical, Mayús+rueda = horizontal, Ctrl+rueda (o pellizco) = zoom en el cursor, Espacio = mano temporal, botón central = mano; herramientas **Mano** (H) y **Zoom** (Z: clic acerca, Alt+clic aleja, arrastre = marco); máquinas de estado con pruebas. Las herramientas de selección resaltan el objeto bajo el cursor con el color de su capa (la selección llega en la Fase 4).
- **Reglas** dibujadas en Canvas con origen en la mesa activa, en las unidades del documento (pt, px, mm, cm, in) y marcas 1·2·5; **guías**: se crean arrastrando desde una regla, se mueven, se borran al devolverlas a la regla, se pueden ocultar (Ctrl+;) y bloquear (Alt+Ctrl+;), y todo es deshacible. Cada Espacio guarda y restaura su propia vista y se abre ajustado la primera vez.
- **Menú Ver y atajos** funcionales: Contorno, acercar/alejar, ajustar mesa/todo, 100 %, reglas, guías, bloquear guías, cuadrícula, ocultar mesas. (Ajustar a cuadrícula, guías inteligentes y ocultar bordes guardan su estado pero actúan en la Fase 4; Previsualizar píxeles no está implementado.)
- **Barra de estado**: zoom editable y con la escalera de valores, navegador de mesas con lista, coordenadas del cursor en las unidades del documento.
- Documentos de ejemplo `samples/demo.vict` (4 mesas inspiradas en la maqueta) y `samples/stress-10k.vict`; `pnpm samples:gen` los regenera con el core.
- Pruebas: 192 unitarias y 52 e2e en total (la fase añade unas 56 unitarias y 18 e2e).

### Decisiones tomadas (la spec no las cubría)
- No se añadió `bezier-js`: el aplanado, los límites exactos y las distancias son unas decenas de líneas propias con pruebas. Se reconsidera para proyecciones en la Fase 5.
- Opacidad de grupo aproximada: se multiplica por hijo (los hijos que se solapan no se componen como una unidad). Se corrige con una capa fuera de pantalla cuando haga falta.
- Los degradados radiales con escalado no uniforme se aproximan (círculo en lugar de elipse).
- Convenciones geométricas, de color y de selección documentadas en la spec 02. El rango de colores `gray` es «% de negro».
- Color de la rejilla: gris medio translúcido para verse sobre la mesa blanca y sobre el lienzo en ambos temas.

### Pendiente
- Texto e imágenes no se dibujan (Fases 7 y 11; las imágenes muestran un marcador).
- Los modificadores no se evalúan al pintar (Fase 9).
- Lo no verificado de la Fase 1 (instalador de Windows, Linux) sigue sin verificar; el rendimiento solo se midió en Windows.

## Fase 2 — Core del documento (en revisión)

### Añadido
- **Modelo** (`src/core/model`): documento → Espacios → mesas, guías, cuadrícula y capas → nodos (trazado, compuesto, forma viva, grupo, máscara, texto, imagen), apariencia, recursos (muestras, degradados, imágenes, fuentes, preajustes). Presets de mesa en pt (1 px = 1 pt). Fábricas, consultas, clonado con ids nuevos y matrices.
- **Comandos con Immer** (`src/core/commands`): cada comando es un dato + receta; `DocumentSession` guarda parches e inversos, fusiona pasos con `mergeKey`, límite de historial configurable (200), selección por paso, `dirty` respecto al último guardado y notificación de cambios. Deshacer/rehacer cruza Espacios y trae al frente el Espacio de la acción (regla 4 de la spec 04). Cambiar de Espacio, zoom y desplazamiento no son pasos del historial.
- **Subcapas**: `Layer.children` admite objetos y capas en una sola lista ordenada en z (`Layer.type = 'layer'`). Comandos `addLayer` (con capa madre), `moveLayer` (sin ciclos), `reorderLayer`, `removeLayer` y `updateLayer` sobre cualquier nivel; los objetos, la selección, el clonado y las muestras recorren las subcapas. Formato `.vict` versión 2 con migración 1 → 2 (los archivos y autoguardados anteriores se abren). Spec 02 actualizada.
- 40 comandos: documento, Espacios (añadir, eliminar, renombrar, color, excluir, duplicar, reordenar, guías, cuadrícula), mesas, capas, objetos (añadir, eliminar, transformar, propiedades, apariencia, organizar, agrupar, mover a capa/Espacio) y recursos.
- **Selección** (`src/core/selection`): seleccionar, añadir, alternar, todo, poda de ids.
- **Formato `.vict`**: ZIP con `manifest.json`, `document.json`, imágenes, fuentes y miniatura; validación estructural con la ruta del error (ids únicos, números finitos, Espacio activo existente…), migraciones por versión y rechazo de archivos de versión futura.
- **Autoguardado**: política pura (60 s, solo con cambios) en el core; en main, escritura atómica (temporal + renombrado) en `<userData>/autosave/<docId>.vict`; se borra al guardar, al volver al estado guardado o al cerrar limpio; al arrancar se ofrece recuperar; al cerrar la ventana main espera a que el renderer vuelque los cambios pendientes.
- **Interfaz conectada a documentos reales**: pestañas de documento (nuevo, abrir, guardar, guardar como, cerrar con aviso de cambios), barra de Espacios (crear, seleccionar, renombrar en línea, color, excluir de exportación, duplicar, eliminar con confirmación si hay contenido), Deshacer/Rehacer con su etiqueta (Ctrl+Z, Mayús+Ctrl+Z), Ctrl+N/O/S/W, Ctrl+Alt+N, diálogos modales y marca de cambios sin guardar. Se eliminaron los datos de ejemplo de pestañas y Espacios.
- IPC tipado para abrir/guardar (solo se guarda sin diálogo en rutas elegidas antes por el usuario) y autoguardado (ids validados).
- Pruebas: 135 unitarias (incluye 5 semillas × 1000 operaciones aleatorias que vuelven al estado inicial, recorrido aleatorio del historial e ida y vuelta `.vict` sin pérdida) y 32 e2e.

### Decisiones tomadas (la spec no las cubría)
- Los comandos no tienen `do/undo` literales: son una receta de Immer y la sesión guarda `patches`/`inversePatches` (como recomienda la spec 02). Su `label` es una clave (`space.add`) que la UI traduce.
- Tipos aprobados por el usuario tal como están, con `GradientStop.midpoint` opcional añadido (punto medio de la spec 06) y `TextStyle` mínimo que crecerá en la Fase 7 con campos opcionales. Definidos aquí: `Gradient`, `Swatch`, `ModifierInstance`, `Guide`, `TextStyle` (familia, estilo, tamaño), `LineParams` (longitud), `FontResource`/`ImageResource`.
- Un documento nuevo es A4 en mm, con Espacio, mesa y capa de nombres en español; el diálogo de Nuevo documento llega en la Fase 12.
- Una mesa y una capa por Espacio como mínimo (como Illustrator); eliminar la última no hace nada.
- Al rehacer también se trae al frente el Espacio de la acción.
- Mover a Espacio, Propiedades de Espacio y reordenar pestañas arrastrando existen en el core o están desactivados en la UI; se completan en las Fases 4 y 10.

### Pendiente
- Lo no verificado de la Fase 1 (instalador de Windows, Linux) sigue sin verificar.
- Abrir un `.vict` desde el sistema (doble clic / argumento), Guardar una copia, miniatura dentro del `.vict` y el hash de imágenes/fuentes (los calculará quien coloque la imagen).


## Fase 1 — Esqueleto (en revisión)

### Añadido
- Proyecto Electron + Vite + React 18 + TypeScript estricto; `contextIsolation`, `sandbox`, sin `nodeIntegration`, CSP estricta por `<meta>`, permisos web denegados, navegación y ventanas nuevas bloqueadas.
- Ventana sin marco con barra de título propia: logotipo, nueve menús con íconos y atajos (`Menu` con submenús y teclado), selector de espacio de trabajo y tres variantes de marco: `native-overlay` (Windows, botones nativos), `custom` (Linux) y `system` (barra del sistema).
- Layout completo de la maqueta (pantalla 3): barra de control, barra de herramientas (grupos, desplegables por clic sostenido de 300 ms o clic derecho, Alt+clic rota, una o dos columnas), pestañas de documento, barra de Espacios con menú contextual, lienzo vacío con reglas, columna de paneles vacíos (pestañas, contraer/expandir, arrastrar entre grupos, tira de íconos con ventana flotante) y barra de estado.
- Tokens oscuro/claro (`src/renderer/styles/tokens.css`), Inter incluida con la app, tooltips con nombre y atajo (500 ms).
- `<Icon>` con los 307 íconos del catálogo de la maqueta (generado con `pnpm icons:gen`; los `custom:` son los de la maqueta).
- Atajos de la spec 09 en `app/shortcuts.ts` (Fase 1 enlaza herramientas y paneles).
- Capa `src/main/platform/` (win32, linux) tras la interfaz común; fuentes e impresión son stubs hasta las Fases 7 y 11.
- Cadenas en `i18n/es.json` (claves tipadas).
- CI con matriz `windows-latest` + `ubuntu-latest` (lint, pruebas, e2e con xvfb, empaquetado) y configuración de `electron-builder` (NSIS + portable; AppImage, deb, rpm).
- Pruebas: 37 unitarias (Vitest) y 22 e2e (Playwright + Electron).

### Pendiente de verificar (no se pudo en la máquina de desarrollo)
- `pnpm build:win`: el empaquetado se detiene con `spawn EPERM` en este entorno; ejecutar fuera del sandbox/antivirus.
- Linux (X11 y Wayland, GNOME/KDE), `pnpm build:linux` y CI: sin probar.

### Decisiones tomadas
- React 18 (CLAUDE.md) y TypeScript 6 (`typescript-eslint` aún no soporta 7).
- Íconos desde el catálogo de la maqueta; no se usa `lucide-react` en esta fase.
- Menús dibujados en HTML (necesitan íconos); sin menú nativo en Windows/Linux.
- Datos de documento/Espacios y valores de la barra de control son de ejemplo (`app/placeholder.ts`), se reemplazan en la Fase 2.
- `VICTORIA_CHROME` (solo desarrollo) fuerza una variante de marco; `VICTORIA_SYSTEM_TITLEBAR=1` activa la barra del sistema en Linux hasta que existan Preferencias.
- Conflicto de spec resuelto en la revisión: `Alt+Ctrl+E` es de «Aplicar modificadores» (maqueta 14); «Exportar para pantallas» queda sin atajo (specs 08 y 09 actualizadas). Las specs 05 y 06 ya no mencionan el arrastre scrubby en campos numéricos.
