using System;
using System.IO;
using System.Collections.Generic;
using System.Data.SQLite;
using RafiqPOS.Common;
using RafiqPOS.Database;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class ShiftAndDrawerTestResult
    {
        public bool Success { get; set; }
        public string Message { get; set; }
        public int TotalAssertions { get; set; }
        public int PassedAssertions { get; set; }
        public List<string> Details { get; set; }

        public ShiftAndDrawerTestResult()
        {
            this.Details = new List<string>();
        }
    }

    public static class ShiftAndCashDrawerTestRunner
    {
        public static ShiftAndDrawerTestResult RunAllTests()
        {
            var result = new ShiftAndDrawerTestResult
            {
                Success = true,
                TotalAssertions = 0,
                PassedAssertions = 0
            };

            string tempDbPath = Path.Combine(Path.GetTempPath(), "rafiq_shifts_audit_test_" + Guid.NewGuid().ToString("N") + ".db");
            string tempConnStr = string.Format("Data Source={0};Version=3;BusyTimeout=5000;", tempDbPath);

            try
            {
                // 1. Run migrations up to Migration 32
                MigrationRunner.ApplyMigrations(tempConnStr, tempDbPath);
                Assert(File.Exists(tempDbPath), "تم تطبيق قاعدة البيانات وهجرتها للنسخة 32 بنجاح", result);

                // 2. Setup repos & services
                var counterRepo = new CounterRepository(tempConnStr);
                var auditRepo = new AuditLogRepository(tempConnStr);
                var settingsRepo = new SettingsRepository(tempConnStr);
                var closingRepo = new DailyClosingRepository(tempConnStr);
                var dailyClosingService = new DailyClosingService(tempConnStr, closingRepo, counterRepo, auditRepo, settingsRepo);

                var shiftRepo = new ShiftRepository(tempConnStr);
                var shiftService = new ShiftService(tempConnStr, shiftRepo, counterRepo, auditRepo, dailyClosingService);
                var cashDrawerService = new CashDrawerService(tempConnStr, shiftRepo, shiftService, auditRepo);

                var pRepo = new ProductRepository(tempConnStr, auditRepo);
                var priceHistRepo = new ProductPriceHistoryRepository(tempConnStr);
                var stockMovementRepo = new StockMovementRepository(tempConnStr);
                var prodService = new ProductService(pRepo, auditRepo, priceHistRepo, stockMovementRepo);
                var saleRepo = new SaleRepository(tempConnStr, counterRepo, auditRepo);
                var saleService = new SaleService(saleRepo, pRepo);
                var retRepo = new ReturnRepository(tempConnStr, counterRepo, auditRepo);
                var retService = new ReturnService(retRepo, saleRepo, dailyClosingService);
                var expenseRepo = new ExpenseRepository(tempConnStr, auditRepo, counterRepo);
                var expenseService = new ExpenseService(expenseRepo, dailyClosingService);

                // Mock active product for testing
                var prod = new Product
                {
                    Name = "علبة جبنة براميلي 500 جم",
                    Barcode = "6221100099",
                    PricePiasters = 5000, // 50.00 EGP
                    CostPiasters = 3500,
                    StockQuantityMilli = 100000,
                    Unit = "piece",
                    IsActive = true
                };
                prod = prodService.SaveProduct(prod, true, true);

                // =========================================================================
                // SCENARIO 1: Attempting financial transaction BEFORE opening a shift
                // =========================================================================
                bool saleBlockedBeforeShift = false;
                try
                {
                    // Ensure setting requires open shift
                    settingsRepo.Set("require_open_shift_to_sell", "1");

                    // Temporarily mock DatabaseService references for SaleService and ExpenseService
                    var origShifts = DatabaseService.Shifts;
                    var origSettings = DatabaseService.Settings;
                    var origDaily = DatabaseService.DailyClosing;

                    typeof(DatabaseService).GetProperty("Shifts").SetValue(null, shiftService, null);
                    typeof(DatabaseService).GetProperty("DailyClosing").SetValue(null, dailyClosingService, null);

                    var testSale = new Sale
                    {
                        SubtotalPiasters = 5000,
                        TotalPiasters = 5000,
                        PaidPiasters = 5000,
                        PaymentMethod = "cash",
                        Items = new List<SaleItem>
                        {
                            new SaleItem { ProductId = prod.Id, ProductName = prod.Name, QuantityMilli = 1000, UnitPricePiasters = 5000, UnitCostPiasters = 3500, TotalPiasters = 5000 }
                        }
                    };

                    saleService.ProcessSale(testSale);
                }
                catch (InvalidOperationException invEx)
                {
                    if (invEx.Message.Contains("وردية"))
                    {
                        saleBlockedBeforeShift = true;
                    }
                }
                Assert(saleBlockedBeforeShift, "سيناريو 1: تم منع البيع تماماً قبل فتح وردية رسمية للكاشير واستلام العهدة", result);

                // Attempt Cash In before shift
                bool cashInBlockedBeforeShift = false;
                try
                {
                    cashDrawerService.RecordCashIn(new CashMovementRequest
                    {
                        AmountPiasters = 10000,
                        Reason = "محاولة تغذية غير مصرح بها"
                    });
                }
                catch (InvalidOperationException)
                {
                    cashInBlockedBeforeShift = true;
                }
                Assert(cashInBlockedBeforeShift, "سيناريو 1: تم منع تسجيل حركة إيداع نثري (Cash In) قبل فتح وردية", result);

                // Attempt Cash Out before shift
                bool cashOutBlockedBeforeShift = false;
                try
                {
                    cashDrawerService.RecordCashOut(new CashMovementRequest
                    {
                        AmountPiasters = 5000,
                        Reason = "محاولة سحب غير مصرح بها"
                    });
                }
                catch (InvalidOperationException)
                {
                    cashOutBlockedBeforeShift = true;
                }
                Assert(cashOutBlockedBeforeShift, "سيناريو 1: تم منع تسجيل حركة سحب نثري (Cash Out) قبل فتح وردية", result);

                // Attempt Expense before shift
                bool expenseBlockedBeforeShift = false;
                try
                {
                    expenseService.CreateExpense(new CreateExpenseRequest
                    {
                        AmountPiasters = 2000,
                        Category = "بوفيه",
                        Notes = "مصروف شاي"
                    });
                }
                catch (InvalidOperationException)
                {
                    expenseBlockedBeforeShift = true;
                }
                Assert(expenseBlockedBeforeShift, "سيناريو 1: تم منع تسجيل مصروفات نقدية من الدرج قبل فتح وردية", result);

                // =========================================================================
                // SCENARIO 2: Concurrency Check (Opening 2 shifts simultaneously)
                // =========================================================================
                // Open Shift 1 with 500 EGP (50,000 piasters)
                var shift1 = shiftService.OpenShift(new OpenShiftRequest
                {
                    CashierId = "cashier_ahmed",
                    CashierName = "أحمد مصطفى",
                    PosRegisterId = "pos_main_1",
                    OpeningFloatPiasters = 50000,
                    Notes = "بداية الوردية الصباحية"
                });

                Assert(shift1 != null && !string.IsNullOrEmpty(shift1.Id), "تم فتح الوردية الأولى بنجاح", result);
                Assert(shift1.ShiftNumber > 0, string.Format("تم توليد رقم وردية متسلسل #{0}", shift1.ShiftNumber), result);
                Assert(shift1.OpeningFloatPiasters == 50000, "العهدة الافتتاحية مسجلة بدقة: 500.00 ج.م (50000 قرش)", result);

                // Attempt opening a second shift on the same POS register
                bool secondShiftBlockedByService = false;
                try
                {
                    shiftService.OpenShift(new OpenShiftRequest
                    {
                        CashierId = "cashier_sara",
                        CashierName = "سارة حسن",
                        PosRegisterId = "pos_main_1",
                        OpeningFloatPiasters = 20000,
                        Notes = "محاولة فتح وردية متداخلة"
                    });
                }
                catch (InvalidOperationException invEx)
                {
                    if (invEx.Message.Contains("مفتوحة بالفعل"))
                    {
                        secondShiftBlockedByService = true;
                    }
                }
                Assert(secondShiftBlockedByService, "سيناريو 2: تم منع فتح ورديتين بالتزامن على نفس الجهاز برمجياً في ShiftService", result);

                // Direct SQLite constraint test: verify UNIQUE index blocks duplicate open shift at DB level
                bool dbUniqueIndexBlocked = false;
                try
                {
                    using (var conn = new SQLiteConnection(tempConnStr))
                    {
                        conn.Open();
                        string sql = @"
                            INSERT INTO shifts (
                                id, shift_number, cashier_id, cashier_name, pos_register_id,
                                business_date, opened_at, status, opening_float_piasters,
                                created_at, updated_at
                            ) VALUES (
                                'shift_fake_dup', 999, 'cashier_fake', 'مستخدم وهمي', 'pos_main_1',
                                '2026-10-18', datetime('now'), 'open', 0,
                                datetime('now'), datetime('now')
                            );
                        ";
                        using (var cmd = new SQLiteCommand(sql, conn))
                        {
                            cmd.ExecuteNonQuery();
                        }
                    }
                }
                catch (SQLiteException)
                {
                    dbUniqueIndexBlocked = true;
                }
                Assert(dbUniqueIndexBlocked, "سيناريو 2: فهرس قاعدة البيانات الفريد (idx_shifts_open_register) يحمي من تكرار الورديات 100% حتى في أسوأ حالات الـ Race Condition", result);

                // =========================================================================
                // SCENARIO 3: Cash In / Cash Out Petty Cash Movements
                // =========================================================================
                var liveBal0 = shiftService.GetShiftSummary(shift1.Id);
                Assert(liveBal0.ExpectedCashPiasters == 50000, "الرصيد الابتدائي المتوقع للدرج يساوي العهدة الافتتاحية (50,000 قرش)", result);

                // Cash In: Add 200 EGP (20,000 piasters) "فكة للدرج"
                var cashInTx = cashDrawerService.RecordCashIn(new CashMovementRequest
                {
                    ShiftId = shift1.Id,
                    AmountPiasters = 20000,
                    Reason = "فكة صباحية للدرج",
                    PerformedById = shift1.CashierId,
                    PerformedByName = shift1.CashierName
                });
                Assert(cashInTx != null && cashInTx.AmountPiasters == 20000, "تم تسجيل حركة إيداع نثري (Cash In) بمبلغ 200.00 ج.م", result);

                var liveBalAfterIn = shiftService.GetShiftSummary(shift1.Id);
                Assert(liveBalAfterIn.CashInPiasters == 20000, "إجمالي الإيداعات النثرية تم رصده فوراً: 20000 قرش", result);
                Assert(liveBalAfterIn.ExpectedCashPiasters == 70000, "سيناريو 3: رصيد الدرج المتوقع زاد فوراً بالقروش من 50,000 إلى 70,000 قرش", result);

                // Cash Out: Withdraw 150 EGP (15,000 piasters) "توريد للخزينة"
                var cashOutTx = cashDrawerService.RecordCashOut(new CashMovementRequest
                {
                    ShiftId = shift1.Id,
                    AmountPiasters = 15000,
                    Reason = "توريد جزئي للخزينة الرئيسية",
                    PerformedById = shift1.CashierId,
                    PerformedByName = shift1.CashierName
                });
                Assert(cashOutTx != null && cashOutTx.AmountPiasters == 15000, "تم تسجيل حركة سحب نثري (Cash Out) بمبلغ 150.00 ج.م", result);

                var liveBalAfterOut = shiftService.GetShiftSummary(shift1.Id);
                Assert(liveBalAfterOut.CashOutPiasters == 15000, "إجمالي السحوبات النثرية تم رصده فوراً: 15000 قرش", result);
                Assert(liveBalAfterOut.ExpectedCashPiasters == 55000, "سيناريو 3: رصيد الدرج المتوقع نقص فوراً إلى 55,000 قرش", result);

                // Attempt excessive Cash Out (Attempting to withdraw 100,000 piasters when only 55,000 available)
                bool excessiveCashOutBlocked = false;
                try
                {
                    cashDrawerService.RecordCashOut(new CashMovementRequest
                    {
                        ShiftId = shift1.Id,
                        AmountPiasters = 100000,
                        Reason = "سحب مبلغ أكبر من المتاح"
                    });
                }
                catch (InvalidOperationException invEx)
                {
                    if (invEx.Message.Contains("أكبر من النقدية المتوفرة"))
                    {
                        excessiveCashOutBlocked = true;
                    }
                }
                Assert(excessiveCashOutBlocked, "سيناريو 3: تم منع سحب أي مبالغ نقدية تتجاوز الرصيد الفعلي المتوفر بالدرج", result);

                // =========================================================================
                // Financial Transactions on Shift: Sale, Return, Expense
                // =========================================================================
                // 1. Cash Sale: 2 units * 50.00 = 100.00 EGP (10,000 piasters)
                var sale1 = new Sale
                {
                    SubtotalPiasters = 10000,
                    TotalPiasters = 10000,
                    PaidPiasters = 10000,
                    PaymentMethod = "cash",
                    Items = new List<SaleItem>
                    {
                        new SaleItem { ProductId = prod.Id, ProductName = prod.Name, QuantityMilli = 2000, UnitPricePiasters = 5000, UnitCostPiasters = 3500, TotalPiasters = 10000 }
                    }
                };
                sale1 = saleService.ProcessSale(sale1);
                Assert(sale1.InvoiceNumber > 0, "تم تسجيل فاتورة مبيعات نقدية بقيمة 100.00 ج.م بنجاح", result);

                // 2. Return 1 unit cash: 50.00 EGP (5,000 piasters)
                var returnReq = new Return
                {
                    InvoiceNumber = sale1.InvoiceNumber,
                    TotalPiasters = 5000,
                    RefundMethod = "cash",
                    Reason = "إرجاع علبة واحدة",
                    Items = new List<ReturnItem>
                    {
                        new ReturnItem { ProductId = prod.Id, ProductName = prod.Name, QuantityMilli = 1000, UnitPricePiasters = 5000, TotalPiasters = 5000 }
                    }
                };
                retService.ProcessReturn(returnReq);

                // 3. Expense from drawer: 10.00 EGP (1,000 piasters)
                var exp = expenseService.CreateExpense(new CreateExpenseRequest
                {
                    AmountPiasters = 1000,
                    Category = "نظافة",
                    Notes = "شراء أدوات نظافة"
                });
                Assert(exp != null && exp.AmountPiasters == 1000, "تم تسجيل مصروف نقدي من الدرج بقيمة 10.00 ج.م", result);

                // Live expected calculation:
                // Opening Float (50000) + Cash In (20000) - Cash Out (15000) + Cash Sale (10000) - Cash Return (5000) - Expense (1000)
                // = 50000 + 20000 - 15000 + 10000 - 5000 - 1000 = 59,000 piasters (590.00 EGP)
                long expectedBeforeCrash = 59000;
                var summaryBeforeCrash = shiftService.GetShiftSummary(shift1.Id);
                Assert(summaryBeforeCrash.ExpectedCashPiasters == expectedBeforeCrash,
                    string.Format("مطابقة رصيد الدرج المتوقع: {0} قرش (590.00 ج.م)", summaryBeforeCrash.ExpectedCashPiasters), result);

                // =========================================================================
                // SCENARIO 4: Power cut / abrupt shutdown recovery
                // =========================================================================
                // Simulate restart: create fresh service instances pointing to the existing SQLite DB
                var recoveredShiftRepo = new ShiftRepository(tempConnStr);
                var recoveredShiftService = new ShiftService(tempConnStr, recoveredShiftRepo, counterRepo, auditRepo, dailyClosingService);

                var activeAfterRestart = recoveredShiftService.GetActiveShift("pos_main_1");
                Assert(activeAfterRestart != null, "سيناريو 4: بعد محاكاة انقطاع الكهرباء وإعادة فتح البرنامج، تم استرجاع الوردية المفتوحة بنجاح", result);
                Assert(activeAfterRestart.Id == shift1.Id, "معرف الوردية المسترجعة مطابق تماماً للوردية المعلقة قبل الإغلاق الفجائي", result);
                Assert(activeAfterRestart.OpeningFloatPiasters == 50000, "العهدة الافتتاحية محفوظة بدقة بدون أي تلف", result);

                var recoveredSummary = recoveredShiftService.GetShiftSummary(activeAfterRestart.Id);
                Assert(recoveredSummary.ExpectedCashPiasters == expectedBeforeCrash,
                    string.Format("سيناريو 4: جميع المبيعات والمرتجعات وحركات النقدية قبل انقطاع الكهرباء استُرجعت بدقة القروش: {0} قرش", recoveredSummary.ExpectedCashPiasters), result);

                // =========================================================================
                // SCENARIO 5: Shortage & Surplus Discrepancy & Immutability Guarantee
                // =========================================================================
                // Cashier counts actual cash in drawer: 575.00 EGP (57,500 piasters)
                // Expected is 59,000 piasters -> Discrepancy = 57500 - 59000 = -1500 piasters (Shortage of 15.00 EGP / عجز 15 جنيه)
                long actualCountedCash = 57500;
                long expectedDiscrepancy = actualCountedCash - expectedBeforeCrash; // -1500

                var closedShift = recoveredShiftService.CloseShift(new CloseShiftRequest
                {
                    ShiftId = activeAfterRestart.Id,
                    ActualCashPiasters = actualCountedCash,
                    Notes = "إغلاق الوردية مع وجود عجز 15 جنيه"
                });

                Assert(closedShift != null && closedShift.Status == "closed", "تم إغلاق وتشميع الوردية بنجاح", result);
                Assert(closedShift.ExpectedCashPiasters == expectedBeforeCrash, "النقد المتوقع المسجل في سجل الإغلاق مطابق: 59000 قرش", result);
                Assert(closedShift.ActualCashPiasters == actualCountedCash, "النقد الفعلي المسجل مطابق للعد: 57500 قرش", result);
                Assert(closedShift.DifferencePiasters == expectedDiscrepancy, string.Format("سيناريو 5: تم حساب العجز المحاسبي بدقة القروش: {0} قرش (-15.00 ج.م)", closedShift.DifferencePiasters), result);

                // Verify Immutability: Attempting UPDATE on closed shift must be rejected by SQLite trigger
                bool updateClosedShiftBlocked = false;
                try
                {
                    using (var conn = new SQLiteConnection(tempConnStr))
                    {
                        conn.Open();
                        using (var cmd = new SQLiteCommand("UPDATE shifts SET notes = 'محاولة تلاعب بعد الإغلاق' WHERE id = @id;", conn))
                        {
                            cmd.Parameters.AddWithValue("@id", closedShift.Id);
                            cmd.ExecuteNonQuery();
                        }
                    }
                }
                catch (SQLiteException ex)
                {
                    if (ex.Message.Contains("لا يمكن تعديل سجل الوردية"))
                    {
                        updateClosedShiftBlocked = true;
                    }
                }
                Assert(updateClosedShiftBlocked, "سيناريو 5: تريجر الحماية (trg_prevent_closed_shift_update) منع أي تعديل على الوردية بعد إغلاقها", result);

                // Verify Immutability: Attempting DELETE on shift must be rejected by SQLite trigger
                bool deleteShiftBlocked = false;
                try
                {
                    using (var conn = new SQLiteConnection(tempConnStr))
                    {
                        conn.Open();
                        using (var cmd = new SQLiteCommand("DELETE FROM shifts WHERE id = @id;", conn))
                        {
                            cmd.Parameters.AddWithValue("@id", closedShift.Id);
                            cmd.ExecuteNonQuery();
                        }
                    }
                }
                catch (SQLiteException ex)
                {
                    if (ex.Message.Contains("لا يمكن حذف سجلات الورديات"))
                    {
                        deleteShiftBlocked = true;
                    }
                }
                Assert(deleteShiftBlocked, "سيناريو 5: تريجر الحماية (trg_prevent_shift_delete) منع أي حذف لسجلات الورديات نهائياً", result);

                // Verify: Attempting a sale after closing with no active shift is blocked
                bool saleBlockedAfterClosing = false;
                try
                {
                    saleService.ProcessSale(new Sale
                    {
                        SubtotalPiasters = 5000,
                        TotalPiasters = 5000,
                        PaidPiasters = 5000,
                        PaymentMethod = "cash",
                        Items = new List<SaleItem>
                        {
                            new SaleItem { ProductId = prod.Id, ProductName = prod.Name, QuantityMilli = 1000, UnitPricePiasters = 5000, UnitCostPiasters = 3500, TotalPiasters = 5000 }
                        }
                    });
                }
                catch (InvalidOperationException)
                {
                    saleBlockedAfterClosing = true;
                }
                Assert(saleBlockedAfterClosing, "سيناريو 1: تم منع البيع بعد إغلاق الوردية حتى يتم فتح وردية جديدة", result);

                result.Message = string.Format("نجحت جميع فحوصات وتدقيق دورة حياة الوردية والدرج: {0}/{1} اختبارات معتمدة 100%",
                    result.PassedAssertions, result.TotalAssertions);
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.Message = "فشل في اختبارات الورديات والدرج: " + ex.Message;
                result.Details.Add("خطأ غير متوقع: " + ex.ToString());
            }
            finally
            {
                try
                {
                    if (File.Exists(tempDbPath))
                    {
                        File.Delete(tempDbPath);
                    }
                }
                catch { }
            }

            return result;
        }

        private static void Assert(bool condition, string assertionName, ShiftAndDrawerTestResult result)
        {
            result.TotalAssertions++;
            if (condition)
            {
                result.PassedAssertions++;
                result.Details.Add("[PASS] " + assertionName);
            }
            else
            {
                result.Success = false;
                result.Details.Add("[FAIL] " + assertionName);
                throw new Exception("فشل التحقق: " + assertionName);
            }
        }
    }
}
