# دليل ومرجع تلويند لمشروع رفيق (Tailwind CSS v3.4 Reference & Compatibility Guide)

> **وثيقة مرجعية تقنية:** هذا الملف يمثل المرجع الشامل لكلاسات وتنسيقات **Tailwind CSS v3.4.17** المتوافقة 100% مع بيئة التشغيل المستهدفة لمشروع رفيق (**Chromium 109 / Windows 7 SP1 وحتى Windows 11**).
> يوضح هذا الدليل الفروق الجوهرية بين Tailwind v3 و v4، والتفاصيل المحظورة، وكيفية استخدام كلاسات المشروع المعتمدة.

---

## 1. محددات بيئة العمل المعمارية

| العنصر | القيمة المعتمدة في رفيق | ملاحظات هامة |
| :--- | :--- | :--- |
| **نسخة Tailwind** | `3.4.17` | لا يجوز ترقية المشروع إلى v4 لأنه يتطلب Chromium 111+ |
| **محرك المتصفح المستهدف** | Chromium 109 (`chrome109` / `es2020`) | متوافق مع ويندوز 7 و 8 عبر Fixed Runtime 109 |
| **أداة المعالجة (PostCSS)** | PostCSS 8 + Autoprefixer | لا تستخدم `@theme` أو إعدادات v4 المعتمدة على محرك Rust Oxide |
| **استهلاك الموارد** | فائق الخفة بدون CDNs خارجية | جميع الخطوط والأصول محلية (Self-hosted) |

---

## 2. جدول الفروقات والتصحيحات: أخطاء Tailwind v4 الشائعة في v3

| الميزة / الكلاس | كلاس Tailwind v4 (المحظور في v3) | الكلاس المعتمد في رفيق (Tailwind v3.4) | التفسير البرمجي |
| :--- | :--- | :--- | :--- |
| **إزالة حدود التركيز** | `focus:outline-hidden` | `focus:outline-none` | في v4 تم استبدال `outline-none` بـ `outline-hidden`. في v3 غير موجود إطلاقاً. |
| **الظلال متناهية الصغر** | `shadow-2xs` | `shadow-2xs` (معرّفة بـ `tailwind.config.js`) أو `shadow-sm` | في v3 الافتراضي لا يوجد `2xs`، تم تضمينها في إعدادات الثيم. |
| **الظلال الصغيرة جداً** | `shadow-xs` | `shadow-xs` (معرّفة بـ `tailwind.config.js`) أو `shadow-sm` | في v3 الافتراضي كان يبدأ بـ `shadow-sm`، تم تضمين `xs` في إعدادات الثيم. |
| **ضبابية الخلفية الخفيفة** | `backdrop-blur-xs` | `backdrop-blur-xs` (معرّفة بـ `2px`) أو `backdrop-blur-sm` | في v3 الافتراضي لا يوجد `xs` للبلور، تم تمديدها في الإعدادات. |
| **الشفافية على currentColor** | `border-current/15` | `border-line` أو `border-black/10` | دالة `color-mix()` على currentColor خاصة بـ v4 وتفشل في Chromium 109. |
| **المسافات الجزئية الخاطئة** | `py-0.2` (غير موجودة) | `py-0.5` (2px) أو `py-[1px]` | درجات تلويند القياسية تبدأ بـ `0.5`، تم ضبطها وتوفير `'0.2': '1px'`. |
| **إزاحة القوائم المنسدلة** | `top-[calc(100%+4px)]` | `top-full mt-1` | كتابة `+` بدون مسافات في `calc` غير قياسية في CSS، البديل الأنظف هو `top-full mt-1`. |
| **حركات الدخول المنبثقة** | `animate-in fade-in zoom-in-95` | مدعومة بالكامل عبر محرك `@keyframes enter` في `index.css` | تم تفعيل خواص Shadcn composable animations بدون الحاجة لحزم إضافية. |
| **الأيقونات المتجهية** | `<i className="fas fa-..." />` | مكونات `lucide-react` الصريحة | ممنوع استخدام FontAwesome لعدم وجود ملفات الخط وتفادياً للأخطاء البصرية. |

---

## 3. باليت الألوان المعتمدة لنظام رفيق (Design Tokens)

تم توحيد الألوان داخل `tailwind.config.js` لتغطي كامل احتياجات الواجهات:

### أ) ألوان الهوية الرئيسية (Brand Palette)
- `bg-brand` / `text-brand` / `border-brand`: الأخضر الزمردي الغامق الداكن (`#0B4F42`).
- `hover:bg-brand-hover`: درجة التمرير للأزرار الأساسية (`#0F6A57`).
- `bg-brand-dark`: الدرجة الأغمق لشريط العنوان والعناصر العلوية (`#00372D`).
- `bg-brand-soft` / `text-brand-soft`: الخلفيات الهادئة للأزرار النشطة (`#E1EAE5`).
- `text-on-brand`: لون النص الصريح فوق خلفيات البراند (`#FFFFFF`).

### ب) ألوان الأسطح والبطاقات (Surfaces & Canvas)
- `bg-canvas`: خلفية البرنامج الأساسية المريحة للعين (`#F3F5F2`).
- `bg-surface` / `bg-white`: كروت وبطاقات العرض البيضاء الناصعة (`#FFFFFF`).
- `bg-surface-2`: خلفيات الجداول، الحقول المعطلة، والبانلات الجانبية (`#F7F8F6`).
- `bg-surface-3` / `hover:bg-surface-3`: خلفيات التمرير للعناصر الثانوية (`#EEF1F4`).
- `border-line` / `hairline-all`: الخطوط الفاصلة الرقيقة للمحاسبة (`#DCE1DC`).
- `hover:border-line-hover`: خطوط الإطارات عند التفاعل (`#B5C0B7`).

### ج) ألوان الحالات والعمليات المالية (Financial Semantic States)
- **المدفوع / الإيجابي (Paid / Success):**
  - `bg-paid` (`#1B7A4D`) | `hover:bg-paid-hover` (`#15633E`)
  - `bg-paid-soft` (`#EAF5EE`) | `border-paid-border` (`#C4E3D0`)
- **التحذير / الآجل / الوزن (Warning / Due):**
  - `bg-warn` (`#B3720E`) | `bg-warn-soft` (`#FEF7EC`) | `border-warn-border` (`#F5DEB4`)
- **الخطر / المرتجع / الحذف (Danger / Return / Loss):**
  - `bg-danger` (`#B23A2E`) | `bg-danger-soft` (`#FDF3F2`) | `border-danger-border` (`#F6CBC6`)
  - `text-danger-ink`: النص الداكن للتنبيهات الصارمة (`#7A1D14`).

---

## 4. الحركات والانتقالات (Animations & Micro-interactions)

تم ضبط محرك الحركات ليعمل بأداء 60fps على كروت الشاشة المدمجة في أجهزة ويندوز 7 و 10:

```tsx
// 1. المودالات والقوائم المنسدلة (Entrance Animations)
<div className="animate-in fade-in zoom-in-95 duration-100">...</div>

// 2. التنبيهات العلوية وتوست العمليات
<div className="animate-in slide-in-from-top-1">...</div>
<div className="animate-in slide-in-from-bottom-3">...</div>

// 3. كلاسات الظهور البسيط
<div className="animate-fade-in">...</div>
<div className="animate-scale-up">...</div>
```

---

## 5. قواعد فحص وتدقيق الكود قبل الاعتماد

1. **فحص الـ Lint:** تشغيل `npm run lint` للتأكد من خلو المشروع من أي متغيرات أو كلاسات غير مستخدمة (0 warnings, 0 errors).
2. **فحص الاختبارات:** تشغيل `npm test` للتحقق من اجتياز كافة اختبارات سلامة الواجهة والتكامل بنسبة 100%.
3. **فحص البناء:** تشغيل `npm run build` للتأكد من توليد ملفات الإنتاج المتوافقة مع `chrome109`.
