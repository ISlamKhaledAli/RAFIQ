export type OrderMode = 'dine_in' | 'takeaway' | 'delivery';

export interface RestaurantTable {
  id: string;
  name: string;
  zoneName: string;
  capacity: number;
  status: 'available' | 'occupied' | 'bill_printed' | 'reserved' | string;
  activeHeldSaleId?: string | null;
  waiterName?: string | null;
  guestsCount: number;
  openedAt?: string | null;
  displayOrder: number;
  isActive: boolean;
  currentTotalPiasters: number;
  itemsCount: number;
  cartJson?: string | null;
  printedKotQuantitiesJson?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface TableSplitItemRequest {
  cartLineIndex: number;
  productId: string;
  quantityMilli: number;
}

export interface TableSplitResult {
  sourceTable: RestaurantTable;
  splitCartJson: string;
  remainingCartJson: string;
  splitSubtotalPiasters: number;
}

export interface ModifierOption {
  id: string;
  groupId: string;
  name: string;
  extraPricePiasters: number;
  costPiasters: number;
  linkedIngredientId?: string | null;
  linkedIngredientName?: string | null;
  linkedQtyMilli: number;
  isDefault: boolean;
  displayOrder: number;
  isActive: boolean;
  createdAt?: string;
}

export interface ModifierGroup {
  id: string;
  name: string;
  selectionType: 'single' | 'multiple' | string;
  isRequired: boolean;
  minSelections: number;
  maxSelections: number;
  displayOrder: number;
  isActive: boolean;
  options: ModifierOption[];
  createdAt?: string;
  updatedAt?: string;
}

export interface SaleItemModifier {
  id?: string;
  saleItemId?: string;
  saleId?: string;
  optionId: string;
  groupName?: string;
  optionName: string;
  extraPricePiasters: number;
  quantityMilli: number;
}

export interface KotItemDto {
  productId: string;
  productName: string;
  categoryId?: string | null;
  kotStation?: string | null;
  quantityMilli: number;
  notes?: string | null;
  modifiers?: SaleItemModifier[];
}

export interface KotPrintRequest {
  tableId?: string | null;
  tableName?: string | null;
  heldSaleId?: string | null;
  saleId?: string | null;
  orderType: OrderMode | string;
  orderCallNumber?: number;
  invoiceNumber?: number;
  waiterName?: string | null;
  guestsCount?: number;
  deltaOnly?: boolean;
  isSupplement?: boolean;
  printerName?: string | null;
  cashierName?: string | null;
  notes?: string | null;
  items: KotItemDto[];
}

export interface CategoryKotRoute {
  categoryId: string;
  categoryName: string;
  kotStation: 'kitchen' | 'bar' | 'both' | 'none' | string;
}

export interface KotRoutingConfig {
  kitchenPrinterName: string;
  barPrinterName: string;
  paperWidth: '80mm' | '57mm' | string;
  autoPrintOnSale: boolean;
  singlePrinterCutBetweenStations: boolean;
  categoryRoutes: CategoryKotRoute[];
}

export interface DeliveryZone {
  id: string;
  name: string;
  feePiasters: number;
  estimatedMinutes: number;
  isActive: boolean;
  createdAt?: string;
}

export interface DeliveryRider {
  id: string;
  name: string;
  phone?: string | null;
  vehicleInfo?: string | null;
  commissionPercent: number;
  fixedFeePerOrderPiasters: number;
  isActive: boolean;
  activeOrdersCount?: number;
  unsettledCashPiasters?: number;
  createdAt?: string;
}

export interface DeliveryOrderCreateInfo {
  customerId?: string | null;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  landmark?: string | null;
  zoneId?: string | null;
  zoneName?: string | null;
  riderId?: string | null;
  riderName?: string | null;
  deliveryFeePiasters: number;
  notes?: string | null;
}

export interface DeliveryOrder {
  id: string;
  saleId: string;
  invoiceNumber: number;
  orderCallNumber: number;
  customerId?: string | null;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  landmark?: string | null;
  zoneId?: string | null;
  zoneName?: string | null;
  riderId?: string | null;
  riderName?: string | null;
  status: 'preparing' | 'out_for_delivery' | 'delivered' | 'cancelled' | string;
  deliveryFeePiasters: number;
  orderTotalPiasters: number;
  cashToCollectPiasters: number;
  riderCommissionPiasters: number;
  isSettled: boolean;
  settledAt?: string | null;
  settledBy?: string | null;
  dispatchedAt?: string | null;
  deliveredAt?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface RiderSettlementSummary {
  riderId: string;
  riderName: string;
  riderPhone?: string | null;
  unsettledOrdersCount: number;
  totalCashToCollectPiasters: number;
  totalDeliveryFeesPiasters: number;
  totalRiderCommissionPiasters: number;
  netDrawerAmountPiasters: number;
  orders: DeliveryOrder[];
}

export interface RecipeIngredient {
  id?: string;
  recipeId?: string;
  rawProductId: string;
  rawProductName: string;
  rawProductUnit?: string;
  rawProductCostPiasters?: number;
  rawProductStockMilli?: number;
  quantityMilli: number;
  wastagePercent: number;
  effectiveQuantityMilli?: number;
  lineCostPiasters?: number;
  notes?: string | null;
}

export interface Recipe {
  id: string;
  productId: string;
  productName: string;
  productBarcode?: string | null;
  productSellPricePiasters?: number;
  yieldQtyMilli: number;
  depletionMode: 'on_sale' | 'batch_production' | string;
  wastagePercent: number;
  calculatedCostPiasters: number;
  unitCostPiasters: number;
  notes?: string | null;
  isActive: boolean;
  ingredients: RecipeIngredient[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ProductionBatch {
  id: string;
  recipeId: string;
  productId: string;
  productName: string;
  producedQtyMilli: number;
  totalCostPiasters: number;
  unitCostPiasters: number;
  producedBy?: string | null;
  producedByName?: string | null;
  notes?: string | null;
  createdAt: string;
}
