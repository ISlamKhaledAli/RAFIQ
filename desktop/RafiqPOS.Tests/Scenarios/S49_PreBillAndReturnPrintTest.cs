using System;
using System.Collections.Generic;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using RafiqPOS.Bridge;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// الشيك المبدئي للطاولة (PrintTablePreBill: حالة الطاولة تتحول إلى bill_printed بعد نجاح الطباعة فقط) وإيصال المرتجع
    /// (الدرج لا يُفتح إلا لرد نقدي، والمرتجع المخزن يُعاد تحميله من قاعدة البيانات، والطباعة الفاشلة PRINT_FAILED).
    /// الطابعة طابعة شبكية وهمية على 127.0.0.1 تلتقط البايتات.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S49_PreBillAndReturnPrintTest : S48_ReceiptPrintFixtureBase
    {
        // ------------------------------------------------------------------------------------------
        // PrintTablePreBill
        // ------------------------------------------------------------------------------------------

        private static string CartLine(long quantityMilli, long unitPrice, long discount, bool v2Marker)
        {
            var line = JObject.FromObject(new
            {
                productId = "p1",
                productName = "item",
                quantityMilli = quantityMilli,
                unitPricePiasters = unitPrice,
                discountPiasters = discount,
                unit = "piece"
            });
            if (v2Marker) line["heldFormatVersion"] = 2;
            return new JArray(line).ToString(Formatting.None);
        }

        private string CreateTable(string cartJson, long heldSubtotal, long heldDiscount, long heldTotal, string status)
        {
            HeldSale held = HeldRepo.SaveHeldSale(new HeldSale
            {
                HoldLabel = "table order",
                ItemsCount = 1,
                SubtotalPiasters = heldSubtotal,
                DiscountPiasters = heldDiscount,
                TotalPiasters = heldTotal,
                CartJson = cartJson,
                OrderType = "dine_in"
            });
            RestaurantTable table = TableRepo.SaveTable(new RestaurantTable
            {
                Name = "T-" + Guid.NewGuid().ToString("N").Substring(0, 6),
                ZoneName = "Hall",
                Capacity = 4,
                Status = status,
                ActiveHeldSaleId = held.Id,
                WaiterName = "waiter",
                GuestsCount = 2,
                IsActive = true
            });
            Assert.AreEqual(status, table.Status, "fixture table status");
            Assert.IsFalse(string.IsNullOrWhiteSpace(table.CartJson), "the table sees its held cart");
            return table.Id;
        }

        private string TableStatus(string tableId)
        {
            return ScalarText("SELECT status FROM restaurant_tables WHERE id = @i;", "@i", tableId);
        }

        [Test]
        public void PreBill_SuccessfulPrint_FlipsTheTableToBillPrinted_WithoutDrawerOrAudit()
        {
            SettingsRepo.Set("default_printer_name", Fake.Target);
            string tableId = CreateTable(CartLine(2000, 10000, 1000, true), 20000, 0, 21280, "occupied");

            PrintResult result = PrinterSvc.PrintTablePreBill(tableId);

            Assert.IsTrue(result.Success, result.Message);
            Assert.AreEqual(Fake.Target, result.PrinterUsed);
            byte[] job = Fake.WaitForJob(0);
            AssertNoDrawerKick(job, "the pre-bill never opens the drawer");
            Assert.AreEqual("bill_printed", TableStatus(tableId));
            Assert.AreEqual(0, CountAnyPrintAudit(), "PRE-BILL is not a recorded receipt");
        }

        [Test]
        public void PreBill_FailedPrint_LeavesTheTableOccupied()
        {
            SettingsRepo.Set("default_printer_name", FakeNetworkPrinter.UnreachableTarget());
            string tableId = CreateTable(CartLine(2000, 10000, 1000, true), 20000, 0, 21280, "occupied");

            PrintResult result = PrinterSvc.PrintTablePreBill(tableId);

            Assert.IsFalse(result.Success, "an unreachable printer must not report success");
            Assert.AreEqual("occupied", TableStatus(tableId), "the floor map must not claim a bill was printed");
            Assert.AreEqual(0, Fake.JobCount);
        }

        [Test]
        public void PreBill_NumbersThatDoNotReconcile_AreNotPrinted_AndTheStatusIsUntouched()
        {
            SettingsRepo.Set("default_printer_name", Fake.Target);
            // held total (90.00) is below the net of the lines (100.00)
            string tableId = CreateTable(CartLine(1000, 10000, 0, true), 10000, 0, 9000, "occupied");

            PrintResult result = PrinterSvc.PrintTablePreBill(tableId);

            Assert.IsFalse(result.Success);
            Assert.IsFalse(string.IsNullOrWhiteSpace(result.Message));
            Assert.AreEqual(0, Fake.JobCount, "nothing may reach the printer");
            Assert.AreEqual("occupied", TableStatus(tableId));
        }

        [Test]
        public void PreBill_ReprintOnAnAlreadyBillPrintedTable_KeepsTheStatus()
        {
            SettingsRepo.Set("default_printer_name", Fake.Target);
            string tableId = CreateTable(CartLine(1000, 5000, 0, true), 5000, 0, 5000, "bill_printed");

            PrintResult result = PrinterSvc.PrintTablePreBill(tableId);

            Assert.IsTrue(result.Success, result.Message);
            Fake.WaitForJob(0);
            Assert.AreEqual("bill_printed", TableStatus(tableId));
        }

        [Test]
        public void PreBill_TableWithoutAHeldOrder_IsNotPrinted()
        {
            SettingsRepo.Set("default_printer_name", Fake.Target);
            RestaurantTable empty = TableRepo.SaveTable(new RestaurantTable { Name = "Empty-" + Guid.NewGuid().ToString("N").Substring(0, 6), Status = "available", IsActive = true });

            PrintResult result = PrinterSvc.PrintTablePreBill(empty.Id);

            Assert.IsFalse(result.Success);
            Assert.AreEqual(0, Fake.JobCount);
            Assert.AreEqual("available", TableStatus(empty.Id));
        }

        [TestCase(null)]
        [TestCase("")]
        [TestCase("   ")]
        [TestCase("tbl_does_not_exist")]
        public void PreBill_MissingOrUnknownTable_IsNotPrinted(string tableId)
        {
            SettingsRepo.Set("default_printer_name", Fake.Target);

            PrintResult result = PrinterSvc.PrintTablePreBill(tableId);

            Assert.IsFalse(result.Success);
            Assert.AreEqual(0, Fake.JobCount);
        }

        // ------------------------------------------------------------------------------------------
        // Return receipt: drawer only for a cash refund
        // ------------------------------------------------------------------------------------------

        private static Return FixtureReturn(string id, string refundMethod)
        {
            return new Return
            {
                Id = id,
                ReturnNumber = 7,
                SaleId = "sale_fixture",
                InvoiceNumber = 3,
                CashierId = "usr_cashier_1",
                TotalPiasters = 5000,
                RefundMethod = refundMethod,
                Reason = "test",
                CreatedAt = "2026-01-01T10:00:00",
                Items = new List<ReturnItem>
                {
                    new ReturnItem { ProductName = "item", QuantityMilli = 1000, UnitPricePiasters = 5000, TotalPiasters = 5000, Unit = "piece" }
                }
            };
        }

        [TestCase("cash", true)]
        [TestCase("CASH", true)]
        [TestCase("", true)]
        [TestCase(null, true)]
        [TestCase("credit", false)]
        [TestCase("customer_balance", false)]
        [TestCase("instapay", false)]
        [TestCase("vodafone_cash", false)]
        [TestCase("wallet", false)]
        public void ReturnReceipt_DrawerOpensOnlyForACashRefund(string refundMethod, bool drawerOpens)
        {
            PrintResult result = PrinterSvc.PrintReturnReceipt(FixtureReturn("ret_drawer_" + (refundMethod ?? "null"), refundMethod), Fake.Target, null, true);

            Assert.IsTrue(result.Success, result.Message);
            byte[] job = Fake.WaitForJob(0);
            if (drawerOpens)
            {
                AssertDrawerKick(job, "cash refund opens the drawer");
            }
            else
            {
                AssertNoDrawerKick(job, "a non-cash refund (" + refundMethod + ") must not open the drawer");
            }
        }

        [Test]
        public void ReturnReceipt_ExplicitNoDrawer_WinsEvenForACashRefund()
        {
            PrintResult result = PrinterSvc.PrintReturnReceipt(FixtureReturn("ret_nodrawer", "cash"), Fake.Target, null, false);

            Assert.IsTrue(result.Success, result.Message);
            AssertNoDrawerKick(Fake.WaitForJob(0), "openDrawer=false");
        }

        [Test]
        public void ReturnReceipt_DrawerSettingApplies_OnlyToCashRefunds()
        {
            SettingsRepo.Set("printer_open_drawer", "1");

            PrintResult cash = PrinterSvc.PrintReturnReceipt(FixtureReturn("ret_setting_cash", "cash"), Fake.Target, null, null);
            PrintResult credit = PrinterSvc.PrintReturnReceipt(FixtureReturn("ret_setting_credit", "credit"), Fake.Target, null, null);

            Assert.IsTrue(cash.Success, cash.Message);
            Assert.IsTrue(credit.Success, credit.Message);
            AssertDrawerKick(Fake.WaitForJob(0), "drawer enabled in settings + cash refund");
            AssertNoDrawerKick(Fake.WaitForJob(1), "drawer enabled in settings but the refund goes to the customer account");
        }

        // ------------------------------------------------------------------------------------------
        // returns:printReceipt through the dispatcher
        // ------------------------------------------------------------------------------------------

        private Return CreateStoredReturn()
        {
            Sale sale = CreateStoredSale(null, 3000, 5000);
            Return created = ReturnService.ProcessReturn(new Return
            {
                SaleId = sale.Id,
                CashierId = StoreShift.CashierId,
                RefundMethod = "cash",
                Reason = "test return",
                Items = new List<ReturnItem>
                {
                    new ReturnItem { SaleItemId = sale.Items[0].Id, ProductId = sale.Items[0].ProductId, ProductName = sale.Items[0].ProductName, QuantityMilli = 1000 }
                }
            });
            Assert.IsFalse(string.IsNullOrEmpty(created.Id));
            return created;
        }

        [Test]
        public void ReturnsPrintReceipt_StoredReturn_IsPrintedOnce_ThenAsACopy_AuditedByReturnId()
        {
            Return created = CreateStoredReturn();
            Return stored = ReturnService.GetReturnById(created.Id);
            LoginAs(OwnerId);

            BridgeResponse first = Dispatch("returns:printReceipt", new { returnId = created.Id, printerName = Fake.Target });
            Assert.IsTrue(first.Success, Describe(first));
            AssertBytesEqual(ExpectedReturnBytes(stored, false, false), Fake.WaitForJob(0), "first print is the original");
            Assert.AreEqual(1, CountPrintAudit("return", created.Id, "RECEIPT_PRINTED"));

            BridgeResponse second = Dispatch("returns:printReceipt", new { id = created.Id, printerName = Fake.Target });
            Assert.IsTrue(second.Success, Describe(second));
            AssertBytesEqual(ExpectedReturnBytes(stored, true, false), Fake.WaitForJob(1), "second print is a copy");
            Assert.AreEqual(1, CountPrintAudit("return", created.Id, "RECEIPT_PRINTED"));
            Assert.AreEqual(1, CountPrintAudit("return", created.Id, "return_reprint"));
        }

        [Test]
        public void ReturnsPrintReceipt_FullObjectWithARealId_IsReloaded_ForgedAmountsAreIgnored()
        {
            Return created = CreateStoredReturn();
            Return stored = ReturnService.GetReturnById(created.Id);
            LoginAs(OwnerId);

            var forged = new JObject();
            forged["id"] = created.Id;
            forged["returnNumber"] = 999;
            forged["totalPiasters"] = 1;
            forged["refundMethod"] = "cash";
            forged["createdAt"] = "2026-01-01T10:00:00";
            forged["items"] = JArray.Parse("[{\"productName\":\"forged\",\"quantityMilli\":1000,\"unitPricePiasters\":1,\"totalPiasters\":1}]");
            var payload = new JObject();
            payload["return"] = forged;
            payload["printerName"] = Fake.Target;

            BridgeResponse res = Dispatch("returns:printReceipt", payload);

            Assert.IsTrue(res.Success, Describe(res));
            byte[] sent = Fake.WaitForJob(0);
            AssertBytesEqual(ExpectedReturnBytes(stored, false, false), sent, "the stored return was printed");
            Assert.IsFalse(BytesEqual(ExpectedReturnBytes(forged.ToObject<Return>(), false, false), sent), "the forged amounts were not printed");
        }

        [Test]
        public void ReturnsPrintReceipt_FailedPrint_IsPrintFailed_AndWritesNoMarker()
        {
            Return created = CreateStoredReturn();
            LoginAs(OwnerId);

            BridgeResponse res = Dispatch("returns:printReceipt", new { returnId = created.Id, printerName = FakeNetworkPrinter.UnreachableTarget() });

            Assert.IsFalse(res.Success);
            Assert.AreEqual("PRINT_FAILED", ErrorCode(res), Describe(res));
            Assert.AreEqual(0, CountAnyPrintAudit());
        }

        // Suspected production defect (see report): when the id is unknown, the handler falls back to deserialising the whole
        // payload as a Return, so an unknown returnId / empty payload prints a blank receipt, and a full object with an unknown id
        // prints the client-supplied amounts. These tests state the required behaviour and are expected to fail until it is fixed.
        [TestCase("{\"returnId\":\"return_does_not_exist\"}")]
        [TestCase("{\"id\":\"return_does_not_exist\"}")]
        [TestCase("{}")]
        [TestCase("{\"return\":{\"id\":\"return_does_not_exist\",\"totalPiasters\":99999,\"refundMethod\":\"cash\"}}")]
        public void ReturnsPrintReceipt_UnknownReturn_IsRejected_NeverABlankOrForgedReceipt(string payloadJson)
        {
            LoginAs(OwnerId);
            JObject payload = JObject.Parse(payloadJson);
            payload["printerName"] = Fake.Target;

            BridgeResponse res = Dispatch("returns:printReceipt", payload);

            Assert.IsFalse(res.Success, "an unknown return must not produce a printed receipt: " + payloadJson);
            Assert.AreEqual(0, Fake.JobCount, "nothing may reach the printer");
        }
    }
}
