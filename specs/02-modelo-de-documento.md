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
- **PDF/AI**: import vía pdf.js; cada página → un Espacio con una mesa del tamaño de la página.
- **PNG/JPG/WebP**: por mesa, ppp configurable (72/150/300/personalizado), fondo transparente o blanco.

## Esquinas vivas de trazados (Fase 5)

`Anchor.cornerRadius` es un dato **vivo**: el contorno que se dibuja y mide es el trazado con las esquinas redondeadas (`applyCornerRadii`, en `core/geometry/anchors.ts`), pero las anclas guardadas no cambian. Solo se redondea un ancla de **esquina sin manejadores** cuyos dos segmentos vecinos son rectos (en un trazado abierto, no los extremos); las demás se ignoran sin error. El radio se limita a la mitad del segmento vecino más corto. Cada esquina redondeada produce dos anclas con un arco cúbico entre ellas. Quitar el radio (o arrastrar el widget a 0) devuelve la esquina viva sin pérdida.

La **línea** (`shape: 'line'`) se crea solo con trazo (sin relleno).
