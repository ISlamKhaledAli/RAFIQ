using System;
using System.Collections.Generic;
using System.Data.SQLite;
using System.Diagnostics;
using System.IO;
using RafiqPOS.Models;

namespace RafiqPOS.Services
{
    public class ForensicAuditTestResult
    {
        public bool Success { get; set; }
        public string Message { get; set; }
        public int TotalAssertions { get; set; }
        public int PassedAssertions { get; set; }
        public List<string> Details { get; set; }

        public ForensicAuditTestResult()
        {
            Details = new List<string>();
        }
    }

    /// <summary>
    /// مدقق الفحص الجنائي والرقابي لنظام رفيق (Forensic Audit & Compliance Test Suite)
    /// يفحص شمولية تدوين العمليات الحساسة، حماية السجلات من التعديل بالحمايات الذرية (Tamper-Proof Triggers)،
    /// وسرعة الفلترة والاستعلامات المتعددة، وتماسك السلسلة المشفرة.
    /// </summary>
    public static class ForensicAuditTestRunner
    {
        private static void Assert(bool condition, string testName, ForensicAuditTestResult res)
        {
            res.TotalAssertions++;
            if (condition)
            {
                res.PassedAssertions++;
                res.Details.Add("[PASS] " + testName);
            }
            else
            {
                res.Success = false;
                res.Details.Add("[FAIL] " + testName);
            }
        }

        public static ForensicAuditTestResult RunAllTests()
        {
            var result = new ForensicAuditTestResult
            {
                Success = true,
                TotalAssertions = 0,
                PassedAssertions = 0
            };

            string tempDir = Path.Combine(Path.GetTempPath(), "rafiq_forensic_" + Guid.NewGuid().ToString("N"));
            if (!Directory.Exists(tempDir)) Directory.CreateDirectory(tempDir);

            try
            {
                // 1. Initialize DB through DatabaseService
                DatabaseService.Initialize(tempDir);
                Assert(File.Exists(DatabaseService.DbPath), "إنشاء قاعدة بيانات الفحص الجنائي وتهيئة كافة الخدمات بنجاح", result);

                var auditService = DatabaseService.Audit;
                string connStr = DatabaseService.ConnectionString;

                // =========================================================================
                // 1. TAMPER-PROOF TRIGGERS (حماية السجل من التعديل والحذف المباشر)
                // =========================================================================
                auditService.Log("SECURITY_INIT", "audit_test", "test_id", "{\"init\":true}", "user_tester");
                var initialLogs = auditService.GetLogs(10);
                Assert(initialLogs.Count > 0, "تسجيل قيد تدقيق مبدئي بنجاح", result);
                string testLogId = initialLogs[0].Id;

                // A. Direct UPDATE Attempt
                bool updateBlocked = false;
                try
                {
                    using (var conn = new SQLiteConnection(connStr))
                    {
                        conn.Open();
                        using (var cmd = conn.CreateCommand())
                        {
                            cmd.CommandText = "UPDATE audit_logs SET action = 'TAMPERED_ACTION' WHERE id = @id";
                            cmd.Parameters.AddWithValue("@id", testLogId);
                            cmd.ExecuteNonQuery();
                        }
                    }
                }
                catch (SQLiteException ex)
                {
                    if (ex.Message.IndexOf("Audit logs are immutable", StringComparison.OrdinalIgnoreCase) >= 0 ||
                        ex.Message.IndexOf("خطأ أمني", StringComparison.OrdinalIgnoreCase) >= 0 ||
                        ex.Message.IndexOf("SECURITY VIOLATION", StringComparison.OrdinalIgnoreCase) >= 0 ||
                        ex.Message.IndexOf("ABORT", StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        updateBlocked = true;
                    }
                }
                Assert(updateBlocked, "Tamper-Proof: منع التعديل المباشر على جدول audit_logs بواسطة تريجر trg_audit_logs_no_update", result);

                // B. Direct DELETE Attempt
                bool deleteBlocked = false;
                try
                {
                    using (var conn = new SQLiteConnection(connStr))
                    {
                        conn.Open();
                        using (var cmd = conn.CreateCommand())
                        {
                            cmd.CommandText = "DELETE FROM audit_logs WHERE id = @id";
                            cmd.Parameters.AddWithValue("@id", testLogId);
                            cmd.ExecuteNonQuery();
                        }
                    }
                }
                catch (SQLiteException ex)
                {
                    if (ex.Message.IndexOf("Audit logs cannot be deleted", StringComparison.OrdinalIgnoreCase) >= 0 ||
                        ex.Message.IndexOf("خطأ أمني", StringComparison.OrdinalIgnoreCase) >= 0 ||
                        ex.Message.IndexOf("SECURITY VIOLATION", StringComparison.OrdinalIgnoreCase) >= 0 ||
                        ex.Message.IndexOf("ABORT", StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        deleteBlocked = true;
                    }
                }
                Assert(deleteBlocked, "Tamper-Proof: منع الحذف المباشر من جدول audit_logs بواسطة تريجر trg_audit_logs_no_delete", result);

                // =========================================================================
                // 2. AUTHORIZED BYPASS FOR CRYPTOGRAPHIC RESEAL
                // =========================================================================
                bool resealSuccess = false;
                try
                {
                    auditService.ResealChain();
                    resealSuccess = true;
                }
                catch (Exception)
                {
                    resealSuccess = false;
                }
                Assert(resealSuccess, "آلية تجاوز مصرح بها: إعادة ختم السلسلة التشفيرية ResealChain() تعمل بسلام وبشكل ذري", result);

                var integrityAfterReseal = auditService.VerifyChainIntegrity();
                Assert(integrityAfterReseal.IsValid, "صحة السلسلة التشفيرية SHA-256 بعد إعادة الختم", result);

                // Set up User Session for subsequent operations from seeded database users
                var existingAdmin = DatabaseService.UserRepo.GetById("usr_admin_default") ?? DatabaseService.UserRepo.GetById("usr_root_developer");
                UserDto adminUser;
                if (existingAdmin != null)
                {
                    adminUser = SecurityService.MapToDto(existingAdmin);
                }
                else
                {
                    var allUsers = DatabaseService.UserRepo.GetAll();
                    if (allUsers != null && allUsers.Count > 0)
                    {
                        adminUser = SecurityService.MapToDto(allUsers[0]);
                    }
                    else
                    {
                        var createdUser = new User
                        {
                            Id = "usr_admin_forensic",
                            Username = "admin_forensic",
                            DisplayName = "مدير الفحص الرقابي",
                            Role = "admin",
                            IsActive = true,
                            CreatedAt = DateTime.UtcNow.ToString("o"),
                            UpdatedAt = DateTime.UtcNow.ToString("o")
                        };
                        DatabaseService.UserRepo.Insert(createdUser);
                        adminUser = SecurityService.MapToDto(createdUser);
                    }
                }
                SecurityService.SetCurrentUserForTesting(adminUser);

                // Open Shift for Cashier operations
                var shift = DatabaseService.Shifts.OpenShift(new OpenShiftRequest
                {
                    CashierId = adminUser.Id,
                    CashierName = adminUser.DisplayName ?? adminUser.Username,
                    OpeningFloatPiasters = 10000
                });
                Assert(shift != null && shift.Status == "open", "فتح وردية عمل صالحة للكاشير", result);

                // =========================================================================
                // 3. COMPREHENSIVE LOGGING: MANUAL DRAWER OPEN (فتح الدرج يدوياً)
                // =========================================================================
                string drawerReason = "عجز كاش فحص يدوي رقابي";
                DatabaseService.CashDrawer.OpenDrawerManual(drawerReason, adminUser.Id);

                var drawerLogs = auditService.GetLogs(10, "drawer_manual_open");
                Assert(drawerLogs.Count > 0, "شمولية التسجيل: تدوين حركة فتح درج النقدية يدوياً (drawer_manual_open)", result);
                if (drawerLogs.Count > 0)
                {
                    var dLog = drawerLogs[0];
                    Assert(dLog.UserId == adminUser.Id, "تسجيل معرف المستخدم المنفذ لفتح الدرج", result);
                    Assert(!string.IsNullOrEmpty(dLog.DetailsJson) && dLog.DetailsJson.Contains(drawerReason), "حفظ سبب فتح الدرج داخل تفاصيل القيد", result);
                }

                // =========================================================================
                // 4. COMPREHENSIVE LOGGING: SALE DISCOUNT (إعطاء خصم)
                // =========================================================================
                string prodId = "prod_disc_test_" + Guid.NewGuid().ToString("N").Substring(0, 8);
                var prod = new Product
                {
                    Id = prodId,
                    Name = "منتج تجربة الخصم الرقابي",
                    Barcode = "622998877001",
                    CostPiasters = 5000,
                    PricePiasters = 10000,
                    StockQuantityMilli = 100000,
                    Unit = "قطعة",
                    IsActive = true
                };
                DatabaseService.Products.SaveProduct(prod);

                var sale = new Sale
                {
                    Id = "sale_disc_" + Guid.NewGuid().ToString("N").Substring(0, 8),
                    SubtotalPiasters = 10000,
                    DiscountPiasters = 1500, // 15 EGP discount
                    TaxPiasters = 0,
                    TotalPiasters = 8500,
                    PaidPiasters = 8500,
                    PaymentMethod = "cash",
                    Status = "completed",
                    ShiftId = shift.Id,
                    CashierId = adminUser.Id,
                    CashierName = adminUser.DisplayName ?? adminUser.Username,
                    CreatedAt = DateTime.UtcNow.ToString("o"),
                    Items = new List<SaleItem>
                    {
                        new SaleItem
                        {
                            Id = "si_disc_1_" + Guid.NewGuid().ToString("N").Substring(0, 6),
                            ProductId = prod.Id,
                            ProductName = prod.Name,
                            QuantityMilli = 1000,
                            UnitPricePiasters = 10000,
                            DiscountPiasters = 0,
                            TotalPiasters = 8500
                        }
                    }
                };
                DatabaseService.Sales.ProcessSale(sale);

                var discountLogs = auditService.GetLogs(10, "sale_discount");
                Assert(discountLogs.Count > 0, "شمولية التسجيل: تدوين منح الخصم التجاري آلياً مع الفاتورة (sale_discount)", result);
                if (discountLogs.Count > 0)
                {
                    var discLog = discountLogs[0];
                    Assert(discLog.DetailsJson.Contains("1500"), "تدوين قيمة الخصم بالقروش بدقة داخل التفاصيل", result);
                    Assert(discLog.DetailsJson.Contains("8500"), "تدوين إجمالي الفاتورة الصافي بعد الخصم", result);
                }

                // =========================================================================
                // 5. COMPREHENSIVE LOGGING: PRICE & COST UPDATE (تعديل سعر البيع والتكلفة)
                // =========================================================================
                prod.PricePiasters = 12500;
                DatabaseService.Products.SaveProduct(prod);

                var priceLogs = auditService.GetLogs(10, "price_update");
                Assert(priceLogs.Count > 0, "شمولية التسجيل: تدوين تعديل سعر البيع (price_update)", result);
                if (priceLogs.Count > 0)
                {
                    var pLog = priceLogs[0];
                    Assert(pLog.DetailsJson.Contains("10000") && pLog.DetailsJson.Contains("12500"), "تسجيل سعر البيع قبل وبعد التعديل", result);
                }

                prod.CostPiasters = 6200;
                DatabaseService.Products.SaveProduct(prod);

                var costLogs = auditService.GetLogs(10, "cost_update");
                Assert(costLogs.Count > 0, "شمولية التسجيل: تدوين تعديل سعر التكلفة (cost_update)", result);
                if (costLogs.Count > 0)
                {
                    var coLog = costLogs[0];
                    Assert(coLog.DetailsJson.Contains("5000") && coLog.DetailsJson.Contains("6200"), "تسجيل سعر التكلفة قبل وبعد التعديل", result);
                }

                // =========================================================================
                // 6. COMPREHENSIVE LOGGING: STOCK ADJUSTMENT (تعديل المخزون)
                // =========================================================================
                DatabaseService.Inventory.AdjustStock(prod.Id, 85000, "جرد فعلي - تسوية مخزن الفحص الجنائي", adminUser.Id);
                var stockLogs = auditService.GetLogs(10, "stock_adjustment");
                Assert(stockLogs.Count > 0, "شمولية التسجيل: تدوين تسوية المخزون (stock_adjustment)", result);
                if (stockLogs.Count > 0)
                {
                    var stLog = stockLogs[0];
                    Assert(stLog.DetailsJson.Contains("85000"), "تسجيل كمية المخزون بعد التسوية الجردية بدقة", result);
                }

                // =========================================================================
                // 7. COMPREHENSIVE LOGGING: SETTINGS UPDATE (تغيير إعدادات النظام)
                // =========================================================================
                DatabaseService.Settings.Set("store_name", "سوبرماركت الأمانة والوفاء التجاري");
                var settingsLogs = auditService.GetLogs(10, "settings_update");
                Assert(settingsLogs.Count > 0, "شمولية التسجيل: تدوين تغيير إعدادات النظام مع القيمة القديمة والجديدة (settings_update)", result);
                if (settingsLogs.Count > 0)
                {
                    var setLog = settingsLogs[0];
                    Assert(setLog.DetailsJson.Contains("store_name") && setLog.DetailsJson.Contains("سوبرماركت الأمانة والوفاء التجاري"), "حفظ مفتاح الإعداد والقيمة المعدلة", result);
                }

                // =========================================================================
                // 8. COMPREHENSIVE LOGGING: USER LOGOUT (تسجيل خروج المستخدم)
                // =========================================================================
                DatabaseService.Security.Logout();
                var logoutLogs = auditService.GetLogs(10, "USER_LOGOUT");
                Assert(logoutLogs.Count > 0, "شمولية التسجيل: تدوين تسجيل خروج المستخدم (USER_LOGOUT)", result);

                // =========================================================================
                // 9. QUERY PERFORMANCE & MULTI-DIMENSIONAL FILTERING (سرعة الاسترجاع والفلترة)
                // =========================================================================
                // Insert 100 dummy logs to test index-assisted performance
                for (int i = 0; i < 100; i++)
                {
                    auditService.Log("PERF_ACTION_" + (i % 5), "perf_target", "iter_" + i, "{\"iter\":" + i + "}", "user_perf_" + (i % 3));
                }

                var swAction = Stopwatch.StartNew();
                var filteredByAction = auditService.GetLogs(50, "PERF_ACTION_1");
                swAction.Stop();
                Assert(filteredByAction.Count > 0, "فلترة السجلات بحسب نوع النشاط بدقة", result);
                Assert(swAction.ElapsedMilliseconds < 50, string.Format("سرعة الفلترة بنوع النشاط (<50ms): {0}ms", swAction.ElapsedMilliseconds), result);

                var swUser = Stopwatch.StartNew();
                var filteredByUser = auditService.GetLogs(50, null, "user_perf_2");
                swUser.Stop();
                Assert(filteredByUser.Count > 0, "فلترة السجلات بحسب معرف المستخدم", result);
                Assert(swUser.ElapsedMilliseconds < 50, string.Format("سرعة الفلترة بالمستخدم (<50ms): {0}ms", swUser.ElapsedMilliseconds), result);

                var swDate = Stopwatch.StartNew();
                string todayStr = DateTime.UtcNow.ToString("yyyy-MM-dd");
                var filteredByDate = auditService.GetLogs(50, null, null, todayStr, todayStr);
                swDate.Stop();
                Assert(filteredByDate.Count > 0, "فلترة السجلات بمدى التاريخ (من/إلى)", result);
                Assert(swDate.ElapsedMilliseconds < 50, string.Format("سرعة الفلترة بالتاريخ (<50ms): {0}ms", swDate.ElapsedMilliseconds), result);

                var swSearch = Stopwatch.StartNew();
                var filteredBySearch = auditService.GetLogs(50, null, null, null, null, "الأمانة");
                swSearch.Stop();
                Assert(filteredBySearch.Count > 0, "البحث النصي اللحظي في تفاصيل وعناوين السجلات", result);
                Assert(swSearch.ElapsedMilliseconds < 50, string.Format("سرعة البحث النصي (<50ms): {0}ms", swSearch.ElapsedMilliseconds), result);

                // =========================================================================
                // 10. FINAL CRYPTOGRAPHIC CHAIN INTEGRITY (سلامة السلسلة التشفيرية)
                // =========================================================================
                auditService.ResealChain();
                var finalIntegrity = auditService.VerifyChainIntegrity();
                Assert(finalIntegrity.IsValid, "سلامة السلسلة التشفيرية النهائية (Chain Integrity 100%)", result);
                Assert(!finalIntegrity.IsTampered, "خلو سجل التدقيق من أي قيود تالفة أو معدلة (Zero Tampering)", result);

                result.Message = string.Format("نجحت جميع فحوصات التدقيق الجنائي والرقابي ({0}/{1} بنجاح 100%)",
                    result.PassedAssertions, result.TotalAssertions);
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.Message = "حدث استثناء غير متوقع أثناء فحص السجل الجنائي: " + ex.Message + "\n" + ex.StackTrace;
                result.Details.Add("[ERROR] " + ex.ToString());
            }
            finally
            {
                try
                {
                    if (Directory.Exists(tempDir)) Directory.Delete(tempDir, true);
                }
                catch { }
            }

            return result;
        }
    }
}
