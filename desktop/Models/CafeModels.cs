using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace RafiqPOS.Models
{
    // ─── Story 139: Floor & Table Management Models ───────────────────────────

    public class RestaurantTable
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("name")]
        public string Name { get; set; }

        [JsonProperty("zoneName")]
        public string ZoneName { get; set; }

        [JsonProperty("capacity")]
        public int Capacity { get; set; }

        [JsonProperty("status")]
        public string Status { get; set; } // 'available' | 'occupied' | 'bill_printed' | 'reserved'

        [JsonProperty("activeHeldSaleId")]
        public string ActiveHeldSaleId { get; set; }

        [JsonProperty("waiterName")]
        public string WaiterName { get; set; }

        [JsonProperty("guestsCount")]
        public int GuestsCount { get; set; }

        [JsonProperty("openedAt")]
        public string OpenedAt { get; set; }

        [JsonProperty("displayOrder")]
        public int DisplayOrder { get; set; }

        [JsonProperty("isActive")]
        public bool IsActive { get; set; }

        [JsonProperty("currentTotalPiasters")]
        public long CurrentTotalPiasters { get; set; }

        [JsonProperty("itemsCount")]
        public int ItemsCount { get; set; }

        [JsonProperty("cartJson")]
        public string CartJson { get; set; }

        [JsonProperty("printedKotQuantitiesJson")]
        public string PrintedKotQuantitiesJson { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }

        [JsonProperty("updatedAt")]
        public string UpdatedAt { get; set; }
    }

    public class TableSplitItemRequest
    {
        [JsonProperty("cartLineIndex")]
        public int CartLineIndex { get; set; }

        [JsonProperty("productId")]
        public string ProductId { get; set; }

        [JsonProperty("quantityMilli")]
        public long QuantityMilli { get; set; }
    }

    public class TableSplitResult
    {
        [JsonProperty("sourceTable")]
        public RestaurantTable SourceTable { get; set; }

        [JsonProperty("splitCartJson")]
        public string SplitCartJson { get; set; }

        [JsonProperty("remainingCartJson")]
        public string RemainingCartJson { get; set; }

        [JsonProperty("splitSubtotalPiasters")]
        public long SplitSubtotalPiasters { get; set; }
    }

    // ─── Story 140: Item Modifiers & Customizations Models ────────────────────

    public class ModifierGroup
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("name")]
        public string Name { get; set; }

        [JsonProperty("selectionType")]
        public string SelectionType { get; set; } // 'single' | 'multiple'

        [JsonProperty("isRequired")]
        public bool IsRequired { get; set; }

        [JsonProperty("minSelections")]
        public int MinSelections { get; set; }

        [JsonProperty("maxSelections")]
        public int MaxSelections { get; set; }

        [JsonProperty("displayOrder")]
        public int DisplayOrder { get; set; }

        [JsonProperty("isActive")]
        public bool IsActive { get; set; }

        [JsonProperty("options")]
        public List<ModifierOption> Options { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }

        [JsonProperty("updatedAt")]
        public string UpdatedAt { get; set; }

        public ModifierGroup()
        {
            this.SelectionType = "multiple";
            this.MaxSelections = 5;
            this.IsActive = true;
            this.Options = new List<ModifierOption>();
        }
    }

    public class ModifierOption
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("groupId")]
        public string GroupId { get; set; }

        [JsonProperty("name")]
        public string Name { get; set; }

        [JsonProperty("extraPricePiasters")]
        public long ExtraPricePiasters { get; set; }

        [JsonProperty("costPiasters")]
        public long CostPiasters { get; set; }

        [JsonProperty("linkedIngredientId")]
        public string LinkedIngredientId { get; set; }

        [JsonProperty("linkedIngredientName")]
        public string LinkedIngredientName { get; set; }

        [JsonProperty("linkedQtyMilli")]
        public long LinkedQtyMilli { get; set; }

        [JsonProperty("isDefault")]
        public bool IsDefault { get; set; }

        [JsonProperty("displayOrder")]
        public int DisplayOrder { get; set; }

        [JsonProperty("isActive")]
        public bool IsActive { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }

        public ModifierOption()
        {
            this.IsActive = true;
        }
    }

    public class SaleItemModifier
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("saleItemId")]
        public string SaleItemId { get; set; }

        [JsonProperty("saleId")]
        public string SaleId { get; set; }

        [JsonProperty("optionId")]
        public string OptionId { get; set; }

        [JsonProperty("groupName")]
        public string GroupName { get; set; }

        [JsonProperty("optionName")]
        public string OptionName { get; set; }

        [JsonProperty("extraPricePiasters")]
        public long ExtraPricePiasters { get; set; }

        [JsonProperty("quantityMilli")]
        public long QuantityMilli { get; set; }

        public SaleItemModifier()
        {
            this.QuantityMilli = 1000;
        }
    }

    // ─── Story 141: Kitchen & Bar KOT Models ──────────────────────────────────

    public class KotItemDto
    {
        [JsonProperty("productId")]
        public string ProductId { get; set; }

        [JsonProperty("productName")]
        public string ProductName { get; set; }

        [JsonProperty("categoryId")]
        public string CategoryId { get; set; }

        [JsonProperty("kotStation")]
        public string KotStation { get; set; }

        [JsonProperty("quantityMilli")]
        public long QuantityMilli { get; set; }

        [JsonProperty("notes")]
        public string Notes { get; set; }

        [JsonProperty("modifiers")]
        public List<SaleItemModifier> Modifiers { get; set; }

        public KotItemDto()
        {
            this.Modifiers = new List<SaleItemModifier>();
        }
    }

    public class KotPrintRequest
    {
        [JsonProperty("tableId")]
        public string TableId { get; set; }

        [JsonProperty("tableName")]
        public string TableName { get; set; }

        [JsonProperty("heldSaleId")]
        public string HeldSaleId { get; set; }

        [JsonProperty("saleId")]
        public string SaleId { get; set; }

        [JsonProperty("orderType")]
        public string OrderType { get; set; } // 'dine_in' | 'takeaway' | 'delivery'

        [JsonProperty("orderCallNumber")]
        public int OrderCallNumber { get; set; }

        [JsonProperty("invoiceNumber")]
        public int InvoiceNumber { get; set; }

        [JsonProperty("waiterName")]
        public string WaiterName { get; set; }

        [JsonProperty("guestsCount")]
        public int GuestsCount { get; set; }

        [JsonProperty("deltaOnly")]
        public bool DeltaOnly { get; set; }

        [JsonProperty("isSupplement")]
        public bool IsSupplement { get; set; }

        [JsonProperty("printerName")]
        public string PrinterName { get; set; }

        [JsonProperty("cashierName")]
        public string CashierName { get; set; }

        [JsonProperty("notes")]
        public string Notes { get; set; }

        [JsonProperty("items")]
        public List<KotItemDto> Items { get; set; }

        public KotPrintRequest()
        {
            this.Items = new List<KotItemDto>();
        }
    }

    public class CategoryKotRoute
    {
        [JsonProperty("categoryId")]
        public string CategoryId { get; set; }

        [JsonProperty("categoryName")]
        public string CategoryName { get; set; }

        [JsonProperty("kotStation")]
        public string KotStation { get; set; } // 'kitchen' | 'bar' | 'both' | 'none'
    }

    public class KotRoutingConfig
    {
        [JsonProperty("kitchenPrinterName")]
        public string KitchenPrinterName { get; set; }

        [JsonProperty("barPrinterName")]
        public string BarPrinterName { get; set; }

        [JsonProperty("paperWidth")]
        public string PaperWidth { get; set; }

        [JsonProperty("autoPrintOnSale")]
        public bool AutoPrintOnSale { get; set; }

        [JsonProperty("singlePrinterCutBetweenStations")]
        public bool SinglePrinterCutBetweenStations { get; set; }

        [JsonProperty("categoryRoutes")]
        public List<CategoryKotRoute> CategoryRoutes { get; set; }

        public KotRoutingConfig()
        {
            this.PaperWidth = "80mm";
            this.SinglePrinterCutBetweenStations = true;
            this.CategoryRoutes = new List<CategoryKotRoute>();
        }
    }

    // ─── Story 142: Delivery Zones, Riders & Delivery Orders Models ───────────

    public class DeliveryZone
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("name")]
        public string Name { get; set; }

        [JsonProperty("feePiasters")]
        public long FeePiasters { get; set; }

        [JsonProperty("estimatedMinutes")]
        public int EstimatedMinutes { get; set; }

        [JsonProperty("minOrderPiasters")]
        public long MinOrderPiasters { get; set; }

        [JsonProperty("riderCommissionPiasters")]
        public long RiderCommissionPiasters { get; set; }

        [JsonProperty("displayOrder")]
        public int DisplayOrder { get; set; }

        [JsonProperty("isActive")]
        public bool IsActive { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }

        [JsonProperty("updatedAt")]
        public string UpdatedAt { get; set; }

        public DeliveryZone()
        {
            this.EstimatedMinutes = 30;
            this.IsActive = true;
        }
    }

    public class DeliveryRider
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("name")]
        public string Name { get; set; }

        [JsonProperty("phone")]
        public string Phone { get; set; }

        [JsonProperty("vehicleType")]
        public string VehicleType { get; set; } // 'motorcycle' | 'bicycle' | 'car' | 'foot'

        [JsonProperty("commissionPerOrderPiasters")]
        public long CommissionPerOrderPiasters { get; set; }

        [JsonProperty("status")]
        public string Status { get; set; } // 'available' | 'on_delivery' | 'off_duty'

        [JsonProperty("isActive")]
        public bool IsActive { get; set; }

        [JsonProperty("notes")]
        public string Notes { get; set; }

        [JsonProperty("unsettledOrdersCount")]
        public int UnsettledOrdersCount { get; set; }

        [JsonProperty("unsettledCashPiasters")]
        public long UnsettledCashPiasters { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }

        [JsonProperty("updatedAt")]
        public string UpdatedAt { get; set; }

        public DeliveryRider()
        {
            this.VehicleType = "motorcycle";
            this.Status = "available";
            this.IsActive = true;
        }
    }

    public class DeliveryOrderCreateInfo
    {
        [JsonProperty("customerName")]
        public string CustomerName { get; set; }

        [JsonProperty("customerPhone")]
        public string CustomerPhone { get; set; }

        [JsonProperty("deliveryAddress")]
        public string DeliveryAddress { get; set; }

        [JsonProperty("landmark")]
        public string Landmark { get; set; }

        [JsonProperty("zoneId")]
        public string ZoneId { get; set; }

        [JsonProperty("zoneName")]
        public string ZoneName { get; set; }

        [JsonProperty("deliveryFeePiasters")]
        public long DeliveryFeePiasters { get; set; }

        [JsonProperty("riderId")]
        public string RiderId { get; set; }

        [JsonProperty("riderName")]
        public string RiderName { get; set; }

        [JsonProperty("notes")]
        public string Notes { get; set; }
    }

    public class DeliveryOrder
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("saleId")]
        public string SaleId { get; set; }

        [JsonProperty("invoiceNumber")]
        public int InvoiceNumber { get; set; }

        [JsonProperty("orderCallNumber")]
        public int OrderCallNumber { get; set; }

        [JsonProperty("customerId")]
        public string CustomerId { get; set; }

        [JsonProperty("customerName")]
        public string CustomerName { get; set; }

        [JsonProperty("customerPhone")]
        public string CustomerPhone { get; set; }

        [JsonProperty("deliveryAddress")]
        public string DeliveryAddress { get; set; }

        [JsonProperty("landmark")]
        public string Landmark { get; set; }

        [JsonProperty("zoneId")]
        public string ZoneId { get; set; }

        [JsonProperty("zoneName")]
        public string ZoneName { get; set; }

        [JsonProperty("deliveryFeePiasters")]
        public long DeliveryFeePiasters { get; set; }

        [JsonProperty("riderId")]
        public string RiderId { get; set; }

        [JsonProperty("riderName")]
        public string RiderName { get; set; }

        [JsonProperty("status")]
        public string Status { get; set; } // 'preparing' | 'out_for_delivery' | 'delivered' | 'returned'

        [JsonProperty("paymentMethod")]
        public string PaymentMethod { get; set; }

        [JsonProperty("totalToCollectPiasters")]
        public long TotalToCollectPiasters { get; set; }

        [JsonProperty("isSettled")]
        public bool IsSettled { get; set; }

        [JsonProperty("settledAt")]
        public string SettledAt { get; set; }

        [JsonProperty("settledByUserId")]
        public string SettledByUserId { get; set; }

        [JsonProperty("dispatchedAt")]
        public string DispatchedAt { get; set; }

        [JsonProperty("deliveredAt")]
        public string DeliveredAt { get; set; }

        [JsonProperty("notes")]
        public string Notes { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }

        [JsonProperty("updatedAt")]
        public string UpdatedAt { get; set; }
    }

    public class RiderSettlementSummary
    {
        [JsonProperty("riderId")]
        public string RiderId { get; set; }

        [JsonProperty("riderName")]
        public string RiderName { get; set; }

        [JsonProperty("unsettledOrdersCount")]
        public int UnsettledOrdersCount { get; set; }

        [JsonProperty("totalCashToCollectPiasters")]
        public long TotalCashToCollectPiasters { get; set; }

        [JsonProperty("totalDeliveryFeesPiasters")]
        public long TotalDeliveryFeesPiasters { get; set; }

        [JsonProperty("riderCommissionPiasters")]
        public long RiderCommissionPiasters { get; set; }

        [JsonProperty("netDrawerDepositPiasters")]
        public long NetDrawerDepositPiasters { get; set; }

        [JsonProperty("orders")]
        public List<DeliveryOrder> Orders { get; set; }

        public RiderSettlementSummary()
        {
            this.Orders = new List<DeliveryOrder>();
        }
    }

    // ─── Story 143: Manufacturing Recipes (BOM) & Production Models ───────────

    public class RecipeIngredient
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("recipeId")]
        public string RecipeId { get; set; }

        [JsonProperty("ingredientProductId")]
        public string IngredientProductId { get; set; }

        [JsonProperty("ingredientProductName")]
        public string IngredientProductName { get; set; }

        [JsonProperty("ingredientUnit")]
        public string IngredientUnit { get; set; }

        [JsonProperty("ingredientCostPiasters")]
        public long IngredientCostPiasters { get; set; }

        [JsonProperty("ingredientStockMilli")]
        public long IngredientStockMilli { get; set; }

        [JsonProperty("quantityMilli")]
        public long QuantityMilli { get; set; }

        [JsonProperty("wastagePercent")]
        public int WastagePercent { get; set; }

        [JsonProperty("sortOrder")]
        public int SortOrder { get; set; }

        [JsonProperty("lineCostPiasters")]
        public long LineCostPiasters { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }
    }

    public class Recipe
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("productId")]
        public string ProductId { get; set; }

        [JsonProperty("productName")]
        public string ProductName { get; set; }

        [JsonProperty("productPricePiasters")]
        public long ProductPricePiasters { get; set; }

        [JsonProperty("name")]
        public string Name { get; set; }

        [JsonProperty("yieldQtyMilli")]
        public long YieldQtyMilli { get; set; }

        [JsonProperty("depletionMode")]
        public string DepletionMode { get; set; } // 'on_sale' | 'batch_production'

        [JsonProperty("notes")]
        public string Notes { get; set; }

        [JsonProperty("isActive")]
        public bool IsActive { get; set; }

        [JsonProperty("estimatedCostPiasters")]
        public long EstimatedCostPiasters { get; set; }

        [JsonProperty("ingredients")]
        public List<RecipeIngredient> Ingredients { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }

        [JsonProperty("updatedAt")]
        public string UpdatedAt { get; set; }

        public Recipe()
        {
            this.YieldQtyMilli = 1000;
            this.DepletionMode = "on_sale";
            this.IsActive = true;
            this.Ingredients = new List<RecipeIngredient>();
        }
    }

    public class ProductionBatch
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("batchNumber")]
        public string BatchNumber { get; set; }

        [JsonProperty("recipeId")]
        public string RecipeId { get; set; }

        [JsonProperty("productId")]
        public string ProductId { get; set; }

        [JsonProperty("productName")]
        public string ProductName { get; set; }

        [JsonProperty("producedQtyMilli")]
        public long ProducedQtyMilli { get; set; }

        [JsonProperty("totalCostPiasters")]
        public long TotalCostPiasters { get; set; }

        [JsonProperty("unitCostPiasters")]
        public long UnitCostPiasters { get; set; }

        [JsonProperty("producedByUserId")]
        public string ProducedByUserId { get; set; }

        [JsonProperty("producedByName")]
        public string ProducedByName { get; set; }

        [JsonProperty("notes")]
        public string Notes { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }
    }
}
