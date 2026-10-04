using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
using RafiqPOS.Common;

namespace RafiqPOS
{
    static class Program
    {
        private static Mutex _singleInstanceMutex;

        [STAThread]
        static void Main(string[] args)
        {
            bool isDemoError = false;
            if (args != null)
            {
                for (int i = 0; i < args.Length; i++)
                {
                    if (args[i] == "--run-license-tests")
                    {
                        try
                        {
                            Services.DatabaseService.Initialize();
                            var res = Services.LicenseTestRunner.RunAllTests();
                            string json = Newtonsoft.Json.JsonConvert.SerializeObject(res, Newtonsoft.Json.Formatting.Indented);
                            Console.WriteLine(json);
                            System.IO.File.WriteAllText(System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "license_test_output.json"), json);
                            Environment.Exit(res.Success ? 0 : 1);
                        }
                        catch (Exception ex)
                        {
                            Console.WriteLine("Test error: " + ex.Message);
                            Environment.Exit(2);
                        }
                        return;
                    }
                    if (args[i] == "--run-update-tests")
                    {
                        try
                        {
                            Services.DatabaseService.Initialize();
                            var res = Services.AppUpdateTestRunner.RunAllTests();
                            string json = Newtonsoft.Json.JsonConvert.SerializeObject(res, Newtonsoft.Json.Formatting.Indented);
                            Console.WriteLine(json);
                            System.IO.File.WriteAllText(System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "update_test_output.json"), json);
                            Environment.Exit(res.Success ? 0 : 1);
                        }
                        catch (Exception ex)
                        {
                            Console.WriteLine("Update test error: " + ex.Message);
                            Environment.Exit(2);
                        }
                        return;
                    }
                    if (args[i] == "--run-export-tests")
                    {
                        try
                        {
                            Services.DatabaseService.Initialize();
                            var res = Services.FullStoreExportTestRunner.RunAllTests();
                            string json = Newtonsoft.Json.JsonConvert.SerializeObject(res, Newtonsoft.Json.Formatting.Indented);
                            Console.WriteLine(json);
                            System.IO.File.WriteAllText(System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "full_store_export_test_output.json"), json);
                            Environment.Exit(res.Success ? 0 : 1);
                        }
                        catch (Exception ex)
                        {
                            Console.WriteLine("Export test error: " + ex.Message);
                            Environment.Exit(2);
                        }
                        return;
                    }
                    if (args[i] == "--run-variant-tests")
                    {
                        try
                        {
                            var res = Services.ProductVariantTestRunner.RunAllTests();
                            string json = Newtonsoft.Json.JsonConvert.SerializeObject(res, Newtonsoft.Json.Formatting.Indented);
                            Console.WriteLine(json);
                            System.IO.File.WriteAllText(System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "variant_test_output.json"), json);
                            Environment.Exit(res.Success ? 0 : 1);
                        }
                        catch (Exception ex)
                        {
                            Console.WriteLine("Variant test error: " + ex.Message);
                            Environment.Exit(2);
                        }
                        return;
                    }
                    if (args[i] == "--run-label-tests")
                    {
                        try
                        {
                            bool passed = Services.BarcodeLabelTestRunner.RunAllTests();
                            Environment.Exit(passed ? 0 : 1);
                        }
                        catch (Exception ex)
                        {
                            Console.WriteLine("Barcode label test error: " + ex.Message);
                            Environment.Exit(2);
                        }
                        return;
                    }
                    if (args[i] == "--run-bulk-price-tests")
                    {
                        try
                        {
                            var res = Services.BulkPriceAdjustmentTestRunner.RunAllTests();
                            string json = Newtonsoft.Json.JsonConvert.SerializeObject(res, Newtonsoft.Json.Formatting.Indented);
                            Console.WriteLine(json);
                            System.IO.File.WriteAllText(System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "bulk_price_test_output.json"), json);
                            Environment.Exit(res.Success ? 0 : 1);
                        }
                        catch (Exception ex)
                        {
                            Console.WriteLine("Bulk price test error: " + ex.Message);
                            Environment.Exit(2);
                        }
                        return;
                    }
                    if (args[i] == "--run-data-quality-tests")
                    {
                        try
                        {
                            Services.DatabaseService.Initialize();
                            var res = Services.DataQualityTestRunner.RunAllTests();
                            string json = Newtonsoft.Json.JsonConvert.SerializeObject(res, Newtonsoft.Json.Formatting.Indented);
                            Console.WriteLine(json);
                            System.IO.File.WriteAllText(System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "data_quality_test_output.json"), json);
                            Environment.Exit(res.Success ? 0 : 1);
                        }
                        catch (Exception ex)
                        {
                            Console.WriteLine("Data quality test error: " + ex.Message);
                            Environment.Exit(2);
                        }
                        return;
                    }
                    if (args[i] == "--run-internal-barcode-tests")
                    {
                        try
                        {
                            Services.DatabaseService.Initialize();
                            var res = Services.InternalBarcodeTestRunner.RunAllTests();
                            string json = Newtonsoft.Json.JsonConvert.SerializeObject(res, Newtonsoft.Json.Formatting.Indented);
                            Console.WriteLine(json);
                            System.IO.File.WriteAllText(System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "internal_barcode_test_output.json"), json);
                            Environment.Exit(res.Success ? 0 : 1);
                        }
                        catch (Exception ex)
                        {
                            Console.WriteLine("Internal barcode test error: " + ex.Message);
                            Environment.Exit(2);
                        }
                        return;
                    }
                    if (args[i] == "--run-sales-completion-tests")
                    {
                        try
                        {
                            var res = Services.SalesCompletionTestRunner.RunAllTests();
                            string json = Newtonsoft.Json.JsonConvert.SerializeObject(res, Newtonsoft.Json.Formatting.Indented);
                            Console.WriteLine(json);
                            System.IO.File.WriteAllText(System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "sales_completion_test_output.json"), json);
                            Environment.Exit(res.Success ? 0 : 1);
                        }
                        catch (Exception ex)
                        {
                            Console.WriteLine("Test error: " + ex.Message);
                            Environment.Exit(2);
                        }
                        return;
                    }
                    if (args[i] == "--run-inventory-tests")
                    {
                        try
                        {
                            var res = Services.InventoryTestRunner.RunAllTests();
                            string json = Newtonsoft.Json.JsonConvert.SerializeObject(res, Newtonsoft.Json.Formatting.Indented);
                            Console.WriteLine(json);
                            System.IO.File.WriteAllText(System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "inventory_test_output.json"), json);
                            Environment.Exit(res.Success ? 0 : 1);
                        }
                        catch (Exception ex)
                        {
                            Console.WriteLine("Inventory test error: " + ex.ToString());
                            Environment.Exit(2);
                        }
                        return;
                    }
                    if (args[i] == "--run-purchases-tests")
                    {
                        try
                        {
                            var res = Services.PurchasesTestRunner.RunAllTests();
                            string json = Newtonsoft.Json.JsonConvert.SerializeObject(res, Newtonsoft.Json.Formatting.Indented);
                            Console.WriteLine(json);
                            System.IO.File.WriteAllText(System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "purchases_test_output.json"), json);
                            Environment.Exit(res.Success ? 0 : 1);
                        }
                        catch (Exception ex)
                        {
                            Console.WriteLine("Purchases test error: " + ex.ToString());
                            Environment.Exit(2);
                        }
                        return;
                    }
                    if (args[i] == "--run-batch-tests")
                    {
                        try
                        {
                            var res = Services.BatchTestRunner.RunAllTests();
                            string json = Newtonsoft.Json.JsonConvert.SerializeObject(res, Newtonsoft.Json.Formatting.Indented);
                            Console.WriteLine(json);
                            System.IO.File.WriteAllText(System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "batch_test_output.json"), json);
                            Environment.Exit(res.Success ? 0 : 1);
                        }
                        catch (Exception ex)
                        {
                            Console.WriteLine("Batch test error: " + ex.ToString());
                            Environment.Exit(2);
                        }
                        return;
                    }
                    if (args[i] == "--run-unit-tests")
                    {
                        try
                        {
                            var res = Services.ProductUnitTestRunner.RunAllTests();
                            string json = Newtonsoft.Json.JsonConvert.SerializeObject(res, Newtonsoft.Json.Formatting.Indented);
                            Console.WriteLine(json);
                            System.IO.File.WriteAllText(System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "unit_test_output.json"), json);
                            Environment.Exit(res.Success ? 0 : 1);
                        }
                        catch (Exception ex)
                        {
                            Console.WriteLine("Unit test error: " + ex.ToString());
                            Environment.Exit(2);
                        }
                        return;
                    }
                    if (args[i] == "--run-excel-tests")
                    {
                        try
                        {
                            Services.DatabaseService.Initialize();
                            var sw = System.Diagnostics.Stopwatch.StartNew();
                            var resProducts = Bridge.IpcDispatcher.Dispatch(new Bridge.BridgeRequest
                            {
                                Id = "test-exp-prod",
                                Action = "excel:exportProducts"
                            });
                            sw.Stop();
                            long prodMs = sw.ElapsedMilliseconds;

                            var swCust = System.Diagnostics.Stopwatch.StartNew();
                            var resCust = Bridge.IpcDispatcher.Dispatch(new Bridge.BridgeRequest
                            {
                                Id = "test-exp-cust",
                                Action = "excel:exportCustomers"
                            });
                            swCust.Stop();
                            long custMs = swCust.ElapsedMilliseconds;

                            var resTpl = Bridge.IpcDispatcher.Dispatch(new Bridge.BridgeRequest
                            {
                                Id = "test-tpl",
                                Action = "excel:getTemplate"
                            });

                            var resCustTpl = Bridge.IpcDispatcher.Dispatch(new Bridge.BridgeRequest
                            {
                                Id = "test-cust-tpl",
                                Action = "excel:getCustomerTemplate"
                            });

                            bool allSuccess = resProducts.Success && resCust.Success && resTpl.Success && resCustTpl.Success;
                            string summary = string.Format(
                                "Excel Tests: Success={0}, ExportProductsTime={1}ms, ExportCustomersTime={2}ms, ProductsSuccess={3}, CustomersSuccess={4}",
                                allSuccess, prodMs, custMs, resProducts.Success, resCust.Success
                            );
                            Console.WriteLine(summary);
                            System.IO.File.WriteAllText(System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "excel_test_output.txt"), summary);
                            Environment.Exit(allSuccess ? 0 : 1);
                        }
                        catch (Exception ex)
                        {
                            Console.WriteLine("Excel test error: " + ex.ToString());
                            Environment.Exit(2);
                        }
                        return;
                    }
                    if (args[i] == "--run-migration-tests")
                    {
                        try
                        {
                            var res = Services.MigrationTestRunner.RunAllTests();
                            string json = Newtonsoft.Json.JsonConvert.SerializeObject(res, Newtonsoft.Json.Formatting.Indented);
                            Console.WriteLine(json);
                            System.IO.File.WriteAllText(System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "migration_test_output.json"), json);
                            Environment.Exit(res.Success ? 0 : 1);
                        }
                        catch (Exception ex)
                        {
                            Console.WriteLine("Migration test error: " + ex.ToString());
                            Environment.Exit(2);
                        }
                        return;
                    }

                    if (args[i] == "--run-reports-tests")
                    {
                        try
                        {
                            var res = Services.ReportsAndClosingTestRunner.RunAllTests();
                            string json = Newtonsoft.Json.JsonConvert.SerializeObject(res, Newtonsoft.Json.Formatting.Indented);
                            Console.WriteLine(json);
                            System.IO.File.WriteAllText(System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "reports_test_output.json"), json);
                            Environment.Exit(res.Success ? 0 : 1);
                        }
                        catch (Exception ex)
                        {
                            Console.WriteLine("Reports test error: " + ex.ToString());
                            Environment.Exit(2);
                        }
                        return;
                    }

#if DEBUG
                    if (args[i] == "--demo-error" || args[i] == "--test-error")
                    {
                        isDemoError = true;
                        break;
                    }
#endif
                }
            }

            const string mutexName = "RafiqPOS_SingleInstance_AppMutex";
            bool createdNew;

            _singleInstanceMutex = new Mutex(true, mutexName, out createdNew);

            Logger.Info(string.Format("فحص تشغيل نسخة وحيدة: createdNew={0}", createdNew));

            // Prevent running multiple instances on same data file (Feature #126 / Task 126-1)
            // If already open, activate and bring the running instance to the front without showing confusing dialogs
            if (!createdNew && !isDemoError)
            {
                Logger.Warn("تم إنهاء هذا المسار لأن التطبيق يعمل بالفعل في نافذة أخرى.");
                BringExistingInstanceToFront();
                return;
            }

            // Global Unhandled Exception Handling (Feature #111 / Task 111-2)
            Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
            Application.ThreadException += Application_ThreadException;
            AppDomain.CurrentDomain.UnhandledException += CurrentDomain_UnhandledException;

            Logger.Info("تم بدء تشغيل نظام رفيق POS بنجاح.");

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            try
            {
                Application.Run(new MainForm(isDemoError));
            }
            catch (Exception ex)
            {
                Logger.Error("استثناء غير متوقع أثناء تشغيل واجهة التطبيق الرئيسية", ex);
                ShowFriendlyErrorDialog(ex, true);
            }
            finally
            {
                Logger.Info("تم إغلاق نظام رفيق POS.");
                if (_singleInstanceMutex != null)
                {
                    try
                    {
                        _singleInstanceMutex.ReleaseMutex();
                    }
                    catch
                    {
                    }
                    _singleInstanceMutex.Dispose();
                    _singleInstanceMutex = null;
                }
            }
        }

        private static void BringExistingInstanceToFront()
        {
            try
            {
                Process current = Process.GetCurrentProcess();
                Process[] processes = Process.GetProcessesByName(current.ProcessName);
                for (int i = 0; i < processes.Length; i++)
                {
                    Process p = processes[i];
                    if (p.Id != current.Id && p.MainWindowHandle != IntPtr.Zero)
                    {
                        WindowHelper.ForceForeground(p.MainWindowHandle);
                        return;
                    }
                }
            }
            catch
            {
                // Fallback to notification only if window activation cannot be completed
                MessageBox.Show(
                    "برنامج رفيق POS قيد التشغيل بالفعل على هذا الجهاز في نافذة أخرى.",
                    "رفيق POS",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information
                );
            }
        }

        private static void Application_ThreadException(object sender, ThreadExceptionEventArgs e)
        {
            Logger.Error("استثناء غير معالج في خيط الواجهة (UI Thread)", e.Exception);
            ShowFriendlyErrorDialog(e.Exception, false);
        }

        private static void CurrentDomain_UnhandledException(object sender, UnhandledExceptionEventArgs e)
        {
            Exception ex = e.ExceptionObject as Exception;
            Logger.Error("استثناء حرج غير معالج في نطاق التطبيق (AppDomain)", ex);
            ShowFriendlyErrorDialog(ex, e.IsTerminating);
        }

        private static void ShowFriendlyErrorDialog(Exception ex, bool isFatal)
        {
            string errorDetails = ex != null ? ex.Message : "خطأ غير محدد";
            string msg = string.Format(
                "حدث تنبيه غير متوقع أثناء المعالجة.\n\n" +
                "التفاصيل: {0}\n\n" +
                "• تم حفظ السجلات بأمان لحماية بيانات المحل من التلف.\n" +
                "• يمكنك استخراج حزمة معلومات الدعم من شاشة الإعدادات لمساعدتنا في حل المشكلة.\n\n" +
                "{1}",
                errorDetails,
                isFatal ? "سيتم إغلاق البرنامج للحفاظ على سلامة ملف البيانات." : "يمكنك متابعة العمل بشكل طبيعي."
            );

            MessageBox.Show(
                msg,
                "تنبيه النظام — رفيق POS",
                MessageBoxButtons.OK,
                isFatal ? MessageBoxIcon.Error : MessageBoxIcon.Warning
            );
        }
    }
}
