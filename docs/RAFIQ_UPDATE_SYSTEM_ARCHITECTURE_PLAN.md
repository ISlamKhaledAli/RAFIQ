# وثيقة التصميم المعماري والتنفيذي لمنظومة التحديثات السحابية والتحكم في التراخيص
## مشروع رفيق لنقاط البيع (Rafiq POS)

---

## 1. الملخص التنفيذي والأهداف (Executive Summary)

تهدف هذه المنظومة إلى توفير حل شامل ومتكامل لتوزيع التحديثات الهوائية (Over-the-Air Updates) والتحكم المركزي في استحقاق العملاء للتحديثات، مع بقاء التكلفة **0$ (Free Forever)** ودون المساس بقواعد البيانات أو العمليات التشغيلية في المتاجر.

### ما تم التحقق منه مسبقاً (Phase 0 Audit Results):
- **C# الديسك توب:** نجاح 100% لاختبارات الأمان (`RafiqPOS.exe --run-update-tests`) وتأكيد جاهزية محرك التراجع الذاتي (Auto-Rollback) وفحص بصمة الهاش (SHA-256).
- **خادم التراخيص (Cloudflare Worker):** نجاح 100% لـ 20 اختباراً ذاتياً (`npm test`) يغطي التشفير والتحقق وبصمة الأجهزة.
- **حساب Cloudflare:** تم التحقق من ربط حساب `khaledislam9003@gmail.com` وجاهزيته الكاملة لنشر التحديثات السحابية وقواعد بيانات D1.

---

## 2. خريطة المراحل التنفيذية (Milestones Roadmap)

```
[المرحلة 1: تطوير خادم التراخيص وقاعدة بيانات D1]
  ├── إنشاء ملف الترحيل: 0002_add_releases_and_entitlements.sql
  ├── إضافة حقول التحكم في التحديثات لجدول licenses
  ├── إنشاء جدول الإصدارات app_releases
  ├── كتابة مسار فحص التحديثات للعملاء: POST /api/updates/check
  ├── كتابة مسارات إدارة الإصدارات للأدمن: /api/admin/releases/*
  ├── كتابة مسار تفعيل/تعطيل التحديثات لكل محل: /api/admin/licenses/:id/toggle-updates
  └── كتابة اختبارات تغطية شاملة في server.test.ts والتأكد من نجاحها

[المرحلة 2: لوحة تحكم الإدارة السحابية (/admin)]
  ├── إضافة تبويب "إدارة التحديثات" (Releases Tab) في لوحة التحكم
  ├── نافذة "نشر إصدار جديد" (Publish Release Modal) برقم الإصدار والهاش ورابط GitHub
  ├── إضافة زر تفعيل/إيقاف التحديثات وتاريخ انتهاء الدعم في جدول التراخيص
  ├── مفتاح إيقاف الطوارئ (Emergency Kill Switch) لسحب أي إصدار في ثانية واحدة
  └── نشر السيرفر وقاعدة البيانات إلى شبكة Cloudflare العالمية (Live Deployment)

[المرحلة 3: تطوير كود الديسك توب (C# Host)]
  ├── تعديل CheckForUpdates لإرسال license_key وبصمة الجهاز تلقائياً
  ├── كتابة دالة التحميل المباشر DownloadUpdateAsync مع نسبة التقدم اللحظية (0% - 100%)
  ├── بناء آلية التبديل السريعة (The 2-Second Restart Switcher: rafiq_updater.bat)
  └── تطبيق حارس العمليات الجارية (Active Transaction Guard) لمنع الإغلاق في وجود بيع معلق

[المرحلة 4: واجهة المستخدم (React Frontend)]
  ├── تحديث AppUpdateModal.tsx لعرض شريط تقدم التحميل المباشر
  ├── إضافة زر "إعادة التشغيل الآن" مع زر "تأجيل التثبيت لنهاية الوردية"
  └── عرض رسائل واضحة ومطمئنة تشرح حالة استحقاق الترخيص أو طلب التجديد

[المرحلة 5: سكريبت التحزيم ودليل التشغيل العملي (Packaging & Live Verification)]
  ├── برمجة سكريبت build_update_package.bat لتجميع الإصدار وحساب الهاش آلياً
  ├── رفع إصدار تجريبي على GitHub Releases ونشره عبر لوحة السيرفر
  └── تجربة عملية حية: جهاز مؤهل يستقبل ويثبت التحديث، وجهاز غير مؤهل يُحظر عنه بأمان
```

---

## 3. تفاصيل تطوير السيرفر (Server & D1 Architecture)

### أ) ترحيل قاعدة البيانات (Cloudflare D1 Migration)
ملف `license-server/migrations/0002_add_releases_and_entitlements.sql`:
```sql
-- 1. إضافة حقول استحقاق التحديثات لجدول التراخيص
ALTER TABLE licenses ADD COLUMN can_receive_updates INTEGER NOT NULL DEFAULT 1;
ALTER TABLE licenses ADD COLUMN updates_until TEXT DEFAULT NULL;
ALTER TABLE licenses ADD COLUMN max_allowed_version TEXT DEFAULT 'latest';

-- 2. إنشاء جدول الإصدارات app_releases
CREATE TABLE IF NOT EXISTS app_releases (
    id TEXT PRIMARY KEY,
    version TEXT UNIQUE NOT NULL,
    release_date TEXT NOT NULL,
    title TEXT NOT NULL,
    changelog TEXT NOT NULL,
    download_url TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    is_mandatory INTEGER NOT NULL DEFAULT 0,
    is_published INTEGER NOT NULL DEFAULT 1,
    min_client_version TEXT DEFAULT '1.0.0',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_releases_version ON app_releases(version);
CREATE INDEX IF NOT EXISTS idx_releases_published ON app_releases(is_published);
```

### ب) بوابة فحص واستحقاق التحديث (`/api/updates/check`)
العميل يرسل `license_key`, `machine_fingerprint`, `current_version`.
السيرفر ينفذ خوارزمية الفحص:
1. التحقق من صلاحية الترخيص وأنه `active`.
2. فحص `can_receive_updates === 1`.
3. فحص تاريخ الصيانة `updates_until >= today` (أو فارغ لمدى الحياة).
4. إذا لم يكن مؤهلاً: يرجع `{ hasUpdate: false, isEligible: false, message: 'عقد التحديثات والدعم الفني منتهي...' }`.
5. إذا كان مؤهلاً: يستعلم أحدث إصدار منشور `is_published = 1` ويرجع بيانات التنزيل والهاش.

### ج) مسارات لوحة التحكم الإدارية (Admin APIs)
* `GET /api/admin/releases` — عرض قائمة الإصدارات المنشورة.
* `POST /api/admin/releases` — نشر إصدار جديد بالبيانات والهاش.
* `POST /api/admin/releases/:id/toggle` — تفعيل أو إيقاف نشر إصدار معين فورياً.
* `POST /api/admin/licenses/:id/toggle-updates` — تبديل إمكانية استلام التحديثات لترخيص معين.
* `POST /api/admin/licenses/:id/extend-updates` — تمديد فترة التحديثات لترخيص معين لعدد من الأيام أو دائم.

---

## 4. تفاصيل كود الديسك توب (C# Desktop Details)

### أ) التحميل المباشر `DownloadUpdateAsync`
* يستخدم `WebClient` مع تمكين `TLS 1.2`.
* يحفظ الملف في مسار مؤقت آمن: `%ProgramData%\RafiqPOS\updates\update_{version}.zip`.
* يرسل تقارير التقدم المئوية `IProgress<int>` للواجهة في الوقت الفعلي.
* فور انتهاء التحميل، يحسب الـ SHA-256 للملف ويطابقه مع بصمة السيرفر؛ إذا اختلفت البصمة يُحذف الملف فوراً ويُلغى التثبيت لحماية النظام.

### ب) محرك التبديل وإعادة التشغيل (The 2-Second Restart Switcher)
* يقوم بإنشاء سكريبت `%ProgramData%\RafiqPOS\rafiq_updater.bat`.
* يستدعي السكريبت بأمر مخفي `ProcessStartInfo { CreateNoWindow = true }`.
* يغلق رفيق بأمان تام `Application.Exit()`.
* السكريبت ينتظر خروج البرنامج، ينقل الملفات المحدثة إلى مجلد البرنامج، ثم يعيد تشغيل `RafiqPOS.exe` فوراً!

### ج) حارس العمليات الجارية (Active Transaction Guard)
* قبل السماح بإعادة التشغيل، يفحص الـ IPC:
  - هل سلة المبيعات بها عناصر؟
  - هل الكاشير في منتصف معاملة بيع؟
  - إذا نعم: يمنع الإغلاق ويطلب إنهاء أو تعليق الفاتورة أولاً.

---

## 5. قواعد الأمان وعدم كسر التوافقية (Safety & Invariant Rules)
- **القاعدة 9 الحاكمة:** حظر الإغلاق الإجباري، إتاحة خيار التأجيل، حظر استبدال ملفات الداتابيز، والترحيل التراكمي للجداول عبر `MigrationRunner.cs`.
- **توافقية Win 7 - 11:** الالتزام بـ .NET 4.8 و TLS 1.2 وكود C# 5 الخالي من أي صياغة حديثة غير مدعومة.
