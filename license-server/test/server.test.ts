import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createMockD1Database } from './d1-mock.ts';
import server from '../src/index.ts';
import type { Env } from '../src/types.ts';
import { verifyActivationToken } from '../src/crypto.ts';

describe('Rafiq POS License Server & D1 Tests (Feature #170)', () => {
  let env: Env;
  const APP_SECRET = 'test_app_secret_123';
  const ADMIN_SECRET = 'test_admin_secret_456';
  const TOKEN_SECRET = 'test_token_signing_key_789';

  beforeEach(() => {
    const mockDb = createMockD1Database();
    env = {
      DB: mockDb,
      APP_API_KEY: APP_SECRET,
      ADMIN_SECRET: ADMIN_SECRET,
      TOKEN_SIGNING_SECRET: TOKEN_SECRET,
    };
  });

  it('Health Check endpoint returns 200 and status online', async () => {
    const req = new Request('http://localhost/api/health');
    const res = await server.fetch(req, env);
    assert.equal(res.status, 200);
    const data = await res.json() as any;
    assert.equal(data.status, 'online');
  });

  describe('Task 170-5: API Key Protection', () => {
    it('Rejects activation request without API key (401)', async () => {
      const req = new Request('http://localhost/api/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          license_key: 'RFQ-TEST-2026-DEMO',
          machine_fingerprint: 'fp-machine-01',
        }),
      });

      const res = await server.fetch(req, env);
      assert.equal(res.status, 401);
      const data = await res.json() as any;
      assert.equal(data.code, 'UNAUTHORIZED');
    });

    it('Rejects activation request with wrong API key (401)', async () => {
      const req = new Request('http://localhost/api/activate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Rafiq-Api-Key': 'wrong_secret',
        },
        body: JSON.stringify({
          license_key: 'RFQ-TEST-2026-DEMO',
          machine_fingerprint: 'fp-machine-01',
        }),
      });

      const res = await server.fetch(req, env);
      assert.equal(res.status, 401);
    });
  });

  describe('Task 170-3 & 170-4: Activation Logic & Token Issuance', () => {
    it('Successfully activates a pending license and returns a valid signed token', async () => {
      const req = new Request('http://localhost/api/activate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Rafiq-Api-Key': APP_SECRET,
        },
        body: JSON.stringify({
          license_key: 'RFQ-TEST-2026-DEMO',
          machine_fingerprint: 'pc-unique-fingerprint-12345',
        }),
      });

      const res = await server.fetch(req, env);
      assert.equal(res.status, 200);
      const data = await res.json() as any;

      assert.equal(data.success, true);
      assert.ok(data.token, 'Token should be returned');
      assert.equal(data.license.key, 'RFQ-TEST-2026-DEMO');
      assert.equal(data.license.status, 'active');

      // Verify token signature with TOKEN_SECRET
      const verification = await verifyActivationToken(data.token, TOKEN_SECRET);
      assert.equal(verification.valid, true);
      assert.equal(verification.payload?.sub, 'RFQ-TEST-2026-DEMO');
      assert.equal(verification.payload?.fp, 'pc-unique-fingerprint-12345');
    });

    it('Rejects invalid license key (404 Not Found)', async () => {
      const req = new Request('http://localhost/api/activate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Rafiq-Api-Key': APP_SECRET,
        },
        body: JSON.stringify({
          license_key: 'RFQ-FAKE-NON-EXISTENT',
          machine_fingerprint: 'pc-123',
        }),
      });

      const res = await server.fetch(req, env);
      assert.equal(res.status, 404);
      const data = await res.json() as any;
      assert.equal(data.code, 'LICENSE_NOT_FOUND');
    });

    it('Allows idempotent reactivation on the SAME machine (refreshes token)', async () => {
      // 1. First activation
      const req1 = new Request('http://localhost/api/activate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Rafiq-Api-Key': APP_SECRET,
        },
        body: JSON.stringify({
          license_key: 'RFQ-TEST-2026-DEMO',
          machine_fingerprint: 'pc-hardware-uuid-aaa',
        }),
      });
      const res1 = await server.fetch(req1, env);
      assert.equal(res1.status, 200);

      // 2. Reactivation request from SAME machine
      const req2 = new Request('http://localhost/api/activate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Rafiq-Api-Key': APP_SECRET,
        },
        body: JSON.stringify({
          license_key: 'RFQ-TEST-2026-DEMO',
          machine_fingerprint: 'pc-hardware-uuid-aaa',
        }),
      });
      const res2 = await server.fetch(req2, env);
      assert.equal(res2.status, 200);
      const data2 = await res2.json() as any;
      assert.equal(data2.success, true);
      assert.ok(data2.token);
    });

    it('Refuses activation on a DIFFERENT machine if already bound (403 DEVICE_MISMATCH)', async () => {
      // 1. Activate on PC A
      const req1 = new Request('http://localhost/api/activate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Rafiq-Api-Key': APP_SECRET,
        },
        body: JSON.stringify({
          license_key: 'RFQ-TEST-2026-DEMO',
          machine_fingerprint: 'pc-hardware-alpha',
        }),
      });
      await server.fetch(req1, env);

      // 2. Attempt activate same key on PC B
      const req2 = new Request('http://localhost/api/activate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Rafiq-Api-Key': APP_SECRET,
        },
        body: JSON.stringify({
          license_key: 'RFQ-TEST-2026-DEMO',
          machine_fingerprint: 'pc-hardware-bravo', // Different machine!
        }),
      });
      const res2 = await server.fetch(req2, env);
      assert.equal(res2.status, 403);
      const data2 = await res2.json() as any;
      assert.equal(data2.code, 'DEVICE_MISMATCH');
    });

    it('Refuses activation of a disabled / revoked license (403 LICENSE_DISABLED)', async () => {
      const req = new Request('http://localhost/api/activate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Rafiq-Api-Key': APP_SECRET,
        },
        body: JSON.stringify({
          license_key: 'RFQ-DISA-0000-DEAD',
          machine_fingerprint: 'pc-any',
        }),
      });
      const res = await server.fetch(req, env);
      assert.equal(res.status, 403);
      const data = await res.json() as any;
      assert.equal(data.code, 'LICENSE_DISABLED');
    });
  });

  describe('Token Verification & Tamper Detection', () => {
    it('Detects tampered token signature', async () => {
      // 1. Activate to get valid token
      const req = new Request('http://localhost/api/activate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Rafiq-Api-Key': APP_SECRET,
        },
        body: JSON.stringify({
          license_key: 'RFQ-TEST-2026-DEMO',
          machine_fingerprint: 'pc-uuid-valid',
        }),
      });
      const res = await server.fetch(req, env);
      const data = await res.json() as any;
      const validToken: string = data.token;

      // 2. Tamper with token payload (change character in middle part)
      const parts = validToken.split('.');
      const tamperedToken = `${parts[0]}.eyJwYXlsb2FkIjoidGFtcGVyZWQifQ.${parts[2]}`;

      const verifyReq = new Request('http://localhost/api/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Rafiq-Api-Key': APP_SECRET,
        },
        body: JSON.stringify({
          token: tamperedToken,
          machine_fingerprint: 'pc-uuid-valid',
        }),
      });

      const verifyRes = await server.fetch(verifyReq, env);
      assert.equal(verifyRes.status, 400);
      const verifyData = await verifyRes.json() as any;
      assert.equal(verifyData.valid, false);
      assert.equal(verifyData.code, 'INVALID_TOKEN');
    });
  });

  describe('Task 170-7: Admin Dashboard & APIs', () => {
    it('Serves Admin UI HTML on GET /admin', async () => {
      const req = new Request('http://localhost/admin');
      const res = await server.fetch(req, env);
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.ok(html.includes('لوحة إدارة تراخيص رفيق POS'));
    });

    it('Admin can create a new license and list licenses', async () => {
      // 1. Create license
      const createReq = new Request('http://localhost/api/admin/licenses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': ADMIN_SECRET,
        },
        body: JSON.stringify({
          shop_name: 'سوبرماركت المدينة المنورة',
          owner_phone: '01099887766',
          license_type: 'lifetime',
        }),
      });

      const createRes = await server.fetch(createReq, env);
      assert.equal(createRes.status, 201);
      const createData = await createRes.json() as any;
      assert.equal(createData.success, true);
      assert.ok(createData.license.license_key.startsWith('RFQ-'));

      // 2. List licenses
      const listReq = new Request('http://localhost/api/admin/licenses', {
        headers: { 'X-Admin-Secret': ADMIN_SECRET },
      });
      const listRes = await server.fetch(listReq, env);
      assert.equal(listRes.status, 200);
      const listData = await listRes.json() as any;
      assert.ok(listData.data.some((l: any) => l.license_key === createData.license.license_key));
    });

    it('Admin can reset device binding to allow transfer to a new PC', async () => {
      // 1. Activate on PC 1
      const actReq = new Request('http://localhost/api/activate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Rafiq-Api-Key': APP_SECRET,
        },
        body: JSON.stringify({
          license_key: 'RFQ-TEST-2026-DEMO',
          machine_fingerprint: 'pc-old-dead-machine',
        }),
      });
      await server.fetch(actReq, env);

      // 2. Admin unlinks device
      const resetReq = new Request('http://localhost/api/admin/licenses/demo-lic-1/reset-device', {
        method: 'POST',
        headers: { 'X-Admin-Secret': ADMIN_SECRET },
      });
      const resetRes = await server.fetch(resetReq, env);
      assert.equal(resetRes.status, 200);

      // 3. Now activate on PC 2 succeeds!
      const actReq2 = new Request('http://localhost/api/activate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Rafiq-Api-Key': APP_SECRET,
        },
        body: JSON.stringify({
          license_key: 'RFQ-TEST-2026-DEMO',
          machine_fingerprint: 'pc-brand-new-machine',
        }),
      });
      const actRes2 = await server.fetch(actReq2, env);
      assert.equal(actRes2.status, 200);
      const actData2 = await actRes2.json() as any;
      assert.equal(actData2.success, true);
    });
  });
});
