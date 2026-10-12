# Prompts de arranque

Textos listos para copiar y pegar.

## 1. Para Claude Design (maqueta, primero)

```
Vas a diseñar la maqueta visual de "Victoria", un editor vectorial de escritorio
(Electron) inspirado en la forma de trabajar de Adobe Illustrator, pero con
identidad propia (sin logos, colores ni íconos de Adobe).

Lee, en este orden: specs/00-vision.md, specs/10-interfaz-visual.md,
specs/11-iconografia.md, specs/04-espacios-y-mesas.md, specs/06-paneles.md
y specs/05-modificadores.md.

Construye todo lo listado en "Pantallas a maquetar" y "Entregables en design/"
de specs/10-interfaz-visual.md. Usa exactamente los tokens de color, tipografía
y medidas de la spec. Todo botón, menú y opción debe tener ícono (catálogo en
specs/11-iconografia.md; dibuja los "custom" con el mismo estilo de Lucide).
Presta especial atención a la barra de Espacios, que es el concepto nuevo.
Cuando termines, lista las decisiones que tomaste que la spec no cubría.
```

## 2. Para Claude Code (construcción, después de aprobar la maqueta)

```
Lee CLAUDE.md y luego specs/ en el orden que indica. La maqueta aprobada está
en design/. Empieza por la Fase 1 de specs/12-plan-de-construccion.md.
Al terminar cada fase, verifica sus criterios de aceptación, actualiza
CHANGELOG.md, haz commit y detente para que revise antes de seguir con la
siguiente fase. Si algo de la spec es ambiguo, pregúntame antes de decidir.
```
