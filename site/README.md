# Sitio web de Victoria

Página de inicio y documentación, publicadas con **GitHub Pages**: <https://sanchezmendozajean.github.io/victoria/>.

Las páginas de documentación **se generan** a partir de los Markdown del repositorio (`docs/` y `specs/`, la lista está en `GROUPS` de [`build.mjs`](build.mjs)); no se copian a mano. La portada está escrita en `build.mjs`.

```bash
cd site
npm install      # solo instala "marked"; el sitio tiene su propio package.json y no añade nada a la aplicación
npm run build    # genera ../site-dist (ignorado por git)
```

Para verlo en local sirve `site-dist/` con cualquier servidor estático (por ejemplo `npx serve site-dist`). Con `SITE_URL=https://ejemplo.com/ruta` se cambian las URL absolutas (canonical, Open Graph, sitemap).

## Publicación

El flujo [`.github/workflows/pages.yml`](../.github/workflows/pages.yml) construye y publica el sitio en cada cambio de `main` que toque `site/`, `docs/`, `specs/` o `CHANGELOG.md`. **Una sola vez**, en el repositorio: *Settings › Pages › Build and deployment › Source: GitHub Actions*.

## Contenido y archivos

- `styles.css` y `script.js`: estilos (tema oscuro y claro) y un poco de JavaScript opcional (tema, menú móvil, botón de copiar).
- `assets/`: iconos de `design/Icono para la app/` y las capturas de la aplicación de la portada (`app-main.png`, `app-print.png`). Vuelve a sacarlas cuando cambie mucho la interfaz.
- Las capturas muestran el documento `design/Icono para la app/Icono.vict` en una ventana de 1440 × 900.
