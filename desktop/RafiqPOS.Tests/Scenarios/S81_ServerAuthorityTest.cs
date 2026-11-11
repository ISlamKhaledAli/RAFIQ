using System;
using System.Collections.Generic;
using RafiqPOS.Data;
using Newtonsoft.Json;
using NUnit.Framework;
using RafiqPOS.Models;
using RafiqPOS.Repositories;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// السلطة للخادم: بصمة السلة لمفتاح منع التكرار، حالة الفاتورة وطريقة الدفع من قائمة بيضاء،
    /// سعر مكونات الكومبو من الإعداد (لا مطابقة نصية)، وعدم دهس أسعار الوحدات المخصصة عند الشراء.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S81_ServerAuthorityTest : TestBase
    {
        private const string AdminId = "usr_admin_default";
        private const string CashierId = "usr_cashier_1";

        [TearDown]
        public override void BaseTearDown()
        {
            SecurityService.SetCurrentUserForTesting(null);
            base.BaseTearDown();
        }

        private Sale BuildSale(Product product, long quantityMilli)
        {
            long total = 1000 * quantityMilli / 1000;
            return new Sale
            {
                PaymentMethod = "cash",
                PaidPiasters = total,
                Items = new List<SaleItem>
                {
                    new SaleItem { ProductId = product.Id, ProductName = product.Name, QuantityMilli = quantityMilli, UnitPricePiasters = 1000, TotalPiasters = total }
                }
            };
        }

        private long Count(string sql, string param, object value)
        {
            using (var conn = new SQLiteConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    if (param != null) cmd.Parameters.AddWithValue(param, value);
                    object val = cmd.ExecuteScalar();
                    return val == null || val == DBNull.Value ? 0 : Convert.ToInt64(val);
                }
            }
        }

        // ---------- C: one idempotency key = one cart ----------

        [Test]
        public void SameKey_WithADifferentCart_IsRejected_AndTheSameCartReturnsTheFirstSale()
        {
            var product = CreateTestProduct("صنف مفتاح", 1000, 600, 100000);
            string key = "cart_" + Guid.NewGuid().ToString("N");

            Sale first = SaleService.ProcessSale(BuildSale(product, 1000), key);

            var ex = Assert.Throws<InvalidOperationException>(delegate { SaleService.ProcessSale(BuildSale(product, 2000), key); });
            StringAssert.Contains("نفس رقم العملية", ex.Message);
            Sale retry = SaleService.ProcessSale(BuildSale(product, 1000), key);
            Assert.AreEqual(first.Id, retry.Id, "نفس السلة = نفس الفاتورة");

            // Across an app restart the persistent key is compared with the stored cart too
            SaleService.ClearIdempotencyCache();
            Assert.Throws<InvalidOperationException>(delegate { SaleService.ProcessSale(BuildSale(product, 3000), key); });
            Assert.AreEqual(first.Id, SaleService.ProcessSale(BuildSale(product, 1000), key).Id);

            Assert.AreEqual(1, Count("SELECT COUNT(*) FROM sales;", null, null), "فاتورة واحدة فقط");
            Assert.AreEqual(99000, ProductRepo.GetById(product.Id).StockQuantityMilli, "خصم المخزون مرة واحدة");
        }

        // ---------- D: status and payment method are whitelisted server-side ----------

        [Test]
        public void ClientStatusIsIgnored_PaymentMethodIsLowerCased_AndUnknownMethodIsRejected()
        {
            var product = CreateTestProduct("صنف حالة", 1000, 600, 100000);

            Sale forged = BuildSale(product, 1000);
            forged.Status = "cancelled";
            forged.PaymentMethod = "CASH";
            Sale created = SaleService.ProcessSale(forged, null);
            Assert.AreEqual("completed", created.Status, "الحالة يحددها الخادم");
            Assert.AreEqual("cash", created.PaymentMethod, "طريقة الدفع بأحرف صغيرة");
            Assert.AreEqual("completed", Convert.ToString(CountText("SELECT status FROM sales WHERE id = @p;", created.Id)));
            Assert.AreEqual("cash", Convert.ToString(CountText("SELECT payment_method FROM sales WHERE id = @p;", created.Id)));

            Sale unknown = BuildSale(product, 1000);
            unknown.PaymentMethod = "bitcoin";
            var ex = Assert.Throws<InvalidOperationException>(delegate { SaleService.ProcessSale(unknown, null); });
            StringAssert.Contains("غير مدعومة", ex.Message);
            Assert.AreEqual(1, Count("SELECT COUNT(*) FROM sales;", null, null), "الفاتورة المرفوضة لم تُسجل");
        }

        private object CountText(string sql, object value)
        {
            using (var conn = new SQLiteConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@p", value);
                    return cmd.ExecuteScalar();
                }
            }
        }

        // ---------- E: a bundle component is priced by the bundle configuration ----------

        [Test]
        public void BundleComponent_IsAcceptedOnlyAtTheConfiguredAllocation_NotAtAnyPrice()
        {
            var comp1 = CreateTestProduct("ساندوتش كفتة", 6000, 3500, 100000);
            var comp2 = CreateTestProduct("كانز كولا", 2000, 1200, 100000);
            var quickRepo = new QuickItemRepository(ConnectionString);
            string bundleJson = JsonConvert.SerializeObject(new object[]
            {
                new { productId = comp1.Id, productName = comp1.Name, quantityMilli = 1000, originalPricePiasters = 6000 },
                new { productId = comp2.Id, productName = comp2.Name, quantityMilli = 1000, originalPricePiasters = 2000 }
            });
            quickRepo.Save(new QuickItem { Name = "عرض كفتة وكولا", PricePiasters = 6500, Unit = "piece", CategoryName = "عروض", BundleItemsJson = bundleJson });
            var service = new SaleService(SaleRepo, ProductRepo, quickRepo);

            SecurityService.ChangeUserPin(AdminId, "7418");
            SecurityService.SetCurrentUserForTesting(SecurityService.MapToDto(UserRepo.GetById(CashierId)));

            Func<long, long, Sale> build = delegate(long price1, long price2)
            {
                return new Sale
                {
                    CashierId = CashierId,
                    PaymentMethod = "cash",
                    PaidPiasters = price1 + price2,
                    Items = new List<SaleItem>
                    {
                        new SaleItem { ProductId = comp1.Id, ProductName = comp1.Name, QuantityMilli = 1000, UnitPricePiasters = price1, TotalPiasters = price1 },
                        new SaleItem { ProductId = comp2.Id, ProductName = comp2.Name, QuantityMilli = 1000, UnitPricePiasters = price2, TotalPiasters = price2 }
                    }
                };
            };

            // 6000 / 8000 of 65.00 = 48.75 and the remainder 16.25 (same split as the POS)
            var cheap = Assert.Throws<InvalidOperationException>(delegate { service.ProcessSale(build(1, 1625), null); });
            StringAssert.Contains("يختلف عن سعر الكتالوج", cheap.Message);
            var off = Assert.Throws<InvalidOperationException>(delegate { service.ProcessSale(build(4876, 1625), null); });
            StringAssert.Contains("يختلف عن سعر الكتالوج", off.Message);

            Sale ok = service.ProcessSale(build(4875, 1625), null);
            Assert.AreEqual(6500, ok.TotalPiasters, "سعر العرض كما هو معرّف");
        }

        // ---------- payment brands are canonicalised to the buckets reports, caps and account ledger use ----------

        [TestCase("visa", "card")]
        [TestCase("MASTERCARD", "card")]
        [TestCase("meeza", "card")]
        [TestCase("orange_cash", "wallet")]
        [TestCase("etisalat_cash", "wallet")]
        [TestCase("we_pay", "wallet")]
        [TestCase("split", "multi")]
        [TestCase("Vodafone_Cash", "vodafone_cash")]
        [TestCase("", "cash")]
        public void PaymentMethod_Brands_AreCanonicalised(string input, string expected)
        {
            Assert.AreEqual(expected, SaleService.NormalizeSalePaymentMethod(input));
        }

        [Test]
        public void PaymentMethod_UnknownBrand_IsRejected_AndAVisaSaleIsStoredAsCard()
        {
            Assert.Throws<InvalidOperationException>(delegate { SaleService.NormalizeSalePaymentMethod("pos_terminal_x"); });

            var product = CreateTestProduct("صنف فيزا", 1000, 600, 100000);
            Sale visa = BuildSale(product, 1000);
            visa.PaymentMethod = "VISA";
            Sale created = SaleService.ProcessSale(visa, null);
            Assert.AreEqual("card", created.PaymentMethod);
            Assert.AreEqual("card", Convert.ToString(CountText("SELECT payment_method FROM sales WHERE id = @p;", created.Id)));
        }

        // ---------- the same key means the same cart, pack size included ----------

        [Test]
        public void SameKey_WithADifferentPackSize_IsRejected()
        {
            var product = CreateTestProduct("صنف عبوة", 1000, 600, 100000);
            string key = "pack_" + Guid.NewGuid().ToString("N");
            Sale pieces = BuildSale(product, 1000);
            SaleService.ProcessSale(pieces, key);

            Sale carton = BuildSale(product, 1000);
            carton.Items[0].ConversionFactor = 12;
            Assert.Throws<InvalidOperationException>(delegate { SaleService.ProcessSale(carton, key); }, "كرتونة مقابل قطع بنفس الكمية سلة مختلفة");
        }

        // ---------- client keys cannot impersonate the linked rows of a split refund ----------

        [Test]
        public void ReturnWithAReservedSplitKey_IsRejected_InAnyCase()
        {
            var product = CreateTestProduct("صنف مرتجع", 1000, 600, 100000);
            foreach (string reserved in new string[] { "split:abc", "SPLIT:abc:1", "  Split:x " })
            {
                string key = reserved;
                var ret = new Return { RefundMethod = "cash", Reason = "test", IdempotencyKey = key, IsWithoutInvoice = true };
                ret.Items.Add(new ReturnItem { ProductId = product.Id, ProductName = product.Name, QuantityMilli = 1000, UnitPricePiasters = 1000 });

                var ex = Assert.Throws<InvalidOperationException>(delegate { ReturnService.ProcessReturn(ret, null); });
                StringAssert.Contains("محجوز", ex.Message);
            }
            Assert.AreEqual(0, Count("SELECT COUNT(*) FROM returns;", null, null));
        }

        // ---------- G: a purchase keeps deliberately set unit prices ----------

        [Test]
        public void Purchase_NewBasePrice_MovesOnlyDerivedUnits_AndKeepsCustomOnes()
        {
            var prod = CreateTestProduct("بسكويت", 1000, 800, 0);
            var unitRepo = new ProductUnitRepository(ConnectionString);
            var carton = new ProductUnit { ProductId = prod.Id, UnitName = "كرتونة", ConversionFactor = 12, IsBaseUnit = false, SellPricePiasters = 12000, CostPricePiasters = 9600, SortOrder = 1 };
            var custom = new ProductUnit { ProductId = prod.Id, UnitName = "علبة", ConversionFactor = 6, IsBaseUnit = false, SellPricePiasters = 5500, CostPricePiasters = 4000, SortOrder = 2 };
            unitRepo.Create(carton);
            unitRepo.Create(custom);

            var repo = new PurchaseRepository(ConnectionString, CounterRepo, SupplierRepo, PriceHistoryRepo, AuditRepo);
            repo.CreatePurchase(new Purchase
            {
                PaidAmountPiasters = 0,
                PayInFull = true,
                PaymentSource = "external_cash",
                Items = new List<PurchaseItem>
                {
                    new PurchaseItem { ProductId = prod.Id, QuantityMilli = 10000, UnitCostPiasters = 900, NewSellingPricePiasters = 1200, ConversionFactor = 1 }
                }
            }, "LATEST");

            Assert.AreEqual(14400, Count("SELECT sell_price_piasters FROM product_units WHERE id = @p;", "@p", carton.Id), "وحدة مشتقة (السعر × المعامل) تتبع السعر الجديد");
            Assert.AreEqual(10800, Count("SELECT cost_price_piasters FROM product_units WHERE id = @p;", "@p", carton.Id), "تكلفة مشتقة تتبع التكلفة الجديدة");
            Assert.AreEqual(5500, Count("SELECT sell_price_piasters FROM product_units WHERE id = @p;", "@p", custom.Id), "سعر الوحدة المخصص لا يُمس");
            Assert.AreEqual(4000, Count("SELECT cost_price_piasters FROM product_units WHERE id = @p;", "@p", custom.Id), "تكلفة الوحدة المخصصة لا تُمس");
        }

        // ---------- F: deleting a variant keeps the opening-balance ledger ----------

        [Test]
        public void DeleteVariant_VoidsTheOpeningBalanceWithAContraMovement_InsteadOfDeletingIt()
        {
            var repo = new ProductVariantRepository(ConnectionString);
            var matrix = repo.CreateMatrix(new CreateVariantMatrixRequest
            {
                ParentName = "قميص",
                DefaultPricePiasters = 5000,
                DefaultCostPiasters = 3000,
                MatrixCells = new List<VariantMatrixCell>
                {
                    new VariantMatrixCell { Size = "M", Color = "أحمر", PricePiasters = 5000, CostPiasters = 3000, StockQuantityMilli = 5000, IsEnabled = true }
                }
            });
            string variantId = matrix.Variants[0].VariantProductId;
            Assert.AreEqual(1, Count("SELECT COUNT(*) FROM stock_movements WHERE product_id = @p AND reference_type = 'OPENING_BALANCE';", "@p", variantId));

            repo.DeleteVariant(variantId);

            Assert.AreEqual(1, Count("SELECT COUNT(*) FROM stock_movements WHERE product_id = @p AND reference_type = 'OPENING_BALANCE';", "@p", variantId), "حركة الرصيد الافتتاحي باقية");
            Assert.AreEqual(-5000, Count("SELECT COALESCE(SUM(quantity_milli), 0) FROM stock_movements WHERE product_id = @p AND reference_type = 'OPENING_BALANCE_VOID';", "@p", variantId), "قيد معاكس بنفس الكمية");
            Assert.AreEqual(0, Count("SELECT stock_quantity_milli FROM products WHERE id = @p;", "@p", variantId), "رصيد المتغير صفر");
            Assert.AreEqual(0, Count("SELECT is_active FROM products WHERE id = @p;", "@p", variantId), "المتغير موقوف");
        }

        // ---------- inventory adjustment type no longer pollutes batch_number ----------

        [Test]
        public void StockAdjustment_KeepsTheTypeInTheNote_NotInBatchNumber()
        {
            var prod = CreateTestProduct("صنف جرد", 1000, 600, 10000);
            var inventory = new InventoryService(ConnectionString, StockMovementRepo, ProductRepo, AuditRepo);

            StockMovement m = inventory.AdjustStock(prod.Id, 12000, "جرد سنوي", AdminId, "SURPLUS");

            Assert.IsNotNull(m);
            Assert.AreEqual(1, Count("SELECT COUNT(*) FROM stock_movements WHERE product_id = @p AND movement_type = 'ADJUSTMENT' AND batch_number IS NULL;", "@p", prod.Id), "لا نوع تسوية في batch_number");
            StringAssert.Contains("فائض جردي", m.Note, "نوع التسوية يبقى في الملاحظة");
        }
    }
}
