using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// L4 / L5 / L7 / L8: حد المرتجع النقدي لفواتير الآجل، سطر نقدية التأمين في تقرير Z،
    /// مرتجع سطر مجاني، ومنع تكرار المرتجع والمصروف عند إعادة المحاولة.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S33_ReturnsClosingIdempotencyTest : S30_Step3BFixtureBase
    {
        private static JObject ReturnPayload(JObject sale, int lineIndex, long quantityMilli, long unitPricePiasters, long totalPiasters, string refundMethod, string idempotencyKey)
        {
            // Same shape as ReturnModal.handleSubmitReturn
            JToken line = sale["items"][lineIndex];
            return new JObject
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
                            { "unitPricePiasters", unitPricePiasters },
                            { "totalPiasters", totalPiasters },
                            { "isDamaged", false }
                        }
                    }
                }
            };
        }

        [Test]
        public void L4_CashRefundLimit_OnCreditSale_CountsLaterDebtPaymentsOnce()
        {
            OpenShift(50000);
            var product = CreateProduct("زيت 1 لتر", 2500, 2000, 100000);
            var customer = DatabaseService.Customers.SaveCustomer(new Customer { Name = "عميل مقدم", Phone = "01077700011", CreditLimitPiasters = 100000 });

            // 100 EGP on credit with a 20 EGP cash down payment, then 30 EGP cash debt settlement
            var salePayload = SalePayload(new JArray { CartLine(product, 4000, 2500) }, 10000, "credit", 2000, customer.Id);
            salePayload["payments"] = new JArray
            {
                new JObject { { "amountPiasters", 2000 }, { "method", "cash" } },
                new JObject { { "amountPiasters", 8000 }, { "method", "credit" } }
            };
            JObject sale = Data(DispatchOk("sales:create", salePayload));
            DispatchOk("customers:recordPayment", new JObject
            {
                { "customerId", customer.Id }, { "amountPiasters", 3000 }, { "notes", "سداد نقدي للدين" }, { "paymentMethod", "cash" }, { "idempotencyKey", Guid.NewGuid().ToString() }
            });
            // Legacy credit invoice: saved before the payments table (Feature #27); its debt allocations were back-filled by migration
            Execute("DELETE FROM payments WHERE sale_id = @s;", "@s", sale["id"].ToString());
            Assert.AreEqual(3000, Scalar("SELECT COALESCE(SUM(amount_piasters), 0) FROM debt_allocations WHERE sale_id = @s AND type = 'payment';", "@s", sale["id"].ToString()));

            var tooMuch = Dispatch("returns:create", ReturnPayload(sale, 0, 3000, 2500, 7500, "cash", Guid.NewGuid().ToString()));
            Assert.IsFalse(tooMuch.Success, "النقد المحصل فعلاً 50 ج.م فقط (20 مقدم + 30 سداد)، لا يُصرف 75 نقداً");
            StringAssert.Contains("يتجاوز النقد المسدد", tooMuch.Error.Message);

            var allowed = Dispatch("returns:create", ReturnPayload(sale, 0, 2000, 2500, 5000, "cash", Guid.NewGuid().ToString()));
            Assert.IsTrue(allowed.Success, "مرتجع نقدي حتى 50 ج.م مسموح: " + Describe(allowed));
        }

        [Test]
        public void L5_ZReport_CashLine_IncludesInsuranceCoPayment()
        {
            OpenShift(0);
            var product = CreateProduct("مضاد حيوي", 10000, 6000, 10000);
            DatabaseService.SaleRepo.CreateSaleAtomic(new Sale
            {
                SubtotalPiasters = 10000,
                TotalPiasters = 10000,
                PaidPiasters = 10000,
                PaymentMethod = "insurance",
                Status = "completed",
                CashierId = AdminId,
                ShiftId = DatabaseService.Shifts.GetActiveShift().Id,
                Payments = new List<SalePayment>
                {
                    new SalePayment { Method = "insurance", AmountPiasters = 8000 },
                    new SalePayment { Method = "cash", AmountPiasters = 2000 }
                },
                Items = new List<SaleItem>
                {
                    new SaleItem { ProductId = product.Id, ProductName = product.Name, QuantityMilli = 1000, UnitPricePiasters = 10000, TotalPiasters = 10000, UnitCostPiasters = 6000 }
                }
            });

            var preview = DatabaseService.DailyClosing.GetClosingPreview(null);

            Assert.AreEqual(2000, preview.CashSalesPiasters, "تحمّل المريض النقدي يدخل الدرج ويظهر في سطر المبيعات النقدية");
            Assert.AreEqual(8000, preview.InsuranceSalesPiasters, "سطر التأمين = حصة الشركة فقط");
            Assert.AreEqual(preview.TotalSalesPiasters, preview.CashSalesPiasters + preview.InsuranceSalesPiasters, "أسطر التقرير تجمع إجمالي المبيعات");
        }

        [Test]
        public void L7_FullyDiscountedLine_CanBeReturned_StockOnlyNoMoney()
        {
            OpenShift(10000);
            var paid = CreateProduct("شامبو", 5000, 3000, 10000);
            var gift = CreateProduct("عينة هدية", 1000, 400, 10000);

            var giftLine = CartLine(gift, 1000, 1000);
            giftLine["discountPiasters"] = 1000;
            giftLine["totalPiasters"] = 0;
            JObject sale = Data(DispatchOk("sales:create", SalePayload(new JArray { CartLine(paid, 1000, 5000), giftLine }, 5000, "cash", 5000, null)));
            Assert.AreEqual(9000, Stock(gift.Id));

            var res = Dispatch("returns:create", ReturnPayload(sale, 1, 1000, 0, 0, "cash", Guid.NewGuid().ToString()));

            Assert.IsTrue(res.Success, "مرتجع سطر مجاني يعيد البضاعة للمخزون: " + Describe(res));
            Assert.AreEqual(0, (long)Data(res)["totalPiasters"], "بدون أي مبلغ مسترد");
            Assert.AreEqual(10000, Stock(gift.Id), "العينة عادت للمخزون");
        }

        [Test]
        public void L8_RetriedReturn_WithSameKey_RefundsOnce()
        {
            OpenShift(50000);
            var product = CreateProduct("مكرونة", 1500, 1000, 10000);
            JObject sale = Data(DispatchOk("sales:create", SalePayload(new JArray { CartLine(product, 2000, 1500) }, 3000, "cash", 3000, null)));
            string key = "ret_" + Guid.NewGuid().ToString("N");

            JObject first = Data(DispatchOk("returns:create", ReturnPayload(sale, 0, 1000, 1500, 1500, "cash", key)));
            JObject retry = Data(DispatchOk("returns:create", ReturnPayload(sale, 0, 1000, 1500, 1500, "cash", key)));

            Assert.AreEqual(first["id"].ToString(), retry["id"].ToString(), "إعادة المحاولة ترجع نفس المرتجع");
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM returns WHERE sale_id = @s;", "@s", sale["id"].ToString()), "مرتجع واحد فقط");
            Assert.AreEqual(9000, Stock(product.Id), "المخزون عاد مرة واحدة");
        }

        [Test]
        public void L8_RetriedExpense_WithSameKey_IsPaidOnce()
        {
            OpenShift(50000);
            var payload = new JObject
            {
                { "amountPiasters", 2500 },
                { "category", "نثريات" },
                { "notes", "أدوات نظافة" },
                { "source", "drawer" },
                { "idempotencyKey", "exp_" + Guid.NewGuid().ToString("N") }
            };

            JObject first = Data(DispatchOk("expenses:create", payload));
            JObject retry = Data(DispatchOk("expenses:create", (JObject)payload.DeepClone()));

            Assert.AreEqual(first["id"].ToString(), retry["id"].ToString());
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM expenses;"), "مصروف واحد فقط من الدرج");
        }
    }
}
