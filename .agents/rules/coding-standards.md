---
description: معايير التطوير الصارمة لنظام رفيق وقواعد الجودة ومنع الأكواد غير المستخدمة
always_on: true
---

# قواعد الجودة وهندسة الكود لمشروع رفيق (Rafiq POS)

1. **الالتزام بالقروش (Integer Piasters Only):**
   ممنوع منعاً باتاً كتابة أي منطق مالي يعتمد على `double` أو `float`. كل الحسابات الداخلية بالقرش (`long` / `number` صحيح).
   
2. **منع الاستدعاءات والأكواد غير المستخدمة (Zero Dead Code / Unused Imports):**
   - لا تترك أي `import` غير مستخدم في ملفات TypeScript.
   - احرص على تفعيل `"noUnusedLocals": true` و `"noUnusedParameters": true`.
   - في C# احذف أي `using` لا داعي له.

3. **الامتثال لـ Windows 7 و Chromium 109:**
   - لا تستخدم ميزات JavaScript أو CSS حديثة تتطلب Chromium > 109.
   - لا ترقّي .NET Framework داخل مجلد `desktop` لأكثر من 4.8.
   - لا ترقّي WebView2 لأكثر من 1.0.1518.46.

4. **المعاملات الذرية وحماية الكهرباء (WAL Mode & ACID):**
   - أي كتابة في قاعدة البيانات تخص بيع أو رصيد أو مخزون يجب أن تكون داخل `BeginTransaction()`.
