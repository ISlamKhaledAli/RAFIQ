import { useRef, useState, type ChangeEvent } from 'react';
import { ImageOff, Loader2, RotateCcw, Trash2, Upload } from 'lucide-react';
import {
  MAX_SIGNATURE_IMAGES,
  parseSignatureImages,
  processSignatureImageFile,
  serializeSignatureImages,
  SIGNATURE_IMAGE_ACCEPT,
  SIGNATURE_IMAGE_DEFAULT,
  SIGNATURE_IMAGE_LIST_MAX_CHARS,
} from '../../utils/signatureImage';

interface SignatureImageFieldProps {
  /** developer_signature_image: '', 'none', one PNG data URL, or a JSON array of up to 8 entries */
  value: string;
  onChange: (next: string) => void;
  /** URLs of the built-in images: the "default" entry stands for all of them */
  builtIns: readonly string[];
  /** pool image shown in the receipt preview (null = the sample invoice's own pick) */
  selectedIndex: number | null;
  onSelect: (index: number | null) => void;
}

const BUTTON_BASE =
  'h-11 px-4 rounded-lg border text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed';
const BUTTON_SELECTED =
  'bg-paid-soft dark:bg-paid-dark-soft border-paid dark:border-paid-bright text-paid dark:text-paid-bright';
const BUTTON_IDLE =
  'bg-surface dark:bg-surface-dark border-line dark:border-line-dark text-ink dark:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-3';
const MAX_MESSAGE = `الحد الأقصى ${MAX_SIGNATURE_IMAGES} صور`;
const TOO_BIG_MESSAGE = 'مجموع حجم الصور كبير. احذف صورة أو اختر صوراً أبسط.';

/** "N صور" with the natural Arabic forms for none, one and two */
function countLabel(count: number): string {
  if (count === 0) return 'بدون صور';
  if (count === 1) return 'صورة واحدة';
  if (count === 2) return 'صورتان';
  return `${count} صور`;
}

/** The caption counts the real pool: every built-in image plus every custom one. */
function poolCaption(pool: number): string {
  if (pool === 0) return 'بدون صور • يُطبع النص فقط';
  if (pool === 1) return 'صورة واحدة • تُطبع على كل فاتورة';
  return `تُختار واحدة عشوائياً من ${pool === 2 ? 'صورتين' : `${pool} صور`} لكل فاتورة`;
}

/** Root-only gallery for the receipt signature: each invoice prints one image of the pool, chosen from its id. */
export const SignatureImageField = ({ value, onChange, builtIns, selectedIndex, onSelect }: SignatureImageFieldProps) => {
  const [processing, setProcessing] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const list = parseSignatureImages(value);
  const onlyDefault = list.length === 1 && list[0] === SIGNATURE_IMAGE_DEFAULT;
  // Each entry covers `size` consecutive images of the pool ("default" = the whole built-in set)
  const sizes = list.map((item) => (item === SIGNATURE_IMAGE_DEFAULT ? builtIns.length : 1));
  const offsets = sizes.map((_, i) => sizes.slice(0, i).reduce((sum, n) => sum + n, 0));
  const pool = sizes.reduce((sum, n) => sum + n, 0);

  const commit = (next: string[]) => {
    onSelect(null);
    onChange(serializeSignatureImages(next));
  };

  const handleFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length === 0) return;
    setErrors([]);
    setProcessing(true);
    const problems: string[] = [];
    let current = list;
    try {
      for (const file of files) {
        if (current.length >= MAX_SIGNATURE_IMAGES) {
          problems.push(MAX_MESSAGE);
          break;
        }
        try {
          const next = [...current, await processSignatureImageFile(file)];
          if (serializeSignatureImages(next).length > SIGNATURE_IMAGE_LIST_MAX_CHARS) {
            problems.push(`${file.name}: ${TOO_BIG_MESSAGE}`);
            continue;
          }
          current = next;
          commit(current);
        } catch (err) {
          problems.push(`${file.name}: ${err instanceof Error ? err.message : 'تعذر معالجة الصورة.'}`);
        }
      }
    } finally {
      setErrors(problems);
      setProcessing(false);
    }
  };

  const removeAt = (index: number) => {
    setErrors([]);
    commit(list.filter((_, i) => i !== index));
  };

  const reset = (next: string[]) => {
    setErrors([]);
    commit(next);
  };

  // A custom tile toggles its image in the preview; the built-in tile steps through its images, then switches the preview off
  const clickTile = (index: number) => {
    const first = offsets[index];
    const end = first + sizes[index];
    if (sizes[index] === 0) return;
    if (selectedIndex === null || selectedIndex < first || selectedIndex >= end) onSelect(first);
    else if (selectedIndex + 1 < end) onSelect(selectedIndex + 1);
    else onSelect(null);
  };

  return (
    <div className="flex flex-col gap-3">
      <span className="t-label text-ink dark:text-ink-dark">صور التوقيع</span>
      <div className="flex flex-col gap-4 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl p-4">
        {list.length === 0 ? (
          // The receipt paper is always black on white, so the image areas stay white in both app themes
          <div className="h-16 rounded-lg border border-line dark:border-line-dark bg-white flex items-center justify-center gap-2 text-xs font-semibold text-ink-muted">
            <ImageOff className="w-4 h-4" />
            بدون صورة
          </div>
        ) : (
          <ul className="flex flex-wrap gap-3 m-0 p-0 list-none">
            {list.map((item, index) => {
              const isDefault = item === SIGNATURE_IMAGE_DEFAULT;
              const first = offsets[index];
              const selected = selectedIndex !== null && selectedIndex >= first && selectedIndex < first + sizes[index];
              const shown = isDefault ? builtIns[selected && selectedIndex !== null ? selectedIndex - first : 0] : item;
              return (
                <li
                  key={`${index}-${item.length}`}
                  className={`w-36 rounded-lg border bg-surface dark:bg-surface-dark overflow-hidden flex flex-col ${
                    selected ? 'border-paid dark:border-paid-bright ring-2 ring-paid/40 dark:ring-paid-bright/40' : 'border-line dark:border-line-dark'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => clickTile(index)}
                    aria-pressed={selected}
                    title={isDefault && sizes[index] > 1 ? 'عرض الصورة التالية في معاينة الوصل' : 'عرض هذه الصورة في معاينة الوصل'}
                    className="relative h-14 p-1.5 bg-white flex items-center justify-center cursor-pointer"
                  >
                    {shown ? (
                      <img
                        src={shown}
                        alt={isDefault ? 'الصورة الافتراضية' : `صورة التوقيع ${index + 1}`}
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <ImageOff className="w-4 h-4 text-ink-muted" />
                    )}
                    {isDefault && sizes[index] > 1 && (
                      <span dir="ltr" className="absolute top-1 left-1 rounded bg-ink text-white dark:bg-surface-dark-3 dark:text-ink-dark px-1 text-micro font-bold">
                        +{sizes[index] - 1}
                      </span>
                    )}
                  </button>
                  <div className="h-11 pr-2 flex items-center justify-between gap-1 border-t border-line dark:border-line-dark">
                    <span className="flex flex-col leading-tight text-micro font-bold text-ink-muted dark:text-ink-muted-dark">
                      <span>{isDefault ? 'الافتراضية' : `صورة ${index + 1}`}</span>
                      {isDefault && <span className="font-semibold">{countLabel(sizes[index])}</span>}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeAt(index)}
                      disabled={processing}
                      aria-label="حذف الصورة"
                      title="حذف الصورة"
                      className="w-11 h-11 flex items-center justify-center text-danger dark:text-danger-bright hover:bg-danger-soft dark:hover:bg-danger-dark-soft disabled:opacity-60 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={processing}
            className={`${BUTTON_BASE} ${BUTTON_IDLE}`}
          >
            {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            <span>{processing ? 'جاري تجهيز الصورة...' : 'إضافة صورة'}</span>
          </button>
          <button
            type="button"
            onClick={() => reset([SIGNATURE_IMAGE_DEFAULT])}
            disabled={processing}
            aria-pressed={onlyDefault}
            className={`${BUTTON_BASE} ${onlyDefault ? BUTTON_SELECTED : BUTTON_IDLE}`}
          >
            <RotateCcw className="w-4 h-4" />
            <span>إرجاع الافتراضية</span>
          </button>
          <button
            type="button"
            onClick={() => reset([])}
            disabled={processing}
            aria-pressed={list.length === 0}
            className={`${BUTTON_BASE} ${list.length === 0 ? BUTTON_SELECTED : BUTTON_IDLE}`}
          >
            <ImageOff className="w-4 h-4" />
            <span>بدون صور</span>
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={SIGNATURE_IMAGE_ACCEPT}
            className="hidden"
            data-testid="signature-image-input"
            onChange={(e) => void handleFiles(e)}
          />
        </div>
        <span className="text-xs font-bold text-ink dark:text-ink-dark" data-testid="signature-image-caption">
          {poolCaption(pool)}
        </span>
      </div>
      {errors.length > 0 ? (
        <div className="flex flex-col gap-1" role="alert">
          {errors.map((message, index) => (
            <span key={`${index}-${message}`} className="text-xs font-semibold text-danger dark:text-danger-bright">{message}</span>
          ))}
        </div>
      ) : (
        <span className="text-xs text-ink-muted dark:text-ink-muted-dark leading-relaxed">
          تتحول الصورة تلقائياً إلى أبيض وأسود وتُقص حوافها لتناسب الطابعة الحرارية. تُختار صورة واحدة عشوائياً لكل فاتورة، وتظهر نفس الصورة عند إعادة طباعة نفس الفاتورة.
        </span>
      )}
    </div>
  );
};
