import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createMockD1Database } from './d1-mock.ts';
import server from '../src/index.ts';
import type { Env } from '../src/types.ts';
import { verifyActivationToken, computeFingerprintTag } from '../src/crypto.ts';

async function generateTestPrivateKeyPem(): Promise<string> {
  const pair = (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify']
  )) as CryptoKeyPair;
  const der = new Uint8Array((await crypto.subtle.exportKey('pkcs8', pair.privateKey)) as ArrayBuffer);
  let binary = '';
  for (let i = 0; i < der.length; i++) binary += String.fromCharCode(der[i]);
  return `-----BEGIN PRIVATE KEY-----\n${btoa(binary)}\n-----END PRIVATE KEY-----`;
}

describe('Rafiq POS License Server & D1 Tests (Feature #170)', () => {
  let env: Env;
  const APP_SECRET = 'test_app_secret_123';
  const ADMIN_SECRET = 'test_admin_secret_456';
  let TOKEN_SECRET = '';

  before(async () => {
    TOKEN_SECRET = await generateTestPrivateKeyPem();
  });

  beforeEach(() => {
    const mockDb = createMockD1Database();
    env = {
      DB: mockDb,
      APP_API_KEY: APP_SECRET,
      ADMIN_SECRET: ADMIN_SECRET,
      LICENSE_PRIVATE_KEY: TOKEN_SECRET,
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

    it('Verifies active license and returns fresh token when verified online', async () => {
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
      const initialToken: string = data.token;

      // 2. Verify with initial token
      const verifyReq = new Request('http://localhost/api/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Rafiq-Api-Key': APP_SECRET,
        },
        body: JSON.stringify({
          token: initialToken,
          machine_fingerprint: 'pc-uuid-valid',
        }),
      });

      const verifyRes = await server.fetch(verifyReq, env);
      assert.equal(verifyRes.status, 200);
      const verifyData = await verifyRes.json() as any;
      assert.equal(verifyData.success, true);
      assert.equal(verifyData.valid, true);
      assert.ok(verifyData.token, 'Should return fresh token on verification');
      assert.equal(verifyData.details.status, 'active');
    });
    it('SEC-04: Rejects verification of pending licenses (cannot activate via verify)', async () => {
      await env.DB.prepare("UPDATE licenses SET status = 'pending', machine_fingerprint = NULL WHERE license_key = 'RFQ-TEST-2026-DEMO'").run();
      const verifyReq = new Request('http://localhost/api/verify', {
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
      const res = await server.fetch(verifyReq, env);
      assert.equal(res.status, 403);
      const data = await res.json() as any;
      assert.equal(data.code, 'LICENSE_NOT_ACTIVATED');
    });

  });

  describe('Task 170-7: Admin Dashboard & APIs', () => {
    it('Serves Admin UI HTML on GET /admin', async () => {
      const req = new Request('http://localhost/admin');
      const res = await server.fetch(req, env);
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.ok(html.includes('لوحة إدارة تراخيص رفيق POS'));
      assert.ok(html.includes('tabBtnLicenses'), 'Must have separate Licenses tab button');
      assert.ok(html.includes('tabBtnLogs'), 'Must have separate Audit Logs tab button');
      assert.ok(html.includes('licensesPaginationBar'), 'Must have Licenses pagination bar');
      assert.ok(html.includes('logsPaginationBar'), 'Must have Logs pagination bar');
    });

    it('Admin can list audit logs via /api/admin/logs', async () => {
      const req = new Request('http://localhost/api/admin/logs', {
        headers: { 'X-Admin-Secret': ADMIN_SECRET },
      });
      const res = await server.fetch(req, env);
      assert.equal(res.status, 200);
      const data = await res.json() as any;
      assert.equal(data.success, true);
      assert.ok(Array.isArray(data.data));
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

    it('Admin can generate cryptographically signed offline support code for air-gapped PC', async () => {
      const genReq = new Request('http://localhost/api/admin/generate-support-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': ADMIN_SECRET,
        },
        body: JSON.stringify({
          device_fingerprint: 'A1B2C3D4E5F6',
          license_type: 'trial',
          days: 7,
        }),
      });

      const genRes = await server.fetch(genReq, env);
      assert.equal(genRes.status, 200);
      const genData = await genRes.json() as any;
      assert.equal(genData.success, true);
      assert.ok(genData.support_code.startsWith('RFQ-SUP-'));
      const supportToken = genData.support_code.substring('RFQ-SUP-'.length);
      const supportCheck = await verifyActivationToken(supportToken, TOKEN_SECRET);
      assert.equal(supportCheck.valid, true);
      assert.equal(supportCheck.payload?.fp, 'A1B2C3D4E5F6');
      assert.equal(supportCheck.payload?.type, 'trial');
      assert.equal(supportCheck.payload?.kind, 'support');

      // A tampered support code must fail signature verification
      const tamperedParts = supportToken.split('.');
      const tamperedPayload = JSON.parse(Buffer.from(tamperedParts[1], 'base64url').toString());
      tamperedPayload.type = 'lifetime';
      tamperedParts[1] = Buffer.from(JSON.stringify(tamperedPayload)).toString('base64url');
      const tamperedCheck = await verifyActivationToken(tamperedParts.join('.'), TOKEN_SECRET);
      assert.equal(tamperedCheck.valid, false);

      // Verify offline license is registered in D1 database and can be verified / controlled online
      assert.ok(genData.license_key);
      const dbLic = await env.DB.prepare('SELECT * FROM licenses WHERE license_key = ?').bind(genData.license_key).first() as any;
      assert.ok(dbLic);
      assert.equal(dbLic.status, 'active');
      assert.equal(dbLic.machine_fingerprint, 'A1B2C3D4E5F6');

      // Verify online verification works when device connects to internet
      const verifyReq = new Request('http://localhost/api/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Rafiq-Api-Key': APP_SECRET,
        },
        body: JSON.stringify({
          token: supportToken,
          license_key: genData.license_key,
          machine_fingerprint: 'A1B2C3D4E5F6',
        }),
      });
      const verifyRes = await server.fetch(verifyReq, env);
      assert.equal(verifyRes.status, 200);
      const verifyData = await verifyRes.json() as any;
      assert.equal(verifyData.success, true);
      assert.equal(verifyData.valid, true);
    });
    it('Admin can issue Root Temporary Session via Challenge-Response (SEC-01)', async () => {
      const targetFp = 'A1B2C3D4E5F6';
      const tag = await computeFingerprintTag(targetFp);
      const challenge = '1234-5678-' + tag;

      // 1. Success with matching tag
      const req = new Request('http://localhost/api/admin/root-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': ADMIN_SECRET,
        },
        body: JSON.stringify({
          device_fingerprint: targetFp,
          challenge: challenge,
        }),
      });
      const res = await server.fetch(req, env);
      assert.equal(res.status, 200);
      const data = await res.json() as any;
      assert.equal(data.success, true);
      assert.ok(data.session_token.startsWith('RFQ-ROOT-'));

      const verified = await verifyActivationToken(data.session_token.substring('RFQ-ROOT-'.length), TOKEN_SECRET);
      assert.equal(verified.valid, true);
      assert.equal(verified.payload?.kind, 'root_session');
      assert.equal(verified.payload?.fp, targetFp);

      // 2. Failure with mismatched tag
      const badReq = new Request('http://localhost/api/admin/root-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': ADMIN_SECRET,
        },
        body: JSON.stringify({
          device_fingerprint: targetFp,
          challenge: '1234-5678-ZZ', // Wrong tag
        }),
      });
      const badRes = await server.fetch(badReq, env);
      assert.equal(badRes.status, 400);
    });

    it('Admin can generate PIN Recovery code without duplicating license rows (SEC-02)', async () => {
      await env.DB.prepare("UPDATE licenses SET machine_fingerprint = 'A1B2C3D4E5F6' WHERE status = 'active'").run();
      const lic = await env.DB.prepare("SELECT * FROM licenses WHERE status = 'active' LIMIT 1").first() as any;
      assert.ok(lic);

      const countBefore = ((await env.DB.prepare("SELECT COUNT(*) as c FROM licenses").first()) as any).c;

      const req = new Request(`http://localhost/api/admin/licenses/${lic.id}/recovery-code`, {
        method: 'POST',
        headers: { 'X-Admin-Secret': ADMIN_SECRET },
      });
      const res = await server.fetch(req, env);
      assert.equal(res.status, 200);
      const data = await res.json() as any;
      assert.equal(data.success, true);
      assert.ok(data.recovery_code.startsWith('RFQ-REC-'));

      const verified = await verifyActivationToken(data.recovery_code.substring('RFQ-REC-'.length), TOKEN_SECRET);
      assert.equal(verified.valid, true);
      assert.equal(verified.payload?.kind, 'pin_reset');
      assert.ok(verified.payload?.jti, 'Must contain single-use JTI');

      const countAfter = ((await env.DB.prepare("SELECT COUNT(*) as c FROM licenses").first()) as any).c;
      assert.equal(countAfter, countBefore, 'Recovery generation must NOT duplicate license rows');
    });

    it('Admin can generate Clock Reset code (BUG-06)', async () => {
      await env.DB.prepare("UPDATE licenses SET machine_fingerprint = 'A1B2C3D4E5F6' WHERE status = 'active'").run();
      const lic = await env.DB.prepare("SELECT * FROM licenses WHERE status = 'active' LIMIT 1").first() as any;
      assert.ok(lic);

      const req = new Request(`http://localhost/api/admin/licenses/${lic.id}/clock-reset`, {
        method: 'POST',
        headers: { 'X-Admin-Secret': ADMIN_SECRET },
      });
      const res = await server.fetch(req, env);
      assert.equal(res.status, 200);
      const data = await res.json() as any;
      assert.equal(data.success, true);
      assert.ok(data.reset_code.startsWith('RFQ-TIME-'));

      const verified = await verifyActivationToken(data.reset_code.substring('RFQ-TIME-'.length), TOKEN_SECRET);
      assert.equal(verified.valid, true);
      assert.equal(verified.payload?.kind, 'clock_reset');
    });

    it('Offline support code handles custom days without D1 check constraint error', async () => {
      const req = new Request('http://localhost/api/admin/generate-support-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': ADMIN_SECRET,
        },
        body: JSON.stringify({
          device_fingerprint: 'CUSTOM-DAYS-FP-1',
          license_type: 'custom',
          days: 1,
          shop_name: 'Custom Day Shop',
        }),
      });
      const res = await server.fetch(req, env);
      assert.equal(res.status, 200);
      const data = await res.json() as any;
      assert.equal(data.success, true);
      assert.ok(data.support_code.startsWith('RFQ-SUP-'));

      // Check D1 DB record
      const dbLic = await env.DB.prepare('SELECT * FROM licenses WHERE license_key = ?').bind(data.license_key).first() as any;
      assert.ok(dbLic);
      assert.ok(['trial', 'monthly', 'annual', 'lifetime'].includes(dbLic.license_type));
    });


  describe('Over-the-Air Updates & Selective Rollout (Feature #171)', () => {
    async function seedTestRelease(db: any, version = '1.1.0', isPublished = 1) {
      await db.prepare(
        `INSERT INTO app_releases (id, version, release_date, title, changelog, download_url, sha256, file_size_bytes, is_mandatory, is_published, min_client_version, created_at, updated_at)
         VALUES ('test-rel-id-1', ?, '2026-11-01', 'إصدار رفيق v1.1.0 المستقر', 'إضافة موديول الصيدليات', 'https://github.com/ISlamKhaledAli/RAFIQ/releases/download/v1.1.0/RafiqPOS_Update_v1.1.0.zip', 'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855', 25480120, 0, ?, '1.0.0', datetime('now'), datetime('now'))`
      ).bind(version, isPublished).run();
    }

    it('Returns hasUpdate=false when no releases published', async () => {
      const req = new Request('http://localhost/api/updates/check?version=1.0.0');
      const res = await server.fetch(req, env);
      assert.equal(res.status, 200);
      const data = await res.json() as any;
      assert.equal(data.hasUpdate, false);
      assert.ok(data.message);
    });

    it('Admin can publish new release to D1', async () => {
      const req = new Request('http://localhost/api/admin/releases', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': ADMIN_SECRET,
        },
        body: JSON.stringify({
          version: '1.1.0',
          title: 'إصدار رفيق v1.1.0 المستقر',
          changelog: 'إضافة موديول الصيدليات والكافيهات المتكامل',
          download_url: 'https://github.com/ISlamKhaledAli/RAFIQ/releases/download/v1.1.0/RafiqPOS_Update_v1.1.0.zip',
          sha256: 'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855',
          file_size_bytes: 25480120,
          is_mandatory: false,
        }),
      });
      const res = await server.fetch(req, env);
      assert.equal(res.status, 201);
      const data = await res.json() as any;
      assert.equal(data.success, true);
      assert.equal(data.version, '1.1.0');

      // Verify in DB
      const inDb = await env.DB.prepare('SELECT * FROM app_releases WHERE version = ?').bind('1.1.0').first() as any;
      assert.ok(inDb);
      assert.equal(inDb.version, '1.1.0');
    });

    it('Admin can list published releases via /api/admin/releases', async () => {
      await seedTestRelease(env.DB, '1.1.0', 1);

      const req = new Request('http://localhost/api/admin/releases', {
        headers: { 'X-Admin-Secret': ADMIN_SECRET },
      });
      const res = await server.fetch(req, env);
      assert.equal(res.status, 200);
      const data = await res.json() as any;
      assert.equal(data.success, true);
      assert.ok(Array.isArray(data.releases));
      assert.equal(data.releases.length, 1);
      assert.equal(data.releases[0].version, '1.1.0');
    });

    it('Client receives update when newer version is published', async () => {
      await seedTestRelease(env.DB, '1.1.0', 1);

      const req = new Request('http://localhost/api/updates/check?version=1.0.0');
      const res = await server.fetch(req, env);
      assert.equal(res.status, 200);
      const data = await res.json() as any;
      assert.equal(data.hasUpdate, true);
      assert.equal(data.latestVersion, '1.1.0');
      assert.ok(data.downloadUrl);
      assert.ok(data.sha256);
    });

    it('Client with same or newer version receives hasUpdate=false', async () => {
      await seedTestRelease(env.DB, '1.1.0', 1);

      const req = new Request('http://localhost/api/updates/check?version=1.1.0');
      const res = await server.fetch(req, env);
      assert.equal(res.status, 200);
      const data = await res.json() as any;
      assert.equal(data.hasUpdate, false);
      assert.equal(data.latestVersion, '1.1.0');
    });

    it('Admin can emergency-toggle (kill switch) published release', async () => {
      await seedTestRelease(env.DB, '1.1.0', 1);
      const rel = await env.DB.prepare('SELECT id FROM app_releases WHERE version = ?').bind('1.1.0').first() as any;
      assert.ok(rel);

      // Disable release
      const toggleReq = new Request(`http://localhost/api/admin/releases/${rel.id}/toggle`, {
        method: 'POST',
        headers: { 'X-Admin-Secret': ADMIN_SECRET },
      });
      const toggleRes = await server.fetch(toggleReq, env);
      assert.equal(toggleRes.status, 200);
      const toggleData = await toggleRes.json() as any;
      assert.equal(toggleData.is_published, 0);

      // Client check now returns no update!
      const checkReq = new Request('http://localhost/api/updates/check?version=1.0.0');
      const checkRes = await server.fetch(checkReq, env);
      const checkData = await checkRes.json() as any;
      assert.equal(checkData.hasUpdate, false);

      // Re-enable
      const reToggle = await server.fetch(toggleReq, env);
      const reData = await reToggle.json() as any;
      assert.equal(reData.is_published, 1);
    });

    it('Client update check respects license status and can_receive_updates entitlement', async () => {
      await seedTestRelease(env.DB, '1.1.0', 1);

      // 1. Valid active license
      const reqActive = new Request('http://localhost/api/updates/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          license_key: 'RFQ-PERM-8899-A1B2',
          current_version: '1.0.0',
        }),
      });
      const resActive = await server.fetch(reqActive, env);
      const dataActive = await resActive.json() as any;
      assert.equal(dataActive.hasUpdate, true);
      assert.equal(dataActive.isEligible, true);

      // 2. Disabled license
      const reqDisabled = new Request('http://localhost/api/updates/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          license_key: 'RFQ-DISA-0000-DEAD',
          current_version: '1.0.0',
        }),
      });
      const resDisabled = await server.fetch(reqDisabled, env);
      const dataDisabled = await resDisabled.json() as any;
      assert.equal(dataDisabled.hasUpdate, false);
      assert.equal(dataDisabled.isEligible, false);

      // 3. Blocked updates entitlement
      await env.DB.prepare("UPDATE licenses SET can_receive_updates = 0 WHERE license_key = 'RFQ-PERM-8899-A1B2'").run();
      const reqBlocked = new Request('http://localhost/api/updates/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          license_key: 'RFQ-PERM-8899-A1B2',
          current_version: '1.0.0',
        }),
      });
      const resBlocked = await server.fetch(reqBlocked, env);
      const dataBlocked = await resBlocked.json() as any;
      assert.equal(dataBlocked.hasUpdate, false);
      assert.equal(dataBlocked.isEligible, false);

      // Restore
      await env.DB.prepare("UPDATE licenses SET can_receive_updates = 1 WHERE license_key = 'RFQ-PERM-8899-A1B2'").run();
    });

    it('Client update check rejects expired updates_until subscription', async () => {
      await seedTestRelease(env.DB, '1.1.0', 1);

      // Set expired updates_until (yesterday)
      const yesterday = new Date(Date.now() - 86400000).toISOString();
      await env.DB.prepare("UPDATE licenses SET updates_until = ? WHERE license_key = 'RFQ-PERM-8899-A1B2'").bind(yesterday).run();

      const req = new Request('http://localhost/api/updates/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          license_key: 'RFQ-PERM-8899-A1B2',
          current_version: '1.0.0',
        }),
      });
      const res = await server.fetch(req, env);
      const data = await res.json() as any;
      assert.equal(data.hasUpdate, false);
      assert.equal(data.isEligible, false);
      assert.ok(data.message.includes('انتهت فترة الدعم والتحديثات'));

      // Clean up
      await env.DB.prepare("UPDATE licenses SET updates_until = NULL WHERE license_key = 'RFQ-PERM-8899-A1B2'").run();
    });

    it('Admin can toggle license update entitlement and extend subscription', async () => {
      const lic = await env.DB.prepare("SELECT id FROM licenses WHERE license_key = 'RFQ-PERM-8899-A1B2'").first() as any;
      assert.ok(lic);

      // 1. Toggle updates
      const togReq = new Request(`http://localhost/api/admin/licenses/${lic.id}/toggle-updates`, {
        method: 'POST',
        headers: { 'X-Admin-Secret': ADMIN_SECRET },
      });
      const togRes = await server.fetch(togReq, env);
      assert.equal(togRes.status, 200);
      const togData = await togRes.json() as any;
      assert.equal(togData.can_receive_updates, 0);

      // 2. Extend subscription for 365 days
      const extReq = new Request(`http://localhost/api/admin/licenses/${lic.id}/extend-updates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': ADMIN_SECRET,
        },
        body: JSON.stringify({ days: 365 }),
      });
      const extRes = await server.fetch(extReq, env);
      assert.equal(extRes.status, 200);
      const extData = await extRes.json() as any;
      assert.equal(extData.success, true);
      assert.equal(extData.can_receive_updates, 1);
      assert.ok(extData.updates_until);
    });
  });
  });
});

