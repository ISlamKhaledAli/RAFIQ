using System;
using System.Collections.Generic;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Threading;
using NUnit.Framework;
using RafiqPOS.Common;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// طابعة شبكية وهمية على 127.0.0.1 (نفس مسار TCP 9100 الحقيقي في RawPrinterHelper): تلتقط البايتات المرسلة لكل مهمة طباعة،
    /// فتُقارن الإيصالات بالبايتات المتوقعة بدل الاعتماد على طابعة حقيقية. لا مهلات نوم: الانتظار بإشارة Monitor.
    /// </summary>
    public sealed class FakeNetworkPrinter : IDisposable
    {
        private readonly TcpListener _listener;
        private readonly Thread _thread;
        private readonly object _sync = new object();
        private readonly List<byte[]> _jobs = new List<byte[]>();

        public FakeNetworkPrinter()
        {
            _listener = new TcpListener(IPAddress.Loopback, 0);
            _listener.Start();
            Port = ((IPEndPoint)_listener.LocalEndpoint).Port;
            _thread = new Thread(AcceptLoop);
            _thread.IsBackground = true;
            _thread.Start();
        }

        public int Port { get; private set; }

        /// <summary>اسم الطابعة بالصيغة التي يتعرف عليها RawPrinterHelper.IsNetworkPrinter</summary>
        public string Target
        {
            get { return "127.0.0.1:" + Port.ToString(CultureInfo.InvariantCulture); }
        }

        public int JobCount
        {
            get
            {
                lock (_sync) { return _jobs.Count; }
            }
        }

        /// <summary>عنوان على الجهاز نفسه لا يستمع عليه أحد: الاتصال به يفشل دائماً (طابعة غير متصلة)</summary>
        public static string UnreachableTarget()
        {
            var probe = new TcpListener(IPAddress.Loopback, 0);
            probe.Start();
            int port = ((IPEndPoint)probe.LocalEndpoint).Port;
            probe.Stop();
            return "127.0.0.1:" + port.ToString(CultureInfo.InvariantCulture);
        }

        private void AcceptLoop()
        {
            while (true)
            {
                TcpClient client;
                try
                {
                    client = _listener.AcceptTcpClient();
                }
                catch (Exception)
                {
                    return;
                }

                var received = new MemoryStream();
                try
                {
                    using (client)
                    using (NetworkStream stream = client.GetStream())
                    {
                        client.ReceiveTimeout = 10000;
                        byte[] buffer = new byte[16384];
                        int n;
                        while ((n = stream.Read(buffer, 0, buffer.Length)) > 0)
                        {
                            received.Write(buffer, 0, n);
                        }
                    }
                }
                catch (Exception)
                {
                    // keep whatever arrived before the connection broke
                }

                lock (_sync)
                {
                    _jobs.Add(received.ToArray());
                    Monitor.PulseAll(_sync);
                }
            }
        }

        /// <summary>يعيد بايتات المهمة رقم index (من 0) بعد وصولها كاملة؛ يفشل الاختبار إن لم تصل خلال 10 ثوانٍ</summary>
        public byte[] WaitForJob(int index)
        {
            lock (_sync)
            {
                DateTime deadline = DateTime.UtcNow.AddSeconds(10);
                while (_jobs.Count <= index)
                {
                    TimeSpan left = deadline - DateTime.UtcNow;
                    if (left <= TimeSpan.Zero || !Monitor.Wait(_sync, left))
                    {
                        Assert.Fail("لم تصل مهمة الطباعة رقم " + index + " إلى الطابعة الوهمية");
                    }
                }
                return _jobs[index];
            }
        }

        public void Dispose()
        {
            try { _listener.Stop(); } catch (Exception) { }
            try { _thread.Join(2000); } catch (Exception) { }
        }
    }

    /// <summary>
    /// قاعدة اختبارات طباعة الإيصالات: قاعدة بيانات معزولة بكل الهجرات، جلسة المستخدم والبوابة الحقيقية (S44)،
    /// وخدمة الطباعة الحقيقية موصولة بطابعة شبكية وهمية. الحقول الثابتة في DatabaseService (setter خاص) تُضبط بالانعكاس وتُصفَّر بعد كل اختبار.
    /// </summary>
    public abstract class S48_ReceiptPrintFixtureBase : S44_UserHierarchyFixtureBase
    {
        protected PrinterService PrinterSvc;
        protected FakeNetworkPrinter Fake;
        protected Shift StoreShift;

        private static readonly string[] StaticsSetByThisFixture = new string[] { "Printer", "Audit", "HeldSaleRepo", "Returns" };

        [SetUp]
        public void ReceiptPrintSetUp()
        {
            PrinterSvc = new PrinterService(DatabaseService.Settings);
            SetDatabaseServiceStatic("Printer", PrinterSvc);
            SetDatabaseServiceStatic("Audit", new AuditLogService(AuditRepo));
            SetDatabaseServiceStatic("HeldSaleRepo", HeldRepo);
            SetDatabaseServiceStatic("Returns", ReturnService);
            Fake = new FakeNetworkPrinter();
            StoreShift = null;
        }

        [TearDown]
        public override void BaseTearDown()
        {
            if (Fake != null)
            {
                Fake.Dispose();
                Fake = null;
            }
            for (int i = 0; i < StaticsSetByThisFixture.Length; i++)
            {
                SetDatabaseServiceStatic(StaticsSetByThisFixture[i], null);
            }
            base.BaseTearDown();
        }

        private static void SetDatabaseServiceStatic(string propertyName, object value)
        {
            PropertyInfo property = typeof(DatabaseService).GetProperty(propertyName, BindingFlags.Public | BindingFlags.Static);
            Assert.IsNotNull(property, "DatabaseService." + propertyName + " was renamed or removed");
            MethodInfo setter = property.GetSetMethod(true);
            Assert.IsNotNull(setter, "DatabaseService." + propertyName + " has no setter");
            setter.Invoke(null, new object[] { value });
        }

        // ---------- data builders ----------

        /// <summary>فاتورة نقدية حقيقية في قاعدة الاختبار (كاشير الوردية usr_cashier_1، وعميل مسجّل عند طلبه)</summary>
        protected Sale CreateStoredSale(string customerName, long quantityMilli, long unitPricePiasters)
        {
            if (StoreShift == null)
            {
                StoreShift = OpenTestShift("usr_cashier_1", "كاشير 1", 100000);
            }
            Product product = CreateTestProduct("صنف إيصال " + Guid.NewGuid().ToString("N").Substring(0, 6), unitPricePiasters, unitPricePiasters / 2, 1000000);
            Customer customer = customerName != null ? CreateTestCustomer(customerName) : null;
            long total = Money.FromPiasters(unitPricePiasters).MultiplyByMilliUnits(quantityMilli).Piasters;

            Sale sale = SaleService.ProcessSale(new Sale
            {
                ShiftId = StoreShift.Id,
                CashierId = StoreShift.CashierId,
                CashierName = StoreShift.CashierName,
                CustomerId = customer != null ? customer.Id : null,
                PaymentMethod = "cash",
                PaidPiasters = total,
                Items = new List<SaleItem>
                {
                    new SaleItem { ProductId = product.Id, ProductName = product.Name, QuantityMilli = quantityMilli, UnitPricePiasters = unitPricePiasters, TotalPiasters = total }
                }
            }, null);
            Assert.AreEqual(total, sale.TotalPiasters, "fixture sale total");
            return sale;
        }

        protected Sale LoadSale(string saleId)
        {
            Sale sale = SaleRepo.GetSaleById(saleId);
            Assert.IsNotNull(sale, "sale " + saleId + " is not in the database");
            return sale;
        }

        // ---------- audit ----------

        protected long CountPrintAudit(string entityType, string entityId, string action)
        {
            return Scalar("SELECT COUNT(*) FROM audit_logs WHERE action = @a AND entity_type = @t AND entity_id = @e;",
                "@a", action, "@t", entityType, "@e", entityId);
        }

        protected string LastPrintAuditUser(string entityType, string entityId, string action)
        {
            return ScalarText("SELECT user_id FROM audit_logs WHERE action = @a AND entity_type = @t AND entity_id = @e ORDER BY rowid DESC LIMIT 1;",
                "@a", action, "@t", entityType, "@e", entityId);
        }

        protected long CountAnyPrintAudit()
        {
            return Scalar("SELECT COUNT(*) FROM audit_logs WHERE action IN ('RECEIPT_PRINTED', 'sale_reprint', 'return_reprint');");
        }

        // ---------- expected bytes (what the printer must receive) ----------

        /// <summary>صورة الإيصال المخزنة كما تُرسل للطابعة الشبكية: 80mm، قص تلقائي، نبضة الدرج حسب الطلب</summary>
        protected byte[] ExpectedSaleBytes(Sale sale, bool isCopy, bool kickDrawer)
        {
            using (Bitmap bitmap = PrinterSvc.RenderReceiptToBitmap(sale, null, isCopy))
            {
                Assert.LessOrEqual(bitmap.Height, 8192, "the fixture receipt must stay on the single-image path");
                return RawPrinterHelper.ConvertBitmapToEscPosRaster(bitmap, kickDrawer, true, 30, 0);
            }
        }

        protected byte[] ExpectedReturnBytes(Return returnObj, bool isCopy, bool kickDrawer)
        {
            using (Bitmap bitmap = PrinterSvc.RenderReturnReceiptToBitmap(returnObj, PrinterService.GetContentWidthPoints("80mm"), isCopy))
            {
                Assert.LessOrEqual(bitmap.Height, 8192, "the fixture receipt must stay on the single-image path");
                return RawPrinterHelper.ConvertBitmapToEscPosRaster(bitmap, kickDrawer, true, 30, 0);
            }
        }

        protected static bool BytesEqual(byte[] a, byte[] b)
        {
            if (a == null || b == null) return a == b;
            if (a.Length != b.Length) return false;
            for (int i = 0; i < a.Length; i++)
            {
                if (a[i] != b[i]) return false;
            }
            return true;
        }

        protected static void AssertBytesEqual(byte[] expected, byte[] actual, string message)
        {
            Assert.IsNotNull(actual, message);
            if (expected.Length != actual.Length)
            {
                Assert.Fail(string.Format("{0}: expected {1} bytes, printer got {2}", message, expected.Length, actual.Length));
            }
            for (int i = 0; i < expected.Length; i++)
            {
                if (expected[i] != actual[i])
                {
                    Assert.Fail(string.Format("{0}: first difference at byte {1} (expected 0x{2:X2}, got 0x{3:X2})", message, i, expected[i], actual[i]));
                }
            }
        }

        /// <summary>ESC @ ثم ESC a 1 مباشرة: لم تُرسل نبضة فتح الدرج</summary>
        protected static void AssertNoDrawerKick(byte[] job, string message)
        {
            Assert.GreaterOrEqual(job.Length, 5, message);
            Assert.AreEqual(0x1B, job[0], message);
            Assert.AreEqual(0x40, job[1], message);
            Assert.AreEqual(0x1B, job[2], message + ": ESC after init");
            Assert.AreEqual(0x61, job[3], message + ": expected ESC a (alignment), not a drawer pulse");
        }

        /// <summary>ESC @ ثم ESC p (نبضة الدرج القياسية 30ms على الدبوس 0) قبل المحاذاة</summary>
        protected static void AssertDrawerKick(byte[] job, string message)
        {
            byte[] pulse = RawPrinterHelper.GetDrawerKickPulse(30, 0);
            Assert.GreaterOrEqual(job.Length, 2 + pulse.Length, message);
            Assert.AreEqual(0x1B, job[0], message);
            Assert.AreEqual(0x40, job[1], message);
            for (int i = 0; i < pulse.Length; i++)
            {
                Assert.AreEqual(pulse[i], job[2 + i], message + ": drawer pulse byte " + i);
            }
        }
    }
}
