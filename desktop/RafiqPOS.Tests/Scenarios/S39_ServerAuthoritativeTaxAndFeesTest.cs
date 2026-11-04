using System;
using System.Collections.Generic;
using System.Data.SQLite;
using NUnit.Framework;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// M3 + M6 (المرحلة 1): الخادم هو مصدر الضريبة والرسوم. نسبة الضريبة من الكتالوج وليست من العميل،
    /// رسوم الخدمة والتوصيل تُقبل فقط لنوع الطلب المناسب ولصاحب الصلاحية وإلا تُرفض الفاتورة كلها (لا تُضاف ولا تُحذف بصمت)،
    /// رسوم الدفع الإلكتروني تُحتسب من الإعدادات، والأسعار شاملة الضريبة دائماً حتى لو كان إعداد prices_include_tax مطفأ.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S39_ServerAuthoritativeTaxAndFeesTest : TestBase
    {
        private const string CashierId = "usr_cashier_1";

        [SetUp]
        public void LoginCashier()
        {
            var cashier = UserRepo.GetById(CashierId);
            Assert.IsNotNull(cashier, "الكاشير المبدئي غير موجود");
            SecurityService.SetCurrentUserForTesting(SecurityService.MapToDto(cashier));
        }

        [TearDown]
        public override void BaseTearDown()
        {
            SecurityService.SetCurrentUserForTesting(null);
            base.BaseTearDown();
        }

        private long Scalar(string sql, params object[] nameValuePairs)
        {
            using (var conn = new SQLiteConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    for (int i = 0; i + 1 < nameValuePairs.Length; i += 2)
                    {
                        cmd.Parameters.AddWithValue((string)nameValuePairs[i], nameValuePairs[i + 1]);
                    }
                    object val = cmd.ExecuteScalar();
                    return val == null || val == DBNull.Value ? 0 : Convert.ToInt64(val);
                }
            }
        }

        private void SetCashierPermissions(string permissionsJson)
        {
            var cashier = UserRepo.GetById(CashierId);
            cashier.PermissionsJson = permissionsJson;
            UserRepo.Update(cashier);
        }

        private Product CreateTaxedProduct(string name, long pricePiasters, int taxRatePercent)
        {
            return ProductService.SaveProduct(new Product
            {
                Name = name,
                Barcode = "BAR_" + Guid.NewGuid().ToString("N").Substring(0, 8),
                PricePiasters = pricePiasters,
                CostPiasters = 3000,
                StockQuantityMilli = 100000,
                Unit = "piece",
                TaxRatePercent = taxRatePercent,
                IsActive = true
            }, true, true);
        }

        private static Sale BuildSale(Product product, long unitPricePiasters, long paidPiasters)
        {
            return new Sale
            {
                CashierId = CashierId,
                PaymentMethod = "cash",
                PaidPiasters = paidPiasters,
                Items = new List<SaleItem>
                {
                    new SaleItem { ProductId = product.Id, ProductName = product.Name, QuantityMilli = 1000, UnitPricePiasters = unitPricePiasters, TotalPiasters = unitPricePiasters }
                }
            };
        }

        // ---------- M3: tax ----------

        [Test]
        public void ClientTaxRate_OnZeroTaxProduct_IsIgnored_StoredTaxIsZero()
        {
            var product = CreateTaxedProduct("صنف بدون ضريبة", 11400, 0);
            var sale = BuildSale(product, 11400, 11400);
            sale.Items[0].TaxRatePercent = 14;

            var created = SaleService.ProcessSale(sale, null);

            Assert.AreEqual(0, created.TaxPiasters, "ضريبة الفاتورة صفر");
            Assert.AreEqual(0, created.Items[0].TaxPiasters, "ضريبة السطر صفر");
            Assert.AreEqual(11400, created.TotalPiasters, "الإجمالي كما هو");
            Assert.AreEqual(0, Scalar("SELECT COALESCE(SUM(tax_piasters), 0) FROM sale_items WHERE sale_id = @s;", "@s", created.Id), "ضريبة الأسطر المخزنة");
            Assert.AreEqual(0, Scalar("SELECT tax_piasters FROM sales WHERE id = @s;", "@s", created.Id), "ضريبة الفاتورة المخزنة");
        }

        [Test]
        public void ClientZeroTaxRate_OnTaxedProduct_CannotAvoidTheCatalogueTax()
        {
            var product = CreateTaxedProduct("صنف ضريبي", 11400, 14);
            var sale = BuildSale(product, 11400, 11400);
            sale.Items[0].TaxRatePercent = 0;

            var created = SaleService.ProcessSale(sale, null);

            Assert.AreEqual(1400, created.TaxPiasters, "الضريبة من نسبة الكتالوج 14%");
            Assert.AreEqual(11400, created.TotalPiasters);
        }

        // ---------- M6: prices are always tax inclusive ----------

        [Test]
        public void PricesIncludeTaxSettingOff_StillDoesNotAddTaxOnTopOfThePrice()
        {
            SettingsRepo.Set("prices_include_tax", "0");
            var product = CreateTaxedProduct("شامبو ضريبي 14%", 11400, 14);
            var sale = BuildSale(product, 11400, 11400);

            var created = SaleService.ProcessSale(sale, null);

            Assert.AreEqual(11400, created.TotalPiasters, "114.00 ج تبقى 114.00 ج");
            Assert.AreEqual(1400, created.TaxPiasters, "الضريبة مستخرجة من السعر");
            Assert.AreEqual(11400, created.PaidPiasters);
            Assert.AreEqual(0, created.ChangePiasters);
            Assert.AreEqual(11400, Scalar("SELECT total_piasters FROM sales WHERE id = @s;", "@s", created.Id), "الإجمالي المخزن");
            Assert.AreEqual(1400, Scalar("SELECT tax_piasters FROM sales WHERE id = @s;", "@s", created.Id), "الضريبة المخزنة");
        }

        // ---------- M3: service charge ----------

        private void AssertFeeIsRejected(Sale sale, string messagePart)
        {
            long salesBefore = Scalar("SELECT COUNT(*) FROM sales;");
            var ex = Assert.Throws<InvalidOperationException>(delegate { SaleService.ProcessSale(sale, null); });
            StringAssert.Contains(messagePart, ex.Message);
            Assert.AreEqual(salesBefore, Scalar("SELECT COUNT(*) FROM sales;"), "الفاتورة المرفوضة لا تُحفظ");
        }

        [Test]
        public void ServiceCharge_OnTakeawayOrder_IsRejected_AndNeverAddedToTheTotal()
        {
            var product = CreateTaxedProduct("وجبة سفري", 5000, 0);
            var sale = BuildSale(product, 5000, 6000);
            sale.OrderType = "takeaway";
            sale.ServiceChargePiasters = 500;

            AssertFeeIsRejected(sale, "رسوم الخدمة غير مسموح");
            Assert.AreEqual(100000, ProductRepo.GetById(product.Id).StockQuantityMilli, "المخزون لم يتأثر بالفاتورة المرفوضة");
        }

        [Test]
        public void ServiceCharge_OnDineInOrder_NeedsTheManageOrdersPermission()
        {
            var product = CreateTaxedProduct("وجبة صالة", 5000, 0);

            // الكاشير الافتراضي يملك tables.manage_orders
            var allowed = BuildSale(product, 5000, 6000);
            allowed.OrderType = "dine_in";
            allowed.ServiceChargePiasters = 500;
            var withFee = SaleService.ProcessSale(allowed, null);
            Assert.AreEqual(5500, withFee.TotalPiasters, "رسوم الخدمة مشمولة لصاحب الصلاحية");
            Assert.AreEqual(500, Scalar("SELECT service_charge_piasters FROM sales WHERE id = @s;", "@s", withFee.Id));

            SetCashierPermissions("{\"tables.manage_orders\":false}");
            var denied = BuildSale(product, 5000, 6000);
            denied.OrderType = "dine_in";
            denied.ServiceChargePiasters = 500;
            AssertFeeIsRejected(denied, "رسوم الخدمة غير مسموح");

            // بدون رسوم يبيع نفس المستخدم طلب الصالة عادياً
            var noFee = BuildSale(product, 5000, 5000);
            noFee.OrderType = "dine_in";
            Assert.AreEqual(5000, SaleService.ProcessSale(noFee, null).TotalPiasters, "طلب صالة بلا رسوم");
        }

        // ---------- M3: delivery fee ----------

        [Test]
        public void DeliveryFee_OnTakeawayOrder_IsRejected_AndNeverAddedToTheTotal()
        {
            var product = CreateTaxedProduct("وجبة سفري 2", 5000, 0);
            var sale = BuildSale(product, 5000, 10000);
            sale.OrderType = "takeaway";
            sale.DeliveryFeePiasters = 2500;

            AssertFeeIsRejected(sale, "رسوم التوصيل غير مسموح");
        }

        [Test]
        public void DeliveryFee_OnDeliveryOrder_NeedsTheDeliveryManagePermission()
        {
            var product = CreateTaxedProduct("وجبة توصيل", 5000, 0);

            // الكاشير الافتراضي يملك delivery.orders.manage
            var allowed = BuildSale(product, 5000, 10000);
            allowed.OrderType = "delivery";
            allowed.DeliveryFeePiasters = 2500;
            var withFee = SaleService.ProcessSale(allowed, null);
            Assert.AreEqual(7500, withFee.TotalPiasters, "رسوم التوصيل مشمولة لصاحب الصلاحية");
            Assert.AreEqual(2500, Scalar("SELECT delivery_fee_piasters FROM sales WHERE id = @s;", "@s", withFee.Id));

            SetCashierPermissions("{\"delivery.orders.manage\":false}");
            var denied = BuildSale(product, 5000, 10000);
            denied.OrderType = "delivery";
            denied.DeliveryFeePiasters = 2500;
            AssertFeeIsRejected(denied, "رسوم التوصيل غير مسموح");
        }

        [Test]
        public void Fees_OfTheWrongOrderType_AreRejected_EvenForAUserWithBothPermissions()
        {
            var product = CreateTaxedProduct("وجبة نوع خاطئ", 5000, 0);

            var dineInWithDeliveryFee = BuildSale(product, 5000, 10000);
            dineInWithDeliveryFee.OrderType = "dine_in";
            dineInWithDeliveryFee.DeliveryFeePiasters = 2500;
            AssertFeeIsRejected(dineInWithDeliveryFee, "رسوم التوصيل غير مسموح");

            var deliveryWithServiceCharge = BuildSale(product, 5000, 10000);
            deliveryWithServiceCharge.OrderType = "delivery";
            deliveryWithServiceCharge.ServiceChargePiasters = 500;
            AssertFeeIsRejected(deliveryWithServiceCharge, "رسوم الخدمة غير مسموح");
        }

        // ---------- R3 (round 2): fee guard details ----------

        [Test]
        public void DineIn_ServiceCharge1500_WithoutManageOrders_IsRejected_WithAnArabicMessage_AndNoSaleIsSaved()
        {
            var product = CreateTaxedProduct("وجبة صالة بدون صلاحية", 5000, 0);
            SetCashierPermissions("{\"tables.manage_orders\":false}");
            var sale = BuildSale(product, 5000, 7000);
            sale.OrderType = "dine_in";
            sale.ServiceChargePiasters = 1500;

            var ex = Assert.Throws<InvalidOperationException>(delegate { SaleService.ProcessSale(sale, null); });

            StringAssert.Contains("رسوم الخدمة", ex.Message);
            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM sales;"), "لا فاتورة محفوظة");
            Assert.AreEqual(100000, ProductRepo.GetById(product.Id).StockQuantityMilli, "المخزون لم يتأثر");
        }

        [Test]
        public void DineIn_ServiceCharge1500_WithManageOrders_IsAddedToTheNetTotal()
        {
            var product = CreateTaxedProduct("وجبة صالة بصلاحية", 5000, 0);
            SetCashierPermissions("{\"tables.manage_orders\":true}");
            var sale = BuildSale(product, 5000, 6500);
            sale.OrderType = "dine_in";
            sale.ServiceChargePiasters = 1500;

            var created = SaleService.ProcessSale(sale, null);

            Assert.AreEqual(6500, created.TotalPiasters, "الصافي 5000 + رسوم الخدمة 1500");
            Assert.AreEqual(1500, Scalar("SELECT service_charge_piasters FROM sales WHERE id = @s;", "@s", created.Id));
        }

        [Test]
        public void ZeroFees_AreAlwaysAccepted_AndNegativeFees_AreClampedToZero()
        {
            var product = CreateTaxedProduct("وجبة بلا رسوم", 5000, 0);
            SetCashierPermissions("{\"tables.manage_orders\":false,\"delivery.orders.manage\":false}");

            var noFee = BuildSale(product, 5000, 5000);
            noFee.OrderType = "dine_in";
            Assert.AreEqual(5000, SaleService.ProcessSale(noFee, null).TotalPiasters, "رسوم صفر مقبولة");

            var negativeService = BuildSale(product, 5000, 5000);
            negativeService.OrderType = "takeaway";
            negativeService.ServiceChargePiasters = -500;
            var createdService = SaleService.ProcessSale(negativeService, null);
            Assert.AreEqual(5000, createdService.TotalPiasters, "الرسوم السالبة لا تخصم من الإجمالي");
            Assert.AreEqual(0, Scalar("SELECT service_charge_piasters FROM sales WHERE id = @s;", "@s", createdService.Id));

            var negativeDelivery = BuildSale(product, 5000, 5000);
            negativeDelivery.OrderType = "takeaway";
            negativeDelivery.DeliveryFeePiasters = -500;
            var createdDelivery = SaleService.ProcessSale(negativeDelivery, null);
            Assert.AreEqual(5000, createdDelivery.TotalPiasters);
            Assert.AreEqual(0, Scalar("SELECT delivery_fee_piasters FROM sales WHERE id = @s;", "@s", createdDelivery.Id));
        }

        [Test]
        public void TakeawayDeliveryFee500_AndDeliveryOrderWithoutDeliveryPermission_AreRejected()
        {
            var product = CreateTaxedProduct("وجبة رسوم مرفوضة", 5000, 0);

            var takeaway = BuildSale(product, 5000, 5500);
            takeaway.OrderType = "takeaway";
            takeaway.DeliveryFeePiasters = 500;
            AssertFeeIsRejected(takeaway, "رسوم التوصيل");

            SetCashierPermissions("{\"delivery.orders.manage\":false}");
            var delivery = BuildSale(product, 5000, 5500);
            delivery.OrderType = "delivery";
            delivery.DeliveryFeePiasters = 500;
            AssertFeeIsRejected(delivery, "رسوم التوصيل");
        }

        [Test]
        public void WithoutALoggedInUser_TheFeeIsKept_AsInTheCafeSuite()
        {
            SecurityService.SetCurrentUserForTesting(null);
            var product = CreateTaxedProduct("وجبة بلا مستخدم", 5000, 0);
            var sale = BuildSale(product, 5000, 5500);
            sale.OrderType = "takeaway";
            sale.ServiceChargePiasters = 500;

            var created = SaleService.ProcessSale(sale, null);

            Assert.AreEqual(5500, created.TotalPiasters, "بدون مستخدم حالي لا يُطبق حارس الرسوم (الإنتاج دائماً بمستخدم)");
        }

        // ---------- M3: e-payment service fee ----------

        [Test]
        public void ClientServiceFee_OnCashSale_IsDiscarded_StoredFeeIsZero()
        {
            var product = CreateTaxedProduct("صنف نقدي", 5000, 0);
            var sale = BuildSale(product, 5000, 5000);
            sale.ServiceFeePiasters = 999;

            var created = SaleService.ProcessSale(sale, null);

            Assert.AreEqual(0, created.ServiceFeePiasters, "رسوم الدفع الإلكتروني لا تُقبل من العميل");
            Assert.AreEqual(5000, created.TotalPiasters);
            Assert.AreEqual(5000, created.PaidPiasters, "المدفوع كما هو دون رسوم");
            Assert.AreEqual(0, Scalar("SELECT service_fee_piasters FROM sales WHERE id = @s;", "@s", created.Id), "الرسوم المخزنة");
        }
    }
}
