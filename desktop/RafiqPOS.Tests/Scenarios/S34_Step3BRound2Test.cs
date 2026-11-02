using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// جولة 3B الثانية: علامة أصناف الرسبي لشاشة البيع، بصمة طلب منع التكرار، مزامنة تشغيلات الخامات،
    /// علم خصم سطر البيع، فرض عميل الفاتورة في المرتجع، ومنع تكرار حركات الدرج وماكينات الدفع.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S34_Step3BRound2Test : S30_Step3BFixtureBase
    {
        private Product _milk;
        private Product _latte;

        private void ArrangeLatte(long milkMilli, long milkPerCupMilli, long yieldMilli)
        {
            DatabaseService.SettingsRepo.Set("allow_negative_stock", "0");
            OpenShift(100000);
            _milk = CreateProduct("حليب طازج", 0, 80, milkMilli);
            _latte = CreateProduct("لاتيه", 4000, 0, 0);
            DatabaseService.Recipes.SaveRecipe(new Recipe
            {
                ProductId = _latte.Id,
                Name = "رسبي لاتيه",
                YieldQtyMilli = yieldMilli,
                DepletionMode = "on_sale",
                IsActive = true,
                Ingredients = new List<RecipeIngredient>
                {
                    new RecipeIngredient { IngredientProductId = _milk.Id, QuantityMilli = milkPerCupMilli, WastagePercent = 0 }
                }
            }, true);
            _latte = DatabaseService.Products.GetById(_latte.Id);
        }

        private static JToken FindProduct(JArray products, string id)
        {
            foreach (var p in products)
            {
                if (p["id"].ToString() == id) return p;
            }
            return null;
        }

        [Test]
        public void R2_PosCatalogAndSearch_FlagRecipeItems_AndCheckoutNamesTheMissingIngredient()
        {
            ArrangeLatte(30000, 25000, 1000);
            var plain = CreateProduct("مياه معدنية", 500, 300, 10000);

            JArray catalog = (JArray)Data(DispatchOk("products:getSmartCatalog", new JObject { { "limit", 1000 } }))["products"];
            Assert.IsTrue((bool)FindProduct(catalog, _latte.Id)["consumesIngredientsOnSale"], "الكافيه: صنف الرسبي لا يُفحص رصيده الذاتي في شاشة البيع");
            Assert.IsFalse((bool)FindProduct(catalog, plain.Id)["consumesIngredientsOnSale"]);
            JArray found = (JArray)Data(DispatchOk("products:search", new JObject { { "query", "لاتيه" }, { "limit", 8 } }))["products"];
            Assert.IsTrue((bool)FindProduct(found, _latte.Id)["consumesIngredientsOnSale"]);

            var res = Dispatch("sales:create", SalePayload(new JArray { CartLine(_latte, 2000, 4000) }, 8000, "cash", 8000, null));
            Assert.IsFalse(res.Success);
            StringAssert.Contains("خامة 'حليب طازج' اللازمة لتحضير 'لاتيه' غير كافية", res.Error.Message);
        }

        [Test]
        public void R3_SameKeyWithDifferentData_IsRejected_ForPaymentReturnAndExpense()
        {
            OpenShift(50000);
            var customer = DatabaseService.Customers.SaveCustomer(new Customer { Name = "عميل بصمة", Phone = "01012300011", BalancePiasters = 50000, CreditLimitPiasters = 100000 });
            string payKey = "pay_" + Guid.NewGuid().ToString("N");
            DispatchOk("customers:recordPayment", new JObject { { "customerId", customer.Id }, { "amountPiasters", 10000 }, { "paymentMethod", "cash" }, { "idempotencyKey", payKey } });
            var changedPay = Dispatch("customers:recordPayment", new JObject { { "customerId", customer.Id }, { "amountPiasters", 20000 }, { "paymentMethod", "cash" }, { "idempotencyKey", payKey } });
            Assert.IsFalse(changedPay.Success, "نفس المفتاح بمبلغ مختلف يُرفض ولا يُرجع العملية الأولى بصمت");
            StringAssert.Contains("نفس رقم العملية لطلب مختلف", changedPay.Error.Message);
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM customer_ledger WHERE customer_id = @c AND type = 'payment';", "@c", customer.Id));
            Assert.AreEqual(40000, DatabaseService.Customers.GetById(customer.Id).BalancePiasters);

            var product = CreateProduct("سكر", 2000, 1500, 10000);
            JObject sale = Data(DispatchOk("sales:create", SalePayload(new JArray { CartLine(product, 3000, 2000) }, 6000, "cash", 6000, null)));
            string retKey = "ret_" + Guid.NewGuid().ToString("N");
            DispatchOk("returns:create", ReturnOf(sale, 1000, 2000, retKey));
            var changedRet = Dispatch("returns:create", ReturnOf(sale, 2000, 4000, retKey));
            Assert.IsFalse(changedRet.Success, "نفس المفتاح بكمية مختلفة يُرفض");
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM returns;"));

            string expKey = "exp_" + Guid.NewGuid().ToString("N");
            DispatchOk("expenses:create", new JObject { { "amountPiasters", 1000 }, { "category", "نثريات" }, { "source", "drawer" }, { "idempotencyKey", expKey } });
            var changedExp = Dispatch("expenses:create", new JObject { { "amountPiasters", 9000 }, { "category", "نثريات" }, { "source", "drawer" }, { "idempotencyKey", expKey } });
            Assert.IsFalse(changedExp.Success);
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM expenses;"));
        }

        private static JObject ReturnOf(JObject sale, long quantityMilli, long totalPiasters, string key)
        {
            JToken line = sale["items"][0];
            return new JObject
            {
                { "saleId", sale["id"].ToString() },
                { "reason", "مرتجع من العميل" },
                { "refundMethod", "cash" },
                { "idempotencyKey", key },
                { "items", new JArray
                    {
                        new JObject
                        {
                            { "saleItemId", line["id"].ToString() }, { "productId", line["productId"].ToString() }, { "productName", line["productName"].ToString() },
                            { "quantityMilli", quantityMilli }, { "unitPricePiasters", 2000 }, { "totalPiasters", totalPiasters }, { "isDamaged", false }
                        }
                    }
                }
            };
        }

        [Test]
        public void R4_BatchTrackedIngredient_StaysEqualToStock_AfterSaleAndCancel()
        {
            ArrangeLatte(200000, 25000, 1000);
            DatabaseService.ProductBatchRepo.CreateOrUpdateBatch(new ProductBatch
            {
                ProductId = _milk.Id,
                BatchNumber = "MILK-01",
                ExpiryDate = DateTime.Now.AddDays(10).ToString("yyyy-MM-dd"),
                QuantityMilli = 200000,
                CostPricePiasters = 80,
                Status = "ACTIVE"
            });
            const string batchSum = "SELECT COALESCE(SUM(quantity_milli), 0) FROM product_batches WHERE product_id = @p;";

            string saleId = Data(DispatchOk("sales:create", SalePayload(new JArray { CartLine(_latte, 2000, 4000) }, 8000, "cash", 8000, null)))["id"].ToString();
            Assert.AreEqual(150000, Stock(_milk.Id));
            Assert.AreEqual(Stock(_milk.Id), Scalar(batchSum, "@p", _milk.Id), "التشغيلات = رصيد الخامة بعد البيع");

            DispatchOk("sales:cancel", new JObject { { "saleId", saleId }, { "reason", "طلب العميل" } });
            Assert.AreEqual(200000, Stock(_milk.Id));
            Assert.AreEqual(Stock(_milk.Id), Scalar(batchSum, "@p", _milk.Id), "التشغيلات = رصيد الخامة بعد الإلغاء");
        }

        [Test]
        public void R5_RecipeLineWithZeroRoundedIngredients_IsFlagged_AndCancelDoesNotAddMenuStock()
        {
            // 0.001 ml per 1000 cups rounds to nothing for one cup: no consumption movement is written
            ArrangeLatte(200000, 1, 1000000);
            string saleId = Data(DispatchOk("sales:create", SalePayload(new JArray { CartLine(_latte, 1000, 4000) }, 4000, "cash", 4000, null)))["id"].ToString();
            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM stock_movements WHERE reference_id = @s;", "@s", saleId));
            Assert.AreEqual(0, Scalar("SELECT stock_deducted FROM sale_items WHERE sale_id = @s;", "@s", saleId), "السطر مسجل أنه لم يخصم رصيد الصنف");

            DispatchOk("sales:cancel", new JObject { { "saleId", saleId }, { "reason", "طلب العميل" } });
            Assert.AreEqual(0, Stock(_latte.Id), "الإلغاء لا يضيف رصيداً لم يُخصم");
        }

        [Test]
        public void R6_InvoiceReturn_UsesTheInvoiceCustomer_AndRejectsAnotherOne()
        {
            OpenShift(0);
            var product = CreateProduct("دقيق", 2500, 2000, 100000);
            var owner = DatabaseService.Customers.SaveCustomer(new Customer { Name = "صاحب الفاتورة", Phone = "01033300011", CreditLimitPiasters = 100000 });
            var other = DatabaseService.Customers.SaveCustomer(new Customer { Name = "عميل آخر", Phone = "01033300022", CreditLimitPiasters = 100000 });
            JObject sale = Data(DispatchOk("sales:create", SalePayload(new JArray { CartLine(product, 2000, 2500) }, 5000, "credit", 0, owner.Id)));
            var payload = ReturnOf(sale, 1000, 2500, Guid.NewGuid().ToString());
            payload["refundMethod"] = "credit";
            payload["items"][0]["unitPricePiasters"] = 2500;

            var spoofed = (JObject)payload.DeepClone();
            spoofed["customerId"] = other.Id;
            spoofed["idempotencyKey"] = Guid.NewGuid().ToString();
            var rejected = Dispatch("returns:create", spoofed);
            Assert.IsFalse(rejected.Success, "لا يُضاف مرتجع فاتورة لحساب عميل آخر");
            StringAssert.Contains("يختلف عن عميل الفاتورة", rejected.Error.Message);
            Assert.AreEqual(0, DatabaseService.Customers.GetById(other.Id).BalancePiasters);

            DispatchOk("returns:create", payload);
            Assert.AreEqual(2500, DatabaseService.Customers.GetById(owner.Id).BalancePiasters, "المرتجع خصم من دين صاحب الفاتورة");
        }

        [Test]
        public void Leftover_DrawerMovementsAndEpay_AreRetrySafe()
        {
            DatabaseService.SettingsRepo.Set("feature_epay_services", "1");
            var shift = OpenShift(100000);
            string inKey = "cin_" + Guid.NewGuid().ToString("N");
            var cashIn = new JObject { { "shiftId", shift.Id }, { "amountPiasters", 5000 }, { "reason", "فكة" }, { "idempotencyKey", inKey } };
            DispatchOk("shifts:cashIn", cashIn);
            DispatchOk("shifts:cashIn", (JObject)cashIn.DeepClone());
            var changedIn = (JObject)cashIn.DeepClone();
            changedIn["amountPiasters"] = 7000;
            Assert.IsFalse(Dispatch("shifts:cashIn", changedIn).Success);
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM cash_drawer_transactions WHERE type = 'cash_in';"), "إيداع واحد فقط");

            var terminal = new RafiqPOS.Repositories.EpayRepository(DatabaseService.ConnectionString, DatabaseService.AuditRepo).SaveTerminal(new EpayTerminal
            {
                Name = "ماكينة فوري",
                Provider = "fawry",
                IsActive = true,
                CustomerFeeType = "fixed"
            });
            var fund = new JObject { { "terminalId", terminal.Id }, { "amountPiasters", 20000 }, { "fundingSource", "cash_drawer" }, { "idempotencyKey", "fund_" + Guid.NewGuid().ToString("N") } };
            DispatchOk("epay:fundTerminal", fund);
            DispatchOk("epay:fundTerminal", (JObject)fund.DeepClone());
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM epay_terminal_fundings WHERE terminal_id = @t;", "@t", terminal.Id));
            Assert.AreEqual(20000, Scalar("SELECT balance_piasters FROM epay_terminals WHERE id = @t;", "@t", terminal.Id), "التغذية مرة واحدة");

            var tx = new JObject
            {
                { "terminalId", terminal.Id }, { "serviceType", "bill_payment" }, { "serviceName", "فاتورة كهرباء" },
                { "billAmountPiasters", 10000 }, { "customerFeePiasters", 300 }, { "providerCommissionPiasters", 0 },
                { "paymentDestination", "cash_drawer" }, { "paymentChannel", "cash_drawer" }, { "idempotencyKey", "epay_" + Guid.NewGuid().ToString("N") }
            };
            string firstId = Data(DispatchOk("epay:createTransaction", tx))["id"].ToString();
            string retryId = Data(DispatchOk("epay:createTransaction", (JObject)tx.DeepClone()))["id"].ToString();
            Assert.AreEqual(firstId, retryId);
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM epay_transactions;"), "عملية دفع إلكتروني واحدة");
        }
    }
}
