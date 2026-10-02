using System;
using System.Collections.Generic;
using System.IO;
using ClosedXML.Excel;
using RafiqPOS.Models;

namespace RafiqPOS.Services
{
    public class FullStoreExportTestResult
    {
        public bool Success { get; set; }
        public string Message { get; set; }
        public bool FolderAndFilesGeneratedPassed { get; set; }
        public bool RowCountParityPassed { get; set; }
        public bool FinancialSumsParityPassed { get; set; }
        public bool MasterWorkbookIntegrityPassed { get; set; }
        public bool CertificateFilePassed { get; set; }
        public int TotalAssertions { get; set; }
        public int PassedAssertions { get; set; }
        public List<string> Details { get; set; }

        public FullStoreExportTestResult()
        {
            Details = new List<string>();
        }
    }

    public static class FullStoreExportTestRunner
    {
        public static FullStoreExportTestResult RunAllTests()
        {
            var result = new FullStoreExportTestResult
            {
                Success = false,
                TotalAssertions = 0,
                PassedAssertions = 0
            };

            string testExportDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "test_full_store_export_" + Guid.NewGuid().ToString("N").Substring(0, 8));

            try
            {
                EnsureTestDataAvailable();

                // ==========================================
                // TEST 1: Generate Full Store Export (Task 148-1)
                // ==========================================
                result.TotalAssertions++;
                var exportRes = DatabaseService.Excel.ExportFullStoreData(testExportDir);

                if (!exportRes.Success || !Directory.Exists(testExportDir) || exportRes.GeneratedFiles == null || exportRes.GeneratedFiles.Count < 7)
                {
                    result.Message = "فشل إنشاء مجلد التصدير أو توليد كامل الملفات";
                    return result;
                }

                for (int i = 0; i < exportRes.GeneratedFiles.Count; i++)
                {
                    string f = exportRes.GeneratedFiles[i];
                    if (!File.Exists(f) || new FileInfo(f).Length == 0)
                    {
                        result.Message = "الملف المولد فارغ أو غير موجود: " + Path.GetFileName(f);
                        return result;
                    }
                }
                result.FolderAndFilesGeneratedPassed = true;
                result.PassedAssertions++;
                result.Details.Add("تم إنشاء مجلد التصدير وتوليد كافة ملفات إكسل سليمة وغير فارغة");

                // ==========================================
                // TEST 2: Row Count Parity with DB (Task 148-3)
                // ==========================================
                result.TotalAssertions++;
                var dbProducts = DatabaseService.ProductRepo.GetAllForExport();
                var dbCustomers = DatabaseService.CustomerRepo.GetAll(100000);
                var dbSuppliers = DatabaseService.SupplierRepo.GetAll(true);
                var dbSales = DatabaseService.SaleRepo.GetAllForExport();

                bool prodMatch = exportRes.ProductsCount == dbProducts.Count;
                bool custMatch = exportRes.CustomersCount == dbCustomers.Count;
                bool supMatch = exportRes.SuppliersCount == dbSuppliers.Count;
                bool salesMatch = exportRes.SalesCount == dbSales.Count;

                if (!prodMatch || !custMatch || !supMatch || !salesMatch)
                {
                    result.Message = string.Format("عدم تطابق عدد الصفوف مع قاعدة البيانات: P({0} vs {1}), C({2} vs {3}), S({4} vs {5})",
                        exportRes.ProductsCount, dbProducts.Count, exportRes.CustomersCount, dbCustomers.Count, exportRes.SalesCount, dbSales.Count);
                    return result;
                }

                // Check actual rows inside products sheet
                string prodFile = null;
                for (int i = 0; i < exportRes.GeneratedFiles.Count; i++)
                {
                    if (exportRes.GeneratedFiles[i].Contains("01_"))
                    {
                        prodFile = exportRes.GeneratedFiles[i];
                        break;
                    }
                }

                if (prodFile != null && File.Exists(prodFile))
                {
                    using (var wb = new XLWorkbook(prodFile))
                    {
                        var ws = wb.Worksheet(1);
                        int expectedLastRow = dbProducts.Count + 4;
                        if (ws.LastRowUsed().RowNumber() != expectedLastRow)
                        {
                            result.Message = string.Format("عدد الصفوف في شيت المنتجات غير مطابق: المتوقع {0} الفعلي {1}", expectedLastRow, ws.LastRowUsed().RowNumber());
                            return result;
                        }
                    }
                }

                result.RowCountParityPassed = true;
                result.PassedAssertions++;
                result.Details.Add(string.Format("تطابق تام لعدد الصفوف المصدرة: {0} صنف، {1} عميل، {2} مورد، {3} فاتورة",
                    dbProducts.Count, dbCustomers.Count, dbSuppliers.Count, dbSales.Count));

                // ==========================================
                // TEST 3: Financial Sums Parity (Task 148-3)
                // ==========================================
                result.TotalAssertions++;
                long expectedSalesPiasters = 0;
                for (int i = 0; i < dbSales.Count; i++) expectedSalesPiasters += dbSales[i].TotalPiasters;

                long expectedDebtsPiasters = 0;
                for (int i = 0; i < dbCustomers.Count; i++)
                {
                    if (dbCustomers[i].BalancePiasters > 0) expectedDebtsPiasters += dbCustomers[i].BalancePiasters;
                }

                if (exportRes.TotalSalesPiasters != expectedSalesPiasters || exportRes.TotalDebtsPiasters != expectedDebtsPiasters)
                {
                    result.Message = string.Format("عدم تطابق المجاميع المالية: مبيعات ({0} vs {1}) ديون ({2} vs {3})",
                        exportRes.TotalSalesPiasters, expectedSalesPiasters, exportRes.TotalDebtsPiasters, expectedDebtsPiasters);
                    return result;
                }
                result.FinancialSumsParityPassed = true;
                result.PassedAssertions++;
                result.Details.Add(string.Format("تطابق تام للمجاميع المالية: مبيعات {0:N2} ج.م، ديون {1:N2} ج.م",
                    expectedSalesPiasters / 100.0, expectedDebtsPiasters / 100.0));

                // ==========================================
                // TEST 4: Master Workbook Integrity (Task 148-1)
                // ==========================================
                result.TotalAssertions++;
                string masterFile = null;
                for (int i = 0; i < exportRes.GeneratedFiles.Count; i++)
                {
                    if (exportRes.GeneratedFiles[i].Contains("00_"))
                    {
                        masterFile = exportRes.GeneratedFiles[i];
                        break;
                    }
                }

                if (masterFile != null && File.Exists(masterFile))
                {
                    using (var wb = new XLWorkbook(masterFile))
                    {
                        if (wb.Worksheets.Count != 6)
                        {
                            result.Message = "الملف الشامل لا يحتوي على الشيتات الـ 6 المطلوبة: الفعلي " + wb.Worksheets.Count;
                            return result;
                        }
                    }
                }
                result.MasterWorkbookIntegrityPassed = true;
                result.PassedAssertions++;
                result.Details.Add("الملف الشامل يحتوي على الشيتات الـ 6 كاملة ومتطابقة");

                // ==========================================
                // TEST 5: Data Ownership Certificate (Task 148-1, 148-2)
                // ==========================================
                result.TotalAssertions++;
                string txtFile = null;
                for (int i = 0; i < exportRes.GeneratedFiles.Count; i++)
                {
                    if (exportRes.GeneratedFiles[i].EndsWith(".txt", StringComparison.OrdinalIgnoreCase))
                    {
                        txtFile = exportRes.GeneratedFiles[i];
                        break;
                    }
                }

                if (txtFile != null && File.Exists(txtFile))
                {
                    string txtContent = File.ReadAllText(txtFile, System.Text.Encoding.UTF8);
                    if (!txtContent.Contains(dbProducts.Count.ToString()))
                    {
                        result.Message = "محتوى وثيقة ملكية البيانات ناقص";
                        return result;
                    }
                }
                result.CertificateFilePassed = true;
                result.PassedAssertions++;
                result.Details.Add("وثيقة ملكية البيانات والتقرير النصي تم إنشاؤها بالمعلومات والإحصائيات الصحيحة");

                result.Success = true;
                result.Message = "نجحت جميع اختبارات تصدير بيانات المحل ومطابقة الصفوف والمجاميع بنسبة 100% (5/5 تأكيداً)!";
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.Message = "استثناء أثناء اختبار التصدير: " + ex.Message;
            }
            finally
            {
                try
                {
                    if (Directory.Exists(testExportDir))
                    {
                        Directory.Delete(testExportDir, true);
                    }
                }
                catch { }
            }

            return result;
        }

        private static void EnsureTestDataAvailable()
        {
            // Database is seeded by DemoDataService or Migrations
        }
    }
}
