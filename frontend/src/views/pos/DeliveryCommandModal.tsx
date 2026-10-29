import React, { useState, useEffect } from 'react';
import {
  X,
  Bike,
  MapPin,
  Phone,
  User,
  Wallet,
  CheckCircle2,
  Plus,
  Trash2,
  RefreshCw,
  Send,
  Settings,
} from 'lucide-react';
import { invoke } from '../../bridge/ipc';
import { CustomSelect } from '../../components/CustomSelect';
import { formatArabicCurrency } from '../../utils/money';
import type {
  DeliveryZone,
  DeliveryRider,
  DeliveryOrder,
  DeliveryOrderCreateInfo,
  RiderSettlementSummary,
} from '../../types/cafe';
import type { Customer } from '../../types/models';

interface DeliveryCommandModalProps {
  isOpen: boolean;
  initialTab?: 'order_setup' | 'active_orders' | 'rider_settlement' | 'zones_riders';
  currentDeliveryInfo: DeliveryOrderCreateInfo | null;
  customers: Customer[];
  canManageOrders: boolean;
  canSettleRiders: boolean;
  canConfigureZonesRiders: boolean;
  onClose: () => void;
  onApplyDeliveryInfo: (info: DeliveryOrderCreateInfo) => void;
  onOrdersUpdated?: () => void;
}

export const DeliveryCommandModal: React.FC<DeliveryCommandModalProps> = ({
  isOpen,
  initialTab = 'order_setup',
  currentDeliveryInfo,
  customers,
  canManageOrders,
  canSettleRiders,
  canConfigureZonesRiders,
  onClose,
  onApplyDeliveryInfo,
  onOrdersUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'order_setup' | 'active_orders' | 'rider_settlement' | 'zones_riders'>(initialTab);
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [riders, setRiders] = useState<DeliveryRider[]>([]);
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Tab 1: Current Order Delivery Info
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerId, setCustomerId] = useState<string>('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [landmark, setLandmark] = useState('');
  const [selectedZoneId, setSelectedZoneId] = useState('');
  const [selectedRiderId, setSelectedRiderId] = useState('');
  const [deliveryFeeEgp, setDeliveryFeeEgp] = useState('0');
  const [orderNotes, setOrderNotes] = useState('');

  // Tab 2: Active Orders Filter
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Tab 3: Rider Settlement
  const [settleRiderId, setSettleRiderId] = useState<string>('');
  const [settlementSummary, setSettlementSummary] = useState<RiderSettlementSummary | null>(null);

  // Tab 4: Zones & Riders Editor
  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneFeeEgp, setNewZoneFeeEgp] = useState('25');

  const [newRiderName, setNewRiderName] = useState('');
  const [newRiderPhone, setNewRiderPhone] = useState('');
  const [newRiderFixedFeeEgp, setNewRiderFixedFeeEgp] = useState('0');

  const fetchAllDeliveryData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [zData, rData, oData] = await Promise.all([
        invoke<DeliveryZone[]>('delivery:getZones', { includeInactive: false }),
        invoke<DeliveryRider[]>('delivery:getRiders', { includeInactive: false }),
        invoke<DeliveryOrder[]>('delivery:getOrders', { statusFilter }),
      ]);
      if (Array.isArray(zData)) setZones(zData);
      if (Array.isArray(rData)) setRiders(rData);
      if (Array.isArray(oData)) setOrders(oData);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر تحميل بيانات الدليفري والطيارين');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(initialTab);
    setErrorMsg(null);
    setSuccessMsg(null);
    fetchAllDeliveryData();

    if (currentDeliveryInfo) {
      setCustomerPhone(currentDeliveryInfo.customerPhone || '');
      setCustomerName(currentDeliveryInfo.customerName || '');
      setCustomerId(currentDeliveryInfo.customerId || '');
      setDeliveryAddress(currentDeliveryInfo.deliveryAddress || '');
      setLandmark(currentDeliveryInfo.landmark || '');
      setSelectedZoneId(currentDeliveryInfo.zoneId || '');
      setSelectedRiderId(currentDeliveryInfo.riderId || '');
      setDeliveryFeeEgp(((currentDeliveryInfo.deliveryFeePiasters || 0) / 100).toString());
      setOrderNotes(currentDeliveryInfo.notes || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (!isOpen || activeTab !== 'active_orders') return;
    invoke<DeliveryOrder[]>('delivery:getOrders', { statusFilter })
      .then((data) => {
        if (Array.isArray(data)) setOrders(data);
      })
      .catch(() => {});
  }, [statusFilter, isOpen, activeTab]);

  useEffect(() => {
    if (!isOpen || !settleRiderId) {
      setSettlementSummary(null);
      return;
    }
    invoke<RiderSettlementSummary>('delivery:getRiderSummary', { riderId: settleRiderId })
      .then((data) => {
        if (data) setSettlementSummary(data);
      })
      .catch(() => {});
  }, [settleRiderId, isOpen]);

  if (!isOpen) return null;

  const handlePhoneLookup = (phoneVal: string) => {
    setCustomerPhone(phoneVal);
    const cleaned = phoneVal.trim();
    if (cleaned.length >= 6) {
      const matched = customers.find((c) => c.phone && c.phone.includes(cleaned));
      if (matched) {
        setCustomerId(matched.id);
        if (!customerName) setCustomerName(matched.name);
      }
    }
  };

  const handleZoneSelect = (zoneId: string) => {
    setSelectedZoneId(zoneId);
    const z = zones.find((item) => item.id === zoneId);
    if (z) {
      setDeliveryFeeEgp((z.feePiasters / 100).toString());
    }
  };

  const handleConfirmOrderDeliveryInfo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerPhone.trim() || !customerName.trim() || !deliveryAddress.trim()) {
      setErrorMsg('يرجى إدخال اسم العميل ورقم الهاتف والعنوان التفصيلي للتوصيل.');
      return;
    }

    const z = zones.find((item) => item.id === selectedZoneId);
    const r = riders.find((item) => item.id === selectedRiderId);
    const feePiasters = Math.max(0, Math.round((parseFloat(deliveryFeeEgp || '0') || 0) * 100));

    onApplyDeliveryInfo({
      customerId: customerId || null,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      deliveryAddress: deliveryAddress.trim(),
      landmark: landmark.trim() || null,
      zoneId: z ? z.id : null,
      zoneName: z ? z.name : null,
      riderId: r ? r.id : null,
      riderName: r ? r.name : null,
      deliveryFeePiasters: feePiasters,
      notes: orderNotes.trim() || null,
    });
    onClose();
  };

  const handleAssignRiderToOrder = async (orderId: string, riderId: string) => {
    if (!riderId) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      await invoke('delivery:assignOrder', { orderId, riderId });
      setSuccessMsg('تم إسناد الطلب للطيار وتحديث حالته إلى «خرج للتوصيل».');
      await fetchAllDeliveryData();
      onOrdersUpdated?.();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'فشل إسناد الطيار');
    } finally {
      setLoading(false);
    }
  };

  const handleChangeOrderStatus = async (orderId: string, status: string) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      await invoke('delivery:updateStatus', { orderId, status });
      setSuccessMsg('تم تحديث حالة طلب التوصيل بنجاح.');
      await fetchAllDeliveryData();
      onOrdersUpdated?.();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'فشل تحديث حالة الطلب');
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteRiderSettlement = async () => {
    if (!settleRiderId) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      await invoke<RiderSettlementSummary>('delivery:settleRider', {
        riderId: settleRiderId,
        recordCommissionExpense: true,
      });
      setSuccessMsg('تمت تصفية عهدة الطيار بنجاح وتوريد النقدية لدرج الكاشير.');
      const sumData = await invoke<RiderSettlementSummary>('delivery:getRiderSummary', { riderId: settleRiderId });
      if (sumData) setSettlementSummary(sumData);
      await fetchAllDeliveryData();
      onOrdersUpdated?.();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر تصفية عهدة الطيار');
    } finally {
      setLoading(false);
    }
  };

  const handleAddZone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newZoneName.trim()) return;
    const feePiasters = Math.max(0, Math.round((parseFloat(newZoneFeeEgp || '0') || 0) * 100));
    setLoading(true);
    try {
      await invoke('delivery:saveZone', {
        name: newZoneName.trim(),
        feePiasters,
        estimatedMinutes: 35,
        isActive: true,
      });
      setNewZoneName('');
      setSuccessMsg('تم حفظ منطقة التوصيل بنجاح.');
      await fetchAllDeliveryData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'فشل حفظ المنطقة');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteZone = async (id: string) => {
    try {
      await invoke('delivery:deleteZone', { id });
      fetchAllDeliveryData();
    } catch {
      // ignore
    }
  };

  const handleAddRider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRiderName.trim()) return;
    const fixedFeePiasters = Math.max(0, Math.round((parseFloat(newRiderFixedFeeEgp || '0') || 0) * 100));
    setLoading(true);
    try {
      await invoke('delivery:saveRider', {
        name: newRiderName.trim(),
        phone: newRiderPhone.trim(),
        vehicleInfo: '',
        commissionPercent: 0,
        fixedFeePerOrderPiasters: fixedFeePiasters,
        isActive: true,
      });
      setNewRiderName('');
      setNewRiderPhone('');
      setSuccessMsg('تم تسجيل الطيار بنجاح.');
      await fetchAllDeliveryData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'فشل حفظ بيانات الطيار');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRider = async (id: string) => {
    try {
      await invoke('delivery:deleteRider', { id });
      fetchAllDeliveryData();
    } catch {
      // ignore
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4" dir="rtl">
      <div className="bg-surface border border-line rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-line bg-surface-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand/10 border border-brand/30 flex items-center justify-center text-brand">
              <Bike className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-ink">مركز إدارة الدليفري والطيارين وتصفية العهدة</h2>
              <p className="text-xs text-ink-muted font-bold">
                توجيه طلبات التوصيل، احتساب رسوم المناطق تلقائياً، إسناد الطيارين، وتحصيل عهدة النقدية
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchAllDeliveryData}
              className="p-2 rounded-xl bg-surface border border-line text-ink-muted hover:text-ink"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-surface border border-line text-ink-muted hover:text-danger"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="px-6 py-2.5 bg-surface border-b border-line flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('order_setup')}
            className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all ${
              activeTab === 'order_setup'
                ? 'bg-brand text-white'
                : 'bg-surface-2 text-ink-muted hover:text-ink'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>بيانات توصيل الطلب الحالي</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('active_orders')}
            className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all ${
              activeTab === 'active_orders'
                ? 'bg-brand text-white'
                : 'bg-surface-2 text-ink-muted hover:text-ink'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>متابعة طلبات الدليفري ({orders.length})</span>
          </button>

          {canSettleRiders && (
            <button
              type="button"
              onClick={() => setActiveTab('rider_settlement')}
              className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all ${
                activeTab === 'rider_settlement'
                  ? 'bg-brand text-white'
                  : 'bg-surface-2 text-ink-muted hover:text-ink'
              }`}
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>تصفية عهدة الطيارين</span>
            </button>
          )}

          {canConfigureZonesRiders && (
            <button
              type="button"
              onClick={() => setActiveTab('zones_riders')}
              className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all ${
                activeTab === 'zones_riders'
                  ? 'bg-brand text-white'
                  : 'bg-surface-2 text-ink-muted hover:text-ink'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>إعداد المناطق والطيارين</span>
            </button>
          )}
        </div>

        {(errorMsg || successMsg) && (
          <div className="px-6 pt-3">
            {errorMsg && (
              <div className="p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs font-black">
                {errorMsg}
              </div>
            )}
            {successMsg && (
              <div className="p-3 rounded-xl bg-paid/10 border border-paid/30 text-paid text-xs font-black">
                {successMsg}
              </div>
            )}
          </div>
        )}

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {activeTab === 'order_setup' && (
            <form onSubmit={handleConfirmOrderDeliveryInfo} className="max-w-3xl mx-auto space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-ink mb-1">
                    رقم هاتف العميل (يبحث تلقائياً في سجل العملاء)
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-ink-muted absolute right-3 top-2.5" />
                    <input
                      type="text"
                      value={customerPhone}
                      onChange={(e) => handlePhoneLookup(e.target.value)}
                      placeholder="010xxxxxxxx"
                      className="w-full pr-9 pl-3 py-2 rounded-xl bg-surface-2 border border-line text-sm font-black text-ink focus:outline-none focus:border-brand"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black text-ink mb-1">اسم العميل</label>
                  <div className="relative">
                    <User className="w-4 h-4 text-ink-muted absolute right-3 top-2.5" />
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="اسم مستلم الطلب"
                      className="w-full pr-9 pl-3 py-2 rounded-xl bg-surface-2 border border-line text-sm font-bold text-ink focus:outline-none focus:border-brand"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-ink mb-1">عنوان التوصيل بالتفصيل (يُطبع في قسيمة الطيار)</label>
                <input
                  type="text"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="الشارع، رقم العقار، الدور، رقم الشقة..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-2 border border-line text-sm font-bold text-ink focus:outline-none focus:border-brand"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-black text-ink mb-1">علامة مميزة للعنوان</label>
                  <input
                    type="text"
                    value={landmark}
                    onChange={(e) => setLandmark(e.target.value)}
                    placeholder="بجوار صيدلية / مسجد..."
                    className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-line text-xs font-bold text-ink"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-ink mb-1">منطقة التوصيل (تحدد الرسوم تلقائياً)</label>
                  <CustomSelect
                    value={selectedZoneId}
                    onChange={handleZoneSelect}
                    options={[
                      { value: '', label: '-- اختر منطقة التوصيل --' },
                      ...zones.map((z) => ({
                        value: z.id,
                        label: `${z.name} (${formatArabicCurrency(z.feePiasters)})`,
                      })),
                    ]}
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-ink mb-1">رسوم التوصيل (ج.م)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    value={deliveryFeeEgp}
                    onChange={(e) => setDeliveryFeeEgp(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-line text-sm font-black text-brand"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-ink mb-1">إسناد مباشر لطيار (اختياري الآن)</label>
                  <CustomSelect
                    value={selectedRiderId}
                    onChange={(v) => setSelectedRiderId(v)}
                    options={[
                      { value: '', label: '-- تحديد الطيار لاحقاً بعد التحضير --' },
                      ...riders.map((r) => ({
                        value: r.id,
                        label: `${r.name}${r.phone ? ` (${r.phone})` : ''}`,
                      })),
                    ]}
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-ink mb-1">ملاحظات للطيار</label>
                  <input
                    type="text"
                    value={orderNotes}
                    onChange={(e) => setOrderNotes(e.target.value)}
                    placeholder="مثال: الاتصال قبل الوصول، فكة 200 ج..."
                    className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-line text-xs font-bold text-ink"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl bg-surface-2 border border-line text-xs font-bold text-ink-muted"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-brand text-white text-xs font-black hover:opacity-95 flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>اعتماد بيانات التوصيل وإضافة الرسوم للفاتورة</span>
                </button>
              </div>
            </form>
          )}

          {activeTab === 'active_orders' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  {[
                    { key: 'all', label: 'الكل' },
                    { key: 'preparing', label: 'قيد التحضير' },
                    { key: 'out_for_delivery', label: 'مع الطيار بالطريق' },
                    { key: 'delivered', label: 'تم التسليم' },
                  ].map((st) => (
                    <button
                      key={st.key}
                      type="button"
                      onClick={() => setStatusFilter(st.key)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-black ${
                        statusFilter === st.key
                          ? 'bg-brand text-white'
                          : 'bg-surface-2 text-ink-muted border border-line'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>

              {orders.length === 0 ? (
                <div className="p-12 text-center bg-surface-2 rounded-2xl border border-line text-ink-muted text-sm font-bold">
                  لا توجد طلبات دليفري مطابقة للفلتر المحدد حالياً.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {orders.map((ord) => (
                    <div
                      key={ord.id}
                      className="p-4 rounded-2xl bg-surface-2 border border-line flex flex-wrap items-center justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-brand/15 text-brand text-xs font-black">
                            فاتورة #{ord.invoiceNumber} {ord.orderCallNumber > 0 ? `• نداء #${ord.orderCallNumber}` : ''}
                          </span>
                          <span className="font-black text-sm text-ink">{ord.customerName}</span>
                          <span className="text-xs text-ink-muted font-bold">({ord.customerPhone})</span>
                        </div>
                        <div className="text-xs text-ink font-bold">
                          العنوان: {ord.deliveryAddress}
                          {ord.zoneName ? ` • المنطقة: ${ord.zoneName}` : ''}
                        </div>
                        <div className="text-xs text-ink-muted font-bold">
                          المطلوب تحصيله: <span className="text-brand font-black">{formatArabicCurrency(ord.cashToCollectPiasters)}</span>
                          {' • '}رسوم التوصيل: {formatArabicCurrency(ord.deliveryFeePiasters)}
                        </div>
                      </div>

                      {canManageOrders && (
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="w-48">
                            <CustomSelect
                              value={ord.riderId || ''}
                              onChange={(rId) => handleAssignRiderToOrder(ord.id, rId)}
                              options={[
                                { value: '', label: '-- إسناد لطيار --' },
                                ...riders.map((r) => ({ value: r.id, label: r.name })),
                              ]}
                            />
                          </div>

                          <div className="w-44">
                            <CustomSelect
                              value={ord.status}
                              onChange={(st) => handleChangeOrderStatus(ord.id, st)}
                              options={[
                                { value: 'preparing', label: 'قيد التحضير بالمطبخ' },
                                { value: 'out_for_delivery', label: 'خرج للتوصيل مع الطيار' },
                                { value: 'delivered', label: 'تم التسليم للعميل' },
                                { value: 'cancelled', label: 'ملغى' },
                              ]}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'rider_settlement' && (
            <div className="max-w-3xl mx-auto space-y-5">
              <div className="bg-surface-2 p-4 rounded-2xl border border-line space-y-2">
                <label className="block text-xs font-black text-ink">اختر الطيار لاستعراض وتصفية عهدته النقدية:</label>
                <CustomSelect
                  value={settleRiderId}
                  onChange={(v) => setSettleRiderId(v)}
                  options={[
                    { value: '', label: '-- اختر الطيار --' },
                    ...riders.map((r) => ({
                      value: r.id,
                      label: `${r.name}${r.unsettledCashPiasters ? ` (عهدة: ${formatArabicCurrency(r.unsettledCashPiasters)})` : ''}`,
                    })),
                  ]}
                />
              </div>

              {settlementSummary && (
                <div className="bg-surface-2 p-5 rounded-2xl border border-line space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 rounded-xl bg-surface border border-line">
                      <div className="text-[11px] text-ink-muted font-bold">طلبات غير مصفاة</div>
                      <div className="text-lg font-black text-ink">{settlementSummary.unsettledOrdersCount}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-surface border border-line">
                      <div className="text-[11px] text-ink-muted font-bold">إجمالي النقدية مع الطيار</div>
                      <div className="text-base font-black text-brand">
                        {formatArabicCurrency(settlementSummary.totalCashToCollectPiasters)}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-surface border border-line">
                      <div className="text-[11px] text-ink-muted font-bold">عمولة الطيار المستحقة</div>
                      <div className="text-base font-black text-warn">
                        {formatArabicCurrency(settlementSummary.totalRiderCommissionPiasters)}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-surface border border-line">
                      <div className="text-[11px] text-ink-muted font-bold">الصافي المورّد لدرج الكاشير</div>
                      <div className="text-base font-black text-paid">
                        {formatArabicCurrency(settlementSummary.netDrawerAmountPiasters)}
                      </div>
                    </div>
                  </div>

                  {settlementSummary.unsettledOrdersCount > 0 && (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={handleExecuteRiderSettlement}
                      className="w-full py-3 rounded-xl bg-paid text-white text-xs font-black hover:opacity-95 flex items-center justify-center gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>
                        استلام النقدية وتصفية عهدة الطيار ({formatArabicCurrency(settlementSummary.netDrawerAmountPiasters)})
                      </span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'zones_riders' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Zones Management */}
              <div className="bg-surface-2 p-4 rounded-2xl border border-line space-y-4">
                <h3 className="text-sm font-black text-ink">مناطق التوصيل ورسومها ({zones.length})</h3>
                <form onSubmit={handleAddZone} className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={newZoneName}
                    onChange={(e) => setNewZoneName(e.target.value)}
                    placeholder="اسم المنطقة"
                    className="px-3 py-2 rounded-xl bg-surface border border-line text-xs font-bold text-ink"
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    value={newZoneFeeEgp}
                    onChange={(e) => setNewZoneFeeEgp(e.target.value)}
                    placeholder="الرسوم (ج.م)"
                    className="px-3 py-2 rounded-xl bg-surface border border-line text-xs font-bold text-ink"
                  />
                  <button
                    type="submit"
                    className="px-3 py-2 rounded-xl bg-brand text-white text-xs font-black flex items-center justify-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>إضافة منطقة</span>
                  </button>
                </form>

                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {zones.map((z) => (
                    <div key={z.id} className="p-2.5 rounded-xl bg-surface border border-line flex items-center justify-between text-xs">
                      <div>
                        <span className="font-black text-ink">{z.name}</span>
                        <span className="text-brand font-black mr-2">{formatArabicCurrency(z.feePiasters)}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteZone(z.id)}
                        className="p-1 text-ink-muted hover:text-danger"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Riders Management */}
              <div className="bg-surface-2 p-4 rounded-2xl border border-line space-y-4">
                <h3 className="text-sm font-black text-ink">الطيارون ومندوبو التوصيل ({riders.length})</h3>
                <form onSubmit={handleAddRider} className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={newRiderName}
                    onChange={(e) => setNewRiderName(e.target.value)}
                    placeholder="اسم الطيار"
                    className="px-3 py-2 rounded-xl bg-surface border border-line text-xs font-bold text-ink"
                  />
                  <input
                    type="text"
                    value={newRiderPhone}
                    onChange={(e) => setNewRiderPhone(e.target.value)}
                    placeholder="رقم الموبايل"
                    className="px-3 py-2 rounded-xl bg-surface border border-line text-xs font-bold text-ink"
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    value={newRiderFixedFeeEgp}
                    onChange={(e) => setNewRiderFixedFeeEgp(e.target.value)}
                    placeholder="عمولة ثابتة للطلب (ج.م)"
                    className="px-3 py-2 rounded-xl bg-surface border border-line text-xs font-bold text-ink"
                  />
                  <button
                    type="submit"
                    className="px-3 py-2 rounded-xl bg-brand text-white text-xs font-black flex items-center justify-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>إضافة طيار</span>
                  </button>
                </form>

                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {riders.map((r) => (
                    <div key={r.id} className="p-2.5 rounded-xl bg-surface border border-line flex items-center justify-between text-xs">
                      <div>
                        <span className="font-black text-ink">{r.name}</span>
                        {r.phone && <span className="text-ink-muted font-bold mr-2">({r.phone})</span>}
                        {r.fixedFeePerOrderPiasters > 0 && (
                          <span className="text-brand font-bold mr-2">
                            • عمولة: {formatArabicCurrency(r.fixedFeePerOrderPiasters)}/طلب
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteRider(r.id)}
                        className="p-1 text-ink-muted hover:text-danger"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
