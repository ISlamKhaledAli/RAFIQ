# وثيقة البناء الهندسي والسريري لميزة محرك التفاعلات الدوائية (DDI)
# Feature F-01: Drug-Drug Interactions Engine — Senior Architecture Blueprint

> **المرجع الهندسي والتنفيذي الحاكم:** هذا الملف يمثل المرجع المعماري والسريري الصارم لتنفيذ ميزة محرك التفاعلات الدوائية (Drug-Drug Interactions) لنظام "رفيق POS" في نشاط الصيدليات.
> تم إعداد هذا الملف وفق ضوابط وثيقة [`AGENTS.md`](./AGENTS.md) الصارمة (بيئة .NET 4.8 الكلاسيكية، Chromium 109، SQLite WAL، خلو تام من الإيموجي، توكنز ألوان رفيق، ومنع وسوم `<select>` الافتراضية).

---

## 1. الهوية والهدف السريري (Clinical Scope & Objectives)

### أ) المشكلة السريرية الواقعية في الصيدليات
في الصيدليات ونقاط البيع، كثير من المرضى (سواء بعلم أو بجهل، أو مع تعدد أطباء التخصصات) يطلبون أدوية متنافرة كيميائياً وحيوياً في نفس الفاتورة. صرف هذه الأدوية معاً قد يؤدي إلى:
1. **وفاة أو نزيف قاتل** (مثل مضاد التجلط مع مسكنات NSAIDs).
2. **فشل علاجي وتكرار جلطات** (مثل مثبط صفائح مع مضاد حموضة يثبط تفعيله كبدياً).
3. **تسمم دوائي وسمّية قلبية/عصبية** (مثل أدوية القلب مع أدوية اضطراب النظم أو المهدئات مع مسكنات أفيونية).
4. **فشل امتصاص كامل للمضاد الحيوي** (مثل السيبروفلوكساسين مع الكالسيوم أو الحديد أو مضادات الحموضة).

### ب) لماذا لا يكفي فحص الحساسية الحالي في رفيق؟
- **فحص الحساسية الحالي (`ClinicalAllergyAlertModal.tsx`):** يعتمد على علاقة $1 \to N$ بين مريض مسجل مسبقاً ولديه ملف حساسية وأصناف الفاتورة.
- **محرك DDI:** يفحص علاقة $N \to N$ بين أصناف السلة ذاتها ($\binom{n}{2}$ Combinations)، ويعمل مع **أي عميل حتى عملاء الصيدلية العابرين (Walk-in Cash Customers)** بدون اشتراط وجود ملف مريض، ويفحص تعدد المواد الفعالة في الصنف المركب الواحد (Combination Drugs).

---

## 2. مستويات الخطورة السريرية الثلاثة (3-Tier Clinical Severity Model)

| الدرجة | الرمز التقني | السلوك والآلية السريرية | الإجراء الإلزامي في شاشة الكاشير |
|---|---|---|---|
| **حرج / مانع صرف** | `severe` | خطر داهم يهدد الحياة (نزيف حاد، سكتة قلبية، متلازمة سيروتونين، هبوط حاد). | **إيقاف قطعي للبيع (Hard Stop).** يُعطل زر إصدار الفاتورة نهائياً. لا يُسمح بالاستمرار إلا بحذف أحد الصنفين أو بإدخال **PIN المشرف** أو امتلاك صلاحية `pharma.ddi.override`. |
| **متوسط / فصل زمني** | `moderate` | تقليل فعالية، ارتباط مخلبي يمنع الامتصاص، أو ارتفاع في البوتاسيوم. | **تنبيه إرشادي (Actionable Warning).** يشرح كيفية الفصل الزمني (مثلاً: ساعتين قبل أو 4 ساعات بعد) مع زر إقرار "فهمت الإرشاد ومتابعة البيع". |
| **طفيف / استرشادي** | `minor` | زيادة طفيفة في النعاس، جفاف حلق، أو تفاعل ذو أهمية إكلينيكية منخفضة. | **شارة توجيهية هادئة (Info Badge)** تظهر للصيدلي بدون تعطيل سرعة حركة الكاشير. |

---

## 3. المعمارية الهندسية ومسار تدفق البيانات (Architecture Pipeline)

```
[POS Cart View (React)] 
      │ (Debounced 200ms on cart change / items count >= 2)
      ▼
[IPC Bridge: invoke('ddi:checkCart', { productIds: [...] })]
      │
      ▼
[C# Dispatcher: IpcDispatcher.Pharma.cs]
      │
      ▼
[Application Service: DrugInteractionService.cs]
      ├── 1. Get Active Ingredients per Product (product_ingredients JOIN active_ingredients)
      │      Fallback: product_pharma_info.normalized_scientific_name
      ├── 2. Build Cartesian Cross Pairs: (ProdA.Ing1, ProdB.Ing2) with A != B
      └── 3. Query [DrugInteractionRepository.cs] (Indexed SQLite WAL, Sub-5ms)
                  │
                  ▼
[Return: CartInteractionCheckResult (JSON)]
      │
      ▼
[Frontend UI: DrugInteractionAlertModal.tsx]
      ├── Red / Amber Visual Cards with Clinical Details
      ├── 1-Click Action: "حذف [دواء أ] من السلة"
      ├── 1-Click Action: "حذف [دواء ب] من السلة"
      ├── 1-Click Action: "اقتراح بديل آمن" (يربط بمحرك البدائل F8)
      └── Supervisor PIN Override (لو كان الصيدلي يملك صلاحية التجاوز)
```

---

## 4. تفاصيل المكونات عبر كافة الطبقات (Implementation Details)

### أ) قاعدة البيانات (Migration 54)
**الملف:** [`desktop/Database/MigrationRunner.cs`](file:///c:/Users/khale/OneDrive/Desktop/RAFIQ/desktop/Database/MigrationRunner.cs)
- رفع رقم الإصدار: `LATEST_SUPPORTED_VERSION = 54;`
- دالة `Migrate_54(SQLiteConnection conn, SQLiteTransaction tx)`:

```sql
-- 1. إنشاء جدول التفاعلات الدوائية المرجعي
CREATE TABLE IF NOT EXISTS drug_interactions (
    id                  TEXT PRIMARY KEY,
    active_ingredient_a TEXT NOT NULL,          -- المادة الفعالة الأولى (Normalized Lowercase)
    active_ingredient_b TEXT NOT NULL,          -- المادة الفعالة الثانية (Normalized Lowercase)
    severity            TEXT NOT NULL DEFAULT 'moderate', -- 'severe' | 'moderate' | 'minor'
    mechanism_ar        TEXT NOT NULL,          -- آلية التفاعل الصيدلانية بالعربية
    clinical_risk_ar    TEXT NOT NULL,          -- الخطر السريري على المريض
    recommendation_ar   TEXT NOT NULL,          -- التوصية الطبية العملية للصيدلي
    alternative_ar      TEXT DEFAULT '',        -- البديل الآمن المقترح
    source              TEXT DEFAULT 'clinical_core', -- 'clinical_core' | 'custom' | 'excel_import'
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL
);

-- فهارس السرعة الفائقة لضمان زمن استعلام < 3ms
CREATE INDEX IF NOT EXISTS idx_ddi_ing_a ON drug_interactions(active_ingredient_a);
CREATE INDEX IF NOT EXISTS idx_ddi_ing_b ON drug_interactions(active_ingredient_b);
CREATE INDEX IF NOT EXISTS idx_ddi_severity ON drug_interactions(severity);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ddi_pairs_unique ON drug_interactions(active_ingredient_a, active_ingredient_b);
```

#### بذرة التفاعلات السريرية المضمنة (Built-in Clinical Seed - 25 تفاعلاً حرجاً):
تُدرج مباشرة في `Migrate_54` بدون الحاجة لأي إنترنت:
1. `warfarin` + `diclofenac` $\to$ severe (نزيف معدي معوي حاد، استبدال بالباراسيتامول).
2. `warfarin` + `aspirin` $\to$ severe (خطر نزيف حاد، يمنع الجمع إلا ببروتوكول قلبي صارم).
3. `warfarin` + `ciprofloxacin` $\to$ severe (تثبيط أيض الوارفارين وارتفاع INR خطير).
4. `sildenafil` + `nitroglycerin` $\to$ severe (هبوط قاتل في ضغط الدم، مانع استخدام قطعي).
5. `sildenafil` + `isosorbide dinitrate` $\to$ severe (هبوط ضغط حاد، مانع استخدام قطعي).
6. `tramadol` + `fluoxetine` $\to$ severe (متلازمة السيروتونين ونوبات تشنجية).
7. `tramadol` + `paroxetine` $\to$ severe (متلازمة السيروتونين ونوبات صرعية).
8. `clopidogrel` + `omeprazole` $\to$ severe (تثبيط تفعيل البلافيكس عبر CYP2C19، استبدال بـ Pantoprazole).
9. `clopidogrel` + `esomeprazole` $\to$ severe (تثبيط فعالية البلافيكس، استبدال بـ Pantoprazole).
10. `methotrexate` + `ibuprofen` $\to$ severe (تثبيط إخراج الميثوتريكسات وتسمم نقي العظام).
11. `methotrexate` + `diclofenac` $\to$ severe (تسمم دموي حاد للميثوتريكسات).
12. `digoxin` + `amiodarone` $\to$ severe (مضاعفة تركيز الديجوكسين وتسمم قلبي واضطراب نظم).
13. `simvastatin` + `clarithromycin` $\to$ severe (انحلال العضلات المخططة Rhabdomyolysis وفشل كلوي).
14. `atorvastatin` + `clarithromycin` $\to$ severe (خطر اعتلال عضلي حاد وفشل كلوي).
15. `ciprofloxacin` + `theophylline` $\to$ severe (تسمم الثيوفيلين وتشنجات واضطراب نظم قلبي).
16. `ciprofloxacin` + `calcium carbonate` $\to$ moderate (ارتباط مخلبي يمنع الامتصاص، فصل ساعتين على الأقل).
17. `ciprofloxacin` + `ferrous sulfate` $\to$ moderate (فشل امتصاص المضاد الحيوي، فصل 3 ساعات).
18. `levofloxacin` + `antacids` $\to$ moderate (فشل امتصاص الكينولون، فصل ساعتين).
19. `doxycycline` + `iron` $\to$ moderate (تثبيط امتصاص التتراسيكلين، فصل 3 ساعات).
20. `captopril` + `spironolactone` $\to$ moderate (ارتفاع مفرط في بوتاسيوم الدم، مراقبة البوتاسيوم).
21. `enalapril` + `potassium chloride` $\to$ moderate (خطر توقف القلب لفرط البوتاسيوم).
22. `metformin` + `contrast media` $\to$ severe (حماض لاكتيكي خطير وفشل كلوي، إيقاف الميتفورمين 48 ساعة).
23. `amiodarone` + `levofloxacin` $\to$ severe (استطالة خطيرة في موجة QT وتسرع بطيني مهدد للحياة).
24. `fluconazole` + `warfarin` $\to$ severe (ارتفاع شديد في تميع الدم ونزيف، خفض جرعة الوارفارين ومتابعة INR).
25. `metronidazole` + `alcohol / ethanol` $\to$ severe (تفاعل يشبه الديسولفيرام، قيء وهبوط حاد).

---

### ب) طبقة C# Backend

1. **النموذج (`desktop/Models/DrugInteraction.cs`):**
   - تمثيل بيانات التفاعل، ونتيجة الفحص (`CartInteractionCheckResult` و `InteractionConflictItem`).
   - خلو كامل من ميزات C# 6+ الحديثة لضمان بناء net48 الكلاسيكي.

2. **المستودع (`desktop/Repositories/DrugInteractionRepository.cs`):**
   - `CheckPairs(List<Tuple<string, string>> pairs)`: استعلام دفعة واحدة بتوليد جملة `WHERE (active_ingredient_a = @a0 AND active_ingredient_b = @b0) OR (active_ingredient_a = @b0 AND active_ingredient_b = @a0)...`.
   - `GetAll(string search, string severity, int page, int limit)`
   - `Save(DrugInteraction item, string userId)`
   - `Delete(string id, string userId)`
   - `BulkImport(List<DrugInteraction> items, string userId)`

3. **الخدمة (`desktop/Services/DrugInteractionService.cs`):**
   - `CheckCartInteractions(List<string> productIds)`:
     - جلب المواد الفعالة لكل منتج من `product_ingredients JOIN active_ingredients`.
     - إذا لم توجد، قراءة `normalized_scientific_name` من `product_pharma_info`.
     - توليد التباديل المزدوجة بين الأصناف المختلفة فقط (تجاهل صنف مع نفسه).
     - استدعاء المستودع وتجميع النتائج مع ترتيب درجات الخطورة (`severe` أولاً ثم `moderate` ثم `minor`).

4. **الربط في المحرك العام (`desktop/Services/DatabaseService.cs`):**
   - تعريف الخصائص الثابتة:
     ```csharp
     public static DrugInteractionRepository DrugInteractionRepo { get; private set; }
     public static DrugInteractionService DrugInteractions { get; private set; }
     ```
   - التهيئة داخل `Initialize()`.

5. **أوامر IPC في [`desktop/Bridge/IpcDispatcher.Pharma.cs`](file:///c:/Users/khale/OneDrive/Desktop/RAFIQ/desktop/Bridge/IpcDispatcher.Pharma.cs):**
   - إضافة المعالجات:
     - `ddi:checkCart`: استلام `productIds` والرد بنتيجة الفحص.
     - `ddi:getAll`: استعلام التفاعلات للشاشة الإدارية.
     - `ddi:save`: حفظ/تعديل تفاعل.
     - `ddi:delete`: حذف تفاعل.
     - `ddi:importFromExcel`: استيراد ملف إكسل.

---

### ج) مصفوفة الصلاحيات ومسجل الميزات (RBAC & Feature Registry)

1. **في [`desktop/Common/FeatureRegistry.cs`](file:///c:/Users/khale/OneDrive/Desktop/RAFIQ/desktop/Common/FeatureRegistry.cs):**
   ```csharp
   Register(new FeatureDefinition
   {
       Key = "feature_drug_interactions",
       NameAr = "محرك التفاعلات والتعارضات الدوائية",
       DescriptionAr = "فحص سريري لحظي لتعارض الأدوية داخل سلة البيع وتحذير الصيدلي قبل إصدار الفاتورة.",
       Category = "الصيدلية والأدوية",
       DefaultValue = false,
       Requires = new List<string> { "feature_pharmacy" },
       OwnedCommands = new List<string> { "ddi:save", "ddi:delete", "ddi:importFromExcel" },
       OwnedPermissions = new List<string> { "pharma.ddi.manage", "pharma.ddi.override" }
   });
   ```

2. **في [`desktop/Services/SecurityService.cs`](file:///c:/Users/khale/OneDrive/Desktop/RAFIQ/desktop/Services/SecurityService.cs):**
   - إضافة المفاتيح في `ALL_PERMISSIONS`:
     - `"pharma.ddi.manage"`
     - `"pharma.ddi.override"`
   - ضبط السلوك في `GetPermissionsForRole`:
     - `root`: مفعّل للكل.
     - `admin`: مفعّل للكل.
     - `cashier`: `pharma.ddi.manage = false`, `pharma.ddi.override = false` (يتطلب تفويض مشرف).

3. **في قوالب المتاجر:**
   - تفعيل `feature_drug_interactions = true` افتراضياً لقالب الصيدلية (`pharmacy`) في [`desktop/Services/StoreTemplateService.cs`](file:///c:/Users/khale/OneDrive/Desktop/RAFIQ/desktop/Services/StoreTemplateService.cs) و [`frontend/src/constants/storeTemplates.ts`](file:///c:/Users/khale/OneDrive/Desktop/RAFIQ/frontend/src/constants/storeTemplates.ts).

4. **في [`frontend/src/components/UserManagerModal.tsx`](file:///c:/Users/khale/OneDrive/Desktop/RAFIQ/frontend/src/components/UserManagerModal.tsx):**
   - إضافة عناصر الصلاحيات تحت مجموعة `pharma`:
     - ملصق: "إدارة واستيراد جدول التفاعلات الدوائية" (`pharma.ddi.manage`).
     - ملصق: "تجاوز تحذيرات التفاعلات الدوائية الحرجة" (`pharma.ddi.override`).

---

### د) واجهة المستخدم والتكامل في الكاشير (Frontend React)

1. **التعريفات البرمجية (`frontend/src/types/pharmacy.ts`):**
   - واجهات `DrugInteraction`, `InteractionConflictItem`, `CartInteractionCheckResult`.

2. **المكون السريري الجديد [`DrugInteractionAlertModal.tsx`](file:///c:/Users/khale/OneDrive/Desktop/RAFIQ/frontend/src/views/pos/DrugInteractionAlertModal.tsx):**
   - نافذة مودال فاخرة ذات ألوان محددة (`danger`, `warn`, `brand`, `surface`).
   - خالية تماماً من الإيموجي (استخدام أيقونات Lucide: `ShieldAlert`, `AlertTriangle`, `Pill`, `CheckCircle2`, `Trash2`, `RefreshCw`, `Lock`).
   - إبراز اسم الدواء الأول والثاني مع موادهما الفعالة وشرح الآلية والتوصية.
   - أزرار الإجراءات السريعة (حذف صنف 1، حذف صنف 2، استبدال بالبديل الآمن).
   - نموذج تجاوز المشرف: إدخال رمز PIN وتوثيق التجاوز.

3. **التكامل المباشر في [`frontend/src/views/PosView.tsx`](file:///c:/Users/khale/OneDrive/Desktop/RAFIQ/frontend/src/views/PosView.tsx):**
   - `useEffect` مع Debounce بمقدار 200ms يفحص سلة البيع عند تغيرها إذا كان عدد الأصناف $\ge 2$ والميزة مفعلة.
   - إيقاف عملية البيع السريع وزر الدفع (`F1`) في حالة وجود تعارض `severe` غير مُتجاوز.
   - شارة تنبيه دوائي بارزة في الشريط العلوي للسلة.

4. **شاشة إدارة جدول التفاعلات [`DrugInteractionManagerModal.tsx`](file:///c:/Users/khale/OneDrive/Desktop/RAFIQ/frontend/src/components/DrugInteractionManagerModal.tsx):**
   - فتح الشاشة من قائمة خيارات الصيدلية المتقدمة.
   - جدول تفاعلي يدعم البحث الفوري وتصفية درجات الخطورة.
   - إضافة تفاعل جديد وتعديله مع قائمة المواد الفعالة المسجلة.
   - تصدير واستيراد ملفات الإكسل المرجعية.

---

## 5. ضوابط الجودة والمطابقة المعمارية الصارمة (Strict Quality Checklist)

- [x] **توافق C# 5 / .NET 4.8:** عدم استخدام أي صياغة C# 6+ مثل (`=>` للخصائص أو `nameof` أو pattern matching).
- [x] **توافق المتصفح Chromium 109:** Vite مضبوط على `chrome109/es2020`، وعدم استخدام ميزات CSS حديثة غير مدعومة.
- [x] **منع الإيموجي نهائياً:** جميع العناصر البصرية تعتمد حصراً على `lucide-react`.
- [x] **منع `<select>` الافتراضي:** استخدام `CustomSelect` المعتمد حصراً في كافة القوائم المنسدلة.
- [x] **توكنز ألوان رفيق:** الاعتماد الصارم على `brand`, `surface`, `canvas`, `danger`, `warn`, `ink`.
- [x] **سلامة البناء المزدوج:**
  1. `npm run lint` ثم `npm run build` في `frontend` دون أي تحذير أو خطأ.
  2. بناء C# في وضعي Release و Debug (`MSBuild ... /p:Configuration=Release` و `/p:Configuration=Debug`).
  3. نسخ `frontend/dist` إلى كلا المجلدين `desktop/bin/Release/dist` و `desktop/bin/Debug/dist`.

---

## 6. السيناريوهات الذهبية للتحقق العملي (Golden Test Scenarios)

1. **سيناريو الخطر القاتل (Severe Stop):**
   - إضافة دواء يحتوي على `Warfarin` (مثل: ماريفان) + مسكن يحتوي على `Diclofenac` (مثل: فولتارين أو كتافلام).
   - النتيجة: ظهور فوري للنافذة التحذيرية باللون الأحمر، وتعطيل زر إصدار الفاتورة، وعرض توصية باستبدال المسكن بالباراسيتامول.
2. **سيناريو الفصل الزمني (Moderate Warning):**
   - إضافة مضاد حيوي يحتوي على `Ciprofloxacin` + فوار/أقراص تحتوي على `Calcium` أو مضاد حموضة.
   - النتيجة: ظهور تنبيه أصفر يشرح ضرورة الفصل الزمني لمدة ساعتين، مع السماح بإتمام البيع بعد إقرار الصيدلي.
3. **سيناريو الأمان (Clean Check):**
   - إضافة `Paracetamol` + `Amoxicillin`.
   - النتيجة: يمر البيع بسلاسة تامة دون أي إزعاج للكاشير.
4. **سيناريو حوكمة الكاشير (Permission Wall):**
   - محاولة كاشير عادي تجاوز تفاعل شديد (`severe`).
   - النتيجة: منع التجاوز والمطالبة برمز PIN للمشرف وتوثيق التجاوز في سجل التدقيق.

---

> **ملاحظة للمطورين والوكلاء:** أي خطوة برمجية في هذه الميزة يجب أن تبدأ بالرجوع لهذا الملف واستيفاء بنوده بالترتيب التنازلي للمراحل.
