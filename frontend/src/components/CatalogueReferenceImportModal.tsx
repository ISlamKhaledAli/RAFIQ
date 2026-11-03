import { useEffect, useRef, useState } from 'react';
import { X, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Category } from '../types/models';
import type { CataloguePage, CatalogueRecord, CatalogueSelection, CataloguePreview, CatalogueRequest } from '../types/catalogue.ts';
import { selectionErrors, requiresBelowCostConfirmation, editCatalogueSelection } from '../types/catalogue.ts';
import { catalogueClient } from '../bridge/catalogueClient.ts';
import { CustomSelect } from './CustomSelect';
import { MoneyInput } from './MoneyInput';
import { usePermission } from '../utils/usePermission';

const groups = [
  { value: '', label: 'كل المجموعات' }, { value: 'dairy', label: 'ألبان' },
  { value: 'beverages', label: 'مشروبات' }, { value: 'snacks', label: 'سناكس وحلويات' },
  { value: 'staples', label: 'حبوب ومكرونة' }, { value: 'pantry', label: 'مؤن وصلصات' },
];
interface Props { categories: Category[]; onClose: () => void; onSuccess: (summary: string) => void }
export function CatalogueReferenceImportModal({ categories, onClose, onSuccess }: Props) {
  const allowed = usePermission('products.import');
  const [page, setPage] = useState(1), [query, setQuery] = useState(''), [category, setCategory] = useState('');
  const [data, setData] = useState<CataloguePage | null>(null);
  const [selected, setSelected] = useState<CatalogueRecord | null>(null);
  const [selection, setSelection] = useState<CatalogueSelection | null>(null);
  const [preview, setPreview] = useState<CataloguePreview | null>(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(false);
  const [attemptId, setAttemptId] = useState(() => crypto.randomUUID());
  const [applyConfirmed, setApplyConfirmed] = useState(false);
  const applying = useRef(false);
  useEffect(() => {
    let active = true;
    if (!allowed) return;
    setLoading(true);
    setError('');
    const timer = setTimeout(() => {
      catalogueClient.getReference(page, query, category).then(result => {
        if (active) setData(result);
      }).catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : 'تعذر فتح المراجع المحلية'); })
        .finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [page, query, category, allowed]);
  function choose(record: CatalogueRecord) {
    if (busy) return;
    setSelected(record);
    setSelection({ recordId: record.recordId, confirmedBarcode: '', confirmedPack: '', identityConfirmed: false,
      pricesConfirmed: false, belowCostConfirmed: false, zeroCostConfirmed: false, salePricePiasters: null, costPiasters: null, categoryId: '' });
    setPreview(null); setApplyConfirmed(false); setAttemptId(crypto.randomUUID()); setError('');
  }
  function change(patch: Partial<CatalogueSelection>) {
    if (busy || !selection) return;
    const updated = editCatalogueSelection(selection, patch);
    setSelection(updated.selection);
    setPreview(updated.preview); setApplyConfirmed(updated.applyConfirmed); setAttemptId(crypto.randomUUID()); setError('');
  }
  async function review() {
    if (!selection || !selected || !data || busy) return;
    const errors = selectionErrors(selection, selected);
    if (errors.length) { setError(errors.join('؛ ')); return; }
    setBusy(true); setError('');
    try { setPreview(await catalogueClient.preview({ datasetSha256: data.manifest.datasetSha256, selections: [selection] })); }
    catch (err) { setError(err instanceof Error ? err.message : 'تعذرت المعاينة'); }
    finally { setBusy(false); }
  }
  async function apply() {
    if (!selection || !data || !preview || !applyConfirmed || busy || applying.current) return;
    applying.current = true; setBusy(true); setError('');
    const request: CatalogueRequest = { datasetSha256: data.manifest.datasetSha256, selections: [selection],
      expectedPreviewHash: preview.previewHash, attemptId, confirmApply: true };
    try {
      const result = await catalogueClient.apply(request);
      onSuccess(`تمت إضافة ${result.createdProductIds.length} صنف برصيد صفر؛ تم تجاوز ${result.skippedRecordIds.length} تطابق دون تعديل.`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر التطبيق؛ أعد نفس المحاولة إذا انقطع الاتصال');
    } finally { applying.current = false; setBusy(false); }
  }
  const input = 'w-full rounded border border-line dark:border-line-dark bg-surface dark:bg-surface-dark-2 px-2 py-1.5 text-ink dark:text-ink-dark';
  return <div className="fixed inset-0 z-[60] bg-black/60 p-3 flex items-center justify-center" dir="rtl">
    <section role="dialog" aria-modal="true" aria-label="مراجعة المراجع الغذائية" className="bg-surface dark:bg-surface-dark text-ink dark:text-ink-dark rounded-lg border border-line dark:border-line-dark w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden text-xs">
      <header className="p-3 border-b border-line dark:border-line-dark flex justify-between items-center">
        <h2 className="font-bold">مراجع غذائية محلية — إضافة جديدة فقط</h2>
        <button type="button" aria-label="إغلاق" disabled={busy} onClick={onClose}><X size={18} /></button>
      </header>
      <div className="p-3 overflow-y-auto space-y-3">
        <p className="p-2 bg-warn/10 dark:bg-warn-dark-soft rounded text-ink dark:text-ink-dark">بيانات مجتمعية غير معتمدة. تحقق من العلامة والنوع والكمية والعبوة في يدك. لا توجد أسعار مقترحة؛ لا تعديل ولا إعادة تنشيط لأي صنف موجود. الرصيد الافتتاحي صفر دائماً.</p>
        {data && <div className="text-ink-muted dark:text-ink-dark-muted break-words">
          <p>{data.manifest.attribution}</p>
          <p>{data.manifest.datasetId} — {data.manifest.eligibleCount} مرشح؛ {data.manifest.quarantinedCount} معزول</p>
          {data.manifest.pilotCoverageStatus !== 'engineering-pilot-target-met' && <p className="text-warn dark:text-warn-bright">
            حزمة جزئية؛ لم يتحقق هدف التجربة الهندسي (٣٠٠ هوية و٢٥ في كل مجموعة). لا تمثل تغطية شاملة للسوق.
          </p>}
          <p>المجموعات: {Object.entries(data.manifest.coverage).map(([group, count]) => `${groups.find(g => g.value === group)?.label ?? group}: ${count}`).join(' | ')}</p>
          <a className="text-brand dark:text-brand-bright underline" href="/catalogue/ATTRIBUTION.md" target="_blank" rel="noreferrer">المصدر والترخيص ODbL / DbCL والتزامات إعادة التوزيع</a>
        </div>}
        {!allowed && <p role="alert" className="text-danger dark:text-danger-bright">لا توجد صلاحية استيراد الأصناف.</p>}
        {error && <p role="alert" className="text-danger dark:text-danger-bright break-words">{error}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="flex items-center gap-2"><Search size={16} /><input className={input} aria-label="بحث المراجع" disabled={busy || !allowed} value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} placeholder="اسم أو علامة أو باركود" /></label>
          <CustomSelect options={groups} value={category} onChange={value => { if (!busy) { setCategory(value); setPage(1); } }} />
        </div>
        {loading && <p>جارٍ قراءة الحزمة المحلية...</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {data?.records.map(record => <button type="button" key={record.recordId} disabled={busy || !allowed}
            className={`p-2 border rounded text-right break-words ${selected?.recordId === record.recordId ? 'border-brand dark:border-brand-bright bg-brand-soft dark:bg-brand-dark-soft' : 'border-line dark:border-line-dark bg-surface dark:bg-surface-dark-2'}`} onClick={() => choose(record)}>
            <strong>{record.nameOriginal}</strong><p>{record.brand} — {record.packDescription}</p><p dir="ltr">{record.gtin}</p>
          </button>)}
        </div>
        <div className="flex justify-between items-center">
          <button type="button" disabled={page <= 1 || busy || loading} onClick={() => setPage(p => p - 1)} aria-label="السابق"><ChevronRight size={18} /></button>
          <span>{page} / {Math.max(1, Math.ceil((data?.total ?? 0) / 25))}</span>
          <button type="button" disabled={busy || loading || page * 25 >= (data?.total ?? 0)} onClick={() => setPage(p => p + 1)} aria-label="التالي"><ChevronLeft size={18} /></button>
        </div>
        {selected && selection && <fieldset disabled={busy} className="border border-line dark:border-line-dark rounded p-3 space-y-3">
          <legend className="font-bold">تأكيد التاجر: {selected.nameOriginal}</legend>
          <p className="break-words text-ink-muted dark:text-ink-dark-muted">OFF: {selected.provenance.sourceUrl} — تعديل المصدر: {selected.provenance.sourceModifiedAt} — جلب: {selected.provenance.retrievedAt}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label>امسح الباركود الفعلي<input dir="ltr" className={input} value={selection.confirmedBarcode} onChange={e => change({ confirmedBarcode: e.target.value })} /></label>
            <label>اكتب كمية العبوة المطابقة: {selected.packDescription}<input className={input} value={selection.confirmedPack} onChange={e => change({ confirmedPack: e.target.value })} /></label>
            <label>سعر البيع الفعلي<MoneyInput valuePiasters={selection.salePricePiasters ?? 0} onChangePiasters={value => change({ salePricePiasters: value })} /></label>
            <label>التكلفة الفعلية<MoneyInput valuePiasters={selection.costPiasters ?? 0} onChangePiasters={value => change({ costPiasters: value, zeroCostConfirmed: false })} /></label>
          </div>
          <label className="flex gap-2"><input type="checkbox" checked={selection.zeroCostConfirmed} onChange={e => change({ zeroCostConfirmed: e.target.checked, costPiasters: e.target.checked ? 0 : null })} />أؤكد صراحة أن تكلفة هذا الصنف صفر فعلاً</label>
          <CustomSelect placeholder="اختر قسماً موجوداً" value={selection.categoryId} options={categories.filter(c => c.isActive !== false).map(c => ({ value: c.id, label: c.name }))} onChange={value => change({ categoryId: value })} />
          {!categories.some(c => c.isActive !== false) && <p className="text-warn dark:text-warn-bright">لا توجد أقسام متاحة. أنشئ قسماً من إدارة الأقسام في شاشة الأصناف، ثم أعد فتح المراجع.</p>}
          <label className="flex gap-2"><input type="checkbox" checked={selection.identityConfirmed} onChange={e => change({ identityConfirmed: e.target.checked })} />راجعت العلامة والنوع والباركود والكمية والعبوة الفعلية، دون تخمين معامل عبوة</label>
          <label className="flex gap-2"><input type="checkbox" checked={selection.pricesConfirmed} onChange={e => change({ pricesConfirmed: e.target.checked })} />هذه أسعار المتجر الفعلية وليست أسعاراً من المرجع</label>
          {requiresBelowCostConfirmation(selection) && <div className="space-y-2 rounded border border-danger dark:border-danger-bright p-2 text-danger dark:text-danger-bright">
            <p role="alert">سعر البيع أقل من التكلفة. البيع بهذه الأسعار يحقق خسارة؛ يلزم تأكيد مستقل قبل المعاينة والتطبيق.</p>
            <label className="flex gap-2"><input type="checkbox" checked={selection.belowCostConfirmed}
              onChange={e => change({ belowCostConfirmed: e.target.checked })} />أؤكد أن سعر البيع أقل من التكلفة وأوافق على البيع بخسارة بهذه الأسعار.</label>
          </div>}
          <button type="button" disabled={!allowed || busy} className="bg-brand text-white rounded px-4 py-2" onClick={() => void review()}>معاينة بدون كتابة</button>
          {preview && <div className="space-y-2 border-t border-line dark:border-line-dark pt-2">
            <p>{preview.rows[0]?.status === 'existing' ? 'الباركود مملوك لصنف موجود أو مؤرشف؛ سيتم التجاوز دون أي تعديل.' : 'صنف جديد برصيد صفر. أعد المراجعة إذا تغيرت البيانات أو الملكية.'}</p>
            <label className="flex gap-2"><input type="checkbox" checked={applyConfirmed} onChange={e => setApplyConfirmed(e.target.checked)} />أوافق على نتيجة المعاينة والإضافة فقط</label>
            <button type="button" disabled={!allowed || !applyConfirmed || busy} className="bg-brand text-white rounded px-4 py-2 disabled:opacity-50" onClick={() => void apply()}>{busy ? 'جارٍ التنفيذ...' : 'تطبيق المراجعة'}</button>
          </div>}
        </fieldset>}
      </div>
    </section>
  </div>;
}
