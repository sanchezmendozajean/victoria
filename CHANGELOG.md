# Changelog

## Fase 2 — Core del documento (en revisión)

### Añadido
- **Modelo** (): documento → Espacios → mesas, guías, cuadrícula y capas → nodos (trazado, compuesto, forma viva, grupo, máscara, texto, imagen), apariencia, recursos (muestras, degradados, imágenes, fuentes, preajustes). Presets de mesa en pt (1 px = 1 pt). Fábricas, consultas, clonado con ids nuevos y matrices.
- **Comandos con Immer** (): cada comando es un dato + receta;  guarda parches e inversos, fusiona pasos con , límite de historial configurable (200), selección por paso,  respecto al último guardado y notificación de cambios. Deshacer/rehacer cruza Espacios y trae al frente el Espacio de la acción (regla 4 de la spec 04). Cambiar de Espacio, zoom y desplazamiento no son pasos del historial.
- 40 comandos: documento, Espacios (añadir, eliminar, renombrar, color, excluir, duplicar, reordenar, guías, cuadrícula), mesas, capas, objetos (añadir, eliminar, transformar, propiedades, apariencia, organizar, agrupar, mover a capa/Espacio) y recursos.
- **Selección** (): seleccionar, añadir, alternar, todo, poda de ids.
- **Formato **: ZIP con , , imágenes, fuentes y miniatura; validación estructural con la ruta del error (ids únicos, números finitos, Espacio activo existente…), migraciones por versión y rechazo de archivos de versión futura.
- **Autoguardado**: política pura (60 s, solo con cambios) en el core; en main, escritura atómica (temporal + renombrado) en ; se borra al guardar, al volver al estado guardado o al cerrar limpio; al arrancar se ofrece recuperar; al cerrar la ventana main espera a que el renderer vuelque los cambios pendientes.
- **Interfaz conectada a documentos reales**: pestañas de documento (nuevo, abrir, guardar, guardar como, cerrar con aviso de cambios), barra de Espacios (crear, seleccionar, renombrar en línea, color, excluir de exportación, duplicar, eliminar con confirmación si hay contenido), Deshacer/Rehacer con su etiqueta (Ctrl+Z, Mayús+Ctrl+Z), Ctrl+N/O/S/W, Ctrl+Alt+N, diálogos modales y marca de cambios sin guardar. Se eliminaron los datos de ejemplo de pestañas y Espacios.
- IPC tipado para abrir/guardar (solo se guarda sin diálogo en rutas elegidas antes por el usuario) y autoguardado (ids validados).
- Pruebas: 117 unitarias (incluye 5 semillas × 1000 operaciones aleatorias que vuelven al estado inicial, recorrido aleatorio del historial, ida y vuelta  sin pérdida) y 32 e2e.

### Decisiones tomadas (la spec no las cubría)
- Los comandos no tienen  literales: son una receta de Immer y la sesión guarda / (como recomienda la spec 02). Su  es una clave () que la UI traduce.
- **Subcapas**: la spec 02 define  y el glosario habla de subcapas; por ahora no hay subcapas en el modelo (un grupo cumple ese papel). Decidir antes de la Fase 6 (panel Capas).
- Tipos que la spec no detalla, definidos aquí y ampliables: , , , ,  (familia, estilo, tamaño),  (longitud), /.
- Un documento nuevo es A4 en mm, con Espacio, mesa y capa de nombres en español; el diálogo de Nuevo documento llega en la Fase 12.
- Una mesa y una capa por Espacio como mínimo (como Illustrator); eliminar la última no hace nada.
- Al rehacer también se trae al frente el Espacio de la acción.
- Mover a Espacio, Propiedades de Espacio y reordenar pestañas arrastrando existen en el core o están desactivados en la UI; se completan en las Fases 4 y 10.

### Pendiente
- Lo no verificado de la Fase 1 (instalador de Windows, Linux) sigue sin verificar.
- Abrir un  desde el sistema (doble clic / argumento), Guardar una copia, miniatura dentro del  y el hash de imágenes/fuentes (los calculará quien coloque la imagen).

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
- Conflicto de spec: `Alt+Ctrl+E` (Exportar para pantallas en spec 09, Aplicar modificadores en maqueta 14); «Aplicar modificadores» queda sin atajo.
