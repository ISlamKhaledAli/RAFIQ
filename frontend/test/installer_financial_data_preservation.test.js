import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const installer = readFileSync(new URL('installer/RafiqPOS_Setup.iss', root), 'utf8');

describe('Installer financial-data preservation source gates (Windows rehearsal still required)', () => {
  it('does not register destructive uninstall entries or name-wide forced termination', () => {
    assert.doesNotMatch(installer, /^\[UninstallDelete\]/m);
    assert.doesNotMatch(installer, /^\[UninstallRun\]/m);
    const callbacks = installer.slice(installer.indexOf('function InitializeUninstall(): Boolean;'));
    assert.ok(callbacks.includes('Financial data, backups, logs and browser recovery profiles were retained.'));
    assert.doesNotMatch(callbacks, /\b(?:DelTree|DeleteFile|RemoveDir|ShellExec)\s*\(/i);
  });

  it('refuses uninstall while the exact application mutex is held, without killing it', () => {
    const program = readFileSync(new URL('desktop/Program.cs', root), 'utf8');
    const mutex = program.match(/mutexName\s*=\s*@"([^"]+)"/)?.[1];
    assert.ok(mutex);
    assert.ok(installer.includes(`CheckForMutexes('${mutex}')`));
    assert.match(installer, /if not UninstallSilent then/);
  });

  for (const name of ['Reset_Rafiq_POS.bat', 'تصفير_الشامل_للنظام.bat']) {
    it(`${name} is only a non-destructive maintenance notice`, () => {
      const source = readFileSync(new URL(encodeURI(name), root), 'utf8');
      const lines = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      for (const line of lines) {
        assert.match(line, /^(?:@echo off|setlocal|title |echo |pause$|exit \/b 1$)/i);
        assert.doesNotMatch(line, /[&|<>]/);
      }
      assert.match(source, /This script did not perform a reset/);
      assert.match(source, /exit \/b 1/i);
      assert.doesNotMatch(source, /\b(?:taskkill|rmdir|del|erase|powershell|rd)\b/i);
    });
  }
});
