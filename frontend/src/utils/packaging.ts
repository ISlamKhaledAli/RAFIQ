import type { ProductUnit } from '../types/models';

/**
 * دالة تنسيق المخزون المركب (Compound Stock Display)
 * تُظهر الرصيد بصيغة متعددة المستويات («10 علب و 7 أقراص») للمنتجات التي تباع بالتجزئة وفك العبوات
 */
export function formatCompoundStock(
  stockMilli: number,
  units?: ProductUnit[] | null,
  baseUnitName: string = 'قطعة'
): string {
  if (stockMilli === 0) {
    return `0 ${baseUnitName}`;
  }

  const isNegative = stockMilli < 0;
  const absStockMilli = Math.abs(stockMilli);

  if (!units || units.length <= 1) {
    const qty = absStockMilli / 1000;
    const formatted = qty % 1 === 0 ? qty.toString() : qty.toFixed(2);
    return `${isNegative ? '-' : ''}${formatted} ${baseUnitName}`;
  }

  // Filter and sort units descending by conversion factor
  const validUnits = units
    .filter(u => u.conversionFactor > 0)
    .sort((a, b) => b.conversionFactor - a.conversionFactor);

  if (validUnits.length === 0) {
    const qty = absStockMilli / 1000;
    const formatted = qty % 1 === 0 ? qty.toString() : qty.toFixed(2);
    return `${isNegative ? '-' : ''}${formatted} ${baseUnitName}`;
  }

  let remainingBaseUnits = Math.floor(absStockMilli / 1000);
  const tailMilli = absStockMilli % 1000;
  const parts: string[] = [];

  for (const u of validUnits) {
    if (u.conversionFactor <= 1) {
      continue; // Handled as base unit at the end
    }

    const count = Math.floor(remainingBaseUnits / u.conversionFactor);
    if (count > 0) {
      parts.push(`${count} ${u.unitName}`);
      remainingBaseUnits %= u.conversionFactor;
    }
  }

  // Find base unit name
  const baseUnit = validUnits.find(u => u.isBaseUnit || u.conversionFactor === 1);
  const actualBaseName = baseUnit?.unitName || baseUnitName;

  if (remainingBaseUnits > 0 || tailMilli > 0 || parts.length === 0) {
    if (tailMilli > 0) {
      const fractional = remainingBaseUnits + tailMilli / 1000;
      parts.push(`${fractional.toFixed(2)} ${actualBaseName}`);
    } else if (remainingBaseUnits > 0 || parts.length === 0) {
      parts.push(`${remainingBaseUnits} ${actualBaseName}`);
    }
  }

  const prefix = isNegative ? 'سالب ' : '';
  return prefix + parts.join(' و ');
}

/**
 * فحص ما إذا كانت هناك عبوة مفتوحة (Open Package)
 * تكون العبوة مفتوحة إذا كان الرصيد لا يقبل القسمة التامة على معامل العبوة الأكبر
 */
export function hasOpenPackage(stockMilli: number, units?: ProductUnit[] | null): boolean {
  if (stockMilli <= 0 || !units || units.length <= 1) {
    return false;
  }

  // Find highest packaging unit (e.g., carton or box)
  let maxFactor = 1;
  for (const u of units) {
    if (u.conversionFactor > maxFactor) {
      maxFactor = u.conversionFactor;
    }
  }

  if (maxFactor <= 1) {
    return false;
  }

  const packageMilli = maxFactor * 1000;
  return stockMilli % packageMilli !== 0;
}
