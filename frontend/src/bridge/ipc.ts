/**
 * Safe IPC Bridge for C# Host & React UI
 * Protocol conforms to Feature #157 (Command Pattern with Request ID, Timeout, & Error Codes)
 */

export interface BridgeRequest<T = any> {
  id: string;
  action: string;
  payload: T;
}

export interface BridgeResponse<T = any> {
  id: string;
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

declare global {
  interface Window {
    chrome?: {
      webview?: {
        postMessage: (message: any) => void;
        addEventListener: (type: string, listener: (event: any) => void) => void;
        removeEventListener: (type: string, listener: (event: any) => void) => void;
      };
    };
  }
}

const pendingRequests = new Map<string, {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  timer: any;
}>();

// Initialize IPC listener if in WebView2 environment
let isListenerAttached = false;
function ensureListenerAttached() {
  if (isListenerAttached) return;
  if (window.chrome?.webview) {
    window.chrome.webview.addEventListener('message', (event: any) => {
      const response: BridgeResponse = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      if (!response || !response.id) return;

      const pending = pendingRequests.get(response.id);
      if (pending) {
        clearTimeout(pending.timer);
        pendingRequests.delete(response.id);
        if (response.success) {
          pending.resolve(response.data);
        } else {
          pending.reject(new Error(response.error?.message || 'Bridge Error'));
        }
      }
    });
    isListenerAttached = true;
  }
}

/**
 * Execute a command on C# Host
 */
export async function invoke<TResult = any, TPayload = any>(
  action: string,
  payload?: TPayload,
  timeoutMs: number = 8000
): Promise<TResult> {
  ensureListenerAttached();

  const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const request: BridgeRequest<TPayload> = {
    id,
    action,
    payload: payload as TPayload,
  };

  // Check if we are running inside native WebView2
  if (window.chrome?.webview) {
    return new Promise<TResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingRequests.delete(id);
        reject(new Error(`انتهت مهلة الانتظار للعملية: ${action}`));
      }, timeoutMs);

      pendingRequests.set(id, { resolve, reject, timer });
      window.chrome!.webview!.postMessage(request);
    });
  }

  // Fallback: Browser Development Mode Mock
  console.info(`[IPC-DEV-MOCK] Action: "${action}"`, payload);
  return mockHandler(action, payload);
}

/**
 * Mock responses for browser development when not running inside C# WebView2
 */
async function mockHandler(action: string, payload: any): Promise<any> {
  await new Promise((r) => setTimeout(r, 150)); // simulate latency

  switch (action) {
    case 'system:getInfo':
      return {
        appName: 'رفيق نقاط البيع',
        version: '1.0.0-Spike',
        osVersion: 'Windows 10/11 (Dev Mock)',
        isWebView2: false,
        dbStatus: 'Connected (WAL)',
      };

    case 'db:testTransaction':
      return {
        success: true,
        itemsSaved: payload?.count || 10,
        walActive: true,
        message: 'تم حفظ 10 أصناف بنجاح في معاملة ذرية واحدة (Mock)',
      };

    case 'printer:test':
      return {
        success: true,
        printerName: 'POS-80 Thermal Printer',
        message: 'تم إرسال أمر الطباعة التجريبي بنجاح (Mock)',
      };

    default:
      return { success: true, echoed: payload };
  }
}
