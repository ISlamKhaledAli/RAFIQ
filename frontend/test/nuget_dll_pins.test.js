import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// P4-M5: every managed DLL the host references through a NuGet package (and the native sqlite3mc.dll) must have a SHA-256 pin
// in installer/prerequisites/NUGET_DLL_SHA256.txt; the build fails (verify_nuget_dlls.ps1) on a missing file or a mismatch.
describe('NuGet DLL SHA-256 pins (P4-M5)', () => {
  const root = path.resolve('..');
  const pinsPath = path.join(root, 'installer', 'prerequisites', 'NUGET_DLL_SHA256.txt');
  const csproj = fs.readFileSync(path.join(root, 'desktop', 'RafiqPOS.csproj'), 'utf8');
  const packagesConfig = fs.readFileSync(path.join(root, 'desktop', 'packages.config'), 'utf8');

  const pins = fs.readFileSync(pinsPath, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith('#'))
    .map((l) => {
      const m = /^([0-9a-f]{64}) {2}(\S+)$/.exec(l.trim());
      assert.ok(m, `malformed pin line: ${l}`);
      return { sha: m[1], entry: m[2] };
    });

  it('every pin is a well-formed SHA-256 and no entry is duplicated', () => {
    assert.ok(pins.length >= 10);
    const entries = pins.map((p) => p.entry);
    assert.equal(new Set(entries).size, entries.length);
  });

  it('lists every DLL referenced through a packages\\ HintPath in RafiqPOS.csproj', () => {
    const hints = [...csproj.matchAll(/<HintPath>packages\\([^<]+)<\/HintPath>/g)].map((m) => m[1].replace(/\\/g, '/'));
    assert.ok(hints.length >= 14);
    for (const hint of hints) {
      // hint = "<Id>.<Version>/lib/<tfm>/<file>.dll"; the pin entry = "<Id>/<Version>/lib/<tfm>/<file>.dll"
      const m = /^(.+?)\.(\d+\.\d+\.\d+(?:\.\d+)?)\/(.+)$/.exec(hint);
      assert.ok(m, `unparsable hint ${hint}`);
      const entry = `${m[1]}/${m[2]}/${m[3]}`;
      assert.ok(pins.some((p) => p.entry === entry), `no SHA-256 pin for ${entry}`);
    }
  });

  it('pins the native sqlite3mc.dll (win-x86) and every package version matches packages.config', () => {
    assert.ok(pins.some((p) => /SQLite3MC\.PCLRaw\.lib\/[^/]+\/runtimes\/win-x86\/native\/sqlite3mc\.dll$/.test(p.entry)), 'sqlite3mc.dll must be pinned');
    const packages = [...packagesConfig.matchAll(/<package id="([^"]+)" version="([^"]+)"/g)].map((m) => ({ id: m[1], version: m[2] }));
    for (const pin of pins) {
      const [id, version] = pin.entry.split('/');
      const pkg = packages.find((p) => p.id === id);
      assert.ok(pkg, `${id} is pinned but not in packages.config`);
      assert.equal(pkg.version, version, `${id}: pinned version differs from packages.config`);
    }
  });

  it('the build scripts and CI run the verifier', () => {
    const bat = fs.readFileSync(path.join(root, 'Build_Installer.bat'), 'utf8');
    const ci = fs.readFileSync(path.join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
    assert.ok(bat.includes('verify_nuget_dlls.ps1'));
    assert.ok(ci.includes('verify_nuget_dlls.ps1'));
    assert.ok(fs.existsSync(path.join(root, 'installer', 'verify_nuget_dlls.ps1')));
  });
});
