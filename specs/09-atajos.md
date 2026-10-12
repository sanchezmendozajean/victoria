# 09 · Atajos de teclado

Compatibles con Illustrator (Windows). Editables en **Edición › Atajos de teclado** (v2); en v1 se definen en `src/renderer/app/shortcuts.ts` como mapa único, con `CmdOrCtrl` en los aceleradores de Electron.

## Conflictos en Linux

Algunos escritorios Linux reservan combinaciones. Victoria debe detectar el entorno (`XDG_CURRENT_DESKTOP`) y, en Preferencias › Atajos, ofrecer alternativas:

| Combinación | Conflicto típico | Alternativa propuesta |
|---|---|---|
| Alt+arrastrar (duplicar) | Algunos gestores de ventanas (XFCE, KDE antiguo, i3) mueven la ventana con Alt+arrastrar | Aviso en el primer arranque explicando cómo cambiar la tecla del gestor a Super; alternativa en la app: **Ctrl+Alt+arrastrar** o tecla configurable |
| Ctrl+Alt+flechas / RePág/AvPág | Cambio de escritorio virtual en GNOME/KDE | Espacio anterior/siguiente también con **Ctrl+Mayús+RePág/AvPág** |
| Ctrl+Alt+T | Abre la terminal en Ubuntu | Párrafo también en el menú y la tira de paneles; atajo editable |
| Alt solo | Algunos escritorios abren el menú de la ventana con Alt | Solo actuar con Alt como modificador, nunca al soltarlo solo |
| Super | Reservada por el sistema | No usarla en atajos |

Probar los atajos en GNOME (Wayland) y KDE Plasma antes de cerrar la fase correspondiente.

## Herramientas

V Selección · A Selección directa · Q Lazo · P Pluma · + / − Añadir/eliminar ancla · Mayús+C Convertir ancla · Mayús+~ Curvatura · N Lápiz · M Rectángulo · L Elipse · \ Línea · T Texto · Mayús+M Creador de formas · C Tijeras · R Rotar · O Reflejar · S Escala · E Transformación libre · I Cuentagotas · G Degradado · Mayús+O Mesa de trabajo · H Mano · Z Zoom · D Colores por defecto · X Alternar relleno/trazo · Mayús+X Intercambiar · , Color · . Degradado · / Ninguno · Tab Ocultar paneles · Mayús+Tab Ocultar paneles salvo herramientas · F Modos de pantalla.

## Archivo

Ctrl+N Nuevo · Ctrl+O Abrir · Ctrl+S Guardar · Mayús+Ctrl+S Guardar como · Alt+Ctrl+S Guardar copia · Mayús+Ctrl+P Colocar · Alt+Ctrl+E Exportar para pantallas · Ctrl+P Imprimir · Ctrl+W Cerrar · Alt+Ctrl+P Configurar documento.

## Edición

Ctrl+Z Deshacer · Mayús+Ctrl+Z Rehacer · Ctrl+X/C/V · Ctrl+F Pegar delante · Ctrl+B Pegar detrás · Mayús+Ctrl+V Pegar en el mismo lugar · Alt+Mayús+Ctrl+V Pegar en todas las mesas · Supr Eliminar · Ctrl+K Preferencias.

## Objeto

Ctrl+G Agrupar · Mayús+Ctrl+G Desagrupar · Ctrl+2 Bloquear · Alt+Ctrl+2 Desbloquear todo · Ctrl+3 Ocultar · Alt+Ctrl+3 Mostrar todo · Ctrl+] / [ Hacia delante/atrás · Mayús+Ctrl+] / [ Al frente/fondo · Ctrl+D Transformar de nuevo · Mayús+Ctrl+M Mover… · Ctrl+J Unir · Alt+Ctrl+J Promediar · Ctrl+8 Crear trazado compuesto · Alt+Mayús+Ctrl+8 Liberar · Ctrl+7 Máscara de recorte · Alt+Ctrl+7 Liberar · Mayús+Ctrl+O Crear contornos (texto).

## Modificador

Mayús+Ctrl+E Aplicar último modificador · Alt+Mayús+Ctrl+E Último modificador…

## Selección

Ctrl+A Todo · Alt+Ctrl+A Todo en mesa activa · Mayús+Ctrl+A Deseleccionar · Ctrl+6 Volver a seleccionar.

## Vista

Ctrl+Y Contorno/Previsualizar · Alt+Ctrl+Y Previsualizar píxeles · Ctrl++ / Ctrl+− Zoom · Ctrl+0 Ajustar mesa · Alt+Ctrl+0 Ajustar todo · Ctrl+1 100 % · Ctrl+R Reglas · Ctrl+; Mostrar guías · Alt+Ctrl+; Bloquear guías · Ctrl+5 Crear guías · Ctrl+U Guías inteligentes · Ctrl+' Cuadrícula · Mayús+Ctrl+' Ajustar a cuadrícula · Ctrl+H Ocultar bordes · Mayús+Ctrl+H Ocultar mesas.

## Espacios (nuevos)

Ctrl+Alt+N Nuevo Espacio · Ctrl+Alt+RePág Espacio anterior · Ctrl+Alt+AvPág Espacio siguiente · Ctrl+Alt+1…9 Ir al Espacio n.

## Texto

Ctrl+T Carácter · Alt+Ctrl+T Párrafo · Mayús+Ctrl+L/C/R Alinear izq/centro/der · Mayús+Ctrl+J Justificar · Ctrl+Mayús+< / > Tamaño · Alt+←/→ Tracking · Alt+↑/↓ Interlineado.

## Paneles

F6 Color · F7 Capas · Ctrl+F10 Trazo · Ctrl+F9 Degradado · Mayús+F6 Apariencia · Mayús+F7 Alinear · Mayús+F8 Transformar · Mayús+Ctrl+F9 Buscatrazos.
