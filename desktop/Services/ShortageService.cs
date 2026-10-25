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
        /// محرك كشف وتتبع النواقص التلقائي للأصناف التي بلغت حد الطلب أو قاربت على النفاد بناء على معدل السحب (Task 186-3)
        /// </summary>
        public List<ShortageEntry> GetAutoShortages(int targetCoverDays = 15)
        {
            var list = new List<ShortageEntry>();
            if (targetCoverDays <= 0) targetCoverDays = 15;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();

                // استخراج الأصناف المستهدفة:
                // 1) تحت حد الطلب الأدنى
                // 2) نفدت تماماً من المخزن (رصيدها صفر أو أقل)
                // 3) أصناف سريعة البيع في آخر 30 يوماً ورصيدها المتبقي يغطي أقل من 5 أيام استهلاك
                string sql = @"
                    SELECT 
                        p.id, p.name, p.barcode, p.stock_quantity_milli, p.min_stock_quantity_milli,
                        p.cost_piasters, p.price_piasters, p.preferred_supplier_id,
                        sup.name AS preferred_supplier_name,
                        COALESCE(sales_summary.total_sold_milli, 0) AS total_sold_milli
                    FROM products p
                    LEFT JOIN suppliers sup ON p.preferred_supplier_id = sup.id
                    LEFT JOIN (
                        SELECT si.product_id, SUM(si.quantity_milli) AS total_sold_milli
                        FROM sale_items si
                        JOIN sales s ON si.sale_id = s.id
                        WHERE s.status = 'completed'
                          AND s.created_at >= datetime('now', '-30 days')
                        GROUP BY si.product_id
                    ) sales_summary ON p.id = sales_summary.product_id
                    WHERE p.is_active = 1
                      AND (
                          (p.min_stock_quantity_milli > 0 AND p.stock_quantity_milli <= p.min_stock_quantity_milli)
                          OR (p.stock_quantity_milli <= 0)
                          OR (sales_summary.total_sold_milli > 0 AND p.stock_quantity_milli < (sales_summary.total_sold_milli / 30) * 5)
                      )
                    ORDER BY p.stock_quantity_milli ASC, total_sold_milli DESC;";

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
                            PreferredSupplierName = reader["preferred_supplier_name"] != DBNull.Value ? reader["preferred_supplier_name"].ToString() : null,
                            TotalSoldLast30DaysMilli = Convert.ToInt32(reader["total_sold_milli"])
                        });
                    }
                }

                // فحص وحفظ كل صنف في جدول النواقص تلقائياً
                for (int i = 0; i < candidates.Count; i++)
                {
                    var c = candidates[i];
                    int dailyRateMilli = (int)Math.Ceiling((double)c.TotalSoldLast30DaysMilli / 30.0);

                    // حساب الكمية المقترحة لإعادة الطلب
                    int targetStockMilli = Math.Max(c.MinStockQuantityMilli * 2, dailyRateMilli * targetCoverDays);
                    if (targetStockMilli <= 0) targetStockMilli = 1000;

                    int suggestedQtyMilli = targetStockMilli - c.StockQuantityMilli;
                    if (suggestedQtyMilli <= 0)
                    {
                        suggestedQtyMilli = c.MinStockQuantityMilli > 0 ? c.MinStockQuantityMilli : 1000;
                    }

                    // التحقق مما إذا كان هناك قيد نواقص مفتوح مسبقاً لهذا الصنف
                    string existingId = null;
                    int existingQtyMilli = 0;
                    using (var checkCmd = new SQLiteCommand(@"
                        SELECT id, requested_qty_milli 
                        FROM shortage_entries 
                        WHERE product_id = @pid 
                          AND status IN ('open', 'pending') 
                        LIMIT 1;", conn))
                    {
                        checkCmd.Parameters.AddWithValue("@pid", c.Id);
                        using (var checkReader = checkCmd.ExecuteReader())
                        {
                            if (checkReader.Read())
                            {
                                existingId = checkReader["id"].ToString();
                                existingQtyMilli = Convert.ToInt32(checkReader["requested_qty_milli"]);
                            }
                        }
                    }

                    string urgency = c.StockQuantityMilli <= 0 ? "urgent" : (dailyRateMilli > 0 && c.StockQuantityMilli < dailyRateMilli * 2 ? "urgent" : "normal");
                    string analysisNote = string.Format("فحص ذكي: رصيد حالي {0}، حد أدنى {1}، معدل سحب يومي {2}، تغطية {3} يوم",
                        FormatMilli(c.StockQuantityMilli), FormatMilli(c.MinStockQuantityMilli), FormatMilli(dailyRateMilli), targetCoverDays);

                    if (!string.IsNullOrEmpty(existingId))
                    {
                        // الصنف مسجل بالفعل، نقوم بتحديث الكمية فقط إذا كانت الكمية المحسوبة حالياً أكبر
                        if (suggestedQtyMilli > existingQtyMilli)
                        {
                            using (var updateCmd = new SQLiteCommand(@"
                                UPDATE shortage_entries 
                                SET requested_qty_milli = @qty, notes = @notes, updated_at = @now 
                                WHERE id = @id;", conn))
                            {
                                updateCmd.Parameters.AddWithValue("@qty", suggestedQtyMilli);
                                updateCmd.Parameters.AddWithValue("@notes", analysisNote);
                                updateCmd.Parameters.AddWithValue("@now", DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss"));
                                updateCmd.Parameters.AddWithValue("@id", existingId);
                                updateCmd.ExecuteNonQuery();
                            }
                        }

                        var existingEntry = _shortageRepo.GetById(existingId);
                        if (existingEntry != null) list.Add(existingEntry);
                    }
                    else
                    {
                        // إنشاء قيد نواقص جديد في قاعدة البيانات
                        var entry = new ShortageEntry
                        {
                            Id = "sht_auto_" + Guid.NewGuid().ToString("N"),
                            ProductId = c.Id,
                            ProductName = c.Name,
                            ProductBarcode = c.Barcode,
                            FreeText = c.Name,
                            RequestedQtyMilli = suggestedQtyMilli,
                            Source = "auto_reorder",
                            Status = "pending",
                            Priority = urgency,
                            UnitPricePiasters = c.PricePiasters,
                            PreferredSupplierId = c.PreferredSupplierId,
                            PreferredSupplierName = c.PreferredSupplierName,
                            Notes = analysisNote,
                            CreatedBy = "نظام الفحص الذكي",
                            CreatedAt = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss")
                        };

                        var savedEntry = _shortageRepo.Save(entry, "system");
                        if (savedEntry != null) list.Add(savedEntry);
                        else list.Add(entry);
                    }
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
            public int TotalSoldLast30DaysMilli { get; set; }
        }
    }
}
