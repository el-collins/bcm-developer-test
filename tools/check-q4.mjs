import { chromium } from 'playwright-core';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const url = pathToFileURL(path.join(root, 'q4-css/index.html')).href;
// Uses CHROME (path to a Chrome/Chromium binary) if set, otherwise the installed Google Chrome.
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : { channel: 'chrome' });
let fail = 0;
const ok = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fail++; };

for (const [name, w, h] of [['desktop', 1000, 500], ['mobile', 375, 700]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.goto(url);
    const boxes = await page.$$eval('.cell', els => els.map(e => {
        const r = e.getBoundingClientRect();
        return { id: e.querySelector('h2').textContent, vis: getComputedStyle(e).display !== 'none', x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) };
    }));
    const vis = boxes.filter(b => b.vis);
    console.log(name, JSON.stringify(vis.map(b => b.id + '@' + b.x + ',' + b.y + ' w' + b.w)));
    if (name === 'desktop') {
        ok('desktop: all 8 visible', vis.length === 8);
        const by = Object.fromEntries(vis.map(b => [b.id, b]));
        ok('desktop: A and B on row 1, A twice as wide as B', by.A.y === by.B.y && Math.abs(by.A.w - 2 * by.B.w) <= 2);
        ok('desktop: C D E row 2', by.C.y === by.D.y && by.D.y === by.E.y && by.C.y > by.A.y);
        ok('desktop: F G H row 3', by.F.y === by.G.y && by.G.y === by.H.y && by.F.y > by.C.y);
    } else {
        ok('mobile: visible order is A D B C G', vis.map(b => b.id).join('') === 'ADBCG');
        const ys = vis.map(b => b.y);
        ok('mobile: single column, strictly stacked', vis.every(b => b.x === vis[0].x) && ys.every((y, i) => i === 0 || y > ys[i - 1]));
    }
    await page.screenshot({ path: path.join(root, `q4-css/screenshot-${name}.png`) });

    // Long heading check: same viewport, one very long unbroken heading in A and a long phrase in B.
    await page.$eval('.cell-a h2', e => e.textContent = 'Supercalifragilisticexpialidocious'.repeat(4));
    await page.$eval('.cell-b h2', e => e.textContent = 'A very long heading that should wrap across several lines without breaking the grid layout at all');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(`${name}: long heading causes no horizontal overflow (${overflow}px)`, overflow <= 0);
    await page.screenshot({ path: path.join(root, `q4-css/screenshot-${name}-long-heading.png`) });
    await page.close();
}
await browser.close();
process.exit(fail ? 1 : 0);
