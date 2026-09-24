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

    case 'products:search': {
      const q = (payload?.query || '').trim().toLowerCase();
      const mockProducts = [
        {
          id: 'p_1',
          name: 'لبن جهينة كامل الدسم 1 لتر',
          normalizedName: 'لبن جهينه كامل الدسم 1 لتر',
          barcode: '6223001234567',
          barcodes: ['6223001234567'],
          pricePiasters: 4200,
          costPiasters: 3400,
          stockQuantityMilli: 45000,
          minStockQuantityMilli: 10000,
          unit: 'piece',
          taxRatePercent: 0,
          isActive: true,
          priceFormatted: '42.00 ج.م',
          stockFormatted: '45',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'p_2',
          name: 'أرز مصري فاخر 1 كجم',
          normalizedName: 'ارز مصري فاخر 1 كجم',
          barcode: '6221009876543',
          barcodes: ['6221009876543'],
          pricePiasters: 3500,
          costPiasters: 2800,
          stockQuantityMilli: 80000,
          minStockQuantityMilli: 15000,
          unit: 'piece',
          taxRatePercent: 0,
          isActive: true,
          priceFormatted: '35.00 ج.م',
          stockFormatted: '80',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'p_3',
          name: 'شاي العروسة ناعم 250 جم',
          normalizedName: 'شاي العروسه ناعم 250 جم',
          barcode: '6224005544332',
          barcodes: ['6224005544332'],
          pricePiasters: 5500,
          costPiasters: 4600,
          stockQuantityMilli: 12000,
          minStockQuantityMilli: 5000,
          unit: 'piece',
          taxRatePercent: 0,
          isActive: true,
          priceFormatted: '55.00 ج.م',
          stockFormatted: '12',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'p_4',
          name: 'شوكولاتة كادبوري ديري ميلك 90 جم',
          normalizedName: 'شوكولاته كادبوري ديري ميلك 90 جم',
          barcode: '6225001122334',
          barcodes: ['6225001122334'],
          pricePiasters: 2500,
          costPiasters: 1900,
          stockQuantityMilli: 2000,
          minStockQuantityMilli: 5000,
          unit: 'piece',
          taxRatePercent: 0,
          isActive: true,
          priceFormatted: '25.00 ج.م',
          stockFormatted: '2',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'p_5',
          name: 'طماطم بلدي طازجة',
          normalizedName: 'طماطم بلدي طازجه',
          barcode: 'FAST-TOMATO-01',
          barcodes: ['FAST-TOMATO-01'],
          pricePiasters: 1500,
          costPiasters: 1000,
          stockQuantityMilli: 25000,
          minStockQuantityMilli: 5000,
          unit: 'kg',
          taxRatePercent: 0,
          isActive: true,
          priceFormatted: '15.00 ج.م',
          stockFormatted: '25',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      if (!q) return mockProducts;
      return mockProducts.filter((p) => 
        p.barcode?.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.normalizedName?.toLowerCase().includes(q)
      );
    }

    case 'search:runBenchmark':
      return {
        success: true,
        totalProductsTested: payload?.productCount || 5000,
        seedTimeMs: 380,
        averageSearchLatencyMs: 3.2,
        maxSearchLatencyMs: 14.5,
        minSearchLatencyMs: 0.9,
        meetsSlaUnder100ms: true,
        normalizationTestsPassed: true,
        scannerSimulationPassed: true,
        summaryReport: 'تقرير أداء فحص سرعة البحث والباركود على 5000 صنف:\n• متوسط زمن البحث: 3.2 مللي ثانية (الحد الأقصى: 100 مللي ثانية) ✅\n• اختبار توحيد الحروف العربية: ✅ ناجح 100%\n• محاكاة قارئ الباركود: ✅ فوري',
        testLog: [
          'تم تجهيز وفهرسة 5000 صنف خلال 380 مللي ثانية.',
          'نجاح مطابقة الألف: "ارز" وجد "أرز مصري فاخر 1 كجم"',
          'نجاح مطابقة التاء المربوطة: "العروسه" وجد "شاي العروسة ناعم 250 جم"',
          'نجاح إزالة التشكيل: "شَايْ" وجد "شاي العروسة"',
          'محاكاة قارئ الباركود: استجابة القارئ خلال 3.8 مللي ثانية'
        ]
      };

    case 'printer:test':
      return {
        success: true,
        printerName: 'POS-80 Thermal Printer',
        message: 'تم إرسال أمر الطباعة التجريبي بنجاح (Mock)',
      };

    case 'inventory:getMovements':
      return [
        {
          id: 'mov_1',
          productId: payload?.productId || 'p_1',
          productName: 'لبن جهينة كامل الدسم 1 لتر',
          productBarcode: '6223001234567',
          unit: 'piece',
          movementType: 'INITIAL',
          movementTypeArabic: 'رصيد افتتاحي',
          quantityMilli: 25000,
          unitCostPiasters: 2700,
          note: 'رصيد افتتاحي مسجل أثناء ترقية النظام',
          createdAt: new Date().toISOString(),
        },
        {
          id: 'mov_2',
          productId: payload?.productId || 'p_1',
          productName: 'لبن جهينة كامل الدسم 1 لتر',
          productBarcode: '6223001234567',
          unit: 'piece',
          movementType: 'SALE',
          movementTypeArabic: 'مبيعات كاشير',
          quantityMilli: -2000,
          unitCostPiasters: 2700,
          note: 'مبيعات كاشير - فاتورة #1001',
          createdAt: new Date(Date.now() - 3600000).toISOString(),
        },
      ];

    case 'inventory:adjustStock':
      return {
        id: 'mov_mock_adj',
        productId: payload?.productId,
        movementType: 'ADJUSTMENT',
        quantityMilli: 5000,
        unitCostPiasters: 2500,
        note: payload?.reason || 'تسوية جردية',
        createdAt: new Date().toISOString(),
      };

    case 'inventory:getDiscrepancies':
      return [];

    case 'inventory:recalculate':
      return {
        success: true,
        updatedCount: 1,
        message: 'تمت إعادة حساب ومطابقة المخزون بنجاح لـ 1 منتج.',
      };

    case 'inventory:runTests':
      return {
        success: true,
        totalAssertions: 8,
        passedAssertions: 8,
        message: 'نجحت جميع اختبارات المخزون وحركات الصنف (8/8 تأكيد سليم)',
      };

    case 'excel:getTemplate':
      return {
        success: true,
        fileName: 'قالب_استيراد_المنتجات_رفيق_POS.xlsx',
      };

    case 'excel:exportProducts':
      return {
        success: true,
        fileName: 'كتالوج_أصناف_رفيق_تجريبي.xlsx',
        count: 5,
      };

    default:
      return { success: true, echoed: payload };
  }
}
