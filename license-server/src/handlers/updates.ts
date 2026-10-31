import type { Env, LicenseRecord, ReleaseRecord, CheckUpdateResponse } from '../types.ts';

export function compareVersions(v1: string, v2: string): number {
  if (!v1 && !v2) return 0;
  if (!v1) return -1;
  if (!v2) return 1;

  const p1 = v1.trim().replace(/^[vV]/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const p2 = v2.trim().replace(/^[vV]/, '').split('.').map((n) => parseInt(n, 10) || 0);

  const maxLen = Math.max(p1.length, p2.length);
  for (let i = 0; i < maxLen; i++) {
    const num1 = p1[i] || 0;
    const num2 = p2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

export async function handleCheckUpdate(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    let licenseKey: string | null = null;
    let machineFingerprint: string | null = null;
    let currentVersion: string = '1.0.0';

    if (request.method === 'POST') {
      try {
        const body = (await request.json()) as any;
        if (body) {
          licenseKey = body.license_key || body.licenseKey || null;
          machineFingerprint = body.machine_fingerprint || body.machineFingerprint || null;
          currentVersion = body.current_version || body.currentVersion || currentVersion;
        }
      } catch {
        // Fall back to query params if json parsing fails
      }
    }

    // Also check query params as fallback
    if (!licenseKey) licenseKey = url.searchParams.get('license_key') || url.searchParams.get('licenseKey');
    if (!machineFingerprint) machineFingerprint = url.searchParams.get('machine_fingerprint') || url.searchParams.get('fingerprint');
    if (url.searchParams.get('current_version')) currentVersion = url.searchParams.get('current_version')!;
    if (url.searchParams.get('version')) currentVersion = url.searchParams.get('version')!;

    // 1. Check License Entitlement if licenseKey provided
    if (licenseKey) {
      const normalizedKey = licenseKey.trim().toUpperCase();
      const license = await env.DB.prepare(
        'SELECT * FROM licenses WHERE license_key = ?'
      ).bind(normalizedKey).first<LicenseRecord>();

      if (!license) {
        const resp: CheckUpdateResponse = {
          hasUpdate: false,
          isEligible: false,
          currentVersion,
          message: 'مفتاح الترخيص غير مسجل في النظام. يرجى تفعيل النسخة أولاً.',
        };
        return new Response(JSON.stringify(resp), {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        });
      }

      if (license.status !== 'active') {
        const resp: CheckUpdateResponse = {
          hasUpdate: false,
          isEligible: false,
          currentVersion,
          message: 'الترخيص غير نشط أو موقوف من قبل الإدارة.',
        };
        return new Response(JSON.stringify(resp), {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        });
      }

      // Check if update entitlement is explicitly disabled for this license
      if (license.can_receive_updates === 0) {
        const resp: CheckUpdateResponse = {
          hasUpdate: false,
          isEligible: false,
          currentVersion,
          message: 'ميزة التحديثات الهوائية غير مفعلة لهذا المتجر. يرجى مراجعة إدارة رفيق للتفعيل.',
        };
        return new Response(JSON.stringify(resp), {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        });
      }

      // Check if maintenance / update subscription period is expired
      if (license.updates_until) {
        const expiryTime = new Date(license.updates_until).getTime();
        if (!isNaN(expiryTime) && expiryTime < Date.now()) {
          const resp: CheckUpdateResponse = {
            hasUpdate: false,
            isEligible: false,
            currentVersion,
            message: 'انتهت فترة الدعم والتحديثات المشمولة في ترخيصك. يرجى تجديد الاشتراك للاستفادة من الإصدارات الجديدة.',
          };
          return new Response(JSON.stringify(resp), {
            status: 200,
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
          });
        }
      }
    }

    // 2. Query latest published release
    const latestRelease = await env.DB.prepare(
      'SELECT * FROM app_releases WHERE is_published = 1 ORDER BY release_date DESC, created_at DESC LIMIT 1'
    ).first<ReleaseRecord>();

    if (!latestRelease) {
      const resp: CheckUpdateResponse = {
        hasUpdate: false,
        isEligible: true,
        currentVersion,
        message: 'أنت تعمل بأحدث إصدار رسمي من نظام رفيق، ولا توجد تحديثات جديدة منشورة حالياً.',
      };
      return new Response(JSON.stringify(resp), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    }

    const hasNewerVersion = compareVersions(latestRelease.version, currentVersion) > 0;

    const resp: CheckUpdateResponse = {
      hasUpdate: hasNewerVersion,
      isEligible: true,
      currentVersion,
      latestVersion: latestRelease.version,
      releaseDate: latestRelease.release_date,
      title: latestRelease.title,
      changelog: latestRelease.changelog,
      downloadUrl: latestRelease.download_url,
      sha256: latestRelease.sha256,
      isMandatory: latestRelease.is_mandatory === 1,
      fileSizeBytes: latestRelease.file_size_bytes,
      message: hasNewerVersion
        ? `يوجد إصدار جديد متاح (${latestRelease.version}) يتضمن ميزات وتحسينات إضافية.`
        : 'أنت تعمل بأحدث إصدار رسمي من نظام رفيق.',
    };

    return new Response(JSON.stringify(resp), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('Error in handleCheckUpdate:', err);
    return new Response(
      JSON.stringify({
        hasUpdate: false,
        message: 'حدث خطأ أثناء فحص التحديثات: ' + errorMsg,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      }
    );
  }
}

