namespace RafiqPOS.Services
{
    /// <summary>
    /// Shared SQL for the profit effect of customer returns, symmetric with sales profit:
    /// revenue is reversed ex-VAT and the cost of undamaged returned goods is added back.
    /// </summary>
    public static class ReturnProfitSql
    {
        // VAT share of the returned quantity: pro-rated from the original sale line; a return without an invoice line
        // uses the product's rate with the price-inclusive formula of Money.CalculateTaxPiasters (integer half-up rounding)
        public const string ReturnedTaxExpr =
            "(CASE WHEN si.id IS NOT NULL THEN " +
            "(CASE WHEN COALESCE(si.tax_piasters, 0) > 0 AND COALESCE(si.quantity_milli, 0) > 0 " +
            "THEN (ri.quantity_milli * si.tax_piasters) / si.quantity_milli ELSE 0 END) " +
            "WHEN COALESCE(p.tax_rate_percent, 0) > 0 AND ri.total_piasters > 0 " +
            "THEN ri.total_piasters - ((ri.total_piasters * 200 + (100 + p.tax_rate_percent)) / (2 * (100 + p.tax_rate_percent))) " +
            "ELSE 0 END)";

        public const string ReturnedNetRevenueExpr = "(ri.total_piasters - " + ReturnedTaxExpr + ")";

        // Same cost basis the sale line was charged with; product cost only for returns without an invoice line
        public const string ReturnedCostExpr =
            "((ri.quantity_milli * COALESCE(si.unit_cost_piasters, p.cost_piasters, 0)) / 1000)";

        // Item/category reports charge zero-cost sale lines at the catalog cost, so returns must recover the same
        public const string ReturnedCatalogCostExpr =
            "((ri.quantity_milli * COALESCE(NULLIF(si.unit_cost_piasters, 0), NULLIF(p.cost_piasters, 0), 0)) / 1000)";

        // Damaged goods never come back to stock, so only the revenue is lost
        public static string CostRecovered(string costExpr)
        {
            return "(CASE WHEN ri.is_damaged = 1 THEN 0 ELSE " + costExpr + " END)";
        }

        public const string FromClause = @"
            FROM return_items ri
            JOIN returns r ON ri.return_id = r.id
            LEFT JOIN sale_items si ON ri.sale_item_id = si.id
            LEFT JOIN products p ON ri.product_id = p.id";

        /// <summary>Columns: returned_profit, returned_tax. whereClause filters on alias r.</summary>
        public static string BuildTotals(string whereClause)
        {
            return BuildTotals(whereClause, ReturnedCostExpr);
        }

        /// <summary>As BuildTotals, with the cost expression the matching sales query uses (symmetry).</summary>
        public static string BuildTotals(string whereClause, string costExpr)
        {
            return "SELECT COALESCE(SUM(" + ReturnedNetRevenueExpr + " - " + CostRecovered(costExpr) + "), 0) AS returned_profit, " +
                   "COALESCE(SUM(" + ReturnedTaxExpr + "), 0) AS returned_tax" +
                   FromClause +
                   " WHERE " + whereClause + ";";
        }
    }
}
