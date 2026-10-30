# Victoria · Manual breve

Victoria es un editor de gráficos vectoriales para dibujar íconos, acomodar imágenes para imprimir y vectorizar imágenes. Si conoces Illustrator, casi todo funciona igual: los atajos son los mismos (lista completa en [`specs/09-atajos.md`](../specs/09-atajos.md)).

## 1. Empezar

- **Instalar:** en Windows, ejecuta `Victoria-Setup-<versión>.exe` (instalador) o usa la versión portátil. En Linux hay AppImage, `.deb` y `.rpm`.
- **Primer documento:** al abrir Victoria aparece un documento A4 vacío. Con **Archivo › Nuevo** (Ctrl+N) abres otro. Si cierras el último documento verás la **pantalla de inicio**, con tarjetas para crear (A4, Carta, Ícono 24 px, Instagram), el botón **Abrir…** y la lista de **Recientes**.
- **Guardar:** Ctrl+S guarda un archivo `.vict` (un documento con todo lo que hay en él, imágenes incluidas). Victoria **autoguarda** cada minuto lo que cambió; si se cierra de forma inesperada, al volver te ofrece recuperarlo.

## 2. Documentos, Espacios y mesas

- Un **documento** (`.vict`) tiene uno o más **Espacios**: lienzos infinitos independientes, cada uno con sus capas, objetos y mesas. Se cambia de Espacio con las pestañas de la parte superior (Ctrl+Mayús+RePág/AvPág o Alt+1…9).
- Una **mesa** es un rectángulo que define una página: es lo que se exporta e imprime. Con la herramienta Mesa (Mayús+O) las creas, mueves y cambias de tamaño; sus opciones permiten elegir un tamaño predefinido.

## 3. Dibujar

| Herramienta | Atajo | Para qué |
|---|---|---|
| Selección / Selección directa | V / A | Mover objetos / editar nodos y manejadores |
| Pluma | P | Trazados con curvas Bézier. Sobre un trazado seleccionado, clic en un segmento añade un punto y clic en un punto lo elimina (se puede desactivar en Preferencias) |
| Lápiz | N | Trazo a mano alzada que se ajusta a una curva |
| Rectángulo, Elipse, Línea… | M, L, \ | Formas vivas: sus parámetros se pueden cambiar después. Un clic abre un cuadro para escribir medidas exactas |
| Texto | T | Texto de punto, de área o sobre un trazado |
| Creador de formas | Mayús+M | Une o resta regiones arrastrando sobre formas superpuestas |
| Rotar, Reflejar, Escala, Transformación libre | R, O, S, E | Transformaciones; Alt copia mientras arrastras |
| Cuentagotas, Degradado | I, G | Copiar o aplicar color |
| Mano, Zoom | H (o Espacio), Z | Mover y acercar la vista; Ctrl+0 ajusta la mesa, Ctrl+1 muestra al 100 % |

Ctrl+Z / Mayús+Ctrl+Z deshacen y rehacen **todo** (el historial es exacto, también entre Espacios).

## 4. Organizar y dar aspecto

- **Capas** y **Espacios** se gestionan en sus paneles; Ctrl+G agrupa, Ctrl+2 bloquea, Ctrl+3 oculta, Ctrl+] / [ cambian el orden.
- **Relleno, Trazo y Apariencia:** un objeto puede tener varios rellenos y trazos, degradados, opacidad y modos de fusión. **Modificadores** (menú Modificador) añaden efectos no destructivos —sombras, resplandores, desplazar trazado, rugosidad…— y se pueden aplicar para volverlos permanentes (Alt+Ctrl+E).
- **Buscatrazos** (Unir, Restar, Intersecar…) y **Máscara de recorte** (Ctrl+7) combinan formas.
- **Alinear, Espaciado y Transformar** colocan objetos con precisión; las reglas, guías, cuadrícula y guías inteligentes están en el menú Vista y en Propiedades.

## 5. Imágenes y vectorización

- **Colocar** (Mayús+Ctrl+P) o **soltar archivos** sobre el lienzo: PNG, JPEG, WebP, SVG y la primera página de un PDF.
- Con una imagen seleccionada, **Propiedades › Imagen** muestra la resolución efectiva (en rojo por debajo de 150 ppp) y permite **Recortar imagen** (no destructivo; **Aplicar recorte** corta los píxeles), **Desincrustar** (guarda la imagen como archivo vinculado), **Incrustar** y **Reubicar** si un vínculo se rompió.
- **Calco de imagen:** con una imagen seleccionada, **Propiedades › Calco de imagen › Calcar** la convierte en trazados de colores planos. Después puedes cambiar el ajuste (Logotipo, Arte lineal, Blanco y negro, 16 colores…), el número de colores, el ruido y las esquinas, y se recalcula; **Expandir** deja los trazados como un grupo normal.

## 6. Exportar e imprimir

- **Archivo › Exportar:** SVG, PDF, PNG y JPG de la mesa activa, del Espacio o de todos, con la resolución que elijas. **Exportar para pantallas** genera varios tamaños y formatos a la vez en una carpeta.
- **Archivo › Imprimir** (Ctrl+P): vista previa de cada página, papel, orientación, escala (100 % es tamaño real), posición, **marcas de corte** y sangrado. Un cuadrado de 100 mm sale de 100 mm.
- **Abrir** también lee SVG, PDF y EPS sencillos como documentos nuevos.

## 7. Personalizar

- **Espacios de trabajo** (selector de la barra de título): Esenciales, Íconos, Impresión y Texto cambian la disposición de los paneles; lo que muevas se recuerda para cada uno. **Ventana › Restablecer paneles** vuelve a la disposición original.
- **Preferencias** (Ctrl+K): puntos automáticos de la Pluma, fidelidad del Lápiz, intervalo de autoguardado, si se muestra la pantalla de inicio al abrir y si Colocar vincula las imágenes al archivo en vez de incrustarlas.

## 8. Si algo falla

- Un documento que no abre muestra el motivo en un cuadro de error; el archivo no se modifica.
- Una imagen vinculada cuyo archivo falta se ve como un marcador gris: selecciónala y pulsa **Reubicar…**.
- Los avisos de importación (por ejemplo, un SVG con filtros) indican qué se omitió; el resto se importa.
