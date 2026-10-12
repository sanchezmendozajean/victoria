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
