# 11 · Iconografía

**Regla: toda opción, botón, entrada de menú, pestaña de panel y herramienta tiene ícono.** Sin excepciones. Si una entrada nueva no tiene ícono, se diseña antes de fusionar el código.

## Estilo

- Base: **Lucide** (trazo 1.5 px, esquinas redondeadas, rejilla 24 px renderizada a 16/20 px).
- Íconos propios (`custom:`) dibujados con el mismo estilo: trazo 1.5, `stroke-linecap: round`, `stroke-linejoin: round`, sin rellenos salvo indicadores (nodo seleccionado = cuadrado relleno).
- Color: `currentColor`. Ícono activo = `--icon-active`; acento solo en estados seleccionados.
- Los nombres de Lucide pueden cambiar entre versiones: verificar contra la versión instalada y, si no existe, crear `custom:`.
- Componente único `<Icon id="pen" size={16} />` que resuelve tanto Lucide como `custom:`.

## Catálogo

### Herramientas
| id | Fuente | Descripción |
|---|---|---|
| tool-select | lucide `mouse-pointer-2` | flecha rellena negra (custom si se prefiere) |
| tool-direct-select | custom | flecha hueca blanca con borde |
| tool-group-select | custom | flecha hueca con "+" |
| tool-lasso | lucide `lasso` | |
| tool-pen | lucide `pen-tool` | |
| tool-anchor-add | custom | plumilla con "+" |
| tool-anchor-delete | custom | plumilla con "−" |
| tool-anchor-convert | custom | "^" con manejadores |
| tool-curvature | lucide `spline` | |
| tool-pencil | lucide `pencil` | |
| tool-smooth | custom | lápiz con ondas |
| tool-blob | lucide `paintbrush` | |
| tool-rect | lucide `square` | |
| tool-rounded-rect | lucide `square` con radio grande (custom) | |
| tool-ellipse | lucide `circle` | |
| tool-polygon | lucide `hexagon` | |
| tool-star | lucide `star` | |
| tool-line | lucide `slash` | |
| tool-arc | custom | |
| tool-spiral | custom | |
| tool-type | lucide `type` | |
| tool-area-type | custom | T dentro de recuadro |
| tool-type-on-path | custom | T sobre curva |
| tool-shape-builder | custom | flecha + dos círculos fusionándose con "+" |
| tool-scissors | lucide `scissors` | |
| tool-knife | custom | |
| tool-eraser | lucide `eraser` | |
| tool-rotate | lucide `rotate-ccw` | |
| tool-reflect | lucide `flip-horizontal-2` | |
| tool-scale | lucide `scaling` | |
| tool-free-transform | custom | cuadro con tiradores y flechas |
| tool-eyedropper | lucide `pipette` | |
| tool-gradient | custom | rectángulo con degradado y barra |
| tool-artboard | custom | rectángulo con esquinas marcadas |
| tool-hand | lucide `hand` | |
| tool-zoom | lucide `zoom-in` | |

### Espacios (nuevo)
| id | Fuente | Descripción |
|---|---|---|
| spaces | custom | tres planos apilados en perspectiva |
| space-add | custom | planos + "+" |
| space-duplicate | custom | dos planos desplazados |
| space-delete | lucide `trash-2` | |
| space-rename | lucide `pencil-line` | |
| space-color | lucide `palette` | |
| space-exclude-export | custom | plano con flecha tachada |
| space-move-to | custom | objeto entrando a plano |
| space-properties | lucide `settings-2` | |

### Mesas de trabajo
artboard-new `custom` · artboard-delete `trash-2` · artboard-duplicate `copy` · artboard-options `settings-2` · artboard-portrait `rectangle-vertical` · artboard-landscape `rectangle-horizontal` · artboard-rearrange `layout-grid` · artboard-fit-art `custom (mesa abrazando forma)` · artboard-fit-selection `custom`.

### Alineación
align-left `align-start-vertical` · align-hcenter `align-center-vertical` · align-right `align-end-vertical` · align-top `align-start-horizontal` · align-vcenter `align-center-horizontal` · align-bottom `align-end-horizontal` · dist-left/hcenter/right `align-horizontal-distribute-start/center/end` · dist-top/vcenter/bottom `align-vertical-distribute-start/center/end` · align-to-selection `custom` · align-to-key `custom (objeto con borde grueso)` · align-to-artboard `custom`.

### Espaciado
space-horizontal `align-horizontal-space-between` · space-vertical `align-vertical-space-between` · space-grid `grid-3x3` · space-fill-repeat `custom (rejilla con +)` · space-margins `custom`.

### Buscatrazos
pf-unite `squares-unite` · pf-minus-front `squares-subtract` · pf-intersect `squares-intersect` · pf-exclude `squares-exclude` · pf-divide, pf-trim, pf-merge, pf-crop, pf-outline, pf-minus-back `custom` · pf-expand `custom`.

### Trazo
stroke-weight `custom (líneas de grosor creciente)` · cap-butt / cap-round / cap-square `custom` · join-miter / join-round / join-bevel `custom` · align-stroke-center / inside / outside `custom` · dashed `custom` · arrow-start / arrow-end `move-left` / `move-right` · width-profile `custom` · flip-profile `flip-horizontal`.

### Relleno y color
fill `custom (cuadro relleno)` · stroke `custom (cuadro hueco)` · swap-fill-stroke `arrow-left-right` (curva custom) · default-colors `custom` · paint-color `square` relleno · paint-gradient `custom` · paint-none `custom (diagonal roja)` · eyedropper `pipette` · swatch-new `plus-square` · swatch-group `folder` · swatch-global `custom` · opacity `custom (círculo medio lleno)` · blend-mode `blend`.

### Texto
font `type` · font-style `custom` · font-size `a-large-small` · leading `custom` · kerning `custom (V A juntas)` · tracking `custom` · v-scale `custom` · h-scale `custom` · baseline-shift `custom` · char-rotate `custom` · all-caps `case-upper` · small-caps `custom` · superscript `superscript` · subscript `subscript` · underline `underline` · strikethrough `strikethrough` · para-left / center / right `align-left` / `align-center` / `align-right` (o `text-align-*`) · justify-* `align-justify` + variantes custom · indent-left / right / first `indent-increase` + custom · space-before / after `custom` · hyphenate `custom` · create-outlines `custom (A convertida en contorno)` · text-on-path-options `custom` · area-type-options `custom` · overflow `custom (cuadro rojo +)`.

### Apariencia y Modificadores
fx `custom (texto "fx" estilizado)` · mod-structural `custom (rombo de nodo)` · mod-appearance `custom (halo)` · mod-apply `custom (rayo/expandir)` · add-fill · add-stroke · clear-appearance `eraser` · duplicate-item `copy` · delete-item `trash-2` · visibility `eye` / `eye-off`.
Un ícono propio por modificador: offset-path, outline-stroke, round-corners, zigzag, pucker-bloat, twist, roughen, transform, free-distort, warp-* (uno por estilo), drop-shadow, outer-glow, inner-glow, feather, convert-rect, convert-rounded, convert-ellipse.

### Capas
layer-new `custom` · sublayer-new `custom` · clip-mask `custom` · locate-object `locate` · lock `lock` / `lock-open` · target `circle-dot` · delete `trash-2`.

### Archivo, edición, vista (menús)
new `file-plus` · open `folder-open` · recent `history` · save `save` · save-as `save-all` · place `image-plus` · export `share` · export-screens `monitor-up` · print `printer` · close `x` · document-setup `file-cog` · undo `undo-2` · redo `redo-2` · cut `scissors` · copy `copy` · paste `clipboard` · paste-front / paste-back / paste-in-place `custom` · preferences `settings` · group `group` · ungroup `ungroup` · arrange-* `bring-to-front` / `send-to-back` / `arrow-up` / `arrow-down` · lock-sel `lock` · hide-sel `eye-off` · compound-path `custom` · join `custom` · average `custom` · outline-mode `scan` · pixel-preview `grid-2x2` · rulers `ruler` · guides `custom` · smart-guides `magnet` · grid `grid-3x3` · snap-grid `custom` · zoom-in `zoom-in` · zoom-out `zoom-out` · fit-artboard `maximize` · fit-all `fullscreen` · actual-size `custom (1:1)` · trace-image `custom (imagen→vector)` · embed `custom` · crop-image `crop` · help `circle-help`.

### Ventana
minimize `minus` · maximize `square` · restore `copy` · close-window `x` · workspace `layout-dashboard` · collapse-panel `chevrons-right` · panel-menu `menu` · theme `sun-moon`.
