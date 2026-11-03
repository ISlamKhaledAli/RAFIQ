/**
 * معالج ومحسّن شعارات الإيصالات للطابعات الحرارية (Thermal Receipt Image Optimizer - 203 DPI)
 * 1. معالجة وتصغير الشعار بنسب الأبعاد الطبيعية (Aspect Ratio) دون أي مط أو تشويه.
 * 2. الحفاظ على نقاء الخطوط والمنحنيات عبر تنعيم عالي الجودة (High-Quality Bicubic Resampling).
 * 3. إنتاج ملف PNG خفيف ومضغوط (15-30 كيلوبايت) مثالي لقاعدة البيانات وسريع الإرسال لرأس الطباعة.
 */

/**
 * معالجة الشعار المرفوع وتجهيزه للإيصال الحراري بدقة مربعة قياسية (بحد أقصى 240×240 بكسل)
 * يحافظ على ألوان الشعار الطبيعية ونقاء التفاصيل دون أي تشويه أو قص عنيف.
 */
export function processUploadedLogo(
  dataUrlOrSrc: string,
  maxDimension = 240
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const origW = img.naturalWidth || img.width;
        const origH = img.naturalHeight || img.height;

        if (origW === 0 || origH === 0) {
          resolve(dataUrlOrSrc);
          return;
        }

        // الحفاظ الصارم على نسبة الطول للعرض
        const scale = Math.min(maxDimension / origW, maxDimension / origH, 1);
        const targetW = Math.max(1, Math.round(origW * scale));
        const targetH = Math.max(1, Math.round(origH * scale));

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          resolve(dataUrlOrSrc);
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, targetW, targetH);

        resolve(canvas.toDataURL('image/png'));
      } catch (err) {
        console.warn('processUploadedLogo fallback:', err);
        resolve(dataUrlOrSrc);
      }
    };

    img.onerror = () => {
      reject(new Error('تعذر تحميل وقراءة ملف الشعار'));
    };

    img.src = dataUrlOrSrc;
  });
}

/**
 * تحويل الشعار إلى أبيض وأسود عالي التباين (Monochrome) مخصص للطابعات الحرارية القديمة أو الضعيفة.
 */
export function optimizeImageForThermal(
  dataUrlOrSrc: string,
  maxWidth = 240,
  maxHeight = 240,
  threshold = 185
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const origW = img.naturalWidth || img.width;
        const origH = img.naturalHeight || img.height;

        if (origW === 0 || origH === 0) {
          resolve(dataUrlOrSrc);
          return;
        }

        // الحفاظ على النسبة ضمن المربع القياسي
        const scale = Math.min(maxWidth / origW, maxHeight / origH, 1);
        const targetW = Math.max(1, Math.round(origW * scale));
        const targetH = Math.max(1, Math.round(origH * scale));

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          resolve(dataUrlOrSrc);
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, targetW, targetH);

        const imgData = ctx.getImageData(0, 0, targetW, targetH);
        const data = imgData.data;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];

          // النقاط الشفافة تبقى شفافة
          if (a < 35) {
            data[i + 3] = 0;
            continue;
          }

          // معادلة الإضاءة المحسوسة المعيارية (ITU-R BT.601)
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;

          if (lum < threshold) {
            data[i] = 0;
            data[i + 1] = 0;
            data[i + 2] = 0;
            data[i + 3] = a > 200 ? 255 : Math.min(255, Math.round(a * 1.3));
          } else {
            // الخلفية الفاتحة تصبح شفافة
            data[i + 3] = 0;
          }
        }

        ctx.putImageData(imgData, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch (err) {
        console.warn('Thermal optimizer fallback:', err);
        resolve(dataUrlOrSrc);
      }
    };

    img.onerror = () => {
      reject(new Error('فشل معالجة الشعار للطابعات الحرارية'));
    };

    img.src = dataUrlOrSrc;
  });
}
