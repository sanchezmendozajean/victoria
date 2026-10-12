# 03 · Herramientas

La **sensación de Illustrator** es el requisito principal. Esta spec describe el comportamiento esperado con detalle. Cada herramienta es una máquina de estados en `src/renderer/tools/<nombre>.ts`.

Convenciones: **Mayús** = restringir (45°, proporción), **Alt** = desde el centro / duplicar / alternar, **Ctrl** = selección temporal, **Espacio** = mano temporal (y, mientras se dibuja, mover lo que se está creando).

## Lista y prioridad

| Grupo | Herramienta | Tecla | v |
|---|---|---|---|
| Selección | Selección | V | 1 |
| | Selección directa | A | 1 |
| | Selección de grupos | (en grupo de A) | 1 |
| | Varita mágica | Y | 2 |
| | Lazo | Q | 1 |
| Dibujo | Pluma | P | 1 |
| | Añadir punto de ancla | + | 1 |
| | Eliminar punto de ancla | − | 1 |
| | Convertir punto de ancla | Mayús+C | 1 |
| | Curvatura | Mayús+~ | 1 |
| | Lápiz | N | 1 |
| | Suavizar | (grupo N) | 2 |
| | Borrador de trazado | (grupo N) | 2 |
| | Unir | (grupo N) | 2 |
| | Pincel de manchas (Blob) | Mayús+B | 2 |
| Formas | Rectángulo | M | 1 |
| | Rectángulo redondeado | — | 1 |
| | Elipse | L | 1 |
| | Polígono | — | 1 |
| | Estrella | — | 1 |
| | Segmento de línea | \ | 1 |
| | Arco | — | 2 |
| | Espiral | — | 2 |
| Texto | Texto | T | 1 |
| | Texto de área | — | 1 |
| | Texto en trazado | — | 1 |
| | Retocar texto | Mayús+T | 2 |
| Construcción | **Creador de formas** | Mayús+M | 1 |
| | Tijeras | C | 1 |
| | Cuchilla | — | 2 |
| | Borrador | Mayús+E | 2 |
| Transformar | Rotar | R | 1 |
| | Reflejar | O | 1 |
| | Escala | S | 1 |
| | Distorsionar (Shear) | — | 2 |
| | Transformación libre | E | 1 |
| Color | Cuentagotas | I | 1 |
| | Degradado | G | 1 |
| Mesas | Mesa de trabajo | Mayús+O | 1 |
| Vista | Mano | H | 1 |
| | Zoom | Z | 1 |
| | Rotar vista | Mayús+H | 2 |

Herramientas agrupadas se muestran como en Illustrator: triángulo en la esquina inferior derecha; mantener clic (300 ms) abre el desplegable; Alt+clic rota entre las del grupo.

---

## Selección (V)

- Clic sobre relleno o trazo selecciona el objeto (o grupo completo). Clic en vacío deselecciona.
- Mayús+clic añade/quita. Arrastre en vacío = marco de selección (toca = selecciona).
- **Cuadro delimitador** con 8 tiradores: arrastrar escala; Mayús = proporcional; Alt = desde el centro. Fuera de una esquina (cursor curvo) = rotar; Mayús = pasos de 45°.
- Arrastrar objeto = mover; Mayús restringe a 45°; **Alt+arrastrar = duplicar**. Ctrl+D = repetir última transformación.
- Doble clic en grupo = **modo aislamiento** (barra superior gris con ruta "Capa 1 › Grupo"; Esc o doble clic fuera para salir).
- Flechas: mover 1 pt (configurable); Mayús+flecha = 10 pt.
- Widgets de forma viva visibles (círculos de radio de esquina) y "Widget de tarta" en elipses.
- Hover: resaltar el contorno del objeto bajo el cursor con el color de su capa.

## Selección directa (A)

- Clic sobre un nodo lo selecciona (cuadro relleno); los demás del trazado se muestran huecos.
- Clic sobre un segmento selecciona el segmento y muestra manejadores de sus nodos extremos.
- **Arrastrar un segmento curvo lo deforma** (reshape) moviendo ambos manejadores proporcionalmente, como Illustrator.
- Arrastrar un manejador:
  - nodo suave: el manejador opuesto gira para mantenerse colineal (conserva su longitud);
  - **Alt+arrastrar manejador** rompe la simetría → nodo de esquina;
  - Mayús restringe ángulo a 45°.
- Marco de selección directa selecciona nodos dentro.
- **Widgets de esquina viva**: al seleccionar nodos de esquina aparece un círculo pequeño; arrastrar redondea (todas las esquinas seleccionadas). Alt+clic en el widget cicla redonda → invertida → chaflán.
- Barra de control contextual con: convertir a esquina / a suave, mostrar/ocultar manejadores, eliminar nodos, cortar trazado en nodo, unir extremos (Ctrl+J), promediar (Alt+Ctrl+J).
- Al aplicar sobre una forma viva: aviso y conversión a trazado.

## Pluma (P) — comportamiento exacto

Estados: `idle` → `placing` → (`draggingHandle`) → `placing` … → `done`.

1. **Clic** = nodo de esquina sin manejadores (segmento recto).
2. **Clic y arrastrar** = nodo suave; el arrastre define el manejador de salida, el de entrada es simétrico.
3. Durante el arrastre:
   - **Alt** rompe el manejador: a partir de ahí solo se mueve el de salida.
   - **Espacio** mueve el nodo que se está colocando.
   - **Mayús** restringe a 45°.
4. **Clic sobre el último nodo colocado** retrae su manejador de salida (el siguiente segmento sale recto). **Arrastrar desde el último nodo** crea un nuevo manejador de salida independiente.
5. **Banda elástica**: previsualización del siguiente segmento siguiendo el cursor (activada por defecto).
6. **Cerrar**: al pasar sobre el primer nodo el cursor muestra "○"; clic cierra; clic+arrastrar cierra con curva.
7. **Terminar abierto**: Esc, Enter, Ctrl+clic en vacío, o cambiar de herramienta.
8. **Continuar un trazado**: pasar sobre el extremo de un trazado abierto (cursor "/") y hacer clic continúa ese trazado. Clic en el extremo de *otro* trazado abierto los une.
9. **Auto añadir/eliminar**: sobre un segmento del trazado seleccionado el cursor cambia a "+" y añade nodo; sobre un nodo cambia a "−" y lo elimina (desactivable en Preferencias).
10. **Ctrl** mantenido = Selección directa temporal. **Alt** sobre un nodo existente = Convertir punto de ancla temporal.
11. Cursores: pluma con "*" (nuevo trazado), "/" (continuar), "○" (cerrar), "+", "−", "^" (convertir).

## Curvatura (Mayús+~)

Como Illustrator: cada clic coloca un nodo y la curva pasa *suavemente* por todos los puntos; doble clic o Alt+clic = nodo de esquina; doble clic sobre nodo alterna suave/esquina; arrastrar un nodo existente lo mueve y la curva se recalcula. Previsualización en vivo del segmento siguiente.

## Convertir punto de ancla (Mayús+C)

Clic en nodo suave → esquina (retrae manejadores). Arrastrar desde nodo de esquina → suave. Arrastrar un manejador → lo mueve independiente.

## Lápiz (N)

Trazo a mano alzada simplificado con el algoritmo de ajuste de curvas de Schneider (fidelidad configurable 1–5, como Illustrator: "Precisión ↔ Suavizado"). Cerrar si el final queda a < N px del inicio (Alt fuerza cerrar). Editar trazado seleccionado si se empieza cerca de él.

## Formas (M, L, poligono, estrella, línea)

- Arrastrar define tamaño desde una esquina; **Alt** desde el centro; **Mayús** proporción 1:1; **Espacio** mueve mientras se dibuja.
- **Clic sin arrastrar** abre diálogo con dimensiones exactas.
- Polígono: flechas ↑/↓ durante el arrastre cambian lados; estrella: ↑/↓ puntas, Ctrl mantiene radio interno.
- Todas crean **formas vivas** (panel Propiedades › Forma muestra sus parámetros).

## Texto (T), Texto de área, Texto en trazado

Ver `07-texto.md`. Resumen:
- T + clic en vacío = texto de punto. T + arrastre = texto de área (caja). T sobre un trazado cerrado = texto de área dentro de esa forma. T sobre un trazado abierto = texto en trazado.
- Esc sale de edición y deja el objeto seleccionado con Selección.

## Creador de formas (Mayús+M) — imprescindible

1. Requiere ≥ 1 objeto seleccionado. Calcula la **disposición plana** (planar arrangement) de todas las regiones y aristas formadas por los contornos seleccionados.
2. Hover: la región bajo el cursor se resalta con una malla gris (patrón de puntos) y su contorno en el color de la capa.
3. **Clic** en una región = la convierte en forma independiente.
4. **Arrastrar** a través de varias regiones = las **une** (se dibuja una línea roja de recorrido).
5. **Alt + clic/arrastrar** = **elimina** regiones o aristas (cursor con "−"). Alt sobre una arista abierta elimina ese segmento.
6. El color del resultado: el de la región de origen (por defecto) o la muestra activa (opción).
7. Opciones (doble clic en el ícono): detección de huecos, considerar trazados abiertos como cerrados, modo de color, resaltar trazado al editar.
8. Implementación: `core/geometry/planar.ts` — aplanar curvas con tolerancia adaptativa solo para *detectar intersecciones*; los resultados deben conservar Béziers originales (dividir curvas en los parámetros t de intersección, no poligonizar).

## Tijeras (C)

Clic sobre un segmento o nodo divide el trazado ahí (dos nodos superpuestos).

## Rotar (R), Reflejar (O), Escala (S)

- Clic = fijar punto de origen (cruz azul). Arrastrar = transformar. **Alt+clic** = origen + diálogo numérico. **Enter** o doble clic en la herramienta = diálogo con "Copiar" y "Previsualizar".
- Mayús restringe a 45° / proporcional.

## Transformación libre (E)

Mismo cuadro que Selección más widget lateral con modos: restringir, transformación libre, distorsión de perspectiva, distorsión libre (estas dos últimas producen geometría real, no modificador).

## Cuentagotas (I)

Clic sobre objeto: copia apariencia (relleno, trazo, opacidad, atributos de texto) al seleccionado. Alt+clic: aplica la apariencia del seleccionado al clicado. Mayús+clic: solo color de la parte clicada.

## Degradado (G)

Barra anotadora sobre el objeto: arrastrar define dirección; puntos de color editables en el lienzo (doble clic abre selector); arrastrar el extremo cuadrado = longitud; círculo = rotación; en radial, el punto punteado = relación de aspecto.

## Mesa de trabajo (Mayús+O)

Ver `04-espacios-y-mesas.md`.

## Mano (H / Espacio) y Zoom (Z)

- Espacio mantenido en cualquier herramienta (salvo editando texto) = mano.
- Zoom: clic acerca, Alt+clic aleja, arrastrar = zoom animado (scrubby) o marco. Ctrl+rueda = zoom en cursor; rueda = desplazamiento vertical; Mayús+rueda = horizontal. Rango 3 %–64 000 %.
- Ctrl+0 ajustar mesa, Alt+Ctrl+0 ajustar todo, Ctrl+1 100 %.

## Guías inteligentes (Ctrl+U)

Imprescindibles para la sensación Illustrator:
- Etiquetas magenta: "ancla", "trazado", "centro", "intersección", "alinear".
- Líneas de alineación con otros objetos (bordes y centros), guías de ángulo (0, 45, 90…), etiquetas de medida (Δx, Δy, ancho, alto, ángulo) junto al cursor.
- Ajuste a punto (snap) con tolerancia de 4 px de pantalla.
- Indicadores de espaciado igual entre objetos (flechas rosas) — v2.

## Otros ajustes

Ajustar a cuadrícula, ajustar a píxel (para íconos: alinear a la cuadrícula de píxeles), reglas (Ctrl+R) con guías arrastrables, guías bloqueables.
