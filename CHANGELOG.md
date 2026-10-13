# Changelog

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
