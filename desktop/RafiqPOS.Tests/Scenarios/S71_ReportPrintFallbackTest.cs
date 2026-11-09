using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Text;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using RafiqPOS.Bridge;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// بدائل الطباعة: حفظ التقرير كملف ذرّي باسم فريد في مجلد ثابت يحدده الخادم، تنظيف الأسماء (لا اجتياز مسارات ولا أسماء ويندوز
    /// المحجوزة والعربية مقبولة)، حدود الامتداد والحجم، رفض بدون جلسة، وعند غياب الطابعة يعود رمز PRINTER_NOT_FOUND ويبقى الحفظ يعمل.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S71_ReportPrintFallbackTest : S44_UserHierarchyFixtureBase
    {
        private string _outDir;
        private FieldInfo _reportFilesField;

        private static readonly string[] ReservedNames = new string[]
        {
            "CON", "PRN", "AUX", "NUL", "COM1", "COM9", "LPT1", "LPT9"
        };

        [SetUp]
        public void ReportFilesSetUp()
        {
            _outDir = Path.Combine(Path.GetTempPath(), "rafiq_s71_reports_" + Guid.NewGuid().ToString("N"));
            _reportFilesField = typeof(IpcDispatcher).GetField("_reportFiles", BindingFlags.NonPublic | BindingFlags.Static);
            Assert.IsNotNull(_reportFilesField, "حقل خدمة الملفات غير موجود في IpcDispatcher");
            _reportFilesField.SetValue(null, new ReportFileService(_outDir));
        }

        [TearDown]
        public void ReportFilesTearDown()
        {
            _reportFilesField.SetValue(null, new ReportFileService(null));
            try { if (Directory.Exists(_outDir)) Directory.Delete(_outDir, true); }
            catch (IOException) { }
            catch (UnauthorizedAccessException) { }
        }

        private static byte[] Bytes(string text)
        {
            return Encoding.UTF8.GetBytes(text);
        }

        // ---------- the file service ----------

        [Test]
        public void Save_WritesAUniqueAtomicFile_InTheTargetFolder()
        {
            var service = new ReportFileService(_outDir);

            ReportSaveResult first = service.Save("تقرير النواقص", "pdf", Bytes("%PDF-1.4 first"));
            ReportSaveResult second = service.Save("تقرير النواقص", "pdf", Bytes("%PDF-1.4 second"));

            Assert.IsTrue(first.Success, first.Message);
            Assert.IsTrue(second.Success, second.Message);
            Assert.AreNotEqual(first.FilePath, second.FilePath, "نفس الاسم في نفس الثانية يجب ألا يدهس الملف الأول");
            Assert.AreEqual(Path.GetFullPath(_outDir), Path.GetDirectoryName(first.FilePath));
            StringAssert.StartsWith("تقرير النواقص_", first.FileName);
            StringAssert.EndsWith(".pdf", first.FileName);
            Assert.AreEqual("%PDF-1.4 first", File.ReadAllText(first.FilePath, Encoding.UTF8));
            Assert.AreEqual("%PDF-1.4 second", File.ReadAllText(second.FilePath, Encoding.UTF8));
            Assert.AreEqual(first.SizeBytes, new FileInfo(first.FilePath).Length);

            string[] leftovers = Directory.GetFiles(_outDir, "*.tmp");
            Assert.AreEqual(0, leftovers.Length, "لا يبقى ملف مؤقت بعد الحفظ الذري");
            Assert.AreEqual(2, Directory.GetFiles(_outDir).Length);
        }

        [Test]
        public void Save_SanitisesNames_NoTraversalNoReservedNamesArabicKept()
        {
            var service = new ReportFileService(_outDir);
            string[] hostile = new string[]
            {
                "..\\..\\Windows\\evil",
                "../../etc/passwd",
                "C:\\Windows\\System32\\x",
                "a/b:c*d?e\"f<g>h|i",
                "CON",
                "nul.txt",
                "LPT1",
                "   ...   ",
                "",
                null,
                "\u202Eتقرير\u202C",
                new string('ع', 400)
            };

            string folderFull = Path.GetFullPath(_outDir);
            for (int i = 0; i < hostile.Length; i++)
            {
                ReportSaveResult res = service.Save(hostile[i], "html", Bytes("<html></html>"));
                Assert.IsTrue(res.Success, "الاسم: " + hostile[i] + " => " + res.Message);
                Assert.AreEqual(folderFull, Path.GetDirectoryName(res.FilePath), "خرج الملف من المجلد: " + hostile[i]);
                Assert.IsTrue(File.Exists(res.FilePath));

                string withoutExt = Path.GetFileNameWithoutExtension(res.FileName);
                for (int r = 0; r < ReservedNames.Length; r++)
                {
                    Assert.AreNotEqual(ReservedNames[r], withoutExt.ToUpperInvariant(), "اسم محجوز: " + res.FileName);
                }
                Assert.AreEqual(-1, res.FileName.IndexOfAny(new char[] { '\\', '/', ':', '*', '?', '"', '<', '>', '|' }), res.FileName);
                Assert.IsFalse(res.FileName.StartsWith(".") || res.FileName.StartsWith(" "), res.FileName);
                Assert.IsTrue(res.FileName.Length <= 140, "اسم طويل جداً: " + res.FileName.Length);
            }

            Assert.AreEqual("تقرير", ReportFileService.SanitizeBaseName(""));
            Assert.AreEqual("تقرير", ReportFileService.SanitizeBaseName(null));
            Assert.AreEqual("كشف حساب أحمد", ReportFileService.SanitizeBaseName("كشف حساب أحمد"));
            StringAssert.StartsWith("تقرير_", ReportFileService.SanitizeBaseName("CON"));
            Assert.AreEqual(-1, ReportFileService.SanitizeBaseName("a\u200Fb").IndexOf('\u200F'));
        }

        [Test]
        public void Save_RefusesUnsafeExtensionsAndEmptyContent()
        {
            var service = new ReportFileService(_outDir);
            string[] bad = new string[] { "exe", "bat", "dll", "ps1", "pdf.exe", "", null, "..", "html/../x" };
            for (int i = 0; i < bad.Length; i++)
            {
                ReportSaveResult res = service.Save("تقرير", bad[i], Bytes("x"));
                Assert.IsFalse(res.Success, "الامتداد: " + bad[i]);
                Assert.AreEqual("INVALID_EXTENSION", res.ErrorCode);
            }

            Assert.AreEqual("EMPTY_CONTENT", service.Save("تقرير", "pdf", null).ErrorCode);
            Assert.AreEqual("EMPTY_CONTENT", service.Save("تقرير", "pdf", new byte[0]).ErrorCode);
            Assert.AreEqual("html", ReportFileService.NormalizeExtension(" .HTML "));
            Assert.IsFalse(Directory.Exists(_outDir), "الرفض لا ينشئ المجلد");
        }

        [Test]
        public void Save_WhenTheFolderCannotBeWritten_ReturnsAnArabicErrorInsteadOfThrowing()
        {
            Directory.CreateDirectory(_outDir);
            string blocker = Path.Combine(_outDir, "ملف_يحجب_المجلد");
            File.WriteAllText(blocker, "x");

            var service = new ReportFileService(Path.Combine(blocker, "Reports"));
            ReportSaveResult res = service.Save("تقرير", "pdf", Bytes("x"));

            Assert.IsFalse(res.Success);
            Assert.AreEqual("SAVE_FAILED", res.ErrorCode);
            StringAssert.Contains("تعذر حفظ الملف", res.Message);
            Assert.IsNull(res.FilePath);
        }

        // ---------- IPC gate and handlers ----------

        [Test]
        public void ReportActions_AreMapped_AndRefusedWithoutASession()
        {
            FieldInfo map = typeof(IpcDispatcher).GetField("ACTION_PERMISSIONS", BindingFlags.NonPublic | BindingFlags.Static);
            Assert.IsNotNull(map);
            var permissions = (Dictionary<string, string>)map.GetValue(null);
            string[] sessionActions = new string[] { "system:showPrintDialog", "report:getPrinterStatus", "report:savePdf", "report:saveFile", "report:openFolder" };
            for (int i = 0; i < sessionActions.Length; i++)
            {
                Assert.AreEqual("__session_required__", permissions[sessionActions[i]], sessionActions[i]);
            }
            Assert.AreEqual("pos.reprint", permissions["printer:saveReceiptImage"]);

            Logout();
            string[] all = new string[] { "system:showPrintDialog", "report:getPrinterStatus", "report:savePdf", "report:saveFile", "report:openFolder", "printer:saveReceiptImage" };
            for (int i = 0; i < all.Length; i++)
            {
                var res = Dispatch(all[i], new { reportName = "x", extension = "html", content = "x", saleId = "x" });
                Assert.IsFalse(res.Success, all[i]);
                Assert.AreEqual("AUTH_REQUIRED", ErrorCode(res), all[i] + ": " + Describe(res));
            }
            Assert.IsFalse(Directory.Exists(_outDir), "لا يُكتب شيء بدون جلسة");
        }

        [Test]
        public void SaveFile_ForACashier_WritesIntoTheFixedFolder_AndIgnoresAnyPathFromTheUi()
        {
            var cashier = CreateCashierBy(OwnerId, "cash_s71");
            LoginAs(cashier.Id);

            string elsewhere = Path.Combine(Path.GetTempPath(), "rafiq_s71_elsewhere_" + Guid.NewGuid().ToString("N"));
            var res = Dispatch("report:saveFile", new
            {
                reportName = "كشف حساب ../../x",
                extension = "html",
                content = "<html><body>تقرير عربي</body></html>",
                folder = elsewhere,
                path = elsewhere,
                targetFolder = elsewhere
            });

            Assert.IsTrue(res.Success, Describe(res));
            JObject data = JObject.FromObject(res.Data);
            string savedPath = (string)data["path"];
            Assert.AreEqual(Path.GetFullPath(_outDir), Path.GetDirectoryName(savedPath));
            Assert.IsFalse(Directory.Exists(elsewhere), "الواجهة لا تحدد المجلد");

            byte[] raw = File.ReadAllBytes(savedPath);
            Assert.AreEqual(new byte[] { 0xEF, 0xBB, 0xBF }, new byte[] { raw[0], raw[1], raw[2] }, "BOM لتظهر العربية صحيحة");
            StringAssert.Contains("تقرير عربي", Encoding.UTF8.GetString(raw));
        }

        [Test]
        public void SaveFile_RejectsBadPayloads_WithClearCodes()
        {
            LoginAs(OwnerId);

            Assert.AreEqual("INVALID_PAYLOAD", ErrorCode(Dispatch("report:saveFile", null)));
            Assert.AreEqual("INVALID_EXTENSION", ErrorCode(Dispatch("report:saveFile", new { reportName = "x", extension = "exe", content = "x" })));
            Assert.AreEqual("EMPTY_CONTENT", ErrorCode(Dispatch("report:saveFile", new { reportName = "x", extension = "html", content = "" })));
            Assert.AreEqual("INVALID_PAYLOAD", ErrorCode(Dispatch("report:saveFile", new { reportName = "x", extension = "png", base64 = "###" })));
            Assert.IsFalse(Directory.Exists(_outDir));

            var png = Dispatch("report:saveFile", new { reportName = "إيصال", extension = "png", base64 = Convert.ToBase64String(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }) });
            Assert.IsTrue(png.Success, Describe(png));
        }

        [Test]
        public void SavePdf_WithoutTheMainWindow_FailsCleanly_AndOpenFolderNeedsAnExistingFolder()
        {
            LoginAs(OwnerId);

            var pdf = Dispatch("report:savePdf", new { reportName = "تقرير" });
            Assert.IsFalse(pdf.Success);
            Assert.AreEqual("MAIN_FORM_NOT_READY", ErrorCode(pdf));

            var open = Dispatch("report:openFolder", null);
            Assert.IsFalse(open.Success);
            Assert.AreEqual("FOLDER_NOT_FOUND", ErrorCode(open));
            Assert.IsFalse(Directory.Exists(_outDir));
        }

        [Test]
        public void SaveReceiptImage_RequiresASaleId()
        {
            LoginAs(OwnerId);
            Assert.AreEqual("INVALID_PAYLOAD", ErrorCode(Dispatch("printer:saveReceiptImage", null)));
            Assert.AreEqual("INVALID_PAYLOAD", ErrorCode(Dispatch("printer:saveReceiptImage", new { saleId = "  " })));
        }

        // ---------- printer resolution ----------

        [Test]
        public void PrinterResolver_NeverReplacesAnExplicitPrinter_ButFallsBackFromAStaleSetting()
        {
            var installed = new List<string> { "POS-80", "Microsoft Print to PDF" };

            PrinterResolution explicitMissing = PrinterNameResolver.Resolve("Old Printer", "POS-80", installed, "POS-80");
            Assert.IsTrue(explicitMissing.NotFound);
            Assert.AreEqual("Old Printer", explicitMissing.Name);
            Assert.IsFalse(explicitMissing.FellBack);

            PrinterResolution stale = PrinterNameResolver.Resolve(null, "Removed Printer", installed, "POS-80");
            Assert.IsFalse(stale.NotFound);
            Assert.IsTrue(stale.FellBack);
            Assert.AreEqual("POS-80", stale.Name);

            PrinterResolution configured = PrinterNameResolver.Resolve("", "pos-80", installed, "Microsoft Print to PDF");
            Assert.AreEqual("pos-80", configured.Name);
            Assert.IsFalse(configured.FellBack);

            PrinterResolution network = PrinterNameResolver.Resolve("192.168.1.50:9100", null, new List<string>(), "");
            Assert.IsFalse(network.NotFound);

            PrinterResolution none = PrinterNameResolver.Resolve(null, "Removed Printer", new List<string>(), "");
            Assert.IsTrue(none.NotFound);
            PrinterResolution nothingAtAll = PrinterNameResolver.Resolve(null, null, new List<string>(), null);
            Assert.IsTrue(nothingAtAll.NotFound);
            Assert.AreEqual("", nothingAtAll.Name);
        }

        [Test]
        public void PrinterResolver_FileWriterPrintersAreNotCountedAsRealPrinters()
        {
            Assert.IsTrue(PrinterNameResolver.IsVirtualPrinter("Microsoft XPS Document Writer"));
            Assert.IsTrue(PrinterNameResolver.IsVirtualPrinter("Microsoft Print to PDF"));
            Assert.IsTrue(PrinterNameResolver.IsVirtualPrinter("Fax"));
            Assert.IsFalse(PrinterNameResolver.IsVirtualPrinter("POS-80 Thermal Printer"));
            Assert.IsFalse(PrinterNameResolver.IsVirtualPrinter(""));

            Assert.AreEqual(0, PrinterNameResolver.CountRealPrinters(new List<string> { "Microsoft XPS Document Writer", "Fax" }));
            Assert.AreEqual(1, PrinterNameResolver.CountRealPrinters(new List<string> { "Microsoft XPS Document Writer", "Xprinter XP-80", "" }));
            Assert.AreEqual(0, PrinterNameResolver.CountRealPrinters(null));
        }

        // ---------- printer not found: clear code, and the save fallback still works ----------

        [Test]
        public void PrinterNotFound_ReturnsTheErrorCode_AndSavingStillWorks()
        {
            var printer = new PrinterService(new SettingsService(SettingsRepo, AuditRepo));

            PrintResult test = printer.PrintTestReceipt("NO_SUCH_PRINTER_S71_XYZ", "80mm");
            Assert.IsFalse(test.Success);
            Assert.AreEqual("PRINTER_NOT_FOUND", test.ErrorCode);
            StringAssert.Contains("NO_SUCH_PRINTER_S71_XYZ", test.Message);
            StringAssert.Contains("غير", test.Message);

            PrintResult closing = printer.PrintDailyClosingReport(new DailyClosing(), "NO_SUCH_PRINTER_S71_XYZ", "80mm");
            Assert.IsFalse(closing.Success);
            Assert.AreEqual("PRINTER_NOT_FOUND", closing.ErrorCode);
            StringAssert.Contains("محفوظ", closing.Message);

            ReportSaveResult saved = new ReportFileService(_outDir).Save("إقفال اليومية", "pdf", Bytes("%PDF-1.4"));
            Assert.IsTrue(saved.Success, saved.Message);
            Assert.IsTrue(File.Exists(saved.FilePath));
        }

        [Test]
        public void PrinterStatus_FlagsAConfiguredPrinterThatIsNotInstalled()
        {
            SettingsRepo.Set("default_printer_name", "NO_SUCH_PRINTER_S71_XYZ");
            var printer = new PrinterService(new SettingsService(SettingsRepo, AuditRepo));

            PrinterStatusInfo status = printer.GetPrinterStatus();
            Assert.AreEqual("NO_SUCH_PRINTER_S71_XYZ", status.ConfiguredPrinter);
            Assert.IsFalse(status.ConfiguredFound);
        }
    }
}
