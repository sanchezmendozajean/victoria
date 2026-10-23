# 04 · Espacios y mesas de trabajo

## Espacios (concepto nuevo)

En Illustrator un archivo tiene un único lienzo donde viven todas las mesas. En Victoria un documento puede tener **varios Espacios**: cada uno es un lienzo infinito independiente con sus propias capas, mesas, guías, cuadrícula y vista.

### Casos de uso

- Un Espacio "Íconos" con mesas de 24×24 y otro "Hoja de impresión" con una mesa A4 donde se acomodan copias.
- Un Espacio "Bocetos" que no se exporta.
- Versiones alternativas de un diseño sin mezclar capas.

### Reglas

1. Todo documento tiene ≥ 1 Espacio. Nuevo documento = "Espacio 1".
2. Los **recursos** (muestras, degradados, estilos de párrafo/carácter, imágenes incrustadas, ajustes preestablecidos de modificadores) son **del documento** y se comparten entre Espacios.
3. Las **capas** son por Espacio.
4. **Deshacer** es global al documento; cambiar de Espacio no es una acción deshacible, pero deshacer una acción hecha en otro Espacio cambia a ese Espacio automáticamente.
5. Copiar/pegar entre Espacios funciona como entre documentos. "Pegar en el mismo lugar" (Ctrl+Mayús+V) conserva coordenadas.
6. **Mover a Espacio…**: menú contextual sobre una selección → submenú con los Espacios + "Nuevo Espacio…". Mantiene coordenadas.
7. Exportar/Imprimir permite elegir: mesa(s) del Espacio activo, todas las mesas del Espacio, o todas las mesas de todos los Espacios.
8. Opción por Espacio: **"Excluir de exportación"**.

### Interfaz

- **Barra de Espacios**: fila de pestañas debajo de las pestañas de documento, encima del lienzo. Cada pestaña: punto de color + nombre + menú (⋯). Botón "+" al final. Arrastrar para reordenar. Doble clic para renombrar.
- Atajos: Ctrl+Alt+RePág / AvPág = Espacio anterior / siguiente. Ctrl+Alt+N = nuevo Espacio.
- **Panel Espacios**: lista con miniaturas, número de mesas y objetos, visibilidad en exportación, botones Nuevo, Duplicar, Eliminar, Mover arriba/abajo.
- Menú de Espacio: Renombrar, Color de etiqueta, Duplicar, Eliminar (confirmación si tiene contenido), Excluir de exportación, Propiedades (unidades de la cuadrícula, color de fondo del lienzo).

## Mesas de trabajo

Se comportan como en Illustrator.

```ts
interface Artboard {
  id: string; name: string;
  x: number; y: number; w: number; h: number;   // pt
  bleed: { top, right, bottom, left };          // pt
  background: 'transparent' | Color;            // solo visualización/exportación
  showCenterMark: boolean; showCrossHairs: boolean; showVideoSafe: boolean;
  preset?: string;                               // 'A4', 'Carta', 'Ícono 24', …
}
```

### Herramienta Mesa de trabajo (Mayús+O)

- Arrastrar en vacío = nueva mesa. Clic en una mesa = activarla. Tiradores para redimensionar.
- Alt+arrastrar una mesa = duplicarla **con su contenido**. Opción "Mover/copiar ilustración con la mesa" (activa por defecto).
- Barra de control: preset, orientación, nombre, X, Y, An, Al, botones Nueva, Eliminar, Opciones.
- Esc vuelve a la herramienta anterior.
- Supr elimina la mesa activa (no el contenido).

### Presets incluidos

A3, A4, A5, Carta, Oficio, Tabloide, 10×15 cm (foto), 13×18 cm, Tarjeta 9×5 cm, Ícono 16/24/32/48/64/128/256/512 px, Instagram 1080×1080, Historia 1080×1920, Pantalla 1920×1080.

### Panel Mesas de trabajo

Lista numerada del Espacio activo con nombre y tamaño; reordenar (afecta orden de exportación/impresión); botones: nueva, duplicar, eliminar, reorganizar todas (diálogo: columnas, espaciado, dirección), ajustar a ilustración, ajustar a la selección.

### Visual

- Mesa: rectángulo blanco con sombra suave sobre lienzo gris (color de lienzo del tema).
- Mesa activa: borde negro 1 px; inactivas: borde gris.
- Nombre de mesa encima de su esquina superior izquierda (clic para activar, doble clic para renombrar).
- Sangrado: línea roja fina fuera de la mesa.
- Opción de vista "Recortar a mesa" (Mayús+Ctrl+H en Illustrator: "Ver › Modo de recorte") que oculta lo que queda fuera.

## Reglas añadidas en la Fase 10

- **Mover a Espacio**: Objeto › Mover a Espacio, clic derecho sobre el lienzo y «Mover selección aquí» en el menú de la pestaña de otro Espacio. Los objetos conservan sus coordenadas y aterrizan en la **primera capa** del destino (arriba del todo); «Nuevo Espacio…» crea uno (A4, una capa) y mueve en el mismo paso. La vista **se queda en el Espacio de origen** y la selección se vacía (los objetos ya no están ahí). Es **un solo paso** de deshacer, que pertenece al Espacio de origen: deshacer devuelve a ese Espacio.
- **Menú contextual del lienzo**: Agrupar, Desagrupar, Traer al frente, Enviar al fondo y Mover a Espacio, sobre la selección actual (sin selección están desactivados).
- **Panel Espacios**: lista con punto de color, miniatura (el propio renderizador del lienzo, ajustada a las mesas), nombre, «N mesas · M objetos», ojo de exportación y el número del atajo (1–9). Clic = ir al Espacio; doble clic = renombrar. Botones: Nuevo, Duplicar, Subir, Bajar, Eliminar (con confirmación si hay contenido; el último Espacio no se puede eliminar). Reordenar es una orden deshacible (`space.reorder`).
- **Barra de Espacios**: las pestañas se reordenan arrastrando (indicador azul a la izquierda del destino).
- **Atajos**: Ctrl+Alt+RePág/AvPág, Ctrl+Mayús+RePág/AvPág (alternativa para GNOME/KDE), Alt+1…9 (ir al n-ésimo; no se usa Ctrl+Alt+1…9 porque choca con Desbloquear todo, Mostrar todo y Liberar máscara de recorte de Illustrator) y Ctrl+Alt+N. Ventana › Espacios los lista (con el activo marcado).
- **Propiedades del Espacio**: tamaño y subdivisiones de la cuadrícula (en las unidades del documento; el ajuste a la cuadrícula las usa) y color del lienzo (por defecto, el del tema). La visibilidad de la cuadrícula sigue siendo global (Ver › Cuadrícula).
- **Alcance de exportar e imprimir** (`core/model/exportScope.ts`, la interfaz llega en la Fase 11): `active-artboard` (la mesa activa), `space-artboards` (todas las mesas del Espacio activo) y `all-spaces` (todas las mesas de todos los Espacios). **«Excluir de exportación» solo filtra `all-spaces`**: pedir expresamente el Espacio o la mesa activa siempre los incluye. El orden es el de los Espacios y, dentro, el de las mesas.
- **Deshacer entre Espacios**: deshacer o rehacer un paso hecho en otro Espacio trae ese Espacio al frente (ya estaba en la sesión; ahora se cubre con pruebas de un documento de tres Espacios guardado y reabierto).
