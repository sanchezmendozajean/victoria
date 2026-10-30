# Instalador y firma

Los instaladores los genera **electron-builder** a partir de [`electron-builder.yml`](../electron-builder.yml).

| Sistema | Comando | Resultado en `release/` |
|---|---|---|
| Windows | `pnpm build:win` | `Victoria-Setup-<versión>.exe` (NSIS, por usuario, con elección de carpeta) y `Victoria-<versión>-win-x64.exe` (portátil) |
| Linux | `pnpm build:linux` | AppImage, `.deb` y `.rpm` (el `.rpm` necesita el paquete `rpm` instalado) |

Para construir en local hace falta `pnpm` en el PATH (electron-builder lo consulta para recoger las dependencias).

Ambos asocian los archivos `.vict` con Victoria. La integración continua (`.github/workflows/ci.yml`) construye los dos en `windows-latest` y `ubuntu-latest` y, en Windows, arranca la aplicación **empaquetada** con `tests/e2e/packaged.spec.ts` (se ejecuta con `VICTORIA_PACKAGED_EXE=<ruta al ejecutable>`; sin esa variable se omite).

## Estado de la verificación

- **Windows:** el instalador NSIS se genera y la aplicación empaquetada arranca, dibuja y abre Preferencias sin errores en consola. No se ha probado la instalación interactiva ni la desinstalación.
- **Linux:** configurado pero **sin verificar** en una máquina real (AppImage, `.deb`, `.rpm`, asociación de archivos, Wayland). El paso de CI correspondiente informa sin bloquear hasta que se verifique.
- **Firma de código:** **no hay certificado**, así que los instaladores salen sin firmar y Windows muestra el aviso de SmartScreen la primera vez.

## Cómo firmar cuando haya certificado (Windows)

electron-builder firma solo si encuentra el certificado en variables de entorno; no hace falta tocar `electron-builder.yml`:

```bash
# certificado .pfx (EV u OV) en un secreto del repositorio
CSC_LINK=<ruta o URL base64 del .pfx>
CSC_KEY_PASSWORD=<contraseña>
pnpm build:win
```

En GitHub Actions: guardar `CSC_LINK` (el `.pfx` en base64) y `CSC_KEY_PASSWORD` como *secrets* y pasarlos como `env` al paso «Build Windows installer and portable». Un certificado OV (validación de organización) elimina el aviso con el tiempo; uno EV lo quita desde el primer día. Si el certificado vive en un token o en un servicio en la nube (Azure Trusted Signing, por ejemplo) se configura `win.signtoolOptions` / `win.azureSignOptions` en `electron-builder.yml`.

En macOS no se mantiene instalador (la spec solo pide que compile).

## Versión

La versión sale de `package.json` (`version`). Cambiarla antes de etiquetar un lanzamiento y anotar el cambio en `CHANGELOG.md`.
