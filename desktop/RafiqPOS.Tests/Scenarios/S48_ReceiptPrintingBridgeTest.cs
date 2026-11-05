using System;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using RafiqPOS.Bridge;
using RafiqPOS.Common;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// printer:printReceipt عبر البوابة الحقيقية: الفاتورة تُحمّل من قاعدة البيانات بواسطة saleId ولا يُوثق بالمبالغ القادمة من العميل،
    /// الكائن الكامل مقبول فقط للشيك المبدئي وفواتير التدريب، الفاتورة الفارغة أو السالبة تُرفض، وعلامة الأصل/النسخة
    /// (RECEIPT_PRINTED / sale_reprint) تُحدد وتُسجل في الخادم باسم مستخدم الجلسة بعد نجاح الطباعة فقط.
    /// الطابعة طابعة شبكية وهمية على 127.0.0.1 تلتقط البايتات.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S48_ReceiptPrintingBridgeTest : S48_ReceiptPrintFixtureBase
    {
        private BridgeResponse PrintById(string saleId)
        {
            return Dispatch("printer:printReceipt", new { saleId = saleId, printerName = Fake.Target });
        }

        private static JObject ForgedLines()
        {
            return JObject.Parse("{\"productName\":\"forged\",\"quantityMilli\":1000,\"unitPricePiasters\":1,\"totalPiasters\":1}");
        }

        // ---------- stored sale printed by id ----------

        [Test]
        public void PrintReceipt_SaleIdOnly_PrintsTheStoredSale_WithCustomerLoadedFromTheDatabase()
        {
            Sale created = CreateStoredSale("Customer Alpha", 3000, 5000);
            LoginAs(OwnerId);
            Sale stored = LoadSale(created.Id);
            Assert.AreEqual("Customer Alpha", stored.CustomerName, "the join loads the customer name");
            Assert.IsFalse(string.IsNullOrWhiteSpace(stored.CustomerPhone), "the join loads the customer phone");

            BridgeResponse res = PrintById(created.Id);

            Assert.IsTrue(res.Success, Describe(res));
            byte[] sent = Fake.WaitForJob(0);
            AssertBytesEqual(ExpectedSaleBytes(stored, false, false), sent, "the printer received the stored sale");

            Sale withoutCustomer = LoadSale(created.Id);
            withoutCustomer.CustomerName = null;
            withoutCustomer.CustomerPhone = null;
            Assert.IsFalse(BytesEqual(ExpectedSaleBytes(withoutCustomer, false, false), sent), "the customer line is part of the printed receipt");
        }

        [Test]
        public void PrintReceipt_OpenDrawerFlag_IsHonoredForAStoredSale()
        {
            Sale created = CreateStoredSale(null, 1000, 5000);
            LoginAs(OwnerId);

            BridgeResponse res = Dispatch("printer:printReceipt", new { saleId = created.Id, printerName = Fake.Target, openDrawer = true });

            Assert.IsTrue(res.Success, Describe(res));
            byte[] sent = Fake.WaitForJob(0);
            AssertDrawerKick(sent, "drawer requested");
            AssertBytesEqual(ExpectedSaleBytes(LoadSale(created.Id), false, true), sent, "receipt with drawer pulse");
        }

        [Test]
        public void PrintReceipt_UnknownSaleId_IsSaleNotFound()
        {
            LoginAs(OwnerId);

            BridgeResponse res = PrintById("sale_does_not_exist");

            Assert.IsFalse(res.Success);
            Assert.AreEqual("SALE_NOT_FOUND", ErrorCode(res), Describe(res));
            Assert.AreEqual(0, Fake.JobCount, "nothing may reach the printer");
        }

        [Test]
        public void PrintReceipt_NoSession_IsAuthRequired_AndNothingIsPrinted()
        {
            Sale created = CreateStoredSale(null, 1000, 5000);
            Logout();

            BridgeResponse res = PrintById(created.Id);

            Assert.IsFalse(res.Success);
            Assert.AreEqual("AUTH_REQUIRED", ErrorCode(res), Describe(res));
            Assert.AreEqual(0, Fake.JobCount);
            Assert.AreEqual(0, CountAnyPrintAudit());
        }

        [Test]
        public void PrintReceipt_NullPayload_IsInvalidPayload()
        {
            LoginAs(OwnerId);

            BridgeResponse res = Dispatch("printer:printReceipt", null);

            Assert.IsFalse(res.Success);
            Assert.AreEqual("INVALID_PAYLOAD", ErrorCode(res), Describe(res));
            Assert.AreEqual(0, Fake.JobCount);
        }

        // ---------- empty / invalid input never yields a blank receipt ----------

        [TestCase("{}")]
        [TestCase("{\"saleId\":null}")]
        [TestCase("{\"saleId\":\"   \"}")]
        [TestCase("{\"sale\":null}")]
        [TestCase("{\"sale\":{}}")]
        [TestCase("{\"sale\":{\"items\":[]}}")]
        [TestCase("{\"sale\":\"not an object\"}")]
        [TestCase("{\"totalPiasters\":5000}")]
        public void PrintReceipt_EmptyOrUnidentifiablePayload_IsInvalidSale(string payloadJson)
        {
            LoginAs(OwnerId);
            JObject payload = JObject.Parse(payloadJson);
            payload["printerName"] = Fake.Target;

            BridgeResponse res = Dispatch("printer:printReceipt", payload);

            Assert.IsFalse(res.Success, "a payload without a sale must not print: " + payloadJson);
            Assert.AreEqual("INVALID_SALE", ErrorCode(res), Describe(res));
            Assert.AreEqual(0, Fake.JobCount, "nothing may reach the printer");
        }

        [Test]
        public void PrintReceipt_StoredSaleWithoutItems_IsInvalidSale_NeverABlankReceipt()
        {
            Sale created = CreateStoredSale(null, 1000, 5000);
            Execute("DELETE FROM sale_items WHERE sale_id = @s;", "@s", created.Id);
            LoginAs(OwnerId);

            BridgeResponse res = PrintById(created.Id);

            Assert.IsFalse(res.Success, "a saleId-only payload must never print an empty receipt");
            Assert.AreEqual("INVALID_SALE", ErrorCode(res), Describe(res));
            Assert.AreEqual(0, Fake.JobCount);
            Assert.AreEqual(0, CountAnyPrintAudit(), "no marker for a print that never happened");
        }

        [TestCase("negativeSaleTotal")]
        [TestCase("negativeSubtotal")]
        [TestCase("quantityZero")]
        [TestCase("quantityNegative")]
        [TestCase("negativeLineTotal")]
        [TestCase("negativeUnitPrice")]
        public void PrintReceipt_StoredSaleWithInvalidNumbers_IsInvalidSale(string defect)
        {
            Sale created = CreateStoredSale(null, 1000, 5000);
            switch (defect)
            {
                case "negativeSaleTotal": Execute("UPDATE sales SET total_piasters = -100 WHERE id = @s;", "@s", created.Id); break;
                case "negativeSubtotal": Execute("UPDATE sales SET subtotal_piasters = -100 WHERE id = @s;", "@s", created.Id); break;
                case "quantityZero": Execute("UPDATE sale_items SET quantity_milli = 0 WHERE sale_id = @s;", "@s", created.Id); break;
                case "quantityNegative": Execute("UPDATE sale_items SET quantity_milli = -1000 WHERE sale_id = @s;", "@s", created.Id); break;
                case "negativeLineTotal": Execute("UPDATE sale_items SET total_piasters = -5000 WHERE sale_id = @s;", "@s", created.Id); break;
                case "negativeUnitPrice": Execute("UPDATE sale_items SET unit_price_piasters = -1 WHERE sale_id = @s;", "@s", created.Id); break;
                default: Assert.Fail("unknown defect " + defect); break;
            }
            LoginAs(OwnerId);

            BridgeResponse res = PrintById(created.Id);

            Assert.IsFalse(res.Success, defect);
            Assert.AreEqual("INVALID_SALE", ErrorCode(res), defect + ": " + Describe(res));
            Assert.AreEqual(0, Fake.JobCount, defect);
            Assert.AreEqual(0, CountAnyPrintAudit(), defect);
        }

        // ---------- full-object payloads ----------

        [TestCase(true)]
        [TestCase(false)]
        public void PrintReceipt_FullObjectWithARealId_IsReloadedFromTheDatabase_ForgedAmountsAreIgnored(bool wrapped)
        {
            Sale created = CreateStoredSale("Customer Beta", 3000, 5000);
            LoginAs(OwnerId);

            var forged = new JObject();
            forged["id"] = created.Id;
            forged["invoiceNumber"] = 999;
            forged["subtotalPiasters"] = 1;
            forged["totalPiasters"] = 1;
            forged["paidPiasters"] = 1;
            forged["customerName"] = "forged";
            forged["items"] = new JArray(ForgedLines());

            var payload = new JObject();
            payload["printerName"] = Fake.Target;
            if (wrapped)
            {
                payload["sale"] = forged;
            }
            else
            {
                foreach (JProperty p in forged.Properties()) payload[p.Name] = p.Value;
            }

            BridgeResponse res = Dispatch("printer:printReceipt", payload);

            Assert.IsTrue(res.Success, Describe(res));
            byte[] sent = Fake.WaitForJob(0);
            AssertBytesEqual(ExpectedSaleBytes(LoadSale(created.Id), false, false), sent, "the stored sale was printed");
            Assert.IsFalse(BytesEqual(ExpectedSaleBytes(forged.ToObject<Sale>(), false, false), sent), "the forged amounts were not printed");
            Assert.AreEqual(1, CountPrintAudit("sale", created.Id, "RECEIPT_PRINTED"), "the audit is for the real sale id");
        }

        [Test]
        public void PrintReceipt_FullObjectWithoutAnId_IsInvalidSale()
        {
            LoginAs(OwnerId);
            var sale = new JObject();
            sale["invoiceNumber"] = 5;
            sale["totalPiasters"] = 1;
            sale["items"] = new JArray(ForgedLines());
            var payload = new JObject();
            payload["sale"] = sale;
            payload["printerName"] = Fake.Target;

            BridgeResponse res = Dispatch("printer:printReceipt", payload);

            Assert.IsFalse(res.Success);
            Assert.AreEqual("INVALID_SALE", ErrorCode(res), Describe(res));
            Assert.AreEqual(0, Fake.JobCount);
        }

        [TestCase("sale_does_not_exist")]
        [TestCase("pre-bill")]
        public void PrintReceipt_FullObjectWithAnUnknownId_IsSaleNotFound(string id)
        {
            LoginAs(OwnerId);
            var sale = new JObject();
            sale["id"] = id;
            sale["totalPiasters"] = 1;
            sale["items"] = new JArray(ForgedLines());
            var payload = new JObject();
            payload["sale"] = sale;
            payload["printerName"] = Fake.Target;

            BridgeResponse res = Dispatch("printer:printReceipt", payload);

            Assert.IsFalse(res.Success, "only the exact id PRE-BILL is a transient bill: " + id);
            Assert.AreEqual("SALE_NOT_FOUND", ErrorCode(res), Describe(res));
            Assert.AreEqual(0, Fake.JobCount);
        }

        // ---------- transient sales: printed as sent, never recorded, never open the drawer ----------

        [TestCase("PRE-BILL", null)]
        [TestCase("anything", "TEST_PILOT")]
        [TestCase("anything", "test_pilot")]
        public void PrintReceipt_TransientSale_IsPrintedAsSent_WithoutAuditOrDrawer_AndNeverBecomesACopy(string id, string status)
        {
            LoginAs(OwnerId);
            var sale = new JObject();
            sale["id"] = id;
            if (status != null) sale["status"] = status;
            sale["invoiceNumber"] = 0;
            sale["createdAt"] = "2026-01-01T10:00:00";
            sale["paymentMethod"] = "cash";
            sale["subtotalPiasters"] = 5000;
            sale["totalPiasters"] = 5000;
            sale["paidPiasters"] = 5000;
            var line = new JObject();
            line["productName"] = "Bill item";
            line["quantityMilli"] = 1000;
            line["unitPricePiasters"] = 5000;
            line["totalPiasters"] = 5000;
            line["unit"] = "piece";
            sale["items"] = new JArray(line);
            var payload = new JObject();
            payload["sale"] = sale;
            payload["printerName"] = Fake.Target;
            payload["openDrawer"] = true;

            BridgeResponse first = Dispatch("printer:printReceipt", payload);
            BridgeResponse second = Dispatch("printer:printReceipt", payload);

            Assert.IsTrue(first.Success, Describe(first));
            Assert.IsTrue(second.Success, Describe(second));
            byte[] job0 = Fake.WaitForJob(0);
            byte[] job1 = Fake.WaitForJob(1);
            AssertNoDrawerKick(job0, "transient sales never open the drawer");
            AssertBytesEqual(ExpectedSaleBytes(sale.ToObject<Sale>(), false, false), job0, "the sale was printed as sent");
            AssertBytesEqual(job0, job1, "a second print of a transient sale is not a copy");
            Assert.AreEqual(0, CountAnyPrintAudit(), "transient sales write no audit marker");
        }

        // ---------- original / copy and audit ----------

        [Test]
        public void PrintReceipt_FirstPrintIsTheOriginal_LaterPrintsAreCopies_AuditedToTheSessionUser()
        {
            Sale created = CreateStoredSale("Customer Gamma", 2000, 5000);
            UserDto manager = CreateManager("receipt_mgr", ManagerPin);
            Sale stored = LoadSale(created.Id);
            Assert.AreEqual("usr_cashier_1", stored.CashierId, "the invoice cashier is not the session user below");

            // original
            LoginAs(OwnerId);
            BridgeResponse first = PrintById(created.Id);
            Assert.IsTrue(first.Success, Describe(first));
            byte[] original = Fake.WaitForJob(0);
            AssertBytesEqual(ExpectedSaleBytes(stored, false, false), original, "first print is the original");
            Assert.AreEqual(1, CountPrintAudit("sale", created.Id, "RECEIPT_PRINTED"));
            Assert.AreEqual(0, CountPrintAudit("sale", created.Id, "sale_reprint"));
            Assert.AreEqual(OwnerId, LastPrintAuditUser("sale", created.Id, "RECEIPT_PRINTED"), "attributed to the session user, not the invoice cashier");

            // copy, even though the client says it is not one
            BridgeResponse second = Dispatch("printer:printReceipt", new { saleId = created.Id, printerName = Fake.Target, isCopy = false });
            Assert.IsTrue(second.Success, Describe(second));
            byte[] copy = Fake.WaitForJob(1);
            AssertBytesEqual(ExpectedSaleBytes(stored, true, false), copy, "second print is a copy");
            Assert.IsFalse(BytesEqual(original, copy), "the copy carries the reprint badge");
            Assert.AreEqual(1, CountPrintAudit("sale", created.Id, "RECEIPT_PRINTED"), "still a single original marker");
            Assert.AreEqual(1, CountPrintAudit("sale", created.Id, "sale_reprint"));
            Assert.AreEqual(OwnerId, LastPrintAuditUser("sale", created.Id, "sale_reprint"));

            // another user reprints: the copy is attributed to that user
            Logout();
            LoginAs(manager.Id);
            BridgeResponse third = PrintById(created.Id);
            Assert.IsTrue(third.Success, Describe(third));
            Fake.WaitForJob(2);
            Assert.AreEqual(2, CountPrintAudit("sale", created.Id, "sale_reprint"));
            Assert.AreEqual(manager.Id, LastPrintAuditUser("sale", created.Id, "sale_reprint"));
            Assert.AreEqual(1, CountPrintAudit("sale", created.Id, "RECEIPT_PRINTED"));
        }

        [Test]
        public void PrintReceipt_ClientSaysCopy_OnANeverPrintedSale_IsACopy()
        {
            Sale created = CreateStoredSale(null, 1000, 5000);
            LoginAs(OwnerId);

            BridgeResponse res = Dispatch("printer:printReceipt", new { saleId = created.Id, printerName = Fake.Target, isCopy = true });

            Assert.IsTrue(res.Success, Describe(res));
            AssertBytesEqual(ExpectedSaleBytes(LoadSale(created.Id), true, false), Fake.WaitForJob(0), "printed as a copy");
            Assert.AreEqual(1, CountPrintAudit("sale", created.Id, "sale_reprint"));
            Assert.AreEqual(0, CountPrintAudit("sale", created.Id, "RECEIPT_PRINTED"));
            Assert.AreEqual(OwnerId, LastPrintAuditUser("sale", created.Id, "sale_reprint"));
        }

        [Test]
        public void PrintReceipt_FailedPrint_WritesNoMarker_SoTheNextSuccessfulPrintIsStillTheOriginal()
        {
            Sale created = CreateStoredSale(null, 1000, 5000);
            LoginAs(OwnerId);
            string offline = FakeNetworkPrinter.UnreachableTarget();

            BridgeResponse failed = Dispatch("printer:printReceipt", new { saleId = created.Id, printerName = offline });

            Assert.IsFalse(failed.Success, "an unreachable printer is a failure, never a silent success");
            Assert.AreEqual("PRINT_FAILED", ErrorCode(failed), Describe(failed));
            Assert.IsNotNull(failed.Error.Details);
            Assert.AreEqual(offline, (string)JObject.FromObject(failed.Error.Details)["printerUsed"]);
            Assert.AreEqual(0, CountAnyPrintAudit(), "no marker when nothing was printed");
            Assert.IsFalse(PrinterSvc.HasSaleReceiptBeenPrinted(created.Id));

            BridgeResponse ok = PrintById(created.Id);

            Assert.IsTrue(ok.Success, Describe(ok));
            AssertBytesEqual(ExpectedSaleBytes(LoadSale(created.Id), false, false), Fake.WaitForJob(0), "the first successful print is the original");
            Assert.AreEqual(1, CountPrintAudit("sale", created.Id, "RECEIPT_PRINTED"));
            Assert.AreEqual(0, CountPrintAudit("sale", created.Id, "sale_reprint"));
        }

        // ---------- audit actor ----------

        [Test]
        public void ResolveAuditActor_UsesTheSessionUser_AndFallsBackToTheInvoiceCashierOnlyWithoutASession()
        {
            string userId;
            string userName;

            Logout();
            PrinterService.ResolveAuditActor("usr_cashier_1", out userId, out userName);
            Assert.AreEqual("usr_cashier_1", userId, "no session: the invoice cashier");

            PrinterService.ResolveAuditActor(null, out userId, out userName);
            Assert.AreEqual("usr_admin_default", userId, "no session and no cashier: the default owner id");

            LoginAs(OwnerId);
            PrinterService.ResolveAuditActor("usr_cashier_1", out userId, out userName);
            Assert.AreEqual(OwnerId, userId, "a session user always wins over the invoice cashier");
            Assert.IsFalse(string.IsNullOrEmpty(userName));
        }

        // ---------- other printer commands go through ToPrintResponse ----------

        [Test]
        public void TestPrint_IsTrainingReceipt_NeverRecordedAsAnOriginalOrACopy()
        {
            LoginAs(OwnerId);

            BridgeResponse a = Dispatch("printer:test", new { printerName = Fake.Target });
            BridgeResponse b = Dispatch("printer:testPrint", new { printerName = Fake.Target });

            Assert.IsTrue(a.Success, Describe(a));
            Assert.IsTrue(b.Success, Describe(b));
            AssertNoDrawerKick(Fake.WaitForJob(0), "the test receipt never opens the drawer");
            Fake.WaitForJob(1);
            Assert.AreEqual(0, CountAnyPrintAudit(), "the TEST_PILOT receipt writes no print marker");
        }

        [Test]
        public void KickDrawerAndCutPaper_SendTheirExactCommands()
        {
            LoginAs(OwnerId);

            BridgeResponse kick = Dispatch("printer:kickDrawer", new { printerName = Fake.Target, pulseMs = 30, pin = 0 });
            BridgeResponse cut = Dispatch("printer:cutPaper", new { printerName = Fake.Target });

            Assert.IsTrue(kick.Success, Describe(kick));
            Assert.IsTrue(cut.Success, Describe(cut));
            AssertBytesEqual(RawPrinterHelper.GetDrawerKickPulse(30, 0), Fake.WaitForJob(0), "drawer pulse");
            AssertBytesEqual(RawPrinterHelper.PaperCutSequence, Fake.WaitForJob(1), "paper cut");
        }

        [TestCase("printer:test")]
        [TestCase("printer:testPrint")]
        [TestCase("printer:kickDrawer")]
        [TestCase("printer:cutPaper")]
        public void PrinterCommands_OnAnUnreachablePrinter_AreReportedAsPrintFailed(string action)
        {
            LoginAs(OwnerId);
            string offline = FakeNetworkPrinter.UnreachableTarget();

            BridgeResponse res = Dispatch(action, new { printerName = offline });

            Assert.IsFalse(res.Success, action);
            Assert.AreEqual("PRINT_FAILED", ErrorCode(res), action + ": " + Describe(res));
            Assert.IsNotNull(res.Error.Details, action);
            Assert.AreEqual(offline, (string)JObject.FromObject(res.Error.Details)["printerUsed"], action);
        }
    }
}
