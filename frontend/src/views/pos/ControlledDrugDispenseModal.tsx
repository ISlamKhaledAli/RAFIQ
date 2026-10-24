import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  X,
  User,
  CreditCard,
  Phone,
  MapPin,
  Stethoscope,
  FileText,
  Calendar,
  Lock,
  Upload,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
} from 'lucide-react';
import type { CartItem } from './types';
import type { ControlledDrugDispense, ControlledMandatoryFields } from '../../types/pharma';
import { invoke } from '../../bridge/ipc';
import { useAuth } from '../../context/useAuth';

interface ControlledDrugDispenseModalProps {
  isOpen: boolean;
  item: CartItem | null;
  onClose: () => void;
  onSave: (dispense: ControlledDrugDispense, prescriptionId?: string) => void;
  onRemoveItem?: (item: CartItem) => void;
}

export const ControlledDrugDispenseModal: React.FC<ControlledDrugDispenseModalProps> = ({
  isOpen,
  item,
  onClose,
  onSave,
  onRemoveItem,
}) => {
  const { hasPermission } = useAuth();
  const canDispenseDirectly = hasPermission ? hasPermission('pharma.controlled.dispense') : false;

  // Form State
  const [patientName, setPatientName] = useState('');
  const [patientNationalId, setPatientNationalId] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
  const [patientAddress, setPatientAddress] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [doctorLicenseNo, setDoctorLicenseNo] = useState('');
  const [prescriptionNo, setPrescriptionNo] = useState('');
  const [prescriptionDate, setPrescriptionDate] = useState('');
  const [notes, setNotes] = useState('');

  // Supervisor PIN Override state
  const [supervisorPin, setSupervisorPin] = useState('');
  const [pinVerified, setPinVerified] = useState(false);
  const [supervisorName, setSupervisorName] = useState('');
  const [pinError, setPinError] = useState('');

  // Image Upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // Mandatory fields config
  const [mandatorySettings, setMandatorySettings] = useState<ControlledMandatoryFields>({
    requirePatientNationalId: true,
    requireDoctorLicense: false,
    requireDoctorName: true,
    requirePrescriptionNo: false,
    requirePrescriptionDate: true,
    requirePatientPhone: false,
  });

  const [formError, setFormError] = useState('');

  // Load mandatory settings and existing item dispense data
  useEffect(() => {
    if (!isOpen) return;

    // Fetch mandatory fields configuration from backend
    void invoke<ControlledMandatoryFields>('pharma:getControlledMandatoryFields')
      .then((cfg) => {
        if (cfg) {
          setMandatorySettings(cfg);
        }
      })
      .catch(() => null);

    // If item already has a dispense record, populate fields
    if (item?.controlledDispense) {
      const d = item.controlledDispense;
      setPatientName(d.patientName || '');
      setPatientNationalId(d.patientNationalId || '');
      setPatientPhone(d.patientPhone || '');
      setPatientAddress(d.patientAddress || '');
      setDoctorName(d.doctorName || '');
      setDoctorLicenseNo(d.doctorLicenseNo || '');
      setPrescriptionNo(d.prescriptionNo || '');
      setPrescriptionDate(d.prescriptionDate || '');
      setNotes(d.notes || '');
      if (d.approvedByName) {
        setSupervisorName(d.approvedByName);
        setPinVerified(true);
      }
    } else {
      // Defaults for new dispense
      setPatientName('');
      setPatientNationalId('');
      setPatientPhone('');
      setPatientAddress('');
      setDoctorName('');
      setDoctorLicenseNo('');
      setPrescriptionNo('');
      setPrescriptionDate(new Date().toISOString().slice(0, 10));
      setNotes('');
      setSupervisorPin('');
      setPinVerified(false);
      setSupervisorName('');
      setSelectedFile(null);
      setImagePreview(null);
    }
    setFormError('');
    setPinError('');
  }, [isOpen, item]);

  // Handle Supervisor PIN verification
  const handleVerifySupervisorPin = async () => {
    if (!supervisorPin.trim()) {
      setPinError('يرجى إدخال رمز PIN للمشرف');
      return;
    }
    try {
      setPinError('');
      const res = await invoke<{ success: boolean; error?: string; supervisorName?: string }>('security:verifyPin', {
        pin: supervisorPin.trim(),
        requiredPermission: 'pharma.controlled.approve',
      });
      if (res && res.success) {
        setPinVerified(true);
        setSupervisorName(res.supervisorName || 'الصيدلي المشرف');
      } else {
        setPinError(res?.error || 'رمز PIN غير صحيح أو لا يملك صلاحية الاعتماد');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setPinError(msg);
    }
  };

  // Handle file selection for prescription image
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Submit & Save Dispense Record
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!item) return;

    // 1. Validate Patient Name
    if (!patientName.trim()) {
      setFormError('اسم المريض إلزامي لصرف أدوية الجدول');
      return;
    }

    // 2. Validate National ID
    const cleanId = patientNationalId.trim();
    if (mandatorySettings.requirePatientNationalId && !cleanId) {
      setFormError('الرقم القومي للمريض إلزامي لصرف هذا الصنف');
      return;
    }
    if (cleanId && (cleanId.length !== 14 || !/^\d+$/.test(cleanId))) {
      setFormError('الرقم القومي يجب أن يتكون من 14 رقماً بالضبط');
      return;
    }

    // 3. Validate Doctor Name
    if (mandatorySettings.requireDoctorName && !doctorName.trim()) {
      setFormError('اسم الطبيب المعالج إلزامي');
      return;
    }

    // 4. Validate Doctor License
    if (mandatorySettings.requireDoctorLicense && !doctorLicenseNo.trim()) {
      setFormError('رقم قيد/ترخيص الطبيب إلزامي حسب إعدادات الرقابة');
      return;
    }

    // 5. Validate Prescription No
    if (mandatorySettings.requirePrescriptionNo && !prescriptionNo.trim()) {
      setFormError('رقم الروشتة إلزامي حسب إعدادات الرقابة');
      return;
    }

    // 6. Validate Prescription Date
    if (mandatorySettings.requirePrescriptionDate && !prescriptionDate.trim()) {
      setFormError('تاريخ تحرير الروشتة إلزامي');
      return;
    }

    // 7. Validate Supervisor Approval if cashier lacks permission
    if (!canDispenseDirectly && !pinVerified) {
      setFormError('يلزم اعتماد الصيدلي المشرف وإدخال رمز PIN لإتمام الصرف');
      return;
    }

    let savedPrescriptionId: string | undefined = undefined;

    // If prescription details or image are present, save/archive prescription
    try {
      setIsUploadingImage(true);
      if (patientName.trim() || prescriptionNo.trim() || selectedFile) {
        const rxPayload = {
          patientName: patientName.trim(),
          patientPhone: patientPhone.trim() || undefined,
          patientNationalId: cleanId || undefined,
          doctorName: doctorName.trim() || undefined,
          prescriptionNo: prescriptionNo.trim() || undefined,
          prescriptionDate: prescriptionDate.trim() || undefined,
          notes: notes.trim() || undefined,
        };

        const rxRes = await invoke<{ id: string }>('prescriptions:save', rxPayload);
        if (rxRes && rxRes.id) {
          savedPrescriptionId = rxRes.id;

          // If image was selected, upload it
          if (selectedFile && imagePreview) {
            const base64Data = imagePreview.split(',')[1];
            const ext = selectedFile.name.split('.').pop() || 'jpg';
            await invoke('prescriptions:uploadImage', {
              prescriptionId: rxRes.id,
              base64Data,
              fileExtension: ext,
            }).catch(() => null);
          }
        }
      }
    } catch (rxErr: unknown) {
      console.warn('Could not archive prescription record:', rxErr);
    } finally {
      setIsUploadingImage(false);
    }

    const dispenseData: ControlledDrugDispense = {
      productId: item.productId,
      productName: item.productName,
      batchId: item.batchId || undefined,
      batchNumber: item.batchNumber || undefined,
      quantityMilli: item.quantityMilli,
      patientName: patientName.trim(),
      patientNationalId: cleanId || undefined,
      patientPhone: patientPhone.trim() || undefined,
      patientAddress: patientAddress.trim() || undefined,
      doctorName: doctorName.trim() || undefined,
      doctorLicenseNo: doctorLicenseNo.trim() || undefined,
      prescriptionNo: prescriptionNo.trim() || undefined,
      prescriptionDate: prescriptionDate.trim() || undefined,
      prescriptionId: savedPrescriptionId,
      approvedByName: supervisorName || undefined,
      notes: notes.trim() || undefined,
      entryType: 'dispense',
    };

    onSave(dispenseData, savedPrescriptionId);
    onClose();
  };

  if (!isOpen || !item) return null;

  return (
    <div className="fixed inset-0 bg-ink/40 dark:bg-black/60 z-50 flex items-center justify-center p-2 sm:p-4 select-none animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-surface dark:bg-surface-dark rounded-2xl border border-warn/40 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="h-14 bg-warn/10 border-b border-warn/30 px-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-warn/20 text-warn">
              <ShieldAlert className="w-5 h-5 text-warn" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-ink dark:text-ink-dark m-0">
                  توثيق صرف دواء جدول ورقابة صيدلية
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-warn/20 text-warn border border-warn/30">
                  إلزامي للرقابة والتفتيش
                </span>
              </div>
              <p className="text-[11px] text-ink-muted m-0">
                الصنف: <span className="font-bold text-ink dark:text-ink-dark">{item.productName}</span>
                {item.batchNumber && (
                  <span className="mr-2 font-mono text-[10px] text-brand">تشغيلة: {item.batchNumber}</span>
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 flex flex-col gap-4 text-xs">
          {formError && (
            <div className="p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Section 1: Patient Information */}
          <div className="p-3.5 bg-surface-2 dark:bg-surface-dark-2 rounded-xl border border-line dark:border-line-dark flex flex-col gap-3">
            <div className="flex items-center gap-2 text-brand font-bold text-xs pb-1 border-b border-line dark:border-line-dark">
              <User className="w-4 h-4 text-brand" />
              <span>بيانات المريض / مستلم الدواء</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-ink dark:text-ink-dark mb-1">
                  اسم المريض ثلاثي <span className="text-danger">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    placeholder="مثال: أحمد عبد الله محمود"
                    className="w-full bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-lg h-9 px-3 text-xs text-ink dark:text-ink-dark focus:outline-none focus:border-brand"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-ink dark:text-ink-dark mb-1">
                  الرقم القومي (14 رقم) {mandatorySettings.requirePatientNationalId && <span className="text-danger">*</span>}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={patientNationalId}
                    onChange={(e) => setPatientNationalId(e.target.value.replace(/[^\d]/g, '').slice(0, 14))}
                    placeholder="14 رقماً بالبطاقة"
                    maxLength={14}
                    className="w-full bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-lg h-9 px-3 pr-8 font-mono text-xs text-ink dark:text-ink-dark focus:outline-none focus:border-brand"
                  />
                  <CreditCard className="w-3.5 h-3.5 text-ink-muted absolute right-2.5 top-3 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-ink dark:text-ink-dark mb-1">
                  رقم الهاتف {mandatorySettings.requirePatientPhone && <span className="text-danger">*</span>}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={patientPhone}
                    onChange={(e) => setPatientPhone(e.target.value)}
                    placeholder="01xxxxxxxxx"
                    className="w-full bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-lg h-9 px-3 pr-8 font-mono text-xs text-ink dark:text-ink-dark focus:outline-none focus:border-brand"
                  />
                  <Phone className="w-3.5 h-3.5 text-ink-muted absolute right-2.5 top-3 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-ink dark:text-ink-dark mb-1">
                  عنوان السكن / الإقامة
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={patientAddress}
                    onChange={(e) => setPatientAddress(e.target.value)}
                    placeholder="المدينة / المنطقة..."
                    className="w-full bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-lg h-9 px-3 pr-8 text-xs text-ink dark:text-ink-dark focus:outline-none focus:border-brand"
                  />
                  <MapPin className="w-3.5 h-3.5 text-ink-muted absolute right-2.5 top-3 pointer-events-none" />
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Medical Prescription & Doctor Details */}
          <div className="p-3.5 bg-surface-2 dark:bg-surface-dark-2 rounded-xl border border-line dark:border-line-dark flex flex-col gap-3">
            <div className="flex items-center gap-2 text-brand font-bold text-xs pb-1 border-b border-line dark:border-line-dark">
              <Stethoscope className="w-4 h-4 text-brand" />
              <span>بيانات الطبيب المعالج والروشتة الطبية</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-ink dark:text-ink-dark mb-1">
                  اسم الطبيب المعالج {mandatorySettings.requireDoctorName && <span className="text-danger">*</span>}
                </label>
                <input
                  type="text"
                  value={doctorName}
                  onChange={(e) => setDoctorName(e.target.value)}
                  placeholder="د. فلان الفلاني"
                  className="w-full bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-lg h-9 px-3 text-xs text-ink dark:text-ink-dark focus:outline-none focus:border-brand"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-ink dark:text-ink-dark mb-1">
                  رقم قيد / ترخيص الطبيب {mandatorySettings.requireDoctorLicense && <span className="text-danger">*</span>}
                </label>
                <input
                  type="text"
                  value={doctorLicenseNo}
                  onChange={(e) => setDoctorLicenseNo(e.target.value)}
                  placeholder="رقم القيد بنقابة الأطباء"
                  className="w-full bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-lg h-9 px-3 font-mono text-xs text-ink dark:text-ink-dark focus:outline-none focus:border-brand"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-ink dark:text-ink-dark mb-1">
                  رقم الروشتة الطبية {mandatorySettings.requirePrescriptionNo && <span className="text-danger">*</span>}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={prescriptionNo}
                    onChange={(e) => setPrescriptionNo(e.target.value)}
                    placeholder="رقم المسلسل أو الروشتة"
                    className="w-full bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-lg h-9 px-3 pr-8 font-mono text-xs text-ink dark:text-ink-dark focus:outline-none focus:border-brand"
                  />
                  <FileText className="w-3.5 h-3.5 text-ink-muted absolute right-2.5 top-3 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-ink dark:text-ink-dark mb-1">
                  تاريخ الروشتة {mandatorySettings.requirePrescriptionDate && <span className="text-danger">*</span>}
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={prescriptionDate}
                    onChange={(e) => setPrescriptionDate(e.target.value)}
                    className="w-full bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-lg h-9 px-3 pr-8 font-mono text-xs text-ink dark:text-ink-dark focus:outline-none focus:border-brand"
                  />
                  <Calendar className="w-3.5 h-3.5 text-ink-muted absolute right-2.5 top-3 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Notes / Clinical indication */}
            <div>
              <label className="block text-[11px] font-bold text-ink dark:text-ink-dark mb-1">
                ملاحظات الصرف أو التشخيص الطبي
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="أي ملاحظات خاصة بالجرعة أو تعليمات الطبيب..."
                rows={2}
                className="w-full bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-lg p-2.5 text-xs text-ink dark:text-ink-dark focus:outline-none focus:border-brand"
              />
            </div>

            {/* Image Attachment */}
            <div className="pt-2 border-t border-line dark:border-line-dark flex items-center justify-between">
              <div className="flex items-center gap-2">
                <label className="h-8 px-3 rounded-lg bg-surface border border-line hover:border-brand text-ink text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs">
                  <Upload className="w-3.5 h-3.5 text-brand" />
                  <span>إرفاق صورة الروشتة / إذن الصرف</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
                {selectedFile && (
                  <span className="text-[11px] text-paid font-medium flex items-center gap-1">
                    <FileCheck className="w-3.5 h-3.5 text-paid" />
                    <span>تم اختيار الصورة ({selectedFile.name})</span>
                  </span>
                )}
              </div>

              {imagePreview && (
                <div className="relative w-10 h-10 rounded border border-line overflow-hidden shrink-0">
                  <img src={imagePreview} alt="Prescription Preview" className="w-full h-full object-cover" />
                </div>
              )}
            </div>
          </div>

          {/* Section 3: Pharmacist / Supervisor PIN Override (if unauthorized) */}
          {!canDispenseDirectly && (
            <div className="p-3.5 bg-danger/5 dark:bg-danger/10 rounded-xl border border-danger/30 flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-danger font-bold text-xs">
                  <Lock className="w-4 h-4 text-danger" />
                  <span>اعتماد الصيدلي المشرف إلزامي (PIN Override)</span>
                </div>
                {pinVerified && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-paid-soft text-paid border border-paid/30 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>تم الاعتماد: {supervisorName}</span>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-ink-muted m-0">
                المستخدم الحالي لا يملك صلاحية صرف أدوية الجدول مباشرة، يلزم إدخال رمز PIN لصيدلي مشرف أو مدير معتمد.
              </p>

              {!pinVerified ? (
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    value={supervisorPin}
                    onChange={(e) => setSupervisorPin(e.target.value)}
                    placeholder="رمز PIN للمشرف..."
                    maxLength={10}
                    className="w-40 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-lg h-9 px-3 text-center font-mono text-sm tracking-widest text-ink dark:text-ink-dark focus:outline-none focus:border-brand"
                  />
                  <button
                    type="button"
                    onClick={() => void handleVerifySupervisorPin()}
                    className="h-9 px-4 rounded-lg bg-brand hover:bg-brand-hover text-white text-xs font-bold transition-colors cursor-pointer"
                  >
                    تحقق واعتماد
                  </button>
                  {pinError && <span className="text-danger text-[11px] font-bold">{pinError}</span>}
                </div>
              ) : (
                <div className="text-[11px] text-paid font-bold">
                  تم توثيق موافقة المشرف بنجاح وسيتم إدراج اسمه في دفتر التفتيش وسجل الصرف.
                </div>
              )}
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-2 flex items-center justify-between gap-3 border-t border-line dark:border-line-dark">
            {onRemoveItem ? (
              <button
                type="button"
                onClick={() => {
                  onRemoveItem(item);
                  onClose();
                }}
                className="h-9 px-3.5 rounded-xl border border-danger/30 text-danger hover:bg-danger/10 text-xs font-bold transition-colors cursor-pointer"
              >
                حذف الصنف من السلة
              </button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-9 px-4 rounded-xl border border-line dark:border-line-dark text-ink-muted hover:text-ink text-xs font-bold transition-colors cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={isUploadingImage || (!canDispenseDirectly && !pinVerified)}
                className="h-9 px-5 rounded-xl bg-brand hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>توثيق وحفظ بيانات الصرف</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
