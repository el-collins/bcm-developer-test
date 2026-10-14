import { chromium } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const url = pathToFileURL(path.join(root, 'q5-q6-html-js/index.html')).href;
// Uses CHROME (path to a Chrome/Chromium binary) if set, otherwise the installed Google Chrome.
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : { channel: 'chrome' });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(url);

let fail = 0;
const ok = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fail++; };

// Sequence of children in #paragraphs, e.g. "P P H P" ; image paragraphs "I", hidden image "i".
const seq = () => page.$$eval('#paragraphs > *', els => els.map(e =>
    e.tagName === 'HR' ? 'H' : e.querySelector('img') ? (e.hidden ? 'i' : 'I') : 'P'));
// Expected separator layout for n paragraphs (separators counted over ALL paragraphs).
const expectedShape = n => { const s = []; for (let i = 1; i <= n; i++) { s.push('p'); if (i % 2 === 0 && i < n) s.push('H'); } return s.join(''); };
const shape = async () => (await seq()).map(c => c === 'H' ? 'H' : 'p').join('');
const paraCount = async () => (await page.$$('#paragraphs > p')).length;
const noteTexts = () => page.$$eval('#paragraphs > p', ps => ps.map(p => p.textContent.trim().slice(0, 12)));

async function verify(label) {
    const n = await paraCount();
    ok(`${label}: ${n} paragraphs, separators ${expectedShape(n)}`, (await shape()) === expectedShape(n));
    const s = await seq();
    ok(`${label}: no HR at start/end, no two HRs adjacent`, s[0] !== 'H' && s.at(-1) !== 'H' && !s.join('').includes('HH'));
}

const addBtn = page.locator('#add-btn');
const toggle = page.locator('#toggle-btn');

ok('toggle button exists and was created by JS (not in source HTML)', (await toggle.count()) === 1 && !fs.readFileSync(path.join(root, 'q5-q6-html-js/index.html'), 'utf8').includes('toggle-btn'));
await verify('load');
ok('load: P1 P2 HR P3(image)', (await seq()).join('') === 'PPHI');

// Clicks before toggling.
for (let i = 1; i <= 3; i++) { await addBtn.click(); await verify(`click ${i}`); }
ok('after 3 clicks: 12 paragraphs', (await paraCount()) === 12);
// Each batch of 3 is a permutation of the 3 originals.
const t = await noteTexts();
for (let b = 0; b < 4; b++) ok(`batch ${b + 1} is a permutation of originals`, new Set(t.slice(b * 3, b * 3 + 3)).size === 3);

// Randomised: over many clicks, more than one order is produced.
const orders = new Set();
for (let i = 0; i < 20; i++) { await addBtn.click(); }
const t2 = await noteTexts();
for (let b = 4; b < t2.length / 3; b++) orders.add(t2.slice(b * 3, b * 3 + 3).join('|'));
ok(`randomised: ${orders.size} distinct orders across 20 batches`, orders.size > 1);
await verify('after 20 more clicks');

// Hide images, then add: new image paragraphs stay hidden; separators still count hidden ones.
await toggle.click();
let s = await seq();
ok('toggle: all image paragraphs hidden', !s.includes('I') && s.includes('i'));
await verify('hidden, before adding');
const before = await paraCount();
await addBtn.click(); await addBtn.click();
s = await seq();
ok('hidden: new image paragraphs are hidden too', !s.includes('I'));
ok(`hidden: paragraph count grew by 6 (${before} -> ${await paraCount()})`, (await paraCount()) === before + 6);
await verify('hidden, after adding');
ok('hidden: aria-pressed=true', (await toggle.getAttribute('aria-pressed')) === 'true');

// Show again: every image paragraph, old and new, visible.
await toggle.click();
s = await seq();
ok('shown again: no hidden image paragraphs', !s.includes('i') && s.includes('I'));
await verify('shown, after toggle');
await addBtn.click();
ok('shown: new image paragraphs visible', !(await seq()).includes('i'));
await verify('shown, after adding');

// Odd-count edge: HR must not trail when the last paragraph completes a pair.
ok('no console/page errors', errors.length === 0);
await page.screenshot({ path: path.join(root, 'evidence/q6-final-state.png'), fullPage: true });
await browser.close();
process.exit(fail ? 1 : 0);
