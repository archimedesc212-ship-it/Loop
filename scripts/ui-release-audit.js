#!/usr/bin/env node
/* global process, console */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const checks = [];
function check(label, ok, detail = '') { checks.push({ label, ok: !!ok, detail }); }

const html = read('frontend/index.html');
const css = read('frontend/src/styles/global.css');
const layout = read('frontend/src/components/Layout.jsx');
const main = read('frontend/src/main.jsx');
const catalogBuilder = read('scripts/prepare-music-catalog.js');
const demoAdapter = read('frontend/src/lib/demoMode.js');
const src = path.join(root, 'frontend/src');

check('Mobile viewport is configured', /name=["']viewport["']/.test(html));
check('LOOP dark palette uses charcoal and its own violet accent', /--bg:\s*#121212/i.test(css) && /--accent:\s*#A78BFA/i.test(css) && !/#1ED760/i.test(css));
check('Responsive breakpoints cover tablet and phone widths', /max-width:\s*900px/.test(css) && /max-width:\s*640px/.test(css));
check('Reduced-motion preference is respected', /prefers-reduced-motion:\s*reduce/.test(css));
check('Keyboard focus indicator exists', /:focus-visible/.test(css));
check('Player has a visible official-provider fallback link', /Open in YouTube/.test(layout) && !/Open on Apple Music/.test(layout));
check('Dark-theme stylesheet is loaded', /spotify-dark\.css/.test(main));
check('Offline catalogue fallback never invents a placeholder track', /recordCount:\s*0/.test(catalogBuilder) && /records:\s*\[\]/.test(catalogBuilder) && /payload\.source\?\.fallback !== true/.test(demoAdapter));
check('Layout contains a main landmark and skip link', /<main\b/.test(layout) && /skip-link/.test(layout));

const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(jsx|tsx)$/.test(entry.name)) files.push(full);
  }
}
walk(src);
const imgTag = /<img\b[^>]*>/gs;
let images = 0;
let missingAlt = [];
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  for (const match of text.matchAll(imgTag)) {
    images += 1;
    if (!/\balt\s*=/.test(match[0])) missingAlt.push(path.relative(root, file));
  }
}
check(`All ${images} image elements declare alt text`, missingAlt.length === 0, missingAlt.length ? [...new Set(missingAlt)].join(', ') : '');

let failures = 0;
for (const item of checks) {
  console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.label}${item.detail ? ` — ${item.detail}` : ''}`);
  if (!item.ok) failures += 1;
}
console.log(`\n${checks.length - failures}/${checks.length} static UI release checks passed.`);
if (failures) process.exitCode = 1;
