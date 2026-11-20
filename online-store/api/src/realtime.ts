import type { Env, Store } from './types.ts';
import { createSessionToken, verifySessionToken } from './crypto.ts';
import { checkCloudStoreEntitlement } from './auth.ts';

export interface StoreRealtimeEvent {
  type: 'order_created' | 'order_status_updated';
  source: 'storefront' | 'dashboard' | 'pos';
  orderId: string;
  orderNumber?: number;
  status: string;
  at: string;
}

/**
 * Per-store SQLite-backed Durable Object using the Cloudflare WebSocket Hibernation API.
 * - While idle, connected POS & Web Dashboard clients stay connected with ZERO billed duration/requests.
 * - Edge auto-response handles "ping" -> "pong" without waking the Durable Object (0 requests billed).
 * - Order creation or status updates wake the hub for ~2ms and broadcast immediately (< 200ms end-to-end).
 */
export class StoreRealtimeHub {
  private readonly state: DurableObjectState;

  constructor(state: DurableObjectState, _env: Env) {
    this.state = state;
    try {
      if (typeof WebSocketRequestResponsePair !== 'undefined' && typeof state.setWebSocketAutoResponse === 'function') {
        state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
      }
    } catch {
      // Non-fatal in non-workerd unit test environments
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // 1. WebSocket connection upgrade (tagged by client role: 'pos' | 'dashboard')
    if (url.pathname === '/ws') {
      const upgradeHeader = request.headers.get('Upgrade');
      if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
        return new Response('Expected WebSocket upgrade', { status: 426 });
      }

      const roleParam = (url.searchParams.get('role') || 'dashboard').toLowerCase();
      const roleTag = roleParam === 'pos' ? 'pos' : 'dashboard';

      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];

      this.state.acceptWebSocket(server, [roleTag]);

      try {
        server.send(
          JSON.stringify({
            type: 'connected',
            role: roleTag,
            at: new Date().toISOString(),
          })
        );
      } catch {
        // Ignore initial greeting failure
      }

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    // 2. Internal broadcast trigger from the Worker API
    if (url.pathname === '/broadcast' && request.method.toUpperCase() === 'POST') {
      let event: StoreRealtimeEvent;
      try {
        event = (await request.json()) as StoreRealtimeEvent;
      } catch {
        return new Response(JSON.stringify({ error: 'Invalid broadcast payload' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Route to relevant clients to eliminate unnecessary self-echoes:
      // - storefront order_created -> BOTH pos & dashboard
      // - dashboard status update -> BOTH pos & dashboard (other owner tabs)
      // - pos status update -> dashboard only (POS already has the updated state locally)
      const sockets =
        event.source === 'pos'
          ? this.state.getWebSockets('dashboard')
          : this.state.getWebSockets();

      const serialized = JSON.stringify(event);
      let delivered = 0;

      for (const ws of sockets) {
        try {
          ws.send(serialized);
          delivered++;
        } catch {
          try {
            ws.close(1011, 'Send failed');
          } catch {
            // Ignore close failure
          }
        }
      }

      return new Response(JSON.stringify({ ok: true, delivered }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not Found', { status: 404 });
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    if (typeof message === 'string' && message.trim() === 'ping') {
      try {
        ws.send('pong');
      } catch {
        // Ignore
      }
    }
  }

  webSocketClose(ws: WebSocket, code: number, reason: string, _wasClean: boolean): void {
    try {
      ws.close(code || 1000, reason || 'Closed');
    } catch {
      // Ignore already-closed sockets
    }
  }

  webSocketError(ws: WebSocket, _error: unknown): void {
    try {
      ws.close(1011, 'WebSocket error');
    } catch {
      // Ignore
    }
  }
}

/**
 * Safely broadcasts an order event to the store's Durable Object realtime hub.
 * Never throws or fails the calling HTTP API request if realtime is unbound or unavailable.
 */
export async function notifyStoreRealtime(
  env: Env,
  storeId: string,
  event: StoreRealtimeEvent
): Promise<void> {
  if (!env.STORE_REALTIME || !storeId) return;
  try {
    const id = env.STORE_REALTIME.idFromName(storeId);
    const stub = env.STORE_REALTIME.get(id);
    await stub.fetch('https://realtime.internal/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });
  } catch {
    // Non-fatal: clients still have safety fallback sync
  }
}

/**
 * Issues a short-lived signed WebSocket token for Desktop POS WebView2 so the raw Sync API key
 * never leaves the C# backend.
 */
export async function handleIssuePosRealtimeToken(
  request: Request,
  env: Env,
  store: Store
): Promise<Response> {
  const secret = env.APP_SECRET || 'rafiq_default_owner_jwt_secret_key_32bytes!';
  const exp = Math.floor(Date.now() / 1000) + 6 * 3600; // 6 hours
  const token = await createSessionToken(
    { store_id: store.id, role: 'pos', exp },
    secret
  );

  const reqUrl = new URL(request.url);
  const wsProto = reqUrl.protocol === 'http:' ? 'ws:' : 'wss:';
  const wsUrl = `${wsProto}//${reqUrl.host}/api/v1/realtime/ws?token=${encodeURIComponent(token)}`;

  return new Response(
    JSON.stringify({
      ws_url: wsUrl,
      token,
      store_id: store.id,
      expires_at: new Date(exp * 1000).toISOString(),
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}

/**
 * Authenticates and upgrades a WebSocket connection for either Desktop POS (role=pos)
 * or Owner Web Dashboard (role=owner) and routes it to the store's Durable Object hub.
 */
export async function handleRealtimeWebSocketConnect(
  request: Request,
  url: URL,
  env: Env
): Promise<Response> {
  const upgradeHeader = request.headers.get('Upgrade');
  if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
    return new Response(JSON.stringify({ error: 'Expected WebSocket upgrade' }), {
      status: 426,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!env.STORE_REALTIME) {
    return new Response(JSON.stringify({ error: 'Realtime hub is not enabled on this deployment' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const token = (url.searchParams.get('token') || '').trim();
  if (!token) {
    return new Response(JSON.stringify({ error: 'Missing realtime token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const secret = env.APP_SECRET || 'rafiq_default_owner_jwt_secret_key_32bytes!';
  const payload = await verifySessionToken(token, secret);
  if (!payload || !payload.store_id) {
    return new Response(JSON.stringify({ error: 'Invalid or expired realtime token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const store = await env.DB.prepare('SELECT id, slug, is_active FROM stores WHERE id = ?')
    .bind(payload.store_id)
    .first<{ id: string; slug: string; is_active: number }>();

  if (!store || store.is_active !== 1) {
    return new Response(JSON.stringify({ error: 'Store not found or inactive' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const kvGateError = await checkCloudStoreEntitlement(store.slug, env);
  if (kvGateError) {
    return kvGateError;
  }

  const role = payload.role === 'pos' ? 'pos' : 'dashboard';
  const id = env.STORE_REALTIME.idFromName(store.id);
  const stub = env.STORE_REALTIME.get(id);

  // Forward the WebSocket upgrade request cleanly to the Durable Object
  const doUrl = new URL(`https://realtime.internal/ws?role=${role}`);
  return stub.fetch(new Request(doUrl.toString(), request));
}
