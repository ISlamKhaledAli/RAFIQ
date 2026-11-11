using System;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// returns:getForSale مع includeCaps: المتبقي الممكن استرداده لكل طريقة دفع بنفس حساب returns:create،
    /// وهو ما تعتمد عليه شاشة المرتجع لتقسيم الاسترداد (نقدي + آجل، نقدي + بطاقة...).
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S84_RefundCapsPayloadTest : S30_Step3BFixtureBase
    {
        private static JObject Caps(string saleId)
        {
            var res = DispatchOk("returns:getForSale", new JObject { { "saleId", saleId }, { "includeCaps", true } });
            return (JObject)Data(res)["caps"];
        }

        private static void AssertCaps(JObject caps, long cash, long card, long instapay, long wallet, bool creditAllowed, long remaining)
        {
            Assert.AreEqual(cash, (long)caps["cashPiasters"], "cash");
            Assert.AreEqual(card, (long)caps["cardPiasters"], "card");
            Assert.AreEqual(instapay, (long)caps["instapayPiasters"], "instapay");
            Assert.AreEqual(wallet, (long)caps["walletPiasters"], "wallet");
            Assert.AreEqual(creditAllowed, (bool)caps["creditAllowed"], "creditAllowed");
            Assert.AreEqual(remaining, (long)caps["remainingPiasters"], "remaining");
        }

        [Test]
        public void CashSale_AllowsOnlyCash()
        {
            OpenShift(50000);
            var product = CreateProduct("سكر", 3000, 2000, 100000);
            JObject sale = Data(DispatchOk("sales:create", SalePayload(new JArray { CartLine(product, 2000, 3000) }, 6000, "cash", 6000, null)));

            AssertCaps(Caps(sale["id"].ToString()), 6000, 0, 0, 0, false, 6000);
        }

        [Test]
        public void CardSale_AllowsOnlyCard()
        {
            OpenShift(50000);
            var product = CreateProduct("شاي", 3000, 2000, 100000);
            JObject sale = Data(DispatchOk("sales:create", SalePayload(new JArray { CartLine(product, 2000, 3000) }, 6000, "card", 6000, null)));

            AssertCaps(Caps(sale["id"].ToString()), 0, 6000, 0, 0, false, 6000);
        }

        [Test]
        public void CashAndCardSale_ReportsEachTender_AndShrinksAfterAPartialRefund()
        {
            OpenShift(50000);
            var product = CreateProduct("أرز", 5000, 3000, 100000);
            JObject payload = SalePayload(new JArray { CartLine(product, 2000, 5000) }, 10000, "multi", 10000, null);
            payload["payments"] = new JArray
            {
                new JObject { { "amountPiasters", 3000 }, { "method", "cash" } },
                new JObject { { "amountPiasters", 7000 }, { "method", "card" } }
            };
            JObject sale = Data(DispatchOk("sales:create", payload));
            string saleId = sale["id"].ToString();

            AssertCaps(Caps(saleId), 3000, 7000, 0, 0, false, 10000);

            JToken line = sale["items"][0];
            DispatchOk("returns:create", new JObject
            {
                { "saleId", saleId }, { "reason", "مرتجع" }, { "refundMethod", "cash" }, { "idempotencyKey", Guid.NewGuid().ToString() },
                { "refunds", new JArray
                    {
                        new JObject { { "method", "cash" }, { "amountPiasters", 3000 } },
                        new JObject { { "method", "card" }, { "amountPiasters", 0 } }
                    }
                },
                { "items", new JArray
                    {
                        new JObject
                        {
                            { "saleItemId", line["id"].ToString() }, { "productId", line["productId"].ToString() }, { "productName", line["productName"].ToString() },
                            { "quantityMilli", 1000 }, { "unitPricePiasters", 5000 }, { "totalPiasters", 5000 }, { "isDamaged", false }
                        }
                    }
                }
            });

            AssertCaps(Caps(saleId), 0, 5000, 0, 0, false, 5000);
        }

        [Test]
        public void CashDownPaymentCreditSale_CashCapIncludesLaterDebtSettlements_AndCreditIsAllowed()
        {
            OpenShift(50000);
            var product = CreateProduct("زيت", 2500, 2000, 100000);
            var customer = DatabaseService.Customers.SaveCustomer(new Customer { Name = "عميل سقف", Phone = "01077700033", CreditLimitPiasters = 100000 });
            JObject payload = SalePayload(new JArray { CartLine(product, 4000, 2500) }, 10000, "credit", 2000, customer.Id);
            payload["payments"] = new JArray
            {
                new JObject { { "amountPiasters", 2000 }, { "method", "cash" } },
                new JObject { { "amountPiasters", 8000 }, { "method", "credit" } }
            };
            JObject sale = Data(DispatchOk("sales:create", payload));
            string saleId = sale["id"].ToString();

            AssertCaps(Caps(saleId), 2000, 0, 0, 0, true, 10000);

            DispatchOk("customers:recordPayment", new JObject
            {
                { "customerId", customer.Id }, { "amountPiasters", 3000 }, { "notes", "سداد" }, { "paymentMethod", "cash" }, { "idempotencyKey", Guid.NewGuid().ToString() }
            });

            AssertCaps(Caps(saleId), 5000, 0, 0, 0, true, 10000);
        }

        [Test]
        public void WithoutIncludeCaps_TheResponseStaysAPlainReturnsList()
        {
            OpenShift(50000);
            var product = CreateProduct("ملح", 1000, 500, 100000);
            JObject sale = Data(DispatchOk("sales:create", SalePayload(new JArray { CartLine(product, 1000, 1000) }, 1000, "cash", 1000, null)));

            var res = DispatchOk("returns:getForSale", new JObject { { "saleId", sale["id"].ToString() } });

            Assert.AreEqual(0, JArray.FromObject(res.Data).Count);
        }
    }
}
