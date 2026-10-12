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
- Diálogo generado por `schema`: campos numéricos con arrastre (scrubby), deslizadores, casilla **Previsualizar** (activa por defecto), botones Cancelar/Aceptar.
- **Objeto › Aplicar modificadores** (equivale a Expandir apariencia).
