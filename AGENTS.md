# دليل وإرشادات وكلاء ومطوري الذكاء الاصطناعي لمشروع رفيق (Rafiq POS)

> **وثيقة معمارية ملزمة:** هذا الملف يمثل المرجع الهندسي الأعلى لجميع وكلاء ومطوري الذكاء الاصطناعي (AI Coding Agents) العاملين على مشروع **"رفيق - Rafiq POS"**.
> يُمنع منعاً باتاً خرق أي بند من هذه الإرشادات لتفادي التخريف (Hallucinations)، وكسر التوافقية، وفقدان البيانات في بيئة المتاجر ونقاط البيع الواقعية.

---

## 1. هوية المشروع والهدف الأساسي
- **اسم النظام:** رفيق لنقاط البيع وإدارة المتاجر ومحلات التجزئة (Rafiq POS).
- **البيئة المستهدفة:** برنامج سطح مكتب أوفلاين (Offline-First Desktop App).
- **الشرط الحرج الأهم:** العمل المستقر بنسخة تثبيت واحدة على أنظمة **Windows 7 SP1 (32-bit & 64-bit)** وحتى **Windows 11**، بدون إنترنت نهائياً، مع استهلاك رام اقتصادي (< 250MB) وسرعة استجابة فائقة على أجهزة المحلات المتواضعة.

---

## 2. القيود التقنية الصارمة (Strict Technical Constraints)

### أ) مضيف النظام والبنية التحتية (C# Host)
1. **إصدار الدوت نت وبناء المشروع:**
   - الإبقاء دائماً على **.NET Framework 4.8** (`net48`). يُمنع ترقية المشروع إلى .NET Core 5/6/7/8 داخل مجلد `desktop` لضمان دعم Windows 7 SP1.
   - **توافقية لغة C#:** أدوات بناء النظام القديمة في بيئة ويندوز 7 تعتمد على مترجم C# 5؛ لذا يُمنع استخدام ميزات C# 6+ مثل (`=>` للخصائص، أو `nameof(...)`، أو C# 7 pattern matching مثل `is Type var`). استخدم الصياغة الكلاسيكية المضمونة (`as`، `get { return ...; }`).
2. **محرك الويب (WebView2):**
   - إصدار حزمة NuGet لا يتعدى `1.0.1518.46`.
   - كشف بيئة النظام تلقائياً: استخدام **Fixed Runtime 109** لويندوز 7 و8، ومحرك **Evergreen** لويندوز 10 و11.
3. **قاعدة البيانات (SQLite):**
   - استخدام حزمة `Stub.System.Data.SQLite.Core.NetFramework` الثابتة التي لا تتطلب تثبيت VC++ Redistributable إضافية.
   - تفعيل وضع **WAL (Write-Ahead Logging)** دائماً:
     ```sql
     PRAGMA journal_mode = WAL;
     PRAGMA synchronous = FULL;
     PRAGMA foreign_keys = ON;
     PRAGMA busy_timeout = 5000;
     ```
   - **سبب `synchronous = FULL` (قرار المالك):** مع WAL يضمن FULL مزامنة ملف الـ WAL على القرص عند كل Commit، فلا تضيع فاتورة مؤكدة عند انقطاع الكهرباء المفاجئ (NORMAL قد يفقد آخر معاملات بعد الـ Commit). يُطبق على كل اتصالات التطبيق بما فيها الترحيل؛ ممنوع خفضه إلى NORMAL.
   - حفظ ملف قاعدة البيانات وملفات الـ WebView profile دائماً في:
     `%ProgramData%\RafiqPOS\data\rafiq_pos.db` في بيئة الإنتاج، لتجنب مشاكل صلاحيات ويندوز 7 (UAC).
4. **كشف بيئة ويندوز بدقة وعزل الأخطاء (Accurate OS Detection & Error Isolation):**
   - ملف `app.manifest` إلزامي لمشروع C# لتعريف التوافقية حتى ويندوز 11 ومنع ويندوز من إرجاع محاكاة قديمة (`NT 6.2`).
   - الاعتماد على `OsDetector` لفحص رقم البناء (`CurrentBuild`) لتمييز ويندوز 11 (Build >= 22000) وويندوز 10 عن ويندوز 7 و 8 بدقة متناهية.
   - **عزل الأخطاء:** يُمنع دمج أخطاء قاعدة البيانات أو الملفات مع رسائل مشغّل الويب. لكل نظام فرعي معالجة أخطاء مستقلة برسالة عربية دقيقة ترشد لحل المشكلة الفعلية.

### ب) واجهة المستخدم (React Frontend)
1. **هدف البناء والتوافق (Build Target):** ضبط Vite على `chrome109` / `es2020`. يُمنع استخدام أي ميزات JavaScript حديثة أو CSS نزلت بعد Chromium 109.
2. **تنسيقات CSS:** استخدام Tailwind CSS v3.4 فقط أو Vanilla CSS. ممنوع استخدام Tailwind v4 لأنه يتطلب Chromium 111+.
3. **الخطوط والأصول:** جميع الخطوط العربية (Cairo / Tajawal) والأيقونات مدمجة محلياً (Self-hosted) في مجلد المشروع، ولا يتم طلب أي ملف عبر الإنترنت أو CDN خارجي.
4. **أحجام الشاشات:** تصميم الشاشات لتعمل بكفاءة على دقة **1024×768** و **1366×768** بدون أي تمرير أفقي (Horizontal Scroll).
5. **المرجع البصري المعتمد للتصاميم (UI Design Benchmark):**
   - المرجع الشامل لكافة شاشات النظام هو مجلد `stitch_rafeeq_pos_system_ui_design/` الموثق والمفهرس في [`UI_DESIGN_CATALOG.md`](./UI_DESIGN_CATALOG.md).
   - **إلزام قطعي قبل بناء أي شاشة:** يجب على الوكيل/المطور فتح المجلد المخصص للشاشة في `stitch_rafeeq_pos_system_ui_design/` وفحص ملف `code.html` والصورة `screen.png` لمعرفة التوزيع، الأزرار، الأبعاد، وتجربة الاستخدام، واستخراج وتطوير التصميم في React ليكون أنظف وأدق ومربوطاً بـ SQLite.
   - في حالة عدم وجود شاشة معينة في الكتالوج، يتم تطبيق نفس الهوية البصرية الصارمة (باليت الأخضر Forest `#00372d`، الزمردي `#006d41`، السطح `#f7fafc`، الكروت `#ebeef1`، والخطوط العربية المدمجة).
6. **انضباط Git ومنع الرفع العشوائي:** يُمنع تماماً تنفيذ `git commit` أو `git push` تلقائياً أو عشوائياً بدون طلب صريح أو إنجاز محطة مكتملة ومختبرة بنسبة 100%. مجلد التصاميم `stitch_rafeeq_pos_system_ui_design/` والملفات المؤقتة مستبعدة تماماً في `.gitignore`.

---

## 3. القواعد البرمجية الصارمة (Senior Engineering Invariants)

### 🔴 القاعدة 1: الأمان المالي المطلق (Integer Financial Arithmetic)
- **ممنوع منعاً باتاً استخدام `float` أو `double` في أي عملية حسابية مالية أو تخزين للمبالغ.**
- تُحسب وتُخزّن جميع الأسعار والمبالغ والضرائب والخصومات **بالقروش (Piasters)** كأعداد صحيحة (`long` في C#، و `number` كأعداد صحيحة مقربة في TS/JS عبر فئة `Money`).
- التحويل للجنيه (`amount / 100.0`) يتم **فقط وحصرياً في شاشة العرض النهائية للمستخدم**، ولا يدخل في أي حسابات تراكمية.
- الأوزان والكميات تُخزّن بالمليجرام أو بالألف (milli-units كأعداد صحيحة).

### 🔴 القاعدة 2: حماية البيانات والمعاملات الذرية (ACID Transactions)
- أي عملية بيع، خصم مخزن، سداد آجل، أو ترحيل مالي يجب أن تنفذ بالكامل داخل **معاملة ذرية واحدة (`conn.BeginTransaction()`)**.
- في حالة حدوث أي استثناء، يتم استدعاء `Rollback` تلقائياً لحماية قاعدة البيانات من التلف عند انقطاع الكهرباء الفجائي.
- **ممنوع الحذف المادي (Hard Delete) للفواتير وحركات المخزون:** التصحيح يتم دائماً بقيد معاكس (Contra Entry) مع ذكر السبب والمستخدم والتاريخ.

### 🔴 القاعدة 3: المعمارية النظيفة وفصل الطبقات (Clean Architecture)
```
[React UI] 
   └── [Typed IPC Bridge (invoke / on)] 
         └── [C# Dispatcher] 
               └── [Application Services] 
                     └── [Repositories] 
                           └── [SQLite WAL DB]
```
- تُمنع الواجهة من استدعاء أي كود قاعدة بيانات مباشرة.
- كل رسالة بين React و C# يجب أن تكون بنموذج محدد ومكتوب (`BridgeMessage<T>`) مع معرّف طلب (`requestId`) لمنع تكرار الطلبات.
- كل المفاتيح الأساسية للجداول هي **UUID v4 (String)**، مع الاحتفاظ بحقل `invoice_number` متزايد للعرض للكاشير.

### 🔴 القاعدة 4: منع الأكواد المهملة والاستدعاءات غير المستخدمة (Zero Unused Code)
- **يُمنع استيراد أي مكتبة، متغير، دالة، أو مكوّن دون استخدامه فعلياً.**
- يتم تفعيل الفحص الصارم في TypeScript عبر:
  - `"noUnusedLocals": true`
  - `"noUnusedParameters": true`
- يتم تفعيل فحص `oxlint` الصارم ضد أي استدعاءات مهملة قبل أي Commit (`no-unused-vars: error`).
- في C#: الحفاظ على تنظيف التوجيهات (`using`) غير المستخدمة وعدم ترك دوال أو متغيرات مهملة.

### 🔴 القاعدة 5: الالتزام الصارم بالتسلسل الزمني للباك لوج ومنع القفز (Strict Sequential Execution by Milestone)
- **يُمنع منعاً باتاً القفز إلى أي محطة تالية أو ميزة لاحقة قبل إنهاء كافة التاسكات غير المنجزة `[ ]` في المحطة الحالية داخل [`PROJECT_BACKLOG.md`](./PROJECT_BACKLOG.md).**
- الأولوية المطلقة دائماً للبنية التحتية، الأمان، حماية البيانات، واستقرار النظام (المحطة 1 ثم 2 ثم 3...)، ولا يجوز إطلاقاً تفضيل واجهات بصرية أو شاشات لاحقة على حساب المهام التأسيسية المعلقة.
### 🔴 القاعدة 6: التزام الهوية البصرية ومنع العناصر الافتراضية (Strict Design Tokens & Component Reuse)
- **منع وسوم HTML الافتراضية المنسدلة (`<select>`):**
  - يُمنع منعاً باتاً استخدام وسم `<select>` الافتراضي في أي شاشة أو نافذة؛ لأن مشغّل WebView2 في بيئة ويندوز يُظهر القائمة الافتراضية بشكل رمادي/أسود شاذ ومشوّه للهوية.
  - يجب دائماً استخدام المكون المعتمد `CustomSelect` من (`@/components/CustomSelect`).
- **منع الألوان العشوائية خارج الباليت (Zero Ad-hoc Hex Colors):**
  - يُمنع كتابة ألوان Hex عشوائية مثل `#E2E8F0` أو `#52605D` أو ألوان Tailwind العادية (مثل `slate-...`).
  - يجب دائماً الالتزام بالتوكنز المحددة في `tailwind.config.js`:
    - الأخضر الرئيسي: `brand` (`#004D3F`)، `brand-dark` (`#00372D`)، `brand-soft` (`#E6F2ED`).
    - الأخضر المالي للعمليات الناجحة: `paid` (`#006D41`)، `paid-soft` (`#EAF5EE`).
    - الخلفيات: `canvas` (`#F8FAFC`)، `surface` (`#FFFFFF`)، `surface-2` (`#F1F5F4`).
    - الحدود: `line` (`#DCE1DC`)، `line-hover` (`#B5C0B7`).
    - النصوص: `ink` (`#0F172A`)، `ink-muted` (`#52605D`).
    - التنبيهات والأخطار: `warn` (`#B3720E`)، `danger` (`#B23A2E`).
- **فحص المكونات المشتركة قبل إنشاء أي ميزة جديدة:**
  - فحص مجلد `frontend/src/components` دائماً لإعادة استخدام المكونات الجاهزة:
    - `CustomSelect` للقوائم المنسدلة المخصصة.
    - `MoneyInput` لحقول إدخال المبالغ والأسعار بالقروش.
    - `ToggleSwitch` لمفاتيح التشغيل والإيقاف.
    - `RafiqDialog` و `ConfirmModal` لنوافذ التنبيه والتأكيد.

### 🔴 القاعدة 7: الحظر التام للإيموجي واستخدام الأيقونات الرسمية حصراً (Zero Emojis Policy - SVG Icons Only)
- **ممنوع منعاً باتاً استخدام أي إيموجي (Emojis)** في أي مكان في المشروع (سواء في نصوص الواجهات، الأزرار، العناوين، رسائل التنبيه والـ Toast، فواتير الطباعة، أو ملفات الإكسل والـ C#).
- شاشات نقاط البيع وأنظمة ويندوز 7 و 8 لا تدعم الإيموجي بشكل سليم وتعرضها بأشكال مشوهة أو مربعات سوداء فارغة غير احترافية.
- البديل الإلزامي دائماً هو استخدام **أيقونات SVG المعتمدة من مكتبة Lucide المدمجة محلياً (`lucide-react`)** بحجم متناسق (`w-4 h-4`, `w-5 h-5` إلخ) مع التوكنز البصرية المحددة.

### 🔴 القاعدة 8: شمولية مصفوفة الصلاحيات لكافة الميزات والوظائف (Mandatory RBAC Integration for All Features)
- **إلزام قطعي بتسجيل كل ميزة جديدة في نظام الصلاحيات (RBAC):** يُمنع منعاً باتاً إضافة أي شاشة، قسم جديد، أو وظيفة تجارية دون إدراج مفاتيح الصلاحيات الخاصة بها (`Permission Keys`) في مصفوفة الصلاحيات للمستخدمين عبر كافة الطبقات:
  1. **في خادم C# (`desktop/Services/SecurityService.cs`):** إضافة مفاتيح الصلاحيات في `ALL_PERMISSIONS`، وضبط الصلاحيات الافتراضية لكل دور (`root`, `admin`, `cashier`) في `GetPermissionsForRole`، ومزامنة الأسماء البديلة في `SyncPermissionAliases`.
  2. **في واجهة إدارة الموظفين (`frontend/src/components/UserManagerModal.tsx`):** إضافة مجموعة الصلاحيات وعناصرها في `PERMISSION_GROUPS` باسم عربي واضح، وأيقونة SVG، وشرح دقيق لكل صلاحية لتظهر لصاحب المحل في نافذة تعديل مصفوفة الصلاحيات.
  3. **في شريط التنقل الرئيسي (`frontend/src/App.tsx`):** فحص الصلاحية بواسطة `hasPermission(...)` بدلاً من القيم الثابتة (`true`) لمنع ظهور التبويب أو الشاشة للموظف غير المصرح له.
  4. **داخل الشاشة نفسها:** إخفاء أو تعطيل الأزرار الحساسة (مثل التعديل، الحذف، التغذية، أو التحليلات) بناءً على الصلاحيات الدقيقة للمستخدم الحالي.

---


### 🔴 القاعدة 9: سلامة التحديثات الهوائية وحظر إعادة التشغيل الإجباري وحماية قواعد البيانات (Air-Update Safety, Zero Forced Restarts & Database Inviolability)
- **حظر الإغلاق أو إعادة التشغيل الإجباري (Zero Forced Restarts):**
  - يُمنع منعاً باتاً على أي كود برمجي إغلاق النظام أو إعادة تشغيله تلقائياً عند انتهاء تحميل التحديث.
  - تطبيق التحديث وإعادة التشغيل يتم حصراً بنقرة زر يدوية صريحة من الكاشير بعد إتاحة خيار التأجيل المريح ([إعادة التشغيل الآن] / [تأجيل التثبيت لنهاية الوردية]).
- **حارس العمليات الجارية (Active Transaction Guard):**
  - عند طلب تطبيق التحديث وإعادة التشغيل، يجب التحقق برمجياً من خلو شاشة البيع من أي عملية بيع معلقة أو أصناف غير مدفوعة؛ إن وُجدت عملية بيع جارية، يُحظر الإغلاق فوراً ويظهر تنبيه يطالب بإنهاء الفاتورة أو تعليقها أولاً لحماية حقوق المتجر.
- **حرمة قاعدة البيانات ومنع الاستبدال المادي (Database Inviolability):**
  - يُمنع منعاً باتاً أن تحتوي حزم التحديث (ZIP/PKG) على أي ملف قاعدة بيانات (.db أو .db-wal أو .db-shm) أو مجلد data/.
  - يجب أن يتضمن كود فك الضغط في C# فحصاً صارماً يحظر ويتخطى أي ملف قاعدة بيانات لحماية مبيعات المتجر من أي كتابة فوقية.
- **الترحيل التراكمي الصارم للجداول (Safe Incremental Schema Migrations Only):**
  - أي تطوير في هيكل الجداول مصاحب للتحديثات يجب أن يمر حصراً عبر MigrationRunner.cs برقم إصدار تزايدي تالي.
  - يُمنع منعاً باتاً استخدام أوامر الحذف (DROP TABLE أو DROP COLUMN) أو التعديلات الكاسرة للبيانات القديمة.
  - التعديلات تكون تراكمية حصراً عبر CREATE TABLE IF NOT EXISTS و ALTER TABLE ... ADD COLUMN ... DEFAULT ....
  - أخذ نسخة احتياطية كاملة وموثقة لقاعدة البيانات قبل تطبيق أي ترحيل هيكلي.
- **التراجع الذاتي الفوري (Automatic Rollback on Failure):**
  - في حال فشل تطابق البصمة (SHA-256) أو حدوث أي استثناء أثناء فك الضغط والاستبدال، يتم تفعيل التراجع الفوري واستعادة الملفات التنفيذية السابقة دون أي تعطيل للمحل التجاري.

---

### 🔴 القاعدة 10: الاحترافية القياسية في ترقيم الإصدارات والمزامنة الشاملة (Semantic Versioning & Zero Version Drift Policy)
- **المعيار الهندسي للترقيم (SemVer 2.0.0):**
  - **الصيغة العامة:** `MAJOR.MINOR.PATCH` (مثال: `1.1.0`، `1.1.1`، `1.2.0`).
  - **صيغة ويندوز و .NET Framework:** `MAJOR.MINOR.PATCH.BUILD` كأربع خانات في `AssemblyInfo.cs` و `app.manifest` (مثال: `1.1.0.0` مع بقاء الخانة الرابعة `0`).
  - **قواعد رفع أرقام الإصدار:**
    1. **رقم الإصلاحات `PATCH` (مثل 1.1.0 -> 1.1.1):**
       - إصلاح أخطاء برمجية (Bug Fixes).
       - تحسينات في سرعة الأداء أو مظهر الشاشات أو جودة طباعة الفواتير.
       - تصحيح نصوص أو رسائل دون إضافة أي جداول أو وظائف تجارية جديدة.
    2. **رقم الميزات `MINOR` (مثل 1.1.0 -> 1.2.0):**
       - إضافة موديول جديد أو شاشة رئيسية جديدة متوافقة عكسياً (مثل الصيدليات، الطاولات، المحافظ).
       - إضافة ترحيل هيكلي تراكمي جديد (`Migration`) في قاعدة البيانات.
       - دعم أجهزة أو طابعات جديدة دون كسر الإصدارات السابقة.
    3. **رقم المعمارية الرئيسي `MAJOR` (مثل 1.x.x -> 2.0.0):**
       - إعادة معمارية شاملة للنظام، تغييرات جذرية في واجهة المستخدم، أو قفزات ضخمة في البنية التحتية.
- **التطابق الصارم ومنع التباين (Single Source of Truth - Zero Version Drift):**
  - يُمنع منعاً باتاً تعديل رقم الإصدار في ملف وترك بقية الملفات. عند إطلاق أي إصدار، يجب تحديث رقم الإصدار في **الملفات الأربعة الإلزامية بالتوازي في نفس الـ Commit**:
    1. `desktop/Properties/AssemblyInfo.cs` (`AssemblyVersion` و `AssemblyFileVersion`).
    2. `desktop/app.manifest` (`<assemblyIdentity version="X.Y.Z.0" .../>`).
    3. `frontend/package.json` (`"version": "X.Y.Z"`).
    4. `installer/RafiqPOS_Setup.iss` (`#define MyAppVersion "X.Y.Z"`).
    5. تحديث اسم المثبت في `Build_Installer.bat` (`RafiqPOS_Setup_vX.Y.Z.exe`).
  - يتم حراسة هذا التطابق بواسطة اختبار الوحدة الصارم `frontend/test/app_update.test.js`.
- **سجل التغييرات المعتمد لكل إصدار (Standardized Release Changelog):**
  - كل إصدار يُنشر على سيرفر التحديثات السحابي (`license-server` / `app_releases`) يجب أن يكون موثقاً بالبيانات التالية:
    - رقم الإصدار الدقيق `version` (مطابق لنفس `X.Y.Z`).
    - عنوان باللغة العربية `title` يصف جوهر التحديث.
    - تاريخ الإصدار بصيغة ISO (`YYYY-MM-DD`).
    - سجل تغييرات واضح `changelog` باللغة العربية مقسم بنقاط واضحة:
      - `[جديد]` للميزات المضافة.
      - `[تحسينات]` للأداء وتجربة المستخدم.
      - `[إصلاحات]` للمشاكل التي تم حلها.
    - تصنيف الأهمية بدقة: اختياري `is_mandatory: 0` للتحديثات التحسينية، أو إجباري `is_mandatory: 1` للإصلاحات الأمنية والمالية الحرجة.

---

### 🔴 القاعدة 11: المعايير الهندسية الصارمة لنماذج الفواتير والمطبوعات والمعاينة الحية (Document Templates, Live Previews & Print Invariants)
- **المعاينة التفاعلية الحية الفورية (Real-time Reactive Simulation):**
  - كل مستند أو فاتورة أو سند في النظام (مرتجع مبيعات، مشتريات، سند قبض، سند صرف، إغلاق الوردية زد ريبورت، عرض أسعار، كشف حساب) يجب أن تتوفر له شاشة معاينة حية مطابقة وموازية لما يطبع فيزيائياً، مع تحديث لحظي فور تعديل أي خيار أو كتابة أي حرف بدون أي تأخير أو وميض.
- **عزل ثيم الورقة عن الدارك مود (Physical Paper vs UI Shell Theme Isolation):**
  - **حرمة بياض الورقة:** الورقة المطبوعة (حرارية 80 مم أو 57 مم أو A4) هي محاكاة لورق أبيض فيزيائي حقيقي؛ لذا تكون دائماً بخلفية بيضاء نقية (`bg-white`) ونصوص سوداء عالية التباين (`text-black`) وخطوط فاصلة واضحة ومقروءة بصرياً، ولا تخضع إطلاقاً لألوان الدارك مود.
  - **التكيف التام للواجهة الحاضنة:** كافة الحاويات الخارجية، البطاقات، أدوات التحكم (Toggles)، الأزرار، والتبويبات المحيطة بالمعاينة يجب أن تلتزم بدقة متناهية بتوكنز الدارك واللايت مود (`dark:bg-surface-dark`, `dark:border-line-dark`, `dark:text-ink-dark`).
- **صمود الواجهات أمام تكبير الخطوط (Scalability & Text Scale Resilience):**
  - يُمنع منعاً باتاً تثبيت أبعاد الحاويات بالبكسل الجامد (`px`) للصناديق الحاملة للنصوص، ويجب استخدام وحدات `rem` النسبية والتجاوب المرن (`min-w-0`, `flex-wrap`, `break-words`).
  - توفير تحكم سلس بتكبير وتصغير المعاينة (Zoom: 80% / 100% / 120%) لتمكين المستخدم من تدقيق أصغر تفاصيل الفاتورة على شاشات المحلات المتواضعة (1024×768 و 1366×768) دون أي تمرير أفقي شاذ.
- **الانضباط المالي واللغوي والتفقيط (Tafqeet & Financial Arithmetic):**
  - الالتزام التام بالقاعدة 1: تخزين وحساب المبالغ بالقروش (`piasters` كأعداد صحيحة)، واستخدام `formatArabicCurrency` لعرض المبالغ بالجنيه.
  - كتابة وتفقيط المبالغ المالية باللغة العربية حصراً عبر الدالة المعتمدة `tafqeetCurrency` لكافة السندات المالية الرسمية لمنع اللبس أو التلاعب في الأصفار.
- **حظر الإيموجي والالتزام بالباركود الحقيقي (Zero Emojis & Authentic Barcode Standards):**
  - حظر تام لأي إيموجي على أي نموذج فاتورة أو سند مطبوع (SVG فقط على الواجهات ورموز خطية قياسية على الورق).
  - استخدام تشفير الباركود الرسمي Code 128 عبر `encodeInvoiceBarcode` و `layoutReceiptBarcode` لضمان قراءة ماسحات الباركود للورق المطبوع بسرعة فائقة.

---

## 4. إرشادات العمل وتطوير الميزات (Workflow for Agents)

1. **الرجوع الدائم لخريطة الطريق والترتيب الصارم:** راجع ملف [`PROJECT_BACKLOG.md`](./PROJECT_BACKLOG.md) وابدأ دائماً من أول مهمة غير مكتملة `[ ]` في الترتيب، واعرف رقم المحطة والقصة التي تعمل عليها بدقة دون أي تخطٍّ.
2. **فحص البيئة واختبار البناء المزدوج ونشر الأصول (Mandatory Release & Debug Build):**
   - ملف التشغيل المعتمد للمستخدم (`تشغيل_رفيق.bat`) يستهدف أولاً مسار الإنتاج: `desktop\bin\Release\RafiqPOS.exe`.
   - لذلك، **يُمنع منعاً باتاً الاكتفاء ببناء وضع Debug فقط**.
   - قبل إنهاء أي مهمة أو تسليم كود، يجب إلزامياً تنفيذ الخطوات التالية بالترتيب:
     1. تشغيل `npm run lint` ثم `npm run build` في مجلد `frontend` للتأكد من خلو الواجهة من أي أخطاء أو تحذيرات (0 warnings, 0 errors).
     2. بناء C# في وضعي **Release** و **Debug**:
        - `MSBuild desktop\RafiqPOS.csproj /p:Configuration=Release /p:Platform=x86 /v:m`
        - `MSBuild desktop\RafiqPOS.csproj /p:Configuration=Debug /p:Platform=x86 /v:m`
     3. نسخ ملفات `frontend\dist` المحدثة إلى كل من `desktop\bin\Release\dist` و `desktop\bin\Debug\dist`.
3. **لا تفترض، بل تحقق:** إذا كان هناك خيار معماري غامض، ارجع لمواصفات المتاجر ونقاط البيع الواقعية (السرعة، قراءة الباركود، الكيبورد السريع، شاشات 1024x768، انقطاع الكهرباء).
4. **التوثيق وتحديث الباك لوج:** بعد إتمام أي تاسك بنجاح، قم بتحديث خانة الاختيار `[x]` الخاصة بها في [`PROJECT_BACKLOG.md`](./PROJECT_BACKLOG.md).

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **RAFIQ** (15626 symbols, 44130 relationships, 1215 execution flows).

> Index stale? Run `node .gitnexus/run.cjs analyze --index-only` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? Bootstrap with `npx`, `bunx`, or `pnpm dlx` — e.g. `bunx gitnexus@latest analyze` (npm 11 npx crash; #1939).

## Always Do

- **MUST run impact before editing.** Use `impact({target: "symbolName", direction: "upstream"})` or `node .gitnexus/run.cjs impact "symbolName" --direction upstream --repo .`; report callers, processes, and risk. Never substitute grep for graph analysis.
- **MUST analyze graph changes before committing.** Use `detect_changes({scope: "all"})` (MCP) or `node .gitnexus/run.cjs detect-changes --scope all --repo .` (CLI fallback). `partial: true` or `truncated: true` is not a clean check — a zero means unseen, not unaffected; re-run it. For regression review: `detect_changes({scope: "compare", base_ref: "main"})` or `node .gitnexus/run.cjs detect-changes --scope compare --base-ref "main" --repo .`.
- MUST warn on HIGH/CRITICAL `risk` pre-edit; never use `riskSharedAxes` to waive a HIGH/CRITICAL `risk` warning. Compare File/symbol: MCP File omits axes; Graph-RAG expands File.
- **MUST treat `risk: UNKNOWN` as unresolved, not as low.** An empty caller set is not evidence the symbol is unused — it can also mean the callers are not resolvable by the index (plain-object property access, dynamic dispatch, cross-language calls). `impact` pairs `UNKNOWN` with a `riskNote` saying so. Confirm with a text search before treating the symbol as safe to change or delete; do not proceed on the strength of a zero.
- **MUST use `query({search_query: "concept"})` for concepts/flows, `context({name: "symbolName"})` for a named symbol, or `impact` for blast radius, on read-only callers, dependencies, imports, or execution flow.** Graph first; text search only for empty/`UNKNOWN`/literals.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method before MCP/CLI impact analysis.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis, and never read `UNKNOWN` as an all-clear — it means the walk could not answer, which is the one verdict that requires confirming by other means.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit before MCP/CLI graph change analysis.

## Resources

| Resource | Use for |
| --- | --- |
| `gitnexus://repo/RAFIQ/context` | Codebase overview, check index freshness |
| `gitnexus://repo/RAFIQ/clusters` | All functional areas |
| `gitnexus://repo/RAFIQ/processes` | All execution flows |
| `gitnexus://repo/RAFIQ/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
| --- | --- |
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
