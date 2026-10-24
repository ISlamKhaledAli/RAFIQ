using System;
using System.Collections.Generic;
using System.Data.SQLite;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    /// <summary>
    /// خدمة كشكول النواقص ومقترحات الشراء للموزعين (Story 129 / Feature #186)
    /// </summary>
    public class ShortageService
    {
        private readonly ShortageRepository _shortageRepo;
        private readonly string _connectionString;

        public ShortageService(ShortageRepository shortageRepo, string connectionString)
        {
            _shortageRepo = shortageRepo;
            _connectionString = connectionString;
        }

        public List<ShortageEntry> GetAll(string status = null, string source = null, string supplierId = null, string search = null)
        {
            return _shortageRepo.GetAll(status, source, supplierId, search);
        }

        public ShortageEntry GetById(string id)
        {
            return _shortageRepo.GetById(id);
        }

        public ShortageEntry Save(ShortageEntry entry, string userId)
        {
            return _shortageRepo.Save(entry, userId);
        }

        public void UpdateStatus(string id, string status, string purchaseId, string userId)
        {
            _shortageRepo.UpdateStatus(id, status, purchaseId, userId);
        }

        public void Delete(string id, string userId)
        {
            _shortageRepo.Delete(id, userId);
        }

        public ShortagePurchaseProposal ConvertToPurchaseProposal(List<string> shortageIds, string preferredSupplierId, string userId)
        {
            return _shortageRepo.ConvertToPurchaseProposal(shortageIds, preferredSupplierId, userId);
        }

        public LostSalesReportSummary GetLostSalesReport(string fromDate = null, string toDate = null)
        {
            return _shortageRepo.GetLostSalesReport(fromDate, toDate);
        }

        /// <summary>
        /// محرك كشف وتتبع النواقص التلقائي للأصناف التي بلغت حد الطلب وحساب معدل السحب (Task 186-3)
        /// </summary>
        public List<ShortageEntry> GetAutoShortages()
        {
            var list = new List<ShortageEntry>();

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();

                // Select products where stock <= min_stock
                string sql = @"
                    SELECT 
                        p.id, p.name, p.barcode, p.stock_quantity_milli, p.min_stock_quantity_milli,
                        p.cost_piasters, p.price_piasters, p.preferred_supplier_id,
                        sup.name AS preferred_supplier_name
                    FROM products p
                    LEFT JOIN suppliers sup ON p.preferred_supplier_id = sup.id
                    WHERE p.is_active = 1 
                      AND p.stock_quantity_milli <= p.min_stock_quantity_milli
                      AND p.min_stock_quantity_milli > 0
                    ORDER BY p.name ASC;";

                var candidates = new List<ProductCandidate>();

                using (var cmd = new SQLiteCommand(sql, conn))
                using (var reader = cmd.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        candidates.Add(new ProductCandidate
                        {
                            Id = reader["id"].ToString(),
                            Name = reader["name"].ToString(),
                            Barcode = reader["barcode"] != DBNull.Value ? reader["barcode"].ToString() : "",
                            StockQuantityMilli = Convert.ToInt32(reader["stock_quantity_milli"]),
                            MinStockQuantityMilli = Convert.ToInt32(reader["min_stock_quantity_milli"]),
                            PricePiasters = Convert.ToInt64(reader["price_piasters"]),
                            PreferredSupplierId = reader["preferred_supplier_id"] != DBNull.Value ? reader["preferred_supplier_id"].ToString() : null,
                            PreferredSupplierName = reader["preferred_supplier_name"] != DBNull.Value ? reader["preferred_supplier_name"].ToString() : null
                        });
                    }
                }

                // For each candidate, calculate average daily consumption in the last 30 days
                for (int i = 0; i < candidates.Count; i++)
                {
                    var c = candidates[i];
                    int dailyRateMilli = 0;

                    using (var rateCmd = new SQLiteCommand(@"
                        SELECT COALESCE(SUM(si.quantity_milli), 0)
                        FROM sale_items si
                        JOIN sales s ON si.sale_id = s.id
                        WHERE si.product_id = @pid
                          AND s.status = 'completed'
                          AND s.created_at >= datetime('now', '-30 days');", conn))
                    {
                        rateCmd.Parameters.AddWithValue("@pid", c.Id);
                        var sumSold = rateCmd.ExecuteScalar();
                        if (sumSold != null && sumSold != DBNull.Value)
                        {
                            int totalSoldMilli = Convert.ToInt32(sumSold);
                            dailyRateMilli = (int)Math.Ceiling((double)totalSoldMilli / 30.0);
                        }
                    }

                    // Suggested order quantity:
                    // If daily demand is available, order for 14 days minus current stock, or at least double min_stock
                    int targetStockMilli = Math.Max(c.MinStockQuantityMilli * 2, dailyRateMilli * 14);
                    int suggestedQtyMilli = targetStockMilli - c.StockQuantityMilli;
                    if (suggestedQtyMilli <= 0) suggestedQtyMilli = c.MinStockQuantityMilli > 0 ? c.MinStockQuantityMilli : 1000;

                    var entry = new ShortageEntry
                    {
                        Id = "auto_" + c.Id,
                        ProductId = c.Id,
                        ProductName = c.Name,
                        ProductBarcode = c.Barcode,
                        FreeText = c.Name,
                        RequestedQtyMilli = suggestedQtyMilli,
                        Source = "low_stock",
                        Status = "open",
                        Priority = c.StockQuantityMilli <= 0 ? "urgent" : "normal",
                        UnitPricePiasters = c.PricePiasters,
                        PreferredSupplierId = c.PreferredSupplierId,
                        PreferredSupplierName = c.PreferredSupplierName,
                        Notes = string.Format("حد الطلب التلقائي: الرصيد الحالي {0}، الحد الأدنى {1}، معدل السحب اليومي {2}",
                            FormatMilli(c.StockQuantityMilli), FormatMilli(c.MinStockQuantityMilli), FormatMilli(dailyRateMilli)),
                        CreatedBy = "system",
                        CreatedAt = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss")
                    };

                    list.Add(entry);
                }
            }

            return list;
        }

        private static string FormatMilli(int milli)
        {
            if (milli % 1000 == 0) return (milli / 1000).ToString();
            return ((double)milli / 1000.0).ToString("0.##");
        }

        private class ProductCandidate
        {
            public string Id { get; set; }
            public string Name { get; set; }
            public string Barcode { get; set; }
            public int StockQuantityMilli { get; set; }
            public int MinStockQuantityMilli { get; set; }
            public long PricePiasters { get; set; }
            public string PreferredSupplierId { get; set; }
            public string PreferredSupplierName { get; set; }
        }
    }
}
