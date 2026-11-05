import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { DEST_DIR, MAX_BYTES, MAX_HEIGHT, MAX_WIDTH, SOURCE_DIR, syncSignatures, validateSignaturePng } from '../scripts/sync-signatures.mjs';

const pngNames = (dir) => fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.png')).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
const read = (...parts) => fs.readFileSync(path.resolve(...parts), 'utf8');

function tinyPng(width, height, size = 40) {
  const b = Buffer.alloc(size);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

describe('built-in signature images: the host folder and the frontend mirror', () => {
  it('both folders hold the same file names and bytes, and there is at least one default', () => {
    const host = pngNames(SOURCE_DIR);
    const web = pngNames(DEST_DIR);
    assert.ok(host.length >= 1, 'at least one built-in image');
    assert.deepEqual(web, host, 'same file names in desktop/Resources/signatures and frontend/src/assets/signatures (run: npm run sync:signatures)');
    for (const name of host) {
      assert.ok(fs.readFileSync(path.join(SOURCE_DIR, name)).equals(fs.readFileSync(path.join(DEST_DIR, name))), `${name} is byte-identical (run: npm run sync:signatures)`);
    }
    assert.ok(host.includes('default_01.png'), 'the original default moved into the folder');
  });

  it('every file is a valid PNG within the limits the host enforces for custom images', () => {
    const cs = read('..', 'desktop', 'Services', 'SettingsService.cs');
    assert.ok(cs.includes(`MaxSignatureImageBytes = ${MAX_BYTES}`) && cs.includes(`MaxSignatureImageWidth = ${MAX_WIDTH}`) && cs.includes(`MaxSignatureImageHeight = ${MAX_HEIGHT}`), 'the script limits equal the host constants');
    for (const dir of [SOURCE_DIR, DEST_DIR]) {
      for (const name of pngNames(dir)) {
        assert.deepEqual(validateSignaturePng(name, fs.readFileSync(path.join(dir, name))), [], `${name} in ${path.basename(path.dirname(dir))}/${path.basename(dir)}`);
      }
    }
  });

  it('the old single-image locations are gone', () => {
    assert.ok(!fs.existsSync(path.resolve('public', 'receipt_signature.png')));
    assert.ok(!fs.existsSync(path.resolve('..', 'desktop', 'Resources', 'receipt_signature.png')));
  });

  it('the host embeds every PNG of the folder with a stable logical name and orders them ordinally', () => {
    const csproj = read('..', 'desktop', 'RafiqPOS.csproj');
    assert.ok(/<EmbeddedResource Include="Resources\\signatures\\\*\.png">\s*<LogicalName>RafiqPOS\.signatures\.%\(Filename\)%\(Extension\)<\/LogicalName>\s*<\/EmbeddedResource>/.test(csproj));
    const cs = read('..', 'desktop', 'Services', 'PrinterService.cs');
    assert.ok(cs.includes('"RafiqPOS.signatures."') && cs.includes('Array.Sort(names, StringComparer.Ordinal)'));
  });
});

describe('built-in signature images: the frontend loader', () => {
  it('loads the folder with import.meta.glob and sorts the file names ordinally like the host', () => {
    const src = read('src', 'utils', 'signatureDefaults.ts');
    assert.ok(src.includes("import.meta.glob<string>('../assets/signatures/*.png', { eager: true, query: '?url', import: 'default' })"));
    assert.ok(src.includes('(a < b ? -1 : a > b ? 1 : 0)') && src.includes('.sort(ordinal)'), 'ordinal, not locale, order');
    assert.ok(src.includes('export const BUILT_IN_SIGNATURE_IMAGES'));
  });

  it('the settings tab and the receipt modal pass the built-in set to the model', () => {
    const tab = read('src', 'views', 'settings', 'StoreProfileTab.tsx');
    assert.ok(tab.includes('builtInSignatureImages: BUILT_IN_SIGNATURE_IMAGES') && tab.includes('builtIns={BUILT_IN_SIGNATURE_IMAGES}'));
    assert.ok(read('src', 'components', 'ReceiptModal.tsx').includes('builtInSignatureImages: BUILT_IN_SIGNATURE_IMAGES'));
  });
});

describe('npm run sync:signatures', () => {
  it('is wired before dev and build, and documented in the script header', () => {
    const pkg = JSON.parse(read('package.json'));
    assert.equal(pkg.scripts['sync:signatures'], 'node scripts/sync-signatures.mjs');
    assert.equal(pkg.scripts.predev, 'npm run sync:signatures');
    assert.equal(pkg.scripts.prebuild, 'npm run sync:signatures');
    assert.equal(pkg.scripts.dev, 'vite');
    assert.equal(pkg.scripts.build, 'tsc -b && vite build');
    assert.equal(pkg.scripts.test, 'node --experimental-strip-types --test', 'tests stay pure: they detect drift instead of fixing it');
    const header = read('scripts', 'sync-signatures.mjs').split('\n').slice(0, 25).join('\n');
    for (const step of ['black on white', '220,000 bytes', 'desktop/Resources/signatures/', 'npm run sync:signatures', 'Rebuild the C# project on Windows']) {
      assert.ok(header.includes(step), `header mentions: ${step}`);
    }
  });

  it('validates files: not a PNG, too big, too wide, too tall, unsafe names', () => {
    assert.deepEqual(validateSignaturePng('ok.png', tinyPng(900, 138)), []);
    assert.ok(validateSignaturePng('x.png', Buffer.from('hello')).some((p) => p.includes('not a PNG')));
    assert.ok(validateSignaturePng('x.png', Buffer.alloc(8)).some((p) => p.includes('not a PNG')), '8 bytes or fewer');
    assert.ok(validateSignaturePng('x.png', tinyPng(1601, 100)).some((p) => p.includes('outside')));
    assert.ok(validateSignaturePng('x.png', tinyPng(100, 601)).some((p) => p.includes('outside')));
    assert.ok(validateSignaturePng('x.png', tinyPng(100, 100, MAX_BYTES + 1)).some((p) => p.includes('larger than')));
    assert.ok(validateSignaturePng('bad name.png', tinyPng(10, 10)).some((p) => p.includes('file name')));
    assert.ok(validateSignaturePng('x.png', Buffer.concat([tinyPng(10, 10).subarray(0, 12), Buffer.from('XXXX'), Buffer.alloc(30)])).some((p) => p.includes('IHDR')));
  });

  it('copies, mirrors and removes extras; fails loudly on an empty or invalid source', () => {
    const tmp = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR || '/tmp'), 'sigsync-'));
    try {
      const source = path.join(tmp, 'src');
      const dest = path.join(tmp, 'dst');
      fs.mkdirSync(source);
      assert.throws(() => syncSignatures(source, dest), /No PNG found/);

      fs.writeFileSync(path.join(source, 'default_02.png'), tinyPng(100, 50));
      fs.writeFileSync(path.join(source, 'default_01.png'), tinyPng(200, 50));
      fs.mkdirSync(dest);
      fs.writeFileSync(path.join(dest, 'stale.png'), tinyPng(10, 10));
      fs.writeFileSync(path.join(dest, '.gitkeep'), '');
      const first = syncSignatures(source, dest);
      assert.deepEqual(first, { copied: ['default_01.png', 'default_02.png'], unchanged: [], removed: ['stale.png'] });
      assert.deepEqual(fs.readdirSync(dest).sort(), ['.gitkeep', 'default_01.png', 'default_02.png'], 'only extra PNGs are removed');
      assert.deepEqual(syncSignatures(source, dest), { copied: [], unchanged: ['default_01.png', 'default_02.png'], removed: [] }, 'idempotent');

      fs.writeFileSync(path.join(source, 'broken.png'), Buffer.from('not a png at all'));
      assert.throws(() => syncSignatures(source, dest), /rejected[\s\S]*broken\.png: not a PNG/);
      assert.ok(fs.existsSync(path.join(dest, 'default_01.png')), 'nothing is deleted when the source is rejected');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
