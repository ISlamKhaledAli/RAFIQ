using System;
using System.Collections.Generic;
using System.Data.SQLite;
using RafiqPOS.Models;

namespace RafiqPOS.Services
{
    public class ReportsService
    {
        private readonly string _connectionString;

        public ReportsService(string connectionString)
        {
            _connectionString = connectionString;
        }

        public DashboardSummary GetTodaySummary()
        {
            var summary = new DashboardSummary();

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();

                // 1. Sales totals & counts (Excluding demo sales for real reporting - Task 137-5)
                string salesSql = @"
                    SELECT 
                        COALESCE(SUM(total_piasters), 0) AS total_sales,
                        COALESCE(SUM(paid_piasters), 0) AS cash_sales,
                        COUNT(*) AS inv_count
                    FROM sales 
                    WHERE (date(created_at, 'localtime') = date('now', 'localtime') OR date(created_at) = date('now')) 
                      AND status != 'cancelled'
                      AND id NOT LIKE 'demo_%'
                      AND id NOT LIKE 'stress_%';
                ";
                using (var cmd = new SQLiteCommand(salesSql, conn))
                {
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            summary.TodaySalesPiasters = Convert.ToInt64(reader["total_sales"]);
                            summary.TodayCashPiasters = Convert.ToInt64(reader["cash_sales"]);
                            summary.TodayInvoicesCount = Convert.ToInt32(reader["inv_count"]);
                            summary.TodayCreditPiasters = summary.TodaySalesPiasters - summary.TodayCashPiasters;
                            if (summary.TodayCreditPiasters < 0) summary.TodayCreditPiasters = 0;
                            summary.CashDrawerPiasters = summary.TodayCashPiasters;
                        }
                    }
                }

                // 1b. Cancelled Sales today (Feature #33 / Task 33-4: Separate reporting for cancelled invoices)
                string cancelledSql = @"
                    SELECT 
                        COALESCE(SUM(total_piasters), 0) AS total_cancelled,
                        COUNT(*) AS cancelled_count
                    FROM sales 
                    WHERE (date(created_at, 'localtime') = date('now', 'localtime') OR date(created_at) = date('now')) 
                      AND status = 'cancelled'
                      AND id NOT LIKE 'demo_%'
                      AND id NOT LIKE 'stress_%';
                ";
                using (var cmd = new SQLiteCommand(cancelledSql, conn))
                using (var reader = cmd.ExecuteReader())
                {
                    if (reader.Read())
                    {
                        summary.TodayCancelledSalesPiasters = Convert.ToInt64(reader["total_cancelled"]);
                        summary.TodayCancelledCount = Convert.ToInt32(reader["cancelled_count"]);
                    }
                }

                // 1c. Returns today (Feature #26 / Task 26-3: Subtract cash refunds from drawer and report returns)
                using (var checkRetCmd = new SQLiteCommand("SELECT name FROM sqlite_master WHERE type='table' AND name='returns';", conn))
                {
                    if (checkRetCmd.ExecuteScalar() != null)
                    {
                        string returnsSql = @"
                            SELECT 
                                COALESCE(SUM(total_piasters), 0) AS total_returns,
                                COALESCE(SUM(CASE WHEN refund_method = 'cash' THEN total_piasters ELSE 0 END), 0) AS cash_returns,
                                COUNT(*) AS return_count
                            FROM returns 
                            WHERE (date(created_at, 'localtime') = date('now', 'localtime') OR date(created_at) = date('now'));
                        ";
                        using (var retCmd = new SQLiteCommand(returnsSql, conn))
                        using (var reader = retCmd.ExecuteReader())
                        {
                            if (reader.Read())
                            {
                                summary.TodayReturnsPiasters = Convert.ToInt64(reader["total_returns"]);
                                summary.TodayReturnsCount = Convert.ToInt32(reader["return_count"]);
                                long cashReturns = Convert.ToInt64(reader["cash_returns"]);
                                summary.CashDrawerPiasters -= cashReturns;
                                if (summary.CashDrawerPiasters < 0) summary.CashDrawerPiasters = 0;
                            }
                        }
                    }
                }

                // 2. Customer Debt Collections (Cash received from old debts today)
                string debtPaymentSql = @"
                    SELECT COALESCE(SUM(amount_piasters), 0) AS total_debt_payments
                    FROM customer_ledger
                    WHERE type = 'payment' 
                      AND (date(created_at, 'localtime') = date('now', 'localtime') OR date(created_at) = date('now'))
                      AND customer_id NOT LIKE 'demo_%';
                ";
                using (var cmd = new SQLiteCommand(debtPaymentSql, conn))
                {
                    object res = cmd.ExecuteScalar();
                    if (res != null && res != DBNull.Value)
                    {
                        summary.TodayDebtPaymentsPiasters = Convert.ToInt64(res);
                        summary.CashDrawerPiasters += summary.TodayDebtPaymentsPiasters;
                    }
                }

                // 3. Profit calculation from sales (Total sale price - Total cost)
                string profitSql = @"
                    SELECT 
                        COALESCE(SUM(si.total_piasters - (si.quantity_milli * si.unit_cost_piasters / 1000)), 0) AS total_profit
                    FROM sale_items si
                    INNER JOIN sales s ON si.sale_id = s.id
                    WHERE (date(s.created_at, 'localtime') = date('now', 'localtime') OR date(s.created_at) = date('now')) 
                      AND s.status != 'cancelled'
                      AND s.id NOT LIKE 'demo_%'
                      AND s.id NOT LIKE 'stress_%';
                ";
                using (var cmd = new SQLiteCommand(profitSql, conn))
                {
                    object res = cmd.ExecuteScalar();
                    if (res != null && res != DBNull.Value)
                    {
                        summary.TodayProfitsPiasters = Convert.ToInt64(res);
                        summary.TodaySalesGrossProfitPiasters = summary.TodayProfitsPiasters;
                    }
                }

                // 4. Inventory Adjustments & Shrinkage/Loss calculation (عجز وتالف وزيادات الجرد)
                string adjSql = @"
                    SELECT 
                        COALESCE(SUM(CASE WHEN sm.quantity_milli < 0 THEN (ABS(sm.quantity_milli) * COALESCE(NULLIF(sm.unit_cost_piasters, 0), NULLIF(p.cost_piasters, 0), p.price_piasters, 0)) / 1000 ELSE 0 END), 0) AS total_loss,
                        COALESCE(SUM(CASE WHEN sm.quantity_milli > 0 THEN (sm.quantity_milli * COALESCE(NULLIF(sm.unit_cost_piasters, 0), NULLIF(p.cost_piasters, 0), p.price_piasters, 0)) / 1000 ELSE 0 END), 0) AS total_surplus,
                        COUNT(*) AS adj_count
                    FROM stock_movements sm
                    LEFT JOIN products p ON sm.product_id = p.id
                    WHERE sm.movement_type = 'ADJUSTMENT'
                      AND (date(sm.created_at, 'localtime') = date('now', 'localtime') OR date(sm.created_at) = date('now'));
                ";
                using (var cmd = new SQLiteCommand(adjSql, conn))
                {
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            summary.TodayInventoryLossPiasters = Convert.ToInt64(reader["total_loss"]);
                            summary.TodayInventorySurplusPiasters = Convert.ToInt64(reader["total_surplus"]);
                            summary.TodayAdjustmentsCount = Convert.ToInt32(reader["adj_count"]);
                        }
                    }
                }

                // Net Profit = Sales Gross Profit - Inventory Losses + Inventory Surplus
                summary.TodayNetProfitsPiasters = summary.TodayProfitsPiasters - summary.TodayInventoryLossPiasters + summary.TodayInventorySurplusPiasters;

                // 5. Recent Inventory Adjustments for today
                string recentAdjSql = @"
                    SELECT 
                        sm.product_id,
                        COALESCE(p.name, 'صنف غير مسجل') AS product_name,
                        COALESCE(p.unit, 'piece') AS unit,
                        sm.quantity_milli,
                        COALESCE(NULLIF(sm.unit_cost_piasters, 0), NULLIF(p.cost_piasters, 0), p.price_piasters, 0) AS unit_cost_piasters,
                        sm.note,
                        sm.created_at
                    FROM stock_movements sm
                    LEFT JOIN products p ON sm.product_id = p.id
                    WHERE sm.movement_type = 'ADJUSTMENT'
                      AND (date(sm.created_at, 'localtime') = date('now', 'localtime') OR date(sm.created_at) = date('now'))
                    ORDER BY sm.created_at DESC
                    LIMIT 10;
                ";
                using (var cmd = new SQLiteCommand(recentAdjSql, conn))
                {
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            long qMilli = Convert.ToInt64(reader["quantity_milli"]);
                            long uCost = Convert.ToInt64(reader["unit_cost_piasters"]);
                            long finImpact = (qMilli * uCost) / 1000;
                            string rawNote = reader["note"] != DBNull.Value ? reader["note"].ToString() : "";
                            string cleanReason = rawNote;
                            int parenStart = rawNote.LastIndexOf('(');
                            int parenEnd = rawNote.LastIndexOf(')');
                            if (parenStart >= 0 && parenEnd > parenStart)
                            {
                                cleanReason = rawNote.Substring(parenStart + 1, parenEnd - parenStart - 1).Trim();
                            }

                            summary.RecentAdjustments.Add(new StockAdjustmentSummaryItem
                            {
                                ProductId = reader["product_id"].ToString(),
                                ProductName = reader["product_name"].ToString(),
                                Unit = reader["unit"].ToString(),
                                QuantityDeltaMilli = qMilli,
                                UnitCostPiasters = uCost,
                                FinancialImpactPiasters = finImpact,
                                Reason = cleanReason,
                                CreatedAt = reader["created_at"].ToString()
                            });
                        }
                    }
                }

                // 6. Top selling products (Story 85 / Tasks 47-1 & 47-2)
                string topSql = @"
                    SELECT 
                        si.product_id, 
                        si.product_name, 
                        SUM(si.quantity_milli) / 1000 AS qty, 
                        SUM(si.total_piasters) AS total
                    FROM sale_items si
                    INNER JOIN sales s ON si.sale_id = s.id
                    WHERE (date(s.created_at, 'localtime') = date('now', 'localtime') OR date(s.created_at) = date('now')) 
                      AND s.status != 'cancelled'
                      AND s.id NOT LIKE 'demo_%'
                      AND s.id NOT LIKE 'stress_%'
                    GROUP BY si.product_id, si.product_name
                    ORDER BY total DESC 
                    LIMIT 5;
                ";
                using (var cmd = new SQLiteCommand(topSql, conn))
                {
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            summary.TopSellingProducts.Add(new TopSellingItem
                            {
                                ProductId = reader["product_id"].ToString(),
                                ProductName = reader["product_name"].ToString(),
                                TotalQuantity = Convert.ToInt32(reader["qty"]),
                                TotalSalesPiasters = Convert.ToInt64(reader["total"])
                            });
                        }
                    }
                }

                // 7. Low stock products (stock <= min_stock_quantity_milli) (Task 36-1)
                string lowStockSql = @"
                    SELECT id, name, stock_quantity_milli / 1000 AS stock, min_stock_quantity_milli / 1000 AS min_stock, unit 
                    FROM products 
                    WHERE is_active = 1 AND stock_quantity_milli <= min_stock_quantity_milli 
                    ORDER BY stock_quantity_milli ASC, (min_stock_quantity_milli - stock_quantity_milli) DESC 
                    LIMIT 8;
                ";
                using (var cmd = new SQLiteCommand(lowStockSql, conn))
                {
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            summary.LowStockProducts.Add(new LowStockItem
                            {
                                ProductId = reader["id"].ToString(),
                                ProductName = reader["name"].ToString(),
                                CurrentStock = Convert.ToInt32(reader["stock"]),
                                MinStock = Convert.ToInt32(reader["min_stock"]),
                                Unit = reader["unit"].ToString()
                            });
                        }
                    }
                }

                string countLowStockSql = "SELECT COUNT(1) FROM products WHERE is_active = 1 AND stock_quantity_milli <= min_stock_quantity_milli;";
                using (var cmd = new SQLiteCommand(countLowStockSql, conn))
                {
                    object cnt = cmd.ExecuteScalar();
                    if (cnt != null && cnt != DBNull.Value)
                    {
                        summary.LowStockCount = Convert.ToInt32(cnt);
                    }
                }

                // 8. Customer Debts & Debtors count (Story 70 / Feature #44)
                string debtsSql = @"
                    SELECT 
                        COALESCE(SUM(balance_piasters), 0) AS total_debts,
                        COUNT(CASE WHEN balance_piasters > 0 THEN 1 END) AS debtor_count
                    FROM customers 
                    WHERE balance_piasters > 0
                      AND id NOT LIKE 'demo_%';
                ";
                using (var cmd = new SQLiteCommand(debtsSql, conn))
                {
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            summary.TotalCustomerDebtsPiasters = Convert.ToInt64(reader["total_debts"]);
                            summary.DebtorsCount = Convert.ToInt32(reader["debtor_count"]);
                        }
                    }
                }

                // 9. Top Debtors (Story 70 / Task 44-2)
                string topDebtorsSql = @"
                    SELECT id, name, phone, balance_piasters
                    FROM customers
                    WHERE balance_piasters > 0
                      AND id NOT LIKE 'demo_%'
                    ORDER BY balance_piasters DESC
                    LIMIT 5;
                ";
                using (var cmd = new SQLiteCommand(topDebtorsSql, conn))
                {
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            summary.TopDebtors.Add(new TopDebtorItem
                            {
                                CustomerId = reader["id"].ToString(),
                                CustomerName = reader["name"].ToString(),
                                CustomerPhone = reader["phone"] != DBNull.Value ? reader["phone"].ToString() : "",
                                BalancePiasters = Convert.ToInt64(reader["balance_piasters"])
                            });
                        }
                    }
                }
            }

            return summary;
        }

        /// <summary>
        /// تقرير مبيعات اليوم والأسبوع والشهر واختيار الفترة (Story 83 / Tasks 45-2 & 45-3)
        /// مع حساب الربح التقريبي واستبعاد الفواتير الملغاة والبيعات التجريبية
        /// </summary>
        public PeriodSalesReport GetPeriodSalesReport(string period, string customFromDate, string customToDate)
        {
            var report = new PeriodSalesReport
            {
                Period = period ?? "today"
            };

            string dateFilterClause;
            if (period == "yesterday")
            {
                dateFilterClause = "date(created_at, 'localtime') = date('now', 'localtime', '-1 day')";
                report.StartDate = DateTime.Now.AddDays(-1).ToString("yyyy-MM-dd");
                report.EndDate = report.StartDate;
            }
            else if (period == "week")
            {
                dateFilterClause = "date(created_at, 'localtime') >= date('now', 'localtime', '-7 days')";
                report.StartDate = DateTime.Now.AddDays(-7).ToString("yyyy-MM-dd");
                report.EndDate = DateTime.Now.ToString("yyyy-MM-dd");
            }
            else if (period == "month")
            {
                dateFilterClause = "date(created_at, 'localtime') >= date('now', 'localtime', '-30 days')";
                report.StartDate = DateTime.Now.AddDays(-30).ToString("yyyy-MM-dd");
                report.EndDate = DateTime.Now.ToString("yyyy-MM-dd");
            }
            else if (period == "custom" && !string.IsNullOrEmpty(customFromDate) && !string.IsNullOrEmpty(customToDate))
            {
                dateFilterClause = "date(created_at, 'localtime') >= date(@from) AND date(created_at, 'localtime') <= date(@to)";
                report.StartDate = customFromDate;
                report.EndDate = customToDate;
            }
            else
            {
                // Default today
                dateFilterClause = "(date(created_at, 'localtime') = date('now', 'localtime') OR date(created_at) = date('now'))";
                report.StartDate = DateTime.Now.ToString("yyyy-MM-dd");
                report.EndDate = report.StartDate;
            }

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();

                // 1. Sales totals & payments breakdown
                string salesSql = string.Format(@"
                    SELECT 
                        COALESCE(SUM(total_piasters), 0) AS total_sales,
                        COALESCE(SUM(paid_piasters), 0) AS cash_sales,
                        COALESCE(SUM(CASE WHEN payment_method = 'card' THEN paid_piasters ELSE 0 END), 0) AS card_sales,
                        COUNT(*) AS inv_count
                    FROM sales 
                    WHERE {0}
                      AND status != 'cancelled'
                      AND id NOT LIKE 'demo_%'
                      AND id NOT LIKE 'stress_%';
                ", dateFilterClause);

                using (var cmd = new SQLiteCommand(salesSql, conn))
                {
                    if (period == "custom")
                    {
                        cmd.Parameters.AddWithValue("@from", customFromDate);
                        cmd.Parameters.AddWithValue("@to", customToDate);
                    }
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            report.TotalSalesPiasters = Convert.ToInt64(reader["total_sales"]);
                            report.CashSalesPiasters = Convert.ToInt64(reader["cash_sales"]);
                            report.CardSalesPiasters = Convert.ToInt64(reader["card_sales"]);
                            report.InvoicesCount = Convert.ToInt32(reader["inv_count"]);
                            report.CreditSalesPiasters = report.TotalSalesPiasters - report.CashSalesPiasters;
                            if (report.CreditSalesPiasters < 0) report.CreditSalesPiasters = 0;
                        }
                    }
                }

                // 2. Cancelled Sales
                string cancelledSql = string.Format(@"
                    SELECT 
                        COALESCE(SUM(total_piasters), 0) AS total_cancelled,
                        COUNT(*) AS cancelled_count
                    FROM sales 
                    WHERE {0}
                      AND status = 'cancelled'
                      AND id NOT LIKE 'demo_%'
                      AND id NOT LIKE 'stress_%';
                ", dateFilterClause);

                using (var cmd = new SQLiteCommand(cancelledSql, conn))
                {
                    if (period == "custom")
                    {
                        cmd.Parameters.AddWithValue("@from", customFromDate);
                        cmd.Parameters.AddWithValue("@to", customToDate);
                    }
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            report.CancelledTotalPiasters = Convert.ToInt64(reader["total_cancelled"]);
                            report.CancelledCount = Convert.ToInt32(reader["cancelled_count"]);
                        }
                    }
                }

                // 3. Returns in this period
                using (var checkRetCmd = new SQLiteCommand("SELECT name FROM sqlite_master WHERE type='table' AND name='returns';", conn))
                {
                    if (checkRetCmd.ExecuteScalar() != null)
                    {
                        string returnsSql = string.Format(@"
                            SELECT 
                                COALESCE(SUM(total_piasters), 0) AS total_returns,
                                COUNT(*) AS return_count
                            FROM returns 
                            WHERE {0};
                        ", dateFilterClause);

                        using (var retCmd = new SQLiteCommand(returnsSql, conn))
                        {
                            if (period == "custom")
                            {
                                retCmd.Parameters.AddWithValue("@from", customFromDate);
                                retCmd.Parameters.AddWithValue("@to", customToDate);
                            }
                            using (var reader = retCmd.ExecuteReader())
                            {
                                if (reader.Read())
                                {
                                    report.ReturnsTotalPiasters = Convert.ToInt64(reader["total_returns"]);
                                    report.ReturnsCount = Convert.ToInt32(reader["return_count"]);
                                }
                            }
                        }
                    }
                }

                report.NetSalesPiasters = report.TotalSalesPiasters - report.ReturnsTotalPiasters;
                if (report.NetSalesPiasters < 0) report.NetSalesPiasters = 0;

                // 4. Gross Profit (Story 84 / Task 46-1)
                string profitDateClause = dateFilterClause.Replace("created_at", "s.created_at");
                string profitSql = string.Format(@"
                    SELECT 
                        COALESCE(SUM(si.total_piasters - (si.quantity_milli * si.unit_cost_piasters / 1000)), 0) AS total_profit,
                        COUNT(CASE WHEN si.unit_cost_piasters <= 0 THEN 1 END) AS zero_cost_count
                    FROM sale_items si
                    INNER JOIN sales s ON si.sale_id = s.id
                    WHERE {0}
                      AND s.status != 'cancelled'
                      AND s.id NOT LIKE 'demo_%'
                      AND s.id NOT LIKE 'stress_%';
                ", profitDateClause);

                using (var cmd = new SQLiteCommand(profitSql, conn))
                {
                    if (period == "custom")
                    {
                        cmd.Parameters.AddWithValue("@from", customFromDate);
                        cmd.Parameters.AddWithValue("@to", customToDate);
                    }
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            report.GrossProfitPiasters = Convert.ToInt64(reader["total_profit"]);
                            report.ZeroCostItemsCount = Convert.ToInt32(reader["zero_cost_count"]);
                        }
                    }
                }

                // 5. Top selling items for this period (Story 85 / Task 47-1)
                string topSql = string.Format(@"
                    SELECT 
                        si.product_id, 
                        si.product_name, 
                        SUM(si.quantity_milli) / 1000 AS qty, 
                        SUM(si.total_piasters) AS total
                    FROM sale_items si
                    INNER JOIN sales s ON si.sale_id = s.id
                    WHERE {0}
                      AND s.status != 'cancelled'
                      AND s.id NOT LIKE 'demo_%'
                      AND s.id NOT LIKE 'stress_%'
                    GROUP BY si.product_id, si.product_name
                    ORDER BY total DESC 
                    LIMIT 10;
                ", profitDateClause);

                using (var cmd = new SQLiteCommand(topSql, conn))
                {
                    if (period == "custom")
                    {
                        cmd.Parameters.AddWithValue("@from", customFromDate);
                        cmd.Parameters.AddWithValue("@to", customToDate);
                    }
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            report.TopSellingProducts.Add(new TopSellingItem
                            {
                                ProductId = reader["product_id"].ToString(),
                                ProductName = reader["product_name"].ToString(),
                                TotalQuantity = Convert.ToInt32(reader["qty"]),
                                TotalSalesPiasters = Convert.ToInt64(reader["total"])
                            });
                        }
                    }
                }
            }

            return report;
        }

        /// <summary>
        /// تقرير الأصناف الناقصة مع الكمية المقترحة للطلب والتكلفة التقديرية (Story 86 / Task 48-1)
        /// </summary>
        public List<LowStockReportItem> GetLowStockReport()
        {
            var list = new List<LowStockReportItem>();

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();

                string sql = @"
                    SELECT 
                        p.id,
                        p.name,
                        p.barcode,
                        p.stock_quantity_milli,
                        p.min_stock_quantity_milli,
                        p.cost_piasters,
                        p.unit,
                        COALESCE(c.name, 'عام') AS category_name
                    FROM products p
                    LEFT JOIN categories c ON p.category_id = c.id
                    WHERE p.is_active = 1
                      AND p.stock_quantity_milli <= p.min_stock_quantity_milli
                    ORDER BY (p.stock_quantity_milli - p.min_stock_quantity_milli) ASC, p.name ASC;
                ";

                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            long stockMilli = Convert.ToInt64(reader["stock_quantity_milli"]);
                            long minMilli = Convert.ToInt64(reader["min_stock_quantity_milli"]);
                            long unitCost = Convert.ToInt64(reader["cost_piasters"]);

                            // Suggested order quantity logic: target is min_stock * 2 (safety buffer)
                            long targetStockMilli = minMilli > 0 ? (minMilli * 2) : 5000;
                            long suggestedMilli = targetStockMilli - stockMilli;
                            if (suggestedMilli < 1000) suggestedMilli = 1000; // At least 1 unit

                            long estimatedCost = (suggestedMilli * unitCost) / 1000;

                            list.Add(new LowStockReportItem
                            {
                                ProductId = reader["id"].ToString(),
                                Name = reader["name"].ToString(),
                                Barcode = reader["barcode"] != DBNull.Value ? reader["barcode"].ToString() : "",
                                StockMilli = stockMilli,
                                MinStockMilli = minMilli,
                                SuggestedOrderMilli = suggestedMilli,
                                UnitCostPiasters = unitCost,
                                EstimatedCostPiasters = estimatedCost,
                                Unit = reader["unit"] != DBNull.Value ? reader["unit"].ToString() : "piece",
                                CategoryName = reader["category_name"].ToString()
                            });
                        }
                    }
                }
            }

            return list;
        }

        /// <summary>
        /// تقرير ديون العملاء المستحقة مع تاريخ آخر حركة وسجل الحساب (Story 88 / Task 50-1)
        /// </summary>
        public List<DebtorReportItem> GetDebtorsReport()
        {
            var list = new List<DebtorReportItem>();

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();

                string sql = @"
                    SELECT 
                        c.id,
                        c.name,
                        c.phone,
                        c.balance_piasters,
                        c.credit_limit_piasters,
                        (SELECT MAX(created_at) FROM customer_ledger WHERE customer_id = c.id) AS last_txn
                    FROM customers c
                    WHERE c.balance_piasters > 0
                      AND c.id NOT LIKE 'demo_%'
                    ORDER BY c.balance_piasters DESC;
                ";

                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            list.Add(new DebtorReportItem
                            {
                                CustomerId = reader["id"].ToString(),
                                Name = reader["name"].ToString(),
                                Phone = reader["phone"] != DBNull.Value ? reader["phone"].ToString() : "",
                                BalancePiasters = Convert.ToInt64(reader["balance_piasters"]),
                                CreditLimitPiasters = Convert.ToInt64(reader["credit_limit_piasters"]),
                                Notes = "",
                                LastTransactionDate = reader["last_txn"] != DBNull.Value ? reader["last_txn"].ToString() : ""
                            });
                        }
                    }
                }
            }

            return list;
        }
    }
}
