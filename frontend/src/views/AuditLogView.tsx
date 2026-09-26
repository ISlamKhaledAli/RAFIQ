import { useState, useEffect } from 'react';
import { 
  ShieldAlert, 
  ShieldCheck,
  RefreshCw, 
  Filter, 
  Clock, 
  User, 
  FileText,
  Tag,
  AlertTriangle,
  ArrowRightLeft,
  Lock,
  CheckCircle2
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import type { AuditLogEntry, AuditChainVerificationResult } from '../types/models';
import { piastersToPounds } from '../utils/money';

const ACTION_FILTERS = [
  { id: '', label: 'جميع العمليات الحساسة' },
  { id: 'price_update', label: 'تعديل سعر البيع' },
  { id: 'cost_update', label: 'تعديل تكلفة الشراء' },
  { id: 'stock_adjust', label: 'تسوية رصيد المخزون' },
  { id: 'sale_create', label: 'إصدار فواتير البيع' },
  { id: 'product_delete', label: 'حذف الأصناف' },
  { id: 'product_create', label: 'إضافة أصناف جديدة' },
];

export const AuditLogView = () => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedAction, setSelectedAction] = useState('');
  const [verification, setVerification] = useState<AuditChainVerificationResult | null>(null);
  const [verifying, setVerifying] = useState(false);

  const loadAuditLogs = async (actionFilter = selectedAction) => {
    setLoading(true);
    try {
      const data = await invoke<AuditLogEntry[]>('audit:getLogs', {
        limit: 150,
        action: actionFilter || undefined,
      });
      setLogs(data || []);
    } catch (err: unknown) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyChain = async () => {
    setVerifying(true);
    try {
      const res = await invoke<AuditChainVerificationResult>('audit:verifyChain');
      setVerification(res);
    } catch (err: unknown) {
      console.error('Failed to verify audit chain:', err);
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [data, chainRes] = await Promise.all([
          invoke<AuditLogEntry[]>('audit:getLogs', {
            limit: 150,
            action: selectedAction || undefined,
          }),
          invoke<AuditChainVerificationResult>('audit:verifyChain').catch(() => null)
        ]);
        if (active) {
          setLogs(data || []);
          if (chainRes) setVerification(chainRes);
        }
      } catch (err: unknown) {
        console.error('Failed to load audit logs:', err);
      }
    })();
    return () => {
      active = false;
    };
  }, [selectedAction]);

  const renderDetails = (log: AuditLogEntry) => {
    if (!log.detailsJson) return <span className="text-ink-muted text-xs">—</span>;

    try {
      const details = JSON.parse(log.detailsJson) as Record<string, unknown>;

      if (log.action === 'price_update') {
        const oldP = piastersToPounds(Number(details.oldPrice) || 0).toFixed(2);
        const newP = piastersToPounds(Number(details.newPrice) || 0).toFixed(2);
        return (
          <div className="flex items-center gap-1.5 text-xs font-mono">
            <span className="font-sans text-ink font-semibold">{String(details.productName || '')}:</span>
            <span className="text-danger line-through">{oldP} ج.م</span>
            <ArrowRightLeft className="w-3 h-3 text-ink-muted" />
            <span className="text-paid font-bold">{newP} ج.م</span>
          </div>
        );
      }

      if (log.action === 'cost_update') {
        const oldC = piastersToPounds(Number(details.oldCost) || 0).toFixed(2);
        const newC = piastersToPounds(Number(details.newCost) || 0).toFixed(2);
        return (
          <div className="flex items-center gap-1.5 text-xs font-mono">
            <span className="font-sans text-ink font-semibold">{String(details.productName || '')}:</span>
            <span className="text-ink-muted line-through">{oldC} ج.م</span>
            <ArrowRightLeft className="w-3 h-3 text-ink-muted" />
            <span className="text-brand font-bold">{newC} ج.م</span>
          </div>
        );
      }

      if (log.action === 'stock_adjust') {
        const oldS = ((Number(details.oldStock) || 0) / 1000).toFixed(0);
        const newS = ((Number(details.newStock) || 0) / 1000).toFixed(0);
        return (
          <div className="flex items-center gap-1.5 text-xs font-mono">
            <span className="font-sans text-ink font-semibold">{String(details.productName || '')}:</span>
            <span className="text-ink-muted">{oldS} ق</span>
            <ArrowRightLeft className="w-3 h-3 text-ink-muted" />
            <span className="text-brand font-bold">{newS} ق</span>
          </div>
        );
      }

      if (log.action === 'sale_create') {
        const total = piastersToPounds(Number(details.totalPiasters) || 0).toFixed(2);
        return (
          <div className="text-xs text-ink font-sans">
            فاتورة رقم <span className="font-mono font-bold text-brand">#{String(details.invoiceNumber || '')}</span> بمبلغ{' '}
            <span className="font-mono font-bold">{total} ج.م</span> ({String(details.itemCount || 0)} أصناف)
          </div>
        );
      }

      return (
        <span className="text-xs font-mono text-ink-muted truncate max-w-xs block">
          {log.detailsJson}
        </span>
      );
    } catch {
      return <span className="text-xs font-mono text-ink-muted truncate">{log.detailsJson}</span>;
    }
  };

  const getActionBadge = (action: string, label?: string) => {
    switch (action) {
      case 'price_update':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-danger-soft text-danger border border-danger-border flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            <span>{label || 'تعديل سعر'}</span>
          </span>
        );
      case 'cost_update':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-warn-soft text-warn border border-warn-border flex items-center gap-1">
            <Tag className="w-3 h-3" />
            <span>{label || 'تعديل تكلفة'}</span>
          </span>
        );
      case 'stock_adjust':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-brand-soft text-brand border border-brand/20 flex items-center gap-1">
            <ArrowRightLeft className="w-3 h-3" />
            <span>{label || 'تسوية مخزون'}</span>
          </span>
        );
      case 'sale_create':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-paid-soft text-paid border border-paid-border flex items-center gap-1">
            <FileText className="w-3 h-3" />
            <span>{label || 'إصدار فاتورة'}</span>
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-surface-2 text-ink border border-line">
            {label || action}
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col h-full bg-canvas p-4 gap-3 overflow-hidden select-none">
      {/* 1. Top Header Toolbar */}
      <div className="h-[56px] bg-surface hairline-all rounded-[6px] px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-danger-soft text-danger flex items-center justify-center font-bold">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-[15px] font-bold text-ink leading-tight m-0">
              سجل العمليات الحساسة والأمان (Audit Log)
            </h2>
            <p className="text-[11px] text-ink-muted m-0">
              توثيق لحظي غير قابل للحذف لتعديل الأسعار والخصومات وحركات البيع
            </p>
          </div>
        </div>

        {/* Filters and Actions */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-surface-2 px-2.5 py-1 rounded border border-line">
            <Filter className="w-3.5 h-3.5 text-ink-muted" />
            <select
              value={selectedAction}
              onChange={(e) => setSelectedAction(e.target.value)}
              className="bg-transparent text-[12px] font-semibold text-ink focus:outline-none cursor-pointer"
            >
              {ACTION_FILTERS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => void handleVerifyChain()}
            disabled={verifying}
            className="h-[36px] px-3 flex items-center gap-1.5 bg-brand-soft hover:bg-brand/20 border border-brand/30 text-brand text-xs font-bold rounded transition-colors"
            title="فحص السلسلة المشفرة للتأكد من عدم التلاعب اليدوي بقاعدة البيانات"
          >
            <ShieldCheck className={`w-4 h-4 ${verifying ? 'animate-spin' : ''}`} />
            <span>{verifying ? 'جارِ التحقق...' : 'فحص سلامة السجل'}</span>
          </button>

          <button
            onClick={() => void loadAuditLogs()}
            disabled={loading}
            className="h-[36px] w-[36px] flex items-center justify-center bg-surface-2 hover:bg-surface border border-line text-ink-muted hover:text-ink rounded transition-colors"
            title="تحديث السجل"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Verification Status Banner (Feature #169 / Task 169-4) */}
      {verification && (
        <div className={`p-3 rounded-[6px] border flex items-center justify-between text-xs transition-all ${
          verification.isTampered 
            ? 'bg-danger-soft border-danger/40 text-danger' 
            : 'bg-paid-soft/50 border-paid/30 text-paid'
        }`}>
          <div className="flex items-center gap-2.5">
            {verification.isTampered ? (
              <AlertTriangle className="w-5 h-5 shrink-0 text-danger" />
            ) : (
              <CheckCircle2 className="w-5 h-5 shrink-0 text-paid" />
            )}
            <div>
              <p className="font-bold m-0 text-[13px]">
                {verification.isTampered 
                  ? 'تحذير أمني حرج: تم اكتشاف تلاعب مباشر بسجل العمليات!' 
                  : 'سلسلة العمليات سليمة ومحمية بالتوقيع الرقمي المتسلسل'}
              </p>
              <p className="m-0 text-xs opacity-90">
                {verification.isTampered 
                  ? verification.errorMessage 
                  : `تم فحص وتأكيد سلامة جميع السجلات (${verification.totalRecordsVerified} سجل) ومطابقة بصمات SHA-256 بنجاح، مما يثبت عدم تعديل أو حذف أي سجل من خارج النظام.`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 font-mono text-[11px] bg-surface/80 px-2.5 py-1 rounded border border-line text-ink">
            <Lock className="w-3 h-3 text-paid" />
            <span>SHA-256 Tamper-Proof</span>
          </div>
        </div>
      )}

      {/* 2. Audit Log Data Table */}
      <div className="flex-1 bg-surface hairline-all rounded-[6px] flex flex-col overflow-hidden">
        {/* Table Header */}
        <div className="h-[38px] bg-surface-2 hairline-b px-4 grid grid-cols-12 items-center text-[12px] font-bold text-ink-muted shrink-0 select-none">
          <span className="col-span-1 text-center">#</span>
          <span className="col-span-2">الوقت والتاريخ</span>
          <span className="col-span-2">المستخدم المسؤول</span>
          <span className="col-span-2">نوع العملية</span>
          <span className="col-span-4">التفاصيل والتغييرات</span>
          <span className="col-span-1 text-left">بصمة السلسلة</span>
        </div>

        {/* Table Body */}
        <div className="flex-1 overflow-y-auto divide-y divide-line">
          {logs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-ink-muted gap-2 p-6">
              <ShieldAlert className="w-12 h-12 stroke-[1.2] text-ink-muted opacity-40" />
              <p className="text-[14px] font-semibold text-ink m-0">لا توجد عمليات مسجلة في هذا التصنيف</p>
              <p className="text-[12px] text-ink-muted m-0">
                يتم تسجيل أي تعديل للأسعار أو إصدار للفواتير تلقائياً وموثقاً هنا
              </p>
            </div>
          ) : (
            logs.map((log, index) => {
              const formattedDate = log.createdAt
                ? new Date(log.createdAt).toLocaleString('ar-EG', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '—';

              return (
                <div
                  key={log.id}
                  className="h-[46px] hairline-b px-4 grid grid-cols-12 items-center text-[13px] hover:bg-surface-2 transition-colors"
                >
                  <span className="col-span-1 text-center font-mono text-xs text-ink-muted">
                    {index + 1}
                  </span>

                  <span className="col-span-2 flex items-center gap-1.5 text-xs text-ink-muted font-sans truncate">
                    <Clock className="w-3.5 h-3.5 shrink-0 text-ink-muted" />
                    <span>{formattedDate}</span>
                  </span>

                  <span className="col-span-2 flex items-center gap-1.5 text-xs font-semibold text-ink truncate">
                    <User className="w-3.5 h-3.5 shrink-0 text-brand" />
                    <span>{log.userDisplayName || 'مدير النظام'}</span>
                  </span>

                  <div className="col-span-2 flex items-center">
                    {getActionBadge(log.action, log.actionArabic)}
                  </div>

                  <div className="col-span-4 truncate pr-1">
                    {renderDetails(log)}
                  </div>

                  <div 
                    className="col-span-1 flex items-center justify-end gap-1 font-mono text-[10px] text-ink-muted truncate" 
                    title={`معرف السجل: ${log.id}\nبصمة التشفير: ${log.recordHash || 'محسوبة'}\nبصمة السجل السابق: ${log.prevHash || 'Genesis'}`}
                  >
                    <Lock className="w-2.5 h-2.5 text-paid shrink-0" />
                    <span className="truncate">{log.recordHash ? log.recordHash.slice(0, 6) : log.id.slice(0, 6)}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Table Footer */}
        <div className="h-[36px] bg-surface-2 hairline-t px-4 flex items-center justify-between text-xs text-ink-muted shrink-0">
          <span>إجمالي العمليات المسجلة في السجل: {logs.length} عملية</span>
          <span className="font-mono text-[11px] text-paid flex items-center gap-1">
            <Lock className="w-3 h-3 text-paid" />
            نظام التدقيق الداخلي مشفر ومتسلسل بمعايير SHA-256
          </span>
        </div>
      </div>
    </div>
  );
};
