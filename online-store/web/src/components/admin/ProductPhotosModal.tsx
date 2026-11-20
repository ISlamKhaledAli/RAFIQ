import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Camera,
  Trash2,
  X,
  Upload,
  ImagePlus,
  Loader2,
  Link,
  Plus,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import type { Product } from '../../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  categoryName?: string;
  isUploading: boolean;
  onUploadImage: (productId: string, file: File | null) => void;
  onAddImageUrl?: (productId: string, url: string) => Promise<void> | void;
  onDeleteImage: (productId: string, url: string) => void;
}

export const ProductPhotosModal: React.FC<Props> = ({
  isOpen,
  onClose,
  product,
  categoryName,
  isUploading,
  onUploadImage,
  onAddImageUrl,
  onDeleteImage,
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'url'>('upload');
  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState('');
  const [isAddingUrl, setIsAddingUrl] = useState(false);

  if (!isOpen || !product) return null;
  if (typeof document === 'undefined') return null;

  const images = product.image_urls || [];
  const remainingSlots = Math.max(0, 3 - images.length);

  const handleAddUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = urlInput.trim();
    if (!trimmed) {
      setUrlError('يرجى إدخال رابط الصورة');
      return;
    }
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://') && !trimmed.startsWith('data:image/')) {
      setUrlError('يجب أن يبدأ الرابط بـ https:// أو http://');
      return;
    }
    if (remainingSlots <= 0) {
      setUrlError('تم الوصول للحد الأقصى (3 صور). احذف صورة أولاً.');
      return;
    }

    setUrlError('');
    setIsAddingUrl(true);
    try {
      if (onAddImageUrl) {
        await onAddImageUrl(product.id, trimmed);
        setUrlInput('');
      }
    } catch (err: any) {
      setUrlError(err?.message || 'تعذر إضافة رابط الصورة');
    } finally {
      setIsAddingUrl(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="bg-white rounded-3xl border border-[#DCE1DC] shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]"
        dir="rtl"
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-[#DCE1DC] bg-[#F8FAFC] flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-[#E6F2ED] border border-[#004D3F]/20 flex items-center justify-center text-[#004D3F] flex-shrink-0">
              <Camera className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-black text-[#0F172A] truncate">
                إدارة صور المنتج لمتجرك الإلكتروني
              </h3>
              <p className="text-xs text-[#52605D] truncate mt-0.5 font-medium">
                {product.name} {categoryName ? `• ${categoryName}` : ''}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-[#F1F5F4] flex items-center justify-center text-[#52605D] hover:text-[#0F172A] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Method Tabs: Upload vs Direct URL */}
          <div className="flex items-center p-1 bg-[#F1F5F4] rounded-2xl border border-[#DCE1DC]">
            <button
              type="button"
              onClick={() => setActiveTab('upload')}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 ${
                activeTab === 'upload'
                  ? 'bg-white text-[#004D3F] shadow-xs'
                  : 'text-[#52605D] hover:text-[#0F172A]'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>رفع من الجهاز أو الكاميرا</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('url')}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 ${
                activeTab === 'url'
                  ? 'bg-white text-[#004D3F] shadow-xs'
                  : 'text-[#52605D] hover:text-[#0F172A]'
              }`}
            >
              <Link className="w-3.5 h-3.5" />
              <span>إضافة رابط صورة مباشر (URL)</span>
            </button>
          </div>

          {/* URL Input Form (if tab === 'url') */}
          {activeTab === 'url' && (
            <form onSubmit={handleAddUrl} className="bg-[#F8FAFC] border border-[#DCE1DC] rounded-2xl p-4 space-y-3">
              <div className="space-y-1">
                <label className="block text-xs font-bold text-[#0F172A]">
                  رابط الصورة المباشر من الإنترنت
                </label>
                <div className="relative">
                  <input
                    type="url"
                    value={urlInput}
                    onChange={e => {
                      setUrlInput(e.target.value);
                      setUrlError('');
                    }}
                    placeholder="https://example.com/product-image.jpg"
                    disabled={isAddingUrl || remainingSlots <= 0}
                    className="w-full pl-3 pr-3 py-2 rounded-xl border border-[#DCE1DC] bg-white text-xs font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#004D3F]/25 text-left font-mono"
                    dir="ltr"
                  />
                </div>
                <p className="text-[10px] text-[#52605D]">
                  وفر مساحة التخزين واربط صور منتجاتك مباشرة من موقع المورد أو جوجل أو مواقع الاستضافة.
                </p>
              </div>

              {urlError && (
                <div className="flex items-center gap-1.5 text-xs text-[#B23A2E] font-bold">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{urlError}</span>
                </div>
              )}

              {/* URL live preview */}
              {urlInput.trim().startsWith('http') && (
                <div className="flex items-center gap-3 p-2 bg-white rounded-xl border border-[#DCE1DC]">
                  <img
                    src={urlInput.trim()}
                    alt="معاينة"
                    className="w-12 h-12 object-cover rounded-lg border border-[#DCE1DC] bg-[#F1F5F4]"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                  <div className="text-xs text-[#52605D] truncate flex-1">
                    معاينة حية للصورة قبل الإضافة
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isAddingUrl || !urlInput.trim() || remainingSlots <= 0}
                className="w-full py-2.5 rounded-xl bg-[#004D3F] hover:bg-[#00372D] text-white text-xs font-black transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isAddingUrl ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                <span>إضافة رابط الصورة للمنتج</span>
              </button>
            </form>
          )}

          {/* 3 Photo Slots Grid */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-[#0F172A]">
              <span>معرض صور الصنف</span>
              <span className="text-[#52605D] font-mono">{images.length}/3 صور</span>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {images.map((url, idx) => (
                <div
                  key={idx}
                  className="group relative aspect-square rounded-2xl overflow-hidden border-2 border-[#DCE1DC] bg-[#F8FAFC] shadow-xs"
                >
                  <img
                    src={url}
                    alt={`${product.name} - صورة ${idx + 1}`}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-black/60 text-white text-[10px] font-mono font-bold backdrop-blur-xs">
                    {idx + 1}
                  </div>
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <button
                      type="button"
                      disabled={isUploading}
                      onClick={() => onDeleteImage(product.id, url)}
                      className="p-2 rounded-xl bg-red-600 hover:bg-red-700 text-white shadow-md transition-colors cursor-pointer"
                      title="حذف هذه الصورة"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}

              {Array.from({ length: remainingSlots }).map((_, slotIdx) => (
                <label
                  key={`empty-${slotIdx}`}
                  className={`group aspect-square rounded-2xl border-2 border-dashed flex flex-col items-center justify-center p-3 text-center transition-all ${
                    isUploading
                      ? 'border-[#004D3F]/30 bg-[#E6F2ED]/50 cursor-wait'
                      : 'border-[#DCE1DC] hover:border-[#004D3F] hover:bg-[#E6F2ED]/30 cursor-pointer'
                  }`}
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-6 h-6 text-[#004D3F] animate-spin mb-1" />
                      <span className="text-[11px] font-bold text-[#004D3F]">جاري الرفع...</span>
                    </>
                  ) : (
                    <>
                      <div className="w-8 h-8 rounded-xl bg-[#F1F5F4] group-hover:bg-[#E6F2ED] flex items-center justify-center text-[#52605D] group-hover:text-[#004D3F] transition-colors mb-1.5">
                        <ImagePlus className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-bold text-[#0F172A] group-hover:text-[#004D3F] transition-colors">
                        رفع صورة
                      </span>
                      <span className="text-[10px] text-[#52605D] mt-0.5">
                        خانة {images.length + slotIdx + 1} من 3
                      </span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    disabled={isUploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      e.target.value = '';
                      onUploadImage(product.id, f);
                    }}
                    className="hidden"
                  />
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#DCE1DC] bg-[#F8FAFC] flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-[#004D3F] hover:bg-[#00372D] text-white text-xs font-black transition-colors cursor-pointer"
          >
            تم
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
