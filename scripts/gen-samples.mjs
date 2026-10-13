// Builds samples/demo.vict and samples/stress-10k.vict with the real core.
// Usage: pnpm samples:gen
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(tmpdir(), 'victoria-samples-bundle.mjs');
await build({ entryPoints: [path.join(root, 'scripts', 'samples-main.ts')], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'error' });
const { demoDocument, stressDocument } = await import(pathToFileURL(out).href);

mkdirSync(path.join(root, 'samples'), { recursive: true });
writeFileSync(path.join(root, 'samples', 'demo.vict'), demoDocument());
writeFileSync(path.join(root, 'samples', 'stress-10k.vict'), stressDocument(10_000));
console.log('Wrote samples/demo.vict and samples/stress-10k.vict');
