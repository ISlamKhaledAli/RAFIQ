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

                // 1. Sales totals & counts
                string salesSql = @"
                    SELECT 
                        COALESCE(SUM(total_piasters), 0) AS total_sales,
                        COALESCE(SUM(paid_piasters), 0) AS cash_sales,
                        COUNT(*) AS inv_count
                    FROM sales 
                    WHERE (date(created_at, 'localtime') = date('now', 'localtime') OR date(created_at) = date('now')) 
                      AND status != 'cancelled';
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

                // 2. Customer Debt Collections (Cash received from old debts today)
                string debtPaymentSql = @"
                    SELECT COALESCE(SUM(amount_piasters), 0) AS total_debt_payments
                    FROM customer_ledger
                    WHERE type = 'payment' 
                      AND (date(created_at, 'localtime') = date('now', 'localtime') OR date(created_at) = date('now'));
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
                      AND s.status != 'cancelled';
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

                // 3. Top selling products
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

                // 4. Low stock products (stock <= 5000 milli, i.e. 5 units or kilos)
                string lowStockSql = @"
                    SELECT id, name, stock_quantity_milli / 1000 AS stock, unit 
                    FROM products 
                    WHERE is_active = 1 AND stock_quantity_milli <= 5000 
                    ORDER BY stock_quantity_milli ASC 
                    LIMIT 6;
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
                                Unit = reader["unit"].ToString()
                            });
                        }
                    }
                }

                // 5. Customer Debts & Debtors count (Story 70 / Feature #44)
                string debtsSql = @"
                    SELECT 
                        COALESCE(SUM(balance_piasters), 0) AS total_debts,
                        COUNT(CASE WHEN balance_piasters > 0 THEN 1 END) AS debtor_count
                    FROM customers 
                    WHERE balance_piasters > 0;
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

                // 6. Top Debtors (Story 70 / Task 44-2)
                string topDebtorsSql = @"
                    SELECT id, name, phone, balance_piasters
                    FROM customers
                    WHERE balance_piasters > 0
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
    }
}
