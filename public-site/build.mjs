import { build } from 'vite';
import { build as bundle } from 'esbuild';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
await build({ configFile: fileURLToPath(new URL('./vite.config.ts', import.meta.url)) });
const renderer = new URL('../dist-public-render.mjs', import.meta.url);
try {
  await bundle({ entryPoints: [fileURLToPath(new URL('./render.tsx', import.meta.url))], outfile: fileURLToPath(renderer),
    bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic',
    alias: { 'next/link': fileURLToPath(new URL('./link.tsx', import.meta.url)), '@': fileURLToPath(root) } });
  const { render } = await import(renderer.href);
  const template = await readFile(new URL('dist-public/index.html', root), 'utf8');
  await writeFile(new URL('dist-public/index.html', root), template.replace('<div id="root"></div>', `<div id="root">${render()}</div>`));
  await mkdir(new URL('dist-public/demo/', root), { recursive: true });
  await writeFile(new URL('dist-public/demo/index.html', root), template.replace('<div id="root"></div>', `<div id="root">${render(true)}</div>`).replace('href="https://vergecommon.com/"', 'href="https://vergecommon.com/demo/"'));
  // The public preview has no service worker or installable authenticated app.
  for (const name of ['sw.js', 'manifest.webmanifest']) await rm(new URL(`dist-public/${name}`, root), { force: true });
} finally { await rm(renderer, { force: true }); }
