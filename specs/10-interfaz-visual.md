# 10 · Interfaz visual (para Claude Design)

> **Encargo para Claude Design:** construir la **maqueta navegable** de Victoria en HTML/CSS (sin lógica de dibujo real) **antes** de que Claude Code construya el programa. La maqueta es la referencia visual oficial. Entrega en `design/` (ver "Entregables" al final).

## Identidad

- Nombre: **Victoria**. Editor vectorial de escritorio.
- Familiar para quien viene de Illustrator (mismas zonas y densidad), pero con **identidad propia**: no usar logotipos, colores de marca, íconos ni nombres de Adobe.
- Personalidad: precisa, tranquila, profesional, densa pero aireada. El lienzo es el protagonista; la interfaz se recoge.
- Logotipo provisional: una "V" formada por dos segmentos con un nodo cuadrado en el vértice y un manejador saliendo de él. Color de acento.

## Temas

Cuatro niveles de brillo como Illustrator; la maqueta debe mostrar **Oscuro** (por defecto) y **Claro**.

### Tokens — Oscuro (por defecto)

```css
:root[data-theme="dark"] {
  --bg-app:        #1E1F22;  /* fondo general, barra de título */
  --bg-panel:      #2B2D31;  /* paneles, barra de herramientas */
  --bg-panel-alt:  #33363B;  /* cabeceras de panel, filas alternas */
  --bg-input:      #1A1B1E;  /* campos */
  --bg-hover:      #3A3D43;
  --bg-active:     #45494F;
  --canvas:        #535559;  /* lienzo infinito alrededor de las mesas */
  --artboard:      #FFFFFF;
  --border:        #3E4147;
  --border-strong: #55595F;
  --text:          #E6E7E9;
  --text-muted:    #A3A6AB;
  --text-disabled: #6B6F75;
  --icon:          #C9CBCE;
  --icon-active:   #FFFFFF;
  --accent:        #4C8DFF;  /* selección, foco, herramienta activa */
  --accent-soft:   #4C8DFF33;
  --smart-guide:   #FF3DB4;  /* magenta guías inteligentes */
  --danger:        #F0524F;
  --warning:       #F2B33D;
  --success:       #3FB97A;
  --space-colors:  #4C8DFF #3FB97A #F2B33D #F0524F #A77BFF #2EC4C9 #FF8A3D #9AA0A6;
}
```

### Tokens — Claro

```css
:root[data-theme="light"] {
  --bg-app: #E4E5E7; --bg-panel: #F3F4F5; --bg-panel-alt: #E9EAEC;
  --bg-input: #FFFFFF; --bg-hover: #E1E3E6; --bg-active: #D3D6DA;
  --canvas: #C9CBCF; --artboard: #FFFFFF; --border: #D0D3D7; --border-strong: #B4B8BD;
  --text: #1F2124; --text-muted: #5E636A; --text-disabled: #A1A5AB;
  --icon: #3B3F45; --icon-active: #000000;
  --accent: #2F6FE8; --accent-soft: #2F6FE826; --smart-guide: #E0189A;
}
```

### Tipografía de la interfaz

- Familia: **Inter**, **incluida con la app** (no depender de fuentes del sistema, para que se vea igual en Windows y Linux). Números en campos: `font-variant-numeric: tabular-nums`.
- Tamaños: 11 px etiquetas y campos (densidad Illustrator), 12 px texto de menús y listas, 13 px títulos de diálogo, 10 px microetiquetas (unidades).
- Pesos: 400 normal, 600 títulos de sección de panel.

### Medidas y ritmo

- Rejilla base 4 px. Radio: 3 px controles, 6 px diálogos y menús flotantes.
- Alto de campo/botón: 22 px. Alto de fila de lista (Capas): 28 px. Ícono: **16 px** en paneles y menús, **20 px** en barra de herramientas, trazo de 1.5 px.
- Sombras solo en elementos flotantes: `0 8px 24px rgba(0,0,0,.35)`.

## Disposición de la ventana (1440×900 de referencia)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [V] Archivo Edición Objeto Texto Selección Modificador Ver Ventana Ayuda  [▭][–][□][×] │ 32 px barra de título + menú
├──────────────────────────────────────────────────────────────────────────────┤
│ Barra de control contextual (herramienta / selección)                         │ 36 px
├──┬───────────────────────────────────────────────────────────────┬───────────┤
│  │ [doc1.vict ×] [logo.vict ●×] [+]                               │ │Propied.│ │ 30 px pestañas documento
│H │ (●Íconos) (●Hoja A4) (●Bocetos) [+]                            │ │Capas   │ │ 28 px barra de Espacios
│E │ ┌ regla ───────────────────────────────────────────────────┐   │ │        │ │
│R │ │                                                         │   │ │Paneles │ │
│R │ │        LIENZO (gris) con mesas blancas                  │   │ │acopl.  │ │ columna derecha 280 px
│A │ │                                                         │   │ │        │ │ (+ tira de íconos 36 px
│M │ │                                                         │   │ │        │ │  de paneles contraídos)
│. │ └─────────────────────────────────────────────────────────┘   │ │        │ │
│48│                                                               │           │
├──┴───────────────────────────────────────────────────────────────┴───────────┤
│ 100% ▾ │ ◂ Mesa 1 ▾ ▸ │ Selección │ X 120 pt  Y 48 pt │ Espacio: Íconos · 3 mesas │ 24 px barra de estado
└──────────────────────────────────────────────────────────────────────────────┘
```

### 1. Barra de título + menú (32 px)
Ventana sin marco (`frame: false`): logotipo 16 px, menús en línea, a la derecha selector de **espacio de trabajo** (Esenciales, Íconos, Impresión, Texto) con ícono, y controles de ventana. Área arrastrable.

Controles de ventana — maquetar **dos variantes** (la app elige según el sistema):
- **Windows**: minimizar / maximizar / cerrar a la derecha, 46×32 px cada uno, cerrar en rojo al pasar.
- **Linux**: tres botones circulares de 20 px a la derecha (estilo neutro, compatible con GNOME y KDE), con 8 px de separación. Mostrar también la variante con **barra de título del sistema** (la barra de 32 px queda solo con menús y selector de espacio de trabajo).

### 2. Barra de control (36 px)
Contextual, como la de Illustrator. Ejemplos a maquetar:
- **Selección (objeto)**: miniatura de tipo · Relleno (muestra + ▾) · Trazo (muestra + ▾ + grosor) · Perfil · Opacidad · fx · Alinear (6 íconos) · X Y An Al con 🔗 · ángulo · Aislar · menú ≡.
- **Selección directa (nodos)**: "Convertir: esquina | suave" · manejadores mostrar/ocultar · eliminar ancla · cortar en ancla · unir · radio de esquina · X Y del nodo.
- **Texto**: fuente (con vista previa) · estilo · tamaño · alineación de párrafo · color.
- **Mesa de trabajo**: preset · orientación · nombre · X Y An Al · nueva · eliminar · opciones.

### 3. Barra de herramientas (izquierda, 48 px, una columna; conmutable a dos columnas de 72 px)
Orden y separadores:
1. Selección · Selección directa · Lazo
2. Pluma (grupo: añadir/eliminar/convertir) · Curvatura · Lápiz (grupo)
3. Texto (grupo: área, en trazado) · Línea · Rectángulo (grupo: redondeado, elipse, polígono, estrella)
4. Rotar (grupo: reflejar) · Escala · Transformación libre · Creador de formas
5. Tijeras · Degradado · Cuentagotas
6. Mesa de trabajo
7. Mano · Zoom
8. Muestra relleno/trazo superpuesta (32×32) con intercambiar y por defecto; fila Color/Degradado/Ninguno
9. Modo de dibujo (normal/detrás/dentro) · Modo de pantalla

Herramienta activa: fondo `--bg-active` + borde izquierdo 2 px `--accent`. Grupo: triángulo de 4 px en la esquina inferior derecha. Desplegable de grupo: menú flotante horizontal con ícono + nombre + atajo.

### 4. Pestañas de documento (30 px)
Nombre, punto "●" si hay cambios sin guardar, × al pasar. Pestaña activa del color del lienzo (se funde con él).

### 5. Barra de Espacios (28 px) — elemento nuevo, debe destacar sin estorbar
- Pestañas en forma de "píldora" de 22 px: punto de color 8 px + nombre + (al pasar) ⋯.
- Activa: fondo `--bg-panel-alt`, texto `--text`, subrayado 2 px del color del Espacio.
- Botón "+" (ícono `space-add`), y a la derecha botón de panel Espacios (ícono `spaces`).
- Estado: arrastrando una pestaña para reordenar (indicador de inserción).
- Menú contextual con íconos: Renombrar, Color ▸ (8 círculos), Duplicar, Excluir de exportación, Propiedades, Eliminar (rojo).

### 6. Lienzo
- Fondo `--canvas`; mesas blancas con sombra `0 1px 3px rgba(0,0,0,.4)`; nombre de mesa en 11 px `--text-muted` encima.
- Reglas de 18 px (`--bg-panel`, marcas `--text-muted`), origen en la esquina superior izquierda de la mesa activa.
- **Mostrar en la maqueta** (como imagen/SVG estático sobre el lienzo): un ícono a medio dibujar con la pluma — nodos cuadrados 6×6 px (seleccionado: relleno `--accent`; no seleccionado: blanco con borde `--accent`), manejadores como líneas de 1 px con círculo de 5 px al extremo; cuadro delimitador con 8 tiradores 7×7 blancos de borde azul; una guía inteligente magenta con etiqueta "ancla"; una etiqueta de medida flotante (fondo `--accent`, texto blanco: "An: 24 pt  Al: 24 pt"); un texto sobre una curva con sus tres corchetes; y una región del Creador de formas resaltada con patrón de puntos grises.

### 7. Columna de paneles (derecha, 280 px)
- Grupos apilados; cada grupo tiene fila de pestañas (24 px, texto 11 px, ícono 14 px), menú ≡ y botón contraer.
- Secciones dentro de panel con título 11 px semibold en mayúsculas pequeñas y chevron para plegar.
- Tira de paneles contraídos (36 px): solo íconos verticales con tooltip; clic abre el panel flotante al lado.
- Grupos por defecto (espacio de trabajo "Esenciales"):
  1. Propiedades | Capas | Espacios
  2. Relleno y color | Muestras | Degradado
  3. Trazo | Apariencia
  4. Carácter | Párrafo
  5. Alineación | Espaciado | Transformar | Buscatrazos

### 8. Barra de estado (24 px)
Zoom (campo editable + ▾) · navegador de mesas (◂ nombre ▾ ▸) · herramienta actual · coordenadas del cursor · nombre del Espacio + nº de mesas · indicador de autoguardado (ícono nube/disco + "Guardado hace 1 min").

## Componentes (biblioteca a maquetar)

| Componente | Especificación |
|---|---|
| Botón ícono | 24×24, ícono 16, estados: normal, hover, presionado, activo (toggle), deshabilitado, foco (anillo 2 px `--accent`) |
| Grupo segmentado | Botones ícono unidos, borde común, 1 activo |
| Campo numérico | 22 px alto, ícono o etiqueta a la izquierda (sin arrastre scrubby ni cursor ↔; ver «Comportamiento de los campos numéricos»), valor alineado a la derecha, unidad en `--text-muted`, flechas ▴▾ al pasar, ▾ con valores comunes |
| Campo con candado | Dos campos + ícono de cadena entre ellos (An/Al) |
| Selector de punto de referencia | Cuadrícula 3×3 de cuadritos 5 px |
| Muestra de color | 16×16 / 22×22, tablero de ajedrez para transparencia, diagonal roja = Ninguno |
| Superposición relleno/trazo | Dos cuadros 22 px superpuestos (relleno arriba-izquierda, trazo hueco abajo-derecha) |
| Deslizador | Pista 4 px, pulgar 10 px; deslizadores de color con su degradado de fondo |
| Desplegable | Con ícono de la opción elegida a la izquierda |
| Fila de capa | ojo · candado · barra de color 3 px · ▸ · miniatura 20 px · nombre · ○ destino · ■ selección |
| Fila de apariencia | ojo · ícono tipo (relleno/trazo/fx estructural/fx apariencia) · muestra · valor · ▸ |
| Pestaña de Espacio | ver sección 5 |
| Menú | 12 px, fila 26 px, **ícono 16 px obligatorio a la izquierda**, atajo alineado a la derecha en `--text-muted`, submenú ▸, separadores |
| Tooltip | Nombre + atajo en chip: "Pluma  (P)", demora 500 ms |
| Diálogo | Título 13 px, cuerpo con secciones, casilla "Previsualizar" a la izquierda del pie, Cancelar / Aceptar a la derecha |
| Notificación (toast) | Abajo a la derecha, ícono + texto + acción |

### Comportamiento de los campos numéricos

Decisión del usuario (Fase 1, revisión), tiene prioridad sobre la maqueta y sobre las menciones a «scrubby» de las specs 05 y 06:

- **Rueda del ratón** sobre un campo enfocado o bajo el cursor incrementa/decrementa el valor (Mayús = ×10, Alt = ×0,1). No se usa arrastre horizontal ni cursor ↔.
- **Expresiones aritméticas**: al pulsar Intro (o salir del campo) se evalúa la expresión como en Illustrator: `15 + 5` → `20`; admite `+ − × / * ( )`, decimales con coma o punto y unidades (`2 cm + 5 mm`, convertidas a la unidad del campo). Una expresión inválida restaura el valor anterior. El evaluador es TypeScript puro en `core` (sin `eval`) y se prueba con Vitest.
- Pendiente de implementar con el primer campo editable real (Fase 4/6); en la Fase 1 los campos son solo de lectura.

## Pantallas a maquetar (entregables)

1. **Pantalla de inicio**: logotipo, "Nuevo" con presets en tarjetas con ícono (A4, Carta, Ícono 24 px, Instagram, Personalizado), lista de recientes con miniatura, botón Abrir, recuperación de autoguardado si existe.
2. **Diálogo Nuevo documento**: presets por categorías (Imprimir, Íconos, Web, Redes), ancho/alto/unidades/orientación, número de mesas, sangrado, modo de color, nombre del primer Espacio.
3. **Ventana principal — herramienta Pluma** dibujando un ícono (estado descrito en §6), tema oscuro.
4. **Ventana principal — Selección + panel Apariencia** con un objeto que tiene 2 modificadores (uno estructural "Redondear esquinas", uno de apariencia "Sombra paralela").
5. **Ventana principal — Texto**: texto sobre trazado seleccionado, paneles Carácter y Párrafo abiertos, menú de fuentes desplegado con vista previa.
6. **Ventana principal — Creador de formas** con regiones resaltadas.
7. **Ventana principal — Espacios**: tres Espacios, menú contextual de un Espacio abierto, panel Espacios con miniaturas.
8. **Herramienta Mesa de trabajo** activa con 4 mesas y la barra de control de mesas.
9. **Acomodar para imprimir**: mesa A4 con 8 fotos en rejilla, panel Espaciado (sección Rejilla) abierto.
10. **Calco de imagen**: imagen a la izquierda en la mesa, panel Calco con ajustes, vista "Resultado con contornos".
11. **Diálogo de modificador** (Zigzag) con Previsualizar.
12. **Diálogo Imprimir** con previsualización de página y marcas de corte.
13. **Exportar para pantallas**.
14. **Menú Modificador** desplegado con todos sus submenús e íconos.
15. Las pantallas 3 y 5 también en **tema claro**, y la pantalla 3 con la **barra de título de Linux** (ambas variantes de §1).
16. **Hoja de componentes** (todos los componentes y estados de la tabla anterior).
17. **Hoja de íconos** con el catálogo completo de `11-iconografia.md`.

## Entregables en `design/`

```
design/
├─ index.html             # navegación entre pantallas
├─ screens/*.html         # una por pantalla (1440×900)
├─ components.html
├─ icons.html
├─ tokens.css             # exactamente los tokens de esta spec
└─ png/*.png              # capturas de referencia
```

Requisitos: HTML/CSS estático (puede usar React si facilita), sin dependencias de red, íconos como SVG inline reutilizables (para trasladarlos a `src/renderer/icons/`). Usar nombres de clase y tokens que Claude Code pueda reutilizar.
