# Changelog

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
