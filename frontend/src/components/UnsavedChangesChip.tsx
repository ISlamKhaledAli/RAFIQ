/** Small "unsaved changes" marker for the line next to a page's save button. */
export const UnsavedChangesChip = () => (
  <span className="inline-flex items-center gap-2 rounded-full border border-warn/30 dark:border-warn-bright/30 bg-warn-soft dark:bg-warn-dark-soft px-2.5 py-1 text-xs font-semibold text-warn dark:text-warn-bright">
    <span aria-hidden="true" className="w-2 h-2 rounded-full bg-warn dark:bg-warn-bright" />
    تغييرات غير محفوظة
  </span>
);
