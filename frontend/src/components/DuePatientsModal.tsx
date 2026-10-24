import React from 'react';
import {
  HeartPulse,
  Phone,
  Clock,
  Pill,
  X,
  AlertTriangle,
  ChevronLeft,
  Users,
} from 'lucide-react';
import type { PatientDueAlert } from '../types/patient';
import { useModalDismiss } from '../hooks/useModalDismiss';

interface DuePatientsModalProps {
  isOpen: boolean;
  onClose: () => void;
  alerts: PatientDueAlert[];
  onOpenCustomerProfile?: (customerId: string, customerName: string, customerPhone?: string) => void;
}

export const DuePatientsModal: React.FC<DuePatientsModalProps> = ({
  isOpen,
  onClose,
  alerts,
  onOpenCustomerProfile,
}) => {
  const { handleBackdropClick } = useModalDismiss({ isOpen, onClose });

  if (!isOpen) return null;

  const totalOverdue = alerts.reduce((sum, a) => sum + (a.overdueCount || 0), 0);
  const totalDueSoon = alerts.reduce((sum, a) => sum + (a.dueSoonCount || 0), 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={handleBackdropClick}
    >
      <div
        className="bg-surface dark:bg-surface-dark w-full max-w-2xl rounded-2xl border border-line dark:border-line-dark shadow-2xl flex flex-col max-h-[88vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-warn-soft dark:bg-warn-dark-soft border border-warn/20 dark:border-warn-bright/30 flex items-center justify-center text-warn dark:text-warn-bright shadow-2xs">
              <HeartPulse className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm sm:text-base text-ink dark:text-ink-dark">
                  المرضى المستحقين لصرف العلاج الشهري
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-warn text-white">
                  {alerts.length} مريض
                </span>
              </div>
              <p className="text-xs text-ink-muted dark:text-ink-dark-muted mt-0.5">
                متابعة أدوية الأمراض المزمنة للتواصل مع المرضى وتذكيرهم بمواعيد الصرف الدوري
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface dark:hover:bg-surface-dark transition-colors cursor-pointer"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Quick Summary Pill Bar */}
        <div className="px-5 py-2.5 bg-surface-2/40 dark:bg-surface-dark-2/40 border-b border-line dark:border-line-dark flex items-center gap-4 text-xs font-bold shrink-0">
          <div className="flex items-center gap-1.5 text-danger dark:text-danger-bright">
            <AlertTriangle className="w-4 h-4" />
            <span>متأخرين عن موعد الصرف: {totalOverdue} دواء</span>
          </div>
          <div className="flex items-center gap-1.5 text-warn dark:text-warn-bright">
            <Clock className="w-4 h-4" />
            <span>مستحقين خلال الـ 3 أيام القادمة: {totalDueSoon} دواء</span>
          </div>
        </div>

        {/* Patients List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {alerts.length === 0 ? (
            <div className="py-12 text-center text-ink-muted dark:text-ink-dark-muted">
              <Users className="w-10 h-10 text-ink-muted/30 mx-auto mb-2" />
              <p className="text-xs font-bold">لا يوجد مرضى مستحقين لصرف الدواء في الوقت الحالي</p>
              <p className="text-[11px] text-ink-muted/70 mt-1">
                جميع المرضى تم صرف أدويتهم الشهرية بنجاح ومواعيدهم القادمة منتظمة
              </p>
            </div>
          ) : (
            alerts.map((patient) => {
              const hasOverdue = (patient.overdueCount || 0) > 0;
              return (
                <div
                  key={patient.customerId}
                  className={`p-3.5 rounded-xl border transition-all ${
                    hasOverdue
                      ? 'bg-danger-soft/10 dark:bg-danger-dark-soft/10 border-danger/30'
                      : 'bg-warn-soft/10 dark:bg-warn-dark-soft/10 border-warn/30'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-ink dark:text-ink-dark">
                          {patient.customerName}
                        </span>
                        {hasOverdue ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-danger text-white">
                            فات موعد الصرف
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-warn text-white">
                            مستحق الآن
                          </span>
                        )}
                      </div>

                      {patient.customerPhone && (
                        <div className="flex items-center gap-1.5 text-xs text-ink-muted dark:text-ink-dark-muted font-mono mt-1">
                          <Phone className="w-3.5 h-3.5 text-brand" />
                          <span>{patient.customerPhone}</span>
                        </div>
                      )}
                    </div>

                    {/* Action button */}
                    {onOpenCustomerProfile && (
                      <button
                        type="button"
                        onClick={() => {
                          onOpenCustomerProfile(patient.customerId, patient.customerName, patient.customerPhone);
                          onClose();
                        }}
                        className="flex items-center gap-1 h-8 px-3 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark hover:border-brand text-brand dark:text-brand-bright rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer shrink-0"
                      >
                        <span>فتح الملف الطبي</span>
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Medications Pills */}
                  <div className="mt-2.5 pt-2 border-t border-line/60 dark:border-line-dark/60 flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] font-bold text-ink-muted dark:text-ink-dark-muted flex items-center gap-1 ml-1">
                      <Pill className="w-3 h-3 text-brand" />
                      الأدوية المستحقة:
                    </span>
                    {patient.medicationNames.map((medName) => (
                      <span
                        key={medName}
                        className="px-2 py-0.5 rounded-md bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-xs font-bold text-ink dark:text-ink-dark shadow-2xs"
                      >
                        {medName}
                      </span>
                    ))}
                    {patient.earliestDueDate && (
                      <span className="mr-auto text-[10px] font-mono text-ink-muted dark:text-ink-dark-muted">
                        تاريخ الاستحقاق: {patient.earliestDueDate}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2 flex items-center justify-between shrink-0">
          <span className="text-xs text-ink-muted dark:text-ink-dark-muted font-bold">
            إجمالي المرضى المستحقين: {alerts.length}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="h-8.5 px-4 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark hover:bg-surface-2 rounded-xl text-xs font-bold text-ink transition-colors cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
