# CLAUDE.md — Guía para Claude Code

Este repositorio contiene **Victoria**, un editor vectorial de escritorio (Electron) inspirado en la forma de dibujar de Adobe Illustrator. Lee este archivo completo antes de tocar código.

## Fuente de verdad

- Las especificaciones están en `specs/`. **Son la fuente de verdad.** Si el código y la spec discrepan, gana la spec; si la spec es ambigua, pregunta antes de inventar.
- Orden de lectura obligatorio antes de empezar una fase: `00-vision` → `01-arquitectura` → `02-modelo-de-documento` → la spec de la fase en curso → `12-plan-de-construccion`.
- La maqueta aprobada de Claude Design (cuando exista) vive en `design/`. La UI debe reproducirla fielmente; los tokens de `specs/10-interfaz-visual.md` se implementan en `src/renderer/styles/tokens.css`.

## Idioma

- Interfaz de usuario: **español** (todas las cadenas en `src/renderer/i18n/es.json`, nunca literales en componentes).
- Código, nombres de archivos, identificadores y commits: **inglés**.
- Comentarios: inglés, breves.
- Documentación en `specs/` y `README.md`: español.

## Stack (no cambiar sin preguntar)

- Electron (última estable) + Vite + TypeScript estricto (`strict: true`, sin `any` implícito).
- UI: React 18 + Zustand (estado de UI) . El **documento** NO vive en React: vive en el `core` (ver `01-arquitectura.md`).
- Render del lienzo: Canvas 2D propio sobre un grafo de escena; capa de superposición (overlay) separada para selección, nodos y guías.
- Geometría: `paper.js` (en modo headless, solo matemática y booleanas), `clipper2-js` (desplazamiento de trazado), `bezier-js` (proyecciones y hit-testing).
- Texto: `opentype.js` + `font-list`/API del sistema para enumerar fuentes.
- Vectorizar: `potrace` compilado a WASM (en un Web Worker).
- Íconos: `lucide-react` + íconos propios en `src/renderer/icons/custom/` (ver `specs/11-iconografia.md`).
- Pruebas: Vitest (core), Playwright para Electron (e2e).
- Empaquetado: electron-builder. **Windows y Linux son plataformas de primera clase** (ver "Multiplataforma" en `specs/01-arquitectura.md`). macOS debe compilar, sin garantías.

## Reglas de arquitectura

1. **`src/core` es TypeScript puro**: sin DOM, sin Electron, sin React. Debe poder probarse con Vitest en Node.
2. Toda mutación del documento pasa por un **Comando** (`core/commands`) que es reversible. Nada modifica el documento directamente desde la UI.
3. El proceso principal (`src/main`) solo hace: ventanas, menús nativos, diálogos de archivo, acceso a disco, enumerar fuentes, impresión. Comunicación por `contextBridge` tipado en `src/preload`.
4. `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` en el renderer.
5. Las herramientas (`renderer/tools`) son máquinas de estados con `onPointerDown/Move/Up`, `onKey`, `drawOverlay`. Una herramienta por archivo.
6. Los modificadores se implementan como funciones puras `(geometry, params) => geometry | appearance` registradas en `core/modifiers/registry.ts`.
7. Coordenadas: el documento usa **puntos tipográficos (pt)** internamente, eje Y hacia abajo. Las unidades de la UI (px, mm, cm, pt, in) solo se convierten en la capa de presentación.
8. **Todo botón, opción de menú y entrada de panel tiene ícono.** Si falta uno, agrégalo al catálogo `specs/11-iconografia.md` y a `src/renderer/icons/`.

## Multiplataforma (Windows + Linux)

- Nunca escribir rutas a mano: usar `path.join`, `app.getPath('userData' | 'documents' | 'temp')`.
- Todo código específico de un sistema va en `src/main/platform/{win32,linux}.ts` detrás de una interfaz común (`fonts`, `print`, `fileAssociations`, `windowChrome`).
- Cada fase se prueba en **ambos** sistemas antes de darse por cerrada (CI con runners `windows-latest` y `ubuntu-latest`).
- Atajos: usar `CmdOrCtrl` en los aceleradores de Electron; no depender de combinaciones que los escritorios Linux reservan (ver `specs/09-atajos.md`).

## Fidelidad con Illustrator

La sensación de dibujo es el requisito número uno. Ante cualquier duda de comportamiento (qué hace Alt al arrastrar un manejador, cuándo se cierra un trazado, cómo responde Mayús), **replica el comportamiento de Illustrator** documentado en `specs/03-herramientas.md`. Si la spec no lo cubre, implementa como lo hace Illustrator y agrega la regla a la spec.

## Flujo de trabajo

- Trabaja por fases (`specs/12-plan-de-construccion.md`). No empieces una fase sin que la anterior cumpla sus criterios de aceptación.
- Cada fase termina con: pruebas verdes, `pnpm lint` sin errores, y una nota en `CHANGELOG.md`.
- Commits pequeños, en inglés, formato Conventional Commits (`feat(pen): ...`).
- No agregues dependencias nuevas sin justificarlas en el mensaje de commit.
- Antes de implementar una herramienta, escribe pruebas de su máquina de estados en `core` o `tools/__tests__`.

## Comandos

```bash
pnpm dev | pnpm test | pnpm test:e2e | pnpm lint | pnpm build
```

## Qué NO hacer

- No usar SVG DOM como motor de render del lienzo (es lento con miles de nodos y complica el hit-testing). SVG solo para importar/exportar.
- No implementar filtros tipo Photoshop (desenfoques artísticos, pinceladas, etc.). Solo los modificadores listados en `specs/05-modificadores.md`.
- No guardar el documento en `localStorage`. Solo archivos `.vict` y autoguardado en la carpeta de datos de la app.
- No usar texto sin ícono en barras de herramientas.
