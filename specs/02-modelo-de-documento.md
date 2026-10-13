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
  cornerRadius?: number; // Widget de esquina viva (como Illustrator CC)
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
