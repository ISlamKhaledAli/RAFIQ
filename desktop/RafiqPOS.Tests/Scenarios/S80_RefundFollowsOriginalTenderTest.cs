using System;
using RafiqPOS.Data;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// المرتجع يتبع طريقة الدفع الأصلية: استرداد مقسّم على النقد والبطاقة والإلكتروني بسقف لكل طريقة،
    /// قائمة بيضاء لطرق الاسترداد، ومنع صرف النقد بدون وردية مفتوحة.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S80_RefundFollowsOriginalTenderTest : S30_Step3BFixtureBase
    {
        private static JObject ReturnPayload(JObject sale, long quantityMilli, string refundMethod, JArray refunds, string idempotencyKey)
        {
            JToken line = sale["items"][0];
            long unitPrice = (long)line["unitPricePiasters"];
            var payload = new JObject
            {
                { "saleId", sale["id"].ToString() },
                { "reason", "مرتجع من العميل" },
                { "refundMethod", refundMethod },
                { "idempotencyKey", idempotencyKey },
                { "items", new JArray
                    {
                        new JObject
                        {
                            { "saleItemId", line["id"].ToString() },
                            { "productId", line["productId"].ToString() },
                            { "productName", line["productName"].ToString() },
                            { "quantityMilli", quantityMilli },
                            { "unitPricePiasters", unitPrice },
                            { "totalPiasters", unitPrice * quantityMilli / 1000 },
                            { "isDamaged", false }
                        }
                    }
                }
            };
            if (refunds != null) payload["refunds"] = refunds;
            return payload;
        }

        private static JArray Parts(string firstMethod, long firstAmount, string secondMethod, long secondAmount)
        {
            return new JArray
            {
                new JObject { { "method", firstMethod }, { "amountPiasters", firstAmount } },
                new JObject { { "method", secondMethod }, { "amountPiasters", secondAmount } }
            };
        }

        // Two units at half the total each, paid with two tenders in one "multi" invoice
        private static JObject SellMixed(Product product, string secondMethod, long cashPiasters, long secondPiasters)
        {
            long total = cashPiasters + secondPiasters;
            JObject payload = SalePayload(new JArray { CartLine(product, 2000, total / 2) }, total, "multi", total, null);
            payload["payments"] = new JArray
            {
                new JObject { { "amountPiasters", cashPiasters }, { "method", "cash" } },
                new JObject { { "amountPiasters", secondPiasters }, { "method", secondMethod } }
            };
            return Data(DispatchOk("sales:create", payload));
        }

        private static string Text(string sql, params object[] nameValuePairs)
        {
            using (var conn = new SQLiteConnection(DatabaseService.ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    for (int i = 0; i + 1 < nameValuePairs.Length; i += 2)
                    {
                        cmd.Parameters.AddWithValue((string)nameValuePairs[i], nameValuePairs[i + 1]);
                    }
                    object val = cmd.ExecuteScalar();
                    return val == null || val == DBNull.Value ? null : val.ToString();
                }
            }
        }

        [Test]
        public void MixedTenderSale_RefundSplitsAcrossCashAndCard_AndRetryRefundsOnce()
        {
            OpenShift(50000);
            var product = CreateProduct("زيت 1 لتر", 5000, 3000, 100000);
            JObject sale = SellMixed(product, "card", 3000, 7000);
            string saleId = sale["id"].ToString();
            string key = "ret_" + Guid.NewGuid().ToString("N");

            // 50.00 refund: the cash the customer paid (30.00) first, the card takes the remainder (20.00)
            JObject first = Data(DispatchOk("returns:create", ReturnPayload(sale, 1000, "cash", Parts("cash", 3000, "card", 0), key)));

            Assert.AreEqual(5000, (long)first["totalPiasters"], "المرتجع كله 50 ج.م");
            Assert.AreEqual(2, ((JArray)first["refunds"]).Count, "جزءان: نقدي وبطاقة");
            Assert.AreEqual(3000, Scalar("SELECT COALESCE(SUM(total_piasters), 0) FROM returns WHERE sale_id = @s AND refund_method = 'cash';", "@s", saleId), "النقد من الدرج");
            Assert.AreEqual(2000, Scalar("SELECT COALESCE(SUM(total_piasters), 0) FROM returns WHERE sale_id = @s AND refund_method = 'card';", "@s", saleId), "الباقي على البطاقة");
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM return_items;"), "الأصناف تُسجل مرة واحدة فقط");
            Assert.AreEqual(99000, Stock(product.Id), "المخزون عاد مرة واحدة (باع 2 ورجع 1)");

            var preview = DatabaseService.DailyClosing.GetClosingPreview(null);
            Assert.AreEqual(3000, preview.ReturnsCashPiasters, "الدرج يخصم الجزء النقدي فقط");
            Assert.AreEqual(1, preview.ReturnsCount, "عملية مرتجع واحدة في الإقفال");
            var reports = new ReportsService(DatabaseService.ConnectionString);
            Assert.AreEqual(1, reports.GetTodaySummary().TodayReturnsCount, "ملخص اليوم لا يعد الصف الملحق");
            Assert.AreEqual(1, reports.GetPeriodSalesReport("today", null, null).ReturnsCount, "تقرير الفترة لا يعد الصف الملحق");

            JObject retry = Data(DispatchOk("returns:create", ReturnPayload(sale, 1000, "cash", Parts("cash", 3000, "card", 0), key)));
            Assert.AreEqual(first["id"].ToString(), retry["id"].ToString(), "إعادة المحاولة ترجع نفس المرتجع");
            Assert.AreEqual(2, Scalar("SELECT COUNT(*) FROM returns WHERE sale_id = @s;", "@s", saleId), "لا صفوف جديدة بعد إعادة المحاولة");
            Assert.AreEqual(99000, Stock(product.Id), "لا استرداد مضاعف للمخزون");

            Return loaded = DatabaseService.Returns.GetReturnById(first["id"].ToString());
            Assert.AreEqual(5000, loaded.TotalPiasters, "القراءة تعيد إجمالي العملية كاملاً");
            Assert.AreEqual(2, loaded.Refunds.Count);
            var forSale = DatabaseService.Returns.GetReturnsForSale(saleId);
            Assert.AreEqual(1, forSale.Count, "الصف الملحق لا يظهر كمرتجع مستقل");
            Assert.AreEqual(5000, forSale[0].TotalPiasters);

            // The cash part is used up: another cash refund is rejected, the card still has 50.00 left
            var cashAgain = Dispatch("returns:create", ReturnPayload(sale, 1000, "cash", null, Guid.NewGuid().ToString()));
            Assert.IsFalse(cashAgain.Success);
            StringAssert.Contains("يتجاوز النقد المسدد", cashAgain.Error.Message);
            var cardRest = Dispatch("returns:create", ReturnPayload(sale, 1000, "card", null, Guid.NewGuid().ToString()));
            Assert.IsTrue(cardRest.Success, "الباقي على البطاقة مسموح: " + Describe(cardRest));
        }

        [Test]
        public void SplitRefund_WithInstapayPart_DeductsTheDigitalAccountAndLogsTheTransaction()
        {
            OpenShift(50000);
            var product = CreateProduct("كراسة", 5000, 3000, 100000);
            JObject sale = SellMixed(product, "instapay", 4000, 6000);
            long balanceBefore = Scalar("SELECT COALESCE(SUM(balance_piasters), 0) FROM digital_accounts WHERE type = 'instapay' AND is_active = 1;");

            DispatchOk("returns:create", ReturnPayload(sale, 1000, "cash", Parts("cash", 4000, "instapay", 0), Guid.NewGuid().ToString()));

            Assert.AreEqual(1000, Scalar("SELECT COALESCE(SUM(amount_piasters), 0) FROM digital_transactions WHERE tx_type = 'pos_return' AND sale_id = @s;", "@s", sale["id"].ToString()), "حركة محفظة بجزء إنستاباي فقط");
            Assert.AreEqual(balanceBefore - 1000, Scalar("SELECT COALESCE(SUM(balance_piasters), 0) FROM digital_accounts WHERE type = 'instapay' AND is_active = 1;"), "رصيد إنستاباي نقص بالجزء الإلكتروني فقط");
        }

        [Test]
        public void SplitRefund_CannotExceedTheCapOfAnOriginalMethod_AndWritesNothing()
        {
            OpenShift(50000);
            var product = CreateProduct("سكر", 5000, 3000, 100000);
            JObject sale = SellMixed(product, "card", 3000, 7000);

            var res = Dispatch("returns:create", ReturnPayload(sale, 1000, "cash", Parts("cash", 4000, "card", 0), Guid.NewGuid().ToString()));

            Assert.IsFalse(res.Success, "النقد المسدد 30 ج.م فقط");
            StringAssert.Contains("يتجاوز النقد المسدد", res.Error.Message);
            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM returns;"), "لا صفوف مرتجع");
            Assert.AreEqual(98000, Stock(product.Id), "المخزون كما هو بعد البيع فقط");
        }

        [Test]
        public void SplitRefund_PartsMustSumToTheTotal_BeWhitelisted_AndNotRepeat()
        {
            OpenShift(50000);
            var product = CreateProduct("أرز", 5000, 3000, 100000);
            JObject sale = SellMixed(product, "card", 3000, 7000);

            var wrongSum = Dispatch("returns:create", ReturnPayload(sale, 1000, "cash", Parts("cash", 3000, "card", 1000), Guid.NewGuid().ToString()));
            Assert.IsFalse(wrongSum.Success);
            StringAssert.Contains("لا يساوي قيمة المرتجع", wrongSum.Error.Message);

            var twoRemainders = Dispatch("returns:create", ReturnPayload(sale, 1000, "cash", Parts("cash", 0, "card", 0), Guid.NewGuid().ToString()));
            Assert.IsFalse(twoRemainders.Success);
            StringAssert.Contains("جزء استرداد واحد فقط", twoRemainders.Error.Message);

            var repeated = Dispatch("returns:create", ReturnPayload(sale, 1000, "cash", Parts("cash", 1000, "CASH", 0), Guid.NewGuid().ToString()));
            Assert.IsFalse(repeated.Success);
            StringAssert.Contains("مكررة", repeated.Error.Message);

            var unknown = Dispatch("returns:create", ReturnPayload(sale, 1000, "cash", Parts("cash", 3000, "bitcoin", 0), Guid.NewGuid().ToString()));
            Assert.IsFalse(unknown.Success);
            StringAssert.Contains("غير صالحة", unknown.Error.Message);

            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM returns;"), "لا شيء سُجل");
        }

        [Test]
        public void CardSale_RefundsToCard_AndRejectsCashRefund_AndNormalisesTheMethod()
        {
            OpenShift(50000);
            var product = CreateProduct("شاي", 3000, 2000, 100000);
            JObject sale = Data(DispatchOk("sales:create", SalePayload(new JArray { CartLine(product, 2000, 3000) }, 6000, "card", 6000, null)));

            var cash = Dispatch("returns:create", ReturnPayload(sale, 1000, "cash", null, Guid.NewGuid().ToString()));
            Assert.IsFalse(cash.Success, "الفاتورة دُفعت بالبطاقة فقط");
            StringAssert.Contains("لم يُسدد منها مبالغ نقدية", cash.Error.Message);

            DispatchOk("returns:create", ReturnPayload(sale, 1000, "CARD", null, Guid.NewGuid().ToString()));
            Assert.AreEqual("card", Text("SELECT refund_method FROM returns WHERE sale_id = @s;", "@s", sale["id"].ToString()), "الطريقة تُحفظ بأحرف صغيرة");
        }

        [Test]
        public void UnknownRefundMethod_IsRejected_ForInvoiceAndNonInvoiceReturns()
        {
            OpenShift(50000);
            var product = CreateProduct("قهوة", 4000, 2500, 100000);
            JObject sale = Data(DispatchOk("sales:create", SalePayload(new JArray { CartLine(product, 1000, 4000) }, 4000, "cash", 4000, null)));

            var invoice = Dispatch("returns:create", ReturnPayload(sale, 1000, "bitcoin", null, Guid.NewGuid().ToString()));
            Assert.IsFalse(invoice.Success);
            StringAssert.Contains("غير صالحة", invoice.Error.Message);

            var withoutInvoice = new Return
            {
                RefundMethod = "bitcoin",
                Reason = "بدون فاتورة",
                IsWithoutInvoice = true
            };
            withoutInvoice.Items.Add(new ReturnItem { ProductId = product.Id, ProductName = product.Name, QuantityMilli = 1000, UnitPricePiasters = 1000 });
            var ex = Assert.Throws<InvalidOperationException>(delegate { DatabaseService.Returns.ProcessReturn(withoutInvoice, null); });
            StringAssert.Contains("غير صالحة", ex.Message);

            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM returns;"));
        }

        [Test]
        public void ThreePartSplit_CashCardInstapay_StoresDistinctLinkedRows_AndRetryAndReadsStayWhole()
        {
            OpenShift(50000);
            var product = CreateProduct("دفتر", 5000, 3000, 100000);
            JObject payload = SalePayload(new JArray { CartLine(product, 2000, 5000) }, 10000, "multi", 10000, null);
            payload["payments"] = new JArray
            {
                new JObject { { "amountPiasters", 2000 }, { "method", "cash" } },
                new JObject { { "amountPiasters", 3000 }, { "method", "card" } },
                new JObject { { "amountPiasters", 5000 }, { "method", "instapay" } }
            };
            JObject sale = Data(DispatchOk("sales:create", payload));
            string saleId = sale["id"].ToString();
            string key = "ret_" + Guid.NewGuid().ToString("N");
            Func<JArray> parts = delegate
            {
                return new JArray
                {
                    new JObject { { "method", "cash" }, { "amountPiasters", 2000 } },
                    new JObject { { "method", "card" }, { "amountPiasters", 2000 } },
                    new JObject { { "method", "instapay" }, { "amountPiasters", 0 } }
                };
            };

            JObject first = Data(DispatchOk("returns:create", ReturnPayload(sale, 1000, "cash", parts(), key)));

            Assert.AreEqual(5000, (long)first["totalPiasters"]);
            Assert.AreEqual(3, ((JArray)first["refunds"]).Count);
            Assert.AreEqual(3, Scalar("SELECT COUNT(*) FROM returns WHERE sale_id = @s;", "@s", saleId), "ثلاثة صفوف: رئيسي وملحقان");
            Assert.AreEqual(3, Scalar("SELECT COUNT(DISTINCT idempotency_key) FROM returns WHERE sale_id = @s;", "@s", saleId), "لكل صف مفتاح فريد");
            Assert.AreEqual(1000, Scalar("SELECT COALESCE(SUM(total_piasters), 0) FROM returns WHERE sale_id = @s AND refund_method = 'instapay';", "@s", saleId));
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM return_items;"));

            JObject retry = Data(DispatchOk("returns:create", ReturnPayload(sale, 1000, "cash", parts(), key)));
            Assert.AreEqual(first["id"].ToString(), retry["id"].ToString());
            Assert.AreEqual(3, Scalar("SELECT COUNT(*) FROM returns WHERE sale_id = @s;", "@s", saleId), "لا صفوف جديدة عند إعادة المحاولة");

            Return loaded = DatabaseService.Returns.GetReturnById(first["id"].ToString());
            Assert.AreEqual(5000, loaded.TotalPiasters);
            Assert.AreEqual(3, loaded.Refunds.Count);
            Assert.AreEqual(1, DatabaseService.Returns.GetReturnsForSale(saleId).Count);
            Assert.AreEqual(3, DatabaseService.Returns.GetReturnsForSale(saleId)[0].Refunds.Count);

            // LIMIT counts operations, not stored rows
            var recent = DatabaseService.Returns.GetRecentReturns(1);
            Assert.AreEqual(1, recent.Count);
            Assert.AreEqual(5000, recent[0].TotalPiasters);
            Assert.AreEqual(3, recent[0].Refunds.Count);
        }

        [Test]
        public void SplitRefund_PartBounds_AreChecked_AndReservedKeysAreRejected()
        {
            OpenShift(50000);
            var product = CreateProduct("قلم", 5000, 3000, 100000);
            JObject sale = SellMixed(product, "card", 3000, 7000);

            var tooBig = Dispatch("returns:create", ReturnPayload(sale, 1000, "cash", Parts("cash", 6000, "card", 0), Guid.NewGuid().ToString()));
            Assert.IsFalse(tooBig.Success, "جزء أكبر من قيمة المرتجع");
            StringAssert.Contains("غير صالح", tooBig.Error.Message);

            var huge = Dispatch("returns:create", ReturnPayload(sale, 1000, "cash", Parts("cash", long.MaxValue, "card", 0), Guid.NewGuid().ToString()));
            Assert.IsFalse(huge.Success, "لا فيضان حسابي");
            StringAssert.Contains("غير صالح", huge.Error.Message);

            var negative = Dispatch("returns:create", ReturnPayload(sale, 1000, "cash", Parts("cash", -1, "card", 0), Guid.NewGuid().ToString()));
            Assert.IsFalse(negative.Success);

            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM returns;"));
        }

        [Test]
        public void CashRefund_OnAShiftOfAPreviousBusinessDay_IsRejected()
        {
            Shift shift = OpenShift(50000);
            var product = CreateProduct("ممحاة", 3000, 2000, 100000);
            JObject sale = Data(DispatchOk("sales:create", SalePayload(new JArray { CartLine(product, 2000, 3000) }, 6000, "cash", 6000, null)));
            string today = DatabaseService.DailyClosing.GetCurrentBusinessDate();
            string yesterday = DateTime.ParseExact(today, "yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture).AddDays(-1).ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture);
            Execute("UPDATE shifts SET business_date = @d WHERE id = @id;", "@d", yesterday, "@id", shift.Id);

            var res = Dispatch("returns:create", ReturnPayload(sale, 1000, "cash", null, Guid.NewGuid().ToString()));

            Assert.IsFalse(res.Success, "وردية يوم سابق لا تصرف نقداً");
            StringAssert.Contains("يوم العمل", res.Error.Message);
            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM returns;"));
        }

        [Test]
        public void CashRefund_RequiresAnOpenShift()
        {
            Shift shift = OpenShift(50000);
            var product = CreateProduct("عسل", 3000, 2000, 100000);
            JObject sale = Data(DispatchOk("sales:create", SalePayload(new JArray { CartLine(product, 2000, 3000) }, 6000, "cash", 6000, null)));
            DatabaseService.Shifts.CloseShift(new CloseShiftRequest { ShiftId = shift.Id, CashierId = AdminId, ActualCashPiasters = 56000 });

            var res = Dispatch("returns:create", ReturnPayload(sale, 1000, "cash", null, Guid.NewGuid().ToString()));

            Assert.IsFalse(res.Success, "لا وردية مفتوحة");
            StringAssert.Contains("وردية مفتوحة", res.Error.Message);
            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM returns;"), "لا مرتجع بدون وردية");

            OpenShift(0);
            var again = Dispatch("returns:create", ReturnPayload(sale, 1000, "cash", null, Guid.NewGuid().ToString()));
            Assert.IsTrue(again.Success, "بعد فتح وردية يُصرف المرتجع: " + Describe(again));
            Assert.IsNotNull(Text("SELECT shift_id FROM returns WHERE sale_id = @s;", "@s", sale["id"].ToString()), "المرتجع النقدي مربوط بالوردية");
        }

        [Test]
        public void CloseShift_RejectsNegativeActualCash_AndKeepsTheShiftOpen()
        {
            Shift shift = OpenShift(10000);

            var ex = Assert.Throws<InvalidOperationException>(delegate
            {
                DatabaseService.Shifts.CloseShift(new CloseShiftRequest { ShiftId = shift.Id, CashierId = AdminId, ActualCashPiasters = -1 });
            });

            StringAssert.Contains("سالبة", ex.Message);
            Assert.IsNotNull(DatabaseService.Shifts.GetActiveShift(), "الوردية ما زالت مفتوحة");
        }

        [Test]
        public void EpayInvoice_RejectsAPartialWalletAmount_AndAddsTheFeeToAFullOne()
        {
            OpenShift(50000);
            DatabaseService.SettingsRepo.Set("epay_service_fee_percent_instapay", "1");
            var product = CreateProduct("مياه", 5000, 3000, 100000);

            var partial = Dispatch("sales:create", SalePayload(new JArray { CartLine(product, 2000, 5000) }, 10000, "instapay", 5000, null));
            Assert.IsFalse(partial.Success, "نصف القيمة لا يُرفع بصمت إلى الإجمالي");
            StringAssert.Contains("أقل من قيمة الفاتورة", partial.Error.Message);
            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM sales;"), "لا فاتورة سُجلت");

            JObject full = Data(DispatchOk("sales:create", SalePayload(new JArray { CartLine(product, 2000, 5000) }, 10000, "instapay", 10000, null)));
            Assert.AreEqual(10100, (long)full["paidPiasters"], "المدفوع = الإجمالي + رسوم 1%");
            Assert.AreEqual(100, (long)full["serviceFeePiasters"]);
        }
    }
}
