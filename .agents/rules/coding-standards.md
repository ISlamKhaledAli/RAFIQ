---
description: الدليل المعماري الحاكم وقواعد الجودة ومنع التخريف لمشروع رفيق (Rafiq POS)
always_on: true
---

# قواعد الجودة وهندسة الكود لمشروع رفيق (Rafiq POS)

> هذا الملف موحّد بالكامل مع [AGENTS.md](file:///c:/Users/khale/OneDrive/Desktop/RAFIQ/AGENTS.md) ويمثل المرجع الصارم الحاكم لتطوير المشروع.

---

## 1. الثوابت المعمارية الحاكمة (Non-Negotiable Invariants)

### 🔴 1. الأمان المالي المطلق (Integer Financial Arithmetic)
- ممنوع منعاً باتاً استخدام `float` أو `double` أو أي أرقام عشرية في العمليات الحسابية أو تخزين المبالغ.
- كافة الأسعار والمبالغ والخصومات والضرائب تُخزن وتُحسب **بالقروش (Piasters)** كأعداد صحيحة (`long` في C# و `number` مقرب في TS/JS عبر فئة `Money`).
- التحويل للجنيه (`amount / 100.0`) يتم **فقط وحصرياً في شاشة العرض النهائية للمستخدم**.
- الأوزان والكميات تُخزن بالمليجرام أو بالألف (`milli-units` كأعداد صحيحة).

### 🔴 2. سلامة البيانات والمعاملات الذرية (ACID Transactions & SQLite WAL)
- أي عملية بيع، خصم مخزون، سداد آجل، أو ترحيل مالي تُنفذ بالكامل داخل **معاملة ذرية واحدة (`conn.BeginTransaction()`)**.
- في حالة أي استثناء، يتم التراجع فوراً (`Rollback`).
- تفعيل وضع **WAL** دائماً:
  ```sql
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
  ```
- ممنوع الحذف المادي (Hard Delete)؛ التصحيح يتم دائماً بقيد معاكس (Contra Entry) مع ذكر السبب والمستخدم والتاريخ.

### 🔴 3. المعمارية النظيفة وفصل الطبقات (Clean Architecture)
```
[React UI] ──> [Typed IPC Bridge] ──> [Application Services] ──> [Repositories] ──> [SQLite DB]
```
- تُمنع الواجهة من استدعاء أي كود قاعدة بيانات مباشرة.
- كل المفاتيح الأساسية للجداول هي **UUID v4 (String)**، مع الاحتفاظ بحقل `invoice_number` متزايد للعرض للكاشير.

### 🔴 4. منع الأكواد والاستدعاءات غير المستخدمة (Zero Dead Code)
- يُمنع ترك أي استيراد أو متغير أو دالة غير مستخدمة.
- فحص TypeScript مفعل بإلزام: `"noUnusedLocals": true`, `"noUnusedParameters": true`.
- فحص `oxlint` الصارم مفعل (`no-unused-vars: "error"`, `import/no-duplicates: "error"`).
- في C#: تنظيف كافة توجيهات `using` والمتغيرات غير المستخدمة.

---

## 2. القيود التقنية والتوافقية (Windows 7 SP1 & Chromium 109)

1. **مضيف C# (.NET 4.8):**
   - البقاء على `.NET Framework 4.8` (`net48`) لضمان ويندوز 7.
   - الالتزام بصياغة C# 5 المتوافقة مع أداة MSBuild v4.0 (استخدام `get { return ...; }`، وتفادي `=>` و `nameof(...)` و pattern matching).
   - حزمة WebView2 لا تتجاوز `1.0.1518.46` (Fixed 109 لويندوز 7 و Evergreen لويندوز 10/11).
   - مسار البيانات في الإنتاج: `%ProgramData%\RafiqPOS\data\rafiq_pos.db`.
   - كشف بيئة النظام بدقة عبر `app.manifest` ومساعد `OsDetector` لتمييز Windows 11/10 عن Windows 7/8 ومنع رسائل المحاكاة المغلوطة.
   - **عزل الأخطاء حسب النظام الفرعي:** فصل معالجة أخطاء قاعدة البيانات عن ملفات الواجهة وعن أخطاء مشغل WebView2، وعرض رسائل عربية دقيقة توضح المشكلة الحقيقية.

2. **واجهة React (Vite):**
   - هدف البناء: `chrome109` / `es2020`.
   - التنسيقات: Tailwind CSS v3.4 فقط أو Vanilla CSS (ممنوع Tailwind v4).
   - الخطوط والأصول محلية بالكامل (Self-hosted Cairo/Tajawal)، لا استدعاءات خارجية بدون إنترنت.
   - دعم الشاشات الصغيرة: 1024×768 و 1366×768 بدون تمرير أفقي.
   - **المرجع البصري الإلزامي للواجهات:** مجلد `stitch_rafeeq_pos_system_ui_design/` وفهرسه [`UI_DESIGN_CATALOG.md`](file:///c:/Users/khale/OneDrive/Desktop/RAFIQ/UI_DESIGN_CATALOG.md). قبل بناء أي شاشة، يتم فحص `code.html` و `screen.png` ونقل التصميم لـ React بجودة أعلى، مع الحفاظ على هوية ألوان الأخضر والسطح الرمادي المريح والخطوط العربية.

3. **انضباط Git:**
   - منع أي commit أو push عشوائي بدون مبرر وموافقة واختبار كامل.
   - استثناء ملفات التصاميم `stitch_rafeeq_pos_system_ui_design/` والملفات المؤقتة في `.gitignore`.

---

## 3. التحقق قبل أي تسليم
- الواجهة: `npm run lint` و `npm run build` تعطي 0 أخطاء و 0 تحذيرات.
- الخلفية: بناء C# ينجح بدون أي خطأ ترجمة عبر MSBuild.
- تحديث خانات الإنجاز `[x]` في [`PROJECT_BACKLOG.md`](file:///c:/Users/khale/OneDrive/Desktop/RAFIQ/PROJECT_BACKLOG.md).
