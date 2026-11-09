import { useEffect, useState, type FC } from 'react';
import { TEXT_SCALE_LEVELS, isTextScaleClamped, loadTextScale, setTextScale } from '../utils/textScale';

// Personal display preference (no permission needed): scales the whole app text via the root font-size.
export const TextScaleControl: FC = () => {
  const [scale, setScale] = useState(() => loadTextScale(localStorage));
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div className="px-3.5 py-2.5 border-b border-line dark:border-line-dark">
      <div className="t-label text-ink-muted dark:text-ink-dark-muted mb-1.5">حجم الخط</div>
      {/* The first three levels share one row; the largest level sits under them at full width */}
      <div role="radiogroup" aria-label="حجم الخط" className="grid grid-cols-3 gap-1">
        {TEXT_SCALE_LEVELS.map((level, index) => {
          const active = level.value === scale;
          const isLast = index === TEXT_SCALE_LEVELS.length - 1;
          return (
            <button
              key={level.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setScale(setTextScale(document.documentElement, localStorage, level.value, viewportWidth))}
              className={`${isLast ? 'col-span-3' : ''} h-7 px-1 rounded-md border text-xs font-bold whitespace-nowrap cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-brand dark:focus-visible:ring-brand-bright ${
                active
                  ? 'bg-brand-soft border-brand/30 text-brand dark:bg-brand-dark-soft dark:border-brand-bright/40 dark:text-brand-bright'
                  : 'bg-surface border-line text-ink-muted hover:bg-surface-2 dark:bg-surface-dark-2 dark:border-line-dark dark:text-ink-dark-muted dark:hover:bg-surface-dark-3'
              }`}
            >
              {level.label}
            </button>
          );
        })}
      </div>
      {isTextScaleClamped(scale, viewportWidth) && (
        <p className="mt-1.5 text-micro leading-snug text-ink-muted dark:text-ink-dark-muted">يُطبّق بالكامل على الشاشات الأعرض من 1200 بكسل</p>
      )}
    </div>
  );
};
