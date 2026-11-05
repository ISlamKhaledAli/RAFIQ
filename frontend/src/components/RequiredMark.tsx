// Red asterisk shown after the label of a field the form really requires (optional fields carry no marker)
export const RequiredMark = () => (
  <>
    <span className="text-danger dark:text-danger-bright font-black ms-0.5" aria-hidden="true">*</span>
    <span className="sr-only"> (مطلوب)</span>
  </>
);
