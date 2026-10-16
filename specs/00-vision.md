# 00 · Visión y alcance

## Problema

El usuario usa Illustrator para tareas cotidianas (íconos, preparar imágenes para imprimir, vectorizar). Inkscape le falla con frecuencia y su forma de dibujar es distinta. No existe una alternativa ligera que reproduzca la **sensación de dibujo de Illustrator**.

## Objetivo

Un editor vectorial de escritorio, estable y rápido, que:

1. Dibuje **exactamente como Illustrator**: pluma, nodos, manejadores, curvatura, selección directa, formas vivas, texto, texto sobre trazado.
2. Conserve las **mesas de trabajo**.
3. Introduzca **Espacios**: varios lienzos independientes en un mismo archivo.
4. Conserve el **Creador de formas** (Shape Builder).
5. Ofrezca **Modificadores** (equivalentes a los Efectos de Illustrator), apilables y no destructivos.
6. Mantenga los paneles clave: **Texto (Carácter/Párrafo), Alineación, Espaciado, Trazo y Relleno**, además de Capas, Espacios, Mesas, Apariencia, Transformar, Buscatrazos y Calco de imagen.
7. Tenga **un ícono en cada opción y botón**.

## Usuario principal

Persona habituada a Illustrator, uso no profesional. Prioriza: estabilidad, atajos conocidos, rapidez de arranque, exportar a PNG/SVG/PDF y poder imprimir.

## Glosario

| Término | Definición |
|---|---|
| Documento | Archivo `.vict`. Contiene configuración, recursos (fuentes incrustadas opcionales, imágenes, muestras) y una lista de Espacios. |
| Espacio | Lienzo infinito con su propio árbol de capas, sus mesas de trabajo, su vista (zoom/desplazamiento) y sus guías. Se muestra como pestaña secundaria dentro de la pestaña del documento. |
| Mesa de trabajo | Rectángulo con nombre, tamaño, posición y opciones de sangrado, perteneciente a un Espacio. |
| Capa | Contenedor de nivel superior en el árbol de un Espacio. Puede tener subcapas. |
| Objeto | Trazado, trazado compuesto, forma viva, grupo, texto, imagen, grupo de recorte. |
| Nodo (punto de ancla) | Punto de un trazado. Tipos: esquina, suave, asimétrico. |
| Manejador | Punto de control Bézier de entrada/salida de un nodo. |
| Forma viva | Rectángulo, elipse, polígono, estrella o línea que conserva sus parámetros editables (radio de esquinas, número de lados…). |
| Modificador | Operación no destructiva en la pila de apariencia de un objeto. *Estructural* si cambia la geometría; *de apariencia* si solo cambia cómo se pinta. |
| Aplicar (modificador) | Volverlo permanente: la geometría resultante sustituye a la original (equivale a "Expandir apariencia"). |
| Apariencia | Lista ordenada de rellenos, trazos y modificadores de un objeto. |

## Alcance v1

- Herramientas de `03-herramientas.md` marcadas **v1**.
- Modificadores de `05-modificadores.md` marcados **v1**.
- Importar: SVG, PDF (primera página, vectorial básica), PNG/JPG/WebP, `.ai` solo si es PDF-compatible (Illustrator guarda PDF dentro) y EPS.
- Exportar: SVG, PNG, JPG, PDF, EPS (por mesa, todas las mesas, o por Espacio).
- Imprimir: diálogo nativo, por mesa de trabajo, con marcas de corte y sangrado.
- **Windows y Linux** como plataformas de primera clase: mismas funciones, mismos atajos (salvo conflictos documentados), paquetes oficiales para ambos. Windows es donde se usa hoy; Linux será el sistema principal del usuario en unos meses, así que no puede quedar como "puerto secundario".

## No-objetivos (v1)

- Filtros tipo Photoshop / efectos rasterizados artísticos.
- Gestión de color CMYK con perfiles ICC (se permite *modelo* CMYK en el selector, pero el render es RGB).
- Pincel de malla de degradado, perspectiva, 3D, símbolos dinámicos, scripting.
- Colaboración en tiempo real.

## Principios

1. **Fidelidad de interacción > cantidad de funciones.** Mejor 20 herramientas que se sienten como Illustrator que 60 a medias.
2. **Nunca perder trabajo.** Autoguardado cada 60 s y recuperación tras cierre inesperado.
3. **Rápido.** Arranque < 2 s, 60 fps al desplazar/zoom con 10 000 nodos.
4. **Todo con ícono**, todo con tooltip (nombre + atajo).
