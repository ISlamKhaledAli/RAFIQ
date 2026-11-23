/**
 * Rafiq Mobile & Desktop Notification Engine
 * - Shared Singleton Web Audio Context with auto-resume on first mobile gesture.
 * - Hardware Vibration API (distinct rhythmic pattern for phones in pockets/counters).
 * - Web Notification API (native system & lock-screen notifications for background tabs).
 * - Screen WakeLock API (prevents mobile/tablet screen from locking on counter).
 * - 100% offline-first, zero external assets, zero audio latency.
 */

let sharedAudioCtx: AudioContext | null = null;
let isAudioUnlocked = false;
let unlockListenersAttached = false;
let activeWakeLock: any = null;

/**
 * Returns or initializes the shared AudioContext singleton.
 */
function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!sharedAudioCtx) {
    const AudioCtxClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtxClass) {
      try {
        sharedAudioCtx = new AudioCtxClass();
      } catch {
        sharedAudioCtx = null;
      }
    }
  }
  return sharedAudioCtx;
}

/**
 * Automatically unlocks Web Audio on the very first touch/click on mobile devices
 * to comply with iOS Safari and Android Chrome autoplay security policies.
 */
export function initMobileAudioUnlocker(): void {
  if (typeof window === 'undefined' || isAudioUnlocked || unlockListenersAttached) return;

  const unlockHandler = () => {
    try {
      const ctx = getAudioContext();
      if (ctx) {
        if (ctx.state === 'suspended') {
          void ctx.resume();
        }
        // Play an ultra-short silent 1-sample buffer to permanently unlock the iOS audio pipeline
        const silentBuffer = ctx.createBuffer(1, 1, 22050);
        const source = ctx.createBufferSource();
        source.buffer = silentBuffer;
        source.connect(ctx.destination);
        source.start(0);
        isAudioUnlocked = true;
      }
    } catch {
      // Ignore unlock attempts on restricted environments
    } finally {
      // Remove listeners once unlocked
      window.removeEventListener('touchstart', unlockHandler, true);
      window.removeEventListener('touchend', unlockHandler, true);
      window.removeEventListener('pointerdown', unlockHandler, true);
      window.removeEventListener('click', unlockHandler, true);
      window.removeEventListener('keydown', unlockHandler, true);
      unlockListenersAttached = false;
    }
  };

  unlockListenersAttached = true;
  window.addEventListener('touchstart', unlockHandler, { capture: true, passive: true });
  window.addEventListener('touchend', unlockHandler, { capture: true, passive: true });
  window.addEventListener('pointerdown', unlockHandler, { capture: true, passive: true });
  window.addEventListener('click', unlockHandler, { capture: true, passive: true });
  window.addEventListener('keydown', unlockHandler, { capture: true, passive: true });
}

// Auto-register unlocker on module evaluation in browser
if (typeof window !== 'undefined') {
  initMobileAudioUnlocker();
}

/**
 * Plays a loud, pleasant, high-visibility retail order chime (Shopify / Talabat / Deliveroo style)
 * optimized for smartphone speakers and busy store environments.
 */
export const playOrderChime = (): void => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const now = ctx.currentTime;

    // Tone 1: Gentle pleasant harmonic introduction (D5 - 587.33 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(587.33, now);
    gain1.gain.setValueAtTime(0.35, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.28);

    // Tone 2: Crisp confirmation chime (A5 - 880 Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.12);
    gain2.gain.setValueAtTime(0.42, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.55);

    // Tone 3: High-pitch clarity accent (D6 - 1174.66 Hz) for small phone speakers
    const osc3 = ctx.createOscillator();
    const gain3 = ctx.createGain();
    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(1174.66, now + 0.25);
    gain3.gain.setValueAtTime(0.45, now + 0.25);
    gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.75);
    osc3.connect(gain3);
    gain3.connect(ctx.destination);
    osc3.start(now + 0.25);
    osc3.stop(now + 0.75);
  } catch {
    // Graceful fallback if audio permissions are blocked
  }
};

/**
 * Plays a subtle confirmation ping for order status transitions.
 */
export const playStatusPing = (): void => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(659.25, now); // E5
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.18); // A5
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.35);
  } catch {}
};

/**
 * Triggers distinct rhythmic vibration patterns on phones and tablets.
 */
export const triggerOrderVibration = (pattern: 'new_order' | 'status_change' = 'new_order'): void => {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
  try {
    if (pattern === 'new_order') {
      // 3 assertive buzzes for incoming orders
      navigator.vibrate([300, 120, 300, 120, 500]);
    } else {
      // Short double buzz for status update
      navigator.vibrate([150, 80, 150]);
    }
  } catch {
    // Ignored on devices where vibration is disabled or unpermitted
  }
};

export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

/**
 * Gets current Web Notification permission status.
 */
export function getNotificationPermission(): NotificationPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission as NotificationPermissionState;
}

/**
 * Requests native system notification permission from the merchant.
 */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  try {
    const perm = await Notification.requestPermission();
    return perm as NotificationPermissionState;
  } catch {
    return 'denied';
  }
}

export interface OrderNotificationPayload {
  orderId: string;
  orderNumber: string | number;
  customerName: string;
  totalPounds: string;
  zone?: string;
  itemsCount?: number;
}

/**
 * Dispatches a native System / Phone Lock Screen Notification for incoming orders.
 */
export function dispatchOrderSystemNotification(payload: OrderNotificationPayload): Notification | null {
  if (typeof window === 'undefined' || !('Notification' in window)) return null;
  if (Notification.permission !== 'granted') return null;

  try {
    const title = `🔔 أوردر جديد (#ORD-${payload.orderNumber})`;
    const body = `${payload.customerName} • ${payload.totalPounds} ج.م${payload.zone ? ` • ${payload.zone}` : ''}`;

    const notification = new Notification(title, {
      body,
      icon: '/rafiq_logo.png',
      badge: '/app.ico',
      tag: `rafiq-order-${payload.orderId}`,
      vibrate: [300, 120, 300, 120, 500],
      requireInteraction: true,
      lang: 'ar',
      dir: 'rtl',
    } as NotificationOptions);

    notification.onclick = () => {
      window.focus();
      notification.close();
    };

    return notification;
  } catch {
    return null;
  }
}

/**
 * Comprehensive phone alert: Audio chime + Vibration + System Notification.
 */
export function alertNewOrder(
  payload?: OrderNotificationPayload,
  soundEnabled = true
): void {
  if (soundEnabled) {
    playOrderChime();
  }
  triggerOrderVibration('new_order');
  if (payload) {
    dispatchOrderSystemNotification(payload);
  }
}

/**
 * Keep mobile screen awake on counter (Tablet / Phone POS mode).
 */
export async function requestScreenWakeLock(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return false;
  try {
    activeWakeLock = await (navigator as any).wakeLock.request('screen');
    return true;
  } catch {
    activeWakeLock = null;
    return false;
  }
}

export function releaseScreenWakeLock(): void {
  if (activeWakeLock) {
    try {
      activeWakeLock.release();
    } catch {}
    activeWakeLock = null;
  }
}
