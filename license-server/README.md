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
npx wrangler secret put TOKEN_SIGNING_SECRET
```

### 5. الرفع بنقرة زر (Deploy):
```bash
# على ويندوز:
deploy.bat

# أو عبر سطر الأوامر:
npx wrangler deploy
```
