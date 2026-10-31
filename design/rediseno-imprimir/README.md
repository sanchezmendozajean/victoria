# Rediseño del diálogo Imprimir

Especificación para implementar en Victoria el nuevo diálogo **Archivo → Imprimir**. Reemplaza al diálogo actual y a la maqueta `../screens/12-dialogo-imprimir.dc.html`.

- **Prototipo de referencia:** `dialogo-imprimir.html`. Ábrelo en el navegador; usa `../icons.js` y es totalmente interactivo. Es la fuente de verdad para el aspecto y el comportamiento.
- **Tokens:** `../tokens.css` (specs/10-interfaz-visual.md).
- **Íconos:** `../icons.js` (specs/11-iconografia.md). Todos los íconos del diálogo existen en el catálogo.
- **Componentes:** `../components.dc.html`. Los nombres entre `[corchetes]` abajo son el `data-vc` del componente que hay que reutilizar.

> El prototipo contiene elementos que **no** se implementan: los círculos morados numerados (notas de la propuesta), la sección «Qué cambia…», el texto de introducción, las tres mesas de ejemplo con su arte, el toast que simula acciones y el margen no imprimible fijo de 3,2 mm. Todo eso es material de demostración.

---

## 1. Estructura

Diálogo modal `[dialog]` de tamaño **fijo**: el cuerpo mide 620 px de alto y no cambia al mostrar u ocultar campos (por ejemplo, el campo Rango). La columna de ajustes se desplaza por dentro.

```
┌ Encabezado 36 px: ícono print 16 · «Imprimir» 13 semibold · «· nombre.vict» muted · [icon-button] close ┐
├──────────────────────────────────────────────┬───────────────────────────────┤
│ VISTA PREVIA (flex 1, fondo --canvas)          │ AJUSTES (380 px, scroll)      │
│  hoja a escala con sombra --shadow-artboard     │  1 Impresora                  │
│  ‹ Página i de n · Mesa · Hoja A4 vertical ›   │  2 Qué imprimir               │
│  leyenda (solo lo que esté visible)            │  3 Papel                      │
│                                                │  4 Tamaño y posición          │
│                                                │  5 Marcas y sangrado          │
├──────────────────────────────────────────────┴───────────────────────────────┤
│ Pie 44 px: [⚠ N advertencias] · resumen ……………… [Cancelar] [Imprimir]           │
└────────────────────────────────────────────────────────────────────────────────┘
```

- Títulos de sección: 10 px, semibold, mayúsculas, `letter-spacing .06em`, `--text-muted`. Las secciones se separan con un borde superior de 1 px `--border` y 12 px de padding.
- Filas: rejilla `104px | 1fr`. La etiqueta va en `--text-muted` con un ícono de 14 px a la izquierda.
- Todos los controles miden `--h-control` (22 px). Los textos de control van a 12 px y las etiquetas a 11 px.

## 2. Controles

| Sección | Control | Componente | Detalle |
|---|---|---|---|
| Impresora | Destino | `[dropdown]` | Ícono `print` (o `file` para «Guardar como PDF»). Lista de impresoras del sistema + «Guardar como PDF». |
| | Estado | texto 11 px | Punto de 6 px `--success` + estado («Lista · USB»). A la derecha, enlace «Preferencias…» (ícono `preferences` 12, `--accent`, tooltip «Preferencias de la impresora»). Se oculta para PDF. |
| | Copias | `[number-field]` | Ícono de fila `copies`. Rango 1–99, flechas de 9 px y ↑/↓ del teclado. |
| | Intercalar | casilla | **Solo visible si copias ≥ 2.** Marcada por defecto. |
| | Color | `[dropdown]` | Ícono de fila `color-model`. Opciones: Color / Escala de grises. La vista previa se desatura en gris. |
| Qué imprimir | — | `[segmented]` ícono + etiqueta | `tool-artboard` «Mesa activa» · `fit-all` «Todas (N)» · «Rango». |
| | Rango | campo de texto | **Solo visible con «Rango».** Placeholder «Ej.: 1-2, 3». Ver validación en §4. |
| | Resumen | 11 px muted | «Mesa 1 (Póster)» o «Mesas 1 (Póster), 3 (Banner)». |
| Papel | Tamaño | `[dropdown]` | Ícono `page`. Formato «A4 (210 × 297 mm)». Lista según la impresora (A3 solo si el destino lo admite). |
| | Orientación | `[segmented]` | «Auto» · `artboard-portrait` · `artboard-landscape`, solo íconos con tooltip «Vertical» / «Horizontal». |
| Tamaño y posición | Escala | `[segmented]` | `actual-size` «100 %» · `fit-artboard` «Ajustar a la hoja» · «Personalizada». |
| | Escala % | `[number-field]` | Unidad «%». Rango 5–400, paso 5. Editable solo con «Personalizada»; en los otros modos (opacidad .45) muestra la escala efectiva calculada. Con «Ajustar» y varias mesas, añade «Varía por mesa». |
| | Posición | `[ref-point]` | 3×3 celdas de 9 px, separación 2 px, la activa en `--accent`. Por defecto: centro. Ver §3. |
| Marcas y sangrado | Marcas de corte | casilla + ícono `crop-marks` 16 | |
| | Incluir sangrado | casilla + ícono `bleed` 16 | Al lado, `[number-field]` en mm (0–20, paso 1), activo solo si la casilla está marcada. Valor inicial: el sangrado del documento. |

Las **casillas** son las del sistema: 12 × 12, radio 2, borde `--border-strong` y fondo `--bg-input`. Marcadas llevan fondo `--accent` con el ícono `check` de 10 px en blanco.

## 3. Cálculo de la página (en mm)

Por cada mesa a imprimir:

```
orientación: landscape si Orientación = Horizontal, o si es Auto y mesa.w > mesa.h
pw, ph      = papel (intercambiados si es landscape)
m           = margen no imprimible del controlador de la impresora (0 para PDF)
b           = sangrado ? sangradoMm : 0
k           = marcas ? b + 8 : 0          // marca: desplazamiento b+3, largo 5 mm
pad         = max(b, k)
s (escala)  = 100 %      → 1
              Ajustar    → min((pw − 2m − 2pad)/mesa.w, (ph − 2m − 2pad)/mesa.h)
              Personal.  → pct/100
sw, sh      = mesa.w·s, mesa.h·s
x           = col 0: m+pad · col 1: (pw−sw)/2 · col 2: pw−m−pad−sw   (igual para y con la fila)
```

- **Posición sin efecto:** si la holgura en ambos ejes (`pw − 2(m+pad) − sw`, ídem para alto) es ≤ 0,5 mm, el ref-point se desactiva (opacidad .45) y muestra la nota «La mesa ocupa toda la hoja.».
- **Recorte:** es el máximo exceso del rectángulo arte+sangrado fuera del área imprimible `[m, pw−m] × [m, ph−m]`.
- **Resolución de imagen:** `ppp = px_imagen / (ancho_colocado_mm · s / 25,4)`, calculada por cada imagen enlazada o incrustada en las mesas impresas.

## 4. Vista previa

- La hoja se escala para caber en el área con 10 px de margen y se centra. El fondo es `--canvas` y la hoja `--artboard`.
- Dibuja el arte real de la mesa en `x, y, sw, sh`.
- **Área imprimible:** rectángulo discontinuo de 1 px `rgba(76,141,255,.55)` en `m` (no se dibuja si m = 0).
- **Sangrado:** rectángulo de 1 px `#F0524F` a `b` mm alrededor de la mesa.
- **Marcas de corte:** 8 trazos negros (dos por esquina) de 0,25 pt (mínimo 1 px en pantalla), a `b+3` mm del borde y de 5 mm de largo.
- **Zona recortada:** solo cuando hay recorte, rayado rojo diagonal sobre el margen no imprimible.
- **Leyenda:** muestra únicamente los elementos visibles en ese momento (Área imprimible, Marcas de corte, Sangrado, Se recorta).
- **Paginación:** botones `[icon-button]` `chevron-left` / `chevron-right`, deshabilitados en los extremos. El texto es «Página i de n · Póster · Hoja A4 horizontal». Al cambiar «Qué imprimir», vuelve a la página 1.

## 5. Validación del rango

Acepta números y rangos separados por comas («1-3, 5»), sin duplicados y en el orden escrito. Un rango invertido («3-1») se normaliza. Mensajes, que van bajo el campo en `--danger` y con el borde del campo en `--danger`:

- vacío → «Escribe al menos una mesa.»
- token inválido → ««x» no es un número ni un rango válido.»
- fuera de rango → «El documento tiene N mesas; «x» se sale de ese rango.»

Con el rango inválido, Imprimir se deshabilita y se añade una advertencia «Revisa el rango.».

## 6. Advertencias

No van dentro de los ajustes. En la **esquina inferior izquierda del pie** aparece un botón (24 px, sin fondo, hover `--bg-hover`) con el ícono `alert` de 16 px en `--warning` y el texto «1 advertencia» / «N advertencias». **Si no hay advertencias, el botón no existe.**

Al hacer clic se abre un **popover** anclado encima del botón, alineado a la izquierda, con 8 px de separación y ancho máx. 380 px. Usa el estilo de menú flotante: `--bg-panel`, borde `--border-strong`, radio 6, `--shadow-float` y padding 4.
- Cabecera de 26 px: «N ADVERTENCIAS» (10 px, mayúsculas, muted) y un `[icon-button]` `close` de 12 px.
- Cada advertencia: ícono `alert` 16 en `--warning`, texto 12 px con la primera frase en semibold y, debajo, una acción opcional. La acción es texto `--accent` con ícono de 14 px, 24 px de alto y hover `--bg-hover`. Las advertencias se separan con un borde de 1 px.
- El popover se cierra con la ×, con Esc (el foco vuelve al botón), al hacer clic fuera, o solo cuando ya no quedan advertencias. Al ejecutar una acción, el popover sigue abierto y la lista se recalcula.

| Condición | Texto | Acción |
|---|---|---|
| Rango inválido | **Revisa el rango.** + mensaje de §5 | — |
| Alguna imagen < 150 ppp | **1 imagen se imprimirá a 123 ppp.** Para impresión se recomiendan 150 ppp o más; puede verse pixelada. (plural: «N imágenes se imprimirán a X ppp» con el peor valor; «pueden verse pixeladas») | `image` «Seleccionar imagen» → cierra el diálogo y selecciona la imagen en su mesa |
| Recorte > 0,05 mm | **La mesa Póster se sale del área imprimible** hasta 12,4 mm. Esa parte no se imprimirá. (plural: «N mesas se salen…») | `fit-artboard` «Ajustar a la hoja» → Escala = Ajustar |
| Si no hay recorte, pero las marcas de corte salen del área imprimible | **Las marcas de corte no caben** en el área imprimible con la escala actual. | `fit-artboard` «Ajustar a la hoja» |

Usa siempre el singular o el plural correcto. El ámbar indica una advertencia, no un error: no uses `--danger` en este botón.

## 7. Pie

- Orden: botón de advertencias (si lo hay) · resumen · espacio flexible · Cancelar · Imprimir.
- **Resumen** 12 px muted, con la cantidad de hojas en `--text` semibold: «**3 hojas** · A4 · 2 copias intercaladas · Color». Las hojas son mesas a imprimir × copias. «intercaladas» solo aparece con copias ≥ 2 e Intercalar activo.
- **Cancelar:** botón de 24 px, `--bg-panel-alt`, borde `--border`, con el ícono `close` 14.
- **Imprimir:** botón primario de 24 px, `--accent`, texto blanco, con el ícono `print` 14. Con el destino PDF, el texto pasa a «Guardar PDF». Se deshabilita (opacidad .5) si no hay hojas que imprimir.
- **Teclado:** Enter = Imprimir y Esc = Cancelar, salvo que haya un popover abierto, en cuyo caso Esc lo cierra primero.

## 8. Valores por defecto y memoria

- Al abrir: Mesa activa · 1 copia · Color · papel y orientación Auto · Escala 100 % · Posición centro · marcas y sangrado desactivados (o según la configuración del documento, si existe).
- Se recuerdan por documento: impresora, papel, orientación, escala, posición, marcas, sangrado y color. No se recuerdan las copias ni el rango.

## 9. Criterios de aceptación

1. El tamaño del diálogo no cambia al alternar Mesa activa / Todas / Rango, ni al mostrar u ocultar Intercalar.
2. Cada cambio de ajuste actualiza la vista previa, la escala efectiva, las advertencias y el resumen sin retraso visible.
3. En Orientación Auto, una mesa apaisada se previsualiza e imprime en hoja horizontal y una vertical en hoja vertical, dentro del mismo trabajo.
4. Las advertencias de ppp se recalculan con la escala: pasar de 100 % a Ajustar puede hacer que aparezcan o desaparezcan.
5. Con 0 advertencias no se ve ningún indicador en el pie.
6. La interfaz es correcta en tema oscuro y claro usando solo los tokens de `tokens.css`.
7. Todos los íconos salen de `icons.js`, sin SVG sueltos.
