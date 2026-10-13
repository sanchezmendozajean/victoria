# 08 · Imágenes, vectorizar e imprimir

## Imágenes

- **Colocar** (Mayús+Ctrl+P): elegir archivo; el cursor muestra miniatura; clic = tamaño original (a 72 ppp de documento o la resolución del archivo); arrastre = tamaño definido. Colocación múltiple: varias imágenes en cola (contador en el cursor).
- Arrastrar y soltar desde el Explorador o pegar desde el portapapeles.
- Vinculadas o incrustadas (botón Incrustar/Desincrustar en Propiedades). Vínculos rotos → diálogo de reubicación.
- Recortar imagen (botón en Propiedades, como Illustrator CC): tiradores de recorte no destructivos (internamente un `clipGroup`) + "Aplicar recorte" destructivo.
- Máscara de recorte (Ctrl+7) y liberar (Alt+Ctrl+7).
- Información: ppp efectivos según la escala (alerta si < 150 ppp al imprimir).

## Acomodar para imprimir

Flujo común del usuario; debe ser cómodo:
1. Crear mesa A4/Carta (preset).
2. Colocar varias imágenes.
3. Panel **Espaciado › Rejilla**: filas × columnas, separación, escalar al tamaño de celda (encajar/rellenar), centrar en la mesa con márgenes.
4. **Repetir hasta llenar** (botón): duplica la selección en rejilla hasta llenar la mesa.
5. Imprimir.

## Calco de imagen (Vectorizar)

Panel y botón en Propiedades cuando hay una imagen seleccionada.

- Ajustes preestablecidos: Alta fidelidad, Baja fidelidad, 3 colores, 6 colores, 16 colores, Tonos de gris, Blanco y negro, Silueta, Arte lineal, Dibujo técnico, Logotipo.
- Modo: Color / Escala de grises / Blanco y negro. Paleta: limitada o automática. Colores (2–30). Umbral (B/N).
- Avanzado: trazados (ajuste), esquinas, ruido (px), método (abutting/overlapping), rellenos/trazos, ignorar blanco, ajustar curvas a líneas.
- Vista: Resultado, Resultado con contornos, Contornos, Contornos con imagen original, Imagen original.
- Es un objeto **vivo** (`traceNode` con referencia a imagen + parámetros). **Expandir** lo convierte en grupo de trazados.
- Implementación: cuantización de color (k-means en espacio Lab, o mediana de corte) → por cada color una máscara binaria → potrace (WASM) en Worker → trazados Bézier. Previsualización progresiva con barra de progreso y botón Cancelar.

## Exportar

**Archivo › Exportar › Exportar para pantallas** (sin atajo): lista de mesas (de todos los Espacios, con filtro por Espacio) con casillas; formatos múltiples a la vez (PNG 1x/2x/3x, SVG, PDF, JPG), sufijos, carpeta destino, "Abrir carpeta al terminar".
**Exportar como…**: un archivo SVG/PNG/JPG/PDF con opciones.
**Guardar copia como PDF**: todas las mesas como páginas.

## Imprimir (Ctrl+P)

Diálogo propio (no solo el nativo) con previsualización:
- Impresora, copias, rango de mesas (todas / rango / del Espacio activo / de todos los Espacios).
- Tamaño de papel, orientación, **escala** (no escalar / ajustar a página / personalizado %), posición (cuadrícula 3×3).
- **Marcas**: marcas de corte (Japonés / Occidental), grosor, desplazamiento; incluir sangrado.
- Imprimir capas visibles e imprimibles / todas.
- Implementación: generar PDF en memoria con pdf-lib y enviarlo a `platform.print()`:
  - Windows: `webContents.print` desde una ventana oculta que carga el PDF (sin márgenes, escala 100 %).
  - Linux: `webContents.print` sobre CUPS; fallback `lp -d <impresora> -o fit-to-page=false -o media=<papel>` con el PDF temporal.
- Debe imprimir **a escala real** en ambos sistemas (verificación 100 mm = 100 mm en papel).
