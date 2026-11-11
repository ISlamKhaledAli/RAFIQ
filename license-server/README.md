# سيرفر تفعيل وإدارة تراخيص رفيق (Rafiq POS License Server)
**Cloudflare Workers + D1 Serverless Licensing Architecture**

سيرفر تفعيل وتتبع تراخيص تطبيق "رفيق POS"، مبني بنظام Serverless على شبكة Cloudflare العالمية وقاعدة بيانات Cloudflare D1 الموزعة، بتكلفة استضافة 0$ (Free Tier).

---

## 🌟 الميزات والمعمارية (Architecture & Features)
1. **أمان عالي ومصادقة مشفرة:**
   - حماية جميع الـ Endpoints بمفتاح مشترك سري (`X-Rafiq-Api-Key`).
   - توقيع توكنات التفعيل رقمياً بخوارزمية **HMAC-SHA256** غير قابلة للتلاعب أو التزوير.
2. **ربط الترخيص ببصمة الجهاز (Machine Fingerprint Binding):**
   - يُربط رمز الترخيص (`RFQ-XXXX-XXXX-XXXX`) ببصمة عتاد الجهاز عند التفعيل الأول.
   - منع استخدام نفس الرمز على أكثر من جهاز في نفس الوقت (`DEVICE_MISMATCH`).
   - إمكانية إعادة التفعيل تلقائياً لنفس الجهاز عند إعادة تثبيت الويندوز (Idempotent Reactivation).
3. **لوحة إدارة عربية مدمجة (`/admin`):**
   - واجهة مستخدم متوافقة مع هوية رفيق لإصدار رموز جديدة، إيقاف التراخيص، ومتابعة سجلات التدقيق.
   - ميزة **فك ربط الجهاز (Device Reset)** بضغطة زر لنقل الترخيص لجهاز كمبيوتر جديد عند تلف الجهاز القديم.
4. **سجل تدقيق كامل (Activation Audit Logs):**
   - تسجيل كل طلب تفعيل ناجح أو فاشل مع توثيق الـ IP وعنوان الجهاز والتاريخ والسبب.

---

## 🚀 واجهات البرمجة (API Endpoints)

| المسار | الطريقة | الوصف | الحماية |
|---|---|---|---|
| `/api/health` | `GET` | فحص حالة وسرعة استجابة السيرفر | عام |
| `/api/activate` | `POST` | استقبال رمز الترخيص وبصمة الجهاز وإصدار التوكن | `X-Rafiq-Api-Key` |
| `/api/verify` | `POST` | فحص صلاحية التوكن والتحقق من عدم إلغائه | `X-Rafiq-Api-Key` |
| `/admin` | `GET` | لوحة تحكم الإدارة العربية | متصفح ويب |
| `/api/admin/licenses` | `GET` | جلب كافة التراخيص وحالاتها | `X-Admin-Secret` |
| `/api/admin/licenses` | `POST` | توليد ترخيص جديد لمحل | `X-Admin-Secret` |
| `/api/admin/licenses/:id/revoke` | `POST` | تعطيل/إيقاف الترخيص | `X-Admin-Secret` |
| `/api/admin/licenses/:id/activate` | `POST` | إعادة تفعيل ترخيص معطل | `X-Admin-Secret` |
| `/api/admin/licenses/:id/reset-device` | `POST` | فك ربط الجهاز لنقل الترخيص | `X-Admin-Secret` |
| `/api/admin/logs` | `GET` | عرض سجل محاولات التفعيل والتدقيق | `X-Admin-Secret` |

---

## 🛠️ التشغيل والاختبار محلياً (Local Development & Testing)

### 1. تشغيل الاختبارات التلقائية (12 اختبار وحدة وتكامل):
```bash
cd license-server
npm test
```

### 2. تشغيل السيرفر محلياً عبر محاكي Wrangler:
```bash
npx wrangler dev
```

---

## ☁️ خطوات الرفع على Cloudflare (Production Deployment)

### 1. تسجيل الدخول إلى حسابك في Cloudflare:
```bash
npx wrangler login
```

### 2. إنشاء قاعدة بيانات D1 للتراخيص:
```bash
npx wrangler d1 create rafiq-licenses
```
*قم بنسخ `database_id` الناتج ووضعه في ملف `wrangler.toml`.*

### 3. تطبيق الجداول الأولية (Schema Execution):
```bash
npx wrangler d1 execute rafiq-licenses --remote --file=./schema.sql
```

### 4. ضبط المفاتيح السرية بأمان (Production Secrets):
```bash
npx wrangler secret put APP_API_KEY
npx wrangler secret put ADMIN_SECRET
npx wrangler secret put LICENSE_PRIVATE_KEY
```
*يجب ألا يقل `ADMIN_SECRET` عن 32 حرفاً (يُفضّل قيمة عشوائية طويلة)؛ أي قيمة أقصر أو غير مضبوطة تُغلق لوحة الإدارة بالكامل (401). لا توجد أي كلمة سر احتياطية داخل الكود.*

*اختياري: `RELEASE_DOWNLOAD_HOSTS` (مضيفون مسموحون مفصولون بفاصلة) لروابط تحميل التحديثات؛ الافتراضي: `github.com`, `objects.githubusercontent.com`, `release-assets.githubusercontent.com`. الروابط يجب أن تكون https فقط.*

### 5. الرفع بنقرة زر (Deploy):
```bash
# على ويندوز:
deploy.bat

# أو عبر سطر الأوامر:
npx wrangler deploy
```

---

## 🔒 Cloudflare dashboard steps (خطوات يدوية بعد النشر)

هذه الخطوات تُنفَّذ يدوياً من لوحة Cloudflare وليست جزءاً من الكود:

1. **تدوير المفاتيح (Rotate secrets):** غيّر `ADMIN_SECRET` فوراً بقيمة عشوائية لا تقل عن 32 حرفاً (`npx wrangler secret put ADMIN_SECRET`). وفكّر في تدوير `APP_API_KEY` و`LICENSE_PRIVATE_KEY` أيضاً (تدوير `LICENSE_PRIVATE_KEY` يتطلب تحديث المفتاح العام داخل التطبيق وإعادة إصدار التراخيص).
2. **Rate limiting:** من Security > WAF > Rate limiting rules أضف قاعدة على `/api/*` وأخرى أشد على `/api/admin/*` (مثلاً 10 طلبات في الدقيقة لكل IP للطلبات الفاشلة/المرفوضة 401 و403) مع إجراء Block أو Managed Challenge.
3. **حماية `/admin`:** فكّر في Cloudflare Access (Zero Trust) أمام مسار `/admin*` و`/api/admin*` ليكون الدخول عبر هوية الإدارة قبل الوصول إلى الـ Worker.
4. **حذف التراخيص التجريبية:** لم يعد `schema.sql` يزرع بيانات تجريبية، لكن قواعد البيانات المنشورة سابقاً قد تحتويها. نفّذ:
   ```bash
   npx wrangler d1 execute rafiq-licenses --remote --command "DELETE FROM licenses WHERE id IN ('demo-lic-1','demo-lic-2','demo-lic-3') OR license_key IN ('RFQ-TEST-2026-DEMO','RFQ-PERM-8899-A1B2','RFQ-DISA-0000-DEAD');"
   ```
5. **مراجعة سجل التدقيق:** راجع الإجراءات المنفّذة من لوحة الإدارة (قد تكون نُفّذت بكلمات السر القديمة المدمجة في الكود):
   ```bash
   npx wrangler d1 execute rafiq-licenses --remote --command "SELECT * FROM activation_logs WHERE ip_address = 'admin_portal' ORDER BY created_at DESC LIMIT 200;"
   ```
   وراجع أيضاً التراخيص والإصدارات (`app_releases`) المضافة مؤخراً بحثاً عن أي شيء غير معروف.
