// A café menu item made from an on-sale recipe never consumes its own stock (the server deducts and checks
// its ingredients), so the POS only guards own stock for ordinary products while negative stock is off.
export function enforcesOwnStock(allowNegativeStock: boolean, item: { consumesIngredientsOnSale?: boolean }): boolean {
  return !allowNegativeStock && !item.consumesIngredientsOnSale;
}
