/**
 * Arabic Unit Localizer for Rafiq Online Store Web Storefront
 * Converts legacy internal English unit keys ('piece', 'pcs', 'box', 'kg', etc.)
 * into proper clean Arabic labels for customer-facing display.
 */
export function formatUnitArabic(unit?: string | null): string {
  if (!unit) return 'قطعة';
  const lower = unit.trim().toLowerCase();
  if (
    lower === 'piece' ||
    lower === 'pieces' ||
    lower === 'pcs' ||
    lower === 'pc' ||
    lower === 'item' ||
    lower === 'unit' ||
    lower === 'وحدة'
  ) {
    return 'قطعة';
  }
  if (lower === 'box' || lower === 'boxes') return 'علبة';
  if (lower === 'carton' || lower === 'cartons' || lower === 'ctn') return 'كرتونة';
  if (lower === 'pack' || lower === 'packs' || lower === 'packet') return 'باكت';
  if (lower === 'strip' || lower === 'strips') return 'شريط';
  if (lower === 'tablet' || lower === 'tablets' || lower === 'pill' || lower === 'pills' || lower === 'tab') return 'قرص';
  if (lower === 'capsule' || lower === 'capsules' || lower === 'cap') return 'كبسولة';
  if (lower === 'kg' || lower === 'kilo' || lower === 'kilogram') return 'كجم';
  if (lower === 'g' || lower === 'gram' || lower === 'gm') return 'جم';
  if (lower === 'bottle' || lower === 'bottles') return 'زجاجة';
  if (lower === 'can' || lower === 'cans') return 'كانز';
  if (lower === 'liter' || lower === 'l' || lower === 'liters') return 'لتر';
  if (lower === 'meter' || lower === 'm' || lower === 'meters') return 'متر';
  if (lower === 'roll' || lower === 'rolls') return 'بكرة';
  if (lower === 'bag' || lower === 'bags') return 'كيس';
  if (lower === 'dozen' || lower === 'dozens') return 'دستة';
  return unit.trim();
}
