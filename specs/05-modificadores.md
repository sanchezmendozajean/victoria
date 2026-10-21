# 05 · Modificadores

Equivalente a **Efectos de Illustrator** (menú Efecto › secciones de Illustrator). **No** se incluyen los efectos tipo Photoshop.

## Concepto

Un **Modificador** es una operación no destructiva añadida a la apariencia de un objeto, de un relleno o de un trazo concreto. Se evalúa en cada render (con caché). Se puede:

- **Activar/desactivar** (ojo), **reordenar** (arrastrar), **editar** (doble clic abre su diálogo con Previsualizar), **duplicar**, **eliminar**.
- **Aplicar**: vuelve permanente el resultado (como "Expandir apariencia") y elimina el modificador.
- Guardar como **preajuste** del documento.

### Tipos

| Tipo | Afecta estructura | Ejemplo | Al aplicar |
|---|---|---|---|
| **Estructural** | Sí: produce nueva geometría | Redondear esquinas, Desplazar trazado, Zigzag | Reemplaza los nodos del objeto |
| **De apariencia** | No: solo cómo se pinta | Sombra paralela, Resplandor | Se rasteriza a imagen o se separa en objetos (sombra → objeto aparte) |

Cada modificador declara en su registro `affectsGeometry: boolean`. La UI lo indica con un ícono distinto en el panel Apariencia (nodo ◇ para estructural, gota/halo para apariencia).

### Contrato

```ts
interface ModifierDef<P> {
  id: string;                     // 'round-corners'
  name: string;                   // clave i18n
  icon: string;                   // id del catálogo de íconos
  category: 'path' | 'distort' | 'convert' | 'pathfinder' | 'stylize' | 'warp';
  affectsGeometry: boolean;
  defaults: P;
  schema: ParamSchema<P>;         // genera el diálogo automáticamente
  apply(input: Geometry, params: P, ctx: ModifierContext): Geometry | AppearanceOutput;
}
```

- `Geometry` = lista de trazados Bézier (más fillRule).
- Funciones **puras y deterministas** (los aleatorios usan `seed` guardado en los parámetros).
- Caché por `(objectVersion, modifierStackHash)`.
- Los modificadores estructurales se evalúan antes que los de apariencia, respetando el orden dentro de cada grupo.
- La caja delimitadora mostrada con Selección puede usar geometría **original** o **evaluada** (Preferencia "Usar límites de previsualización", igual que Illustrator).

## Catálogo

### Trazado (Path)
| Modificador | Parámetros | Estructural | v |
|---|---|---|---|
| Desplazar trazado (Offset) | distancia, unión, límite de inglete | Sí | 1 |
| Contornear trazo (Outline stroke) | — | Sí | 1 |
| Contornear objeto | — | Sí | 2 |

### Buscatrazos vivo (Pathfinder)
Sobre un **grupo**: Unir, Menos frente, Intersecar, Excluir, Dividir, Recortar, Combinar, Cortar, Contorno, Menos detrás. Parámetro: precisión. Estructural. v1 (Unir, Menos frente, Intersecar, Excluir); resto v2.

### Distorsionar y transformar
| Modificador | Parámetros | Estructural | v |
|---|---|---|---|
| Redondear esquinas | radio | Sí | 1 |
| Zigzag | tamaño (abs/rel), crestas por segmento, suave/esquina | Sí | 1 |
| Fruncir y engordar (Pucker & Bloat) | −200…200 % | Sí | 1 |
| Retorcer (Twist) | ángulo | Sí | 2 |
| Hacer áspero (Roughen) | tamaño, detalle, suave/esquina, semilla | Sí | 1 |
| Transformar | escala, mover, rotar, reflejar, copias, punto de origen | Sí | 1 |
| Distorsión libre | 4 esquinas | Sí | 2 |
| Pintar con trazos (Scribble) | — | Sí | 2 |

### Deformar (Warp)
Arco, Arco inferior, Arco superior, Arcada, Abultar, Concha inferior, Concha superior, Bandera, Onda, Pez, Ascenso, Ojo de pez, Inflar, Apretar, Torcer. Parámetros: horizontal/vertical, curvatura, distorsión H y V. Estructural. v1: Arco, Bandera, Onda, Inflar; resto v2.

### Convertir en forma
Rectángulo, Rectángulo redondeado, Elipse (tamaño absoluto o relativo). Estructural. v2.

### Estilizar (apariencia)
| Modificador | Parámetros | Estructural | v |
|---|---|---|---|
| Sombra paralela | modo, opacidad, X, Y, desenfoque, color | No | 1 |
| Resplandor exterior | modo, color, opacidad, desenfoque | No | 1 |
| Resplandor interior | modo, color, opacidad, desenfoque, centro/borde | No | 2 |
| Desvanecer (Feather) | radio | No | 2 |
| Añadir puntas de flecha | (heredado; preferir panel Trazo) | No | — |

Los de apariencia se renderizan con `ctx.filter`/`shadowBlur` en Canvas y como `<filter>` en SVG; en PDF se rasterizan a 300 ppp.

## UI

- Menú **Modificador** en la barra de menú, con submenús por categoría (cada entrada con ícono) y arriba: "Aplicar último modificador" (Mayús+Ctrl+E) y "Último modificador…" (Alt+Mayús+Ctrl+E).
- Botón **fx** en panel Apariencia y en panel Propiedades.
- Diálogo generado por `schema`: campos numéricos con rueda del ratón y expresiones aritméticas (ver specs/10 · Comportamiento de los campos numéricos), deslizadores, casilla **Previsualizar** (activa por defecto), botones Cancelar/Aceptar.
- **Objeto › Aplicar modificadores** (equivale a Expandir apariencia).

## Reglas añadidas en la Fase 9

- **Dónde viven**: un modificador del objeto es un elemento `{ kind: 'modifier', mod }` de la lista de apariencia (orden = orden de ejecución); `ModifierInstance.params` solo guarda números, textos y booleanos (los colores, como `#rrggbb`; las longitudes, en pt). Los modificadores propios de un relleno o trazo (`item.modifiers`) existen en el modelo pero la interfaz aún no los edita.
- **Motor**: `core/modifiers` (registro, `evaluateNode`, una función pura por modificador). Los estructurales corren primero y en orden sobre los contornos base; los de apariencia solo describen un efecto (sombra, resplandor). La evaluación se cachea por nodo (los nodos son inmutables).
- **Qué usa la geometría evaluada**: el pintado y la selección por clic. **La caja delimitadora que se muestra y la alineación usan los contornos originales** (como Illustrator sin «límites de previsualización»); los límites visibles incluyen modificadores y el margen de sombras y resplandores. Editar nodos con Selección directa edita el contorno original.
- **Catálogo v1 implementado** (17): Desplazar trazado, Contornear trazo, Buscatrazos vivo (Unir, Menos frente, Intersecar, Excluir), Redondear esquinas, Zigzag, Fruncir y engordar, Hacer áspero, Transformar, Arco, Bandera, Onda, Inflar, Sombra paralela y Resplandor exterior. Los v2 aparecen en el menú con la etiqueta «v2» y desactivados.
- **Aproximaciones** (la spec no fija la fórmula; verificar contra Illustrator): *Fruncir y engordar* mueve los nodos hacia/desde el centro un 40 % de la cantidad y hincha los manejadores un 80 %; *Hacer áspero* desplaza cada punto (cada 72/detalle pt) en la normal con una pequeña componente tangencial; las deformaciones se calculan sobre el recuadro del objeto subdividiendo cada tramo en 8; la *Sombra paralela* no distingue el modo de fusión (siempre normal) y el *Resplandor exterior* es una sombra sin desplazamiento.
- **Desplazar trazado y Contornear trazo**: se aplanan los contornos, se desplazan arista a arista con la unión elegida (inglete con límite, redonda, biselada), los cruces se resuelven con paper.js y el resultado se **reajusta a Béziers** (las esquinas se conservan; un círculo sigue siendo un puñado de nodos suaves). Contornear trazo ignora guiones y perfiles de ancho. Se probó clipper2-js primero y se descartó: devolvía polígonos erróneos para rectángulos simples.
- **Buscatrazos vivo**: Alt+clic en un modo de forma del panel agrupa la selección y añade el modificador al grupo, que se pinta como una sola forma con el aspecto del objeto superior; los originales siguen editables dentro del grupo. «Expandir» (y Aplicar modificadores) lo convierte en un trazado real.
- **Aplicar modificadores** (Alt+Ctrl+E, también en el panel): sustituye el objeto por su geometría evaluada sin modificadores. Contornear trazo deja un grupo (relleno + contorno del trazo relleno con su pintura); la sombra paralela pasa a ser un objeto propio debajo, **sin desenfoque** (no hay desenfoque en geometría vectorial); el resplandor se pierde. Rasterizar queda para la exportación (Fase 11).
- **Diálogo**: se genera del `schema`; «Previsualizar» (activa) aplica el modificador al instante en **un solo paso** de deshacer que el diálogo sigue editando; Cancelar lo revierte (`session.rollback`). Mayús+Ctrl+E repite el último con sus parámetros; Alt+Mayús+Ctrl+E abre su diálogo.
- **Panel Apariencia**: lista de arriba (lo último pintado) a abajo con ojo, ícono estructural/de apariencia, nombre, editar (doble clic), subir/bajar, duplicar, eliminar; añadir relleno, trazo o modificador (fx), borrar apariencia y aplicar. Con varios objetos seleccionados solo permite añadir.
- **Pendiente**: preajustes del documento (menú «Guardar como preajuste»), modificadores por relleno/trazo en la interfaz, límites de previsualización como preferencia, los modificadores v2, desenfoque real al aplicar sombra, exportación a SVG/PDF (Fase 11: sombras como filtro, estructurales ya son geometría).
