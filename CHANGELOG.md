# Changelog

## Fase 1 — Esqueleto (en revisión)

### Añadido
- Proyecto Electron + Vite + React 18 + TypeScript estricto; `contextIsolation`, `sandbox`, sin `nodeIntegration`, CSP estricta por `<meta>`, permisos web denegados, navegación y ventanas nuevas bloqueadas.
- Ventana sin marco con barra de título propia: logotipo, nueve menús con íconos y atajos (`Menu` con submenús y teclado), selector de espacio de trabajo y tres variantes de marco: `native-overlay` (Windows, botones nativos), `custom` (Linux) y `system` (barra del sistema).
- Layout completo de la maqueta (pantalla 3): barra de control, barra de herramientas (grupos, desplegables por clic sostenido de 300 ms o clic derecho, Alt+clic rota, una o dos columnas), pestañas de documento, barra de Espacios con menú contextual, lienzo vacío con reglas, columna de paneles vacíos (pestañas, contraer/expandir, arrastrar entre grupos, tira de íconos con ventana flotante) y barra de estado.
- Tokens oscuro/claro (`src/renderer/styles/tokens.css`), Inter incluida con la app, tooltips con nombre y atajo (500 ms).
- `<Icon>` con los 307 íconos del catálogo de la maqueta (generado con `pnpm icons:gen`; los `custom:` son los de la maqueta).
- Atajos de la spec 09 en `app/shortcuts.ts` (Fase 1 enlaza herramientas y paneles).
- Capa `src/main/platform/` (win32, linux) tras la interfaz común; fuentes e impresión son stubs hasta las Fases 7 y 11.
- Cadenas en `i18n/es.json` (claves tipadas).
- CI con matriz `windows-latest` + `ubuntu-latest` (lint, pruebas, e2e con xvfb, empaquetado) y configuración de `electron-builder` (NSIS + portable; AppImage, deb, rpm).
- Pruebas: 37 unitarias (Vitest) y 22 e2e (Playwright + Electron).

### Pendiente de verificar (no se pudo en la máquina de desarrollo)
- `pnpm build:win`: el empaquetado se detiene con `spawn EPERM` en este entorno; ejecutar fuera del sandbox/antivirus.
- Linux (X11 y Wayland, GNOME/KDE), `pnpm build:linux` y CI: sin probar.

### Decisiones tomadas
- React 18 (CLAUDE.md) y TypeScript 6 (`typescript-eslint` aún no soporta 7).
- Íconos desde el catálogo de la maqueta; no se usa `lucide-react` en esta fase.
- Menús dibujados en HTML (necesitan íconos); sin menú nativo en Windows/Linux.
- Datos de documento/Espacios y valores de la barra de control son de ejemplo (`app/placeholder.ts`), se reemplazan en la Fase 2.
- `VICTORIA_CHROME` (solo desarrollo) fuerza una variante de marco; `VICTORIA_SYSTEM_TITLEBAR=1` activa la barra del sistema en Linux hasta que existan Preferencias.
- Conflicto de spec: `Alt+Ctrl+E` (Exportar para pantallas en spec 09, Aplicar modificadores en maqueta 14); «Aplicar modificadores» queda sin atajo.
