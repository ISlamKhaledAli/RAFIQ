using System;
using System.Collections.Generic;
using System.Data.SQLite;
using NUnit.Framework;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// M2 (المرحلة 1): سعر الوحدة المعبأة (كرتونة 12) يُراجع مقابل سعرها هي لا سعر الوحدة الأساسية:
    /// بيع الكرتونة بسعر القطعة يحتاج صلاحية تعديل السعر أو اعتماد مشرف.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S38_PackagedUnitPriceAuthorityTest : TestBase
    {
        private const string AdminId = "usr_admin_default";
        private const string CashierId = "usr_cashier_1";
        private const string SupervisorPin = "7418";

        private Product _product;
        private ProductUnit _box;

        [SetUp]
        public void LoginCashierAndCreateBoxProduct()
        {
            SecurityService.ChangeUserPin(AdminId, SupervisorPin);
            var cashier = UserRepo.GetById(CashierId);
            Assert.IsNotNull(cashier, "الكاشير المبدئي غير موجود");
            SecurityService.SetCurrentUserForTesting(SecurityService.MapToDto(cashier));

            // قطعة بسعر 10.00 ج، وكرتونة 12 قطعة بسعر 110.00 ج
            _product = CreateTestProduct("صنف كرتونة", 1000, 600, 1000000);
            var unitService = new ProductUnitService(ConnectionString);
            unitService.EnsureDefaultBaseUnit(_product);
            _box = unitService.CreateUnit(new ProductUnit
            {
                ProductId = _product.Id,
                UnitName = "box",
                ConversionFactor = 12,
                IsBaseUnit = false,
                SellPricePiasters = 11000,
                CostPricePiasters = 7200,
                Barcode = "BC_BOX_" + Guid.NewGuid().ToString("N").Substring(0, 8),
                IsDivisible = false,
                SortOrder = 1
            });
        }

        [TearDown]
        public override void BaseTearDown()
        {
            SecurityService.SetCurrentUserForTesting(null);
            base.BaseTearDown();
        }

        private Sale BoxSale(long unitPricePiasters, string supervisorPin)
        {
            return new Sale
            {
                CashierId = CashierId,
                PaymentMethod = "cash",
                PaidPiasters = unitPricePiasters,
                SupervisorPin = supervisorPin,
                Items = new List<SaleItem>
                {
                    new SaleItem
                    {
                        ProductId = _product.Id,
                        ProductName = _product.Name,
                        UnitId = _box.Id,
                        UnitName = _box.UnitName,
                        ConversionFactor = 12,
                        QuantityMilli = 1000,
                        UnitPricePiasters = unitPricePiasters,
                        TotalPiasters = unitPricePiasters
                    }
                }
            };
        }

        private Sale PieceSale(long unitPricePiasters)
        {
            return new Sale
            {
                CashierId = CashierId,
                PaymentMethod = "cash",
                PaidPiasters = unitPricePiasters,
                Items = new List<SaleItem>
                {
                    new SaleItem
                    {
                        ProductId = _product.Id,
                        ProductName = _product.Name,
                        ConversionFactor = 1,
                        QuantityMilli = 1000,
                        UnitPricePiasters = unitPricePiasters,
                        TotalPiasters = unitPricePiasters
                    }
                }
            };
        }

        private long CountSales()
        {
            using (var conn = new SQLiteConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("SELECT COUNT(*) FROM sales;", conn))
                {
                    return Convert.ToInt64(cmd.ExecuteScalar());
                }
            }
        }

        private long CountAudit(string action)
        {
            using (var conn = new SQLiteConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("SELECT COUNT(*) FROM audit_logs WHERE action = @a;", conn))
                {
                    cmd.Parameters.AddWithValue("@a", action);
                    return Convert.ToInt64(cmd.ExecuteScalar());
                }
            }
        }

        [Test]
        public void Cashier_BoxLinePricedAsSinglePiece_IsRejected()
        {
            var ex = Assert.Throws<InvalidOperationException>(delegate { SaleService.ProcessSale(BoxSale(1000, null), null); });
            StringAssert.Contains("يختلف عن سعر الكتالوج", ex.Message);
            Assert.AreEqual(0, CountSales(), "لا فاتورة بسعر القطعة للكرتونة");
            Assert.AreEqual(1000000, ProductRepo.GetById(_product.Id).StockQuantityMilli, "المخزون لم يتأثر");
        }

        [Test]
        public void Cashier_BoxLineAtTheBoxCataloguePrice_IsAccepted()
        {
            var sale = SaleService.ProcessSale(BoxSale(11000, null), null);

            Assert.IsNotNull(sale);
            Assert.AreEqual(11000, sale.Items[0].UnitPricePiasters, "سعر الكرتونة المحفوظ");
            Assert.AreEqual(12, sale.Items[0].ConversionFactor, "معامل الكرتونة المحفوظ");
            Assert.AreEqual(11000, sale.TotalPiasters);
            Assert.AreEqual(1000000 - 12000, ProductRepo.GetById(_product.Id).StockQuantityMilli, "الكرتونة تخصم 12 قطعة من المخزون");
        }

        [Test]
        public void Cashier_PieceLineAtThePiecePrice_IsAccepted()
        {
            var sale = SaleService.ProcessSale(PieceSale(1000), null);

            Assert.IsNotNull(sale);
            Assert.AreEqual(1000, sale.Items[0].UnitPricePiasters);
            Assert.AreEqual(1, sale.Items[0].ConversionFactor);
            Assert.AreEqual(1000000 - 1000, ProductRepo.GetById(_product.Id).StockQuantityMilli);
        }

        [Test]
        public void UserWithPriceOverridePermission_MayPriceTheBoxAtThePiecePrice()
        {
            var cashier = UserRepo.GetById(CashierId);
            cashier.PermissionsJson = "{\"pos.price_override\":true}";
            UserRepo.Update(cashier);

            var sale = SaleService.ProcessSale(BoxSale(1000, null), null);

            Assert.IsNotNull(sale);
            Assert.AreEqual(1000, sale.Items[0].UnitPricePiasters, "صاحب الصلاحية يعدل السعر");
            Assert.AreEqual(12, sale.Items[0].ConversionFactor);
        }

        [Test]
        public void SupervisorAuthorization_AllowsBoxAtPiecePrice_AndIsAudited()
        {
            var ex = Assert.Throws<InvalidOperationException>(delegate { SaleService.ProcessSale(BoxSale(1000, null), null); });
            StringAssert.Contains("يختلف عن سعر الكتالوج", ex.Message);
            Assert.AreEqual(0, CountAudit("SALE_PRICE_OVERRIDE_APPROVED"));

            var sale = SaleService.ProcessSale(BoxSale(1000, SupervisorPin), null);

            Assert.IsNotNull(sale);
            Assert.AreEqual(1000, sale.Items[0].UnitPricePiasters, "السعر المعتمد محفوظ");
            Assert.AreEqual(1, CountAudit("SALE_PRICE_OVERRIDE_APPROVED"), "اعتماد المشرف مسجل في سجل المراجعة");
        }
    }
}
