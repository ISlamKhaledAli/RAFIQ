import type { ProductUnit } from '../../types/models';

/**
 * The unit a product is sold in by default (catalog tile, live search row, quick add):
 * explicit default sale unit, else the largest pack when loose selling is off, else the base unit.
 */
export function resolveDefaultSaleUnit(
  units: ProductUnit[] | undefined,
  defaultSaleUnitId?: string | null,
  isLooseSellable?: boolean,
): ProductUnit | null {
  if (!units || units.length === 0) return null;
  const explicit = defaultSaleUnitId ? units.find((u) => u.id === defaultSaleUnitId) : null;
  if (explicit) return explicit;
  if (isLooseSellable === false && units.length > 1) {
    const largestPack = units
      .filter((u) => !u.isBaseUnit)
      .sort((a, b) => b.conversionFactor - a.conversionFactor)[0];
    if (largestPack) return largestPack;
  }
  return units.find((u) => u.isBaseUnit) || units[0];
}
