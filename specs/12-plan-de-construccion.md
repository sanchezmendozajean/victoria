# 12 · Plan de construcción

Cada fase tiene entregables y **criterios de aceptación verificables**. No pasar a la siguiente sin cumplirlos. Al cerrar una fase: pruebas verdes **en Windows y en Linux** (CI), lint limpio, entrada en `CHANGELOG.md`.

## Fase 0 — Maqueta visual (Claude Design)

- Entregables: carpeta `design/` según `10-interfaz-visual.md`.
- Aceptación: las 17 pantallas/hojas existen; tokens idénticos a la spec; cada botón/menú tiene ícono; el usuario aprueba la maqueta.

## Fase 1 — Esqueleto (Claude Code)

- Proyecto Electron + Vite + React + TS; seguridad según `01-arquitectura.md`; ventana sin marco con barra de título propia; menús de la app (sin acciones aún) con íconos; tokens y temas oscuro/claro.
- Layout completo de la maqueta: barra de herramientas, barra de control, pestañas de documento, **barra de Espacios**, lienzo vacío, columna de paneles (paneles vacíos acoplables/contraíbles), barra de estado.
- Componente `<Icon>` con todo el catálogo (los `custom:` pueden ser provisionales).
- Capa `src/main/platform/` (win32 + linux) y CI con matriz Windows/Ubuntu desde el primer día.
- Aceptación: `pnpm dev` abre la ventana en Windows y en Linux (X11 y Wayland) y coincide visualmente con la pantalla 3 de la maqueta (sin contenido de lienzo); `pnpm build:win` genera instalador NSIS y `pnpm build:linux` genera AppImage y .deb que se instalan y abren correctamente.

## Fase 2 — Core del documento

- Modelo (`02`), comandos con Immer + historial, selección, guardar/abrir `.vict`, autoguardado y recuperación, Espacios y mesas en el modelo.
- Aceptación: pruebas unitarias de crear/deshacer/rehacer 1000 operaciones aleatorias que vuelven al estado inicial; ida y vuelta `.vict` sin pérdida.

## Fase 3 — Lienzo

- Viewport (pan, zoom en cursor, HiDPI), render de trazados/formas/grupos con relleno y trazo, mesas, reglas, guías, cuadrícula, modo contorno, R-tree e hit-testing, overlay.
- Aceptación: 10 000 nodos a 60 fps en pan/zoom; hit-test correcto sobre relleno, trazo y huecos de trazado compuesto (pruebas).

## Fase 4 — Selección y transformación

- Selección, Selección directa, Lazo, cuadro delimitador (escala/rotación), mover con Alt-duplicar, flechas, aislamiento, Rotar/Reflejar/Escala con diálogos, Transformar de nuevo, guías inteligentes y snap.
- Aceptación: lista de comprobación de comportamientos de `03` (Selección y Selección directa) automatizada con Playwright.

## Fase 5 — Dibujo

- Pluma (todos los puntos del 1 al 11), añadir/eliminar/convertir ancla, Curvatura, Lápiz, formas vivas con widgets, esquinas vivas, tijeras, unir/promediar.
- Aceptación: pruebas de máquina de estados de la Pluma para cada regla; prueba manual guiada (dibujar un ícono de corazón, una gota y un engranaje) sin sorpresas para alguien habituado a Illustrator.

## Fase 6 — Color, trazo y paneles principales

- Paneles Relleno y color, Muestras, Degradado (+ herramienta), Trazo completo (discontinuo, flechas, perfiles), Alineación, **Espaciado**, Transformar, Capas, Propiedades, Cuentagotas.
- Aceptación: cada control del panel modifica el objeto y es deshacible; valores mixtos se muestran vacíos.

## Fase 7 — Texto

- Fuentes del sistema, texto de punto, de área, **en trazado** (corchetes, voltear, efectos), paneles Carácter y Párrafo, crear contornos.
- Aceptación: texto en trazado sobre círculo y onda se ve igual en lienzo, SVG y PDF exportados.

## Fase 8 — Construcción de formas

- Buscatrazos (panel) y **Creador de formas** (planar arrangement con Béziers preservadas).
- Aceptación: unir/eliminar regiones de 3 círculos superpuestos produce los nodos mínimos esperados (sin poligonizar).

## Fase 9 — Modificadores

- Registro, panel Apariencia completo, diálogos generados por esquema, catálogo v1, aplicar modificadores, menú Modificador.
- Aceptación: cada modificador v1 tiene prueba de geometría (snapshot) y se exporta correctamente a SVG/PDF.

## Fase 10 — Espacios (UI completa)

- Barra de Espacios funcional, panel Espacios, mover a Espacio, atajos, exportar/imprimir por Espacio.
- Aceptación: documento con 3 Espacios se guarda/abre; deshacer cruza Espacios correctamente.

## Fase 11 — Imágenes, vectorizar, exportar, imprimir

- Colocar, recortar, máscaras, Calco de imagen (Worker), Exportar para pantallas, Imprimir con marcas, importar SVG/PDF.
- Aceptación: imprimir una mesa A4 con un cuadrado de 100 mm da 100 mm en papel **desde Windows y desde Linux**; un `.vict` con texto guardado en Windows se abre en Linux con las mismas fuentes (si están instaladas) o con el diálogo de sustitución; vectorizar un logotipo de 1000 px en < 3 s.

## Fase 12 — Pulido

- Preferencias, espacios de trabajo de paneles, pantalla de inicio, tooltips con atajos, rendimiento, instalador firmado (si aplica), manual breve de usuario.

## Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| Booleanas imprecisas | paper.js + pruebas con casos degenerados (tangencias, nodos coincidentes) |
| Rendimiento de texto | caché de glifos `Path2D` |
| Diferencias lienzo/exportación | un único pipeline de geometría evaluada para render y export |
| Diferencias de Linux (Wayland, gestores de ventanas, atajos reservados, CUPS) | CI desde la Fase 1, capa `platform/`, pruebas manuales en GNOME y KDE en cada fase |
| Alcance excesivo | respetar marcas v1/v2; v2 solo tras Fase 12 |
