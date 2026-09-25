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

function sanitizeBridgeError(rawMessage?: string): string {
  if (!rawMessage) return 'حدث خطأ أثناء تنفيذ العملية، يرجى المحاولة لاحقاً';
  if (rawMessage.includes('غير مسجل في النواة') || rawMessage.includes('ACTION_NOT_FOUND')) {
    return 'الخدمة المطلوبة غير متوفرة أو جاري تحديثها في النظام';
  }
  return rawMessage;
}

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
          const friendlyMessage = sanitizeBridgeError(response.error?.message);
          pending.reject(new Error(friendlyMessage));
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

    case 'printer:list':
      return [
        { name: 'Microsoft Print to PDF', isDefault: true, isOnline: true },
        { name: 'POS-80 Thermal Printer', isDefault: false, isOnline: true },
        { name: 'Xprinter XP-58', isDefault: false, isOnline: false }
      ];

    case 'printer:test':
    case 'printer:testPrint':
      return {
        success: true,
        printerName: payload?.printerName || 'POS-80 Thermal Printer',
        paperWidth: payload?.paperWidth || '80mm',
        message: 'تم إرسال أمر الطباعة التجريبي بنجاح (Mock)',
      };

    case 'printer:printReceipt':
      return {
        success: true,
        printerName: payload?.printerName || 'POS-80 Thermal Printer',
        paperWidth: payload?.paperWidth || '80mm',
        message: 'تم إرسال إيصال الفاتورة للطابعة بنجاح (Mock)',
      };

    case 'counters:getNextExpectedInvoiceNumber':
      return { nextInvoiceNumber: 1043 };

    case 'sales:getByInvoiceNumber': {
      const invNum = typeof payload === 'object' && payload !== null ? Number(payload.invoiceNumber) : Number(payload);
      return {
        id: `sale_mock_${invNum}`,
        invoiceNumber: invNum,
        subtotalPiasters: 8000,
        discountPiasters: 0,
        taxPiasters: 0,
        totalPiasters: 8000,
        paidPiasters: 8000,
        paymentMethod: 'cash',
        status: 'completed',
        createdAt: new Date().toISOString(),
        items: [
          {
            id: `item_${invNum}_1`,
            saleId: `sale_mock_${invNum}`,
            productId: 'p_1',
            productName: 'لبن جهينة كامل الدسم 1 لتر',
            quantityMilli: 2000,
            unitPricePiasters: 4000,
            discountPiasters: 0,
            taxPiasters: 0,
            totalPiasters: 8000,
            unit: 'piece'
          }
        ],
        payments: [
          { method: 'cash', amountPiasters: 8000 }
        ]
      };
    }

    case 'sales:cancel': {
      const saleId = typeof payload === 'object' && payload !== null ? (payload.saleId || payload.id) : String(payload);
      return {
        id: saleId || 'sale_cancelled',
        invoiceNumber: 1042,
        subtotalPiasters: 8000,
        discountPiasters: 0,
        taxPiasters: 0,
        totalPiasters: 8000,
        paidPiasters: 8000,
        paymentMethod: 'cash',
        status: 'cancelled',
        notes: payload?.reason || 'إلغاء الفاتورة من شاشة السجل',
        createdAt: new Date().toISOString(),
        items: [],
        payments: []
      };
    }

    case 'products:getPriceHistory': {
      const prodId = typeof payload === 'object' && payload !== null ? payload.productId : String(payload);
      return [
        {
          id: 'ph_1',
          productId: prodId || 'p_1',
          oldPricePiasters: 4000,
          newPricePiasters: 4200,
          oldCostPiasters: 3200,
          newCostPiasters: 3400,
          changeReason: 'تعديل أسعار التوريد من الشركة',
          createdAt: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
          oldPriceFormatted: '40.00 ج.م',
          newPriceFormatted: '42.00 ج.م'
        },
        {
          id: 'ph_2',
          productId: prodId || 'p_1',
          oldPricePiasters: 0,
          newPricePiasters: 4000,
          oldCostPiasters: 0,
          newCostPiasters: 3200,
          changeReason: 'تسجيل السعر الأولي للصنف',
          createdAt: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
          oldPriceFormatted: '0.00 ج.م',
          newPriceFormatted: '40.00 ج.م'
        }
      ];
    }

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

    case 'quickItems:getAll':
      return [
        {
          id: 'qi_1',
          productId: 'p_1',
          name: 'لبن جهينة 1 لتر',
          pricePiasters: 4200,
          isOpenPrice: false,
          unit: 'piece',
          categoryName: 'عام',
          displayOrder: 1,
        },
        {
          id: 'qi_2',
          productId: 'p_2',
          name: 'أرز مصري 1 كجم',
          pricePiasters: 3500,
          isOpenPrice: false,
          unit: 'piece',
          categoryName: 'عام',
          displayOrder: 2,
        },
        {
          id: 'qi_3',
          productId: 'p_5',
          name: 'طماطم بلدي',
          pricePiasters: 1500,
          isOpenPrice: false,
          unit: 'kg',
          categoryName: 'خضار وفاكهة',
          displayOrder: 3,
        },
        {
          id: 'qi_4',
          productId: null,
          name: 'كيس تسوق كبير',
          pricePiasters: 150,
          isOpenPrice: false,
          unit: 'piece',
          categoryName: 'أخرى',
          displayOrder: 4,
        }
      ];

    case 'quickItems:save':
      return {
        id: payload?.id || `qi_${Date.now()}`,
        name: payload?.name || '',
        pricePiasters: payload?.pricePiasters || 0,
        isOpenPrice: payload?.isOpenPrice || false,
        unit: payload?.unit || 'piece',
        categoryName: payload?.categoryName || 'عام',
        displayOrder: payload?.displayOrder || 1,
        productId: payload?.productId || null,
      };

    case 'quickItems:delete':
      return { success: true, id: payload?.id };

    case 'quickItems:reorder':
      return { success: true };

    case 'security:getStatus': {
      const isLocked = Date.now() < mockLockoutUntil;
      const remainingSec = isLocked ? Math.max(0, Math.ceil((mockLockoutUntil - Date.now()) / 1000)) : 0;
      return {
        isPinSet: Boolean(mockPinHash),
        isEnabled: Boolean(mockPinHash) && mockPinEnabled,
        isLocked,
        remainingLockoutSeconds: remainingSec,
        failedAttempts: mockFailedAttempts,
        protectedActions: { ...mockProtectedActions },
      };
    }

    case 'security:verifyPin': {
      const isLocked = Date.now() < mockLockoutUntil;
      const remainingSec = isLocked ? Math.max(0, Math.ceil((mockLockoutUntil - Date.now()) / 1000)) : 0;
      if (isLocked) {
        return {
          success: false,
          isLocked: true,
          remainingLockoutSeconds: remainingSec,
          failedAttempts: mockFailedAttempts,
          message: `النظام مقفل مؤقتاً لحماية البيانات. يرجى الانتظار ${remainingSec} ثانية.`,
        };
      }
      if (!mockPinHash) {
        return {
          success: true,
          isLocked: false,
          remainingLockoutSeconds: 0,
          failedAttempts: 0,
          message: 'الرقم السري غير مفعل.',
        };
      }
      if (payload?.pin === mockPinHash) {
        mockFailedAttempts = 0;
        mockLockoutUntil = 0;
        return {
          success: true,
          isLocked: false,
          remainingLockoutSeconds: 0,
          failedAttempts: 0,
          message: 'تم التحقق بنجاح.',
        };
      }
      mockFailedAttempts++;
      let lockout = 0;
      if (mockFailedAttempts >= 10) lockout = 300;
      else if (mockFailedAttempts >= 5) lockout = 30;
      if (lockout > 0) {
        mockLockoutUntil = Date.now() + lockout * 1000;
      }
      return {
        success: false,
        isLocked: lockout > 0,
        remainingLockoutSeconds: lockout,
        failedAttempts: mockFailedAttempts,
        message: lockout > 0
          ? `تم إدخال الرقم السري بشكل خاطئ عدة مرات. تم قفل المحاولات لمدة ${lockout} ثانية.`
          : `الرقم السري غير صحيح. المحاولات المتبقية قبل القفل: ${Math.max(0, 5 - mockFailedAttempts)}`,
      };
    }

    case 'security:setPin': {
      const newPin = String(payload?.newPin || '');
      if (newPin.length < 4 || newPin.length > 8 || !/^\d+$/.test(newPin)) {
        throw new Error('يجب أن يتكون الرقم السري من 4 إلى 8 أرقام فقط.');
      }
      if (mockPinHash) {
        const curr = String(payload?.currentPin || '');
        const rec = String(payload?.recoveryCode || '').trim().toUpperCase().replace(/[\s-]/g, '');
        const matchRec = mockRecoveryCode && mockRecoveryCode.replace(/[\s-]/g, '') === rec;
        if (curr !== mockPinHash && !matchRec) {
          throw new Error('الرقم السري الحالي أو رمز الاسترجاع غير صحيح.');
        }
      }
      mockPinHash = newPin;
      mockPinEnabled = true;
      mockFailedAttempts = 0;
      mockLockoutUntil = 0;
      const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
      mockRecoveryCode = `RFK-${randomPart}`;
      return {
        success: true,
        message: 'تم حفظ الرقم السري بنجاح.',
        recoveryCode: mockRecoveryCode,
      };
    }

    case 'security:resetWithRecovery': {
      const rec = String(payload?.recoveryCode || '').trim().toUpperCase().replace(/[\s-]/g, '');
      const matchRec = mockRecoveryCode && mockRecoveryCode.replace(/[\s-]/g, '') === rec;
      if (!matchRec) {
        mockFailedAttempts += 2;
        if (mockFailedAttempts >= 5) {
          mockLockoutUntil = Date.now() + 60000;
        }
        throw new Error('رمز استرجاع الطوارئ غير صحيح.');
      }
      const newPin = String(payload?.newPin || '');
      if (newPin.length < 4 || newPin.length > 8 || !/^\d+$/.test(newPin)) {
        throw new Error('يجب أن يتكون الرقم السري الجديد من 4 إلى 8 أرقام فقط.');
      }
      mockPinHash = newPin;
      mockPinEnabled = true;
      mockFailedAttempts = 0;
      mockLockoutUntil = 0;
      const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
      mockRecoveryCode = `RFK-${randomPart}`;
      return {
        success: true,
        message: 'تم استرجاع وتعيين الرقم السري بنجاح.',
        recoveryCode: mockRecoveryCode,
      };
    }

    case 'security:disablePin': {
      if (mockPinHash && payload?.currentPin !== mockPinHash) {
        throw new Error('الرقم السري غير صحيح.');
      }
      mockPinEnabled = false;
      return { success: true };
    }

    case 'security:enablePin': {
      if (mockPinHash && payload?.currentPin !== mockPinHash) {
        throw new Error('الرقم السري غير صحيح.');
      }
      mockPinEnabled = true;
      return { success: true };
    }

    case 'security:saveProtectedActions': {
      if (mockPinHash && payload?.currentPin !== mockPinHash) {
        throw new Error('الرقم السري غير صحيح لحفظ إعدادات الحماية.');
      }
      if (payload?.actions) {
        mockProtectedActions = { ...mockProtectedActions, ...payload.actions };
      }
      return { success: true };
    }

    case 'templates:getAll':
      return [
        {
          id: 'supermarket',
          name: 'سوبرماركت ومواد غذائية',
          description: 'مناسب لمحلات السوبرماركت ومحلات البقالة الكبيرة التي تستخدم الباركود والميزان والآجل',
          icon: 'shopping-cart',
          productsCount: 30,
          featureFlags: { feature_scale_weight: true, feature_credit_debts: true, feature_fast_buttons: true, feature_taxes: false, feature_expiry_dates: true, feature_multi_units: true },
          categories: ['معلبات وبقوليات', 'ألبان وأجبان', 'منظفات وعناية منزلية', 'بسكويت وحلويات', 'مشروبات وعصائر', 'مخبوزات', 'خضار وفاكهة'],
          quickItems: [
            { Name: 'خبز بلدي طازج', PricePiasters: 100, Unit: 'piece', CategoryName: 'مخبوزات', IsOpenPrice: false },
            { Name: 'عيش فينو كيس 5 رغيف', PricePiasters: 1000, Unit: 'piece', CategoryName: 'مخبوزات', IsOpenPrice: false },
            { Name: 'سكر حر ناعم 1 كجم', PricePiasters: 3500, Unit: 'piece', CategoryName: 'معلبات وبقوليات', IsOpenPrice: false },
            { Name: 'شاي العروسة 40 جم', PricePiasters: 1200, Unit: 'piece', CategoryName: 'معلبات وبقوليات', IsOpenPrice: false },
            { Name: 'مياه معدنية 1.5 لتر', PricePiasters: 800, Unit: 'piece', CategoryName: 'مشروبات وعصائر', IsOpenPrice: false },
            { Name: 'لبن جهينة 1 لتر', PricePiasters: 4200, Unit: 'piece', CategoryName: 'ألبان وأجبان', IsOpenPrice: false },
            { Name: 'طماطم بلدي طازجة', PricePiasters: 1500, Unit: 'kg', CategoryName: 'خضار وفاكهة', IsOpenPrice: false },
            { Name: 'كيس تسوق كبير', PricePiasters: 150, Unit: 'piece', CategoryName: 'عام', IsOpenPrice: false },
          ],
          defaultSettings: { receipt_header: 'أهلاً بكم في سوبرماركت رفيق', receipt_footer: 'شكراً لزيارتكم! البضاعة المباعة ترد وتستبدل خلال 14 يوماً بموجب الفاتورة.' }
        },
        {
          id: 'phones_electronics',
          name: 'محلات هواتف وموبايل وإلكترونيات',
          description: 'مخصص لمحلات الهواتف الذكية والإلكترونيات وصيانة الجوال والإكسسوارات (بدون ميزان وأوزان)',
          icon: 'smartphone',
          productsCount: 30,
          featureFlags: { feature_scale_weight: false, feature_credit_debts: true, feature_fast_buttons: true, feature_taxes: false, feature_expiry_dates: false, feature_multi_units: false },
          categories: ['كابلات وشواحن', 'سماعات وصوتيات', 'جرابات وحافظات', 'لاصقات حماية وشاشات', 'باور بانك وبطاريات', 'كروت ميموري وفلاشات', 'صيانة وخدمات سريعة'],
          quickItems: [
            { Name: 'كابل شحن سريع Type-C', PricePiasters: 4500, Unit: 'piece', CategoryName: 'كابلات وشواحن', IsOpenPrice: false },
            { Name: 'كابل شحن آيفون Lightning', PricePiasters: 5000, Unit: 'piece', CategoryName: 'كابلات وشواحن', IsOpenPrice: false },
            { Name: 'رأس شاحن سريع 20W', PricePiasters: 12000, Unit: 'piece', CategoryName: 'كابلات وشواحن', IsOpenPrice: false },
            { Name: 'لاصقة حماية شاشة 9D', PricePiasters: 3000, Unit: 'piece', CategoryName: 'لاصقات حماية وشاشات', IsOpenPrice: false },
            { Name: 'جراب سيليكون شفاف حماية', PricePiasters: 3500, Unit: 'piece', CategoryName: 'جرابات وحافظات', IsOpenPrice: false },
            { Name: 'سماعة أذن سلكية AUX', PricePiasters: 4000, Unit: 'piece', CategoryName: 'سماعات وصوتيات', IsOpenPrice: false },
            { Name: 'كارت ميموري 32 جيجا', PricePiasters: 9500, Unit: 'piece', CategoryName: 'كروت ميموري وفلاشات', IsOpenPrice: false },
            { Name: 'صيانة وتركيب سريع', PricePiasters: 3000, Unit: 'piece', CategoryName: 'صيانة وخدمات سريعة', IsOpenPrice: true }
          ],
          defaultSettings: { receipt_header: 'متجر رفيق للهواتف والإلكترونيات', receipt_footer: 'شكراً لتعاملكم معنا! نحرص دائماً على تقديم أفضل المنتجات والضمان المعتمد.' }
        },
        {
          id: 'dairy_bakery',
          name: 'ألبان ومخبوزات ومعلبات',
          description: 'مناسب لمحلات اللبانة والأجبان والمخابز التي تعتمد على البيع بالوزن والأصناف الطازجة',
          icon: 'milk',
          productsCount: 30,
          featureFlags: { feature_scale_weight: true, feature_credit_debts: true, feature_fast_buttons: true, feature_taxes: false, feature_expiry_dates: true, feature_multi_units: false },
          categories: ['ألبان سائبة ومعبأة', 'أجبان بيضاء ومطبوخة', 'مخبوزات طازجة', 'بيض ومستلزمات', 'معلبات وعسل'],
          quickItems: [
            { Name: 'لبن جاموسي طازج كجم', PricePiasters: 3000, Unit: 'kg', CategoryName: 'ألبان سائبة ومعبأة', IsOpenPrice: false },
            { Name: 'لبن بقري طازج كجم', PricePiasters: 2600, Unit: 'kg', CategoryName: 'ألبان سائبة ومعبأة', IsOpenPrice: false },
            { Name: 'جبنة قريش كجم', PricePiasters: 7000, Unit: 'kg', CategoryName: 'أجبان بيضاء ومطبوخة', IsOpenPrice: false },
            { Name: 'جبنة براميلي فلفل كجم', PricePiasters: 14000, Unit: 'kg', CategoryName: 'أجبان بيضاء ومطبوخة', IsOpenPrice: false },
            { Name: 'رغيف فينو', PricePiasters: 150, Unit: 'piece', CategoryName: 'مخبوزات طازجة', IsOpenPrice: false },
            { Name: 'طبق بيض أحمر 30 بيضة', PricePiasters: 16500, Unit: 'piece', CategoryName: 'بيض ومستلزمات', IsOpenPrice: false },
            { Name: 'زبادي بلدي كبير', PricePiasters: 800, Unit: 'piece', CategoryName: 'ألبان سائبة ومعبأة', IsOpenPrice: false },
          ],
          defaultSettings: { receipt_header: 'ألبان ومخبوزات رفيق', receipt_footer: 'منتجات طازجة يومياً.. شكراً لثقتكم الغالية' }
        },
        {
          id: 'produce_butchery',
          name: 'خضار وفاكهة ومجزر',
          description: 'مناسب لمحلات الخضار والفاكهة والجزارة والمجمدات التي تعتمد أساسياً على الميزان الإلكتروني',
          icon: 'apple',
          productsCount: 30,
          featureFlags: { feature_scale_weight: true, feature_credit_debts: true, feature_fast_buttons: true, feature_taxes: false, feature_expiry_dates: false, feature_multi_units: false },
          categories: ['خضروات طازجة', 'فواكه موسمية', 'ورقيات وأعشاب', 'لحوم ودواجن', 'مجمدات'],
          quickItems: [
            { Name: 'طماطم بلدي طازجة', PricePiasters: 1500, Unit: 'kg', CategoryName: 'خضروات طازجة', IsOpenPrice: false },
            { Name: 'بطاطس تحمير كجم', PricePiasters: 1800, Unit: 'kg', CategoryName: 'خضروات طازجة', IsOpenPrice: false },
            { Name: 'بصل أحمر بلدي كجم', PricePiasters: 1400, Unit: 'kg', CategoryName: 'خضروات طازجة', IsOpenPrice: false },
            { Name: 'خيار صوب بلدي كجم', PricePiasters: 1600, Unit: 'kg', CategoryName: 'خضروات طازجة', IsOpenPrice: false },
            { Name: 'ليمون بلدي كجم', PricePiasters: 2500, Unit: 'kg', CategoryName: 'خضروات طازجة', IsOpenPrice: false },
            { Name: 'موز بلدي طازج كجم', PricePiasters: 2000, Unit: 'kg', CategoryName: 'فواكه موسمية', IsOpenPrice: false },
            { Name: 'تفاح أحمر سكري كجم', PricePiasters: 4500, Unit: 'kg', CategoryName: 'فواكه موسمية', IsOpenPrice: false }
          ],
          defaultSettings: { receipt_header: 'أسواق رفيق للخضار والفاكهة الطازجة', receipt_footer: 'بضاعة طازجة بأعلى جودة.. شكراً لزيارتكم!' }
        },
        {
          id: 'stationery_gifts',
          name: 'مكتبات وأدوات مدرسية وهدايا',
          description: 'مناسب للمكتبات والقرطاسية، الهدايا، الألعاب ومستلزمات الطباعة (بدون ميزان)',
          icon: 'book',
          productsCount: 30,
          featureFlags: { feature_scale_weight: false, feature_credit_debts: true, feature_fast_buttons: true, feature_taxes: false, feature_expiry_dates: false, feature_multi_units: false },
          categories: ['أدوات كتابة وأقلام', 'كشاكيل ودفاتر', 'أدوات هندسية ومدرسية', 'ألعاب وهدايا', 'طباعة وتصوير مستندات'],
          quickItems: [
            { Name: 'قلم جاف أزرق', PricePiasters: 500, Unit: 'piece', CategoryName: 'أدوات كتابة وأقلام', IsOpenPrice: false },
            { Name: 'كشكول سلك 60 ورقة', PricePiasters: 2000, Unit: 'piece', CategoryName: 'كشاكيل ودفاتر', IsOpenPrice: false },
            { Name: 'باكت ورق تصوير A4', PricePiasters: 18000, Unit: 'piece', CategoryName: 'طباعة وتصوير مستندات', IsOpenPrice: false },
            { Name: 'تصوير مستند وجهين', PricePiasters: 150, Unit: 'piece', CategoryName: 'طباعة وتصوير مستندات', IsOpenPrice: false },
            { Name: 'تغليف هدية فاخر', PricePiasters: 2500, Unit: 'piece', CategoryName: 'ألعاب وهدايا', IsOpenPrice: true },
            { Name: 'كيس هدايا كرتون', PricePiasters: 1000, Unit: 'piece', CategoryName: 'ألعاب وهدايا', IsOpenPrice: false },
            { Name: 'بطارية قلم AA', PricePiasters: 1500, Unit: 'piece', CategoryName: 'أدوات هندسية ومدرسية', IsOpenPrice: false }
          ],
          defaultSettings: { receipt_header: 'مكتبة رفيق للقرطاسية والهدايا', receipt_footer: 'نتمنى لطلابنا الأعزاء دوام التوفيق والنجاح!' }
        },
        {
          id: 'spices_roastery',
          name: 'عطارة ومحامص وبن وتوابل',
          description: 'مناسب لمحلات العطارة والبن والمحامص والمكسرات بالأوزان والجرامات والميزان',
          icon: 'flame',
          productsCount: 30,
          featureFlags: { feature_scale_weight: true, feature_credit_debts: true, feature_fast_buttons: true, feature_taxes: false, feature_expiry_dates: true, feature_multi_units: false },
          categories: ['بن ومشروبات ساخنة', 'مكسرات ومحامص', 'توابل وبهارات', 'أعشاب طبيعية', 'ياميش وتمور'],
          quickItems: [
            { Name: 'ثمن بن محوج وسط', PricePiasters: 4500, Unit: 'piece', CategoryName: 'بن ومشروبات ساخنة', IsOpenPrice: false },
            { Name: 'ربع بن سادة فاتح', PricePiasters: 7000, Unit: 'piece', CategoryName: 'بن ومشروبات ساخنة', IsOpenPrice: false },
            { Name: 'كمون بلدي مطحون 100 جم', PricePiasters: 2500, Unit: 'piece', CategoryName: 'توابل وبهارات', IsOpenPrice: false },
            { Name: 'فلفل أسود حب 100 جم', PricePiasters: 3500, Unit: 'piece', CategoryName: 'توابل وبهارات', IsOpenPrice: false },
            { Name: 'فول سوداني مقشر 250 جم', PricePiasters: 2500, Unit: 'piece', CategoryName: 'مكسرات ومحامص', IsOpenPrice: false },
            { Name: 'لب سوبر ممتاز 250 جم', PricePiasters: 3500, Unit: 'piece', CategoryName: 'مكسرات ومحامص', IsOpenPrice: false }
          ],
          defaultSettings: { receipt_header: 'عطارة ومحامص رفيق الفاخرة', receipt_footer: 'أجود أنواع البن والتوابل الطازجة.. بالهناء والشفاء' }
        },
        {
          id: 'clothing_apparel',
          name: 'ملابس وأحذية وأزياء',
          description: 'مناسب لمحلات الملابس والأحذية والأزياء والحقائب (بدون ميزان وأوزان)',
          icon: 'shirt',
          productsCount: 30,
          featureFlags: { feature_scale_weight: false, feature_credit_debts: true, feature_fast_buttons: true, feature_taxes: false, feature_expiry_dates: false, feature_multi_units: false },
          categories: ['رجالي', 'حريمي', 'أطفال', 'أحذية ومصنوعات جلدية', 'إكسسوارات وطرح'],
          quickItems: [
            { Name: 'تيشيرت قطن سادة', PricePiasters: 15000, Unit: 'piece', CategoryName: 'رجالي', IsOpenPrice: false },
            { Name: 'قميص كاجوال', PricePiasters: 25000, Unit: 'piece', CategoryName: 'رجالي', IsOpenPrice: false },
            { Name: 'بنطلون جينز', PricePiasters: 30000, Unit: 'piece', CategoryName: 'رجالي', IsOpenPrice: false },
            { Name: 'طرحة شيفون فاخرة', PricePiasters: 6500, Unit: 'piece', CategoryName: 'إكسسوارات وطرح', IsOpenPrice: false },
            { Name: 'شراب قطن 3 قطع', PricePiasters: 4500, Unit: 'piece', CategoryName: 'رجالي', IsOpenPrice: false },
            { Name: 'كيس ملابس فاخر للمحل', PricePiasters: 500, Unit: 'piece', CategoryName: 'إكسسوارات وطرح', IsOpenPrice: false }
          ],
          defaultSettings: { receipt_header: 'متاجر رفيق للملابس والأزياء', receipt_footer: 'شكراً لاختياركم متجرنا! الاستبدال خلال 14 يوماً مع وجود كارت الصنف والباركود.' }
        },
        {
          id: 'general_grocery',
          name: 'بقالة ومحل تجاري عام',
          description: 'إعداد عام متوازن يناسب كافة المحلات والأنشطة التجارية المتنوعة',
          icon: 'store',
          productsCount: 30,
          featureFlags: { feature_scale_weight: true, feature_credit_debts: true, feature_fast_buttons: true, feature_taxes: false, feature_expiry_dates: false, feature_multi_units: false },
          categories: ['عام', 'أغذية ومشروبات', 'منظفات', 'حلويات وتسالي', 'دخان وسجائر'],
          quickItems: [
            { Name: 'كيس تسوق', PricePiasters: 100, Unit: 'piece', CategoryName: 'عام', IsOpenPrice: false },
            { Name: 'ولاعة عادية', PricePiasters: 500, Unit: 'piece', CategoryName: 'دخان وسجائر', IsOpenPrice: false },
            { Name: 'علبة كبريت', PricePiasters: 100, Unit: 'piece', CategoryName: 'عام', IsOpenPrice: false },
            { Name: 'مياه صغيرة 500 مل', PricePiasters: 500, Unit: 'piece', CategoryName: 'أغذية ومشروبات', IsOpenPrice: false },
            { Name: 'شيبسي عائلي', PricePiasters: 1500, Unit: 'piece', CategoryName: 'حلويات وتسالي', IsOpenPrice: false },
          ],
          defaultSettings: { receipt_header: 'أهلاً بكم في متجرنا', receipt_footer: 'شكراً لتعاملكم معنا' }
        }
      ];

    case 'templates:isFirstRunNeeded':
      return { isNeeded: mockFirstRunNeeded };

    case 'templates:apply': {
      mockFirstRunNeeded = false;
      if (typeof window !== 'undefined') {
        localStorage.setItem('rafiq_first_run_completed', 'true');
      }
      const count = payload?.seedInitialProducts !== false ? 30 : 0;
      return {
        success: true,
        message: 'تم تطبيق القالب وتخصيص المتجر بنجاح.',
        categoriesCount: 6,
        quickItemsCount: 8,
        productsCount: count,
      };
    }

    case 'demo:getStatus':
      return {
        hasDemoData: mockDemoDataLoaded,
        demoProductsCount: mockDemoProductsCount,
        demoSalesCount: mockDemoSalesCount,
        demoCustomersCount: mockDemoCustomersCount,
      };

    case 'demo:load':
      mockDemoDataLoaded = true;
      mockDemoProductsCount = 8;
      mockDemoCustomersCount = 2;
      mockDemoSalesCount = 1;
      return {
        success: true,
        message: 'تم تحميل 8 أصناف تجريبية وعميلين للتدريب بنجاح.',
        productsAdded: 8,
        customersAdded: 2,
        salesAdded: 1,
      };

    case 'demo:clear': {
      const prevProds = mockDemoProductsCount;
      const prevSales = mockDemoSalesCount;
      const prevCusts = mockDemoCustomersCount;
      mockDemoDataLoaded = false;
      mockDemoProductsCount = 0;
      mockDemoSalesCount = 0;
      mockDemoCustomersCount = 0;
      return {
        success: true,
        message: 'تم مسح كافة البيانات التجريبية بأمان دون المساس ببيانات المحل الحقيقية.',
        deletedProducts: prevProds,
        deletedSales: prevSales,
        deletedCustomers: prevCusts,
      };
    }

    case 'readiness:getStatus':
      return {
        isReadyToSell: true,
        totalChecks: 5,
        passedChecks: 4,
        readinessPercentage: 80,
        overallStatusMessage: 'جاهز للبيع! يمكنك بدء العمل مع استكمال باقي التوصيات.',
        checks: [
          {
            key: 'store_profile',
            title: 'بيانات المحل والفاتورة',
            passed: true,
            statusText: 'مضبوطة (سوبرماركت رفيق)',
            description: 'اسم المحل وبيانات التواصل تظهر بشكل سليم في رأس وتذييل الإيصال المطبوع.',
            actionLabel: 'تعديل البيانات',
            actionTarget: 'settings:profile',
          },
          {
            key: 'printer',
            title: 'طابعة الإيصالات الحرارية (Feature #53)',
            passed: true,
            statusText: 'جاهزة (Xprinter XP-80C)',
            description: 'تم اكتشاف الطابعة وجاهزة لطباعة إيصالات الكاشير وفتح درج النقدية.',
            actionLabel: 'اختبار الطباعة',
            actionTarget: 'printer:testPrint',
          },
          {
            key: 'scanner',
            title: 'قارئ الباركود (Barcode Scanner)',
            passed: true,
            statusText: 'مفعل وجاهز للمسح',
            description: 'مستمع الباركود السريع نشط وينقل الأصناف مباشرة إلى سلة المبيعات بدون لمس الماوس.',
            actionLabel: 'فحص قارئ الباركود',
            actionTarget: 'scanner:test',
          },
          {
            key: 'backup',
            title: 'النسخ الاحتياطي وأمان البيانات (Feature #9)',
            passed: false,
            statusText: 'لم يتم أخذ نسخة بعد',
            description: 'ينصح بأخذ أول نسخة احتياطية على فلاشة USB خارجية لضمان أمان المحل.',
            actionLabel: 'أخذ نسخة احتياطية',
            actionTarget: 'backup:run',
          },
          {
            key: 'products',
            title: 'كتالوج الأصناف والأسعار',
            passed: true,
            statusText: '8 أصناف مسجلة',
            description: 'يحتوي النظام على أصناف جاهزة للبيع بأسعارها المحددة.',
            actionLabel: 'عرض الأصناف',
            actionTarget: 'products:catalog',
          },
        ],
      };

    case 'readiness:processTestSale':
      return {
        id: `test_sale_${Date.now()}`,
        invoiceNumber: 0,
        cashierId: 'cashier_test',
        subtotalPiasters: 2500,
        discountPiasters: 0,
        taxPiasters: 0,
        totalPiasters: 2500,
        paidPiasters: 2500,
        paymentMethod: 'CASH',
        status: 'TEST_PILOT',
        notes: 'فاتورة بيع تجريبية - فحص جاهزية التشغيل (لا تدخل المخزون ولا الحسابات)',
        createdAt: new Date().toISOString(),
        items: [
          {
            id: 'test_item_1',
            saleId: `test_sale_${Date.now()}`,
            productId: 'test_sample_prod',
            productName: 'صنف تجريبي لاختبار الطابعة والفاتورة',
            barcode: '62299990001',
            quantityMilli: 1000,
            unitPricePiasters: 2500,
            unitCostPiasters: 1800,
            discountPiasters: 0,
            totalPiasters: 2500,
            taxPiasters: 0,
            taxRatePercent: 0,
            unit: 'piece',
          },
        ],
        payments: [
          {
            id: 'test_pay_1',
            saleId: `test_sale_${Date.now()}`,
            amountPiasters: 2500,
            method: 'CASH',
            createdAt: new Date().toISOString(),
          },
        ],
        negativeStockWarnings: [],
      };

    case 'health:getStatus':
      return {
        overallStatus: 'HEALTHY',
        oneSentenceSummary: 'كل شيء تمام! النظام سليم، قاعدة البيانات محمية بوضع WAL، والنظام جاهز للبيع.',
        healthScore: 100,
        primaryIssueFixAction: null,
        primaryIssueFixTarget: null,
        alerts: [
          {
            id: 'info_wal',
            level: 'info',
            title: 'قاعدة البيانات في وضع الاستقرار الفائق',
            message: 'نظام رفيق يعمل بنمط SQLite WAL المقاوم لانقطاع الكهرباء الفجائي.',
            fixAction: 'فحص الحماية',
            fixTarget: 'settings:system',
          },
        ],
        metrics: {
          diskFreeFormatted: '48.5 جيجابايت',
          diskFreeBytes: 52000000000,
          lastBackupFormatted: 'اليوم 10:30 صباحاً',
          isBackupOverdue: false,
          printerName: 'طابعة الإيصالات الحرارية XP-80C',
          isPrinterReady: true,
          licenseStatus: 'ترخيص محلي دائم (نشط مدى الحياة)',
          appVersion: 'رفيق POS v1.0.0 (أوفلاين)',
          databaseStatus: 'سليمة (وضع WAL الفائق)',
          productsCount: 8,
        },
      };

    case 'reports:getTodaySummary': {
      const debtors = mockCustomers.filter(c => (c.balancePiasters || 0) > 0);
      const totalDebts = debtors.reduce((sum, c) => sum + (c.balancePiasters || 0), 0);
      const topDebtors = [...debtors]
        .sort((a, b) => (b.balancePiasters || 0) - (a.balancePiasters || 0))
        .slice(0, 5)
        .map(c => ({
          customerId: c.id,
          customerName: c.name,
          customerPhone: c.phone || '',
          balancePiasters: c.balancePiasters || 0,
          balanceFormatted: `${((c.balancePiasters || 0) / 100).toFixed(2)} ج.م`,
        }));

      return {
        todaySalesPiasters: 125000,
        todaySalesFormatted: '1,250.00 ج.م',
        todayCashPiasters: 95000,
        todayCashFormatted: '950.00 ج.م',
        todayCreditPiasters: 30000,
        todayCreditFormatted: '300.00 ج.م',
        todayProfitsPiasters: 28500,
        todayProfitsFormatted: '285.00 ج.م',
        todayInvoicesCount: 24,
        cashDrawerPiasters: 95000,
        cashDrawerFormatted: '950.00 ج.م',
        totalCustomerDebtsPiasters: totalDebts,
        totalCustomerDebtsFormatted: `${(totalDebts / 100).toFixed(2)} ج.م`,
        debtorsCount: debtors.length,
        topDebtors,
        topSellingProducts: [
          { productId: 'p_1', productName: 'لبن جهينة كامل الدسم 1 لتر', totalQuantity: 18, totalSalesPiasters: 75600, totalSalesFormatted: '756.00 ج.م' },
          { productId: 'p_2', productName: 'أرز مصري فاخر 1 كجم', totalQuantity: 12, totalSalesPiasters: 42000, totalSalesFormatted: '420.00 ج.م' },
        ],
        lowStockProducts: [
          { productId: 'p_3', productName: 'سكر أبيض نقي 1 كجم', currentStock: 3, unit: 'piece' },
        ],
      };
    }

    case 'customers:getAll':
      return [...mockCustomers];

    case 'customers:search': {
      const q = (payload?.query || '').trim().toLowerCase();
      if (!q) return [...mockCustomers];
      return mockCustomers.filter(c =>
        c.name.toLowerCase().includes(q) || (c.phone && c.phone.includes(q))
      );
    }

    case 'customers:getById': {
      const id = typeof payload === 'string' ? payload : payload?.id;
      return mockCustomers.find(c => c.id === id) || null;
    }

    case 'customers:save': {
      const custData = payload || {};
      if (custData.id) {
        mockCustomers = mockCustomers.map(c => c.id === custData.id ? { ...c, ...custData } : c);
        return mockCustomers.find(c => c.id === custData.id);
      } else {
        const newCust = {
          ...custData,
          id: `cust_${Date.now()}`,
          balancePiasters: custData.balancePiasters || 0,
          creditLimitPiasters: custData.creditLimitPiasters || 100000,
          createdAt: new Date().toISOString(),
        };
        mockCustomers.push(newCust);
        return newCust;
      }
    }

    case 'customers:recordPayment': {
      const { customerId, amountPiasters, notes } = payload || {};
      const target = mockCustomers.find(c => c.id === customerId);
      if (target) {
        target.balancePiasters = (target.balancePiasters || 0) - (amountPiasters || 0);
        const newEntry = {
          id: `led_${Date.now()}`,
          customerId: target.id,
          type: 'payment',
          saleId: null,
          amountPiasters: amountPiasters || 0,
          balanceAfterPiasters: target.balancePiasters,
          notes: notes || 'سداد نقدي من العميل',
          createdAt: new Date().toISOString(),
        };
        mockLedgerEntries.unshift(newEntry);
      }
      return target || null;
    }

    case 'customers:cancelPayment': {
      const { customerId, ledgerEntryId, reason, userName } = payload || {};
      const target = mockCustomers.find(c => c.id === customerId);
      const originalEntry = mockLedgerEntries.find(e => e.id === ledgerEntryId && e.customerId === customerId);
      if (!target || !originalEntry) {
        throw new Error('حركة السداد أو العميل غير موجود');
      }
      if (originalEntry.type !== 'payment') {
        throw new Error('لا يمكن إلغاء سوى دفعات السداد فقط');
      }
      const alreadyCancelled = mockLedgerEntries.some(e => e.type === 'payment_cancel' && e.saleId === ledgerEntryId);
      if (alreadyCancelled) {
        throw new Error('تم إلغاء هذه الدفعة مسبقاً بقيد معاكس');
      }
      target.balancePiasters = (target.balancePiasters || 0) + originalEntry.amountPiasters;
      const contraEntry = {
        id: `led_rev_${Date.now()}`,
        customerId: target.id,
        type: 'payment_cancel',
        saleId: ledgerEntryId,
        amountPiasters: originalEntry.amountPiasters,
        balanceAfterPiasters: target.balancePiasters,
        notes: `قيد معاكس لإلغاء دفعة (${(originalEntry.amountPiasters / 100).toFixed(2)} ج.م) — السبب: ${reason || 'سجلت بالخطأ'} (المستخدم: ${userName || 'الكاشير'})`,
        createdAt: new Date().toISOString(),
      };
      mockLedgerEntries.unshift(contraEntry);
      return target;
    }

    case 'customers:getStatement': {
      const cId = typeof payload === 'string' ? payload : payload?.customerId;
      const entries = mockLedgerEntries.filter(e => e.customerId === cId);
      return [...entries];
    }

    case 'customers:getDetailedStatement': {
      const cId = typeof payload === 'string' ? payload : payload?.customerId;
      const startDate = payload?.startDate;
      const endDate = payload?.endDate;
      const cust = mockCustomers.find(c => c.id === cId);
      if (!cust) return null;

      const allEntries = mockLedgerEntries.filter(e => e.customerId === cId);
      let runningOpening = 0;
      let periodDebits = 0;
      let periodCredits = 0;
      const filtered: any[] = [];

      for (const entry of allEntries) {
        const d = (entry.createdAt || '').slice(0, 10);
        const t = (entry.type || '').toLowerCase();
        const isDebit = (t === 'sale' || t === 'opening_balance' || t === 'debt_increase' || t === 'payment_cancel');
        const isCredit = (t === 'payment' || t === 'refund' || t === 'cancellation' || t === 'debt_decrease');

        if (startDate && d < startDate) {
          if (isDebit) runningOpening += entry.amountPiasters;
          else if (isCredit) runningOpening -= entry.amountPiasters;
          continue;
        }

        if (endDate && d > endDate) {
          continue;
        }

        if (isDebit) periodDebits += entry.amountPiasters;
        else if (isCredit) periodCredits += entry.amountPiasters;

        filtered.push(entry);
      }

      return {
        customerId: cust.id,
        customerName: cust.name,
        customerPhone: cust.phone,
        startDate: startDate || '',
        endDate: endDate || '',
        openingBalancePiasters: runningOpening,
        periodDebitsPiasters: periodDebits,
        periodCreditsPiasters: periodCredits,
        closingBalancePiasters: runningOpening + periodDebits - periodCredits,
        entries: filtered,
      };
    }

    case 'customers:checkPhone': {
      const rawPhone = (typeof payload === 'string' ? payload : (payload?.phone || '')).trim().replace(/[\s-]/g, '');
      const excludeId = payload?.excludeId;
      if (!rawPhone || rawPhone.length < 7) {
        return { isDuplicate: false, existingCustomer: null };
      }
      const existing = mockCustomers.find(c => {
        if (excludeId && c.id === excludeId) return false;
        const cPhone = (c.phone || '').trim().replace(/[\s-]/g, '');
        return cPhone.length >= 7 && cPhone === rawPhone;
      });
      return {
        isDuplicate: Boolean(existing),
        existingCustomer: existing || null,
      };
    }

    case 'customers:verifyBalance': {
      const cId = typeof payload === 'string' ? payload : payload?.customerId;
      const cust = mockCustomers.find(c => c.id === cId);
      if (!cust) return null;
      return {
        customerId: cust.id,
        storedBalancePiasters: cust.balancePiasters,
        calculatedBalancePiasters: cust.balancePiasters,
        isBalanced: true,
        discrepancyPiasters: 0,
        totalEntriesCount: 1,
      };
    }

    case 'customers:recalculateBalance': {
      const cId = typeof payload === 'string' ? payload : payload?.customerId;
      const cust = mockCustomers.find(c => c.id === cId);
      return cust || null;
    }

    case 'customers:runTests':
      return {
        success: true,
        message: 'نجحت جميع اختبارات الآجل والحسابات والمخزون (8/8 تأكيد بنجاح 100%).',
        totalAssertions: 8,
        passedAssertions: 8,
        details: [
          '✔ قاعدة البيانات التجريبية لحسابات الآجل تم إنشاؤها بنجاح',
          '✔ تم إنشاء العميل وحفظ الرصيد الافتتاحي (500 ج.م)',
          '✔ تسجيل قيد رصيد افتتاحي في دفتر الأستاذ',
          '✔ تم حفظ الفاتورة الآجلة بإجمالي 120 ج.م',
          '✔ تحديث رصيد دين العميل إلى 620 ج.م',
          '✔ تخفيض دين العميل بدقة إلى 400 ج.م بعد سداد 220 ج.م',
          '✔ استعادة رصيد العميل الأصلي 620 ج.م بعد إلغاء الدفعة بقيد معاكس',
          '✔ تصفير حساب العميل بعد السداد الكامل',
        ],
      };

    case 'excel:getCustomerTemplate':
      return {
        success: true,
        fileName: 'قالب_استيراد_العملاء_رفيق_POS.xlsx',
        base64: 'UEsDBBQAAAAIA...',
      };

    case 'excel:previewCustomerImport': {
      return {
        totalRowsCount: 3,
        validRowsCount: 3,
        invalidRowsCount: 0,
        duplicatePhonesCount: 0,
        totalOpeningDebtsPiasters: 25000,
        totalOpeningDebtsFormatted: '250.00 ج.م',
        rows: [
          {
            rowIndex: 4,
            name: 'سيد عبد الرحمن',
            phone: '01099887766',
            initialBalancePiasters: 15000,
            initialBalanceFormatted: '150.00 ج.م',
            creditLimitPiasters: 100000,
            creditLimitFormatted: '1,000.00 ج.م',
            notes: 'دفتر قديم صفحة 12',
            isValid: true,
            errors: [],
            isPhoneDuplicateInDb: false,
          },
          {
            rowIndex: 5,
            name: 'محمود عبد الفتاح',
            phone: '01122334455',
            initialBalancePiasters: 10000,
            initialBalanceFormatted: '100.00 ج.م',
            creditLimitPiasters: 100000,
            creditLimitFormatted: '1,000.00 ج.م',
            notes: 'جار المحل',
            isValid: true,
            errors: [],
            isPhoneDuplicateInDb: false,
          },
          {
            rowIndex: 6,
            name: 'طارق عبد الله',
            phone: '01244556677',
            initialBalancePiasters: 0,
            initialBalanceFormatted: '0.00 ج.م',
            creditLimitPiasters: 50000,
            creditLimitFormatted: '500.00 ج.م',
            notes: 'عميل نقدي بدون دين افتتاح',
            isValid: true,
            errors: [],
            isPhoneDuplicateInDb: false,
          },
        ],
      };
    }

    case 'excel:importCustomers': {
      const rows = payload?.rows || payload || [];
      const validRows = rows.filter((r: any) => r.isValid !== false);
      let importedCount = 0;
      let totalOpeningDebtsPiasters = 0;
      for (const r of validRows) {
        const newCust = {
          id: `cust_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          name: r.name,
          phone: r.phone || '',
          balancePiasters: r.initialBalancePiasters || 0,
          creditLimitPiasters: r.creditLimitPiasters || 100000,
          createdAt: new Date().toISOString(),
        };
        mockCustomers.push(newCust);
        if (newCust.balancePiasters > 0) {
          totalOpeningDebtsPiasters += newCust.balancePiasters;
          mockLedgerEntries.unshift({
            id: `ledg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            customerId: newCust.id,
            type: 'opening_balance',
            saleId: null,
            amountPiasters: newCust.balancePiasters,
            balanceAfterPiasters: newCust.balancePiasters,
            notes: r.notes ? `رصيد افتتاحي: ${r.notes}` : 'رصيد افتتاحي (استيراد إكسل)',
            createdAt: new Date().toISOString(),
          });
        }
        importedCount++;
      }
      return {
        importedCount,
        skippedCount: rows.length - importedCount,
        totalOpeningDebtsPiasters,
        totalOpeningDebtsFormatted: `${(totalOpeningDebtsPiasters / 100).toFixed(2)} ج.م`,
        message: `تم استيراد ${importedCount} عميل بنجاح بإجمالي ديون افتتاحية ${(totalOpeningDebtsPiasters / 100).toFixed(2)} ج.م.`,
      };
    }

    default:
      return { success: true, echoed: payload };
  }
}

// In-memory mock security variables for browser environment
let mockPinHash: string | null = null;
let mockRecoveryCode: string | null = null;
let mockFailedAttempts = 0;
let mockLockoutUntil = 0;
let mockPinEnabled = true;
let mockProtectedActions = {
  settings: true,
  reports: true,
  product_edit: true,
  stock_adjust: true,
  db_recovery: true,
  discounts: false,
};
let mockFirstRunNeeded = typeof window !== 'undefined' ? localStorage.getItem('rafiq_first_run_completed') !== 'true' : false;
let mockDemoDataLoaded = false;
let mockDemoProductsCount = 0;
let mockDemoSalesCount = 0;
let mockDemoCustomersCount = 0;
let mockCustomers: any[] = [
  {
    id: 'cust_1',
    name: 'أحمد محمود العطار',
    phone: '01012345678',
    balancePiasters: 15000,
    creditLimitPiasters: 100000,
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
  },
  {
    id: 'cust_2',
    name: 'محمد إبراهيم حسنين',
    phone: '01198765432',
    balancePiasters: 0,
    creditLimitPiasters: 50000,
    createdAt: new Date(Date.now() - 15 * 86400000).toISOString(),
  },
  {
    id: 'cust_3',
    name: 'الحاج مصطفى السعيد',
    phone: '01234567890',
    balancePiasters: 45000,
    creditLimitPiasters: 80000,
    createdAt: new Date(Date.now() - 60 * 86400000).toISOString(),
  },
];

let mockLedgerEntries: any[] = [
  {
    id: 'ledg_init_1',
    customerId: 'cust_1',
    type: 'opening_balance',
    saleId: null,
    amountPiasters: 15000,
    balanceAfterPiasters: 15000,
    notes: 'رصيد افتتاحي مسجل بالدفتر',
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
  },
  {
    id: 'ledg_init_3',
    customerId: 'cust_3',
    type: 'opening_balance',
    saleId: null,
    amountPiasters: 45000,
    balanceAfterPiasters: 45000,
    notes: 'رصيد افتتاحي مسجل بالدفتر',
    createdAt: new Date(Date.now() - 60 * 86400000).toISOString(),
  },
];
