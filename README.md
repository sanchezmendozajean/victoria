# Victoria

Editor de gráficos vectoriales de escritorio, construido con **Electron**, que replica la forma de dibujar de Adobe Illustrator (nodos, manejadores, pluma, textos, texto sobre trazado, formas, mesas de trabajo, Creador de formas) y añade un concepto nuevo: **Espacios**.

> Uso objetivo: dibujar íconos, acomodar imágenes para imprimir y vectorizar imágenes. No pretende competir con Illustrator en funciones profesionales de preimpresión; sí pretende igualar su *sensación* de dibujo.

**Plataformas:** Windows y Linux (ambas de primera clase).

## Ideas clave

| Concepto | Qué es |
|---|---|
| **Documento** | Un archivo `.vict`. Contiene uno o más Espacios. |
| **Espacio** | Un lienzo infinito independiente (como "el lienzo" de Illustrator). Un documento puede tener muchos. Cada Espacio tiene sus propias capas, objetos y mesas de trabajo. |
| **Mesa de trabajo** | Rectángulo dentro de un Espacio que define una página exportable/imprimible. |
| **Modificador** | Equivalente a los *Efectos de Illustrator* (no los de Photoshop). Se apilan sobre un objeto de forma no destructiva. Algunos alteran la geometría (estructurales), otros solo la apariencia. Se pueden "aplicar" para volverlos permanentes. |
| **Creador de formas** | Herramienta para unir/restar regiones arrastrando sobre formas superpuestas, igual que en Illustrator. |

## Estado

Las fases 1 a 12 del plan están construidas (ver [`CHANGELOG.md`](CHANGELOG.md) para lo hecho y lo pendiente de cada una). Lo que queda abierto es, sobre todo, **verificación fuera de esta máquina**: impresión en papel, Linux (Wayland, GNOME, KDE) y firma de código del instalador.

- **Manual de usuario:** [`docs/manual-de-usuario.md`](docs/manual-de-usuario.md).
- **Construcción:** [`specs/12-plan-de-construccion.md`](specs/12-plan-de-construccion.md).

## Desarrollo

```bash
pnpm install
pnpm dev          # la aplicación con recarga en caliente
pnpm lint         # ESLint y tipos
pnpm test         # pruebas unitarias (Vitest)
pnpm test:e2e     # pruebas de extremo a extremo en Electron (Playwright)
pnpm build:win    # instalador y versión portátil de Windows → release/
pnpm build:linux  # AppImage, deb y rpm → release/
```

Los instaladores **no están firmados** todavía: Windows mostrará el aviso de SmartScreen. Para firmarlos hace falta un certificado de firma de código (ver `docs/instalador.md`).

## Especificaciones

| Archivo | Contenido |
|---|---|
| [`specs/00-vision.md`](specs/00-vision.md) | Visión, alcance, glosario, no-objetivos |
| [`specs/01-arquitectura.md`](specs/01-arquitectura.md) | Stack técnico, procesos de Electron, estructura de carpetas |
| [`specs/02-modelo-de-documento.md`](specs/02-modelo-de-documento.md) | Modelo de datos, formato `.vict`, deshacer/rehacer |
| [`specs/03-herramientas.md`](specs/03-herramientas.md) | Todas las herramientas y su comportamiento exacto |
| [`specs/04-espacios-y-mesas.md`](specs/04-espacios-y-mesas.md) | Espacios y mesas de trabajo |
| [`specs/05-modificadores.md`](specs/05-modificadores.md) | Sistema de modificadores y catálogo |
| [`specs/06-paneles.md`](specs/06-paneles.md) | Paneles (Texto, Alineación, Espaciado, Trazo, Relleno, etc.) |
| [`specs/07-texto.md`](specs/07-texto.md) | Texto de punto, de área, sobre trazado; tipografías |
| [`specs/08-imagenes-vectorizar-imprimir.md`](specs/08-imagenes-vectorizar-imprimir.md) | Imágenes, vectorización, impresión y exportación |
| [`specs/09-atajos.md`](specs/09-atajos.md) | Atajos de teclado (compatibles con Illustrator) |
| [`specs/10-interfaz-visual.md`](specs/10-interfaz-visual.md) | **Especificación visual para Claude Design** |
| [`specs/11-iconografia.md`](specs/11-iconografia.md) | Catálogo de íconos (todo botón lleva ícono) |
| [`specs/12-plan-de-construccion.md`](specs/12-plan-de-construccion.md) | Fases, entregables y criterios de aceptación |
| [`specs/prompts.md`](specs/prompts.md) | Prompts listos para Claude Design y Claude Code |

## Desarrollo (cuando exista código)

```bash
pnpm install
pnpm dev        # Electron + Vite en modo desarrollo
pnpm test       # Pruebas unitarias (Vitest)
pnpm test:e2e   # Pruebas de interfaz (Playwright + Electron)
pnpm build      # Paquetes para el sistema actual (electron-builder)
pnpm build:win  # Instalador NSIS + portable (.exe)
pnpm build:linux # AppImage + .deb + .rpm
```

## Licencia

Por definir.

## Notas de desarrollo

- Requiere Node 24 y pnpm 12 (`packageManager` en `package.json`).
- `pnpm test:e2e` construye la app y lanza Electron; si tu terminal define `ELECTRON_RUN_AS_NODE`, quítala.
- Detrás de un proxy que intercepta TLS: `NODE_OPTIONS=--use-system-ca` para instalar Electron y empaquetar.
- `pnpm samples:gen` crea `samples/demo.vict` y `samples/stress-10k.vict` (10 000 objetos) para probar el lienzo con **Archivo › Abrir**.
- Variables de desarrollo: `VICTORIA_CHROME=custom|system|native-overlay`, `VICTORIA_DEVTOOLS=1`.
