using System;
using System.Collections.Generic;
using System.Data.SQLite;
using System.Diagnostics;
using System.IO;
using RafiqPOS.Common;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class BaselineBenchmarkResult
    {
        public bool Success { get; set; }
        public int ProductCount { get; set; }
        public double SeedTimeSeconds { get; set; }
        public double AverageSearchLatencyMs { get; set; }
        public double MaxSearchLatencyMs { get; set; }
        public double InvoiceCreationLatencyMs { get; set; }
        public double ProcessMemoryWorkingSetMb { get; set; }
        public bool MeetsLatencySla { get; set; }
        public bool MeetsMemorySla { get; set; }
        public string Summary { get; set; }
        public List<string> Logs { get; set; }

        public BaselineBenchmarkResult()
        {
            Logs = new List<string>();
        }
    }

    /// <summary>
    /// فاحص خط الأساس المرجعي للأداء واستهلاك الموارد لـ 20,000 صنف (Feature #182 / Task 182-5)
    /// </summary>
    public static class BaselineBenchmarkRunner
    {
        public static BaselineBenchmarkResult RunBaseline(int productCount = 20000)
        {
            var result = new BaselineBenchmarkResult();
            result.ProductCount = productCount;

            string testDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "test_baseline_data");
            if (Directory.Exists(testDir))
            {
                try { Directory.Delete(testDir, true); } catch { }
            }
            Directory.CreateDirectory(testDir);

            try
            {
                DatabaseService.Initialize(testDir);
                string connStr = DatabaseService.ConnectionString;

                // 1. Seed productCount products
                Stopwatch seedSw = Stopwatch.StartNew();
                using (var conn = new SQLiteConnection(connStr))
                {
                    conn.Open();
                    using (var trans = conn.BeginTransaction())
                    {
                        using (var cmd = conn.CreateCommand())
                        {
                            cmd.Transaction = trans;
                            cmd.CommandText = @"
                                INSERT OR REPLACE INTO products (
                                    id, barcode, internal_code, name, normalized_name, category_id,
                                    price_piasters, cost_piasters, stock_quantity_milli, min_stock_quantity_milli,
                                    unit, tax_rate_percent, is_active, created_at, updated_at
                                ) VALUES (
                                    @id, @barcode, @internalCode, @name, @normName, NULL,
                                    @price, @cost, 50000, 5000, 'piece', 0, 1, @now, @now
                                );";

                            cmd.Parameters.Add("@id", System.Data.DbType.String);
                            cmd.Parameters.Add("@barcode", System.Data.DbType.String);
                            cmd.Parameters.Add("@internalCode", System.Data.DbType.String);
                            cmd.Parameters.Add("@name", System.Data.DbType.String);
                            cmd.Parameters.Add("@normName", System.Data.DbType.String);
                            cmd.Parameters.Add("@price", System.Data.DbType.Int64);
                            cmd.Parameters.Add("@cost", System.Data.DbType.Int64);
                            cmd.Parameters.Add("@now", System.Data.DbType.String);

                            string now = DateTime.UtcNow.ToString("o");
                            string[] baseNames = new string[]
                            {
                                "بانادول إكسترا أقراص",
                                "كونجستال أقراص للبرد",
                                "أوجمنتين 1 جم مضاد حيوي",
                                "كتفلام 50 مجم مسكن سريع",
                                "أنتينال كبسولات مطهر معوي",
                                "بروفين 400 مجم مسكن",
                                "أرز مصري فاخر معبأ كجم",
                                "سكر أبيض ناعم كجم",
                                "زيت عباد الشمس 1 لتر",
                                "شاي العروسة باكت"
                            };

                            for (int i = 1; i <= productCount; i++)
                            {
                                string pid = string.Format("prod_base_{0}", i);
                                string barcode = string.Format("622{0:D10}", i);
                                string intCode = string.Format("INT{0:D6}", i);
                                string baseName = baseNames[i % baseNames.Length];
                                string fullName = string.Format("{0} #{1}", baseName, i);
                                string normName = ArabicTextNormalizer.Normalize(fullName);

                                cmd.Parameters["@id"].Value = pid;
                                cmd.Parameters["@barcode"].Value = barcode;
                                cmd.Parameters["@internalCode"].Value = intCode;
                                cmd.Parameters["@name"].Value = fullName;
                                cmd.Parameters["@normName"].Value = normName;
                                cmd.Parameters["@price"].Value = 2000 + (i % 5000);
                                cmd.Parameters["@cost"].Value = 1500 + (i % 3000);
                                cmd.Parameters["@now"].Value = now;

                                cmd.ExecuteNonQuery();
                            }
                        }
                        trans.Commit();
                    }
                }
                seedSw.Stop();
                result.SeedTimeSeconds = seedSw.Elapsed.TotalSeconds;
                result.Logs.Add(string.Format("تم إدراج وفهرسة {0} صنف خلال {1:F2} ثانية بنجاح.", productCount, result.SeedTimeSeconds));

                // 2. Measure Search Latencies across 100 queries
                var latencies = new List<double>();
                Random rnd = new Random(42);
                for (int i = 0; i < 100; i++)
                {
                    int targetIdx = rnd.Next(1, productCount + 1);
                    Stopwatch qSw = Stopwatch.StartNew();

                    if (i % 2 == 0)
                    {
                        string bcode = string.Format("622{0:D10}", targetIdx);
                        DatabaseService.Products.Search(bcode, 5);
                    }
                    else
                    {
                        string query = (i % 4 == 1) ? "بانادول" : "أرز";
                        DatabaseService.Products.Search(query, 10);
                    }

                    qSw.Stop();
                    latencies.Add(qSw.Elapsed.TotalMilliseconds);
                }

                double sum = 0;
                double max = double.MinValue;
                for (int i = 0; i < latencies.Count; i++)
                {
                    sum += latencies[i];
                    if (latencies[i] > max) max = latencies[i];
                }
                result.AverageSearchLatencyMs = sum / latencies.Count;
                result.MaxSearchLatencyMs = max;
                result.MeetsLatencySla = result.AverageSearchLatencyMs < 100.0 && result.MaxSearchLatencyMs < 150.0;
                result.Logs.Add(string.Format("متوسط زمن البحث: {0:F2} مللي ثانية | أقصى زمن: {1:F2} مللي ثانية (SLA < 100ms: {2})",
                    result.AverageSearchLatencyMs, result.MaxSearchLatencyMs, result.MeetsLatencySla ? "محقق" : "فاشل"));

                // 3. Measure Sales Transaction Latency with 20k catalog
                Stopwatch saleSw = Stopwatch.StartNew();
                var sale = DatabaseService.Sales.ProcessSale(new Sale
                {
                    Id = "stress_base_sale",
                    InvoiceNumber = 1,
                    PaymentMethod = "cash",
                    SubtotalPiasters = 5000,
                    DiscountPiasters = 0,
                    TaxPiasters = 0,
                    TotalPiasters = 5000,
                    PaidPiasters = 5000,
                    CashierId = "usr_admin_default",
                    CashierName = "مدير النظام",
                    Items = new List<SaleItem>
                    {
                        new SaleItem
                        {
                            ProductId = "prod_base_1",
                            ProductName = "بانادول إكسترا أقراص #1",
                            QuantityMilli = 1000,
                            UnitPricePiasters = 2500,
                            TotalPiasters = 2500,
                            UnitCostPiasters = 1800
                        },
                        new SaleItem
                        {
                            ProductId = "prod_base_2",
                            ProductName = "كونجستال أقراص للبرد #2",
                            QuantityMilli = 1000,
                            UnitPricePiasters = 2500,
                            TotalPiasters = 2500,
                            UnitCostPiasters = 1800
                        }
                    }
                });
                saleSw.Stop();
                result.InvoiceCreationLatencyMs = saleSw.Elapsed.TotalMilliseconds;
                result.Logs.Add(string.Format("زمن حفظ ومعالجة فاتورة البيع الذرية: {0:F2} مللي ثانية", result.InvoiceCreationLatencyMs));

                // 4. Measure Process Working Set RAM
                using (Process proc = Process.GetCurrentProcess())
                {
                    proc.Refresh();
                    result.ProcessMemoryWorkingSetMb = proc.WorkingSet64 / (1024.0 * 1024.0);
                }
                result.MeetsMemorySla = result.ProcessMemoryWorkingSetMb < 250.0;
                result.Logs.Add(string.Format("استهلاك ذاكرة الرام للعملية: {0:F2} ميجابايت (الحد الأقصى المسموح: 250 ميجابايت: {1})",
                    result.ProcessMemoryWorkingSetMb, result.MeetsMemorySla ? "محقق" : "متجاوز"));

                result.Success = result.MeetsLatencySla && result.MeetsMemorySla && (sale != null);
                result.Summary = string.Format(
                    "قياس خط الأساس المرجعي (20,000 صنف - Feature #182 / Task 182-5):\n" +
                    "• متوسط زمن البحث: {0:F2} مللي ثانية (SLA < 100ms)\n" +
                    "• زمن حفظ الفاتورة: {1:F2} مللي ثانية\n" +
                    "• استهلاك الذاكرة: {2:F2} ميجابايت (الحد < 250MB)\n" +
                    "• الحالة النهائية: {3}",
                    result.AverageSearchLatencyMs,
                    result.InvoiceCreationLatencyMs,
                    result.ProcessMemoryWorkingSetMb,
                    result.Success ? "ناجح ومطابق للسقف" : "غير مطابق"
                );

                Logger.Info(result.Summary);
                return result;
            }
            catch (Exception ex)
            {
                Logger.Error("فشل قياس خط الأساس", ex);
                result.Success = false;
                result.Summary = "خطأ في قياس خط الأساس: " + ex.Message;
                return result;
            }
            finally
            {
                if (Directory.Exists(testDir))
                {
                    try { Directory.Delete(testDir, true); } catch { }
                }
            }
        }
    }
}
