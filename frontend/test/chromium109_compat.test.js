import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('.');
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  if (entry.isDirectory()) return walk(full);
  return /\.(ts|tsx|css)$/.test(entry.name) ? [full] : [];
});
const sources = walk(path.join(root, 'src')).map((file) => ({ file: path.relative(root, file), text: fs.readFileSync(file, 'utf8') }));
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// Fixed WebView2 runtime 109 (Windows 7/8) is the oldest engine the app must run on
const UNAVAILABLE_IN_CHROMIUM_109 = [
  [/\.toSorted\(/, 'Array.prototype.toSorted (Chrome 110)'],
  [/\.toReversed\(/, 'Array.prototype.toReversed (Chrome 110)'],
  [/\.toSpliced\(/, 'Array.prototype.toSpliced (Chrome 110)'],
  [/\bObject\.groupBy\(/, 'Object.groupBy (Chrome 117)'],
  [/\bMap\.groupBy\(/, 'Map.groupBy (Chrome 117)'],
  [/\bPromise\.withResolvers\(/, 'Promise.withResolvers (Chrome 119)'],
  [/\bPromise\.try\(/, 'Promise.try (Chrome 128)'],
  [/\bArray\.fromAsync\(/, 'Array.fromAsync (Chrome 121)'],
  [/\bURL\.canParse\(/, 'URL.canParse (Chrome 120)'],
  [/\.(isWellFormed|toWellFormed)\(/, 'String well-formed methods (Chrome 111)'],
  [/\.(union|intersection|difference|symmetricDifference|isSubsetOf|isSupersetOf|isDisjointFrom)\(/, 'Set methods (Chrome 122)'],
  [/text-wrap\s*:\s*(balance|pretty)/, 'text-wrap: balance/pretty (Chrome 114/117)'],
  [/(^|[\s"'`])text-(balance|pretty)(?=[\s"'`])/, 'Tailwind text-balance/text-pretty classes'],
  [/color-mix\(/, 'color-mix() (Chrome 111)'],
  [/light-dark\(/, 'light-dark() (Chrome 123)'],
  [/\boklch\(|\boklab\(/, 'oklch()/oklab() (Chrome 111)'],
  [/@starting-style/, '@starting-style (Chrome 117)'],
  [/field-sizing\s*:/, 'field-sizing (Chrome 123)'],
];

describe('Chromium 109 compatibility', () => {
  it('the app is type-checked against ES2022, not newer built-ins', () => {
    const config = fs.readFileSync(path.join(root, 'tsconfig.app.json'), 'utf8');
    assert.match(config, /"target":\s*"ES2022"/i);
    assert.match(config, /"lib":\s*\["ES2022",\s*"DOM"\]/);
    assert.ok(!/es2023|esnext/i.test(config.replace(/"module":\s*"esnext"/i, '')), 'no ES2023/ESNext target or lib');
  });

  it('the build target stays chrome109', () => {
    assert.match(fs.readFileSync(path.join(root, 'vite.config.ts'), 'utf8'), /target:\s*'chrome109'/);
  });

  for (const [pattern, name] of UNAVAILABLE_IN_CHROMIUM_109) {
    it(`src does not use ${name}`, () => {
      const hits = [...sources, { file: 'index.html', text: html }]
        .filter(({ text }) => pattern.test(text))
        .map(({ file }) => file);
      assert.deepEqual(hits, []);
    });
  }
});
