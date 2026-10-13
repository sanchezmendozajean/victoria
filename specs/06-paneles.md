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
