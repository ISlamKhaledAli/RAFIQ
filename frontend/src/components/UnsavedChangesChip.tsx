interface UnsavedChangesChipProps {
  /** Always mount the chip and flip this flag: the slot keeps its size, so the save button never moves. */
  dirty?: boolean;
}

/** "Unsaved changes" marker for the line next to a page's save button; reserves its space while clean. */
export const UnsavedChangesChip = ({ dirty = true }: UnsavedChangesChipProps) => (
  <span role="status" className="inline-flex w-fit shrink-0">
    {dirty && <span className="sr-only">تغييرات غير محفوظة</span>}
    <span
      aria-hidden="true"
      className={`inline-flex items-center gap-2 rounded-full border border-warn/30 dark:border-warn-bright/30 bg-warn-soft dark:bg-warn-dark-soft px-2.5 py-1 text-xs font-semibold text-warn dark:text-warn-bright ${dirty ? '' : 'invisible'}`}
    >
      <span className="w-2 h-2 rounded-full bg-warn dark:bg-warn-bright" />
      تغييرات غير محفوظة
    </span>
  </span>
);
