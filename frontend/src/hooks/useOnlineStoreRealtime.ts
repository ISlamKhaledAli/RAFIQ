import { useEffect } from 'react';
import {
  getOnlineStoreRealtimeSession,
  setOnlineStoreRealtimeConnected,
  triggerOnlineStoreFastPulse,
} from '../bridge/onlineStoreIpc';

const PING_INTERVAL_MS = 45000;
const INITIAL_RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_DELAY_MS = 45000;

/**
 * Maintains a single low-overhead WebSocket connection from WebView2 (Chromium 109 — Win7..Win11 compatible)
 * to the store's Cloudflare Durable Object (StoreRealtimeHub) using the WebSocket Hibernation API.
 *
 * - Idle keepalive ("ping" -> "pong") is handled at the Cloudflare edge without waking the DO (0 billed requests).
 * - When an order is created or updated on the Web/Mobile Dashboard, the hub wakes for ~2ms and pushes an event;
 *   this hook immediately triggers `onlineStore:fastPulse` so C# pulls the order into SQLite and shows desktop alerts
 *   in < 300ms.
 * - While connected, C# backs off its background safety timer to 180s (~95% quota reduction).
 * - If offline or disconnected, C# automatically falls back to 15s polling while this hook reconnects cleanly.
 */
export function useOnlineStoreRealtime(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) {
      void setOnlineStoreRealtimeConnected(false).catch(() => {});
      return;
    }

    let disposed = false;
    let ws: WebSocket | null = null;
    let pingTimer: number | null = null;
    let reconnectTimer: number | null = null;
    let reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
    let tokenRefreshTimer: number | null = null;

    const clearTimers = () => {
      if (pingTimer !== null) {
        window.clearInterval(pingTimer);
        pingTimer = null;
      }
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (tokenRefreshTimer !== null) {
        window.clearTimeout(tokenRefreshTimer);
        tokenRefreshTimer = null;
      }
    };

    const scheduleReconnect = (delayMs?: number) => {
      if (disposed) return;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      const wait = typeof delayMs === 'number' ? delayMs : reconnectDelay;
      reconnectDelay = Math.min(MAX_RECONNECT_DELAY_MS, Math.round(reconnectDelay * 1.8));
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        void connect();
      }, wait);
    };

    const connect = async () => {
      if (disposed) return;
      clearTimers();

      if (ws) {
        try {
          ws.onopen = null;
          ws.onmessage = null;
          ws.onerror = null;
          ws.onclose = null;
          ws.close();
        } catch {
          // Ignore close error
        }
        ws = null;
      }

      try {
        const session = await getOnlineStoreRealtimeSession();
        if (disposed) return;

        if (!session || !session.enabled || !session.wsUrl) {
          void setOnlineStoreRealtimeConnected(false).catch(() => {});
          scheduleReconnect(20000);
          return;
        }

        const socket = new WebSocket(session.wsUrl);
        ws = socket;

        socket.onopen = () => {
          if (disposed) {
            try {
              socket.close();
            } catch {
              // Ignore
            }
            return;
          }
          reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
          void setOnlineStoreRealtimeConnected(true).catch(() => {});
          // Pull any orders that arrived while disconnected
          void triggerOnlineStoreFastPulse().catch(() => {});

          // Zero-cost edge keepalive (Cloudflare WebSocket Auto-Response does not wake the DO)
          pingTimer = window.setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) {
              try {
                socket.send('ping');
              } catch {
                // Ignore
              }
            }
          }, PING_INTERVAL_MS);

          // Proactively renew the 6-hour signed token after 5 hours
          tokenRefreshTimer = window.setTimeout(() => {
            if (!disposed) {
              void connect();
            }
          }, 5 * 60 * 60 * 1000);
        };

        socket.onmessage = (event) => {
          if (disposed) return;
          const raw = typeof event.data === 'string' ? event.data.trim() : '';
          if (!raw || raw === 'pong') return;
          try {
            const msg = JSON.parse(raw) as { type?: string };
            if (msg.type === 'order_created' || msg.type === 'order_status_updated') {
              void triggerOnlineStoreFastPulse().catch(() => {});
            }
          } catch {
            // Ignore malformed non-JSON control frames
          }
        };

        socket.onerror = () => {
          // onclose handles cleanup and reconnect backoff
        };

        socket.onclose = () => {
          if (pingTimer !== null) {
            window.clearInterval(pingTimer);
            pingTimer = null;
          }
          if (tokenRefreshTimer !== null) {
            window.clearTimeout(tokenRefreshTimer);
            tokenRefreshTimer = null;
          }
          void setOnlineStoreRealtimeConnected(false).catch(() => {});
          if (!disposed) {
            scheduleReconnect();
          }
        };
      } catch {
        void setOnlineStoreRealtimeConnected(false).catch(() => {});
        scheduleReconnect();
      }
    };

    const handleOnline = () => {
      if (disposed) return;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
        scheduleReconnect(500);
      }
    };

    window.addEventListener('online', handleOnline);
    void connect();

    return () => {
      disposed = true;
      window.removeEventListener('online', handleOnline);
      clearTimers();
      if (ws) {
        try {
          ws.onopen = null;
          ws.onmessage = null;
          ws.onerror = null;
          ws.onclose = null;
          ws.close();
        } catch {
          // Ignore
        }
        ws = null;
      }
      void setOnlineStoreRealtimeConnected(false).catch(() => {});
    };
  }, [enabled]);
}
