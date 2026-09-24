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
                    WHERE date(created_at) = date('now') AND status != 'cancelled';
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

                // 2. Profit calculation (Total sale price - Total cost)
                string profitSql = @"
                    SELECT 
                        COALESCE(SUM(si.total_piasters - (si.quantity_milli * si.unit_cost_piasters / 1000)), 0) AS total_profit
                    FROM sale_items si
                    INNER JOIN sales s ON si.sale_id = s.id
                    WHERE date(s.created_at) = date('now') AND s.status != 'cancelled';
                ";
                using (var cmd = new SQLiteCommand(profitSql, conn))
                {
                    object res = cmd.ExecuteScalar();
                    if (res != null && res != DBNull.Value)
                    {
                        summary.TodayProfitsPiasters = Convert.ToInt64(res);
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
                    WHERE date(s.created_at) = date('now') AND s.status != 'cancelled'
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
            }

            return summary;
        }
    }
}
