import type { Env } from './types.ts';
import { authenticateSyncRequest, authenticateOwnerRequest } from './auth.ts';
import {
  handleSyncCatalog,
  handleSyncStock,
  handleSyncSalesSummary,
  handleGetPendingOrders,
  handleUpdateOrdersStatus,
  handleGetSettings,
  handleHeartbeat,
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
  handleDashboardOverview,
  handleDashboardGetOrders,
  handleDashboardUpdateOrderStatus,
  handleDashboardGetProducts,
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
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
      // 2. Public Storefront routes
      else if (url.pathname.startsWith('/api/v1/store/')) {
        const pathSegments = url.pathname.slice('/api/v1/store/'.length).split('/');
        const slug = pathSegments[0];

        if (!slug) {
          response = new Response(JSON.stringify({ error: 'Store slug missing' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
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
              response = await handleDashboardOverview(request, env, store);
            } else if (url.pathname === '/api/v1/dashboard/orders' && method === 'GET') {
              response = await handleDashboardGetOrders(request, url, env, store);
            } else if (url.pathname.startsWith('/api/v1/dashboard/orders/') && url.pathname.endsWith('/status') && method === 'PUT') {
              const segments = url.pathname.split('/');
              const orderId = segments[segments.length - 2];
              response = await handleDashboardUpdateOrderStatus(request, orderId, env, store);
            } else if (url.pathname === '/api/v1/dashboard/products' && method === 'GET') {
              response = await handleDashboardGetProducts(request, url, env, store);
            } else if (url.pathname.startsWith('/api/v1/dashboard/products/') && url.pathname.endsWith('/online-settings') && method === 'PUT') {
              const segments = url.pathname.split('/');
              const productId = segments[segments.length - 2];
              response = await handleDashboardUpdateProductOnlineSettings(request, productId, env, store);
            } else if (url.pathname === '/api/v1/dashboard/store/settings' && method === 'PUT') {
              response = await handleDashboardUpdateStoreSettings(request, env, store);
            } else if (url.pathname === '/api/v1/dashboard/store/theme' && method === 'PUT') {
              response = await handleDashboardUpdateStoreTheme(request, env, store);
            } else {
              response = new Response(JSON.stringify({ error: 'Dashboard endpoint not found' }), { status: 404 });
            }
          }
        }
      } else {
        response = new Response(JSON.stringify({ error: 'Route not found' }), { status: 404 });
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
      return new Response(
        JSON.stringify({ error: 'Internal Server Error', message: err?.message || 'Unknown' }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders(request),
          },
        }
      );
    }
  },
};
