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

### Reglas añadidas en la Fase 8
- Las regiones son la **disposición plana** de las hojas con contorno de la selección (Dividir de `core/commands/pathfinder.ts`); cada región recuerda qué objetos la cubren y toma el aspecto del más alto.
- **Clic** en una región: toda la selección se convierte en sus regiones (cada una, un objeto independiente) en un paso de deshacer. **Arrastrar** por varias: las une en una (la primera región da el aspecto) y el resto quedan sueltas. **Alt + clic/arrastrar**: elimina las regiones tocadas.
- El resultado de cada edición queda seleccionado y la disposición se recalcula con él, así que se puede seguir editando.
- Resaltado: región bajo el cursor con trama de puntos grises y contorno en el acento; durante el arrastre, las regiones visitadas y la línea roja del recorrido (Alt: contorno rojo).
- **Pendiente**: opciones de la herramienta (huecos, trazados abiertos como cerrados, modo de color), eliminar aristas abiertas con Alt, y elegir como color la muestra activa.

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

---

## Reglas añadidas en la Fase 5 (dibujo)

Reglas de comportamiento que la spec no cubría y que se implementaron como lo hace Illustrator, o por decisión explícita. Cada una tiene su prueba.

### Pluma

- El trazado vive en el documento desde el primer clic. **Cada ancla (con su arrastre de manejador) es un paso de deshacer**: Ctrl+Z quita el último punto y, con un solo punto, el trazado entero.
- **Alt durante el arrastre** congela el manejador de entrada donde estaba y lo mantiene congelado hasta soltar (el nodo pasa a esquina); no vuelve a ser simétrico si se suelta Alt.
- **Espacio** durante el arrastre mueve el ancla que se está colocando; el manejador conserva su distancia respecto a ella.
- **Mayús** en un clic restringe el ancla a 45° respecto al ancla anterior; en un arrastre restringe el manejador.
- **Cerrar**: clic sobre el primer ancla (cursor ○, con al menos 2 anclas) cierra y termina el trazado. Arrastrar al cerrar da al primer ancla manejadores simétricos (suave); con Alt solo gira el de salida. Cerrar es un solo paso de deshacer.
- **Terminar abierto**: Esc, Intro, Ctrl+clic en vacío o cambiar de herramienta. Un trazado de un solo ancla se descarta al terminar.
- **Continuar**: clic sobre el extremo de cualquier trazado abierto (visible y desbloqueado) lo continúa; si es su primer ancla, el trazado se invierte. Clic sobre el extremo de *otro* trazado abierto mientras se dibuja los **une** y termina.
- **Añadir/eliminar automático**: solo actúa sobre trazados **seleccionados** (segmento: «+»; ancla: «−»). Sobre una forma viva la convierte en trazado en el mismo paso. Pendiente de hacerlo opcional en Preferencias (constante `AUTO_ADD_DELETE`).
- **Ctrl** = Selección directa para ese clic; **Alt sobre un ancla** = Convertir punto de ancla para ese clic.
- Cursores: pluma plana mientras se dibuja; «*» (nuevo), «/» (continuar), «○» (cerrar), «+», «−», «^» (convertir; también al pasar sobre el último ancla).

### Añadir, eliminar y convertir ancla; Tijeras

- Estas herramientas actúan sobre cualquier trazado visible y desbloqueado bajo el cursor (los seleccionados tienen prioridad), no solo sobre los seleccionados.
- Sobre una **forma viva** convierten a trazado **sin aviso** y en el mismo paso de deshacer (el aviso de «convertir» es de Selección directa).
- Eliminar ancla conserva los manejadores de los vecinos (no «reajusta» la curva); un trazado que queda con menos de 2 anclas desaparece.
- Convertir: clic en ancla suave → esquina; arrastrar desde un ancla → suave con manejadores simétricos; arrastrar un manejador lo mueve de forma independiente y deja el ancla en esquina.
- Tijeras: un trazado abierto cortado en un ancla interior (o dentro de un segmento) da dos trazados con anclas coincidentes; uno cerrado da un trazado abierto con las dos anclas del corte. Cortar un ancla extremo no hace nada.

### Curvatura

- La curva es un spline Catmull-Rom uniforme expresado en Béziers (el trazado resultante es editable con Selección directa). Los extremos salen rectos hasta que hay tercer punto.
- Clic = suave, Alt+clic = esquina, doble clic sobre el último punto colocado = alterna suave/esquina sin añadir otro; clic sobre el primero cierra (≥ 3 puntos). Arrastrar un ancla del trazado seleccionado lo mueve y recalcula la curva; doble clic sobre un ancla alterna suave/esquina; clic sobre un segmento añade un punto.

### Lápiz

- Ajuste de Schneider con tolerancia **2,5 px de pantalla** (constante `PENCIL_FIDELITY_PX`; la fidelidad 1–5 de Preferencias llega con el panel de Preferencias). Cierra si termina a menos de 8 px del inicio, o con Alt.
- Si el trazo **empieza** en el extremo de un trazado abierto lo continúa; si **termina** en el extremo de otro, los une. **Pendiente**: editar/redibujar el tramo central de un trazado.

### Formas

- Rectángulo (M), rectángulo redondeado (radio recordado, 12 pt), elipse (L), polígono, estrella y línea (\). Arrastrar crea una **forma viva** como un único paso de deshacer. Alt desde el centro, Mayús 1:1 (línea: 45°), Espacio la mueve mientras se arrastra, Esc la descarta.
- Polígono y estrella se dibujan **desde el centro**; el ángulo del arrastre las gira y Mayús las deja derechas. ↑/↓ cambian lados/puntas durante el arrastre; Ctrl en la estrella mantiene fijo el radio interior. Estrella: radio interior = 50 % del exterior.
- **Clic sin arrastrar** abre el diálogo de dimensiones exactas (rectángulo: ancho, alto y radio si es redondeado; elipse: ancho y alto; polígono: radio y lados; estrella: radios y puntas; línea: longitud y ángulo, positivo en sentido antihorario).
- La línea es un objeto solo con trazo.

### Widgets de forma viva y esquinas vivas

- Visibles con Selección y Selección directa sobre formas vivas seleccionadas (hasta 24 objetos). Rectángulo: un círculo por esquina; **arrastrar cambia las cuatro esquinas, Alt solo esa**; Alt+clic cicla redonda → invertida → chaflán (todo el rectángulo). Polígono y estrella: un widget en el vértice superior para todos los vértices. Elipse: dos tiradores de **tarta** (inicio y fin).
- En trazados, Selección directa muestra un widget en cada ancla de esquina seleccionada cuyos vecinos son segmentos rectos (`Anchor.cornerRadius`, ver spec 02). El radio se reduce hasta la mitad del segmento más corto.
- Un widget en reposo está a 14 px de pantalla de su esquina, y sigue al radio cuando este es mayor.

### Acciones sobre anclas (barra de control y menú Objeto)

- **Suprimir** con anclas seleccionadas elimina las anclas (un paso de deshacer, varios trazados a la vez); sin anclas, elimina los objetos.
- **Unir (Ctrl+J)**: con dos anclas extremo seleccionadas las une (del mismo trazado: lo cierra); con trazados abiertos seleccionados, uno solo se cierra y varios se encadenan por sus extremos más cercanos. Si los extremos no coinciden se añade un segmento recto.
- **Promediar (Alt+Ctrl+J)** pregunta el eje: *Horizontal* alinea los puntos en la misma Y, *Vertical* en la misma X, *Ambos* los junta. Sin anclas seleccionadas actúa sobre todas las de los trazados seleccionados.
- **Cortar en el ancla**, **convertir a esquina/suave** y **mostrar/ocultar manejadores** están en la barra de control con Selección directa.
