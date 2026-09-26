import type { Env } from './types.ts';
import { handleActivate } from './handlers/activate.ts';
import { handleVerify } from './handlers/verify.ts';
import { handleAdmin } from './handlers/admin.ts';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-Rafiq-Api-Key, X-Admin-Secret, Authorization',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    try {
      // 1. Health Check
      if (url.pathname === '/api/health' || url.pathname === '/') {
        return new Response(
          JSON.stringify({
            status: 'online',
            service: 'Rafiq POS License Activation Server',
            version: '1.0.0',
            timestamp: new Date().toISOString(),
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              'Access-Control-Allow-Origin': '*',
            },
          }
        );
      }

      // 2. Client Device Activation
      if (url.pathname === '/api/activate' && request.method === 'POST') {
        const response = await handleActivate(request, env);
        // Add CORS headers to response
        const newHeaders = new Headers(response.headers);
        newHeaders.set('Access-Control-Allow-Origin', '*');
        return new Response(response.body, { status: response.status, headers: newHeaders });
      }

      // 3. Client License Verification
      if (url.pathname === '/api/verify' && request.method === 'POST') {
        const response = await handleVerify(request, env);
        const newHeaders = new Headers(response.headers);
        newHeaders.set('Access-Control-Allow-Origin', '*');
        return new Response(response.body, { status: response.status, headers: newHeaders });
      }

      // 4. Admin Dashboard and Management APIs
      if (url.pathname.startsWith('/admin') || url.pathname.startsWith('/api/admin')) {
        const response = await handleAdmin(request, env);
        const newHeaders = new Headers(response.headers);
        newHeaders.set('Access-Control-Allow-Origin', '*');
        return new Response(response.body, { status: response.status, headers: newHeaders });
      }

      // 5. 404 Route Not Found
      return new Response(
        JSON.stringify({ success: false, message: 'المسار المطلوب غير موجود في خادم التراخيص' }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('Server Internal Error:', err);
      return new Response(
        JSON.stringify({
          success: false,
          code: 'INTERNAL_ERROR',
          message: 'حدث خطأ داخلي في خادم التراخيص',
          error: errorMessage,
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }
  },
};
