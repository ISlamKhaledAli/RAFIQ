import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ipc = readFileSync(join(ROOT, 'src', 'bridge', 'ipc.ts'), 'utf8').replace(/\r\n/g, '\n');

describe('root account is never blocked by the browser mock bridge admin guards', () => {
  it('every users:* guard that requires an admin also lets the root through', () => {
    const adminOnlyGuards = ipc.match(/currentU\?\.role !== 'admin' && !isSupervisor/g) || [];
    assert.equal(adminOnlyGuards.length, 0, 'a guard checks role !== admin without allowing root');
  });

  it('users:create, users:update and users:changePin accept root', () => {
    for (const channel of ['users:create', 'users:update', 'users:changePin']) {
      const start = ipc.indexOf(`case '${channel}'`);
      assert.ok(start > 0, `${channel} is mocked`);
      const body = ipc.slice(start, start + 1200);
      assert.match(body, /currentU\?\.role === 'root'|currentU\?\.role !== 'root'/, `${channel} must treat root as admin`);
    }
  });
});
