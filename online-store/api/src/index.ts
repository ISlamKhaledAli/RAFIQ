import type { Env } from './types.ts';
import { authenticateSyncRequest, authenticateOwnerRequest, checkCloudStoreEntitlement } from './auth.ts';
import {
  StoreRealtimeHub,
  handleIssuePosRealtimeToken,
  handleRealtimeWebSocketConnect,
} from './realtime.ts';
import {
  handleDashboardUploadProductImage,
  handleDashboardDeleteProductImage,
  handleServePublicImage,
} from './handlers/images.ts';
import { handleGovernanceStoreLicenseWebhook } from './handlers/governance.ts';
import {
  handleSyncCatalog,
  handlePruneCatalog,
  handleSyncStock,
  handleSyncSalesSummary,
  handleGetPendingOrders,
  handleUpdateOrdersStatus,
  handleGetSettings,
  handleHeartbeat,
  handleSyncStoreProfile,
  handlePurgeStoreOrders,
  handlePurgeCatalog,
  handleGetCatalogUpdates,
} from './handlers/sync.ts';
import {
  handleGetStore,
  handleGetStoreCategories,
  handleGetStoreProducts,
  handleGetStoreProductDetail,
  handleCreateOrder,
  handleTrackOrder,
} from './handlers/store.ts';
import {
  handleOwnerLogin,
  handleOwnerChangePin,
  handleDashboardOverview,
  handleDashboardGetOrders,
  handleDashboardUpdateOrderStatus,
  handleDashboardGetProducts,
  handleDashboardGetCategories,
  handleDashboardUpdateCategoryVisibility,
  handleDashboardBulkUpdateCategoriesVisibility,
  handleDashboardBulkUpdateProductsVisibility,
  handleDashboardBatchUpdateProducts,
  handleDashboardSmartPublishCatalog,
  handleDashboardUpdateProductOnlineSettings,
  handleDashboardUpdateStoreSettings,
  handleDashboardUpdateStoreTheme,
} from './handlers/dashboard.ts';

function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get('Origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Store-Id, X-Api-Key',
    'Access-Control-Max-Age': '86400',
  };
}

export { StoreRealtimeHub };

export default {
  async fetch(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    // Handle CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request),
      });
    }

    try {
      let response: Response;

      // 1. Health check
      if (url.pathname === '/api/v1/health' || url.pathname === '/health') {
        response = new Response(
          JSON.stringify({ status: 'online', service: 'rafiq-store-api', timestamp: new Date().toISOString() }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      }
      // 1b. Public R2 Image CDN route
      else if (url.pathname.startsWith('/api/v1/images/') && method === 'GET') {
        const objectKey = decodeURIComponent(url.pathname.slice('/api/v1/images/'.length));
        response = await handleServePublicImage(objectKey, env);
      }
      // 1c. Cross-Account Signed Governance Webhook (from rafiq-license-server)
      else if (url.pathname === '/api/v1/internal/governance/store-license' && method === 'POST') {
        response = await handleGovernanceStoreLicenseWebhook(request, env);
      }
      // 1d. Per-store Durable Object WebSocket Hibernation realtime channel (POS & Owner Dashboard)
      else if (url.pathname === '/api/v1/realtime/ws' && method === 'GET') {
        response = await handleRealtimeWebSocketConnect(request, url, env);
      }
      // 2. Public Storefront routes
      else if (url.pathname.startsWith('/api/v1/store/')) {
        const pathSegments = url.pathname.slice('/api/v1/store/'.length).split('/');
        const slug = pathSegments[0];

        // Cloudflare Edge Cache API: Serve public storefront GET requests from global memory (0 D1 row reads)
        const cache = typeof caches !== 'undefined' && (caches as any).default ? (caches as any).default : null;
        let cacheKey: Request | null = null;
        if (method === 'GET' && cache) {
          try {
            cacheKey = new Request(url.toString(), request);
            const cached = await cache.match(cacheKey);
            if (cached) {
              const resHeaders = new Headers(cached.headers);
              resHeaders.set('X-Cache-Status', 'HIT');
              const cors = corsHeaders(request);
              for (const [k, v] of Object.entries(cors)) {
                resHeaders.set(k, v);
              }
              return new Response(cached.body, {
                status: cached.status,
                statusText: cached.statusText,
                headers: resHeaders,
              });
            }
          } catch {}
        }

        const kvGateError = slug ? await checkCloudStoreEntitlement(slug, env) : null;
        if (!slug) {
          response = new Response(JSON.stringify({ error: 'Store slug missing' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        } else if (kvGateError) {
          response = kvGateError;
        } else if (pathSegments.length === 1 && method === 'GET') {
          // GET /api/v1/store/:slug
          response = await handleGetStore(slug, env);
        } else if (pathSegments[1] === 'categories' && method === 'GET') {
          // GET /api/v1/store/:slug/categories
          response = await handleGetStoreCategories(slug, env);
        } else if (pathSegments[1] === 'products') {
          if (pathSegments.length === 2 && method === 'GET') {
            // GET /api/v1/store/:slug/products
            response = await handleGetStoreProducts(slug, url, env);
          } else if (pathSegments.length === 3 && method === 'GET') {
            // GET /api/v1/store/:slug/products/:id
            response = await handleGetStoreProductDetail(slug, pathSegments[2], env);
          } else {
            response = new Response(JSON.stringify({ error: 'Not Found' }), { status: 404 });
          }
        } else if (pathSegments[1] === 'orders') {
          if (pathSegments.length === 2 && method === 'POST') {
            // POST /api/v1/store/:slug/orders
            response = await handleCreateOrder(slug, request, env);
          } else if (pathSegments.length === 3 && method === 'GET') {
            // GET /api/v1/store/:slug/orders/:id
            response = await handleTrackOrder(slug, pathSegments[2], url, env);
          } else {
            response = new Response(JSON.stringify({ error: 'Not Found' }), { status: 404 });
          }
        } else {
          response = new Response(JSON.stringify({ error: 'Not Found' }), { status: 404 });
        }

        // Cache successful storefront GET responses at the Edge
        if (cache && cacheKey && response.status === 200 && method === 'GET') {
          try {
            const clone = response.clone();
            if (ctx && typeof ctx.waitUntil === 'function') {
              ctx.waitUntil(cache.put(cacheKey, clone));
            }
          } catch {}
        }
      }
      // 3. POS Sync routes
      else if (url.pathname.startsWith('/api/v1/sync/')) {
        const auth = await authenticateSyncRequest(request, env);
        if ('error' in auth) {
          response = auth.error;
        } else {
          const store = auth.store;
          if (url.pathname === '/api/v1/sync/catalog' && method === 'POST') {
            response = await handleSyncCatalog(request, env, store);
          } else if (url.pathname === '/api/v1/sync/catalog/prune' && method === 'POST') {
            response = await handlePruneCatalog(request, env, store);
          } else if (url.pathname === '/api/v1/sync/stock' && method === 'POST') {
            response = await handleSyncStock(request, env, store);
          } else if (url.pathname === '/api/v1/sync/sales-summary' && method === 'POST') {
            response = await handleSyncSalesSummary(request, env, store);
          } else if (url.pathname === '/api/v1/sync/orders/pending' && method === 'GET') {
            response = await handleGetPendingOrders(request, env, store);
          } else if (url.pathname === '/api/v1/sync/orders/status' && method === 'POST') {
            response = await handleUpdateOrdersStatus(request, env, store);
          } else if (url.pathname === '/api/v1/sync/settings' && method === 'GET') {
            response = await handleGetSettings(request, env, store);
          } else if (url.pathname === '/api/v1/sync/heartbeat' && method === 'POST') {
            response = await handleHeartbeat(request, env, store);
          } else if (url.pathname === '/api/v1/sync/store-profile' && method === 'POST') {
            response = await handleSyncStoreProfile(request, env, store);
          } else if (url.pathname === '/api/v1/sync/orders/purge' && method === 'POST') {
            response = await handlePurgeStoreOrders(request, env, store);
          } else if (url.pathname === '/api/v1/sync/catalog/purge' && method === 'POST') {
            response = await handlePurgeCatalog(request, env, store);
          } else if (url.pathname === '/api/v1/sync/catalog/updates' && method === 'GET') {
            response = await handleGetCatalogUpdates(request, env, store);
          } else if (url.pathname === '/api/v1/sync/realtime-token' && method === 'POST') {
            response = await handleIssuePosRealtimeToken(request, env, store);
          } else {
            response = new Response(JSON.stringify({ error: 'Sync endpoint not found' }), { status: 404 });
          }
        }
      }
      // 4. Owner Dashboard routes
      else if (url.pathname.startsWith('/api/v1/dashboard/')) {
        if (url.pathname === '/api/v1/dashboard/auth/login' && method === 'POST') {
          response = await handleOwnerLogin(request, env);
        } else {
          const auth = await authenticateOwnerRequest(request, env);
          if ('error' in auth) {
            response = auth.error;
          } else {
            const store = auth.store;
            if (url.pathname === '/api/v1/dashboard/overview' && method === 'GET') {
              response = await handleDashboardOverview(request, url, env, store);
            } else if (url.pathname === '/api/v1/dashboard/orders' && method === 'GET') {
              response = await handleDashboardGetOrders(request, url, env, store);
            } else if (url.pathname.startsWith('/api/v1/dashboard/orders/') && url.pathname.endsWith('/status') && method === 'PUT') {
              const segments = url.pathname.split('/');
              const orderId = segments[segments.length - 2];
              response = await handleDashboardUpdateOrderStatus(request, orderId, env, store);
            } else if (url.pathname === '/api/v1/dashboard/products' && method === 'GET') {
              response = await handleDashboardGetProducts(request, url, env, store);
            } else if (url.pathname === '/api/v1/dashboard/products/bulk-visibility' && method === 'PUT') {
              response = await handleDashboardBulkUpdateProductsVisibility(request, env, store);
            } else if (url.pathname === '/api/v1/dashboard/products/batch' && (method === 'PUT' || method === 'POST')) {
              response = await handleDashboardBatchUpdateProducts(request, env, store);
            } else if (url.pathname === '/api/v1/dashboard/products/smart-publish' && method === 'POST') {
              response = await handleDashboardSmartPublishCatalog(request, env, store);
            } else if (url.pathname === '/api/v1/dashboard/categories' && method === 'GET') {
              response = await handleDashboardGetCategories(request, env, store);
            } else if (url.pathname === '/api/v1/dashboard/categories/bulk-visibility' && method === 'PUT') {
              response = await handleDashboardBulkUpdateCategoriesVisibility(request, env, store);
            } else if (url.pathname.startsWith('/api/v1/dashboard/categories/') && url.pathname.endsWith('/visibility') && method === 'PUT') {
              const segments = url.pathname.split('/');
              const categoryId = decodeURIComponent(segments[segments.length - 2]);
              response = await handleDashboardUpdateCategoryVisibility(request, categoryId, env, store);
            } else if (url.pathname.startsWith('/api/v1/dashboard/products/') && url.pathname.endsWith('/online-settings') && method === 'PUT') {
              const segments = url.pathname.split('/');
              const productId = segments[segments.length - 2];
              response = await handleDashboardUpdateProductOnlineSettings(request, productId, env, store);
            } else if (url.pathname.startsWith('/api/v1/dashboard/products/') && url.pathname.endsWith('/images') && method === 'POST') {
              const segments = url.pathname.split('/');
              const productId = segments[segments.length - 2];
              response = await handleDashboardUploadProductImage(request, productId, env, store);
            } else if (url.pathname.startsWith('/api/v1/dashboard/products/') && url.pathname.endsWith('/images') && method === 'DELETE') {
              const segments = url.pathname.split('/');
              const productId = segments[segments.length - 2];
              response = await handleDashboardDeleteProductImage(request, productId, env, store);
            } else if (url.pathname === '/api/v1/dashboard/store/settings' && method === 'PUT') {
              response = await handleDashboardUpdateStoreSettings(request, env, store);
            } else if (url.pathname === '/api/v1/dashboard/store/theme' && method === 'PUT') {
              response = await handleDashboardUpdateStoreTheme(request, env, store);
            } else if (url.pathname === '/api/v1/dashboard/auth/change-pin' && method === 'POST') {
              response = await handleOwnerChangePin(request, env, store);
            } else {
              response = new Response(JSON.stringify({ error: 'Dashboard endpoint not found' }), { status: 404 });
            }
          }
        }
      } else {
        response = new Response(JSON.stringify({ error: 'Route not found' }), { status: 404 });
      }

      // WebSocket 101 Switching Protocols responses MUST be returned directly (re-wrapping drops webSocket)
      if (response.status === 101) {
        return response;
      }

      // Add CORS headers to response
      const headers = new Headers(response.headers);
      const cors = corsHeaders(request);
      for (const [key, value] of Object.entries(cors)) {
        headers.set(key, value);
      }

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (err: any) {
      const msg = err?.message || 'Unknown';
      const isD1Limit = msg.includes('exceeded D1\'s free tier daily row read limit');
      const status = isD1Limit ? 429 : 500;
      return new Response(
        JSON.stringify({
          error: isD1Limit ? 'D1_QUOTA_EXCEEDED' : 'Internal Server Error',
          message: isD1Limit
            ? 'تم استهلاك الحد اليومي المجاني لقراءة البيانات في Cloudflare D1 (Free Tier). سيتم إعادة التعيين التلقائي عند منتصف الليل 00:00 UTC (بعد قليل).'
            : msg,
          code: isD1Limit ? 'D1_QUOTA_EXCEEDED' : 'INTERNAL_SERVER_ERROR',
          raw_message: msg,
          reset_at_utc: '00:00 UTC',
        }),
        {
          status,
          headers: {
            'Content-Type': 'application/json',
            ...(isD1Limit ? { 'Retry-After': '3600' } : {}),
            ...corsHeaders(request),
          },
        }
      );
    }
  },

  async scheduled(_controller: any, env: Env, ctx: any): Promise<void> {
    if (ctx && typeof ctx.waitUntil === 'function') {
      ctx.waitUntil(runDataRetentionCleanup(env));
    } else {
      await runDataRetentionCleanup(env);
    }
  },
};

/**
 * Automated Data Retention Policy (Design Doc Section 11.1):
 * - Prune completed/rejected/cancelled orders older than 90 days (cascading order_items)
 * - Prune sync_log entries older than 30 days
 * - Prune page_views entries older than 14 days
 */
export async function runDataRetentionCleanup(
  env: Env,
  nowDate: Date = new Date()
): Promise<{ prunedOrders: number; prunedSyncLogs: number; prunedPageViews: number }> {
  const cutoffOrders = new Date(nowDate.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const cutoffSyncLogs = new Date(nowDate.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const cutoffPageViews = new Date(nowDate.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

  await env.DB.prepare(`
    DELETE FROM order_items
    WHERE order_id IN (
      SELECT id FROM orders
      WHERE status IN ('delivered', 'rejected', 'cancelled') AND created_at < ?
    )
  `)
    .bind(cutoffOrders)
    .run();

  const ordersRes = await env.DB.prepare(`
    DELETE FROM orders
    WHERE status IN ('delivered', 'rejected', 'cancelled') AND created_at < ?
  `)
    .bind(cutoffOrders)
    .run();

  const syncRes = await env.DB.prepare(`DELETE FROM sync_log WHERE created_at < ?`)
    .bind(cutoffSyncLogs)
    .run();

  const viewsRes = await env.DB.prepare(`DELETE FROM page_views WHERE created_at < ?`)
    .bind(cutoffPageViews)
    .run();

  return {
    prunedOrders: ordersRes?.meta?.changes ?? 0,
    prunedSyncLogs: syncRes?.meta?.changes ?? 0,
    prunedPageViews: viewsRes?.meta?.changes ?? 0,
  };
}
