import type { ReactNode } from 'react';

/**
 * Parses multi-line strings (e.g. from legacy `title="Header:\n• item 1\n• item 2"`)
 * into a structured, elegant Arabic layout with headers and bullet points.
 */
export function renderFormattedContent(content: ReactNode): ReactNode {
  if (typeof content !== 'string') {
    return content;
  }

  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length <= 1) {
    return <span className="font-medium">{content}</span>;
  }

  const firstLine = lines[0];
  const isHeader = firstLine.endsWith(':') || lines.length > 2;
  const headerText = isHeader ? firstLine : null;
  const items = isHeader ? lines.slice(1) : lines;

  return (
    <div className="space-y-1.5 text-right">
      {headerText && (
        <div className="text-xs font-bold text-white dark:text-ink-dark pb-1 border-b border-slate-700/60 dark:border-line-dark flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-paid-bright shrink-0" />
          <span>{headerText}</span>
        </div>
      )}
      <div className="space-y-1">
        {items.map((line, idx) => {
          const cleanLine = line.replace(/^[•\-*]\s*/, '');
          return (
            <div
              key={idx}
              className="flex items-start gap-1.5 text-micro text-slate-200 dark:text-ink-dark-muted leading-relaxed"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 dark:bg-brand-bright mt-1 shrink-0" />
              <span>{cleanLine}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

