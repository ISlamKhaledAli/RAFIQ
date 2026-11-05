import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Typography standard: text sizes come from the rem-based Tailwind scale (so the app-wide text-size
// control scales them) and nothing renders below the 11px `micro` floor.
const SRC = fileURLToPath(new URL('../src/', import.meta.url));

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.tsx$/.test(e.name)) out.push(p);
  }
  return out;
}

const FILES = walk(SRC).map((p) => ({ rel: relative(SRC, p), src: readFileSync(p, 'utf8') }));
const ARBITRARY_PX = /(?<![\w:-])((?:[a-z0-9-]+:)*)text-\[(\d+(?:\.\d+)?)px\]/g;

describe('typography standard', () => {
  it('no arbitrary px text sizes in components (print: variants are the only exception)', () => {
    const hits = [];
    for (const f of FILES) {
      for (const m of f.src.matchAll(ARBITRARY_PX)) {
        if (m[1].split(':').includes('print')) continue;
        hits.push(`${f.rel}:${f.src.slice(0, m.index).split('\n').length} ${m[0]}`);
      }
    }
    assert.deepEqual(hits, []);
  });

  it('the tailwind scale defines the micro token at 11px in rem', () => {
    const cfg = readFileSync(new URL('../tailwind.config.js', import.meta.url), 'utf8');
    assert.match(cfg, /micro:\s*\['0\.6875rem'/);
  });

  it('every t-* role class used in the sources is defined in index.css', () => {
    const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
    const defined = new Set([...css.matchAll(/^\s*\.(t-[a-z-]+)\s*\{/gm)].map((m) => m[1]));
    const used = new Set();
    for (const f of FILES) for (const m of f.src.matchAll(/(?<![\w:-])(t-(?:page-title|modal-title|section-title|card-title|label|kpi-lg|kpi))(?![\w-])/g)) used.add(m[1]);
    assert.ok(used.size > 0);
    for (const cls of used) assert.ok(defined.has(cls), `${cls} is used but not defined`);
    for (const cls of defined) assert.ok(used.has(cls), `${cls} is defined but never used`);
  });
});
