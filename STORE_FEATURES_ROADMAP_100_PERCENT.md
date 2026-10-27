# خريطة الميزات الناقصة الشاملة لكافة أنواع المتاجر — نظام رفيق POS
# Rafiq POS — Complete Missing Features Roadmap (Senior Architecture Document)

> **المرجع الهندسي المحكم:** هذا الملف يمثل خريطة طريق مهندس متقدم (Senior Architect) لسد فجوات الميزات في كافة أنواع المتاجر المدعومة بنظام "رفيق".
> كل ميزة مشروحة بالتفصيل من حيث: ماهيتها، لمن تُبنى، أين تتصل، ما الجداول المطلوبة، ما أوامر IPC، ما صلاحيات RBAC، وما التبعيات لضمان عدم كسر أي شيء.

---

## الفهرس التنفيذي (Executive Index)

| # | الميزة | النشاط المستهدف | درجة الأولوية | التعقيد |
|---|---|---|---|---|
| F-01 | [محرك التفاعلات الدوائية (DDI)](#f-01-محرك-التفاعلات-الدوائية-drug-drug-interactions) | صيدليات | حرج | عالٍ |
| F-02 | [تتبع السيريال الفردي (IMEI/Serial)](#f-02-تتبع-السيريال-الفردي-imeiserial-tracking) | هواتف وإلكترونيات | حرج | عالٍ |
| F-03 | [نظام تذاكر الصيانة والإصلاح](#f-03-نظام-تذاكر-الصيانة-والإصلاح-maintenance-job-orders) | هواتف وإلكترونيات | حرج | عالٍ |
| F-04 | [إدارة الطاولات والصالة](#f-04-إدارة-الطاولات-والصالة-table-management) | مطاعم وكافيهات | حرج | متوسط |
| F-05 | [طابعة المطبخ والبار (KOT)](#f-05-طابعة-المطبخ-والبار-kitchen-order-ticket) | مطاعم وكافيهات | حرج | متوسط |
| F-06 | [تعديلات الأصناف (Item Modifiers)](#f-06-تعديلات-الأصناف-item-modifiers) | مطاعم وكافيهات | عالٍ | متوسط |
| F-07 | [إدارة الدليفري والطيارين](#f-07-إدارة-الدليفري-والطيارين-delivery-riders-management) | مطاعم وكافيهات | عالٍ | عالٍ |
| F-08 | [تحليل كسر المقاسات والمواسم](#f-08-تحليل-كسر-المقاسات-والمواسم-broken-sizes--seasonal-analytics) | ملابس وأحذية | متوسط | متوسط |
| F-09 | [نظام التصنيع والتوليفات (BOM/Recipes)](#f-09-نظام-التصنيع-والتوليفات-bomrecipes) | مخابز، عطارة، محامص | متوسط | عالٍ |
| F-10 | [البيع بالمتر والأطوال والمقايسات](#f-10-البيع-بالمتر-والأطوال-والمقايسات-linear-measurement-selling) | حدايد وبويات | متوسط | منخفض |
| F-11 | [نظام الأقساط الشهرية (Installments)](#f-11-نظام-الأقساط-الشهرية-installment-plans) | أجهزة منزلية، إلكترونيات | عالٍ | عالٍ |
| F-12 | [توافق قطع الغيار مع الموديلات (Cross-Reference)](#f-12-توافق-قطع-الغيار-مع-الموديلات-vehicle-cross-reference) | قطع غيار سيارات | متوسط | متوسط |
| F-13 | [شاشة العميل الخارجية (Pole/Customer Display)](#f-13-شاشة-العميل-الخارجية-polecustomer-display) | سوبرماركت، بقالة | منخفض | منخفض |
| F-14 | [القراءة المباشرة من كابل الميزان (RS232/USB)](#f-14-القراءة-المباشرة-من-كابل-الميزان-rs232usb-scale-direct-read) | خضار، جزارة، عطارة | متوسط | متوسط |

---

## F-01: محرك التفاعلات الدوائية (Drug-Drug Interactions)

> 📘 **الخطة المعمارية والسريرية المعتمدة والتفصيلية:** راجع وثيقة [`F01_DRUG_INTERACTIONS_PLAN.md`](./F01_DRUG_INTERACTIONS_PLAN.md) للاطلاع على البناء الهندسي الكامل والجداول وأوامر IPC وبذرة الـ 25 تفاعلاً سريرياً.

### النشاط المستهدف
صيدليات ومستحضرات تجميل (`pharmacy`)

### الوصف التفصيلي
محرك فحص سريري يعمل بالكامل أوفلاين يفحص كل زوج من الأدوية داخل سلة البيع أو الروشتة لحظة إضافة الصنف، ويقارن المواد الفعالة (Active Ingredients) للأدوية المضافة مع بعضها البعض عبر جدول تفاعلات مرجعي محلي مُضمّن في SQLite. عند اكتشاف تفاعل خطير، يُوقف عملية البيع ويُظهر للصيدلي نافذة تحذيرية بدرجة الخطورة (Severe / Moderate / Minor)، شرح الآلية بالعربية، والبديل الآمن المقترح.

### لماذا هو ناقص حالياً؟
النظام يحتوي بالفعل على فحص الحساسية السريرية (مريض ↔ مادة فعالة) في `ClinicalAllergyAlertModal.tsx`، لكنه لا يفحص التفاعلات بين الأدوية مع بعضها (دواء ↔ دواء).

### مخطط قاعدة البيانات (Migration 54)
```sql
-- جدول التفاعلات الدوائية المرجعي
CREATE TABLE IF NOT EXISTS drug_interactions (
    id              TEXT PRIMARY KEY,
    active_ingredient_a TEXT NOT NULL,   -- المادة الفعالة الأولى (normalized)
    active_ingredient_b TEXT NOT NULL,   -- المادة الفعالة الثانية (normalized)
    severity        TEXT NOT NULL DEFAULT 'moderate',  -- 'severe' | 'moderate' | 'minor'
    mechanism_ar    TEXT NOT NULL,       -- شرح الآلية بالعربي
    recommendation_ar TEXT NOT NULL,     -- التوصية للصيدلي
    alternative_ar  TEXT DEFAULT '',     -- البديل الآمن المقترح
    source          TEXT DEFAULT 'local', -- مصدر المعلومة (local / imported)
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ddi_ingredient_a ON drug_interactions(active_ingredient_a);
CREATE INDEX IF NOT EXISTS idx_ddi_ingredient_b ON drug_interactions(active_ingredient_b);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ddi_pair ON drug_interactions(active_ingredient_a, active_ingredient_b);
```

### أوامر IPC المطلوبة (Bridge Commands)
| الأمر | الوصف | الملف |
|---|---|---|
| `ddi:checkCart` | فحص كافة أزواج الأدوية في السلة وإرجاع قائمة التفاعلات | `IpcDispatcher.Pharma.cs` |
| `ddi:getAll` | استعلام قراءة: جلب كافة التفاعلات المسجلة | `IpcDispatcher.Pharma.cs` |
| `ddi:importFromExcel` | استيراد جدول تفاعلات من إكسل مرجعي | `IpcDispatcher.Pharma.cs` |
| `ddi:save` | إضافة أو تعديل تفاعل دوائي يدوياً | `IpcDispatcher.Pharma.cs` |
| `ddi:delete` | حذف تفاعل مرجعي | `IpcDispatcher.Pharma.cs` |

### مفتاح الميزة في FeatureRegistry
```csharp
Register(new FeatureDefinition {
    Key = "feature_drug_interactions",
    NameAr = "محرك التفاعلات الدوائية",
    DescriptionAr = "فحص تعارض الأدوية مع بعضها داخل سلة البيع وتحذير الصيدلي لحظة مسح الباركود.",
    Category = "الصيدلية والأدوية",
    DefaultValue = false,
    Requires = new List<string> { "feature_pharmacy" },
    OwnedCommands = new List<string> { "ddi:save", "ddi:delete", "ddi:importFromExcel" },
    OwnedPermissions = new List<string> { "pharma.ddi.manage", "pharma.ddi.override" }
});
```

### مفاتيح صلاحيات RBAC
| المفتاح | الوصف | root | admin | cashier |
|---|---|---|---|---|
| `pharma.ddi.manage` | إدارة واستيراد جدول التفاعلات | ✅ | ✅ | ❌ |
| `pharma.ddi.override` | تجاوز تحذير التفاعل الشديد وإتمام الصرف | ✅ | ✅ | ❌ |

### الملفات المطلوب إنشاؤها / تعديلها
| الملف | الإجراء | الوصف |
|---|---|---|
| `desktop/Repositories/DrugInteractionRepository.cs` | **إنشاء** | طبقة الوصول للبيانات: CRUD + فحص الأزواج |
| `desktop/Services/DrugInteractionService.cs` | **إنشاء** | منطق الفحص: استخراج المواد الفعالة من المنتجات ومقارنة الأزواج |
| `desktop/Bridge/IpcDispatcher.Pharma.cs` | **تعديل** | إضافة أوامر `ddi:*` |
| `desktop/Common/FeatureRegistry.cs` | **تعديل** | تسجيل `feature_drug_interactions` |
| `desktop/Services/SecurityService.cs` | **تعديل** | إضافة الصلاحيات في `ALL_PERMISSIONS` و `GetPermissionsForRole` |
| `desktop/Database/MigrationRunner.cs` | **تعديل** | Migration 54 |
| `frontend/src/views/pos/DrugInteractionAlertModal.tsx` | **إنشاء** | نافذة التحذير في الكاشير |
| `frontend/src/views/pos/PosView.tsx` (أو `usePosCatalog.ts`) | **تعديل** | ربط فحص DDI عند إضافة صنف للسلة |
| `frontend/src/components/DrugInteractionManagerModal.tsx` | **إنشاء** | شاشة إدارة واستيراد جدول التفاعلات |
| `frontend/src/components/UserManagerModal.tsx` | **تعديل** | إضافة الصلاحيات في `PERMISSION_GROUPS` |
| `desktop/Services/StoreTemplateService.cs` | **تعديل** | إضافة المفتاح لقالب الصيدلية |
| `frontend/src/constants/storeTemplates.ts` | **تعديل** | إضافة المفتاح لقالب الصيدلية |

### التبعيات والارتباطات
- يعتمد على `feature_pharmacy` (مفعّل أولاً).
- يقرأ حقل `active_ingredient` من جدول `pharma_drug_info` (موجود بالفعل من المحطة 13).
- يتكامل مع فحص الحساسية الحالي في `ClinicalAllergyAlertModal.tsx` — يجب أن يظهرا معاً لو تعارض الدواءين وكان المريض حساساً أيضاً.
- عند استيراد الدليل المرجعي (`feature_drug_reference`)، يمكن إثراء جدول التفاعلات تلقائياً.

### سيناريو الاختبار الذهبي
1. إضافة Warfarin + Diclofenac للسلة → تحذير `severe` مع توصية باستبدال المسكن بالباراسيتامول.
2. إضافة Ciprofloxacin + Calcium → تحذير `moderate` مع توصية بفصل المواعيد ساعتين.
3. إضافة Paracetamol + Amoxicillin → لا يوجد تفاعل، يمر بدون تحذير.

---

## F-02: تتبع السيريال الفردي (IMEI/Serial Tracking)

### النشاط المستهدف
محلات هواتف وموبايل وإلكترونيات (`phones_electronics`)

### الوصف التفصيلي
في محلات الهواتف، كل جهاز له رقم تعريف فريد عالمياً (IMEI لأجهزة المحمول، أو Serial Number للأجهزة الإلكترونية). هذا الرقم يُطبع في فاتورة البيع وكارت الضمان، ويُسجل عند الشراء من الموزع. النظام يجب أن يتتبع دخول وخروج كل جهاز فردي بالسيريال من لحظة الاستلام من المورد حتى لحظة البيع للعميل، مع ضمان عدم بيع نفس السيريال مرتين.

### لماذا هو ناقص حالياً؟
النظام يتتبع الأصناف بالكمية الإجمالية (stock_quantity_milli) أو بالتشغيلات المجمعة (product_batches). لا يوجد جدول يربط كل وحدة فردية بسيريال فريد.

### مخطط قاعدة البيانات (Migration 55)
```sql
-- جدول السيريالات الفردية
CREATE TABLE IF NOT EXISTS product_serials (
    id              TEXT PRIMARY KEY,
    product_id      TEXT NOT NULL REFERENCES products(id),
    serial_number   TEXT NOT NULL,          -- IMEI أو Serial
    serial_type     TEXT NOT NULL DEFAULT 'IMEI', -- 'IMEI' | 'SERIAL' | 'MAC'
    status          TEXT NOT NULL DEFAULT 'in_stock', -- 'in_stock' | 'sold' | 'returned' | 'defective' | 'in_maintenance'
    purchase_id     TEXT DEFAULT NULL,      -- فاتورة الشراء التي دخل بها
    sale_id         TEXT DEFAULT NULL,      -- فاتورة البيع التي خرج بها
    sale_item_id    TEXT DEFAULT NULL,      -- بند البيع المحدد
    customer_id     TEXT DEFAULT NULL,      -- العميل الذي اشتراه
    supplier_id     TEXT DEFAULT NULL,      -- المورد الذي ورّده
    warranty_months INTEGER DEFAULT 0,      -- مدة الضمان بالأشهر
    warranty_start  TEXT DEFAULT NULL,      -- تاريخ بداية الضمان (= تاريخ البيع)
    warranty_end    TEXT DEFAULT NULL,      -- تاريخ انتهاء الضمان
    color           TEXT DEFAULT '',        -- لون الجهاز
    storage_capacity TEXT DEFAULT '',       -- سعة التخزين
    notes           TEXT DEFAULT '',
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_serial_number ON product_serials(serial_number);
CREATE INDEX IF NOT EXISTS idx_serial_product ON product_serials(product_id);
CREATE INDEX IF NOT EXISTS idx_serial_status ON product_serials(status);
CREATE INDEX IF NOT EXISTS idx_serial_sale ON product_serials(sale_id);
CREATE INDEX IF NOT EXISTS idx_serial_customer ON product_serials(customer_id);
```

### أوامر IPC المطلوبة
| الأمر | الوصف |
|---|---|
| `serials:register` | تسجيل سيريال جديد عند الشراء من المورد |
| `serials:registerBulk` | تسجيل مجموعة سيريالات دفعة واحدة |
| `serials:getByProduct` | جلب كافة السيريالات لصنف معين |
| `serials:getBySerial` | بحث بالسيريال مباشرة |
| `serials:sell` | ربط السيريال بفاتورة بيع وتغيير الحالة |
| `serials:return` | إعادة السيريال للمخزون عند المرتجع |
| `serials:markDefective` | تعليم الجهاز كمعيب |
| `serials:getWarrantyStatus` | فحص حالة الضمان |

### مفتاح الميزة في FeatureRegistry
```csharp
Register(new FeatureDefinition {
    Key = "feature_serial_tracking",
    NameAr = "تتبع السيريال والـ IMEI الفردي",
    DescriptionAr = "تسجيل رقم IMEI أو السيريال لكل جهاز فردي عند الشراء والبيع مع كارت الضمان وحماية البيع المكرر.",
    Category = "المنتجات والمخزون",
    DefaultValue = false,
    OwnedCommands = new List<string> { "serials:register", "serials:registerBulk", "serials:sell", "serials:return", "serials:markDefective" },
    OwnedPermissions = new List<string> { "serials.manage", "serials.view" }
});
```

### الملفات المطلوب إنشاؤها / تعديلها
| الملف | الإجراء |
|---|---|
| `desktop/Repositories/SerialRepository.cs` | **إنشاء** |
| `desktop/Services/SerialTrackingService.cs` | **إنشاء** |
| `desktop/Bridge/IpcDispatcher.Serials.cs` | **إنشاء** |
| `desktop/Bridge/IpcDispatcher.cs` | **تعديل** — إضافة `TryDispatchSerials` |
| `desktop/Services/SaleService.cs` | **تعديل** — فحص السيريال عند البيع وتغيير حالته |
| `desktop/Repositories/PurchaseRepository.cs` | **تعديل** — تسجيل السيريالات عند الشراء |
| `desktop/Services/PrinterService.cs` | **تعديل** — طباعة السيريال في الفاتورة والضمان |
| `frontend/src/views/pos/PosView.tsx` | **تعديل** — إضافة حقل مسح السيريال عند البيع |
| `frontend/src/components/SerialRegistrationModal.tsx` | **إنشاء** — نافذة تسجيل السيريالات عند الشراء |
| `frontend/src/components/SerialWarrantyModal.tsx` | **إنشاء** — فحص حالة الضمان |
| `frontend/src/views/products/SerialInventoryTab.tsx` | **إنشاء** — تبويبة السيريالات في شاشة المنتجات |

### التبعيات والارتباطات
- يتكامل مع `SaleService.cs`: عند بيع صنف مفعّل عليه `feature_serial_tracking`، يجب إدخال السيريال إلزامياً قبل إتمام الفاتورة.
- يتكامل مع `PurchaseRepository.cs`: عند إنشاء فاتورة شراء، يفتح نافذة إدخال السيريالات تلقائياً.
- يتكامل مع `ReturnService.cs`: عند المرتجع، يعود السيريال للمخزون.
- يتكامل مع `PrinterService.cs`: طباعة رقم IMEI/Serial في الفاتورة الحرارية وكارت الضمان.
- **لا يتعارض** مع نظام التشغيلات (Batches) — يمكن للجهاز أن يكون جزءاً من تشغيلة وله سيريال فردي.

---

## F-03: نظام تذاكر الصيانة والإصلاح (Maintenance Job Orders)

### النشاط المستهدف
محلات هواتف وموبايل وإلكترونيات (`phones_electronics`)

### الوصف التفصيلي
عندما يأتي العميل بجهازه المعطل، يُفتح له "تذكرة صيانة" تسجل بيانات الجهاز والعطل المبدئي والحالة والمصنعية وقطع الغيار المستخدمة والتكلفة الإجمالية. التذكرة تمر بمراحل (استلام → فحص → إصلاح → جاهز للتسليم → مُسلّم). يُطبع إيصال استلام للعميل ويُربط بحسابه.

### مخطط قاعدة البيانات (Migration 56)
```sql
CREATE TABLE IF NOT EXISTS maintenance_tickets (
    id              TEXT PRIMARY KEY,
    ticket_number   INTEGER NOT NULL,     -- رقم تسلسلي ظاهري
    customer_id     TEXT DEFAULT NULL REFERENCES customers(id),
    customer_name   TEXT NOT NULL,
    customer_phone  TEXT NOT NULL,
    device_type     TEXT NOT NULL,         -- نوع الجهاز (iPhone 15, Samsung A55...)
    device_serial   TEXT DEFAULT '',       -- IMEI أو سيريال الجهاز
    device_color    TEXT DEFAULT '',
    device_password TEXT DEFAULT '',       -- كلمة سر الجهاز (مشفرة)
    reported_issue  TEXT NOT NULL,         -- العطل المبلّغ
    diagnosis       TEXT DEFAULT '',       -- التشخيص الفعلي للفني
    status          TEXT NOT NULL DEFAULT 'received',
    -- 'received' | 'diagnosing' | 'waiting_parts' | 'repairing' | 'ready' | 'delivered' | 'cancelled'
    technician_id   TEXT DEFAULT NULL,     -- الفني المسؤول
    technician_name TEXT DEFAULT '',
    labor_cost_piasters   INTEGER DEFAULT 0,  -- مصنعية
    parts_cost_piasters   INTEGER DEFAULT 0,  -- قطع غيار
    total_cost_piasters   INTEGER DEFAULT 0,  -- إجمالي
    deposit_piasters      INTEGER DEFAULT 0,  -- عربون مقدم
    estimated_days  INTEGER DEFAULT 1,     -- المدة التقديرية بالأيام
    received_at     TEXT NOT NULL,
    delivered_at    TEXT DEFAULT NULL,
    notes           TEXT DEFAULT '',
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_maint_status ON maintenance_tickets(status);
CREATE INDEX IF NOT EXISTS idx_maint_customer ON maintenance_tickets(customer_id);
CREATE INDEX IF NOT EXISTS idx_maint_phone ON maintenance_tickets(customer_phone);

-- قطع الغيار المستخدمة في كل تذكرة
CREATE TABLE IF NOT EXISTS maintenance_parts (
    id              TEXT PRIMARY KEY,
    ticket_id       TEXT NOT NULL REFERENCES maintenance_tickets(id),
    product_id      TEXT DEFAULT NULL REFERENCES products(id),
    part_name       TEXT NOT NULL,
    quantity_milli  INTEGER NOT NULL DEFAULT 1000,
    cost_piasters   INTEGER NOT NULL DEFAULT 0,
    sell_piasters   INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_maint_parts_ticket ON maintenance_parts(ticket_id);
```

### أوامر IPC المطلوبة
| الأمر | الوصف |
|---|---|
| `maintenance:create` | إنشاء تذكرة صيانة جديدة |
| `maintenance:update` | تحديث بيانات التذكرة |
| `maintenance:updateStatus` | تغيير حالة التذكرة |
| `maintenance:addPart` | إضافة قطعة غيار مستخدمة |
| `maintenance:removePart` | إزالة قطعة غيار |
| `maintenance:getAll` | جلب كافة التذاكر مع الفلترة |
| `maintenance:getById` | جلب تذكرة محددة |
| `maintenance:search` | بحث بالاسم أو الهاتف أو السيريال |
| `maintenance:printReceipt` | طباعة إيصال الاستلام أو التسليم |

### مفتاح الميزة في FeatureRegistry
```csharp
Register(new FeatureDefinition {
    Key = "feature_maintenance_tickets",
    NameAr = "نظام تذاكر الصيانة والإصلاح",
    DescriptionAr = "استلام أجهزة العملاء المعطلة وفتح تذاكر صيانة مع تتبع المراحل وقطع الغيار والمصنعية والتسليم.",
    Category = "الخدمات والمدفوعات",
    DefaultValue = false,
    OwnedCommands = new List<string> { "maintenance:create", "maintenance:update", "maintenance:updateStatus", "maintenance:addPart", "maintenance:removePart" },
    OwnedPermissions = new List<string> { "maintenance.manage", "maintenance.view", "maintenance.deliver" }
});
```

### الملفات المطلوب إنشاؤها
| الملف | الوصف |
|---|---|
| `desktop/Repositories/MaintenanceRepository.cs` | CRUD كامل للتذاكر وقطع الغيار |
| `desktop/Services/MaintenanceService.cs` | منطق التذاكر وتحديث المراحل وخصم القطع من المخزون |
| `desktop/Bridge/IpcDispatcher.Maintenance.cs` | أوامر الجسر |
| `frontend/src/views/MaintenanceView.tsx` | شاشة رئيسية بتبويبات الحالات |
| `frontend/src/components/MaintenanceTicketModal.tsx` | نافذة إنشاء/تعديل التذكرة |

### التبعيات
- يتكامل مع `ProductRepository.cs`: خصم كميات قطع الغيار من المخزون عند إضافتها للتذكرة.
- يتكامل مع `CustomerRepository.cs`: ربط التذكرة بحساب العميل.
- يتكامل مع `ExpenseService.cs`: المصنعية تُحسب كإيراد خدمات.
- يتكامل مع `PrinterService.cs`: طباعة إيصال استلام الجهاز.
- **يظهر كتبويب جديد** في `App.tsx` (مثل: "الصيانة") مربوط بصلاحية `maintenance.view`.

---

## F-04: إدارة الطاولات والصالة (Table Management)

### النشاط المستهدف
مطاعم وكافيهات (`cafe_restaurant`)

### الوصف التفصيلي
ربط كل طلب بطاولة محددة في الصالة، مع إمكانية تعليق الطلب على الطاولة حتى ينتهي العميل، ثم المحاسبة وإغلاق الطاولة. دعم نقل الزبائن من طاولة لأخرى ودمج طاولتين في فاتورة واحدة.

### مخطط قاعدة البيانات (Migration 57)
```sql
CREATE TABLE IF NOT EXISTS restaurant_tables (
    id              TEXT PRIMARY KEY,
    table_number    INTEGER NOT NULL,
    table_name      TEXT NOT NULL,           -- "طاولة 5" أو "كشك الشباك"
    capacity        INTEGER DEFAULT 4,       -- عدد الكراسي
    zone            TEXT DEFAULT 'indoor',   -- 'indoor' | 'outdoor' | 'vip' | 'bar'
    status          TEXT NOT NULL DEFAULT 'free', -- 'free' | 'occupied' | 'reserved' | 'dirty'
    current_held_sale_id TEXT DEFAULT NULL,   -- ربط بالفاتورة المعلقة الحالية
    display_order   INTEGER DEFAULT 0,
    is_active       INTEGER DEFAULT 1,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_table_status ON restaurant_tables(status);
```

### كيف يتكامل مع النظام الحالي؟
- **لا يحتاج جدول مبيعات جديد.** يعتمد على نظام الفواتير المعلقة الموجود بالفعل (`held_sales` في `HeldSaleRepository.cs`) — الطاولة هي "فاتورة معلقة مسماة".
- عند فتح طاولة: يُنشأ `held_sale` مربوط بالطاولة ويتغير حالة الطاولة إلى `occupied`.
- عند الضغط "محاسبة": يُسترجع الـ `held_sale` ويُحوّل لفاتورة بيع عادية عبر `SaleService.cs`.
- عند "نقل طاولة": يُغيّر `current_held_sale_id` من طاولة لأخرى.
- عند "دمج طاولات": يُجمع بنود فاتورتين معلقتين في واحدة.

### أوامر IPC المطلوبة
| الأمر | الوصف |
|---|---|
| `tables:getAll` | جلب كافة الطاولات وحالاتها |
| `tables:save` | إضافة/تعديل طاولة |
| `tables:delete` | حذف طاولة |
| `tables:open` | فتح طاولة (إنشاء held_sale مربوط) |
| `tables:transfer` | نقل الطلب من طاولة لأخرى |
| `tables:merge` | دمج طاولتين |
| `tables:close` | محاسبة وإغلاق الطاولة |

### مفتاح الميزة
```csharp
Key = "feature_table_management"
Requires = new List<string> { "feature_fast_buttons" }
```

---

## F-05: طابعة المطبخ والبار (Kitchen Order Ticket)

### النشاط المستهدف
مطاعم وكافيهات (`cafe_restaurant`)

### الوصف التفصيلي
عند تأكيد الطلب، يُرسل تلقائياً ملخص بنود الأكل لطابعة المطبخ، وبنود المشروبات لطابعة البار. كل بند يظهر بخط كبير واضح مع رقم الطاولة واسم الويتر. هذا يُسمى KOT (Kitchen Order Ticket).

### التنفيذ التقني
- **لا يحتاج جدول جديد** — يعتمد على بيانات الفاتورة نفسها.
- يحتاج إعدادات جديدة في `settings`:
  - `kitchen_printer_name`: اسم طابعة المطبخ.
  - `bar_printer_name`: اسم طابعة البار.
  - `kot_categories_kitchen`: أقسام الأكل (CSV من أرقام الأقسام).
  - `kot_categories_bar`: أقسام المشروبات.
- يحتاج دالة جديدة في `PrinterService.cs`: `PrintKitchenOrder(...)` تفصل البنود حسب القسم وتطبعها على الطابعة المناسبة.

### أوامر IPC
| الأمر | الوصف |
|---|---|
| `printer:printKOT` | طباعة أمر المطبخ/البار |
| `settings:getKOTConfig` | جلب إعدادات الطابعات |

### مفتاح الميزة
```csharp
Key = "feature_kitchen_printer"
Requires = new List<string> { "feature_table_management" }
```

---

## F-06: تعديلات الأصناف (Item Modifiers)

### النشاط المستهدف
مطاعم وكافيهات (`cafe_restaurant`)

### الوصف التفصيلي
تعديلات اختيارية تُضاف على الصنف أثناء البيع (مثل: "بدون مايونيز"، "إضافة جبنة +5 ج.م."، "سكر خفيف"، "وسط"). بعض التعديلات مجانية (تفضيلات) وبعضها بسعر إضافي (إضافات).

### مخطط قاعدة البيانات (Migration 58)
```sql
-- مجموعات التعديلات
CREATE TABLE IF NOT EXISTS modifier_groups (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,          -- "درجة السكر" أو "الإضافات"
    selection_type  TEXT DEFAULT 'single',  -- 'single' | 'multiple'
    is_required     INTEGER DEFAULT 0,      -- إجباري أم اختياري
    display_order   INTEGER DEFAULT 0,
    is_active       INTEGER DEFAULT 1,
    created_at      TEXT NOT NULL
);

-- خيارات التعديل
CREATE TABLE IF NOT EXISTS modifier_options (
    id              TEXT PRIMARY KEY,
    group_id        TEXT NOT NULL REFERENCES modifier_groups(id),
    name            TEXT NOT NULL,          -- "بدون سكر" أو "إضافة جبنة"
    extra_price_piasters INTEGER DEFAULT 0, -- السعر الإضافي
    display_order   INTEGER DEFAULT 0,
    is_active       INTEGER DEFAULT 1,
    created_at      TEXT NOT NULL
);

-- ربط المجموعات بالأصناف
CREATE TABLE IF NOT EXISTS product_modifier_groups (
    id              TEXT PRIMARY KEY,
    product_id      TEXT NOT NULL REFERENCES products(id),
    group_id        TEXT NOT NULL REFERENCES modifier_groups(id),
    display_order   INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_pmg_product ON product_modifier_groups(product_id);

-- التعديلات المطبقة على بنود البيع الفعلية
CREATE TABLE IF NOT EXISTS sale_item_modifiers (
    id              TEXT PRIMARY KEY,
    sale_item_id    TEXT NOT NULL,
    modifier_option_id TEXT NOT NULL REFERENCES modifier_options(id),
    option_name     TEXT NOT NULL,
    extra_price_piasters INTEGER DEFAULT 0,
    created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sim_sale_item ON sale_item_modifiers(sale_item_id);
```

### التبعيات
- يتكامل مع `SaleService.cs`: إجمالي بند البيع = سعر الصنف + مجموع أسعار التعديلات المختارة.
- يتكامل مع `PrinterService.cs`: طباعة التعديلات تحت اسم الصنف في الفاتورة و KOT.
- يتكامل مع `PosView.tsx`: عند إضافة صنف له مجموعات تعديل، تظهر نافذة اختيار التعديلات.

### مفتاح الميزة
```csharp
Key = "feature_item_modifiers"
```

---

## F-07: إدارة الدليفري والطيارين (Delivery Riders Management)

### النشاط المستهدف
مطاعم وكافيهات (`cafe_restaurant`)

### الوصف التفصيلي
تسجيل عناوين التوصيل للعملاء، ربط كل طلب بعامل توصيل (طيار)، تتبع نقدية كل طيار، وحساب رسوم التوصيل. الطيار يُسلّم نقديته في نهاية الوردية مثل الكاشير.

### مخطط قاعدة البيانات (Migration 59)
```sql
CREATE TABLE IF NOT EXISTS delivery_riders (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    phone           TEXT DEFAULT '',
    is_active       INTEGER DEFAULT 1,
    created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS delivery_orders (
    id              TEXT PRIMARY KEY,
    sale_id         TEXT NOT NULL,
    rider_id        TEXT DEFAULT NULL REFERENCES delivery_riders(id),
    customer_address TEXT DEFAULT '',
    delivery_fee_piasters INTEGER DEFAULT 0,
    status          TEXT DEFAULT 'pending', -- 'pending' | 'assigned' | 'on_way' | 'delivered' | 'cancelled'
    rider_collected_piasters INTEGER DEFAULT 0, -- المبلغ المحصّل من الطيار
    is_settled      INTEGER DEFAULT 0,      -- تم تسوية نقدية الطيار
    created_at      TEXT NOT NULL,
    delivered_at    TEXT DEFAULT NULL
);
CREATE INDEX IF NOT EXISTS idx_dord_rider ON delivery_orders(rider_id);
CREATE INDEX IF NOT EXISTS idx_dord_status ON delivery_orders(status);
```

### مفتاح الميزة
```csharp
Key = "feature_delivery_management"
```

---

## F-08: تحليل كسر المقاسات والمواسم (Broken Sizes & Seasonal Analytics)

### النشاط المستهدف
ملابس وأحذية وأزياء (`clothing_apparel`)

### الوصف التفصيلي
تقرير تحليلي يكشف المقاسات/الألوان الراكدة مقابل المطلوبة في كل موديل، مع تصنيف الموديلات حسب الموسم (صيفي/شتوي/دائم) ونسبة البيع لكل موسم. يساعد صاحب المحل في قرارات إعادة التوريد (أي مقاسات يطلب أكثر وأي ألوان يتوقف عنها).

### التنفيذ التقني
- **لا يحتاج جداول جديدة** — يقرأ من `products` و `product_variants` و `sale_items` الموجودين بالفعل.
- يحتاج حقل جديد في `products`: `season TEXT DEFAULT 'all_year'` (migration إضافة عمود).
- يحتاج تقرير جديد في `ReportsService.cs`: `GetBrokenSizesReport(...)`.
- يحتاج شاشة تقرير في الواجهة: `BrokenSizesReportModal.tsx`.

### مفتاح الميزة
```csharp
Key = "feature_size_analytics"
Requires = new List<string> { "feature_matrix_variants" }
```

---

## F-09: نظام التصنيع والتوليفات (BOM/Recipes)

### النشاط المستهدف
مخابز (`dairy_bakery`)، عطارة ومحامص (`spices_roastery`)، مطاعم (`cafe_restaurant`)

### الوصف التفصيلي
تعريف "وصفة تصنيع" لكل منتج مُصنّع (خبز بلدي، توليفة بن مميزة، ساندوتش شاورما) تتكون من قائمة مواد خام بكمياتها. عند تسجيل إنتاج دفعة، يُخصم المواد الخام تلقائياً من المخزون ويُضاف المنتج النهائي.

### مخطط قاعدة البيانات (Migration 60)
```sql
-- وصفات التصنيع
CREATE TABLE IF NOT EXISTS recipes (
    id              TEXT PRIMARY KEY,
    product_id      TEXT NOT NULL REFERENCES products(id), -- المنتج النهائي
    name            TEXT NOT NULL,
    yield_quantity_milli INTEGER NOT NULL DEFAULT 1000, -- الناتج بالمللي
    notes           TEXT DEFAULT '',
    is_active       INTEGER DEFAULT 1,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_recipe_product ON recipes(product_id);

-- مكونات الوصفة (BOM)
CREATE TABLE IF NOT EXISTS recipe_ingredients (
    id              TEXT PRIMARY KEY,
    recipe_id       TEXT NOT NULL REFERENCES recipes(id),
    ingredient_product_id TEXT NOT NULL REFERENCES products(id), -- صنف المادة الخام
    quantity_milli  INTEGER NOT NULL,  -- الكمية المطلوبة بالمللي
    notes           TEXT DEFAULT '',
    created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_recipe_ing_recipe ON recipe_ingredients(recipe_id);

-- سجل دفعات الإنتاج
CREATE TABLE IF NOT EXISTS production_batches (
    id              TEXT PRIMARY KEY,
    recipe_id       TEXT NOT NULL REFERENCES recipes(id),
    multiplier      INTEGER NOT NULL DEFAULT 1, -- عدد مرات الوصفة (×2 = ضعف الكمية)
    produced_quantity_milli INTEGER NOT NULL,
    produced_by     TEXT DEFAULT '',
    notes           TEXT DEFAULT '',
    created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_prod_batch_recipe ON production_batches(recipe_id);
```

### أوامر IPC المطلوبة
| الأمر | الوصف |
|---|---|
| `recipes:save` | إنشاء/تعديل وصفة |
| `recipes:delete` | حذف وصفة |
| `recipes:getAll` | جلب كافة الوصفات |
| `recipes:produce` | تنفيذ دفعة إنتاج (خصم المواد + إضافة المنتج) |
| `recipes:getProductionLog` | سجل دفعات الإنتاج |

### مفتاح الميزة
```csharp
Key = "feature_manufacturing_recipes"
```

### التبعيات
- يتكامل مع `StockMovementRepository.cs`: تسجيل حركة خصم `PRODUCTION_CONSUMED` وحركة إضافة `PRODUCTION_OUTPUT`.
- عند تنفيذ دفعة إنتاج، يُفحص المخزون الكافي لكافة المكونات أولاً داخل `Transaction` ذرية.

---

## F-10: البيع بالمتر والأطوال والمقايسات (Linear Measurement Selling)

### النشاط المستهدف
حدايد وبويات وسباكة (`hardware_paint`)

### الوصف التفصيلي
بيع الأسلاك والمواسير والأقمشة والخراطيم بالمتر الطولي بدلاً من القطعة أو الكيلو. إدخال الطول المطلوب ومضاعفته في سعر المتر. المخزون يُتابع بالسنتيمتر (مثلما يُتابع الوزن بالمللي جرام حالياً).

### التنفيذ التقني
- **لا يحتاج جداول جديدة** — النظام بالفعل يستخدم `stock_quantity_milli` بالأعداد الصحيحة.
- يحتاج إضافة وحدة جديدة `meter` في قائمة الوحدات المدعومة، حيث `1000 milli = 1 meter`.
- يحتاج تعديل `WeightInputModal.tsx` لتدعم إدخال الطول بالمتر والسنتيمتر.
- يحتاج تعديل الفاتورة لتطبع "3.5 متر × 12.50 ج.م. = 43.75 ج.م.".

### مفتاح الميزة
```csharp
Key = "feature_linear_selling"
```

---

## F-11: نظام الأقساط الشهرية (Installment Plans)

### النشاط المستهدف
أجهزة منزلية، إلكترونيات (`phones_electronics`)، أي نشاط يبيع بالتقسيط

### الوصف التفصيلي
بيع الأجهزة بالتقسيط على أشهر محددة مع مقدم (Down Payment) وأقساط شهرية ثابتة أو بفائدة. تتبع الأقساط المسددة والمتأخرة والقسط القادم مع تنبيهات التحصيل.

### مخطط قاعدة البيانات (Migration 61)
```sql
CREATE TABLE IF NOT EXISTS installment_plans (
    id              TEXT PRIMARY KEY,
    sale_id         TEXT NOT NULL,
    customer_id     TEXT NOT NULL REFERENCES customers(id),
    total_amount_piasters    INTEGER NOT NULL, -- إجمالي المبلغ
    down_payment_piasters    INTEGER NOT NULL DEFAULT 0,
    remaining_piasters       INTEGER NOT NULL, -- المتبقي
    num_installments         INTEGER NOT NULL, -- عدد الأقساط
    installment_amount_piasters INTEGER NOT NULL, -- قيمة القسط الشهري
    interest_bps             INTEGER DEFAULT 0,  -- نسبة الفائدة بنقاط الأساس
    start_date      TEXT NOT NULL,
    status          TEXT DEFAULT 'active', -- 'active' | 'completed' | 'defaulted'
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_inst_customer ON installment_plans(customer_id);
CREATE INDEX IF NOT EXISTS idx_inst_status ON installment_plans(status);

CREATE TABLE IF NOT EXISTS installment_payments (
    id              TEXT PRIMARY KEY,
    plan_id         TEXT NOT NULL REFERENCES installment_plans(id),
    installment_number INTEGER NOT NULL,
    due_date        TEXT NOT NULL,
    amount_piasters INTEGER NOT NULL,
    paid_piasters   INTEGER DEFAULT 0,
    paid_at         TEXT DEFAULT NULL,
    status          TEXT DEFAULT 'pending', -- 'pending' | 'paid' | 'late' | 'partial'
    payment_method  TEXT DEFAULT 'cash',
    notes           TEXT DEFAULT '',
    created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_inst_pay_plan ON installment_payments(plan_id);
CREATE INDEX IF NOT EXISTS idx_inst_pay_due ON installment_payments(due_date);
CREATE INDEX IF NOT EXISTS idx_inst_pay_status ON installment_payments(status);
```

### مفتاح الميزة
```csharp
Key = "feature_installments"
Requires = new List<string> { "feature_credit_debts" }
```

### التبعيات
- يتكامل مع `CustomerRepository.cs`: رصيد العميل يشمل الأقساط المتبقية.
- يتكامل مع `DashboardView.tsx`: تنبيهات الأقساط المستحقة والمتأخرة.
- يتكامل مع `DailyClosingService.cs`: تقرير الأقساط المحصلة اليوم.
- **المبالغ كلها بالقروش (piasters)** وبأعداد صحيحة وفقاً للقاعدة 1.

---

## F-12: توافق قطع الغيار مع الموديلات (Vehicle Cross-Reference)

### النشاط المستهدف
قطع غيار سيارات وموتوسيكلات

### الوصف التفصيلي
ربط كل قطعة غيار بموديلات السيارات المتوافقة معها (مثلاً: فلتر زيت X يناسب تويوتا كورولا 2018-2023 وهيونداي إلنترا 2020+). عند البحث "فلتر زيت كورولا 2020"، يظهر الصنف مباشرة.

### مخطط قاعدة البيانات (Migration 62)
```sql
CREATE TABLE IF NOT EXISTS vehicle_models (
    id              TEXT PRIMARY KEY,
    make            TEXT NOT NULL,     -- الشركة: تويوتا، هيونداي
    model           TEXT NOT NULL,     -- الموديل: كورولا، لانسر
    year_from       INTEGER DEFAULT 0, -- من سنة
    year_to         INTEGER DEFAULT 9999, -- لسنة
    created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vehicle_make ON vehicle_models(make);

CREATE TABLE IF NOT EXISTS product_vehicle_compatibility (
    id              TEXT PRIMARY KEY,
    product_id      TEXT NOT NULL REFERENCES products(id),
    vehicle_model_id TEXT NOT NULL REFERENCES vehicle_models(id),
    notes           TEXT DEFAULT '',
    created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pvc_product ON product_vehicle_compatibility(product_id);
CREATE INDEX IF NOT EXISTS idx_pvc_vehicle ON product_vehicle_compatibility(vehicle_model_id);
```

### مفتاح الميزة
```csharp
Key = "feature_vehicle_compatibility"
```

---

## F-13: شاشة العميل الخارجية (Pole/Customer Display)

### النشاط المستهدف
سوبرماركت، بقالة (`supermarket`, `general_grocery`)

### الوصف التفصيلي
إرسال اسم الصنف وسعره وإجمالي الفاتورة لشاشة عرض خارجية صغيرة (Pole Display) موصلة بمنفذ COM/USB حتى يراها الزبون.

### التنفيذ التقني
- يحتاج خدمة جديدة `CustomerDisplayService.cs` في C# تتصل بالشاشة عبر `System.IO.Ports.SerialPort` (.NET 4.8 يدعمها).
- بروتوكولات الشاشات الشائعة: ESC/POS أو أوامر VFD القياسية.
- يحتاج إعداد في Settings: `customer_display_port` (مثل COM3) و `customer_display_model`.
- عند مسح كل باركود في `PosView.tsx`، يُرسل أمر IPC `display:showItem` لتحديث الشاشة.

### مفتاح الميزة
```csharp
Key = "feature_customer_display"
```

---

## F-14: القراءة المباشرة من كابل الميزان (RS232/USB Scale Direct Read)

### النشاط المستهدف
خضار وجزارة (`produce_butchery`)، عطارة (`spices_roastery`)

### الوصف التفصيلي
قراءة الوزن مباشرة من الميزان الإلكتروني الموصول بمنفذ RS232/USB/COM دون الحاجة لطباعة باركود ورقي. الصيدلي أو الكاشير يضع البضاعة على الميزان ويضغط زر "قراءة الوزن" فيُسحب الوزن فوراً.

### التنفيذ التقني
- يحتاج خدمة `ScaleReaderService.cs` في C# تتصل عبر `SerialPort` وتقرأ بروتوكول الميزان (معظم الموازين المصرية تستخدم بروتوكول Toledo/CAS البسيط).
- يحتاج إعداد: `scale_port`, `scale_baud_rate`, `scale_protocol`.
- أمر IPC: `scale:readWeight` يُرجع الوزن بالجرام.
- يتكامل مع `WeightInputModal.tsx`: زر "قراءة من الميزان" بدلاً من الإدخال اليدوي.

### مفتاح الميزة
```csharp
Key = "feature_direct_scale_read"
Requires = new List<string> { "feature_scale_weight" }
```

---

## ملاحظات هندسية عامة ملزمة لكافة الميزات

### 1. الترتيب الإلزامي للتنفيذ
- **يُمنع** بناء أي ميزة جديدة قبل إنهاء كافة مهام المحطة 13 الحالية.
- الترتيب المقترح بعد المحطة 13: F-01 → F-02 → F-03 → F-04 → F-05 → F-06 (يُنصح بتجميع ميزات نفس النشاط معاً).

### 2. المعمارية الموحدة لكل ميزة
```
[Migration في MigrationRunner.cs]
   → [Repository جديد أو تعديل]
      → [Service جديد أو تعديل]
         → [IpcDispatcher.*.cs جديد أو تعديل]
            → [FeatureRegistry تسجيل المفتاح]
               → [SecurityService صلاحيات RBAC]
                  → [React Component / View]
                     → [UserManagerModal إضافة الصلاحيات]
                        → [StoreTemplateService + storeTemplates.ts تحديث القالب]
                           → [App.tsx ربط التبويب بالصلاحية]
```

### 3. القواعد الحاكمة من AGENTS.md
- كل المبالغ بالقروش (`piasters`) كأعداد صحيحة — **ممنوع `float` / `double`**.
- كل عملية كتابة داخل `Transaction` ذرية مع `Rollback` عند الخطأ.
- كل ميزة تُسجل في `FeatureRegistry` و `SecurityService` و `UserManagerModal`.
- **صفر إيموجي** — أيقونات Lucide SVG فقط.
- **صفر `<select>` افتراضي** — `CustomSelect` فقط.
- الألوان من التوكنز المحددة في `tailwind.config.js` فقط.
- بناء Release + Debug + نسخ `dist` إلزامي قبل التسليم.
- فحص `npm run lint` و `MSBuild` بصفر أخطاء وتحذيرات.

### 4. التقدير الزمني الإجمالي
| الميزة | التعقيد | التقدير (قصص) |
|---|---|---|
| F-01 DDI | عالٍ | 2 قصص (8-10 تاسكات) |
| F-02 Serial | عالٍ | 2 قصص (10-12 تاسك) |
| F-03 Maintenance | عالٍ | 2 قصص (10-12 تاسك) |
| F-04 Tables | متوسط | 1 قصة (6-8 تاسكات) |
| F-05 KOT | متوسط | 1 قصة (4-5 تاسكات) |
| F-06 Modifiers | متوسط | 1 قصة (6-8 تاسكات) |
| F-07 Delivery | عالٍ | 2 قصص (8-10 تاسكات) |
| F-08 Size Analytics | متوسط | 1 قصة (4-5 تاسكات) |
| F-09 Recipes/BOM | عالٍ | 2 قصص (8-10 تاسكات) |
| F-10 Linear Selling | منخفض | 1 قصة (3-4 تاسكات) |
| F-11 Installments | عالٍ | 2 قصص (10-12 تاسك) |
| F-12 Vehicle Cross-Ref | متوسط | 1 قصة (5-6 تاسكات) |
| F-13 Pole Display | منخفض | 1 قصة (3-4 تاسكات) |
| F-14 Direct Scale | متوسط | 1 قصة (4-5 تاسكات) |
| **الإجمالي** | | **~20 قصة (~110 تاسك)** |

---

> **هذا الملف يُحدّث مع كل تقدم في التنفيذ. كل ميزة مكتملة يُشار إليها بـ `[x]` في `PROJECT_BACKLOG.md`.**
