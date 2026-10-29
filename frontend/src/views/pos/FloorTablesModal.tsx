import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  UtensilsCrossed,
  Users,
  Clock,
  ArrowLeftRight,
  GitMerge,
  Scissors,
  FileText,
  Plus,
  Trash2,
  Edit3,
  Check,
  RefreshCw,
  ShoppingCart,
  Unlock,
} from 'lucide-react';
import { invoke } from '../../bridge/ipc';
import { CustomSelect } from '../../components/CustomSelect';
import { formatArabicCurrency } from '../../utils/money';
import type { RestaurantTable, TableSplitItemRequest, TableSplitResult } from '../../types/cafe';
import type { CartItem } from './types';

interface FloorTablesModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTableId?: string | null;
  canConfigureFloor: boolean;
  canTransferMerge: boolean;
  canSplitBill: boolean;
  onSelectAndLoadTable: (table: RestaurantTable, parsedCart: CartItem[]) => void;
  onLoadSplitCartForCheckout: (sourceTable: RestaurantTable, splitItems: CartItem[]) => void;
  onTablesChanged?: () => void;
}

export const FloorTablesModal: React.FC<FloorTablesModalProps> = ({
  isOpen,
  onClose,
  activeTableId,
  canConfigureFloor,
  canTransferMerge,
  canSplitBill,
  onSelectAndLoadTable,
  onLoadSplitCartForCheckout,
  onTablesChanged,
}) => {
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedZone, setSelectedZone] = useState<string>('ALL');
  const [selectedTable, setSelectedTable] = useState<RestaurantTable | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Open Table form
  const [waiterName, setWaiterName] = useState('');
  const [guestsCount, setGuestsCount] = useState(2);

  // Action sub-modes on selected occupied table
  const [actionMode, setActionMode] = useState<'none' | 'transfer' | 'merge' | 'split' | 'manage_floor'>('none');
  const [targetTableId, setTargetTableId] = useState<string>('');
  const [splitQtys, setSplitQtys] = useState<Record<number, number>>({});

  // Floor layout editor state
  const [editTableId, setEditTableId] = useState<string>('');
  const [editTableName, setEditTableName] = useState<string>('');
  const [editZoneName, setEditZoneName] = useState<string>('الصالة الداخلية');
  const [editCapacity, setEditCapacity] = useState<number>(4);
  const [editDisplayOrder, setEditDisplayOrder] = useState<number>(1);

  const fetchTables = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await invoke<RestaurantTable[]>('tables:getAll', { includeInactive: false });
      if (Array.isArray(data)) {
        setTables(data);
        if (selectedTable) {
          const updated = data.find((t) => t.id === selectedTable.id) || null;
          setSelectedTable(updated);
        }
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر تحميل خريطة الطاولات');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchTables();
      setActionMode('none');
      setErrorMsg(null);
      setSuccessMsg(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const zones = useMemo(() => {
    const set = new Set<string>();
    tables.forEach((t) => {
      if (t.zoneName) set.add(t.zoneName);
    });
    return Array.from(set);
  }, [tables]);

  const filteredTables = useMemo(() => {
    if (selectedZone === 'ALL') return tables;
    return tables.filter((t) => t.zoneName === selectedZone);
  }, [tables, selectedZone]);

  const selectedTableCartItems = useMemo<CartItem[]>(() => {
    if (!selectedTable || !selectedTable.cartJson) return [];
    try {
      const parsed = JSON.parse(selectedTable.cartJson);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [selectedTable]);

  if (!isOpen) return null;

  const formatElapsed = (openedAt?: string | null) => {
    if (!openedAt) return '';
    const start = new Date(openedAt).getTime();
    if (Number.isNaN(start)) return '';
    const mins = Math.max(1, Math.floor((Date.now() - start) / 60000));
    if (mins < 60) return `منذ ${mins} د`;
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    return `منذ ${hrs} س و ${rem} د`;
  };

  const handleOpenNewTable = async (tbl: RestaurantTable) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const opened = await invoke<RestaurantTable>('tables:open', {
        tableId: tbl.id,
        waiterName: waiterName.trim(),
        guestsCount: Math.max(1, guestsCount),
      });
      if (opened) {
        onTablesChanged?.();
        onSelectAndLoadTable(opened, []);
        onClose();
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر فتح الطاولة');
    } finally {
      setLoading(false);
    }
  };

  const handleLoadOccupiedTable = (tbl: RestaurantTable) => {
    let items: CartItem[] = [];
    if (tbl.cartJson) {
      try {
        const parsed = JSON.parse(tbl.cartJson);
        if (Array.isArray(parsed)) items = parsed;
      } catch {
        items = [];
      }
    }
    onSelectAndLoadTable(tbl, items);
    onClose();
  };

  const handlePrintPreBill = async (tbl: RestaurantTable) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      await invoke('tables:printPreBill', { tableId: tbl.id });
      setSuccessMsg(`تم إرسال الشيك المبدئي للطاولة «${tbl.name}» إلى الطابعة.`);
      await fetchTables();
      onTablesChanged?.();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر طباعة الشيك المبدئي');
    } finally {
      setLoading(false);
    }
  };

  const handleTransferTable = async () => {
    if (!selectedTable || !targetTableId) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const transferred = await invoke<RestaurantTable>('tables:transfer', {
        fromTableId: selectedTable.id,
        toTableId: targetTableId,
      });
      if (transferred) {
        setSuccessMsg(`تم نقل الطلب بنجاح إلى «${transferred.name}».`);
        setActionMode('none');
        setTargetTableId('');
        setSelectedTable(transferred);
        await fetchTables();
        onTablesChanged?.();
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'فشل نقل الطاولة');
    } finally {
      setLoading(false);
    }
  };

  const handleMergeTables = async () => {
    if (!selectedTable || !targetTableId) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const merged = await invoke<RestaurantTable>('tables:merge', {
        sourceTableId: selectedTable.id,
        targetTableId,
      });
      if (merged) {
        setSuccessMsg(`تم دمج الطاولتين بنجاح في «${merged.name}».`);
        setActionMode('none');
        setTargetTableId('');
        setSelectedTable(merged);
        await fetchTables();
        onTablesChanged?.();
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'فشل دمج الطاولتين');
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteSplit = async () => {
    if (!selectedTable) return;
    const reqItems: TableSplitItemRequest[] = [];
    Object.entries(splitQtys).forEach(([idxStr, qtyMilli]) => {
      const idx = parseInt(idxStr, 10);
      const item = selectedTableCartItems[idx];
      if (item && qtyMilli > 0) {
        reqItems.push({
          cartLineIndex: idx,
          productId: item.productId,
          quantityMilli: qtyMilli,
        });
      }
    });

    if (reqItems.length === 0) {
      setErrorMsg('يرجى تحديد كمية صنف واحد على الأقل لتقسيم الفاتورة.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      const splitResult = await invoke<TableSplitResult>('tables:split', {
        sourceTableId: selectedTable.id,
        items: reqItems,
      });
      if (splitResult) {
        let splitCart: CartItem[] = [];
        try {
          const parsed = JSON.parse(splitResult.splitCartJson || '[]');
          if (Array.isArray(parsed)) splitCart = parsed;
        } catch {
          splitCart = [];
        }
        onTablesChanged?.();
        onLoadSplitCartForCheckout(splitResult.sourceTable, splitCart);
        onClose();
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'فشل تقسيم فاتورة الطاولة');
    } finally {
      setLoading(false);
    }
  };

  const handleCloseFreeTable = async (tbl: RestaurantTable) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      await invoke<RestaurantTable>('tables:close', { tableId: tbl.id });
      setSuccessMsg(`تم إخلاء الطاولة «${tbl.name}» وإتاحتها للضيوف.`);
      setSelectedTable(null);
      await fetchTables();
      onTablesChanged?.();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر إخلاء الطاولة');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveFloorTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTableName.trim()) {
      setErrorMsg('يرجى إدخال اسم الطاولة');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      await invoke<RestaurantTable>('tables:save', {
        id: editTableId || undefined,
        name: editTableName.trim(),
        zoneName: editZoneName.trim() || 'الصالة الداخلية',
        capacity: Math.max(1, editCapacity),
        displayOrder: editDisplayOrder,
        isActive: true,
      });
      setSuccessMsg('تم حفظ بيانات الطاولة بنجاح.');
      setEditTableId('');
      setEditTableName('');
      await fetchTables();
      onTablesChanged?.();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'فشل حفظ الطاولة');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteFloorTable = async (tblId: string) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      await invoke('tables:delete', { id: tblId });
      setSuccessMsg('تم حذف الطاولة بنجاح.');
      if (selectedTable?.id === tblId) setSelectedTable(null);
      await fetchTables();
      onTablesChanged?.();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'لا يمكن حذف طاولة مشغولة');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4" dir="rtl">
      <div className="bg-surface border border-line rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-line flex items-center justify-between bg-surface-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand/10 border border-brand/30 flex items-center justify-center text-brand">
              <UtensilsCrossed className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-ink">خريطة الصالة وإدارة الطاولات</h2>
              <p className="text-xs text-ink-muted font-bold">
                متابعة حالة الطاولات لحظياً، فتح الطلبات، نقل ودمج الطاولات، وتقسيم الشيك بالأصناف
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canConfigureFloor && (
              <button
                type="button"
                onClick={() => setActionMode(actionMode === 'manage_floor' ? 'none' : 'manage_floor')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black border transition-all ${
                  actionMode === 'manage_floor'
                    ? 'bg-brand text-white border-brand'
                    : 'bg-surface border-line text-ink hover:border-brand'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>{actionMode === 'manage_floor' ? 'العودة لخريطة الصالة' : 'تعديل الطاولات والأقسام'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={fetchTables}
              className="p-2 rounded-xl bg-surface border border-line text-ink-muted hover:text-ink transition-colors"
              title="تحديث الحالة"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-surface border border-line text-ink-muted hover:text-danger transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Status Messages */}
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

        {/* Body */}
        {actionMode === 'manage_floor' ? (
          <div className="p-6 overflow-y-auto flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Add / Edit Table Form */}
            <form onSubmit={handleSaveFloorTable} className="bg-surface-2 p-4 rounded-2xl border border-line space-y-4 h-fit">
              <h3 className="text-sm font-black text-ink">
                {editTableId ? 'تعديل بيانات الطاولة' : 'إضافة طاولة جديدة للصالة'}
              </h3>

              <div>
                <label className="block text-xs font-bold text-ink-muted mb-1">اسم / رقم الطاولة</label>
                <input
                  type="text"
                  value={editTableName}
                  onChange={(e) => setEditTableName(e.target.value)}
                  placeholder="مثال: طاولة 10 أو VIP 3"
                  className="w-full px-3 py-2 rounded-xl bg-surface border border-line text-sm font-bold text-ink focus:outline-none focus:border-brand"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-ink-muted mb-1">القسم / المنطقة (Zone)</label>
                <input
                  type="text"
                  value={editZoneName}
                  onChange={(e) => setEditZoneName(e.target.value)}
                  placeholder="مثال: الصالة الداخلية، التراس الخارجي"
                  className="w-full px-3 py-2 rounded-xl bg-surface border border-line text-sm font-bold text-ink focus:outline-none focus:border-brand"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-ink-muted mb-1">سعة المقاعد</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={editCapacity}
                    onChange={(e) => setEditCapacity(parseInt(e.target.value || '4', 10))}
                    className="w-full px-3 py-2 rounded-xl bg-surface border border-line text-sm font-bold text-ink"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-muted mb-1">ترتيب العرض</label>
                  <input
                    type="number"
                    min={1}
                    value={editDisplayOrder}
                    onChange={(e) => setEditDisplayOrder(parseInt(e.target.value || '1', 10))}
                    className="w-full px-3 py-2 rounded-xl bg-surface border border-line text-sm font-bold text-ink"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-brand text-white text-xs font-black hover:opacity-95"
                >
                  <Plus className="w-4 h-4" />
                  <span>{editTableId ? 'حفظ التعديلات' : 'إضافة الطاولة'}</span>
                </button>
                {editTableId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditTableId('');
                      setEditTableName('');
                    }}
                    className="px-3 py-2.5 rounded-xl bg-surface border border-line text-xs font-bold text-ink-muted"
                  >
                    إلغاء
                  </button>
                )}
              </div>
            </form>

            {/* Existing Tables List */}
            <div className="lg:col-span-2 bg-surface-2 p-4 rounded-2xl border border-line space-y-3 overflow-y-auto max-h-[62vh]">
              <h3 className="text-sm font-black text-ink">الطاولات المسجلة ({tables.length})</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {tables.map((t) => (
                  <div
                    key={t.id}
                    className="p-3 rounded-xl bg-surface border border-line flex items-center justify-between"
                  >
                    <div>
                      <div className="font-black text-sm text-ink">{t.name}</div>
                      <div className="text-xs text-ink-muted font-bold">
                        {t.zoneName} • {t.capacity} مقاعد
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setEditTableId(t.id);
                          setEditTableName(t.name);
                          setEditZoneName(t.zoneName);
                          setEditCapacity(t.capacity);
                          setEditDisplayOrder(t.displayOrder);
                        }}
                        className="p-1.5 rounded-lg bg-surface-2 hover:bg-brand/10 text-ink-muted hover:text-brand"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      {t.status === 'available' && (
                        <button
                          type="button"
                          onClick={() => handleDeleteFloorTable(t.id)}
                          className="p-1.5 rounded-lg bg-surface-2 hover:bg-danger/10 text-ink-muted hover:text-danger"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-3">
            {/* Floor Map Grid (2 Columns) */}
            <div className="lg:col-span-2 p-5 overflow-y-auto flex flex-col gap-4 border-l border-line">
              {/* Zone Filter Pills */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSelectedZone('ALL')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                      selectedZone === 'ALL'
                        ? 'bg-brand text-white'
                        : 'bg-surface-2 text-ink-muted hover:text-ink border border-line'
                    }`}
                  >
                    كل الأقسام ({tables.length})
                  </button>
                  {zones.map((z) => (
                    <button
                      key={z}
                      type="button"
                      onClick={() => setSelectedZone(z)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                        selectedZone === z
                          ? 'bg-brand text-white'
                          : 'bg-surface-2 text-ink-muted hover:text-ink border border-line'
                      }`}
                    >
                      {z}
                    </button>
                  ))}
                </div>

                {/* Status Legend */}
                <div className="flex items-center gap-3 text-[11px] font-bold text-ink-muted">
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-paid inline-block" /> متاحة
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-brand inline-block" /> مشغولة
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-warn inline-block" /> تم طباعة الشيك
                  </span>
                </div>
              </div>

              {/* Tables Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {filteredTables.map((tbl) => {
                  const isOccupied = tbl.status === 'occupied';
                  const isBillPrinted = tbl.status === 'bill_printed';
                  const isSelected = selectedTable?.id === tbl.id;
                  const isCurrentActive = activeTableId === tbl.id;

                  let cardStyle = 'bg-surface border-paid/40 hover:border-paid';
                  let badgeStyle = 'bg-paid/15 text-paid';
                  let statusLabel = 'متاحة';

                  if (isOccupied) {
                    cardStyle = 'bg-brand/5 border-brand/50 hover:border-brand';
                    badgeStyle = 'bg-brand text-white';
                    statusLabel = 'مشغولة';
                  } else if (isBillPrinted) {
                    cardStyle = 'bg-warn/10 border-warn/50 hover:border-warn';
                    badgeStyle = 'bg-warn text-white';
                    statusLabel = 'طُبع الشيك';
                  }

                  return (
                    <button
                      key={tbl.id}
                      type="button"
                      onClick={() => {
                        setSelectedTable(tbl);
                        setActionMode('none');
                        setWaiterName(tbl.waiterName || '');
                        setGuestsCount(tbl.guestsCount > 0 ? tbl.guestsCount : tbl.capacity || 2);
                      }}
                      className={`p-4 rounded-2xl border-2 text-right transition-all flex flex-col justify-between min-h-[128px] ${cardStyle} ${
                        isSelected ? 'ring-2 ring-brand shadow-md' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 w-full">
                        <div>
                          <div className="text-sm font-black text-ink flex items-center gap-1.5">
                            <span>{tbl.name}</span>
                            {isCurrentActive && (
                              <span className="px-1.5 py-0.5 rounded bg-brand/20 text-brand text-[10px]">
                                محددة الآن
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-ink-muted font-bold">{tbl.zoneName}</div>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${badgeStyle}`}>
                          {statusLabel}
                        </span>
                      </div>

                      {isOccupied || isBillPrinted ? (
                        <div className="mt-3 pt-2 border-t border-line/60 w-full space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-ink-muted font-bold flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatElapsed(tbl.openedAt)}
                            </span>
                            <span className="font-black text-brand">
                              {formatArabicCurrency(tbl.currentTotalPiasters)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-ink-muted font-bold">
                            <span>{tbl.waiterName ? `كابتن: ${tbl.waiterName}` : `ضيوف: ${tbl.guestsCount}`}</span>
                            <span>{tbl.itemsCount} أصناف</span>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 pt-2 border-t border-line/50 flex items-center justify-between text-xs text-ink-muted font-bold w-full">
                          <span className="flex items-center gap-1">
                            <Users className="w-3.5 h-3.5" />
                            سعة {tbl.capacity} أفراد
                          </span>
                          <span className="text-paid font-black">اضغط للفتح</span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right Inspector Panel (Selected Table Actions) */}
            <div className="p-5 bg-surface-2 overflow-y-auto flex flex-col justify-between">
              {!selectedTable ? (
                <div className="my-auto text-center space-y-2 py-12">
                  <UtensilsCrossed className="w-10 h-10 text-ink-muted mx-auto opacity-50" />
                  <p className="text-sm font-black text-ink">اختر طاولة من الخريطة</p>
                  <p className="text-xs text-ink-muted font-bold">
                    اضغط على أي طاولة متاحة لفتح طلب جديد أو طاولة مشغولة لإدارة حسابها أو نقله أو تقسيمه
                  </p>
                </div>
              ) : selectedTable.status === 'available' ? (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-surface border border-line">
                    <div className="text-base font-black text-ink">{selectedTable.name}</div>
                    <div className="text-xs text-ink-muted font-bold">
                      {selectedTable.zoneName} • سعة {selectedTable.capacity} مقاعد
                    </div>
                  </div>

                  <div className="space-y-3 bg-surface p-4 rounded-2xl border border-line">
                    <h4 className="text-xs font-black text-ink">بيانات فتح الطاولة</h4>
                    <div>
                      <label className="block text-xs font-bold text-ink-muted mb-1">اسم الويتر / الكابتن (اختياري)</label>
                      <input
                        type="text"
                        value={waiterName}
                        onChange={(e) => setWaiterName(e.target.value)}
                        placeholder="مثال: أحمد / محمد"
                        className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-line text-xs font-bold text-ink focus:outline-none focus:border-brand"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-ink-muted mb-1">عدد الضيوف على الطاولة</label>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={guestsCount}
                        onChange={(e) => setGuestsCount(Math.max(1, parseInt(e.target.value || '1', 10)))}
                        className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-line text-xs font-black text-ink focus:outline-none focus:border-brand"
                      />
                    </div>

                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => handleOpenNewTable(selectedTable)}
                      className="w-full py-3 rounded-xl bg-paid text-white text-xs font-black hover:opacity-95 transition-all flex items-center justify-center gap-2"
                    >
                      <Check className="w-4 h-4" />
                      <span>فتح الطاولة وبدء تسجيل الأصناف</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Occupied Table Summary */}
                  <div className="p-4 rounded-2xl bg-surface border border-line space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-base font-black text-ink">{selectedTable.name}</div>
                        <div className="text-xs text-ink-muted font-bold">{selectedTable.zoneName}</div>
                      </div>
                      <div className="text-left">
                        <div className="text-sm font-black text-brand">
                          {formatArabicCurrency(selectedTable.currentTotalPiasters)}
                        </div>
                        <div className="text-[11px] text-ink-muted font-bold">
                          {selectedTable.itemsCount} أصناف
                        </div>
                      </div>
                    </div>

                    {/* Primary Actions */}
                    <div className="grid grid-cols-2 gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => handleLoadOccupiedTable(selectedTable)}
                        className="col-span-2 py-2.5 px-3 rounded-xl bg-brand text-white text-xs font-black flex items-center justify-center gap-1.5 hover:opacity-95"
                      >
                        <ShoppingCart className="w-4 h-4" />
                        <span>استدعاء الطلب للكاشير (إضافة أصناف أو سداد)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handlePrintPreBill(selectedTable)}
                        className="py-2 px-2.5 rounded-xl bg-surface-2 border border-line hover:border-brand text-ink text-xs font-bold flex items-center justify-center gap-1"
                      >
                        <FileText className="w-3.5 h-3.5 text-brand" />
                        <span>طباعة شيك مبدئي</span>
                      </button>

                      {canTransferMerge && (
                        <button
                          type="button"
                          onClick={() => {
                            setActionMode(actionMode === 'transfer' ? 'none' : 'transfer');
                            setTargetTableId('');
                          }}
                          className={`py-2 px-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1 ${
                            actionMode === 'transfer'
                              ? 'bg-brand text-white border-brand'
                              : 'bg-surface-2 border-line text-ink hover:border-brand'
                          }`}
                        >
                          <ArrowLeftRight className="w-3.5 h-3.5" />
                          <span>نقل لطاولة</span>
                        </button>
                      )}

                      {canTransferMerge && (
                        <button
                          type="button"
                          onClick={() => {
                            setActionMode(actionMode === 'merge' ? 'none' : 'merge');
                            setTargetTableId('');
                          }}
                          className={`py-2 px-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1 ${
                            actionMode === 'merge'
                              ? 'bg-brand text-white border-brand'
                              : 'bg-surface-2 border-line text-ink hover:border-brand'
                          }`}
                        >
                          <GitMerge className="w-3.5 h-3.5" />
                          <span>دمج مع طاولة</span>
                        </button>
                      )}

                      {canSplitBill && selectedTableCartItems.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setActionMode(actionMode === 'split' ? 'none' : 'split');
                            setSplitQtys({});
                          }}
                          className={`py-2 px-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1 ${
                            actionMode === 'split'
                              ? 'bg-brand text-white border-brand'
                              : 'bg-surface-2 border-line text-ink hover:border-brand'
                          }`}
                        >
                          <Scissors className="w-3.5 h-3.5" />
                          <span>تقسيم الفاتورة</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Sub-Action Panels */}
                  {actionMode === 'transfer' && (
                    <div className="p-4 rounded-2xl bg-surface border border-brand/40 space-y-3">
                      <h4 className="text-xs font-black text-ink">نقل طلب «{selectedTable.name}» إلى طاولة متاحة:</h4>
                      <CustomSelect
                        value={targetTableId}
                        onChange={(v) => setTargetTableId(v)}
                        options={[
                          { value: '', label: '-- اختر الطاولة المتاحة للنقل إليها --' },
                          ...tables
                            .filter((t) => t.status === 'available' && t.id !== selectedTable.id)
                            .map((t) => ({ value: t.id, label: `${t.name} (${t.zoneName})` })),
                        ]}
                      />
                      <button
                        type="button"
                        disabled={!targetTableId || loading}
                        onClick={handleTransferTable}
                        className="w-full py-2.5 rounded-xl bg-brand text-white text-xs font-black disabled:opacity-50"
                      >
                        تأكيد النقل الفوري
                      </button>
                    </div>
                  )}

                  {actionMode === 'merge' && (
                    <div className="p-4 rounded-2xl bg-surface border border-brand/40 space-y-3">
                      <h4 className="text-xs font-black text-ink">دمج حساب «{selectedTable.name}» داخل طاولة مشغولة أخرى:</h4>
                      <CustomSelect
                        value={targetTableId}
                        onChange={(v) => setTargetTableId(v)}
                        options={[
                          { value: '', label: '-- اختر الطاولة الهدف لدمج الحساب بها --' },
                          ...tables
                            .filter((t) => t.status !== 'available' && t.id !== selectedTable.id)
                            .map((t) => ({
                              value: t.id,
                              label: `${t.name} (${formatArabicCurrency(t.currentTotalPiasters)})`,
                            })),
                        ]}
                      />
                      <button
                        type="button"
                        disabled={!targetTableId || loading}
                        onClick={handleMergeTables}
                        className="w-full py-2.5 rounded-xl bg-brand text-white text-xs font-black disabled:opacity-50"
                      >
                        تأكيد دمج الطاولتين
                      </button>
                    </div>
                  )}

                  {actionMode === 'split' && (
                    <div className="p-4 rounded-2xl bg-surface border border-brand/40 space-y-3">
                      <h4 className="text-xs font-black text-ink">حدد الكميات المراد فصلها ودفعها الآن بشكل مستقل:</h4>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {selectedTableCartItems.map((item, idx) => {
                          const maxUnits = Math.max(1, Math.floor((item.quantityMilli || 1000) / 1000));
                          const curUnits = Math.floor((splitQtys[idx] || 0) / 1000);
                          return (
                            <div
                              key={`${item.productId}-${idx}`}
                              className="p-2 rounded-xl bg-surface-2 border border-line flex items-center justify-between text-xs"
                            >
                              <div>
                                <div className="font-black text-ink">{item.productName}</div>
                                <div className="text-[11px] text-ink-muted font-bold">
                                  الكمية بالطاولة: {maxUnits}
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSplitQtys((prev) => ({
                                      ...prev,
                                      [idx]: Math.max(0, (curUnits - 1) * 1000),
                                    }))
                                  }
                                  className="w-7 h-7 rounded-lg bg-surface border border-line font-black"
                                >
                                  -
                                </button>
                                <span className="w-7 text-center font-black text-brand">{curUnits}</span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSplitQtys((prev) => ({
                                      ...prev,
                                      [idx]: Math.min(maxUnits * 1000, (curUnits + 1) * 1000),
                                    }))
                                  }
                                  className="w-7 h-7 rounded-lg bg-surface border border-line font-black"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <button
                        type="button"
                        disabled={loading}
                        onClick={handleExecuteSplit}
                        className="w-full py-2.5 rounded-xl bg-paid text-white text-xs font-black"
                      >
                        فصل الأصناف المحددة وتحويلها للكاشير للسداد
                      </button>
                    </div>
                  )}

                  {/* Items Preview & Free Table Button */}
                  <div className="p-4 rounded-2xl bg-surface border border-line space-y-2">
                    <div className="text-xs font-black text-ink">أصناف الطاولة الحالية:</div>
                    {selectedTableCartItems.length === 0 ? (
                      <p className="text-xs text-ink-muted font-bold">لم يتم إضافة أصناف بعد</p>
                    ) : (
                      <div className="space-y-1.5 max-h-40 overflow-y-auto">
                        {selectedTableCartItems.map((it, idx) => (
                          <div key={idx} className="flex items-center justify-between text-xs border-b border-line/40 pb-1">
                            <span className="font-bold text-ink">
                              {it.productName} × {(it.quantityMilli / 1000).toFixed(it.quantityMilli % 1000 === 0 ? 0 : 2)}
                            </span>
                            <span className="font-black text-ink">{formatArabicCurrency(it.totalPiasters)}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="pt-2 border-t border-line flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleCloseFreeTable(selectedTable)}
                        className="flex items-center gap-1 text-[11px] font-bold text-danger hover:underline"
                      >
                        <Unlock className="w-3.5 h-3.5" />
                        <span>إخلاء الطاولة يدوياً (بدون فاتورة)</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
