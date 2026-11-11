// Builds the Victoria website (GitHub Pages) into ../site-dist.
// The landing page is written here; the documentation pages are generated from the Markdown in docs/ and specs/,
// so the site never drifts from the repository. Usage: `npm install && npm run build` inside site/.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Marked } from 'marked';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const out = path.join(root, 'site-dist');

const REPO = 'https://github.com/sanchezmendozajean/victoria';
const SITE_URL = (process.env.SITE_URL ?? 'https://sanchezmendozajean.github.io/victoria').replace(/\/$/, '');
/** Path of the site on its host (`/victoria/` on GitHub Pages): the 404 page is served from any depth. */
const BASE_PATH = `${new URL(SITE_URL).pathname.replace(/\/+$/, '')}/`;
const version = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;

/** Documentation pages, in reading order. `src` is relative to the repository root. */
const GROUPS = [
  {
    title: 'Empezar',
    pages: [
      { slug: 'manual', src: 'docs/manual-de-usuario.md', title: 'Manual de usuario', desc: 'Del primer documento a exportar e imprimir: herramientas, Espacios, mesas, imágenes y personalización.' },
      { slug: 'instalacion', src: 'docs/instalador.md', title: 'Instalación y firma', desc: 'Instaladores para Windows y Linux, cómo construirlos y cómo firmarlos.' },
    ],
  },
  {
    title: 'Referencia',
    pages: [
      { slug: 'herramientas', src: 'specs/03-herramientas.md', title: 'Herramientas', desc: 'Comportamiento detallado de cada herramienta y de sus modificadores de teclado.' },
      { slug: 'espacios-y-mesas', src: 'specs/04-espacios-y-mesas.md', title: 'Espacios y mesas de trabajo', desc: 'Varios lienzos por documento y mesas de trabajo como páginas exportables.' },
      { slug: 'modificadores', src: 'specs/05-modificadores.md', title: 'Modificadores', desc: 'Efectos no destructivos que se apilan sobre un objeto.' },
      { slug: 'paneles', src: 'specs/06-paneles.md', title: 'Paneles', desc: 'Relleno, Trazo, Apariencia, Capas, Espacios, Mesas de trabajo y el resto de paneles.' },
      { slug: 'texto', src: 'specs/07-texto.md', title: 'Texto', desc: 'Texto de punto, de área y sobre un trazado.' },
      { slug: 'imagenes-vectorizar-imprimir', src: 'specs/08-imagenes-vectorizar-imprimir.md', title: 'Imágenes, vectorizar e imprimir', desc: 'Colocar imágenes, Calco de imagen, exportar e imprimir.' },
      { slug: 'atajos', src: 'specs/09-atajos.md', title: 'Atajos de teclado', desc: 'Los atajos de Victoria, compatibles con Illustrator y editables.' },
    ],
  },
  {
    title: 'Proyecto',
    pages: [{ slug: 'novedades', src: 'CHANGELOG.md', title: 'Novedades', desc: 'Registro de cambios de Victoria.' }],
  },
];
const PAGES = GROUPS.flatMap((g) => g.pages.map((p) => ({ ...p, group: g.title })));
const slugBySrc = new Map(PAGES.map((p) => [p.src, p.slug]));

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slugify = (text) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'seccion';

// ── Markdown ──
let current = { src: '', prefix: '', toc: [], used: new Set() };

/** A link inside a Markdown file: pages of the site stay on the site, other repository files go to GitHub. */
function resolveHref(href) {
  if (!href || /^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(href)) return href;
  const [file, hash = ''] = href.split('#');
  const target = path.posix.normalize(path.posix.join(path.posix.dirname(current.src), file));
  const slug = slugBySrc.get(target);
  if (slug) return `${current.prefix}docs/${slug}/${hash ? `#${hash}` : ''}`;
  const dir = file.endsWith('/') || !path.posix.extname(target);
  return `${REPO}/${dir ? 'tree' : 'blob'}/main/${target}${hash ? `#${hash}` : ''}`;
}

const marked = new Marked({
  gfm: true,
  renderer: {
    heading({ tokens, depth }) {
      const inner = this.parser.parseInline(tokens);
      const plain = inner.replace(/<[^>]+>/g, '');
      let id = slugify(plain);
      for (let n = 2; current.used.has(id); n++) id = `${slugify(plain)}-${n}`;
      current.used.add(id);
      if (depth === 2) current.toc.push({ id, text: plain });
      return `<h${depth} id="${id}"><a class="anchor" href="#${id}" aria-label="Enlace a esta sección">#</a>${inner}</h${depth}>\n`;
    },
    link({ href, title, tokens }) {
      const target = resolveHref(href);
      const external = /^https?:/i.test(target);
      return `<a href="${esc(target)}"${title ? ` title="${esc(title)}"` : ''}${external ? ' rel="noopener"' : ''}>${this.parser.parseInline(tokens)}</a>`;
    },
  },
});

function renderMarkdown(page, prefix) {
  const source = readFileSync(path.join(root, page.src), 'utf8').replace(/^﻿/, '');
  current = { src: page.src, prefix, toc: [], used: new Set() };
  // The page title is drawn by the template: drop the first `# ` heading.
  const body = source.replace(/^\s*#\s+.*\r?\n/, '');
  const html = marked.parse(body).replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, '</table></div>');
  return { html, toc: current.toc };
}

// ── Layout ──
const ICON = (prefix, size = 28) => `<img src="${prefix}assets/icon-${size > 32 ? 256 : 32}.png" width="${size}" height="${size}" alt="" />`;

function head({ title, desc, prefix, path: pagePath }) {
  const url = `${SITE_URL}/${pagePath}`;
  return `<!doctype html>
<html lang="es" data-theme="auto">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}" />
<meta name="theme-color" content="#1e1f22" />
<link rel="canonical" href="${url}" />
<link rel="icon" href="${prefix}assets/favicon.ico" sizes="any" />
<link rel="icon" type="image/png" sizes="32x32" href="${prefix}assets/icon-32.png" />
<link rel="apple-touch-icon" href="${prefix}assets/icon-256.png" />
<meta property="og:type" content="website" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:url" content="${url}" />
<meta property="og:image" content="${SITE_URL}/assets/app-main.png" />
<meta name="twitter:card" content="summary_large_image" />
<script>try{var t=localStorage.getItem('victoria-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}</script>
<link rel="stylesheet" href="${prefix}styles.css" />
</head>`;
}

function header(prefix, active) {
  return `<header class="topbar">
  <div class="topbar__inner">
    <a class="brand" href="${prefix || './'}">${ICON(prefix)}<span>Victoria</span></a>
    <button class="navtoggle" type="button" aria-label="Menú" aria-expanded="false" aria-controls="sidebar">☰</button>
    <nav class="topnav" aria-label="Principal">
      <a href="${prefix}docs/manual/"${active === 'docs' ? ' aria-current="page"' : ''}>Documentación</a>
      <a href="${prefix}#descargas">Descargas</a>
      <a href="${REPO}" rel="noopener">GitHub</a>
      <button class="themetoggle" type="button" aria-label="Cambiar tema claro u oscuro" title="Cambiar tema">◐</button>
    </nav>
  </div>
</header>`;
}

function footer(prefix) {
  return `<footer class="footer">
  <div class="footer__inner">
    <span>${ICON(prefix, 20)} Victoria ${version} · Editor vectorial de escritorio</span>
    <span><a href="${prefix}docs/manual/">Documentación</a> · <a href="${REPO}" rel="noopener">Código en GitHub</a> · <a href="${REPO}/issues" rel="noopener">Reportar un problema</a></span>
  </div>
</footer>
<script src="${prefix}script.js" defer></script>
</body>
</html>`;
}

function sidebar(prefix, activeSlug) {
  const items = GROUPS.map(
    (g) => `<div class="sidenav__group"><p>${esc(g.title)}</p><ul>${g.pages
      .map((p) => `<li><a href="${prefix}docs/${p.slug}/"${p.slug === activeSlug ? ' aria-current="page"' : ''}>${esc(p.title)}</a></li>`)
      .join('')}</ul></div>`,
  ).join('');
  return `<nav class="sidenav" id="sidebar" aria-label="Documentación">${items}</nav>`;
}

function docPage(page) {
  const prefix = '../../';
  const { html, toc } = renderMarkdown(page, prefix);
  const index = PAGES.findIndex((p) => p.slug === page.slug);
  const prev = PAGES[index - 1];
  const next = PAGES[index + 1];
  const pager = `<nav class="pager" aria-label="Páginas">${
    prev ? `<a class="pager__prev" href="${prefix}docs/${prev.slug}/"><small>Anterior</small>${esc(prev.title)}</a>` : '<span></span>'
  }${next ? `<a class="pager__next" href="${prefix}docs/${next.slug}/"><small>Siguiente</small>${esc(next.title)}</a>` : '<span></span>'}</nav>`;
  const tocHtml =
    toc.length > 1
      ? `<aside class="toc" aria-label="En esta página"><p>En esta página</p><ul>${toc.map((t) => `<li><a href="#${t.id}">${esc(t.text)}</a></li>`).join('')}</ul></aside>`
      : '<aside class="toc"></aside>';
  const edit = `${REPO}/edit/main/${page.src}`;
  return `${head({ title: `${page.title} · Victoria`, desc: page.desc, prefix, path: `docs/${page.slug}/` })}
<body class="docs">
${header(prefix, 'docs')}
<div class="layout">
  ${sidebar(prefix, page.slug)}
  <main class="content" id="contenido">
    <p class="eyebrow">${esc(page.group)}</p>
    <h1>${esc(page.title)}</h1>
    <article class="prose">
${html}
    </article>
    <p class="editlink"><a href="${edit}" rel="noopener">Editar esta página en GitHub</a></p>
    ${pager}
  </main>
  ${tocHtml}
</div>
${footer(prefix)}`;
}

const FEATURES = [
  ['Pluma, nodos y manejadores', 'Trazados Bézier con la misma sensación de dibujo de Illustrator: pluma, curvatura, lápiz, selección directa y puntos de ancla.'],
  ['Espacios', 'Varios lienzos infinitos por documento, cada uno con sus capas, objetos y mesas de trabajo.'],
  ['Mesas de trabajo', 'Páginas exportables e imprimibles. Un panel para ordenarlas, reorganizarlas en cuadrícula y ajustarlas a la ilustración.'],
  ['Creador de formas', 'Une o resta regiones arrastrando sobre formas superpuestas, además del panel Buscatrazos.'],
  ['Modificadores no destructivos', 'Sombras, resplandores, desplazar trazado, rugosidad… se apilan sobre el objeto y se pueden aplicar cuando quieras.'],
  ['Texto sobre trazado', 'Texto de punto, de área y sobre un trazado, con fuentes del sistema y creación de contornos.'],
  ['Calco de imagen', 'Convierte mapas de bits en trazados de colores planos, con ajustes, vista previa y expansión.'],
  ['Exportar e imprimir', 'SVG, PDF, PNG y JPG; exportar para pantallas en varios tamaños; imprimir con vista previa, marcas de corte y sangrado.'],
  ['Atajos de Illustrator', 'Los mismos atajos que ya conoces, editables y sin teclas duplicadas.'],
  ['No pierdes trabajo', 'Autoguardado, recuperación tras un cierre inesperado e historial exacto entre Espacios.'],
];

function landing() {
  const prefix = '';
  const cards = FEATURES.map(([t, d]) => `<li class="card"><h3>${esc(t)}</h3><p>${esc(d)}</p></li>`).join('');
  const desc = 'Victoria es un editor de gráficos vectoriales de escritorio para Windows y Linux, con la sensación de dibujo de Illustrator y un concepto nuevo: los Espacios.';
  return `${head({ title: 'Victoria · Editor vectorial de escritorio', desc, prefix, path: '' })}
<body class="home">
${header(prefix, 'home')}
<main id="contenido">
  <section class="hero">
    <div class="hero__text">
      <img class="hero__icon" src="assets/icon-256.png" width="96" height="96" alt="Icono de Victoria" />
      <h1>Dibuja vectores con la sensación de Illustrator</h1>
      <p class="lead">Victoria es un editor de gráficos vectoriales de escritorio para dibujar íconos, acomodar imágenes para imprimir y vectorizar imágenes. Nodos, manejadores, pluma, texto sobre trazado, mesas de trabajo… y un concepto nuevo: los <strong>Espacios</strong>.</p>
      <p class="actions">
        <a class="button button--primary" href="${REPO}/releases/latest" rel="noopener">Descargar la última versión</a>
        <a class="button" href="docs/manual/">Leer la documentación</a>
      </p>
      <p class="meta">Versión ${version} · Windows y Linux · Interfaz en español</p>
    </div>
    <figure class="hero__shot">
      <img src="assets/app-main.png" width="1440" height="900" alt="Victoria con el documento del propio icono abierto: lienzo, herramientas a la izquierda y paneles a la derecha" />
    </figure>
  </section>

  <section class="section" id="funciones">
    <h2>Lo que puedes hacer</h2>
    <ul class="cards">${cards}</ul>
  </section>

  <section class="section section--split">
    <div>
      <h2>Dibuja nodo a nodo</h2>
      <p>La sensación de dibujo de Illustrator: Pluma, Selección directa con nodos y manejadores, Creador de formas y Buscatrazos. En la captura, el propio ícono de Victoria abierto en edición, con sus capas y el panel de trazo.</p>
      <p><a href="docs/herramientas/">Herramientas →</a></p>
    </div>
    <figure><img src="assets/app-nodes.png" width="1440" height="900" loading="lazy" alt="Victoria editando el ícono de la aplicación: trazado seleccionado con sus nodos, panel de capas, trazo y Buscatrazos" /></figure>
  </section>

  <section class="section section--split">
    <div>
      <h2>Imprime lo que ves</h2>
      <p>El cuadro de impresión muestra cada página antes de enviarla: impresora (o <em>Guardar como PDF</em>), qué mesas, papel, orientación automática por mesa, escala real, posición, marcas de corte y sangrado. Las advertencias avisan de imágenes de baja resolución o de mesas que no caben.</p>
      <p><a href="docs/imagenes-vectorizar-imprimir/">Imágenes, vectorizar e imprimir →</a></p>
    </div>
    <figure><img src="assets/app-print.png" width="1440" height="900" loading="lazy" alt="Cuadro de impresión de Victoria con vista previa y ajustes" /></figure>
  </section>

  <section class="section" id="empezar">
    <h2>Empezar en tres pasos</h2>
    <ol class="steps">
      <li><strong>Instala Victoria.</strong> Descarga el instalador de Windows o el paquete de Linux desde la sección de descargas.</li>
      <li><strong>Crea un documento.</strong> Al abrir aparece un A4 vacío; la pantalla de inicio ofrece también Carta, Ícono 24 px, Instagram o un tamaño personalizado.</li>
      <li><strong>Dibuja y exporta.</strong> Usa la Pluma (P), las formas (M, L) o el Texto (T) y exporta a SVG, PDF, PNG o JPG con <kbd>Ctrl</kbd>+<kbd>P</kbd> para imprimir.</li>
    </ol>
    <p><a href="docs/manual/">Manual de usuario →</a></p>
  </section>

  <section class="section" id="descargas">
    <h2>Descargas</h2>
    <p>Los instaladores se publican en la página de <a href="${REPO}/releases" rel="noopener">Releases de GitHub</a>.</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Sistema</th><th>Paquetes</th></tr></thead>
      <tbody>
        <tr><td>Windows</td><td>Instalador <code>Victoria-Setup-&lt;versión&gt;.exe</code> (por usuario, con elección de carpeta) y versión portátil</td></tr>
        <tr><td>Linux</td><td>AppImage, <code>.deb</code> y <code>.rpm</code></td></tr>
      </tbody>
    </table></div>
    <p class="note">Los instaladores aún <strong>no están firmados</strong>: Windows mostrará el aviso de SmartScreen la primera vez. Detalles en <a href="docs/instalacion/">Instalación y firma</a>. También puedes <a href="docs/instalacion/">construirlo tú mismo</a> desde el código.</p>
  </section>

  <section class="section" id="documentacion">
    <h2>Documentación</h2>
    <ul class="doclinks">${PAGES.filter((p) => p.slug !== 'novedades')
      .map((p) => `<li><a href="docs/${p.slug}/"><strong>${esc(p.title)}</strong><span>${esc(p.desc)}</span></a></li>`)
      .join('')}</ul>
  </section>
</main>
${footer(prefix)}`;
}

function notFound() {
  const prefix = BASE_PATH;
  return `${head({ title: 'Página no encontrada · Victoria', desc: 'La página que buscas no existe.', prefix, path: '404.html' })}
<body>
${header(prefix, '')}
<main class="content notfound" id="contenido"><h1>Página no encontrada</h1><p>Esa dirección no existe. Prueba con la <a href="${prefix}docs/manual/">documentación</a> o vuelve al <a href="${prefix}">inicio</a>.</p></main>
${footer(prefix)}`;
}

// ── Build ──
rmSync(out, { recursive: true, force: true });
mkdirSync(path.join(out, 'docs'), { recursive: true });
cpSync(path.join(here, 'assets'), path.join(out, 'assets'), { recursive: true });
for (const file of ['styles.css', 'script.js']) cpSync(path.join(here, file), path.join(out, file));
writeFileSync(path.join(out, '.nojekyll'), '');
writeFileSync(path.join(out, 'index.html'), landing());
writeFileSync(path.join(out, '404.html'), notFound());
for (const page of PAGES) {
  if (!existsSync(path.join(root, page.src))) throw new Error(`Missing source: ${page.src}`);
  const dir = path.join(out, 'docs', page.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'index.html'), docPage(page));
}
const urls = ['', ...PAGES.map((p) => `docs/${p.slug}/`)];
writeFileSync(path.join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${SITE_URL}/${u}</loc></url>`).join('\n')}\n</urlset>\n`);
writeFileSync(path.join(out, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);
console.log(`Site built in ${path.relative(root, out)}: ${PAGES.length} documentation pages + landing.`);
