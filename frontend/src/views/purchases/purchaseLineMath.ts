import { calculateLineTotal } from '../../utils/money.ts';
import type { NewPurchaseLineItem } from './types.ts';

export interface PurchaseLineAmounts {
  quantityMilli: number;
  bonusQuantityMilli: number;
  conversionFactor: number;
  packageCostPiasters: number;
  unitCostPiasters: number;
  lineGrossPiasters: number;
}

/** Units per package: active selected unit factor, else the product's package unit, else typed pack size. */
export function resolvePackSize(item: NewPurchaseLineItem): number {
  if (typeof item.selectedUnitFactor === 'number' && item.selectedUnitFactor > 1) {
    return Math.round(item.selectedUnitFactor);
  }
  const pkgUnit = item.productUnits?.find((u) => !u.isBaseUnit && u.conversionFactor > 1);
  const size = pkgUnit?.conversionFactor || parseInt(item.packSizeInput || '', 10) || item.packSize || 1;
  return size > 1 ? Math.round(size) : 1;
}

export function resolvePurchaseUnitMode(item: NewPurchaseLineItem): 'package' | 'base' {
  if (typeof item.selectedUnitFactor === 'number') {
    return item.selectedUnitFactor > 1 ? 'package' : 'base';
  }
  return item.purchaseUnitMode || (resolvePackSize(item) > 1 ? 'package' : 'base');
}

/** packageCost x (baseQuantity / packSize), rounded once per line - mirrors PurchaseRepository.PackageLineGross. */
export function packageLineGross(packageCostPiasters: number, quantityMilli: number, packSize: number): number {
  const factor = packSize > 1 ? packSize : 1;
  return Math.round((packageCostPiasters * quantityMilli) / (1000 * factor));
}

/**
 * Amounts sent to purchases:create for one line. A line bought by the package is priced from the package
 * cost (47.50 per box of 20 x 10 boxes = 475.00, never 20 x 2.38), and the distributor bonus is entered in
 * packages, so it is converted to base units.
 */
export function computePurchaseLine(item: NewPurchaseLineItem): PurchaseLineAmounts {
  const packSize = resolvePackSize(item);
  const isPackage = resolvePurchaseUnitMode(item) === 'package' && packSize > 1;
  const quantityMilli = Math.round((item.quantityUnits || 0) * 1000);
  const bonusMultiplier = isPackage ? packSize : 1;
  const bonusQuantityMilli = Math.max(0, Math.round((item.bonusQuantityUnits || 0) * bonusMultiplier * 1000));
  const unitCostPiasters = item.unitCostPiasters;

  if (!isPackage) {
    const packageCostPiasters = packSize > 1 ? (unitCostPiasters * packSize) : unitCostPiasters;
    return {
      quantityMilli,
      bonusQuantityMilli,
      conversionFactor: 1,
      packageCostPiasters,
      unitCostPiasters,
      lineGrossPiasters: calculateLineTotal(unitCostPiasters, quantityMilli),
    };
  }

  const packagePriced = (item.packageCostPiasters || 0) > 0;
  const packageCostPiasters = packagePriced ? (item.packageCostPiasters as number) : unitCostPiasters * packSize;
  const effectiveUnitCost = packagePriced ? Math.round(packageCostPiasters / packSize) : unitCostPiasters;
  return {
    quantityMilli,
    bonusQuantityMilli,
    conversionFactor: packSize,
    packageCostPiasters,
    unitCostPiasters: effectiveUnitCost,
    lineGrossPiasters: packageLineGross(packageCostPiasters, quantityMilli, packSize),
  };
}

export function purchaseLinesTotal(items: NewPurchaseLineItem[]): number {
  return items.reduce((sum, item) => sum + computePurchaseLine(item).lineGrossPiasters, 0);
}
