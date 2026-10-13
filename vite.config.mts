import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import electron from 'vite-plugin-electron/simple';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// CSP lives in a <meta> so it also applies to file:// in production.
// Dev needs inline styles (HMR) and the dev-server websocket.
const PROD_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');
const DEV_CSP = PROD_CSP.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
  .replace("style-src 'self'", "style-src 'self' 'unsafe-inline'")
  .replace("connect-src 'self'", "connect-src 'self' ws://localhost:* http://localhost:*");

function csp(): Plugin {
  return {
    name: 'victoria-csp',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        const policy = ctx.server ? DEV_CSP : PROD_CSP;
        return html.replace('<!--csp-->', `<meta http-equiv="Content-Security-Policy" content="${policy}" />`);
      },
    },
  };
}

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    csp(),
    electron({
      main: {
        entry: 'src/main/index.ts',
        vite: { build: { outDir: 'dist-electron/main' } },
      },
      preload: {
        input: 'src/preload/index.ts',
        vite: { build: { outDir: 'dist-electron/preload' } },
      },
    }),
  ],
  build: { outDir: 'dist', emptyOutDir: true },
});
