# 01 · Arquitectura

## Stack

| Área | Elección | Motivo |
|---|---|---|
| Shell | Electron (estable) | Requisito del usuario |
| Build | Vite + `vite-plugin-electron` | Arranque y HMR rápidos |
| Lenguaje | TypeScript estricto | Modelo de documento complejo |
| UI | React 18 + Zustand | Paneles y diálogos |
| Lienzo | Canvas 2D propio (OffscreenCanvas donde se pueda) | Control total del hit-testing y overlay |
| Geometría | paper.js (headless), clipper2-js, bezier-js | Booleanas, desplazamiento, proyección |
| Texto | opentype.js | Convertir glifos a curvas, métricas, texto sobre trazado |
| Vectorizar | potrace (WASM) en Worker | Calco de imagen |
| PDF export | pdf-lib (vectorial) | Exportar mesas a PDF |
| PDF import | pdf.js (operadores → trazados) | Abrir PDF (Fase 11); `.ai` con PDF incrustado, muy posterior |
| EPS import | Intérprete PostScript propio (`core/io/eps.ts`) | Abrir EPS simples |
| Íconos | lucide-react + SVG propios | Todo con ícono |
| Pruebas | Vitest, Playwright (`_electron`) | — |
| Empaquetado | electron-builder | Windows: NSIS + portable. Linux: AppImage, .deb, .rpm (Flatpak en v2) |

## Procesos

```
┌──────────────── main (Node) ────────────────┐
│ ventanas · menú nativo · diálogos · fs      │
│ fuentes del sistema · impresión · autosave  │
└──────────────┬──────────────────────────────┘
               │ IPC tipado (contextBridge)
┌──────────────▼──────────────── renderer ─────┐
│ React UI (paneles, barras, diálogos)         │
│ ┌────────────┐  ┌───────────┐  ┌──────────┐  │
│ │  core      │◄─┤ tools     │  │ render   │  │
│ │ documento  │  │ (estados) │  │ canvas   │  │
│ │ comandos   │  └───────────┘  │ overlay  │  │
│ │ modificad. │────────────────►│          │  │
│ └────────────┘                 └──────────┘  │
│ Workers: vectorizar, booleanas pesadas,      │
│          rasterizar exportación              │
└──────────────────────────────────────────────┘
```

## Estructura de carpetas

```
victoria/
├─ CLAUDE.md · README.md · CHANGELOG.md
├─ specs/                    # especificaciones (fuente de verdad)
├─ design/                   # maqueta de Claude Design (HTML/PNG de referencia)
├─ src/
│  ├─ main/                  # proceso principal
│  │  ├─ index.ts · menu.ts · ipc.ts · fonts.ts · print.ts · autosave.ts
│  ├─ preload/index.ts       # API expuesta: window.victoria.*
│  ├─ core/                  # TS puro, sin DOM
│  │  ├─ model/              # Document, Space, Artboard, Layer, nodos
│  │  ├─ geometry/           # Bezier, Path, booleanas, offset, hit-test
│  │  ├─ commands/           # Comandos reversibles + historial
│  │  ├─ modifiers/          # registro + implementaciones
│  │  ├─ text/               # layout de texto, texto en trazado
│  │  ├─ io/                 # .vict, svg, pdf, png
│  │  └─ selection/
│  ├─ renderer/
│  │  ├─ app/                # shell de la app, pestañas, layout
│  │  ├─ canvas/             # Viewport, Renderer, Overlay, SnapEngine
│  │  ├─ tools/              # una herramienta por archivo
│  │  ├─ panels/             # un panel por carpeta
│  │  ├─ components/         # botones, campos numéricos, selectores
│  │  ├─ icons/              # índice + custom/*.svg
│  │  ├─ i18n/es.json
│  │  └─ styles/tokens.css
│  └─ workers/
└─ tests/ (e2e)
```

## Flujo de una interacción

1. `Viewport` recibe `pointerdown`, convierte a coordenadas de documento y lo pasa a la herramienta activa.
2. La herramienta actualiza su estado interno y, si corresponde, emite un **comando provisional** (preview) que el render dibuja sin entrar al historial.
3. En `pointerup` la herramienta hace `commit()` → el comando entra al `History`.
4. `core` emite `documentChanged(diff)`; el render invalida solo las regiones afectadas (dirty rects + caché por objeto).
5. Los paneles se suscriben a la selección vía Zustand (`useSelectionStore`) y leen del core mediante selectores memoizados.

## Render

- Cada objeto cachea su geometría **evaluada** (tras modificadores) y su `Path2D`.
- Capas: `background` (mesas, papel), `content` (objetos), `overlay` (selección, nodos, guías inteligentes, cuadro delimitador, previsualizaciones de herramienta). El overlay se redibuja cada frame; el contenido solo si está sucio.
- Modo **Contorno** (Ctrl+Y): dibuja solo trazados de 1 px sin relleno.
- Modo **Previsualizar píxeles**: rasteriza a 72 ppp de documento.
- HiDPI: escalar por `devicePixelRatio`.

## Rendimiento (objetivos)

- 60 fps en pan/zoom con 10 000 nodos visibles.
- Hit-test < 2 ms (índice espacial R-tree por Espacio, `rbush`).
- Booleanas de más de 500 segmentos → Worker.
- **Regla (Fase 12)**: ninguna operación sobre una selección puede buscar cada objeto por separado en el árbol; usar `locateNodes` / `framesOf` (un recorrido) o las consultas indexadas `locateNode` / `frameOf`. Vigilado por `core/perf/operations.test.ts`.

## Multiplataforma (Windows + Linux)

Ambos sistemas son de primera clase. Lo específico de cada uno vive en `src/main/platform/` detrás de una interfaz común:

```ts
interface Platform {
  listFonts(): Promise<FontInfo[]>;
  print(pdf: Uint8Array, opts: PrintOptions): Promise<void>;
  listPrinters(): Promise<PrinterInfo[]>;
  registerFileAssociation(): void;   // .vict
  windowChrome: 'custom' | 'native-overlay';
}
```

| Tema | Windows | Linux |
|---|---|---|
| Datos de la app / autoguardado | `app.getPath('userData')` → `%APPDATA%\Victoria` | `app.getPath('userData')` → `~/.config/Victoria` |
| Fuentes | `font-list` + `C:\Windows\Fonts`, `%LOCALAPPDATA%\Microsoft\Windows\Fonts` | `fc-list --format` (fontconfig) → rutas reales; fallback `/usr/share/fonts`, `~/.local/share/fonts` |
| Impresión | `webContents.print` desde ventana oculta con el PDF | `webContents.print` (CUPS); fallback `lp -d <impresora> -o fit-to-page=false archivo.pdf` |
| Barra de título | `frame: false` + `titleBarOverlay` (botones nativos de Windows) | `frame: false` + botones propios de la maqueta; opción en Preferencias "Usar barra de título del sistema" (algunos gestores de ventanas Linux se comportan mejor con marco nativo) |
| Asociación `.vict` | Registro vía NSIS | `.desktop` + tipo MIME `application/x-victoria` (archivo XML de shared-mime-info) e ícono en `hicolor` |
| Wayland | — | Lanzar con `--ozone-platform-hint=auto`; probar en GNOME (Wayland) y KDE Plasma; respetar `devicePixelRatio` fraccional |
| Tableta gráfica | Pointer Events con `pressure` | Igual; verificar con libinput |
| Portapapeles | SVG + PNG + formato interno | Igual; en Wayland verificar que pegar desde otras apps funcione |

Reglas:
- Nada de rutas escritas a mano ni separadores `\`; siempre `path.join`.
- Nombres de archivo sensibles a mayúsculas: tratarlos siempre como si lo fueran (Linux lo es).
- Fin de línea: `.gitattributes` con `* text=auto eol=lf`.
- Scripts de `package.json` multiplataforma (`cross-env`, `rimraf`; nada de `cmd` ni `bash` exclusivos).
- **CI** (GitHub Actions): matriz `windows-latest` + `ubuntu-latest` para lint, pruebas unitarias, e2e (Linux con `xvfb-run`) y empaquetado; los artefactos de ambos se adjuntan a cada release.

## Seguridad Electron

`contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, CSP estricta, sin `remote`. El preload expone solo funciones con nombres explícitos (`openFile`, `saveFile`, `listFonts`, `print`, `exportFile`…).
