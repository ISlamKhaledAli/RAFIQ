import { useState, useEffect, useRef } from 'react';

/**
 * خطاف ذكي يضمن بقاء مؤشر التحميل لفترة زمنية دنيا ومحسوبة بدقة (الافتراضي 300ms)
 * لمنع "خطفة" الشاشة اللحظية عند سرعة قواعد بيانات SQLite الفائقة،
 * مع الانتقال السلس للبيانات دون تعطيل أو تأخير المستخدم إطلاقاً.
 */
export function useSmoothLoading(isLoading: boolean, minDurationMs: number = 300): boolean {
  const [smoothLoading, setSmoothLoading] = useState(isLoading);
  const startTimeRef = useRef<number>(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isLoading) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      startTimeRef.current = Date.now();
      setSmoothLoading(true);
    } else {
      if (!startTimeRef.current) {
        setSmoothLoading(false);
        return;
      }

      const elapsed = Date.now() - startTimeRef.current;
      const remaining = minDurationMs - elapsed;

      if (remaining > 0) {
        timeoutRef.current = setTimeout(() => {
          setSmoothLoading(false);
          timeoutRef.current = null;
          startTimeRef.current = 0;
        }, remaining);
      } else {
        setSmoothLoading(false);
        startTimeRef.current = 0;
      }
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [isLoading, minDurationMs]);

  return smoothLoading;
}
