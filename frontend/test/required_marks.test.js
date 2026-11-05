import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Required-field convention: required fields carry the shared <RequiredMark /> (red asterisk) and
// optional fields carry no "(اختياري)" wording anywhere in the UI sources.
const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const MARK = join(SRC, 'components', 'RequiredMark.tsx');

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.tsx$/.test(e.name)) out.push(p);
  }
  return out;
}

// Removes // and /* */ comments but keeps the contents of string and template literals
function stripComments(src) {
  let out = '';
  let i = 0;
  let quote = null;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (quote) {
      out += c;
      if (c === '\\') {
        out += next ?? '';
        i += 2;
        continue;
      }
      if (c === quote || (c === '\n' && quote !== '`')) quote = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c;
      out += c;
      i++;
    } else if (c === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') i++;
    } else if (c === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? src.length : end + 2;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

const FILES = walk(SRC).map((p) => ({ rel: relative(SRC, p), src: readFileSync(p, 'utf8') }));

describe('required-field marks', () => {
  it('no "(اختياري)" wording remains in the UI sources (comments excluded)', () => {
    const hits = [];
    for (const f of FILES) {
      const code = stripComments(f.src);
      for (const m of code.matchAll(/اختيار[يى]/g)) {
        hits.push(`${f.rel}:${code.slice(0, m.index).split('\n').length}`);
      }
    }
    assert.deepEqual(hits, []);
  });

  it('the comment stripper keeps string content and drops comments', () => {
    assert.equal(stripComments('a // اختياري\nb'), 'a \nb');
    assert.equal(stripComments('a /* اختياري */ b'), 'a  b');
    assert.equal(stripComments('const s = "x // y";'), 'const s = "x // y";');
  });

  it('the shared RequiredMark component exists and is used across the app', () => {
    assert.ok(existsSync(MARK), 'components/RequiredMark.tsx is missing');
    const users = FILES.filter(
      (f) => join(SRC, f.rel) !== MARK && /import\s*\{[^}]*\bRequiredMark\b[^}]*\}\s*from\s*['"][^'"]*RequiredMark['"]/.test(f.src),
    );
    assert.ok(users.length >= 10, `RequiredMark is imported by only ${users.length} files`);
  });
});
