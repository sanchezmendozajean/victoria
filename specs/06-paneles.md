# 06 · Paneles

Todos los paneles: acoplables a la columna derecha, agrupables en pestañas, contraíbles a solo ícono, flotantes, y con menú (≡) en su cabecera. El diseño de espacios de trabajo (disposición de paneles) se guarda y se puede restablecer. Cada control lleva ícono y tooltip.

## Prioridad

| Panel | Atajo | v | Prioridad del usuario |
|---|---|---|---|
| Propiedades (contextual) | — | 1 | |
| **Texto: Carácter** | Ctrl+T | 1 | ★ |
| **Texto: Párrafo** | Alt+Ctrl+T | 1 | ★ |
| **Alineación** | Mayús+F7 | 1 | ★ |
| **Espaciado** | — | 1 | ★ |
| **Trazo** | Ctrl+F10 | 1 | ★ |
| **Relleno y color** | F6 | 1 | ★ |
| Muestras | — | 1 | |
| Degradado | Ctrl+F9 | 1 | |
| Apariencia (con Modificadores) | Mayús+F6 | 1 | |
| Capas | F7 | 1 | |
| Espacios | — | 1 | nuevo |
| Mesas de trabajo | — | 1 | |
| Transformar | Mayús+F8 | 1 | |
| Buscatrazos | Mayús+Ctrl+F9 | 1 | |
| Calco de imagen (Vectorizar) | — | 1 | |
| Glifos | Alt+Mayús+F11 | 2 | |
| Estilos de carácter/párrafo | — | 2 | |
| Historial | — | 2 | |

---

## Propiedades (contextual)

Como el panel Propiedades de Illustrator CC: cambia según la selección.
- Sin selección: Documento (unidades, mesa activa, botón "Editar mesas"), Reglas y cuadrículas, Guías, Ajustar a, Preferencias rápidas.
- Con objeto: Transformar (X, Y, An, Al, ángulo, enlazar proporción, reflejar H/V), Apariencia (relleno, trazo, opacidad, fx), Alinear (fila compacta), Acciones rápidas (Agrupar, Aislar, Organizar, Contornear, Calco…).
- Con texto: Carácter y Párrafo resumidos + "Crear contornos".
- Con forma viva: parámetros de la forma (radios por esquina con candado, lados, puntas).

## Texto: Carácter (★)

Fuente (buscador con vista previa en su propia tipografía, favoritos ★, recientes arriba), estilo, tamaño, interlineado (Auto), kerning (Auto/Óptico/Métrico/0/valor), tracking, escala vertical, escala horizontal, desplazamiento de línea base, rotación de caracteres, mayúsculas, versalitas, superíndice, subíndice, subrayado, tachado, idioma, antialiasing. Cada campo con ícono a la izquierda (igual que Illustrator) y edición con la rueda del ratón y expresiones aritméticas (ver specs/10 · Comportamiento de los campos numéricos).

## Texto: Párrafo (★)

Alinear izquierda/centro/derecha, justificar (última línea izq/centro/der), justificar todo; sangría izquierda, derecha, primera línea; espacio antes/después; separación por sílabas (casilla).

## Alineación (★)

Fila 1 — **Alinear objetos**: izquierda, centro horizontal, derecha, arriba, centro vertical, abajo.
Fila 2 — **Distribuir objetos**: por arriba, centro V, abajo, izquierda, centro H, derecha.
Fila 3 — **Alinear a**: Selección | Objeto clave | Mesa de trabajo (selector con ícono). Con "Objeto clave", el siguiente clic sobre un objeto lo marca (borde grueso azul).
Opción: "Usar límites de previsualización" (incluye grosor de trazo).

## Espaciado (★)

Panel dedicado (en Illustrator es una sección del panel Alinear; aquí es independiente y más completo):
- **Distribuir espaciado**: horizontal / vertical, con valor exacto (pt) o "Auto". Respecta el objeto clave si está definido.
- **Espaciado igual en rejilla**: organizar la selección en filas × columnas con separación H y V (útil para acomodar imágenes para imprimir).
- **Ajustar a mesa con margen**: repartir la selección dentro de la mesa activa respetando márgenes.
- Indicador de espaciado actual entre objetos seleccionados (si es uniforme muestra el valor; si no, "Mixto").

## Trazo (★)

Grosor (con desplegable de valores), extremos (recto/redondeado/proyectado), esquinas (inglete/redondeada/biselada), límite de inglete, alinear trazo (centro/interior/exterior), **línea discontinua** (6 campos guion/hueco, conservar longitudes / alinear a esquinas), **puntas de flecha** inicio/fin (catálogo con miniaturas), escala de puntas, alinear puntas (extender más allá / dentro del final), **perfil de ancho variable** (desplegable con miniaturas: uniforme, perfiles 1–6), y voltear perfil.

## Relleno y color (★)

- Muestra superpuesta relleno/trazo (como Illustrator, esquina superior izquierda): clic activa uno, flecha curva intercambia (Mayús+X), icono "por defecto" (D), y botones Color / Degradado / Ninguno (`,` `.` `/`).
- Selector de modelo: RGB, HSB, CMYK, Escala de grises, HEX. Deslizadores con degradado de previsualización.
- Rampa de color (espectro) en la parte inferior.
- Cuentagotas de pantalla.
- Selector de color completo (diálogo al hacer doble clic en la muestra): cuadro de saturación/brillo, barra de tono, campos, "Solo colores web", colores recientes.
- Opacidad y modo de fusión del objeto en la misma sección.

## Muestras

Rejilla/lista, grupos de color, muestras globales (triángulo blanco en la esquina), nuevas desde la selección, importar paleta (`.ase`, `.gpl`), biblioteca básica incluida.

## Degradado

Tipo lineal/radial, ángulo, relación de aspecto, barra con puntos de color (añadir con clic, quitar arrastrando fuera), punto medio, opacidad por parada, invertir, aplicar a trazo (dentro/a lo largo/a través).

## Apariencia

Lista: nombre del objeto; filas de Trazo, Relleno y Modificadores con ojo, color, valor, y flecha para desplegar los modificadores anidados. Botones inferiores: añadir trazo, añadir relleno, **fx (añadir modificador)**, borrar apariencia, duplicar elemento, eliminar elemento. Menú: "Aplicar modificadores", "Nueva ilustración tiene apariencia básica".

## Capas

Árbol con: ojo, candado, color de capa (barra lateral), miniatura, nombre (doble clic renombra), círculo de destino (target; doble anillo si tiene apariencia), cuadrito de selección de color de capa. Arrastrar para reordenar o mover objetos entre capas; Alt+clic en ojo = solo esta capa; Ctrl+clic en ojo = modo contorno de esa capa. Botones: nueva capa, nueva subcapa, crear máscara de recorte, localizar objeto, eliminar.

## Transformar

X, Y, An, Al con punto de referencia (cuadrícula 3×3), ángulo, distorsión, enlazar proporción, escalar trazos y efectos (casilla), y para formas vivas los parámetros de forma.

## Buscatrazos

Modos de forma: Unir, Menos frente, Intersecar, Excluir (Alt+clic = crear como Buscatrazos vivo / modificador), botón Expandir. Buscatrazos: Dividir, Recortar, Combinar, Cortar, Contorno, Menos detrás.

## Calco de imagen

Ver `08-imagenes-vectorizar-imprimir.md`.

---

## Reglas añadidas en la Fase 6

Decisiones de comportamiento que la spec no cubría (cada una tiene su prueba) y limitaciones conocidas.

### Valores mixtos y aspecto actual

- Un panel muestra el valor que **comparten todos los objetos seleccionados**; si difieren, el campo queda **vacío** (los deslizadores sin pulgar) y editarlo aplica el valor a todos. Un grupo equivale a los objetos que contiene (cambiar su relleno cambia el de sus hijos). Un objeto sin relleno o sin trazo cuenta como «ninguno».
- El **aspecto actual** (relleno, trazo y atributos de trazo del siguiente objeto) vive en la interfaz, no en el documento: con nada seleccionado los controles lo editan; al seleccionar objetos el aspecto actual adopta el del primero (los nuevos objetos nacen con lo último que se tocó). Las herramientas de dibujo y el diálogo de formas lo usan; la línea nace solo con trazo.
- Atajos: **D** colores por defecto, **X** alternar relleno/trazo, **Mayús+X** intercambiar, **,** Color (recupera el último color usado), **.** Degradado, **/** Ninguno.

### Relleno y color, muestras y selector

- Los deslizadores y campos editan el color en el modelo elegido (RGB, HSB, CMYK, grises) y HEX; **un arrastre de deslizador es un solo paso de deshacer**. Editar el color de un objeto que usa una muestra lo convierte en color sólido (la muestra no cambia). La rampa tiene el tono arriba y los grises abajo. Los **colores recientes** (12) se guardan como preferencia de interfaz.
- El selector completo (doble clic en la muestra) aplica una **vista previa en vivo**; Cancelar la revierte; «Solo colores web» ajusta cada canal a múltiplos de 51.
- **Muestras**: cuadrícula o lista, grupos, global (triángulo blanco en la esquina; actualiza todos los objetos que la usan), nueva desde la selección, mover a grupo, opciones (nombre, color HEX, global), eliminar (los objetos conservan el color), importar `.gpl` y `.ase` (RGB, CMYK, grises, Lab; los grupos ASE son grupos de muestras) y la biblioteca básica (29 muestras, sin duplicar por nombre).

### Degradado

- Un degradado es un recurso del documento; **editarlo copia el recurso si lo comparten objetos fuera de la selección**, así duplicar un objeto nunca enlaza sus degradados. El ángulo es antihorario (como Illustrator); el radial admite relación de aspecto y se pinta como elipse; el punto medio de una parada curva la mezcla con la siguiente.
- La barra del panel: clic añade una parada con el color que había ahí, arrastrar mueve, **arrastrar hacia abajo la quita** (quedan siempre dos); los rombos son los puntos medios.
- Herramienta **Degradado (G)**: arrastrar sobre la selección da el degradado (o lo reorienta); un clic da uno que llena los límites. El anotador muestra origen (círculo), final (cuadrado), relación de aspecto (radial), paradas **colgadas 14 px bajo el eje** (para que no tapen los extremos) y puntos medios; clic en el eje añade parada, doble clic en una parada la quita, Mayús restringe a 45°.
- **Pendiente**: aplicar degradado a lo largo / a través del trazo (el lienzo 2D no lo permite sin construir el contorno); los degradados de trazo usan la aproximación circular.

### Trazo

- Perfil de ancho: uniforme y 6 perfiles (afinado al final, afinado al inicio, lente, abultado, estrechado, ensanchado), con voltear. Se dibuja como un contorno relleno con el color del trazo; **un perfil no se combina con guiones** (el perfil manda) y usa extremos rectos.
- Guiones: hasta 6 valores; «Alinear guiones a esquinas y extremos» ajusta el patrón para que quepa un número entero de veces en cada contorno.
- Puntas de flecha (7: simple, con muescas, abierta, círculo, rombo, cuadrado, barra): tamaño proporcional al grosor, escala en % (largo y ancho), y alineación **punta en el final** (por defecto) o **extendida más allá**. El trazo se recorta bajo la punta.
- «Escalar trazos y efectos» (panel Transformar, **desactivado por defecto**, como Illustrator) afecta a todo escalado: cajas, campos, Escala y diálogos; el grosor y los guiones siguen la raíz del determinante, en el mismo paso de deshacer.

### Alineación, espaciado y Transformar

- Alinear a la **selección**, al **objeto clave** (clic sobre uno de los objetos seleccionados mientras está activo ese modo; se marca con borde grueso azul) o a la **mesa**. Con un solo objeto solo alinea a la mesa. «Usar límites de previsualización» incluye el trazo.
- Distribuir por bordes o centros deja fijos los extremos; **Distribuir espaciado** con valor deja fijo el objeto clave (o el primero), «Auto» reparte entre los extremos; el indicador muestra el espacio compartido o «Mixto».
- Rejilla: orden de lectura, celda del tamaño del objeto mayor, objetos en la esquina superior izquierda de su celda. Ajustar a la mesa con margen: en cada eje los extremos tocan los márgenes y el resto se reparte.
- Transformar y la barra de control comparten las mismas operaciones (X/Y con punto de referencia, An/Al con proporción, ángulo, distorsión horizontal, reflejar); el ángulo muestra el giro del objeto único. Con una forma viva seleccionada aparecen sus parámetros (radios de esquina con candado, lados, puntas, ángulos de la tarta).

### Capas, Propiedades y Cuentagotas

- Capas: arriba la capa superior; ojo (**Alt** = solo esta capa, otra vez la restaura; **Ctrl** = modo contorno de la capa), candado, nombre (doble clic renombra), círculo de destino y cuadro de selección. Clic en un objeto lo selecciona (Mayús/Ctrl alterna); en una capa la marca como **capa activa** (recibe los objetos nuevos cuando no hay selección). Arrastrar reordena capas y objetos y mueve objetos entre capas (los grupos no admiten arrastrar dentro). Botones: nueva capa, nueva subcapa, máscara de recorte (Ctrl+7 / Alt+Ctrl+7: el objeto más alto es la máscara), localizar objeto y eliminar (con aviso si la capa tiene contenido).
- Propiedades: sin selección, documento (unidades, modo de color, mesa activa y «Editar mesas», reglas, guías, cuadrícula, ajustar a, preferencias rápidas); con objetos, Transformar, forma, Apariencia, Alinear y acciones rápidas.
- **Cuentagotas (I)**: clic copia relleno, trazo, opacidad y modo de fusión al objeto seleccionado (al aspecto actual si no hay selección); **Alt+clic** aplica el aspecto de la selección al objeto clicado; **Mayús+clic** copia solo el color de la parte clicada (relleno o trazo). No copia modificadores (Fase 9) ni atributos de texto (Fase 7). El cuentagotas de pantalla del panel usa el selector del sistema.
