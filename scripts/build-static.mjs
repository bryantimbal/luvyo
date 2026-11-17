// Builds a static version of the LUVYO app into dist/ (GitHub Pages, Android).
//   node scripts/build-static.mjs
//       Standalone demo: engines + demo data run in the browser, rider data stays on the device.
//   node scripts/build-static.mjs --api https://api.example.com     (or LUVYO_API_BASE=...)
//       Connected app: talks to a hosted LUVYO server (accounts, shared community data).
//       The server must list the app's origin in CORS_ORIGIN (Android: https://localhost).
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyCommunity } from '../core/community.js';
import { createCommunityService } from '../core/communityService.js';
import { seedDemoCommunity } from '../data/seed/demo-community.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const argApi = process.argv.find((a) => a.startsWith('--api'));
const API_BASE = (argApi?.includes('=') ? argApi.split('=')[1] : argApi ? process.argv[process.argv.indexOf(argApi) + 1] : process.env.LUVYO_API_BASE || '').replace(/\/+$/, '');
if (API_BASE && !/^https:\/\//.test(API_BASE) && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(API_BASE)) throw new Error('--api must be an https:// URL');
const out = join(root, 'dist');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(root, 'apps/web'), out, { recursive: true });
cpSync(join(root, 'core'), join(out, 'core'), { recursive: true });

// 1. dataset + simulated demo community
const ds = JSON.parse(readFileSync(join(root, 'data/dev/dataset.json'), 'utf8'));
Object.assign(ds, { contributions: [], confirmations: [], contributors: [], pointsEvents: [] });
let engine = null;
const svc = createCommunityService({ raw: () => ds, engineDs: () => (engine ??= applyCommunity(ds)), touch: () => { engine = null; } });
seedDemoCommunity(svc);
delete ds.reports; delete ds.auditLog; delete ds.fareHistory; delete ds.analytics;
ds.meta = { ...ds.meta, builtAt: new Date().toISOString(), build: 'standalone-demo' };
mkdirSync(join(out, 'data'), { recursive: true });
writeFileSync(join(out, 'data/dataset.json'), JSON.stringify(ds));

// 2. paths: the site is served from a sub-folder (/luvyo/), so make everything relative
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const ASSET = /(["'(`])\/(icons|vendor|styles\.css|app\.js|manifest\.webmanifest|sw\.js|lib\/|screens\/)/g;
for (const f of walk(out)) {
  const ext = extname(f);
  if (!['.js', '.html', '.css', '.webmanifest'].includes(ext) || f.includes('/vendor/')) continue;
  let s = readFileSync(f, 'utf8');
  const toCore = relative(dirname(f), join(out, 'core')) || '.';
  s = s.replace(/(from\s+|import\()(['"])\/core\//g, (_, a, q) => `${a}${q}${toCore.startsWith('.') ? toCore : './' + toCore}/`);
  s = s.replace(ASSET, '$1./$2');
  writeFileSync(f, s);
}
// 3. demo: the in-browser stand-in loads before the app; connected: point the app at the server
const app = join(out, 'app.js');
writeFileSync(app, (API_BASE ? `globalThis.LUVYO_API_BASE = ${JSON.stringify(API_BASE)};\n` : "import './lib/standalone.js';\n") + readFileSync(app, 'utf8'));
// 4. manifest + service worker for a sub-folder site
const mf = JSON.parse(readFileSync(join(out, 'manifest.webmanifest'), 'utf8'));
Object.assign(mf, { id: './', start_url: './#/home', scope: './' });
mf.icons = mf.icons.map((i) => ({ ...i, src: i.src.replace(/^\.?\//, '') }));
writeFileSync(join(out, 'manifest.webmanifest'), JSON.stringify(mf, null, 2));
const sw = join(out, 'sw.js');
writeFileSync(sw, readFileSync(sw, 'utf8')
  .replace(/'\/([^'\s]*)'/g, (m, p) => (p.startsWith('api/') ? m : `'./${p}'`)) // shell entries relative to the sub-folder
  .replace("'./index.html',", "'./index.html', './lib/standalone.js', './data/dataset.json', './core/communityService.js',")
  .replace(/const VERSION = '([^']+)';/, `const VERSION = '$1-${Date.now().toString(36)}';`));
writeFileSync(join(out, '.nojekyll'), '');
cpSync(join(out, 'index.html'), join(out, '404.html'));
rmSync(join(out, 'icons/.gitkeep'), { force: true });
console.log(`Built ${out}: ${walk(out).length} files · ${API_BASE ? `connected to ${API_BASE}` : `standalone demo (${ds.contributions.length} demo contributions)`}`);
