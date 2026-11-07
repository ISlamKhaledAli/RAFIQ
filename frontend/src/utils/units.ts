/**
 * قاموس ودوال تعريب أسماء الوحدات والعبوات
 * Unit Localization & Arabic Display Formatting
 */

/**
 * تحويل مسميات الوحدات الإنجليزية أو غير المعربة إلى المسمى العربي المعتمد في رفيق
 * مثال: piece / pcs -> قطعة، box -> علبة، carton -> كرتونة
 */
export function formatUnitArabic(unit?: string | null): string {
  if (!unit) return 'قطعة';
  const u = unit.trim().toLowerCase();
  if (u === 'piece' || u === 'pieces' || u === 'pcs' || u === 'pc' || u === 'item' || u === 'unit') return 'قطعة';
  if (u === 'box' || u === 'boxes') return 'علبة';
  if (u === 'kg' || u === 'kilogram' || u === 'kilo') return 'كجم';
  if (u === 'g' || u === 'gram' || u === 'gm') return 'جم';
  if (u === 'carton' || u === 'cartons' || u === 'ctn') return 'كرتونة';
  if (u === 'pack' || u === 'packs' || u === 'packet') return 'باكت';
  if (u === 'strip' || u === 'strips') return 'شريط';
  if (u === 'tablet' || u === 'tablets' || u === 'pill' || u === 'pills' || u === 'tab') return 'قرص';
  if (u === 'capsule' || u === 'capsules' || u === 'cap') return 'كبسولة';
  if (u === 'bottle' || u === 'bottles') return 'زجاجة';
  if (u === 'can' || u === 'cans') return 'كانز';
  if (u === 'liter' || u === 'l' || u === 'liters') return 'لتر';
  if (u === 'meter' || u === 'm' || u === 'meters') return 'متر';
  if (u === 'roll' || u === 'rolls') return 'بكرة';
  if (u === 'bag' || u === 'bags') return 'كيس';
  if (u === 'dozen' || u === 'dozens') return 'دستة';
  return unit.trim();
}

/**
 * دالة صياغة الوحدة بالبادئة «بالـ» أو «بال» مع مراعاة قواعد اللغة العربية
 * لمنع ظهور صياغات هجينة مثل «بالـpiece» أو «بالـkg»
 * مثال:
 *  'piece' / 'pcs' -> 'بالقطعة'
 *  'علبة' -> 'بالعلبة'
 *  'كرتونة' -> 'بالكرتونة'
 *  'كيلو' / 'kg' -> 'بالكيلو'
 *  'قرص' -> 'بالقرص'
 *  'شريط' -> 'بالشريط'
 */
export function formatUnitWithBi(unit?: string | null): string {
  const localized = formatUnitArabic(unit);
  if (!localized) return 'بالقطعة';

  const clean = localized.trim();
  if (clean.startsWith('بال')) return clean;
  if (clean.startsWith('بـ')) return clean;

  if (clean === 'كجم') return 'بالكيلو';
  if (clean === 'جم') return 'بالجرام';

  if (clean.startsWith('ال')) {
    return `ب${clean}`;
  }

  return `بال${clean}`;
}
