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

        /// <summary>
        /// فحص جودة وصحة بيانات الأصناف والمخزون واكتشاف النواقص والمكررات (Feature #117 / Task 117-1)
        /// </summary>
        public DataQualityReport GetDataQualityReport()
        {
            var report = new DataQualityReport();

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();

                // 1. Identify products with secondary barcodes (tables product_barcodes and product_units)
                var productSecondaryBarcodes = new Dictionary<string, List<string>>();
                try
                {
                    using (var checkPbCmd = new SQLiteCommand("SELECT name FROM sqlite_master WHERE type='table' AND name='product_barcodes';", conn))
                    {
                        if (checkPbCmd.ExecuteScalar() != null)
                        {
                            string pbSql = "SELECT product_id, barcode FROM product_barcodes WHERE barcode IS NOT NULL AND TRIM(barcode) != '';";
                            using (var cmd = new SQLiteCommand(pbSql, conn))
                            using (var reader = cmd.ExecuteReader())
                            {
                                while (reader.Read())
                                {
                                    string pId = reader["product_id"].ToString();
                                    string bc = reader["barcode"].ToString().Trim();
                                    if (!string.IsNullOrEmpty(bc))
                                    {
                                        if (!productSecondaryBarcodes.ContainsKey(pId))
                                        {
                                            productSecondaryBarcodes[pId] = new List<string>();
                                        }
                                        productSecondaryBarcodes[pId].Add(bc);
                                    }
                                }
                            }
                        }
                    }

                    using (var checkPuCmd = new SQLiteCommand("SELECT name FROM sqlite_master WHERE type='table' AND name='product_units';", conn))
                    {
                        if (checkPuCmd.ExecuteScalar() != null)
                        {
                            string puSql = "SELECT product_id, barcode FROM product_units WHERE barcode IS NOT NULL AND TRIM(barcode) != '';";
                            using (var cmd = new SQLiteCommand(puSql, conn))
                            using (var reader = cmd.ExecuteReader())
                            {
                                while (reader.Read())
                                {
                                    string pId = reader["product_id"].ToString();
                                    string bc = reader["barcode"].ToString().Trim();
                                    if (!string.IsNullOrEmpty(bc))
                                    {
                                        if (!productSecondaryBarcodes.ContainsKey(pId))
                                        {
                                            productSecondaryBarcodes[pId] = new List<string>();
                                        }
                                        productSecondaryBarcodes[pId].Add(bc);
                                    }
                                }
                            }
                        }
                    }
                }
                catch
                {
                    // Ignore if table doesn't exist
                }

                // 2. Identify duplicate barcodes across active products (primary, secondary & unit barcodes)
                var duplicateBarcodes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                try
                {
                    string dupBarcodesSql = @"
                        SELECT barcode 
                        FROM (
                            SELECT barcode, id AS product_id 
                            FROM products 
                            WHERE barcode IS NOT NULL AND TRIM(barcode) != '' AND is_active = 1
                            UNION ALL
                            SELECT pb.barcode, pb.product_id 
                            FROM product_barcodes pb 
                            INNER JOIN products p ON pb.product_id = p.id 
                            WHERE pb.barcode IS NOT NULL AND TRIM(pb.barcode) != '' AND p.is_active = 1
                            UNION ALL
                            SELECT pu.barcode, pu.product_id 
                            FROM product_units pu 
                            INNER JOIN products p ON pu.product_id = p.id 
                            WHERE pu.barcode IS NOT NULL AND TRIM(pu.barcode) != '' AND p.is_active = 1
                        )
                        GROUP BY barcode 
                        HAVING COUNT(DISTINCT product_id) > 1;
                    ";
                    using (var cmd = new SQLiteCommand(dupBarcodesSql, conn))
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            string bc = reader["barcode"].ToString().Trim();
                            if (!string.IsNullOrEmpty(bc))
                            {
                                duplicateBarcodes.Add(bc);
                            }
                        }
                    }
                }
                catch
                {
                    // Fallback to products table only
                    string fallbackSql = @"
                        SELECT barcode 
                        FROM products 
                        WHERE barcode IS NOT NULL AND TRIM(barcode) != '' AND is_active = 1
                        GROUP BY barcode 
                        HAVING COUNT(*) > 1;
                    ";
                    using (var cmd = new SQLiteCommand(fallbackSql, conn))
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            string bc = reader["barcode"].ToString().Trim();
                            if (!string.IsNullOrEmpty(bc))
                            {
                                duplicateBarcodes.Add(bc);
                            }
                        }
                    }
                }

                // 3. Load all active products with categories
                string productsSql = @"
                    SELECT 
                        p.id,
                        p.name,
                        p.barcode,
                        p.category_id,
                        COALESCE(c.name, '') AS category_name,
                        p.stock_quantity_milli,
                        p.cost_piasters,
                        p.price_piasters,
                        p.unit
                    FROM products p
                    LEFT JOIN categories c ON p.category_id = c.id
                    WHERE p.is_active = 1
                    ORDER BY p.name ASC;
                ";

                var productsWithIssues = new HashSet<string>();

                using (var cmd = new SQLiteCommand(productsSql, conn))
                using (var reader = cmd.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        report.TotalProductsAudited++;

                        string productId = reader["id"].ToString();
                        string productName = reader["name"].ToString();
                        string barcode = reader["barcode"] != DBNull.Value ? reader["barcode"].ToString().Trim() : "";
                        string categoryId = reader["category_id"] != DBNull.Value ? reader["category_id"].ToString().Trim() : "";
                        string categoryName = reader["category_name"] != DBNull.Value ? reader["category_name"].ToString().Trim() : "";
                        long stockMilli = Convert.ToInt64(reader["stock_quantity_milli"]);
                        long costPiasters = Convert.ToInt64(reader["cost_piasters"]);
                        long pricePiasters = Convert.ToInt64(reader["price_piasters"]);
                        string unit = reader["unit"] != DBNull.Value ? reader["unit"].ToString() : "piece";

                        bool productHasIssue = false;

                        // Check A: Missing Cost (cost <= 0)
                        if (costPiasters <= 0)
                        {
                            productHasIssue = true;
                            report.MissingCostCount++;
                            report.Issues.Add(new DataQualityIssueItem
                            {
                                ProductId = productId,
                                ProductName = productName,
                                Barcode = barcode,
                                CategoryId = categoryId,
                                CategoryName = categoryName,
                                StockMilli = stockMilli,
                                CostPiasters = costPiasters,
                                PricePiasters = pricePiasters,
                                Unit = unit,
                                IssueType = "missing_cost",
                                Severity = "warning",
                                IssueTitle = "بدون سعر تكلفة",
                                IssueDescription = "سعر الشراء غير محدد أو مسجل بصفر، مما يمنع احتساب الأرباح وهوامش الربح بدقة.",
                                SuggestedFix = "قم بتسجيل سعر شراء التكلفة الفعلي للصنف."
                            });
                        }

                        // Check B: Missing Barcode (no primary barcode and no secondary barcode)
                        bool hasSecondary = productSecondaryBarcodes.ContainsKey(productId) && productSecondaryBarcodes[productId].Count > 0;
                        bool hasBarcode = !string.IsNullOrEmpty(barcode) || hasSecondary;
                        if (!hasBarcode)
                        {
                            productHasIssue = true;
                            report.MissingBarcodeCount++;
                            report.Issues.Add(new DataQualityIssueItem
                            {
                                ProductId = productId,
                                ProductName = productName,
                                Barcode = barcode,
                                CategoryId = categoryId,
                                CategoryName = categoryName,
                                StockMilli = stockMilli,
                                CostPiasters = costPiasters,
                                PricePiasters = pricePiasters,
                                Unit = unit,
                                IssueType = "missing_barcode",
                                Severity = "warning",
                                IssueTitle = "بدون باركود",
                                IssueDescription = "الصنف بلا باركود رئيسي أو إضافي، ويتطلب البحث اليدوي عند البيع بالكاشير.",
                                SuggestedFix = "قم بإدخال باركود العبوة أو توليد باركود داخلي وطباعته."
                            });
                        }

                        // Check C: Duplicate Barcode
                        string dupBarcode = null;
                        if (!string.IsNullOrEmpty(barcode) && duplicateBarcodes.Contains(barcode))
                        {
                            dupBarcode = barcode;
                        }
                        else if (hasSecondary)
                        {
                            foreach (var sbc in productSecondaryBarcodes[productId])
                            {
                                if (duplicateBarcodes.Contains(sbc))
                                {
                                    dupBarcode = sbc;
                                    break;
                                }
                            }
                        }

                        if (!string.IsNullOrEmpty(dupBarcode))
                        {
                            productHasIssue = true;
                            report.DuplicateBarcodeCount++;
                            report.Issues.Add(new DataQualityIssueItem
                            {
                                ProductId = productId,
                                ProductName = productName,
                                Barcode = dupBarcode,
                                CategoryId = categoryId,
                                CategoryName = categoryName,
                                StockMilli = stockMilli,
                                CostPiasters = costPiasters,
                                PricePiasters = pricePiasters,
                                Unit = unit,
                                IssueType = "duplicate_barcode",
                                Severity = "critical",
                                IssueTitle = string.Format("باركود مكرر ({0})", dupBarcode),
                                IssueDescription = "هذا الباركود مسجل لأكثر من صنف مختلف بالنظام، مما يسبب تضارباً عند قراءة الماسح.",
                                SuggestedFix = "عدّل باركود أحد الصنفين ليكون لكل صنف باركود فريد تماماً."
                            });
                        }

                        // Check D: Negative Stock
                        if (stockMilli < 0)
                        {
                            productHasIssue = true;
                            report.NegativeStockCount++;
                            double stockQty = stockMilli / 1000.0;
                            string unitLabel = unit == "kg" ? "كجم" : "قطعة";
                            report.Issues.Add(new DataQualityIssueItem
                            {
                                ProductId = productId,
                                ProductName = productName,
                                Barcode = barcode,
                                CategoryId = categoryId,
                                CategoryName = categoryName,
                                StockMilli = stockMilli,
                                CostPiasters = costPiasters,
                                PricePiasters = pricePiasters,
                                Unit = unit,
                                IssueType = "negative_stock",
                                Severity = "critical",
                                IssueTitle = string.Format("رصيد مخزني بالسالب ({0:0.##} {1})", stockQty, unitLabel),
                                IssueDescription = "رصيد الصنف بالسالب نتيجة مبيعات تمت دون تسجيل فواتير شراء سابقة أو خطأ جرد.",
                                SuggestedFix = "قم بإجراء تسوية جردية للمخزون أو تسجيل فاتورة مشتريات لتصحيح الرصيد."
                            });
                        }

                        // Check E: Missing or Unassigned Category
                        bool isCategoryMissing = string.IsNullOrEmpty(categoryId) || categoryId == "cat_general" || string.IsNullOrEmpty(categoryName);
                        if (isCategoryMissing)
                        {
                            productHasIssue = true;
                            report.MissingCategoryCount++;
                            report.Issues.Add(new DataQualityIssueItem
                            {
                                ProductId = productId,
                                ProductName = productName,
                                Barcode = barcode,
                                CategoryId = categoryId,
                                CategoryName = categoryName,
                                StockMilli = stockMilli,
                                CostPiasters = costPiasters,
                                PricePiasters = pricePiasters,
                                Unit = unit,
                                IssueType = "missing_category",
                                Severity = "info",
                                IssueTitle = "بدون تصنيف نوعي",
                                IssueDescription = "الصنف غير منسوب لقسم مخصص (أو موجود بالتصنيف العام الافتراضي).",
                                SuggestedFix = "انقل الصنف إلى قسم أو تصنيف مناسب لتنظيم التقارير والجرد."
                            });
                        }

                        // Check F: Price Below Cost
                        if (costPiasters > 0 && pricePiasters < costPiasters)
                        {
                            productHasIssue = true;
                            report.PriceBelowCostCount++;
                            double lossPounds = (costPiasters - pricePiasters) / 100.0;
                            report.Issues.Add(new DataQualityIssueItem
                            {
                                ProductId = productId,
                                ProductName = productName,
                                Barcode = barcode,
                                CategoryId = categoryId,
                                CategoryName = categoryName,
                                StockMilli = stockMilli,
                                CostPiasters = costPiasters,
                                PricePiasters = pricePiasters,
                                Unit = unit,
                                IssueType = "price_below_cost",
                                Severity = "critical",
                                IssueTitle = string.Format("سعر البيع أقل من التكلفة (خسارة {0:0.00} ج.م)", lossPounds),
                                IssueDescription = "سعر بيع الصنف أقل من سعر تكلفة شرائه، مما يسبب خسارة مالية مباشرة عند كل عملية بيع.",
                                SuggestedFix = "ارفع سعر البيع أو صحح سعر التكلفة فوراً."
                            });
                        }

                        if (productHasIssue)
                        {
                            productsWithIssues.Add(productId);
                        }
                    }
                }

                report.TotalIssuesCount = report.Issues.Count;
                if (report.TotalProductsAudited > 0)
                {
                    report.HealthyProductsCount = report.TotalProductsAudited - productsWithIssues.Count;
                    report.HealthScorePercent = Math.Max(0, (report.HealthyProductsCount * 100) / report.TotalProductsAudited);
                }
                else
                {
                    report.HealthyProductsCount = 0;
                    report.HealthScorePercent = 100;
                }
            }

            return report;
        }

        // ==========================================
        // ADVANCED ANALYTICS & REPORTING METHODS
        // ==========================================

        private string GetDateClause(string period, string customFrom, string customTo, string column)
        {
            if (period == "yesterday")
            {
                return string.Format("date({0}, 'localtime') = date('now', 'localtime', '-1 day')", column);
            }
            if (period == "week")
            {
                return string.Format("date({0}, 'localtime') >= date('now', 'localtime', '-7 days')", column);
            }
            if (period == "month")
            {
                return string.Format("date({0}, 'localtime') >= date('now', 'localtime', '-30 days')", column);
            }
            if (period == "3months")
            {
                return string.Format("date({0}, 'localtime') >= date('now', 'localtime', '-90 days')", column);
            }
            if (period == "year")
            {
                return string.Format("date({0}, 'localtime') >= date('now', 'localtime', '-365 days')", column);
            }
            if (period == "custom" && !string.IsNullOrEmpty(customFrom) && !string.IsNullOrEmpty(customTo))
            {
                return string.Format("date({0}, 'localtime') >= date(@from) AND date({0}, 'localtime') <= date(@to)", column);
            }
            return string.Format("(date({0}, 'localtime') = date('now', 'localtime') OR date({0}) = date('now'))", column);
        }

        private void BindCustomDates(SQLiteCommand cmd, string period, string customFrom, string customTo)
        {
            if (period == "custom" && !string.IsNullOrEmpty(customFrom) && !string.IsNullOrEmpty(customTo))
            {
                cmd.Parameters.AddWithValue("@from", customFrom);
                cmd.Parameters.AddWithValue("@to", customTo);
            }
        }

        public InventoryLossReport GetInventoryLossReport(string period, string customFrom, string customTo)
        {
            var report = new InventoryLossReport();
            string dateClause = GetDateClause(period, customFrom, customTo, "sm.created_at");

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();

                string sumSql = string.Format(@"
                    SELECT 
                        COALESCE(SUM(CASE WHEN sm.quantity_milli < 0 THEN (ABS(sm.quantity_milli) * COALESCE(NULLIF(sm.unit_cost_piasters, 0), NULLIF(p.cost_piasters, 0), p.price_piasters, 0)) / 1000 ELSE 0 END), 0) AS total_loss,
                        COALESCE(SUM(CASE WHEN sm.quantity_milli > 0 THEN (sm.quantity_milli * COALESCE(NULLIF(sm.unit_cost_piasters, 0), NULLIF(p.cost_piasters, 0), p.price_piasters, 0)) / 1000 ELSE 0 END), 0) AS total_surplus,
                        COALESCE(SUM(CASE WHEN sm.quantity_milli < 0 AND (sm.note LIKE '%تالف%' OR sm.note LIKE '%كسر%' OR sm.note LIKE '%صلاحية%') THEN (ABS(sm.quantity_milli) * COALESCE(NULLIF(sm.unit_cost_piasters, 0), NULLIF(p.cost_piasters, 0), p.price_piasters, 0)) / 1000 ELSE 0 END), 0) AS total_damage,
                        COALESCE(SUM(CASE WHEN sm.quantity_milli < 0 AND (sm.note LIKE '%هدية%' OR sm.note LIKE '%عينة%' OR sm.note LIKE '%ضيافة%') THEN (ABS(sm.quantity_milli) * COALESCE(NULLIF(sm.unit_cost_piasters, 0), NULLIF(p.cost_piasters, 0), p.price_piasters, 0)) / 1000 ELSE 0 END), 0) AS total_gifts
                    FROM stock_movements sm
                    LEFT JOIN products p ON sm.product_id = p.id
                    WHERE sm.movement_type = 'ADJUSTMENT' AND {0};
                ", dateClause);

                using (var cmd = new SQLiteCommand(sumSql, conn))
                {
                    BindCustomDates(cmd, period, customFrom, customTo);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            report.TotalLossPiasters = Convert.ToInt64(reader["total_loss"]);
                            report.TotalSurplusPiasters = Convert.ToInt64(reader["total_surplus"]);
                            report.TotalDamagePiasters = Convert.ToInt64(reader["total_damage"]);
                            report.TotalGiftsPiasters = Convert.ToInt64(reader["total_gifts"]);
                        }
                    }
                }

                string itemsSql = string.Format(@"
                    SELECT 
                        sm.product_id,
                        COALESCE(p.name, 'صنف غير مسجل') AS product_name,
                        COALESCE(p.unit, 'piece') AS unit,
                        sm.quantity_milli,
                        COALESCE(NULLIF(sm.unit_cost_piasters, 0), NULLIF(p.cost_piasters, 0), p.price_piasters, 0) AS unit_cost,
                        (ABS(sm.quantity_milli) * COALESCE(NULLIF(sm.unit_cost_piasters, 0), NULLIF(p.cost_piasters, 0), p.price_piasters, 0)) / 1000 AS fin_impact,
                        COALESCE(sm.note, 'تسوية') AS note,
                        sm.created_at
                    FROM stock_movements sm
                    LEFT JOIN products p ON sm.product_id = p.id
                    WHERE sm.movement_type = 'ADJUSTMENT' AND sm.quantity_milli < 0 AND {0}
                    ORDER BY fin_impact DESC
                    LIMIT 20;
                ", dateClause);

                using (var cmd = new SQLiteCommand(itemsSql, conn))
                {
                    BindCustomDates(cmd, period, customFrom, customTo);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            report.TopLossItems.Add(new InventoryLossItem
                            {
                                ProductId = reader["product_id"].ToString(),
                                ProductName = reader["product_name"].ToString(),
                                Unit = reader["unit"].ToString(),
                                QuantityDeltaMilli = Convert.ToInt64(reader["quantity_milli"]),
                                UnitCostPiasters = Convert.ToInt64(reader["unit_cost"]),
                                FinancialImpactPiasters = Convert.ToInt64(reader["fin_impact"]),
                                Reason = reader["note"].ToString(),
                                CreatedAt = reader["created_at"].ToString()
                            });
                        }
                    }
                }
            }

            return report;
        }

        public List<ClosingHistoryRecord> GetClosingHistory(string period, string customFrom, string customTo)
        {
            var list = new List<ClosingHistoryRecord>();
            string dateClause = GetDateClause(period, customFrom, customTo, "closed_at");

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();

                string sql = string.Format(@"
                    SELECT 
                        id,
                        business_date,
                        closing_number,
                        COALESCE(cashier_name, 'المدير') AS cashier_name,
                        total_sales_piasters,
                        cash_sales_piasters,
                        credit_sales_piasters,
                        returns_total_piasters,
                        (total_sales_piasters - returns_total_piasters) AS net_sales_piasters,
                        gross_profit_piasters,
                        expected_cash_piasters,
                        actual_cash_piasters,
                        difference_piasters,
                        closed_at,
                        COALESCE(notes, '') AS notes
                    FROM daily_closings
                    WHERE {0}
                    ORDER BY closed_at DESC
                    LIMIT 50;
                ", dateClause);

                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    BindCustomDates(cmd, period, customFrom, customTo);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            list.Add(new ClosingHistoryRecord
                            {
                                Id = reader["id"].ToString(),
                                ClosingDate = reader["business_date"].ToString(),
                                ShiftNumber = Convert.ToInt32(reader["closing_number"]),
                                CashierName = reader["cashier_name"].ToString(),
                                TotalSalesPiasters = Convert.ToInt64(reader["total_sales_piasters"]),
                                CashSalesPiasters = Convert.ToInt64(reader["cash_sales_piasters"]),
                                CreditSalesPiasters = Convert.ToInt64(reader["credit_sales_piasters"]),
                                ReturnsPiasters = Convert.ToInt64(reader["returns_total_piasters"]),
                                NetSalesPiasters = Convert.ToInt64(reader["net_sales_piasters"]),
                                GrossProfitPiasters = Convert.ToInt64(reader["gross_profit_piasters"]),
                                ExpectedCashPiasters = Convert.ToInt64(reader["expected_cash_piasters"]),
                                ActualCashPiasters = Convert.ToInt64(reader["actual_cash_piasters"]),
                                DifferencePiasters = Convert.ToInt64(reader["difference_piasters"]),
                                IsClosed = true,
                                CreatedAt = reader["closed_at"].ToString(),
                                Notes = reader["notes"].ToString()
                            });
                        }
                    }
                }
            }

            return list;
        }

        public List<CategoryPerformanceItem> GetCategoryPerformance(string period, string customFrom, string customTo)
        {
            var list = new List<CategoryPerformanceItem>();
            string dateClause = GetDateClause(period, customFrom, customTo, "s.created_at");

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();

                string sql = string.Format(@"
                    SELECT 
                        COALESCE(c.id, 'uncategorized') AS category_id,
                        COALESCE(c.name, 'بدون قسم / عام') AS category_name,
                        COALESCE(SUM(si.total_piasters), 0) AS total_sales,
                        COALESCE(SUM((si.quantity_milli * COALESCE(NULLIF(si.unit_cost_piasters, 0), NULLIF(p.cost_piasters, 0), 0)) / 1000), 0) AS total_cost,
                        COALESCE(SUM(si.quantity_milli) / 1000, 0) AS items_qty
                    FROM sale_items si
                    INNER JOIN sales s ON si.sale_id = s.id
                    LEFT JOIN products p ON si.product_id = p.id
                    LEFT JOIN categories c ON p.category_id = c.id
                    WHERE s.status != 'cancelled'
                      AND s.id NOT LIKE 'demo_%'
                      AND s.id NOT LIKE 'stress_%'
                      AND {0}
                    GROUP BY c.id, c.name
                    ORDER BY total_sales DESC;
                ", dateClause);

                long grandTotalSales = 0;

                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    BindCustomDates(cmd, period, customFrom, customTo);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            long sales = Convert.ToInt64(reader["total_sales"]);
                            long cost = Convert.ToInt64(reader["total_cost"]);
                            long profit = sales - cost;
                            double margin = sales > 0 ? ((double)profit * 100.0) / sales : 0.0;
                            grandTotalSales += sales;

                            list.Add(new CategoryPerformanceItem
                            {
                                CategoryId = reader["category_id"].ToString(),
                                CategoryName = reader["category_name"].ToString(),
                                TotalSalesPiasters = sales,
                                TotalCostPiasters = cost,
                                GrossProfitPiasters = profit,
                                ProfitMarginPercent = Math.Round(margin, 1),
                                ItemsSoldQty = Convert.ToInt32(reader["items_qty"]),
                                SalesSharePercent = 0.0
                            });
                        }
                    }
                }

                if (grandTotalSales > 0)
                {
                    for (int i = 0; i < list.Count; i++)
                    {
                        list[i].SalesSharePercent = Math.Round(((double)list[i].TotalSalesPiasters * 100.0) / grandTotalSales, 1);
                    }
                }
            }

            return list;
        }

        public List<ItemProfitabilityItem> GetItemProfitability(string period, int limit, string direction)
        {
            var list = new List<ItemProfitabilityItem>();
            string dateClause = GetDateClause(period, null, null, "s.created_at");
            string orderDirection = (direction == "asc") ? "ASC" : "DESC";
            int fetchLimit = (limit > 0 && limit <= 100) ? limit : 20;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();

                string sql = string.Format(@"
                    SELECT 
                        si.product_id,
                        si.product_name,
                        COALESCE(p.barcode, '') AS barcode,
                        COALESCE(c.name, 'عام') AS category_name,
                        COALESCE(NULLIF(p.cost_piasters, 0), 0) AS unit_cost,
                        COALESCE(p.price_piasters, 0) AS unit_price,
                        COALESCE(SUM(si.quantity_milli), 0) AS qty_milli,
                        COALESCE(SUM(si.total_piasters), 0) AS total_sales,
                        COALESCE(SUM((si.quantity_milli * COALESCE(NULLIF(si.unit_cost_piasters, 0), NULLIF(p.cost_piasters, 0), 0)) / 1000), 0) AS total_cost
                    FROM sale_items si
                    INNER JOIN sales s ON si.sale_id = s.id
                    LEFT JOIN products p ON si.product_id = p.id
                    LEFT JOIN categories c ON p.category_id = c.id
                    WHERE s.status != 'cancelled'
                      AND s.id NOT LIKE 'demo_%'
                      AND s.id NOT LIKE 'stress_%'
                      AND {0}
                    GROUP BY si.product_id, si.product_name
                    ORDER BY (total_sales - total_cost) {1}
                    LIMIT {2};
                ", dateClause, orderDirection, fetchLimit);

                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            long sales = Convert.ToInt64(reader["total_sales"]);
                            long cost = Convert.ToInt64(reader["total_cost"]);
                            long profit = sales - cost;
                            long unitCost = Convert.ToInt64(reader["unit_cost"]);
                            double margin = sales > 0 ? ((double)profit * 100.0) / sales : 0.0;

                            list.Add(new ItemProfitabilityItem
                            {
                                ProductId = reader["product_id"].ToString(),
                                ProductName = reader["product_name"].ToString(),
                                Barcode = reader["barcode"].ToString(),
                                CategoryName = reader["category_name"].ToString(),
                                UnitCostPiasters = unitCost,
                                UnitPricePiasters = Convert.ToInt64(reader["unit_price"]),
                                QuantitySoldMilli = Convert.ToInt64(reader["qty_milli"]),
                                TotalSalesPiasters = sales,
                                TotalCostPiasters = cost,
                                GrossProfitPiasters = profit,
                                MarginPercent = Math.Round(margin, 1),
                                IsNegativeMargin = profit < 0,
                                IsZeroCost = unitCost == 0
                            });
                        }
                    }
                }
            }

            return list;
        }

        public PeriodComparisonReport GetPeriodComparison(string period)
        {
            var report = new PeriodComparisonReport();
            string curClause, prevClause;
            string curName, prevName;

            if (period == "month")
            {
                curName = "هذا الشهر";
                prevName = "الشهر السابق";
                curClause = "date(created_at, 'localtime') >= date('now', 'localtime', '-30 days')";
                prevClause = "date(created_at, 'localtime') >= date('now', 'localtime', '-60 days') AND date(created_at, 'localtime') < date('now', 'localtime', '-30 days')";
            }
            else if (period == "today")
            {
                curName = "اليوم";
                prevName = "أمس";
                curClause = "date(created_at, 'localtime') = date('now', 'localtime')";
                prevClause = "date(created_at, 'localtime') = date('now', 'localtime', '-1 day')";
            }
            else if (period == "yesterday")
            {
                curName = "أمس";
                prevName = "أول أمس";
                curClause = "date(created_at, 'localtime') = date('now', 'localtime', '-1 day')";
                prevClause = "date(created_at, 'localtime') = date('now', 'localtime', '-2 days')";
            }
            else
            {
                // default week
                curName = "هذا الأسبوع";
                prevName = "الأسبوع السابق";
                curClause = "date(created_at, 'localtime') >= date('now', 'localtime', '-7 days')";
                prevClause = "date(created_at, 'localtime') >= date('now', 'localtime', '-14 days') AND date(created_at, 'localtime') < date('now', 'localtime', '-7 days')";
            }

            report.CurrentPeriodName = curName;
            report.PreviousPeriodName = prevName;

            try
            {

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();

                // Current period stats
                string curSql = string.Format(@"
                    SELECT 
                        COALESCE(SUM(total_piasters), 0) AS sales,
                        COUNT(*) AS inv_count
                    FROM sales 
                    WHERE status != 'cancelled' AND id NOT LIKE 'demo_%' AND id NOT LIKE 'stress_%' AND {0};
                ", curClause);

                using (var cmd = new SQLiteCommand(curSql, conn))
                using (var reader = cmd.ExecuteReader())
                {
                    if (reader.Read())
                    {
                        report.Sales.Current = Convert.ToInt64(reader["sales"]);
                        report.InvoiceCount.Current = Convert.ToInt32(reader["inv_count"]);
                    }
                }

                // Previous period stats
                string prevSql = string.Format(@"
                    SELECT 
                        COALESCE(SUM(total_piasters), 0) AS sales,
                        COUNT(*) AS inv_count
                    FROM sales 
                    WHERE status != 'cancelled' AND id NOT LIKE 'demo_%' AND id NOT LIKE 'stress_%' AND {0};
                ", prevClause);

                using (var cmd = new SQLiteCommand(prevSql, conn))
                using (var reader = cmd.ExecuteReader())
                {
                    if (reader.Read())
                    {
                        report.Sales.Previous = Convert.ToInt64(reader["sales"]);
                        report.InvoiceCount.Previous = Convert.ToInt32(reader["inv_count"]);
                    }
                }

                // Current profit
                string curProfSql = string.Format(@"
                    SELECT COALESCE(SUM(si.total_piasters - ((si.quantity_milli * COALESCE(NULLIF(si.unit_cost_piasters, 0), NULLIF(p.cost_piasters, 0), 0)) / 1000)), 0) AS profit
                    FROM sale_items si
                    INNER JOIN sales s ON si.sale_id = s.id
                    LEFT JOIN products p ON si.product_id = p.id
                    WHERE s.status != 'cancelled' AND s.id NOT LIKE 'demo_%' AND s.id NOT LIKE 'stress_%' AND {0};
                ", curClause.Replace("created_at", "s.created_at"));

                using (var cmd = new SQLiteCommand(curProfSql, conn))
                {
                    object res = cmd.ExecuteScalar();
                    if (res != null && res != DBNull.Value) report.Profit.Current = Convert.ToInt64(res);
                }

                // Previous profit
                string prevProfSql = string.Format(@"
                    SELECT COALESCE(SUM(si.total_piasters - ((si.quantity_milli * COALESCE(NULLIF(si.unit_cost_piasters, 0), NULLIF(p.cost_piasters, 0), 0)) / 1000)), 0) AS profit
                    FROM sale_items si
                    INNER JOIN sales s ON si.sale_id = s.id
                    LEFT JOIN products p ON si.product_id = p.id
                    WHERE s.status != 'cancelled' AND s.id NOT LIKE 'demo_%' AND s.id NOT LIKE 'stress_%' AND {0};
                ", prevClause.Replace("created_at", "s.created_at"));

                using (var cmd = new SQLiteCommand(prevProfSql, conn))
                {
                    object res = cmd.ExecuteScalar();
                    if (res != null && res != DBNull.Value) report.Profit.Previous = Convert.ToInt64(res);
                }
            }

            // Calculate deltas & percentages
            report.Sales.DeltaPiasters = report.Sales.Current - report.Sales.Previous;
            report.Sales.PercentChange = report.Sales.Previous > 0 ? Math.Round(((double)report.Sales.DeltaPiasters * 100.0) / report.Sales.Previous, 1) : 0.0;

            report.Profit.DeltaPiasters = report.Profit.Current - report.Profit.Previous;
            report.Profit.PercentChange = report.Profit.Previous > 0 ? Math.Round(((double)report.Profit.DeltaPiasters * 100.0) / report.Profit.Previous, 1) : 0.0;

            int invDelta = report.InvoiceCount.Current - report.InvoiceCount.Previous;
            report.InvoiceCount.PercentChange = report.InvoiceCount.Previous > 0 ? Math.Round(((double)invDelta * 100.0) / report.InvoiceCount.Previous, 1) : 0.0;

            long curAvg = report.InvoiceCount.Current > 0 ? report.Sales.Current / report.InvoiceCount.Current : 0;
            long prevAvg = report.InvoiceCount.Previous > 0 ? report.Sales.Previous / report.InvoiceCount.Previous : 0;
            report.AvgInvoicePiasters.Current = curAvg;
            report.AvgInvoicePiasters.Previous = prevAvg;
            report.AvgInvoicePiasters.DeltaPiasters = curAvg - prevAvg;
            report.AvgInvoicePiasters.PercentChange = prevAvg > 0 ? Math.Round(((double)(curAvg - prevAvg) * 100.0) / prevAvg, 1) : 0.0;
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine("GetPeriodComparison error: " + ex.Message);
            }

            return report;
        }

        public InventoryOverviewReport GetInventoryOverview()
        {
            var report = new InventoryOverviewReport();

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();

                string prodSql = @"
                    SELECT 
                        COUNT(*) AS total_count,
                        COALESCE(SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END), 0) AS active_count,
                        COALESCE(SUM(CASE WHEN is_active = 1 AND stock_quantity_milli <= 0 THEN 1 ELSE 0 END), 0) AS out_of_stock,
                        COALESCE(SUM(CASE WHEN is_active = 1 AND stock_quantity_milli > 0 AND stock_quantity_milli <= min_stock_quantity_milli THEN 1 ELSE 0 END), 0) AS low_stock,
                        COALESCE(SUM(CASE WHEN is_active = 1 AND stock_quantity_milli > 0 THEN (stock_quantity_milli * cost_piasters) / 1000 ELSE 0 END), 0) AS total_cost,
                        COALESCE(SUM(CASE WHEN is_active = 1 AND stock_quantity_milli > 0 THEN (stock_quantity_milli * price_piasters) / 1000 ELSE 0 END), 0) AS total_retail
                    FROM products;
                ";

                using (var cmd = new SQLiteCommand(prodSql, conn))
                using (var reader = cmd.ExecuteReader())
                {
                    if (reader.Read())
                    {
                        report.TotalProductsCount = Convert.ToInt32(reader["total_count"]);
                        report.ActiveProductsCount = Convert.ToInt32(reader["active_count"]);
                        report.OutOfStockCount = Convert.ToInt32(reader["out_of_stock"]);
                        report.LowStockCount = Convert.ToInt32(reader["low_stock"]);
                        report.TotalInventoryCostPiasters = Convert.ToInt64(reader["total_cost"]);
                        report.TotalInventoryRetailPiasters = Convert.ToInt64(reader["total_retail"]);
                        report.PotentialGrossProfitPiasters = report.TotalInventoryRetailPiasters - report.TotalInventoryCostPiasters;
                        if (report.PotentialGrossProfitPiasters < 0) report.PotentialGrossProfitPiasters = 0;
                    }
                }

                // Check batches expiry
                try
                {
                    string batchSql = @"
                        SELECT 
                            COALESCE(SUM(CASE WHEN date(expiry_date) < date('now') THEN 1 ELSE 0 END), 0) AS expired_batches,
                            COALESCE(SUM(CASE WHEN date(expiry_date) >= date('now') AND date(expiry_date) <= date('now', '+30 days') THEN 1 ELSE 0 END), 0) AS expiring_soon
                        FROM product_batches
                        WHERE status = 'ACTIVE' AND quantity_milli > 0 AND expiry_date IS NOT NULL;
                    ";
                    using (var cmd = new SQLiteCommand(batchSql, conn))
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            report.ExpiredBatchesCount = Convert.ToInt32(reader["expired_batches"]);
                            report.ExpiringSoonBatchesCount = Convert.ToInt32(reader["expiring_soon"]);
                        }
                    }
                }
                catch
                {
                    // If product_batches not created yet
                }

                // Approximate annual turnover: (Last 30 days COGS * 12) / Total Inventory Cost
                try
                {
                    string cogsSql = @"
                        SELECT COALESCE(SUM((si.quantity_milli * COALESCE(NULLIF(si.unit_cost_piasters, 0), NULLIF(p.cost_piasters, 0), 0)) / 1000), 0) AS cogs_30d
                        FROM sale_items si
                        INNER JOIN sales s ON si.sale_id = s.id
                        LEFT JOIN products p ON si.product_id = p.id
                        WHERE s.status != 'cancelled' AND date(s.created_at, 'localtime') >= date('now', 'localtime', '-30 days');
                    ";
                    using (var cmd = new SQLiteCommand(cogsSql, conn))
                    {
                        long cogs30 = Convert.ToInt64(cmd.ExecuteScalar() ?? 0);
                        if (report.TotalInventoryCostPiasters > 0 && cogs30 > 0)
                        {
                            double annualTurnover = ((double)cogs30 * 12.0) / (double)report.TotalInventoryCostPiasters;
                            report.TurnoverRate = Math.Round(annualTurnover, 1);
                        }
                        else
                        {
                            report.TurnoverRate = 0.0;
                        }
                    }
                }
                catch
                {
                    report.TurnoverRate = 0.0;
                }
            }

            return report;
        }

        public ShrinkageAnalysisReport GetShrinkageAnalysis(string period, string customFrom, string customTo)
        {
            var report = new ShrinkageAnalysisReport();
            string dateClause = GetDateClause(period, customFrom, customTo, "sm.created_at");

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();

                string sumSql = string.Format(@"
                    SELECT 
                        COALESCE(SUM(CASE WHEN sm.quantity_milli < 0 THEN (ABS(sm.quantity_milli) * COALESCE(NULLIF(sm.unit_cost_piasters, 0), NULLIF(p.cost_piasters, 0), p.price_piasters, 0)) / 1000 ELSE 0 END), 0) AS total_shrinkage
                    FROM stock_movements sm
                    LEFT JOIN products p ON sm.product_id = p.id
                    WHERE sm.movement_type = 'ADJUSTMENT' AND {0};
                ", dateClause);

                using (var cmd = new SQLiteCommand(sumSql, conn))
                {
                    BindCustomDates(cmd, period, customFrom, customTo);
                    report.TotalShrinkagePiasters = Convert.ToInt64(cmd.ExecuteScalar() ?? 0);
                }

                // Shrinkage as % of sales in period
                string salesSql = string.Format(@"
                    SELECT COALESCE(SUM(total_piasters), 0) FROM sales 
                    WHERE status != 'cancelled' AND id NOT LIKE 'demo_%' AND id NOT LIKE 'stress_%' AND {0};
                ", dateClause.Replace("sm.created_at", "created_at"));

                using (var cmd = new SQLiteCommand(salesSql, conn))
                {
                    BindCustomDates(cmd, period, customFrom, customTo);
                    long periodSales = Convert.ToInt64(cmd.ExecuteScalar() ?? 0);
                    if (periodSales > 0 && report.TotalShrinkagePiasters > 0)
                    {
                        report.ShrinkageToSalesPercent = Math.Round(((double)report.TotalShrinkagePiasters * 100.0) / periodSales, 2);
                    }
                }

                // Breakdown by reasons
                string[] reasonKeys = new string[] { "damaged", "expired", "inventory_deficit", "gift_sample" };
                string[] reasonLabels = new string[] { "تالف وكسور أثناء النقل والعرض", "انتهاء الصلاحية والتخزين", "عجز وفروقات جرد", "عينات وهدايا وضيافة" };
                string[] reasonLikes = new string[] { "%تالف%", "%صلاحية%", "%جرد%", "%هدية%" };

                for (int i = 0; i < reasonKeys.Length; i++)
                {
                    string rSql = string.Format(@"
                        SELECT 
                            COUNT(*) AS cnt,
                            COALESCE(SUM((ABS(sm.quantity_milli) * COALESCE(NULLIF(sm.unit_cost_piasters, 0), NULLIF(p.cost_piasters, 0), p.price_piasters, 0)) / 1000), 0) AS cost
                        FROM stock_movements sm
                        LEFT JOIN products p ON sm.product_id = p.id
                        WHERE sm.movement_type = 'ADJUSTMENT' AND sm.quantity_milli < 0 AND sm.note LIKE @like AND {0};
                    ", dateClause);

                    using (var cmd = new SQLiteCommand(rSql, conn))
                    {
                        cmd.Parameters.AddWithValue("@like", reasonLikes[i]);
                        BindCustomDates(cmd, period, customFrom, customTo);
                        using (var reader = cmd.ExecuteReader())
                        {
                            if (reader.Read())
                            {
                                int cnt = Convert.ToInt32(reader["cnt"]);
                                long cost = Convert.ToInt64(reader["cost"]);
                                double pct = report.TotalShrinkagePiasters > 0 ? Math.Round(((double)cost * 100.0) / report.TotalShrinkagePiasters, 1) : 0.0;
                                report.Reasons.Add(new ShrinkageReasonBreakdown
                                {
                                    Reason = reasonKeys[i],
                                    Label = reasonLabels[i],
                                    Count = cnt,
                                    TotalCostPiasters = cost,
                                    PercentOfTotal = pct
                                });
                            }
                        }
                    }
                }

                // Top shrinkage items
                string topSql = string.Format(@"
                    SELECT 
                        sm.product_id,
                        COALESCE(p.name, 'صنف غير مسجل') AS product_name,
                        COALESCE(p.unit, 'piece') AS unit,
                        sm.quantity_milli,
                        COALESCE(NULLIF(sm.unit_cost_piasters, 0), NULLIF(p.cost_piasters, 0), p.price_piasters, 0) AS unit_cost,
                        (ABS(sm.quantity_milli) * COALESCE(NULLIF(sm.unit_cost_piasters, 0), NULLIF(p.cost_piasters, 0), p.price_piasters, 0)) / 1000 AS fin_impact,
                        COALESCE(sm.note, 'تسوية') AS note,
                        sm.created_at
                    FROM stock_movements sm
                    LEFT JOIN products p ON sm.product_id = p.id
                    WHERE sm.movement_type = 'ADJUSTMENT' AND sm.quantity_milli < 0 AND {0}
                    ORDER BY fin_impact DESC
                    LIMIT 15;
                ", dateClause);

                using (var cmd = new SQLiteCommand(topSql, conn))
                {
                    BindCustomDates(cmd, period, customFrom, customTo);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            report.TopShrinkageProducts.Add(new InventoryLossItem
                            {
                                ProductId = reader["product_id"].ToString(),
                                ProductName = reader["product_name"].ToString(),
                                Unit = reader["unit"].ToString(),
                                QuantityDeltaMilli = Convert.ToInt64(reader["quantity_milli"]),
                                UnitCostPiasters = Convert.ToInt64(reader["unit_cost"]),
                                FinancialImpactPiasters = Convert.ToInt64(reader["fin_impact"]),
                                Reason = reader["note"].ToString(),
                                CreatedAt = reader["created_at"].ToString()
                            });
                        }
                    }
                }
            }

            return report;
        }

        public PurchaseAnalysisReport GetPurchaseAnalysis(string period, string customFrom, string customTo)
        {
            var report = new PurchaseAnalysisReport();
            string dateClause = GetDateClause(period, customFrom, customTo, "p.invoice_date");

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();

                string sumSql = string.Format(@"
                    SELECT 
                        COALESCE(SUM(p.net_cost_piasters), 0) AS total_purchases,
                        COUNT(*) AS inv_count,
                        COALESCE(SUM(p.paid_amount_piasters), 0) AS total_paid,
                        COALESCE(SUM(p.remaining_amount_piasters), 0) AS total_unpaid
                    FROM purchases p
                    WHERE p.status = 'COMPLETED' AND {0};
                ", dateClause);

                using (var cmd = new SQLiteCommand(sumSql, conn))
                {
                    BindCustomDates(cmd, period, customFrom, customTo);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            report.TotalPurchasesPiasters = Convert.ToInt64(reader["total_purchases"]);
                            report.TotalInvoicesCount = Convert.ToInt32(reader["inv_count"]);
                            report.TotalPaidPiasters = Convert.ToInt64(reader["total_paid"]);
                            report.TotalUnpaidPiasters = Convert.ToInt64(reader["total_unpaid"]);
                        }
                    }
                }

                string supSql = string.Format(@"
                    SELECT 
                        COALESCE(s.id, 'unknown') AS supplier_id,
                        COALESCE(s.name, 'مورد عام') AS supplier_name,
                        COUNT(*) AS inv_count,
                        COALESCE(SUM(p.net_cost_piasters), 0) AS total_purchase,
                        COALESCE(SUM(p.paid_amount_piasters), 0) AS paid_amt,
                        COALESCE(SUM(p.remaining_amount_piasters), 0) AS unpaid_amt
                    FROM purchases p
                    LEFT JOIN suppliers s ON p.supplier_id = s.id
                    WHERE p.status = 'COMPLETED' AND {0}
                    GROUP BY s.id, s.name
                    ORDER BY total_purchase DESC
                    LIMIT 10;
                ", dateClause);

                using (var cmd = new SQLiteCommand(supSql, conn))
                {
                    BindCustomDates(cmd, period, customFrom, customTo);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            report.TopSuppliers.Add(new SupplierPurchaseItem
                            {
                                SupplierId = reader["supplier_id"].ToString(),
                                SupplierName = reader["supplier_name"].ToString(),
                                InvoicesCount = Convert.ToInt32(reader["inv_count"]),
                                TotalPurchasePiasters = Convert.ToInt64(reader["total_purchase"]),
                                PaidPiasters = Convert.ToInt64(reader["paid_amt"]),
                                UnpaidPiasters = Convert.ToInt64(reader["unpaid_amt"])
                            });
                        }
                    }
                }
            }

            return report;
        }

        public CreditOverviewReport GetCreditOverview(string period, string customFrom, string customTo)
        {
            var report = new CreditOverviewReport();
            string dateClause = GetDateClause(period, customFrom, customTo, "cl.created_at");

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();

                // 1. Current total debts
                string custSql = @"
                    SELECT 
                        COALESCE(SUM(balance_piasters), 0) AS total_debts,
                        COUNT(*) AS debtors_count
                    FROM customers 
                    WHERE balance_piasters > 0 AND id NOT LIKE 'demo_%';
                ";
                using (var cmd = new SQLiteCommand(custSql, conn))
                using (var reader = cmd.ExecuteReader())
                {
                    if (reader.Read())
                    {
                        report.TotalOutstandingDebtsPiasters = Convert.ToInt64(reader["total_debts"]);
                        report.DebtorsCount = Convert.ToInt32(reader["debtors_count"]);
                    }
                }

                // 2. Repayments in period
                string repaySql = string.Format(@"
                    SELECT COALESCE(SUM(cl.amount_piasters), 0)
                    FROM customer_ledger cl
                    WHERE cl.type = 'payment' AND {0};
                ", dateClause);
                using (var cmd = new SQLiteCommand(repaySql, conn))
                {
                    BindCustomDates(cmd, period, customFrom, customTo);
                    report.PeriodRepaymentsPiasters = Convert.ToInt64(cmd.ExecuteScalar() ?? 0);
                }

                // 3. New credit sales in period
                string credSalesSql = string.Format(@"
                    SELECT COALESCE(SUM(cl.amount_piasters), 0)
                    FROM customer_ledger cl
                    WHERE (cl.type = 'sale' OR cl.type = 'sale_credit') AND {0};
                ", dateClause);
                using (var cmd = new SQLiteCommand(credSalesSql, conn))
                {
                    BindCustomDates(cmd, period, customFrom, customTo);
                    report.PeriodNewCreditPiasters = Convert.ToInt64(cmd.ExecuteScalar() ?? 0);
                }

                report.NetCreditFlowPiasters = report.PeriodNewCreditPiasters - report.PeriodRepaymentsPiasters;
                report.AveragePaybackDays = 14.0;
            }

            return report;
        }

        public DebtAgingReport GetDebtAgingReport()
        {
            var report = new DebtAgingReport();

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();

                string sql = @"
                    SELECT 
                        c.id,
                        c.name,
                        c.balance_piasters,
                        COALESCE((SELECT MAX(created_at) FROM customer_ledger WHERE customer_id = c.id), c.created_at) AS last_activity
                    FROM customers c
                    WHERE c.balance_piasters > 0 AND c.id NOT LIKE 'demo_%';
                ";

                int tier1Count = 0, tier2Count = 0, tier3Count = 0, tier4Count = 0;
                long tier1Debt = 0, tier2Debt = 0, tier3Debt = 0, tier4Debt = 0;
                long totalDebt = 0;

                using (var cmd = new SQLiteCommand(sql, conn))
                using (var reader = cmd.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        long bal = Convert.ToInt64(reader["balance_piasters"]);
                        totalDebt += bal;
                        string lastActStr = reader["last_activity"].ToString();
                        DateTime lastAct;
                        int daysPassed = 0;
                        if (DateTime.TryParse(lastActStr, out lastAct))
                        {
                            daysPassed = (int)(DateTime.Now - lastAct).TotalDays;
                        }

                        if (daysPassed <= 7)
                        {
                            tier1Count++;
                            tier1Debt += bal;
                        }
                        else if (daysPassed <= 30)
                        {
                            tier2Count++;
                            tier2Debt += bal;
                        }
                        else if (daysPassed <= 90)
                        {
                            tier3Count++;
                            tier3Debt += bal;
                        }
                        else
                        {
                            tier4Count++;
                            tier4Debt += bal;
                        }
                    }
                }

                report.TotalDebtPiasters = totalDebt;
                report.CriticalDebtorsCount = tier4Count;

                double t1Pct = totalDebt > 0 ? Math.Round(((double)tier1Debt * 100.0) / totalDebt, 1) : 0.0;
                double t2Pct = totalDebt > 0 ? Math.Round(((double)tier2Debt * 100.0) / totalDebt, 1) : 0.0;
                double t3Pct = totalDebt > 0 ? Math.Round(((double)tier3Debt * 100.0) / totalDebt, 1) : 0.0;
                double t4Pct = totalDebt > 0 ? Math.Round(((double)tier4Debt * 100.0) / totalDebt, 1) : 0.0;

                report.Tiers.Add(new DebtAgingTier { Label = "أقل من 7 أيام (سداد وشيك)", DaysRange = "0 - 7 أيام", CustomerCount = tier1Count, TotalDebtPiasters = tier1Debt, PercentOfTotal = t1Pct, Severity = "normal" });
                report.Tiers.Add(new DebtAgingTier { Label = "من 8 إلى 30 يوم (متابعة عادية)", DaysRange = "8 - 30 يوم", CustomerCount = tier2Count, TotalDebtPiasters = tier2Debt, PercentOfTotal = t2Pct, Severity = "attention" });
                report.Tiers.Add(new DebtAgingTier { Label = "من 31 إلى 90 يوم (متأخر)", DaysRange = "31 - 90 يوم", CustomerCount = tier3Count, TotalDebtPiasters = tier3Debt, PercentOfTotal = t3Pct, Severity = "warning" });
                report.Tiers.Add(new DebtAgingTier { Label = "أكثر من 90 يوم (ديون حرجة متعثرة)", DaysRange = "> 90 يوم", CustomerCount = tier4Count, TotalDebtPiasters = tier4Debt, PercentOfTotal = t4Pct, Severity = "critical" });
            }

            return report;
        }

        public CustomerBehaviorReport GetCustomerBehavior(string period, string customFrom, string customTo)
        {
            var report = new CustomerBehaviorReport();
            string dateClause = GetDateClause(period, customFrom, customTo, "s.created_at");

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();

                // Top buyers
                string buySql = string.Format(@"
                    SELECT 
                        c.id AS customer_id,
                        c.name AS customer_name,
                        COALESCE(c.phone, '') AS phone,
                        COALESCE(SUM(s.total_piasters), 0) AS total_amount,
                        COUNT(s.id) AS inv_count,
                        c.balance_piasters,
                        MAX(s.created_at) AS last_act
                    FROM sales s
                    INNER JOIN customers c ON s.customer_id = c.id
                    WHERE s.status != 'cancelled' AND c.id != 'cust_general_cash' AND c.id NOT LIKE 'demo_%' AND {0}
                    GROUP BY c.id, c.name
                    ORDER BY total_amount DESC
                    LIMIT 10;
                ", dateClause);

                using (var cmd = new SQLiteCommand(buySql, conn))
                {
                    BindCustomDates(cmd, period, customFrom, customTo);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            report.TopBuyingCustomers.Add(new CustomerRankItem
                            {
                                CustomerId = reader["customer_id"].ToString(),
                                CustomerName = reader["customer_name"].ToString(),
                                Phone = reader["phone"].ToString(),
                                TotalAmountPiasters = Convert.ToInt64(reader["total_amount"]),
                                InvoicesCount = Convert.ToInt32(reader["inv_count"]),
                                BalancePiasters = Convert.ToInt64(reader["balance_piasters"]),
                                LastActivityDate = reader["last_act"].ToString()
                            });
                        }
                    }
                }

                // Top payers
                string paySql = string.Format(@"
                    SELECT 
                        c.id AS customer_id,
                        c.name AS customer_name,
                        COALESCE(c.phone, '') AS phone,
                        COALESCE(SUM(cl.amount_piasters), 0) AS total_paid,
                        COUNT(cl.id) AS pay_count,
                        c.balance_piasters,
                        MAX(cl.created_at) AS last_act
                    FROM customer_ledger cl
                    INNER JOIN customers c ON cl.customer_id = c.id
                    WHERE cl.type = 'payment' AND c.id NOT LIKE 'demo_%' AND {0}
                    GROUP BY c.id, c.name
                    ORDER BY total_paid DESC
                    LIMIT 10;
                ", dateClause.Replace("s.created_at", "cl.created_at"));

                using (var cmd = new SQLiteCommand(paySql, conn))
                {
                    BindCustomDates(cmd, period, customFrom, customTo);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            report.TopPayingCustomers.Add(new CustomerRankItem
                            {
                                CustomerId = reader["customer_id"].ToString(),
                                CustomerName = reader["customer_name"].ToString(),
                                Phone = reader["phone"].ToString(),
                                TotalAmountPiasters = Convert.ToInt64(reader["total_paid"]),
                                InvoicesCount = Convert.ToInt32(reader["pay_count"]),
                                BalancePiasters = Convert.ToInt64(reader["balance_piasters"]),
                                LastActivityDate = reader["last_act"].ToString()
                            });
                        }
                    }
                }

                // Inactive debtors (> 60 days)
                string inactSql = @"
                    SELECT 
                        c.id AS customer_id,
                        c.name AS customer_name,
                        COALESCE(c.phone, '') AS phone,
                        c.balance_piasters,
                        COALESCE((SELECT MAX(created_at) FROM customer_ledger WHERE customer_id = c.id), c.created_at) AS last_act
                    FROM customers c
                    WHERE c.balance_piasters > 0 
                      AND c.id NOT LIKE 'demo_%'
                      AND date(COALESCE((SELECT MAX(created_at) FROM customer_ledger WHERE customer_id = c.id), c.created_at)) < date('now', '-60 days')
                    ORDER BY c.balance_piasters DESC
                    LIMIT 10;
                ";

                using (var cmd = new SQLiteCommand(inactSql, conn))
                using (var reader = cmd.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        report.InactiveDebtors.Add(new CustomerRankItem
                        {
                            CustomerId = reader["customer_id"].ToString(),
                            CustomerName = reader["customer_name"].ToString(),
                            Phone = reader["phone"].ToString(),
                            TotalAmountPiasters = 0,
                            InvoicesCount = 0,
                            BalancePiasters = Convert.ToInt64(reader["balance_piasters"]),
                            LastActivityDate = reader["last_act"].ToString()
                        });
                    }
                }

                // New customers count in period
                string newCustSql = string.Format(@"
                    SELECT COUNT(*) FROM customers 
                    WHERE id NOT LIKE 'demo_%' AND {0};
                ", dateClause.Replace("s.created_at", "created_at"));
                using (var cmd = new SQLiteCommand(newCustSql, conn))
                {
                    BindCustomDates(cmd, period, customFrom, customTo);
                    report.NewCustomersCount = Convert.ToInt32(cmd.ExecuteScalar() ?? 0);
                }
            }

            return report;
        }

        public List<PaymentHistoryRecord> GetPaymentHistory(string period, string customFrom, string customTo, string customerId)
        {
            var list = new List<PaymentHistoryRecord>();
            string dateClause = GetDateClause(period, customFrom, customTo, "cl.created_at");

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();

                string filterClause = dateClause;
                if (!string.IsNullOrEmpty(customerId))
                {
                    filterClause += " AND cl.customer_id = @cid";
                }

                string sql = string.Format(@"
                    SELECT 
                        cl.id,
                        cl.customer_id,
                        COALESCE(c.name, 'عميل') AS customer_name,
                        cl.amount_piasters,
                        cl.balance_after_piasters,
                        COALESCE(cl.notes, '') AS notes,
                        cl.created_at
                    FROM customer_ledger cl
                    LEFT JOIN customers c ON cl.customer_id = c.id
                    WHERE cl.type = 'payment' AND {0}
                    ORDER BY cl.created_at DESC
                    LIMIT 100;
                ", filterClause);

                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    BindCustomDates(cmd, period, customFrom, customTo);
                    if (!string.IsNullOrEmpty(customerId))
                    {
                        cmd.Parameters.AddWithValue("@cid", customerId);
                    }
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            long amt = Convert.ToInt64(reader["amount_piasters"]);
                            long balAfter = Convert.ToInt64(reader["balance_after_piasters"]);
                            list.Add(new PaymentHistoryRecord
                            {
                                Id = reader["id"].ToString(),
                                CustomerId = reader["customer_id"].ToString(),
                                CustomerName = reader["customer_name"].ToString(),
                                AmountPiasters = amt,
                                PaymentDate = reader["created_at"].ToString(),
                                Notes = reader["notes"].ToString(),
                                CashierName = "المدير",
                                PreviousBalancePiasters = balAfter + amt,
                                NewBalancePiasters = balAfter
                            });
                        }
                    }
                }
            }

            return list;
        }

        public HourlyIntensityReport GetHourlyIntensityReport(string period, string customFromDate, string customToDate)
        {
            var report = new HourlyIntensityReport
            {
                Period = period ?? "today"
            };

            for (int i = 0; i < 24; i++)
            {
                string suffix = i >= 12 ? "م" : "ص";
                int displayHour = i % 12;
                if (displayHour == 0) displayHour = 12;
                string label = string.Format("{0:D2}:00 {1}", displayHour, suffix);

                report.Hours.Add(new HourlySalesPoint
                {
                    Hour = i,
                    HourLabel = label,
                    SalesPiasters = 0,
                    InvoicesCount = 0,
                    ReturnsPiasters = 0
                });
            }

            string dateFilterClause;
            if (period == "yesterday")
            {
                dateFilterClause = "date(created_at, 'localtime') = date('now', 'localtime', '-1 day')";
            }
            else if (period == "week")
            {
                dateFilterClause = "date(created_at, 'localtime') >= date('now', 'localtime', '-7 days')";
            }
            else if (period == "month")
            {
                dateFilterClause = "date(created_at, 'localtime') >= date('now', 'localtime', '-30 days')";
            }
            else if (period == "custom" && !string.IsNullOrEmpty(customFromDate) && !string.IsNullOrEmpty(customToDate))
            {
                dateFilterClause = "date(created_at, 'localtime') >= date(@from) AND date(created_at, 'localtime') <= date(@to)";
            }
            else
            {
                dateFilterClause = "(date(created_at, 'localtime') = date('now', 'localtime') OR date(created_at) = date('now'))";
            }

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();

                string salesSql = string.Format(@"
                    SELECT 
                        CAST(strftime('%H', created_at, 'localtime') AS INTEGER) AS sale_hour,
                        COALESCE(SUM(total_piasters), 0) AS total_sales,
                        COUNT(*) AS inv_count
                    FROM sales 
                    WHERE {0}
                      AND status != 'cancelled'
                      AND id NOT LIKE 'demo_%'
                      AND id NOT LIKE 'stress_%'
                    GROUP BY sale_hour
                    ORDER BY sale_hour ASC;
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
                        while (reader.Read())
                        {
                            int h = Convert.ToInt32(reader["sale_hour"]);
                            if (h >= 0 && h < 24)
                            {
                                report.Hours[h].SalesPiasters = Convert.ToInt64(reader["total_sales"]);
                                report.Hours[h].InvoicesCount = Convert.ToInt32(reader["inv_count"]);
                            }
                        }
                    }
                }

                // Check returns
                using (var checkRetCmd = new SQLiteCommand("SELECT name FROM sqlite_master WHERE type='table' AND name='returns';", conn))
                {
                    if (checkRetCmd.ExecuteScalar() != null)
                    {
                        string returnsSql = string.Format(@"
                            SELECT 
                                CAST(strftime('%H', created_at, 'localtime') AS INTEGER) AS ret_hour,
                                COALESCE(SUM(total_piasters), 0) AS total_returns
                            FROM returns 
                            WHERE {0}
                            GROUP BY ret_hour;
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
                                while (reader.Read())
                                {
                                    int h = Convert.ToInt32(reader["ret_hour"]);
                                    if (h >= 0 && h < 24)
                                    {
                                        report.Hours[h].ReturnsPiasters = Convert.ToInt64(reader["total_returns"]);
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Calculate peak hour
            int peakH = 0;
            long maxSales = -1;
            int maxInvs = 0;
            for (int i = 0; i < report.Hours.Count; i++)
            {
                if (report.Hours[i].SalesPiasters > maxSales)
                {
                    maxSales = report.Hours[i].SalesPiasters;
                    maxInvs = report.Hours[i].InvoicesCount;
                    peakH = i;
                }
            }

            report.PeakHour = peakH;
            report.PeakHourLabel = report.Hours[peakH].HourLabel;
            report.PeakHourSalesPiasters = maxSales > 0 ? maxSales : 0;
            report.PeakHourInvoicesCount = maxInvs;

            return report;
        }

        public DeadStockReport GetDeadStockReport(int daysThreshold)
        {
            if (daysThreshold <= 0) daysThreshold = 30;

            var report = new DeadStockReport
            {
                DaysThreshold = daysThreshold,
                TotalDeadItemsCount = 0,
                TotalTiedCapitalPiasters = 0
            };

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();

                string sql = @"
                    SELECT 
                        p.id,
                        p.barcode,
                        p.name,
                        COALESCE(c.name, 'عام') AS category_name,
                        COALESCE(p.stock_quantity_milli, 0) AS stock_milli,
                        COALESCE(p.unit, 'piece') AS unit,
                        COALESCE(p.cost_piasters, 0) AS cost_piasters,
                        COALESCE(p.price_piasters, 0) AS retail_price_piasters,
                        MAX(s.created_at) AS last_sold
                    FROM products p
                    LEFT JOIN categories c ON p.category_id = c.id
                    LEFT JOIN sale_items si ON p.id = si.product_id
                    LEFT JOIN sales s ON si.sale_id = s.id AND s.status != 'cancelled' AND s.id NOT LIKE 'demo_%' AND s.id NOT LIKE 'stress_%'
                    WHERE p.is_active = 1 AND p.stock_quantity_milli > 0
                    GROUP BY p.id
                    HAVING last_sold IS NULL OR date(last_sold, 'localtime') <= date('now', 'localtime', '-' || @days || ' days')
                    ORDER BY (COALESCE(p.stock_quantity_milli, 0) * COALESCE(p.cost_piasters, 0)) DESC
                    LIMIT 50;
                ";

                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@days", daysThreshold);

                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            long stockMilli = Convert.ToInt64(reader["stock_milli"]);
                            long cost = Convert.ToInt64(reader["cost_piasters"]);
                            long tiedCapital = (stockMilli * cost) / 1000;

                            string lastSoldStr = reader["last_sold"] != DBNull.Value ? reader["last_sold"].ToString() : null;
                            int daysInactive = daysThreshold;
                            if (!string.IsNullOrEmpty(lastSoldStr))
                            {
                                DateTime dt;
                                if (DateTime.TryParse(lastSoldStr, out dt))
                                {
                                    daysInactive = (int)(DateTime.Now - dt).TotalDays;
                                    if (daysInactive < daysThreshold) daysInactive = daysThreshold;
                                }
                            }
                            else
                            {
                                daysInactive = 999; // Never sold
                            }

                            var item = new DeadStockItem
                            {
                                ProductId = reader["id"].ToString(),
                                Barcode = reader["barcode"].ToString(),
                                Name = reader["name"].ToString(),
                                CategoryName = reader["category_name"].ToString(),
                                StockMilli = stockMilli,
                                Unit = reader["unit"].ToString(),
                                UnitCostPiasters = cost,
                                RetailPricePiasters = Convert.ToInt64(reader["retail_price_piasters"]),
                                TiedCapitalPiasters = tiedCapital,
                                DaysInactive = daysInactive,
                                LastSoldDate = lastSoldStr
                            };

                            report.Items.Add(item);
                            report.TotalTiedCapitalPiasters += tiedCapital;
                        }
                    }
                }
            }

            report.TotalDeadItemsCount = report.Items.Count;
            return report;
        }

        public List<CashierPerformanceMetric> GetCashierPerformanceReport(string period, string customFromDate, string customToDate)
        {
            var list = new List<CashierPerformanceMetric>();

            string dateFilterClause;
            if (period == "yesterday")
            {
                dateFilterClause = "date(s.created_at, 'localtime') = date('now', 'localtime', '-1 day')";
            }
            else if (period == "week")
            {
                dateFilterClause = "date(s.created_at, 'localtime') >= date('now', 'localtime', '-7 days')";
            }
            else if (period == "month")
            {
                dateFilterClause = "date(s.created_at, 'localtime') >= date('now', 'localtime', '-30 days')";
            }
            else if (period == "custom" && !string.IsNullOrEmpty(customFromDate) && !string.IsNullOrEmpty(customToDate))
            {
                dateFilterClause = "date(s.created_at, 'localtime') >= date(@from) AND date(s.created_at, 'localtime') <= date(@to)";
            }
            else
            {
                dateFilterClause = "(date(s.created_at, 'localtime') = date('now', 'localtime') OR date(s.created_at) = date('now'))";
            }

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();

                string sql = string.Format(@"
                    SELECT 
                        COALESCE(s.cashier_id, 'admin') AS cashier_id,
                        COALESCE(u.display_name, u.username, 'المدير') AS cashier_name,
                        COALESCE(u.role, 'admin') AS role,
                        COUNT(s.id) AS inv_count,
                        COALESCE(SUM(CASE WHEN s.status != 'cancelled' THEN s.total_piasters ELSE 0 END), 0) AS total_sales,
                        COALESCE(SUM(CASE WHEN s.status != 'cancelled' THEN s.paid_piasters ELSE 0 END), 0) AS cash_sales,
                        COALESCE(SUM(CASE WHEN s.status = 'cancelled' THEN 1 ELSE 0 END), 0) AS cancelled_count
                    FROM sales s
                    LEFT JOIN users u ON s.cashier_id = u.id
                    WHERE {0}
                      AND s.id NOT LIKE 'demo_%'
                      AND s.id NOT LIKE 'stress_%'
                    GROUP BY s.cashier_id
                    ORDER BY total_sales DESC;
                ", dateFilterClause);

                using (var cmd = new SQLiteCommand(sql, conn))
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
                            int invCount = Convert.ToInt32(reader["inv_count"]);
                            long totalSales = Convert.ToInt64(reader["total_sales"]);
                            long avgInv = invCount > 0 ? totalSales / invCount : 0;

                            list.Add(new CashierPerformanceMetric
                            {
                                CashierId = reader["cashier_id"].ToString(),
                                CashierName = reader["cashier_name"].ToString(),
                                Role = reader["role"].ToString(),
                                InvoicesCount = invCount,
                                TotalSalesPiasters = totalSales,
                                CashSalesPiasters = Convert.ToInt64(reader["cash_sales"]),
                                AverageInvoicePiasters = avgInv,
                                CancelledCount = Convert.ToInt32(reader["cancelled_count"]),
                                ReturnsCount = 0
                            });
                        }
                    }
                }
            }

            return list;
        }
    }
}

