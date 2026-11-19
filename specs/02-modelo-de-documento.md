# 02 · Modelo de documento

## Jerarquía

```
Document
├─ meta: { id, name, version, created, modified, units, colorMode }
├─ resources: { swatches[], gradients[], images{}, fonts{}, modifierPresets[] }
├─ spaces: Space[]              ← NUEVO: uno o más
│  └─ Space
│     ├─ id, name, color (etiqueta), order
│     ├─ view: { zoom, panX, panY }
│     ├─ guides: Guide[]
│     ├─ grid: { size, subdivisions, visible }
│     ├─ artboards: Artboard[]
│     └─ layers: Layer[]
│        └─ Layer { type: 'layer', id, name, color, visible, locked, children: (Node | Layer)[] }
└─ activeSpaceId
```

### Capas y subcapas

Decisión del usuario (revisión de la Fase 2): una capa puede contener **objetos y otras capas (subcapas) en una misma lista ordenada en z**, como en Illustrator; un objeto puede quedar encima de una subcapa y otro debajo. `Layer.type = 'layer'` distingue una capa de un nodo. Los grupos (`group`, `clipGroup`) contienen solo objetos. Un Espacio conserva al menos una capa de primer nivel. Introducido en la versión 2 del formato (migración 1 → 2 en `core/io/migrations`).

## Nodos (objetos)

Todos comparten `BaseNode`:

```ts
interface BaseNode {
  id: string;            // nanoid
  type: NodeType;
  name?: string;
  visible: boolean;
  locked: boolean;
  transform: Matrix;     // afín 2x3, aplicado sobre la geometría local
  appearance: Appearance;
  opacity: number;       // 0..1
  blendMode: BlendMode;  // normal, multiply, screen, overlay, darken, lighten
}

type NodeType = 'path' | 'compound' | 'shape' | 'group' | 'clipGroup'
              | 'text' | 'image';
```

### Path

```ts
interface PathNode extends BaseNode {
  type: 'path';
  closed: boolean;
  anchors: Anchor[];
}
interface Anchor {
  p: Vec2;               // posición
  in: Vec2 | null;       // manejador de entrada (absoluto). null = retraído
  out: Vec2 | null;      // manejador de salida
  kind: 'corner' | 'smooth' | 'asymmetric';
  cornerRadius?: number; // Widget de esquina viva (como Illustrator CC); ver «Esquinas vivas» abajo
}
```

- `smooth`: manejadores colineales (longitudes libres).
- `asymmetric`: colineales y misma longitud (raro, para compatibilidad).
- `corner`: manejadores independientes o retraídos.

### Compound

Trazado compuesto: `children: PathNode[]`, `fillRule: 'nonzero' | 'evenodd'`.

### Shape (forma viva)

```ts
interface ShapeNode extends BaseNode {
  type: 'shape';
  shape: 'rect' | 'ellipse' | 'polygon' | 'star' | 'line';
  params: RectParams | EllipseParams | PolygonParams | StarParams | LineParams;
}
// RectParams: { w, h, radii: [tl,tr,br,bl], cornerType: 'round'|'inverted'|'chamfer' }
// EllipseParams: { w, h, startAngle, endAngle } (gráfico de tarta como Illustrator)
// PolygonParams: { radius, sides, cornerRadius }
// StarParams: { r1, r2, points, cornerRadius }
```

Una forma viva se convierte en `path` al editar sus nodos con Selección directa (con aviso, igual que Illustrator: "Esta acción convertirá la forma viva en un trazado").

### Group / ClipGroup

`children: Node[]`. En `clipGroup` el primer hijo es la máscara.

### Text

Ver `07-texto.md`. `kind: 'point' | 'area' | 'onPath'`, `story: TextRun[]`, `areaPathId?`, `pathRef?`.

### Image

`{ resourceId, width, height, embedded: boolean, linkedPath?: string }`.

## Apariencia

```ts
interface Appearance {
  items: AppearanceItem[];   // orden = orden de pintado (de abajo hacia arriba)
}
type AppearanceItem =
  | { kind: 'fill';   paint: Paint; opacity: number; modifiers: ModifierInstance[] }
  | { kind: 'stroke'; paint: Paint; stroke: StrokeStyle; opacity: number; modifiers: ModifierInstance[] }
  | { kind: 'modifier'; mod: ModifierInstance };  // a nivel de objeto

type Paint = { type: 'none' }
           | { type: 'solid'; color: Color }
           | { type: 'linear' | 'radial'; gradientId: string; transform: Matrix }
           | { type: 'swatch'; swatchId: string };

interface StrokeStyle {
  width: number; cap: 'butt'|'round'|'square'; join: 'miter'|'round'|'bevel';
  miterLimit: number; align: 'center'|'inside'|'outside';
  dash: number[] | null; dashAlignToCorners: boolean;
  startArrow?: ArrowId; endArrow?: ArrowId; arrowScale: [number, number];
  profile?: WidthProfileId;  // perfil de ancho variable
}
```

Por defecto un objeto nuevo tiene `[fill, stroke]` (como Illustrator: relleno blanco, trazo negro 1 pt, o los últimos usados).

## Recursos (forma de los datos)

Definidos en `src/core/model/types.ts` y aprobados en la revisión de la Fase 2: `Swatch { id, name, color, global, group? }`, `Gradient { id, name, type, stops[] }` con `GradientStop { offset, color, opacity, midpoint? }` (punto medio 0..1, por defecto 0,5), `Guide { id, orientation, position, locked }`, `ModifierInstance { id, modifierId, enabled, params }`, `TextStyle { fontFamily, fontStyle, size }` (crece en la Fase 7 con campos opcionales) y `LineParams { length }`. Los campos nuevos se añaden como opcionales para no cambiar la versión del formato.

## Convenciones geométricas

Definidas en la Fase 3 (`src/core/geometry`, `src/core/viewport`):

- **Vista de un Espacio**: `pantalla = documento × zoom + desplazamiento`, en píxeles CSS. Con zoom 1 (100 %), 1 pt = 1 px. Rango de zoom 3 %–64 000 % (`0,03`–`640`). Un Espacio con la vista por defecto (zoom 1, desplazamiento 0) se abre ajustado a su mesa activa.
- **Formas vivas**, en su espacio local: rectángulo y elipse parten de (0, 0) con tamaño `w × h`; polígono y estrella están centrados en el origen con el primer vértice arriba (−90°); en la estrella `r1` es el radio exterior y `r2` el interior; la línea va de (0, 0) a (`length`, 0). Ángulos de la elipse en grados desde +X, en sentido horario en pantalla (Y hacia abajo); un sector circular pasa por el centro. Los radios de esquina se limitan a la mitad del lado corto.
- **Colores** (`src/core/model/color.ts`): `rgb` 0–255; `cmyk` 0–100 cada canal; `hsb` tono 0–360, saturación y brillo 0–100; `gray` 0–100 como «% de negro» (0 = blanco). `alpha` 0–1.
- **Degradados**: el eje del degradado es el segmento unitario (0, 0)→(1, 0) (en el radial, el círculo unitario en el origen) y `Paint.transform` lo lleva al espacio local del objeto.
- **Un objeto se selecciona** donde está pintado: dentro de su relleno (los huecos de un trazado compuesto no cuentan) y sobre su contorno si tiene trazo; un objeto sin relleno no se selecciona por dentro. Los objetos ocultos o bloqueados (o en capas ocultas o bloqueadas) no se seleccionan. La tolerancia de selección es de 4 px de pantalla.

## Color

`Color = { model: 'rgb'|'cmyk'|'hsb'|'gray'; values: number[]; alpha?: number }`. Internamente se convierte a sRGB para pintar. Las muestras globales actualizan a todos los objetos que las usan.

## Comandos e historial

- `Command { label: string; do(doc): void; undo(doc): void; merge?(next): boolean }`.
- Implementación recomendada: **parches de Immer** (`produceWithPatches`) sobre un documento inmutable; el comando guarda `patches` e `inversePatches`.
- Historial por documento (no por Espacio), límite 200 pasos configurable.
- Comandos fusionables: mover con flechas, cambiar valor numérico arrastrando.
- La selección **no** es parte del historial, pero cada entrada guarda la selección para restaurarla al deshacer.
- Panel Historial opcional (v2).

## Formato `.vict`

Archivo ZIP:

```
documento.vict
├─ manifest.json        { format: "victoria", version: 1, app: "x.y.z" }
├─ document.json        modelo completo (sin binarios)
├─ images/<hash>.png    imágenes incrustadas
├─ fonts/<hash>.otf     (opcional) fuentes incrustadas
└─ thumbnail.png        miniatura 256 px del Espacio activo
```

- Versionado con migraciones en `core/io/migrations/`.
- Escritura atómica: escribir `*.tmp` y renombrar.
- Autoguardado: `<userData>/autosave/<docId>.vict` (`app.getPath('userData')`: `%APPDATA%\Victoria` en Windows, `~/.config/Victoria` en Linux) cada 60 s si hay cambios; se borra al guardar o cerrar limpio. Al arrancar, ofrecer recuperar.

## Importar / exportar

- **SVG** import: trazados, formas, grupos, `<text>` (como texto si la fuente existe), `<textPath>`, `<image>`, `clipPath`, degradados. Export: un SVG por mesa o por Espacio completo; opción "Minificar".
- **PDF/AI**: import vía pdf.js; cada página → un Espacio con una mesa del tamaño de la página. `.ai` solo con PDF incrustado y mucho más adelante.
- **EPS**: import de EPS simples ya implementado (`core/io/eps.ts`); export y EPS exóticos, pendientes. Detalle en `08-imagenes-vectorizar-imprimir.md`.
- **PNG/JPG/WebP**: por mesa, ppp configurable (72/150/300/personalizado), fondo transparente o blanco.

### Reglas añadidas en la Fase 11 (importar SVG y PDF)

- **Tamaño**: en SVG, `width`/`height` sin unidad o en px valen 1 pt por unidad (como Illustrator); las unidades físicas (mm, cm, in, pt) se convierten a pt; sin `width`/`height` manda el `viewBox`, y si no hay ninguno el dibujo mide 100 × 100. Con `viewBox` de otra proporción, el dibujo se centra sin deformarse (`xMidYMid meet`).
- **Qué se conserva como forma viva**: `rect` sin radios o con radios iguales, `circle` y `ellipse`. El resto son trazados (o compuestos, con la regla de relleno, si hay varios contornos). `transform` va en el objeto, no en los puntos.
- **Estilo**: se resuelve la cascada atributos de presentación < `<style>` (selectores `etiqueta`, `.clase`, `#id` y sus combinaciones sin combinadores) < `style=""`, con herencia; un objeto sin relleno ni trazo se descarta. `opacity` y `mix-blend-mode` pasan al objeto; `fill-opacity`, `stroke-opacity` y el canal alfa del color, a la opacidad de cada elemento del aspecto.
- **Degradados**: se importan como recursos, con su matriz calculada para el objeto (`objectBoundingBox` o `userSpaceOnUse`, más `gradientTransform`); un degradado de una sola parada es un color; el punto focal y `spreadMethod` distintos del valor por defecto se avisan.
- **Recortes**: `clip-path` se convierte en un grupo de recorte que toma la transformación, la opacidad y el modo de fusión del elemento; el recorte es un trazado compuesto en el espacio del elemento. Máscaras, filtros y motivos se avisan y se omiten.
- **PDF**: un Espacio por página con una mesa del tamaño de la página (hasta 50). Se leen trazados, rellenos y trazos, recortes, cajas de formularios, degradados axiales y radiales, opacidad, modos de fusión, imágenes y texto (como texto de punto sin su fuente original, con aviso). Las coordenadas se pasan al espacio de la página (Y hacia abajo) en el momento de leer, así que los objetos llegan con transformación identidad.
- Las formas **sin relleno ni trazo** (típico de las guías y máscaras que exporta Illustrator con `fill:none`) se importan como trazados sin pintura, como los abre Illustrator: invisibles salvo en modo contorno o al seleccionarlas. Solo se descarta lo `display:none`.
- Todo lo que no se entiende se **avisa al terminar** (no falla); un archivo que no es SVG, o un PDF ilegible, se rechaza con un mensaje y no se abre nada.

## Modo SVG: editar un SVG directamente (Fase 13)

Abrir un `.svg` puede **editarlo en su sitio** en lugar de importarlo a un documento nuevo. Es un documento normal del `core` con un origen SVG (`OpenDocument.format = 'svg'`, `path` = el `.svg`); **Guardar** escribe el SVG con `core/export/svg.ts`. Todo lo demás (Deshacer, pestañas, autoguardado en `.vict` dentro de `userData`) funciona igual.

### Cuándo se abre en modo SVG

El criterio es el **viaje de ida y vuelta**: solo se edita en su sitio lo que `exportar → importar` devuelve igual. Se abre en modo SVG si la importación terminó **sin advertencias** (`SvgImport.warnings` vacío). El texto cuenta: un `<text>` que Victoria no sabe representar sin pérdida (ver «Texto vivo» más abajo) emite una advertencia, igual que `<textPath>`. En cualquier otro caso se abre como hoy: un documento Victoria nuevo (copia `.vict`) con el aviso de lo omitido; el archivo original no se toca. Un aviso previo lo explica en una línea.

### Qué se bloquea (con tooltip del motivo)

Un elemento bloqueado queda con el aspecto de deshabilitado y su tooltip dice **por qué** y cómo seguir («Un SVG no puede guardar X. Usa Archivo › Guardar como documento Victoria…»). Regla 8: cada cadena nueva va a `es.json` y cada elemento conserva su ícono.

| Bloqueado | Motivo (resumen) |
|---|---|
| Texto de área y texto en trazado; en Carácter y Párrafo: escala horizontal/vertical, rotación de carácter, versalitas, sangrías, espacio antes/después, justificación, guionado | SVG solo guarda texto de punto con los atributos de «Texto vivo» |
| Modificadores vivos, Mezcla (Objeto › Mezcla), perfiles de ancho y puntas de flecha de trazo, esquinas vivas, Calco de imagen vivo | SVG guarda la geometría final, no el efecto vivo |
| Sombras y resplandores | Se guardan como `<filter>`, que Victoria no reabre |
| Alineación de trazo interior/exterior | Se guarda como recorte, no como trazo |
| Aspecto con más de un relleno o trazo por objeto | SVG tiene un relleno y un trazo por elemento |
| Más mesas y Espacios: herramienta Mesa de trabajo, panel Mesas, Espacios | Un SVG es una sola mesa |

La lista es **código**: un solo registro `svgCapabilities` en `core` (id de función → motivo) que consultan menús, barra de herramientas, paneles y atajos, para que no haya dos listas. **Se amplía solo con una prueba** que demuestre que la función hace el viaje de ida y vuelta.

### Exportador semántico (descubierto en 13.1)

El exportador actual escribe **dibujo**, no documento: aplana los grupos y escribe cada rectángulo y elipse como un `<path>` de curvas. Guardar así reescribiría la estructura del archivo (un `<rect>` pasaría a ser un trazado de curvas; los `<g>` desaparecerían). Por eso `writeSvg` tiene la opción `structure: 'semantic'` (implementada en 13.2): escribe un `<g>` por cada grupo y grupo de recorte del documento (aunque no lleve atributos), `<rect>` (con `rx` si las cuatro esquinas son redondas e iguales), `<circle>`/`<ellipse>` para rectángulos y elipses vivos completos, y `<path>` para todo lo demás (también un rectángulo con modificadores, esquinas desiguales o una elipse parcial). Un objeto que se escribe como un solo elemento lleva en él su transformación, opacidad y modo de fusión, sin `<g>` de envoltorio. El modo por defecto (`'drawing'`) no cambia: es el de Exportar, PNG, PDF e impresión. Las capas del documento no se escriben como `<g>` (pendiente).

### Texto vivo (decisión: el texto sigue siendo texto)

En modo SVG el texto de punto se guarda como `<text>` y se reabre igual de editable. Las demás salidas (PNG, JPG, PDF, impresión y **Exportar** a SVG) **no cambian**: texto en contornos (spec 08).

- **Exportador (implementado en 13.2).** `buildScene` recibe `liveText: true`; el modo SVG lo usa junto con `structure: 'semantic'`. La escena lleva entonces una operación `text` por objeto: una `<text xml:space="preserve">` con un `<tspan x="0" y>` por línea, donde `y` sale del **mismo diseño** (`core/text`) que el lienzo y la `x` es siempre 0 (en texto de punto la alineación se expresa con `text-anchor`). Un objeto que no cumple las condiciones de abajo se escribe en contornos, sin avisar al exportador: es el modo SVG el que debe impedir esas funciones.
- **Condiciones para escribirse vivo.** Texto de punto; apariencia = un único relleno (sin trazo ni modificadores); estilo de fuente `Regular`, `Bold`, `Italic` o `Bold Italic`; atributos de carácter limitados a familia, tamaño, interlineado, tracking, subrayado y tachado (escala, versalitas, superíndices, desplazamiento de línea base, rotación y kerning numérico, en su valor neutro); párrafos solo con alineación izquierda, centro o derecha. Fuera de esta lista (`text.advanced` en el registro) la función queda bloqueada con tooltip.
- **Atributos que viajan:** `font-family` (solo el nombre), `font-weight`, `font-style`, `font-size`, relleno, `letter-spacing` (de `tracking`), `text-anchor`, interlineado (por la distancia entre líneas), `text-decoration` (`underline`, `line-through`). Varios rangos de estilo = `<tspan>` con solo lo que cambia.
- **Importador (implementado en 13.2).** Lee esos atributos y reconstruye líneas, alineación e interlineado. El interlineado se deduce de la distancia entre líneas suponiendo el mismo tamaño de fuente en ambas; es exacto en el texto que escribe Victoria. Lo que no puede representar **avisa** con el código `text-layout` (y fuerza la copia `.vict`): `rotate`, `dx`, `textLength`, `writing-mode`, `baseline-shift`/`dy` sin posición, listas de posiciones, un `<tspan x>` que desplaza texto en la misma línea, líneas que no comparten la misma `x`, y `<textPath>`. Antes, estos atributos se ignoraban en silencio.
- **Fuentes.** Se guarda siempre el nombre de la familia pedida (`font-family="Familia"`), **incluso si esa fuente no está instalada**: nunca se reescribe por la sustituta. Un visor externo sin la fuente usará otra y el texto se verá distinto; es el compromiso de no convertirlo en contornos. Para evitarlo: **Guardar › Texto como contornos** (casilla del documento, por defecto desmarcada), que guarda ese archivo con el texto convertido. Al abrir sin la fuente, el texto se edita igual y se marca en rosa (spec 07).
- **Paridad.** El lienzo, los contornos y el `<text>` guardado salen de la misma geometría de línea; una prueba compara la posición de línea base de cada línea entre ambas salidas.

### Guardar

- **Guardar** reescribe el `.svg` (escritura atómica). Se pierde lo que Victoria no modela: `id`, clases, `<defs>` sin uso, comentarios, metadatos y el orden/forma del XML original. La **primera vez** en cada sesión se muestra un aviso con casilla «No volver a preguntar» (preferencia).
- **Guardar como…** pide un archivo SVG (el documento sigue siendo un documento SVG). **Guardar como documento Victoria…** (`DocumentManager.saveAsVict`) escribe el `.vict` completo, **desbloquea todas las funciones** y el documento deja de ser SVG; el `.svg` original queda intacto. Guardar una copia sigue escribiendo un `.vict`.
- **Implementación (13.3).** `OpenDocument.format` vale `'svg'` o `'vict'`; `SaveRequest.format` lo lleva al proceso principal, que ajusta el filtro y la extensión del diálogo. El proceso principal solo escribe en rutas que el usuario eligió en un diálogo, como antes. El guardado a SVG (`writeDocumentSvg`) escribe la primera mesa; antes de maquetar se cargan fuentes e imágenes (`prepareSvg`). El autoguardado sigue escribiendo `.vict` en `userData`: recuperar un documento SVG lo devuelve como documento Victoria sin archivo asociado. Las advertencias de texto usan el código `text-layout`.
- Los objetos vivos de un `.vict` (polígono, estrella, texto…) no pasan a un SVG: se tratan como en la exportación actual (geometría).

### Aceptación

- Para cada elemento del registro de capacidades permitido: `exportSvg(importSvg(x))` produce la misma escena (prueba en `core/io/svg`).
- Un SVG con `<mask>`, `<filter>`, `<pattern>`, `<textPath>` o `<text>` con atributos no soportados **no** se abre en modo SVG; uno con texto de punto soportado, sí, y al guardarlo el `<text>` sigue siendo `<text>`.
- Cada elemento bloqueado tiene tooltip, ícono y se comprueba en una prueba de la interfaz.

## Esquinas vivas de trazados (Fase 5)

`Anchor.cornerRadius` es un dato **vivo**: el contorno que se dibuja y mide es el trazado con las esquinas redondeadas (`applyCornerRadii`, en `core/geometry/anchors.ts`), pero las anclas guardadas no cambian. Solo se redondea un ancla de **esquina sin manejadores** cuyos dos segmentos vecinos son rectos (en un trazado abierto, no los extremos); las demás se ignoran sin error. El radio se limita a la mitad del segmento vecino más corto. Cada esquina redondeada produce dos anclas con un arco cúbico entre ellas. Quitar el radio (o arrastrar el widget a 0) devuelve la esquina viva sin pérdida.

La **línea** (`shape: 'line'`) se crea solo con trazo (sin relleno).

## Campos opcionales añadidos en la Fase 6

Sin cambio de versión del formato (todos opcionales): `StrokeStyle.arrowAlign` (`'inside'` por defecto | `'extend'`), `StrokeStyle.profileFlip`, `Layer.outline` (modo contorno de esa capa) e identificadores de catálogo en `StrokeStyle.startArrow / endArrow` (`simple`, `barbed`, `open`, `circle`, `diamond`, `square`, `bar`) y `StrokeStyle.profile` (`taper`, `taperStart`, `lens`, `bulge`, `pinch`, `flare`; ausente = uniforme).
