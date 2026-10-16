# 07 · Texto

## Tipos de objeto de texto

| Tipo | Cómo se crea | Comportamiento |
|---|---|---|
| **De punto** | T + clic | Una línea por párrafo, sin ajuste. Escalar con el cuadro delimitador **cambia el tamaño de la fuente** (como Illustrator). |
| **De área** | T + arrastre, o T sobre trazado cerrado | Ajuste de línea dentro del rectángulo o forma. Indicador de desbordamiento: cuadrito rojo "+" en el puerto de salida. Escalar cambia la caja, no la fuente. |
| **En trazado** | Texto en trazado, o T sobre trazado abierto | El texto sigue la curva. |

- **Conversión punto ↔ área**: widget circular en el lado derecho del cuadro delimitador (doble clic), como Illustrator CC.
- **Opciones de texto de área**: filas, columnas, medianil, margen interior, desplazamiento de primera línea base, alinear verticalmente (arriba/centro/abajo/justificar).
- **Encadenar** cajas de área (v2): clic en el puerto de salida y luego en otra caja.

## Texto en trazado (detalle)

- Se coloca sobre trazados abiertos o cerrados; el trazado pierde relleno y trazo (como Illustrator) pero se conserva como geometría.
- **Tres corchetes**: inicio (izquierda), fin (derecha), centro. Arrastrar el de inicio/fin limita el rango; arrastrar el central desliza el texto; **arrastrar el central al otro lado del trazado voltea** el texto.
- Opciones (diálogo): efecto **Arco iris** (por defecto), Sesgar, Cinta 3D, Escalera, Gravedad; alinear a trazado: ascendente, descendente, centro, línea base; espaciado; voltear.
- Implementación: `core/text/onPath.ts`. Para cada glifo: posición por longitud de arco (tabla de longitudes con muestreo adaptativo), tangente en el centro del avance; rotar el glifo según el efecto.

## Motor de texto

- `opentype.js` carga la fuente (archivo del sistema leído desde el proceso main y transferido como ArrayBuffer; caché por ruta).
- Layout propio: segmentación por párrafos y palabras, kerning (tabla `kern`/GPOS básico), ligaduras estándar (`liga`), tracking en milésimas de em, ajuste de línea codicioso (v1) y justificación por espacios.
- Texto bidireccional y scripts complejos: fuera de v1.
- Render en Canvas: dibujar contornos de glifo como `Path2D` (garantiza que lo que se ve = lo que se exporta). Para edición fluida, cachear `Path2D` por glifo y tamaño.
- **Crear contornos** (Mayús+Ctrl+O): convierte en grupo de trazados compuestos, uno por glifo.

## Edición

- Cursor de texto, selección con arrastre, doble clic = palabra, triple clic = párrafo, Ctrl+A = todo el objeto.
- Flechas, Inicio/Fin, Ctrl+flechas por palabra, Mayús para extender.
- Alt+←/→ con selección = tracking −/+ 20; Alt+↑/↓ = interlineado; Ctrl+Mayús+< / > = tamaño.
- Copiar/pegar con estilo dentro de la app; texto plano desde fuera.
- Atributos por rango (`TextRun { text, style }`), estilo de párrafo por párrafo.

## Fuentes

- Enumerar fuentes del sistema en main, vía `platform.listFonts()`:
  - Windows: `font-list` + rutas en `C:\Windows\Fonts` y `%LOCALAPPDATA%\Microsoft\Windows\Fonts`.
  - Linux: `fc-list --format '%{file}|%{family}|%{style}\n'` (fontconfig); si falla, escanear `/usr/share/fonts`, `/usr/local/share/fonts`, `~/.local/share/fonts`, `~/.fonts`.
  - Un archivo `.vict` hecho en Windows y abierto en Linux debe resolver fuentes por **nombre de familia + estilo**, nunca por ruta.
- Menú de fuentes con vista previa ("Victoria" en la propia fuente), búsqueda, filtro por favoritas, recientes.
- Fuentes faltantes al abrir: diálogo "Buscar fuente" con sustitución; se marcan con resaltado rosa (como Illustrator).
- Opción de incrustar fuentes en `.vict` (solo si la licencia `fsType` lo permite).

## Reglas añadidas en la Fase 7

- **El marco viaja con el objeto.** Un texto de área lleva su marco (`TextNode.frame`) y uno en trazado su trazado (`TextNode.path`, `pathOptions`) dentro del propio nodo, en coordenadas locales; al crearlo sobre un trazado o forma existente, ese objeto se **sustituye** por el texto. Deshacer lo devuelve.
- **Un solo paso de deshacer por ráfaga de escritura.** Crear el objeto y escribir el primer bloque es un paso; cada ráfaga posterior (hasta que el cursor se mueve, se cambia la selección o se pulsa un atributo) es otro. Los comandos de texto se fusionan con la clave `text.edit:<id>:<ráfaga>`.
- **Esc termina la edición y vuelve a Selección** (Illustrator hace lo mismo). Un texto que queda vacío se elimina.
- **Doble clic con Selección sobre un texto** lo edita con el cursor donde se hizo clic. Con un texto de punto o de área seleccionado, el círculo a la derecha del cuadro (doble clic) lo convierte en área o punto; con un texto en trazado se muestran los tres corchetes (inicio, fin, centro). Arrastrar el central a más de 6 px del trazado, al otro lado, voltea el texto; el rango se mide desde el otro extremo al voltear.
- **Escalar.** Texto de punto: la escala pasa al tamaño de fuente (y a la escala horizontal si no es uniforme). Texto de área: la escala pasa a los anclajes del marco y la fuente no cambia. En ambos la matriz del objeto queda sin escala.
- **Panel Carácter / Párrafo.** Actúan, por orden: sobre el rango seleccionado del texto en edición; con el cursor sin selección, sobre los **siguientes caracteres escritos** (`pendingTextStyle`, no crea paso de deshacer); sobre los textos seleccionados; y sin nada seleccionado, sobre los valores por defecto del próximo texto. Un valor distinto entre rangos se muestra vacío.
- **Fuentes por nombre.** Familia y estilo se leen de la tabla `name` y se prefieren los nombres en inglés (un Windows en español lista «Negreta» donde Linux dice «Bold»). Si el estilo pedido no existe se usa el regular de la familia; si la familia falta, el motor usa glifos de caja y el selector marca la fuente en rosa.
- **Paridad lienzo = contornos = exportación.** El lienzo, *Crear contornos* y los exportadores (Fase 11) consumen la misma `textGeometry(node)`; la prueba `core/text/parity.test.ts` comprueba, sobre un círculo y una onda, que cada glifo está sobre el trazado y que los contornos creados son idénticos a lo pintado.
- **Crear contornos** deja seleccionado el grupo resultante, con el nombre y la apariencia del texto.

### Pendiente de la Fase 7 (no implementado)
- Opciones de texto de área (filas, columnas, medianil, margen, alineación vertical) y encadenado: la entrada de menú existe y está desactivada.
- Ligaduras (`liga`); el guionado es una heurística simple de corte.
- Diálogo «Buscar fuente» con sustitución (hoy solo el resaltado rosa) e incrustación de fuentes en `.vict`.
- Sección de texto en el panel Propiedades.
- Archivos SVG y PDF reales: son de la Fase 11; la paridad con ellos se comprueba por la geometría compartida.
