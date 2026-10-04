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

export interface UserDto {
  id: string;
  username: string;
  displayName: string;
  role: 'admin' | 'cashier';
  isActive: boolean;
  isLocked?: boolean;
  remainingLockoutSeconds?: number;
  permissions?: Record<string, boolean>;
  createdAt?: string;
  lastLoginAt?: string;
}

export interface LoginResult {
  success: boolean;
  user?: UserDto;
  isLocked?: boolean;
  remainingLockoutSeconds?: number;
  message?: string;
}

export interface AppUpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseDate?: string;
  changelog?: string;
  downloadUrl?: string;
  sha256?: string;
  isMandatory?: boolean;
  fileSizeBytes?: number;
  errorMessage?: string;
}

export interface AppUpdateResult {
  success: boolean;
  code: string;
  message: string;
  backupPath?: string;
  rollbackTriggered?: boolean;
}

export interface FullStoreExportResult {
  success: boolean;
  message: string;
  exportFolder: string;
  productsCount: number;
  customersCount: number;
  suppliersCount: number;
  salesCount: number;
  stockMovementsCount: number;
  closingsCount: number;
  generatedFiles: string[];
  totalSalesPiasters: number;
  totalDebtsPiasters: number;
  totalStockCostPiasters: number;
  totalStockRetailPiasters: number;
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
function getDefaultTimeout(action: string): number {
  if (
    action.startsWith('excel:') ||
    action.startsWith('products:import') ||
    action.startsWith('system:restore') ||
    action.startsWith('system:createBackup') ||
    action.startsWith('system:vacuum') ||
    action.startsWith('inventory:recalculate') ||
    action.startsWith('backup:')
  ) {
    return 120000; // 2 minutes for heavy file/batch operations
  }
  return 15000; // 15 seconds default for normal operations on low-end POS hardware
}

/**
 * Execute a command on C# Host
 */
export async function invoke<TResult = any, TPayload = any>(
  action: string,
  payload?: TPayload,
  timeoutMs?: number
): Promise<TResult> {
  ensureListenerAttached();

  const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const request: BridgeRequest<TPayload> = {
    id,
    action,
    payload: payload as TPayload,
  };

  const effectiveTimeout = timeoutMs ?? getDefaultTimeout(action);

  // Check if we are running inside native WebView2
  if (window.chrome?.webview) {
    return new Promise<TResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingRequests.delete(id);
        reject(new Error(`انتهت مهلة الانتظار للعملية: ${action}`));
      }, effectiveTimeout);

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

    case 'printer:printLabels':
      return {
        success: true,
        totalLabelsPrinted: payload?.items?.reduce((sum: number, it: any) => sum + (it.copies || 1), 0) || 1,
        printerUsed: payload?.config?.printerName || 'طابعة الباركود الافتراضية (محاكاة)',
        message: 'تمت طباعة ملصقات الباركود بنجاح (محاكاة المتصفح)',
      };

    case 'printer:testLabel':
      return {
        success: true,
        totalLabelsPrinted: 1,
        printerUsed: payload?.printerName || 'طابعة الباركود (محاكاة)',
        message: 'تمت طباعة الملصق التجريبي بنجاح (محاكاة)',
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

    case 'products:getLowStock': {
      const mockLowStock = [
        {
          id: 'p_4',
          name: 'شاي العروسة ناعم 250 جم',
          normalizedName: 'شاي العروسه ناعم 250 جم',
          barcode: '6224001122334',
          barcodes: ['6224001122334'],
          pricePiasters: 2500,
          costPiasters: 2000,
          stockQuantityMilli: 2000,
          minStockQuantityMilli: 5000,
          unit: 'piece',
          taxRatePercent: 0,
          isActive: true,
          priceFormatted: '25.00 ج.م',
          stockFormatted: '2',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      ];
      return {
        products: mockLowStock,
        count: mockLowStock.length,
      };
    }

    case 'products:getLowStockCount':
      return { count: 1 };

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
        summaryReport: 'تقرير أداء فحص سرعة البحث والباركود على 5000 صنف:\n• متوسط زمن البحث: 3.2 مللي ثانية (الحد الأقصى: 100 مللي ثانية)\n• اختبار توحيد الحروف العربية: ناجح 100%\n• محاكاة قارئ الباركود: فوري',
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
        movement: {
          id: 'mov_mock_adj',
          productId: payload?.productId,
          movementType: 'ADJUSTMENT',
          quantityMilli: payload?.quantityDeltaMilli || 5000,
          unitCostPiasters: 2500,
          note: payload?.reason || 'تسوية جردية',
          createdAt: new Date().toISOString(),
        },
        product: {
          id: payload?.productId || 'p_1',
          name: 'لبن جهينة كامل الدسم 1 لتر',
          stockQuantityMilli: payload?.newStockQuantityMilli ?? 45000,
          minStockQuantityMilli: 10000,
          pricePiasters: 4200,
          costPiasters: 3400,
          unit: 'piece',
          isActive: true
        }
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

    case 'excel:exportCustomers':
      return {
        success: true,
        fileName: 'سجل_عملاء_رفيق_تجريبي.xlsx',
        count: 3,
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
        protectedActions: getMockProtectedActions(),
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
      if (mockPinHash && payload?.currentPin && payload?.currentPin !== mockPinHash) {
        throw new Error('الرقم السري غير صحيح لحفظ إعدادات الحماية.');
      }
      if (payload?.actions) {
        saveMockProtectedActions(payload.actions);
      }
      return { success: true };
    }

    case 'auth:login': {
      const u = mockUsers.find(x => x.id === payload?.usernameOrId || x.username.toLowerCase() === (payload?.usernameOrId || '').toLowerCase());
      if (!u) {
        throw new Error('بيانات الموظف غير صحيحة.');
      }
      if (!u.isActive) {
        throw new Error('هذا الحساب معطّل. يرجى مراجعة مدير النظام.');
      }
      const isLocked = Date.now() < mockLockoutUntil;
      if (isLocked) {
        const remainingSec = Math.max(0, Math.ceil((mockLockoutUntil - Date.now()) / 1000));
        return {
          success: false,
          isLocked: true,
          remainingLockoutSeconds: remainingSec,
          message: `الحساب مقفل مؤقتاً لحماية الأمان. يرجى الانتظار ${remainingSec} ثانية.`,
        };
      }
      const expectedPin = u.role === 'admin' ? (mockPinHash || '1234') : '0000';
      if (String(payload?.pin || '') !== expectedPin) {
        mockFailedAttempts++;
        if (mockFailedAttempts >= 5) {
          mockLockoutUntil = Date.now() + 30000;
        }
        return {
          success: false,
          isLocked: mockFailedAttempts >= 5,
          remainingLockoutSeconds: mockFailedAttempts >= 5 ? 30 : 0,
          message: 'الرقم السري غير صحيح.',
        };
      }
      mockFailedAttempts = 0;
      mockCurrentUserId = u.id;
      u.lastLoginAt = new Date().toISOString();
      return {
        success: true,
        user: { ...u, permissions: getMockPermissionsForRole(u.role) },
        message: 'تم تسجيل الدخول بنجاح.',
      };
    }

    case 'auth:logout': {
      mockCurrentUserId = '';
      return { success: true };
    }

    case 'auth:getCurrentUser': {
      const u = mockUsers.find(x => x.id === mockCurrentUserId) || mockUsers[0];
      return { ...u, permissions: getMockPermissionsForRole(u?.role || 'admin') };
    }

    case 'auth:getActiveUsers': {
      return mockUsers.filter(x => x.isActive).map(u => ({ ...u, permissions: getMockPermissionsForRole(u.role) }));
    }

    case 'auth:verifySupervisor': {
      const adminPin = mockPinHash || '1234';
      if (String(payload?.pin || '') === adminPin) {
        return {
          success: true,
          supervisorName: 'مدير النظام',
          message: 'تمت موافقة مدير النظام بنجاح.',
        };
      }
      throw new Error('الرقم السري لمدير النظام غير صحيح.');
    }

    case 'users:getAll': {
      const currentU = mockUsers.find(x => x.id === mockCurrentUserId);
      const isSupervisor = payload?.supervisorPin === (mockPinHash || '1234');
      if (currentU?.role !== 'admin' && !isSupervisor && mockCurrentUserId) {
        throw new Error('غير مصرح: عرض بيانات الموظفين يتطلب صلاحيات مدير النظام.');
      }
      return mockUsers.map(u => ({ ...u, permissions: getMockPermissionsForRole(u.role) }));
    }

    case 'users:create': {
      const currentU = mockUsers.find(x => x.id === mockCurrentUserId);
      const isSupervisor = payload?.supervisorPin === (mockPinHash || '1234');
      if (currentU?.role !== 'admin' && !isSupervisor && mockCurrentUserId) {
        throw new Error('غير مصرح: إضافة موظفين تتطلب صلاحيات مدير النظام.');
      }
      const { username, displayName, role } = payload || {};
      if (!username || !displayName) throw new Error('اسم المستخدم واسم الموظف مطلوبان');
      const cleanU = username.trim().toLowerCase();
      if (mockUsers.some(x => x.username.toLowerCase() === cleanU)) {
        throw new Error('اسم المستخدم موجود بالفعل');
      }
      const newUser: UserDto = {
        id: `usr_${Date.now()}`,
        username: cleanU,
        displayName: displayName.trim(),
        role: role === 'admin' ? 'admin' : 'cashier',
        isActive: true,
        createdAt: new Date().toISOString(),
      };
      mockUsers.push(newUser);
      return newUser;
    }

    case 'users:update': {
      const currentU = mockUsers.find(x => x.id === mockCurrentUserId);
      const isSupervisor = payload?.supervisorPin === (mockPinHash || '1234');
      if (currentU?.role !== 'admin' && !isSupervisor && mockCurrentUserId) {
        throw new Error('غير مصرح: تعديل بيانات الموظفين يتطلب صلاحيات مدير النظام.');
      }
      const { id, displayName, role, isActive } = payload || {};
      const target = mockUsers.find(x => x.id === id);
      if (!target) throw new Error('الموظف غير موجود');
      if (target.role === 'admin' && (role !== 'admin' || !isActive)) {
        const activeAdmins = mockUsers.filter(x => x.role === 'admin' && x.isActive).length;
        if (activeAdmins <= 1) {
          throw new Error('لا يمكن تعطيل أو تغيير دور آخر مدير نظام نشط.');
        }
      }
      target.displayName = displayName;
      target.role = role;
      target.isActive = isActive;
      return { success: true };
    }

    case 'users:changePin': {
      const currentU = mockUsers.find(x => x.id === mockCurrentUserId);
      const { id, currentPin, supervisorPin } = payload || {};
      const target = mockUsers.find(x => x.id === id);
      if (!target) throw new Error('الموظف غير موجود');
      const isSupervisor = supervisorPin === (mockPinHash || '1234');
      const isCurrentAdmin = currentU?.role === 'admin';

      if (target.role === 'admin') {
        const adminPin = mockPinHash || '1234';
        if (currentPin !== adminPin && !isSupervisor) {
          throw new Error('الرقم السري الحالي لمدير النظام غير صحيح. لا يمكن تغيير الرقم السري دون تأكيد الهوية.');
        }
      } else {
        if (!isCurrentAdmin && !isSupervisor && mockCurrentUserId && mockCurrentUserId !== target.id) {
          throw new Error('غير مصرح: تغيير الرقم السري للكاشير يتطلب صلاحيات مدير النظام.');
        }
      }
      return { success: true };
    }

    case 'security:setIdleTimeout': {
      mockIdleTimeoutMinutes = payload?.minutes || 15;
      return { minutes: mockIdleTimeoutMinutes };
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
            title: 'طابعة الفواتير والإيصالات الحرارية',
            passed: true,
            statusText: 'جاهزة (Xprinter XP-80C)',
            description: 'تم اكتشاف الطابعة وجاهزة لطباعة إيصالات الكاشير وفتح درج النقدية.',
            actionLabel: 'اختبار الطباعة',
            actionTarget: 'printer:testPrint',
          },
          {
            key: 'scanner',
            title: 'قارئ الباركود والماسح الضوئي',
            passed: true,
            statusText: 'مفعل وجاهز للمسح',
            description: 'مستمع الباركود السريع نشط وينقل الأصناف مباشرة إلى سلة المبيعات بدون لمس الماوس.',
            actionLabel: 'فحص قارئ الباركود',
            actionTarget: 'scanner:test',
          },
          {
            key: 'backup',
            title: 'النسخ الاحتياطي وحماية البيانات',
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
        todaySalesGrossProfitPiasters: 28500,
        todayInventoryLossPiasters: 0,
        todayInventoryLossFormatted: '0.00 ج.م',
        todayInventorySurplusPiasters: 0,
        todayInventorySurplusFormatted: '0.00 ج.م',
        todayNetProfitsPiasters: 28500,
        todayNetProfitsFormatted: '285.00 ج.م',
        todayAdjustmentsCount: 0,
        todayDebtPaymentsPiasters: 0,
        recentAdjustments: [],
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

    case 'reports:getPeriodSales': {
      const period = payload?.period || 'today';
      let multiplier = 1;
      let invoices = 24;
      if (period === 'yesterday') { multiplier = 0.9; invoices = 21; }
      else if (period === 'week') { multiplier = 6.8; invoices = 158; }
      else if (period === 'month') { multiplier = 28.5; invoices = 680; }
      else if (period === '3months') { multiplier = 82; invoices = 1950; }
      else if (period === 'year') { multiplier = 340; invoices = 8200; }

      const totalSales = Math.round(125000 * multiplier);
      const cashSales = Math.round(totalSales * 0.76);
      const creditSales = Math.round(totalSales * 0.20);
      const cardSales = totalSales - cashSales - creditSales;
      const returns = Math.round(totalSales * 0.025);
      const cancelled = Math.round(totalSales * 0.015);
      const netSales = totalSales - returns;
      const grossProfit = Math.round(netSales * 0.228);

      return {
        period,
        startDate: payload?.fromDate || '2026-10-01',
        endDate: payload?.toDate || '2026-10-04',
        totalSalesPiasters: totalSales,
        cashSalesPiasters: cashSales,
        creditSalesPiasters: creditSales,
        cardSalesPiasters: cardSales,
        returnsTotalPiasters: returns,
        cancelledTotalPiasters: cancelled,
        netSalesPiasters: netSales,
        grossProfitPiasters: grossProfit,
        invoicesCount: invoices,
        returnsCount: Math.max(1, Math.round(invoices * 0.03)),
        cancelledCount: Math.max(1, Math.round(invoices * 0.015)),
        zeroCostItemsCount: 0,
        topSellingProducts: [
          { productId: 'p_1', productName: 'لبن جهينة كامل الدسم 1 لتر', totalQuantity: Math.round(18 * multiplier), totalSalesPiasters: Math.round(75600 * multiplier) },
          { productId: 'p_2', productName: 'أرز مصري فاخر 1 كجم', totalQuantity: Math.round(12 * multiplier), totalSalesPiasters: Math.round(42000 * multiplier) },
          { productId: 'p_3', productName: 'سكر أبيض نقي 1 كجم', totalQuantity: Math.round(25 * multiplier), totalSalesPiasters: Math.round(75000 * multiplier) },
          { productId: 'p_4', productName: 'زيت عباد الشمس 800 مل', totalQuantity: Math.round(15 * multiplier), totalSalesPiasters: Math.round(97500 * multiplier) },
          { productId: 'p_5', productName: 'شاي العروسة 250 جم', totalQuantity: Math.round(30 * multiplier), totalSalesPiasters: Math.round(90000 * multiplier) },
        ],
      };
    }

    case 'reports:getInventoryLoss': {
      const p = payload?.period || 'today';
      const m = p === 'month' ? 12 : p === 'week' ? 3.5 : 1;
      return {
        totalLossPiasters: Math.round(4500 * m),
        totalDamagePiasters: Math.round(2500 * m),
        totalGiftsPiasters: Math.round(1200 * m),
        totalSurplusPiasters: Math.round(800 * m),
        topLossItems: [
          {
            productId: 'p_1',
            productName: 'لبن جهينة كامل الدسم 1 لتر',
            unit: 'piece',
            quantityDeltaMilli: -3000,
            unitCostPiasters: 3400,
            financialImpactPiasters: 10200,
            reason: 'تالف (عبوة ممزقة أثناء النقل)',
            createdAt: '2026-10-04 11:30',
          },
          {
            productId: 'p_6',
            productName: 'زبادي طبيعي المراعي 105 جم',
            unit: 'piece',
            quantityDeltaMilli: -5000,
            unitCostPiasters: 750,
            financialImpactPiasters: 3750,
            reason: 'انتهاء الصلاحية',
            createdAt: '2026-10-04 09:15',
          },
          {
            productId: 'p_3',
            productName: 'سكر أبيض نقي 1 كجم',
            unit: 'piece',
            quantityDeltaMilli: -2000,
            unitCostPiasters: 2600,
            financialImpactPiasters: 5200,
            reason: 'عجز جرد أسبوعي',
            createdAt: '2026-10-03 22:00',
          },
        ],
      };
    }

    case 'reports:getClosingHistory': {
      return [
        {
          id: 'close_1',
          closingDate: '2026-10-03',
          shiftNumber: 1,
          cashierName: 'محمد أحمد (المدير)',
          totalSalesPiasters: 142000,
          cashSalesPiasters: 110000,
          creditSalesPiasters: 32000,
          returnsPiasters: 3500,
          netSalesPiasters: 138500,
          grossProfitPiasters: 31200,
          expectedCashPiasters: 106500,
          actualCashPiasters: 106500,
          differencePiasters: 0,
          isClosed: true,
          createdAt: '2026-10-03 23:45',
          notes: 'إقفال سليم بدون فروقات',
        },
        {
          id: 'close_2',
          closingDate: '2026-10-02',
          shiftNumber: 1,
          cashierName: 'أحمد محمود (كاشير)',
          totalSalesPiasters: 118500,
          cashSalesPiasters: 92000,
          creditSalesPiasters: 26500,
          returnsPiasters: 1200,
          netSalesPiasters: 117300,
          grossProfitPiasters: 26400,
          expectedCashPiasters: 90800,
          actualCashPiasters: 90500,
          differencePiasters: -300,
          isClosed: true,
          createdAt: '2026-10-02 23:30',
          notes: 'عجز طفيف 3 جنيهات فكة تم قبولها',
        },
        {
          id: 'close_3',
          closingDate: '2026-10-01',
          shiftNumber: 1,
          cashierName: 'محمد أحمد (المدير)',
          totalSalesPiasters: 135000,
          cashSalesPiasters: 105000,
          creditSalesPiasters: 30000,
          returnsPiasters: 2000,
          netSalesPiasters: 133000,
          grossProfitPiasters: 30100,
          expectedCashPiasters: 103000,
          actualCashPiasters: 103250,
          differencePiasters: 250,
          isClosed: true,
          createdAt: '2026-10-01 23:50',
          notes: 'زيادة نقدية طفيفة 2.50 ج.م',
        },
        {
          id: 'close_4',
          closingDate: '2026-09-30',
          shiftNumber: 1,
          cashierName: 'محمد أحمد (المدير)',
          totalSalesPiasters: 164000,
          cashSalesPiasters: 128000,
          creditSalesPiasters: 36000,
          returnsPiasters: 4000,
          netSalesPiasters: 160000,
          grossProfitPiasters: 36800,
          expectedCashPiasters: 124000,
          actualCashPiasters: 124000,
          differencePiasters: 0,
          isClosed: true,
          createdAt: '2026-09-30 23:55',
          notes: 'إقفال نهاية الشهر - مطابق تماماً',
        },
      ];
    }

    case 'reports:getCategoryPerformance': {
      return [
        {
          categoryId: 'cat_dairy',
          categoryName: 'الألبان ومنتجات الحليب',
          totalSalesPiasters: 425000,
          totalCostPiasters: 335000,
          grossProfitPiasters: 90000,
          profitMarginPercent: 21.2,
          itemsSoldQty: 184,
          salesSharePercent: 34.0,
        },
        {
          categoryId: 'cat_grocery',
          categoryName: 'البقالة والسلع التموينية',
          totalSalesPiasters: 380000,
          totalCostPiasters: 310000,
          grossProfitPiasters: 70000,
          profitMarginPercent: 18.4,
          itemsSoldQty: 245,
          salesSharePercent: 30.4,
        },
        {
          categoryId: 'cat_beverages',
          categoryName: 'المشروبات والعصائر',
          totalSalesPiasters: 210000,
          totalCostPiasters: 155000,
          grossProfitPiasters: 55000,
          profitMarginPercent: 26.2,
          itemsSoldQty: 140,
          salesSharePercent: 16.8,
        },
        {
          categoryId: 'cat_sweets',
          categoryName: 'الحلويات والشوكولاتة والمسليات',
          totalSalesPiasters: 145000,
          totalCostPiasters: 98000,
          grossProfitPiasters: 47000,
          profitMarginPercent: 32.4,
          itemsSoldQty: 95,
          salesSharePercent: 11.6,
        },
        {
          categoryId: 'cat_cleaners',
          categoryName: 'المنظفات والعناية المنزلية',
          totalSalesPiasters: 90000,
          totalCostPiasters: 68000,
          grossProfitPiasters: 22000,
          profitMarginPercent: 24.4,
          itemsSoldQty: 42,
          salesSharePercent: 7.2,
        },
      ];
    }

    case 'reports:getItemProfitability': {
      const direction = payload?.direction || 'desc';
      const items = [
        {
          productId: 'p_1',
          productName: 'لبن جهينة كامل الدسم 1 لتر',
          barcode: '622100100101',
          categoryName: 'الألبان',
          unitCostPiasters: 3400,
          unitPricePiasters: 4200,
          quantitySoldMilli: 45000,
          totalSalesPiasters: 189000,
          totalCostPiasters: 153000,
          grossProfitPiasters: 36000,
          marginPercent: 19.05,
          isNegativeMargin: false,
          isZeroCost: false,
        },
        {
          productId: 'p_5',
          productName: 'شاي العروسة 250 جم',
          barcode: '622100100105',
          categoryName: 'البقالة',
          unitCostPiasters: 2300,
          unitPricePiasters: 3000,
          quantitySoldMilli: 35000,
          totalSalesPiasters: 105000,
          totalCostPiasters: 80500,
          grossProfitPiasters: 24500,
          marginPercent: 23.33,
          isNegativeMargin: false,
          isZeroCost: false,
        },
        {
          productId: 'p_4',
          productName: 'زيت عباد الشمس 800 مل',
          barcode: '622100100104',
          categoryName: 'البقالة',
          unitCostPiasters: 5300,
          unitPricePiasters: 6500,
          quantitySoldMilli: 20000,
          totalSalesPiasters: 130000,
          totalCostPiasters: 106000,
          grossProfitPiasters: 24000,
          marginPercent: 18.46,
          isNegativeMargin: false,
          isZeroCost: false,
        },
        {
          productId: 'p_2',
          productName: 'أرز مصري فاخر 1 كجم',
          barcode: '622100100102',
          categoryName: 'البقالة',
          unitCostPiasters: 2900,
          unitPricePiasters: 3500,
          quantitySoldMilli: 28000,
          totalSalesPiasters: 98000,
          totalCostPiasters: 81200,
          grossProfitPiasters: 16800,
          marginPercent: 17.14,
          isNegativeMargin: false,
          isZeroCost: false,
        },
        {
          productId: 'p_7',
          productName: 'بسكويت شوكولاتة بوريو 6 قطع',
          barcode: '622100100107',
          categoryName: 'الحلويات',
          unitCostPiasters: 500,
          unitPricePiasters: 800,
          quantitySoldMilli: 50000,
          totalSalesPiasters: 40000,
          totalCostPiasters: 25000,
          grossProfitPiasters: 15000,
          marginPercent: 37.5,
          isNegativeMargin: false,
          isZeroCost: false,
        },
      ];

      if (direction === 'asc') {
        return items.reverse();
      }
      return items;
    }

    case 'reports:getPeriodComparison': {
      return {
        currentPeriodName: 'هذا الأسبوع',
        previousPeriodName: 'الأسبوع السابق',
        sales: {
          current: 875000,
          previous: 790000,
          deltaPiasters: 85000,
          percentChange: 10.76,
        },
        profit: {
          current: 198000,
          previous: 175000,
          deltaPiasters: 23000,
          percentChange: 13.14,
        },
        invoiceCount: {
          current: 186,
          previous: 172,
          percentChange: 8.14,
        },
        avgInvoicePiasters: {
          current: 4704,
          previous: 4593,
          deltaPiasters: 111,
          percentChange: 2.42,
        },
      };
    }

    case 'reports:getInventoryOverview': {
      return {
        totalProductsCount: 142,
        activeProductsCount: 138,
        totalInventoryCostPiasters: 4850000,
        totalInventoryRetailPiasters: 6150000,
        potentialGrossProfitPiasters: 1300000,
        outOfStockCount: 4,
        lowStockCount: 9,
        expiredBatchesCount: 1,
        expiringSoonBatchesCount: 3,
        turnoverRate: 4.2,
      };
    }

    case 'reports:getShrinkageAnalysis': {
      return {
        totalShrinkagePiasters: 34500,
        shrinkageToSalesPercent: 0.78,
        reasons: [
          { reason: 'damaged', label: 'تالف وكسور أثناء النقل والعرض', count: 8, totalCostPiasters: 18200, percentOfTotal: 52.75 },
          { reason: 'expired', label: 'انتهاء الصلاحية والتخزين', count: 4, totalCostPiasters: 9500, percentOfTotal: 27.54 },
          { reason: 'inventory_deficit', label: 'عجز وفروقات جرد', count: 3, totalCostPiasters: 4800, percentOfTotal: 13.91 },
          { reason: 'gift_sample', label: 'عينات وهدايا وضيافة', count: 2, totalCostPiasters: 2000, percentOfTotal: 5.80 },
        ],
        topShrinkageProducts: [
          {
            productId: 'p_1',
            productName: 'لبن جهينة كامل الدسم 1 لتر',
            unit: 'piece',
            quantityDeltaMilli: -4000,
            unitCostPiasters: 3400,
            financialImpactPiasters: 13600,
            reason: 'تالف عبوة وسوء تبريد',
            createdAt: '2026-10-02',
          },
          {
            productId: 'p_6',
            productName: 'زبادي طبيعي المراعي 105 جم',
            unit: 'piece',
            quantityDeltaMilli: -12000,
            unitCostPiasters: 750,
            financialImpactPiasters: 9000,
            reason: 'انتهاء صلاحية الدفعة',
            createdAt: '2026-10-01',
          },
          {
            productId: 'p_3',
            productName: 'سكر أبيض نقي 1 كجم',
            unit: 'piece',
            quantityDeltaMilli: -2000,
            unitCostPiasters: 2600,
            financialImpactPiasters: 5200,
            reason: 'عجز جرد أسبوعي',
            createdAt: '2026-09-30',
          },
        ],
      };
    }

    case 'reports:getPurchaseAnalysis': {
      return {
        totalPurchasesPiasters: 1250000,
        totalInvoicesCount: 14,
        totalPaidPiasters: 1050000,
        totalUnpaidPiasters: 200000,
        topSuppliers: [
          { supplierId: 'sup_1', supplierName: 'شركة جهينة للصناعات الغذائية', invoicesCount: 5, totalPurchasePiasters: 540000, paidPiasters: 480000, unpaidPiasters: 60000 },
          { supplierId: 'sup_2', supplierName: 'شركة العروسة لتجارة الشاي', invoicesCount: 3, totalPurchasePiasters: 310000, paidPiasters: 310000, unpaidPiasters: 0 },
          { supplierId: 'sup_3', supplierName: 'مؤسسة الدلتا لتوزيع السكر والأرز', invoicesCount: 4, totalPurchasePiasters: 280000, paidPiasters: 200000, unpaidPiasters: 80000 },
          { supplierId: 'sup_4', supplierName: 'المتحدة للمنظفات والكيماويات', invoicesCount: 2, totalPurchasePiasters: 120000, paidPiasters: 60000, unpaidPiasters: 60000 },
        ],
      };
    }

    case 'reports:getCreditOverview': {
      return {
        totalOutstandingDebtsPiasters: 185000,
        debtorsCount: 6,
        periodNewCreditPiasters: 45000,
        periodRepaymentsPiasters: 52000,
        netCreditFlowPiasters: -7000, // Debts decreased by 70 EGP (good)
        averagePaybackDays: 14.5,
      };
    }

    case 'reports:getDebtAging': {
      return {
        totalDebtPiasters: 185000,
        criticalDebtorsCount: 1,
        tiers: [
          { label: 'أقل من 7 أيام (سداد وشيك)', daysRange: '0 - 7 أيام', customerCount: 3, totalDebtPiasters: 65000, percentOfTotal: 35.14, severity: 'normal' },
          { label: 'من 8 إلى 30 يوم (متابعة عادية)', daysRange: '8 - 30 يوم', customerCount: 2, totalDebtPiasters: 72000, percentOfTotal: 38.92, severity: 'attention' },
          { label: 'من 31 إلى 90 يوم (متأخر)', daysRange: '31 - 90 يوم', customerCount: 1, totalDebtPiasters: 33000, percentOfTotal: 17.84, severity: 'warning' },
          { label: 'أكثر من 90 يوم (ديون حرجة متعثرة)', daysRange: '> 90 يوم', customerCount: 1, totalDebtPiasters: 15000, percentOfTotal: 8.10, severity: 'critical' },
        ],
      };
    }

    case 'reports:getCustomerBehavior': {
      return {
        newCustomersCount: 4,
        topBuyingCustomers: [
          { customerId: 'c_1', customerName: 'أحمد محمود إسماعيل', phone: '01012345678', totalAmountPiasters: 320000, invoicesCount: 18, balancePiasters: 45000, lastActivityDate: '2026-10-04 12:30' },
          { customerId: 'c_2', customerName: 'محمود عبد الرحيم الشريف', phone: '01123456789', totalAmountPiasters: 245000, invoicesCount: 12, balancePiasters: 38000, lastActivityDate: '2026-10-03 18:20' },
          { customerId: 'c_3', customerName: 'سارة عبد الفتاح خليل', phone: '01234567890', totalAmountPiasters: 180000, invoicesCount: 9, balancePiasters: 0, lastActivityDate: '2026-10-04 10:15' },
        ],
        topPayingCustomers: [
          { customerId: 'c_1', customerName: 'أحمد محمود إسماعيل', phone: '01012345678', totalAmountPiasters: 275000, invoicesCount: 14, balancePiasters: 45000, lastActivityDate: '2026-10-04' },
          { customerId: 'c_2', customerName: 'محمود عبد الرحيم الشريف', phone: '01123456789', totalAmountPiasters: 207000, invoicesCount: 10, balancePiasters: 38000, lastActivityDate: '2026-10-03' },
          { customerId: 'c_4', customerName: 'إبراهيم حسن النجار', phone: '01555555555', totalAmountPiasters: 120000, invoicesCount: 6, balancePiasters: 12000, lastActivityDate: '2026-10-01' },
        ],
        inactiveDebtors: [
          { customerId: 'c_5', customerName: 'طارق علي بدوي', phone: '01099887766', totalAmountPiasters: 15000, invoicesCount: 1, balancePiasters: 15000, lastActivityDate: '2026-06-15' },
        ],
      };
    }

    case 'reports:getPaymentHistory': {
      return [
        {
          id: 'pay_1',
          customerId: 'c_1',
          customerName: 'أحمد محمود إسماعيل',
          amountPiasters: 20000,
          paymentDate: '2026-10-04 11:45',
          notes: 'سداد نقدي جزء من الحساب',
          cashierName: 'محمد أحمد (المدير)',
          previousBalancePiasters: 65000,
          newBalancePiasters: 45000,
        },
        {
          id: 'pay_2',
          customerId: 'c_2',
          customerName: 'محمود عبد الرحيم الشريف',
          amountPiasters: 15000,
          paymentDate: '2026-10-03 17:30',
          notes: 'دفعة سداد حساب أسبوعي',
          cashierName: 'محمد أحمد (المدير)',
          previousBalancePiasters: 53000,
          newBalancePiasters: 38000,
        },
        {
          id: 'pay_3',
          customerId: 'c_4',
          customerName: 'إبراهيم حسن النجار',
          amountPiasters: 17000,
          paymentDate: '2026-10-01 19:15',
          notes: 'تسوية حساب شهر سبتمبر',
          cashierName: 'محمد أحمد (المدير)',
          previousBalancePiasters: 29000,
          newBalancePiasters: 12000,
        },
      ];
    }

    case 'reports:getLowStock': {
      return [
        {
          productId: 'p_3',
          name: 'سكر أبيض نقي 1 كجم',
          barcode: '622100100103',
          stockMilli: 3000,
          minStockMilli: 10000,
          suggestedOrderMilli: 15000,
          unitCostPiasters: 2600,
          estimatedCostPiasters: 39000,
          unit: 'piece',
          categoryName: 'البقالة',
        },
        {
          productId: 'p_8',
          name: 'ملح طعام يودي ناعم 300 جم',
          barcode: '622100100108',
          stockMilli: 2000,
          minStockMilli: 8000,
          suggestedOrderMilli: 12000,
          unitCostPiasters: 450,
          estimatedCostPiasters: 5400,
          unit: 'piece',
          categoryName: 'البقالة',
        },
        {
          productId: 'p_6',
          name: 'زبادي طبيعي المراعي 105 جم',
          barcode: '622100100106',
          stockMilli: 4000,
          minStockMilli: 15000,
          suggestedOrderMilli: 20000,
          unitCostPiasters: 750,
          estimatedCostPiasters: 15000,
          unit: 'piece',
          categoryName: 'الألبان',
        },
      ];
    }

    case 'reports:getDebtors': {
      return [
        {
          customerId: 'c_1',
          name: 'أحمد محمود إسماعيل',
          phone: '01012345678',
          balancePiasters: 45000,
          creditLimitPiasters: 100000,
          notes: 'عميل منتظم بالسداد الأسبوعي',
          lastTransactionDate: '2026-10-04 11:45',
        },
        {
          customerId: 'c_2',
          name: 'محمود عبد الرحيم الشريف',
          phone: '01123456789',
          balancePiasters: 38000,
          creditLimitPiasters: 50000,
          notes: 'حساب شهري',
          lastTransactionDate: '2026-10-03 17:30',
        },
        {
          customerId: 'c_4',
          name: 'إبراهيم حسن النجار',
          phone: '01555555555',
          balancePiasters: 12000,
          creditLimitPiasters: 30000,
          notes: '',
          lastTransactionDate: '2026-10-01 19:15',
        },
        {
          customerId: 'c_5',
          name: 'طارق علي بدوي',
          phone: '01099887766',
          balancePiasters: 15000,
          creditLimitPiasters: 15000,
          notes: 'متعثر لأكثر من شهرين — يجب الاتصال به',
          lastTransactionDate: '2026-06-15',
        },
      ];
    }


    case 'customers:getAll':
      return mockCustomers.filter((c: any) => !c.isArchived);

    case 'customers:archive': {
      const archiveId = typeof payload === 'string' ? payload : payload?.customerId;
      if (archiveId === 'cust_general_cash') {
        throw new Error('لا يمكن حذف العميل النقدي العام — هو حساب نظام أساسي مطلوب لتشغيل نقطة البيع');
      }
      const custToArchive = mockCustomers.find((c: any) => c.id === archiveId);
      if (custToArchive && custToArchive.balancePiasters > 0) {
        throw new Error(`لا يمكن حذف العميل "${custToArchive.name}" لأن عليه رصيد دين مستحق. يجب تسوية حسابه أولاً.`);
      }
      mockCustomers = mockCustomers.filter((c: any) => c.id !== archiveId);
      return { success: true, archivedId: archiveId };
    }

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
          'قاعدة البيانات التجريبية لحسابات الآجل تم إنشاؤها بنجاح',
          'تم إنشاء العميل وحفظ الرصيد الافتتاحي (500 ج.م)',
          'تسجيل قيد رصيد افتتاحي في دفتر الأستاذ',
          'تم حفظ الفاتورة الآجلة بإجمالي 120 ج.م',
          'تحديث رصيد دين العميل إلى 620 ج.م',
          'تخفيض دين العميل بدقة إلى 400 ج.م بعد سداد 220 ج.م',
          'استعادة رصيد العميل الأصلي 620 ج.م بعد إلغاء الدفعة بقيد معاكس',
          'تصفير حساب العميل بعد السداد الكامل',
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

    case 'audit:getLogs':
    case 'audit:list':
      return [
        {
          id: 'aud_mock_1',
          userId: 'usr_admin_default',
          userDisplayName: 'مدير النظام',
          action: 'price_update',
          actionArabic: 'تعديل سعر البيع',
          entityType: 'products',
          entityId: 'p_1',
          detailsJson: JSON.stringify({ productName: 'لبن جهينة كامل الدسم 1 لتر', oldPrice: 3800, newPrice: 4200 }),
          createdAt: new Date(Date.now() - 3600000).toISOString(),
          prevHash: 'GENESIS_RAFIQ_AUDIT_V1',
          recordHash: 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
        },
        {
          id: 'aud_mock_2',
          userId: 'usr_admin_default',
          userDisplayName: 'مدير النظام',
          action: 'sale_create',
          actionArabic: 'إصدار فاتورة بيع',
          entityType: 'sales',
          entityId: 'sale_1042',
          detailsJson: JSON.stringify({ invoiceNumber: 1042, totalPiasters: 8000, cashierName: 'كاشير (1)' }),
          createdAt: new Date().toISOString(),
          prevHash: 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
          recordHash: 'f9e8d7c6b5a4321098765432109876543210fedcba0987654321fedcba098765',
        },
      ];

    case 'audit:verifyChain':
      return {
        isValid: true,
        isTampered: false,
        totalRecordsVerified: 2,
        errorMessage: null,
      };

    case 'audit:resealChain':
      return {
        resealedCount: 2,
        verification: {
          isValid: true,
          isTampered: false,
          totalRecordsVerified: 2,
          errorMessage: null,
        },
      };

    case 'security:getDeviceFingerprint':
      return {
        deviceFingerprint: 'RAFIQ-DEV-MOCK-FINGERPRINT-8899AABB',
        isEncrypted: true,
        encryptionAlgorithm: 'AES-256-CBC + HMAC-SHA256',
      };

    case 'license:getInfo':
      return {
        isActive: true,
        licenseKey: 'RFQ-PERM-8899-A1B2',
        shopName: 'سوبرماركت رفيق',
        licenseType: 'lifetime',
        status: 'active',
        statusLabel: 'ترخيص دائم نشط (مدى الحياة)',
        deviceFingerprint: 'RAFIQ-DEV-MOCK-FINGERPRINT-8899AABB',
        activatedAt: '2026-09-26 22:37',
        expiresAt: '',
        isOfflineMode: true,
      };

    case 'license:activate': {
      const key = payload?.licenseKey || payload?.key || '';
      return {
        success: true,
        code: 'ACTIVATION_SUCCESS',
        message: 'تم تفعيل الترخيص السحابي بنجاح!',
        license: {
          isActive: true,
          licenseKey: key || 'RFQ-PERM-8899-A1B2',
          shopName: 'سوبرماركت رفيق',
          licenseType: 'lifetime',
          status: 'active',
          statusLabel: 'ترخيص دائم نشط (مدى الحياة)',
          deviceFingerprint: 'RAFIQ-DEV-MOCK-FINGERPRINT-8899AABB',
          activatedAt: new Date().toISOString(),
          expiresAt: '',
          isOfflineMode: true,
        },
      };
    }

    case 'license:verify':
      return {
        success: true,
        code: 'VERIFIED',
        message: 'الترخيص سارٍ ومعتمد لهذا الجهاز',
        license: {
          isActive: true,
          licenseKey: 'RFQ-PERM-8899-A1B2',
          shopName: 'سوبرماركت رفيق',
          licenseType: 'lifetime',
          status: 'active',
          statusLabel: 'ترخيص دائم نشط (مدى الحياة)',
          deviceFingerprint: 'RAFIQ-DEV-MOCK-FINGERPRINT-8899AABB',
          activatedAt: '2026-09-26 22:37',
          expiresAt: '',
          isOfflineMode: true,
        },
      };

    case 'license:checkExpiry':
      return {
        isActive: true,
        isExpired: false,
        status: 'active',
        statusLabel: 'ترخيص دائم نشط (مدى الحياة)',
        daysRemaining: 9999,
        expiresAt: '',
        clockTampered: false,
        clockTamperMessage: '',
        licenseType: 'lifetime',
        shopName: 'سوبرماركت رفيق',
        deviceFingerprint: 'RAFIQ-DEV-MOCK-FINGERPRINT-8899AABB',
      };

    case 'license:runTests':
      return {
        success: true,
        message: 'نجحت جميع اختبارات التحقق من انتهاء الترخيص وحماية الساعة ومنع البيع بنسبة 100%!',
        expiryDetectionPassed: true,
        clockTamperPassed: true,
        saleBlockingPassed: true,
        readWhitelistPassed: true,
        checkExpiryContractPassed: true,
      };

    case 'system:factoryReset':
      mockCustomers = [];
      return {
        success: true,
        message: 'تم مسح وتصفير كافة البيانات بنجاح، والنظام جاهز الآن كبداية نظيفة كلياً.',
        deletedSalesCount: 1,
        deletedProductsCount: 1,
        deletedCustomersCount: 1,
      };

    case 'auditLogs:create':
    case 'audit:create':
      return { success: true };

    case 'settings:getAll':
      return getMockAppSettings();

    case 'settings:save':
      return saveMockAppSettings(payload);

    case 'features:getAll':
      return getMockFeatureFlags();

    case 'features:set': {
      if (payload?.key) {
        saveMockFeatureFlag(payload.key, Boolean(payload.enabled));
      }
      return { key: payload?.key, enabled: payload?.enabled };
    }

    case 'backup:getStatus': {
      let cfg: any = {};
      try {
        const raw = localStorage.getItem('rafiq_backup_config');
        if (raw) cfg = JSON.parse(raw);
      } catch {}
      return {
        configuredFolder: cfg.targetFolder || 'C:\\RafiqPOS\\backups',
        autoOnClose: cfg.autoOnClose ?? true,
        autoDaily: cfg.autoDaily ?? true,
        retentionDays: cfg.retentionDays || 7,
        retentionWeeks: cfg.retentionWeeks || 4,
        warnAfterDays: cfg.warnAfterDays || 2,
        lastBackupAt: cfg.lastBackupAt || new Date().toISOString(),
        backupFilesCount: 3,
        totalBackupsSizeBytes: 4200000,
        isOverdue: false,
        daysSinceLastBackup: 0,
        databaseFileSizeBytes: 1500000,
      };
    }

    case 'backup:configure': {
      let existing: any = {};
      try {
        const raw = localStorage.getItem('rafiq_backup_config');
        if (raw) existing = JSON.parse(raw);
      } catch {}
      const updated = { ...existing, ...(payload || {}) };
      try {
        localStorage.setItem('rafiq_backup_config', JSON.stringify(updated));
      } catch {}
      return { success: true };
    }

    case 'backup:getDrives': {
      return [
        { name: 'C:\\', freeSpaceFormatted: '120 GB', totalSpaceFormatted: '512 GB', driveType: 'Fixed', isReady: true },
        { name: 'D:\\', freeSpaceFormatted: '450 GB', totalSpaceFormatted: '1000 GB', driveType: 'Fixed', isReady: true }
      ];
    }

    case 'products:getSmartCatalog':
      return {
        products: [
          {
            id: 'p_1',
            name: 'لبن جهينة كامل الدسم 1 لتر',
            normalizedName: 'لبن جهينه كامل الدسم 1 لتر',
            barcode: '6223001234567',
            barcodes: ['6223001234567'],
            pricePiasters: 4200,
            costPiasters: 3400,
            stockQuantityMilli: 45000,
            unit: 'piece',
            categoryName: 'ألبان ومشروبات',
            salesCount: 15,
            priceFormatted: '42.00 ج.م',
            stockFormatted: '45',
            isActive: true,
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
            unit: 'piece',
            categoryName: 'بقوليات ومعلبات',
            salesCount: 22,
            priceFormatted: '55.00 ج.م',
            stockFormatted: '12',
            isActive: true,
            units: [
              {
                id: 'u_tea_carton',
                unitName: 'كرتونة',
                conversionFactor: 24,
                isBaseUnit: false,
                sellPricePiasters: 120000,
                costPricePiasters: 100000,
                barcode: '6224005544999',
                isDivisible: false,
                sortOrder: 1,
              }
            ],
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
            unit: 'kg',
            categoryName: 'خضروات وفواكه',
            salesCount: 8,
            priceFormatted: '15.00 ج.م',
            stockFormatted: '25',
            isActive: true,
          },
          {
            id: 'p_variant_shirt',
            name: 'قميص كاجوال رجالي فاخر',
            normalizedName: 'قميص كاجوال رجالي فاخر',
            barcode: '6227008899001',
            barcodes: ['6227008899001'],
            pricePiasters: 15000,
            costPiasters: 9000,
            stockQuantityMilli: 18000,
            unit: 'piece',
            categoryName: 'ملابس',
            salesCount: 5,
            priceFormatted: '150.00 ج.م',
            stockFormatted: '18',
            isActive: true,
            hasVariants: true,
            variantsCount: 2,
          }
        ],
        customQuickItems: [],
      };

    case 'suppliers:getAll': {
      const includeInactive = Boolean(payload?.includeInactive);
      return includeInactive ? [...mockSuppliers] : mockSuppliers.filter((s: any) => s.isActive);
    }

    case 'suppliers:getById': {
      const id = typeof payload === 'string' ? payload : payload?.id;
      return mockSuppliers.find((s: any) => s.id === id) || null;
    }

    case 'suppliers:save': {
      const s = payload as any;
      if (!s.id) {
        const newSup = {
          ...s,
          id: `sup_${Date.now()}`,
          balancePiasters: s.balancePiasters || 0,
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        mockSuppliers.push(newSup);
        return newSup;
      }
      const idx = mockSuppliers.findIndex((x: any) => x.id === s.id);
      if (idx >= 0) {
        mockSuppliers[idx] = { ...mockSuppliers[idx], ...s, updatedAt: new Date().toISOString() };
        return mockSuppliers[idx];
      }
      return s;
    }

    case 'suppliers:archive': {
      const id = typeof payload === 'string' ? payload : payload?.id;
      const sup = mockSuppliers.find((s: any) => s.id === id);
      if (sup) sup.isActive = false;
      return { success: true };
    }

    case 'suppliers:restore': {
      const id = typeof payload === 'string' ? payload : payload?.id;
      const sup = mockSuppliers.find((s: any) => s.id === id);
      if (sup) sup.isActive = true;
      return { success: true };
    }

    case 'suppliers:delete': {
      const id = typeof payload === 'string' ? payload : payload?.id;
      mockSuppliers = mockSuppliers.filter((s: any) => s.id !== id);
      return { success: true };
    }

    case 'suppliers:recordPayment': {
      const { supplierId, amountPiasters, notes } = payload || {};
      const sup = mockSuppliers.find((s: any) => s.id === supplierId);
      if (sup) {
        sup.balancePiasters = Math.max(0, (sup.balancePiasters || 0) - amountPiasters);
        mockSupplierTransactions.unshift({
          id: `st_${Date.now()}`,
          supplierId,
          transactionType: 'PAYMENT',
          amountPiasters,
          notes: notes || 'سداد دفعة نقدية',
          createdAt: new Date().toISOString(),
        });
      }
      return sup;
    }

    case 'suppliers:getTransactions': {
      const supplierId = typeof payload === 'string' ? payload : payload?.supplierId;
      return mockSupplierTransactions.filter((t: any) => t.supplierId === supplierId);
    }

    case 'purchases:getAll': {
      let list = [...mockPurchases];
      if (payload?.supplierId) {
        list = list.filter((p: any) => p.supplierId === payload.supplierId);
      }
      return list;
    }

    case 'purchases:getById': {
      const id = typeof payload === 'string' ? payload : payload?.id;
      return mockPurchases.find((p: any) => p.id === id) || null;
    }

    case 'purchases:create': {
      const p = (payload?.purchase || payload) as any;
      const newPur = {
        ...p,
        id: `pur_${Date.now()}`,
        invoiceNumber: mockPurchases.length + 1001,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockPurchases.unshift(newPur);
      if (newPur.supplierId && newPur.remainingAmountPiasters > 0) {
        const sup = mockSuppliers.find((s: any) => s.id === newPur.supplierId);
        if (sup) {
          sup.balancePiasters = (sup.balancePiasters || 0) + newPur.remainingAmountPiasters;
          mockSupplierTransactions.unshift({
            id: `st_${Date.now()}`,
            supplierId: newPur.supplierId,
            transactionType: 'PURCHASE_INVOICE',
            referenceId: newPur.id,
            amountPiasters: newPur.remainingAmountPiasters,
            notes: `فاتورة شراء #${newPur.invoiceNumber}`,
            createdAt: new Date().toISOString(),
          });
        }
      }
      return newPur;
    }

    case 'variants:createMatrix': {
      const parentId = payload?.parentProductId || `parent_${Date.now()}`;
      const parentName = payload?.parentName || 'منتج متعدد التركيبات';
      const cells = payload?.matrixCells || [];
      const createdVariants: any[] = [];
      let totalStock = 0;

      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        if (!cell.isEnabled) continue;
        const vId = `var_${Date.now()}_${i}`;
        const prodId = `vprod_${Date.now()}_${i}`;
        const stock = cell.stockQuantityMilli || 0;
        totalStock += stock;
        const price = cell.pricePiasters || payload?.defaultPricePiasters || 10000;
        const cost = cell.costPiasters || payload?.defaultCostPiasters || 6000;
        const barcode = cell.barcode || `214${Math.floor(100000000 + Math.random() * 900000000)}`;

        createdVariants.push({
          id: vId,
          parentProductId: parentId,
          variantProductId: prodId,
          size: cell.size,
          color: cell.color,
          sku: cell.sku || `${parentName}-${cell.color}-${cell.size}`,
          barcode,
          pricePiasters: price,
          costPiasters: cost,
          stockQuantityMilli: stock,
          minStockQuantityMilli: cell.minStockQuantityMilli || 5000,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          priceFormatted: `${(price / 100).toFixed(2)} ج.م`,
          costFormatted: `${(cost / 100).toFixed(2)} ج.م`,
          stockFormatted: `${stock / 1000}`,
        });
      }

      return {
        parentProduct: {
          id: parentId,
          name: parentName,
          hasVariants: true,
          stockQuantityMilli: totalStock,
          pricePiasters: payload?.defaultPricePiasters || 10000,
          costPiasters: payload?.defaultCostPiasters || 6000,
        },
        variants: createdVariants,
        totalStockMilli: totalStock,
        totalVariantsCount: createdVariants.length,
      };
    }

    case 'variants:getByParentId': {
      const pId = typeof payload === 'object' && payload?.parentId ? payload.parentId : payload;
      return [
        {
          id: `var_${pId}_1`,
          parentProductId: pId,
          variantProductId: `vprod_${pId}_1`,
          size: 'M',
          color: 'أحمر',
          sku: 'SKU-RED-M',
          barcode: '214112233441',
          pricePiasters: 15000,
          costPiasters: 9000,
          stockQuantityMilli: 10000,
          minStockQuantityMilli: 2000,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          priceFormatted: '150.00 ج.م',
          costFormatted: '90.00 ج.م',
          stockFormatted: '10',
        },
        {
          id: `var_${pId}_2`,
          parentProductId: pId,
          variantProductId: `vprod_${pId}_2`,
          size: 'L',
          color: 'أزرق',
          sku: 'SKU-BLUE-L',
          barcode: '214112233442',
          pricePiasters: 15000,
          costPiasters: 9000,
          stockQuantityMilli: 8000,
          minStockQuantityMilli: 2000,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          priceFormatted: '150.00 ج.م',
          costFormatted: '90.00 ج.م',
          stockFormatted: '8',
        },
      ];
    }

    case 'variants:getParentWithVariants': {
      const pId = typeof payload === 'object' && payload?.parentId ? payload.parentId : payload;
      return {
        parentProduct: {
          id: pId,
          name: 'قميص كاجوال رجالي فاخر',
          hasVariants: true,
          stockQuantityMilli: 18000,
          pricePiasters: 15000,
          costPiasters: 9000,
        },
        variants: [
          {
            id: `var_${pId}_1`,
            parentProductId: pId,
            variantProductId: `vprod_${pId}_1`,
            size: 'M',
            color: 'أحمر',
            sku: 'SKU-RED-M',
            barcode: '214112233441',
            pricePiasters: 15000,
            costPiasters: 9000,
            stockQuantityMilli: 10000,
            minStockQuantityMilli: 2000,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            priceFormatted: '150.00 ج.م',
            costFormatted: '90.00 ج.م',
            stockFormatted: '10',
          },
          {
            id: `var_${pId}_2`,
            parentProductId: pId,
            variantProductId: `vprod_${pId}_2`,
            size: 'L',
            color: 'أزرق',
            sku: 'SKU-BLUE-L',
            barcode: '214112233442',
            pricePiasters: 15000,
            costPiasters: 9000,
            stockQuantityMilli: 8000,
            minStockQuantityMilli: 2000,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            priceFormatted: '150.00 ج.م',
            costFormatted: '90.00 ج.م',
            stockFormatted: '8',
          },
        ],
        totalStockMilli: 18000,
        totalVariantsCount: 2,
      };
    }

    case 'variants:getMatrixReport': {
      return [];
    }

    default:
      return { success: true, echoed: payload };
  }
}

const DEFAULT_APP_SETTINGS: Record<string, string> = {
  store_name: 'متجر رفيق',
  cashier_name: 'كاشير (1)',
  store_phone: '',
  store_address: 'الفرع الرئيسي',
  tax_number: '',
  receipt_header: 'أهلاً بكم في متجرنا',
  receipt_footer: 'شكراً لزيارتكم! البضاعة المباعة ترد وتستبدل خلال 14 يوماً بموجب الفاتورة.',
  allow_negative_stock: '0',
  default_customer_credit_limit_egp: '1000',
  default_printer_name: '',
  receipt_paper_width: '80mm',
  printer_auto_print: '1',
  printer_open_drawer: '0',
  scanner_speed_ms: '65',
  scanner_prefix: '',
  scanner_suffix: 'Enter',
  scanner_min_length: '3',
};

function getMockAppSettings(): Record<string, string> {
  try {
    const raw = localStorage.getItem('rafiq_app_settings');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return { ...DEFAULT_APP_SETTINGS, ...parsed };
      }
    }
  } catch {}
  return { ...DEFAULT_APP_SETTINGS };
}

function saveMockAppSettings(newSettings: Record<string, string>): Record<string, string> {
  const current = getMockAppSettings();
  const merged = { ...current, ...(newSettings || {}) };
  try {
    localStorage.setItem('rafiq_app_settings', JSON.stringify(merged));
  } catch {}
  return merged;
}

function getMockFeatureFlags(): Record<string, boolean> {
  const defaultFeatureFlags: Record<string, boolean> = {
    feature_credit_debts: true,
    feature_fast_buttons: true,
    feature_taxes: false,
    feature_scale_weight: true,
    feature_expiry_dates: false,
    feature_multi_units: false,
  };
  try {
    const stored = localStorage.getItem('rafiq_feature_flags');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === 'object') {
        return { ...defaultFeatureFlags, ...parsed };
      }
    }
  } catch {}
  return { ...defaultFeatureFlags };
}

function saveMockFeatureFlag(key: string, enabled: boolean): Record<string, boolean> {
  const flags = getMockFeatureFlags();
  flags[key] = enabled;
  try {
    localStorage.setItem('rafiq_feature_flags', JSON.stringify(flags));
  } catch {}
  return flags;
}

function getMockProtectedActions(): Record<string, boolean> {
  const defaultProtected: Record<string, boolean> = {
    settings: true,
    reports: true,
    product_edit: true,
    stock_adjust: true,
    db_recovery: true,
    discounts: false,
    users: true,
  };
  try {
    const raw = localStorage.getItem('rafiq_protected_actions');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return { ...defaultProtected, ...parsed };
      }
    }
  } catch {}
  return defaultProtected;
}

function saveMockProtectedActions(actions: Record<string, boolean>): Record<string, boolean> {
  const current = getMockProtectedActions();
  const merged = { ...current, ...(actions || {}) };
  try {
    localStorage.setItem('rafiq_protected_actions', JSON.stringify(merged));
  } catch {}
  return merged;
}

// In-memory mock security variables for browser environment
let mockPinHash: string | null = null;
let mockRecoveryCode: string | null = null;
let mockFailedAttempts = 0;
let mockLockoutUntil = 0;
let mockPinEnabled = true;
let mockIdleTimeoutMinutes = 15;
let mockUsers: UserDto[] = [
  {
    id: 'usr_admin_default',
    username: 'admin',
    displayName: 'مدير النظام',
    role: 'admin',
    isActive: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'usr_cashier_1',
    username: 'cashier1',
    displayName: 'كاشير (1)',
    role: 'cashier',
    isActive: true,
    createdAt: new Date().toISOString(),
  },
];
let mockCurrentUserId = 'usr_admin_default';

function getMockPermissionsForRole(role: string): Record<string, boolean> {
  const isAdmin = role === 'admin';
  return {
    pos: true,
    customers: true,
    products: isAdmin,
    inventory: isAdmin,
    reports: isAdmin,
    settings: isAdmin,
    users: isAdmin,
    discounts: isAdmin,
    price_edit: isAdmin,
    stock_adjust: isAdmin,
    db_recovery: isAdmin,
    refunds: isAdmin,
    cancel_sale: isAdmin,
  };
}
let mockFirstRunNeeded = typeof window !== 'undefined' ? localStorage.getItem('rafiq_first_run_completed') !== 'true' : false;
let mockDemoDataLoaded = false;
let mockDemoProductsCount = 0;
let mockDemoSalesCount = 0;
let mockDemoCustomersCount = 0;
let mockCustomers: any[] = [
  {
    id: 'cust_general_cash',
    name: 'عميل نقدي عام',
    phone: '',
    balancePiasters: 0,
    creditLimitPiasters: 0,
    createdAt: new Date().toISOString(),
  },
];

let mockLedgerEntries: any[] = [];

let mockSuppliers: any[] = [
  {
    id: 'sup_1',
    name: 'شركة النيل للمواد الغذائية والتوزيع',
    phone: '01012345678',
    companyName: 'النيل للتوزيع',
    address: 'القاهرة - العبور',
    balancePiasters: 125000,
    notes: 'مورد معتمد لمنتجات الألبان والعصائر',
    isActive: true,
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 30 * 86400000).toISOString(),
  },
  {
    id: 'sup_2',
    name: 'مؤسسة الأهرام للبقوليات والزيوت',
    phone: '01198765432',
    companyName: 'الأهرام التجارية',
    address: 'الجيزة - المنطقة الصناعية',
    balancePiasters: 0,
    notes: 'مورد البقوليات والأرز والسكر',
    isActive: true,
    createdAt: new Date(Date.now() - 60 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 60 * 86400000).toISOString(),
  },
];

let mockSupplierTransactions: any[] = [
  {
    id: 'st_1',
    supplierId: 'sup_1',
    transactionType: 'PURCHASE_INVOICE',
    referenceId: 'pur_1',
    amountPiasters: 125000,
    notes: 'فاتورة شراء آجل #1001',
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
];

let mockPurchases: any[] = [
  {
    id: 'pur_1',
    invoiceNumber: 1001,
    supplierId: 'sup_1',
    supplierName: 'شركة النيل للمواد الغذائية والتوزيع',
    supplierInvoiceNumber: 'INV-4091',
    invoiceDate: new Date(Date.now() - 2 * 86400000).toISOString(),
    totalCostPiasters: 125000,
    discountPiasters: 0,
    netCostPiasters: 125000,
    paidAmountPiasters: 0,
    remainingAmountPiasters: 125000,
    paymentStatus: 'CREDIT',
    status: 'COMPLETED',
    notes: 'بضاعة ألبان أسبوعية',
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    items: [
      {
        id: 'pi_1',
        purchaseId: 'pur_1',
        productId: 'p_1',
        productName: 'لبن جهينة كامل الدسم 1 لتر',
        barcode: '6221007011',
        quantityMilli: 25000,
        unitCostPiasters: 3200,
        totalCostPiasters: 80000,
        previousCostPiasters: 3000,
        newSellingPricePiasters: 3800,
        createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      },
      {
        id: 'pi_2',
        purchaseId: 'pur_1',
        productId: 'p_4',
        productName: 'شاي العروسة ناعم 250 جم',
        barcode: '6224001122334',
        quantityMilli: 20000,
        unitCostPiasters: 2250,
        totalCostPiasters: 45000,
        previousCostPiasters: 2000,
        newSellingPricePiasters: 2500,
        createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      },
    ],
  },
];

