using System;
using System.Collections.Generic;
using System.Data.SQLite;
using NUnit.Framework;
using RafiqPOS.Common;
using RafiqPOS.Models;
using RafiqPOS.Repositories;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    [TestFixture]
    [NonParallelizable]
    public class S11_CafeRestaurantSuiteTest : TestBase
    {
        [TearDown]
        public override void BaseTearDown()
        {
            SecurityService.SetCurrentUserForTesting(null);
            base.BaseTearDown();
        }

        [Test]
        public void Scenario_Cafe01_TableLifecycle_Open_Transfer_Merge_SplitBill_AutoCloseOnPayment()
        {
            // 1. Arrange: تجهيز طاولة الصالة وطاولة التراس وطاولة VIP
            OpenTestShift();

            var table1 = new RestaurantTable
            {
                Name = "طاولة الصالة 1",
                ZoneName = "الصالة الداخلية",
                Capacity = 4,
                Status = "available",
                DisplayOrder = 1,
                IsActive = true
            };
            table1 = TableManagementService.SaveTable(table1);

            var table2 = new RestaurantTable
            {
                Name = "طاولة التراس 2",
                ZoneName = "التراس الخارجي",
                Capacity = 4,
                Status = "available",
                DisplayOrder = 2,
                IsActive = true
            };
            table2 = TableManagementService.SaveTable(table2);

            var table3 = new RestaurantTable
            {
                Name = "طاولة VIP 3",
                ZoneName = "VIP",
                Capacity = 6,
                Status = "available",
                DisplayOrder = 3,
                IsActive = true
            };
            table3 = TableManagementService.SaveTable(table3);

            var prodCoffee = CreateTestProduct("قهوة اسبريسو", 2500, 800, 50000);
            ProductRepo.Upsert(prodCoffee);

            var prodCake = CreateTestProduct("تشيز كيك فواكه", 4500, 2000, 30000);
            ProductRepo.Upsert(prodCake);

            // 2. Act: فتح طاولة 1
            table1 = TableManagementService.OpenTable(table1.Id, "كابتن زياد", 2, "usr_cashier_1");
            Assert.AreEqual("occupied", table1.Status, "حالة الطاولة يجب أن تصبح مشغولة (occupied)");
            Assert.IsFalse(string.IsNullOrEmpty(table1.ActiveHeldSaleId), "يجب إنشاء معرف فاتورة معلقة مرتبط بالطاولة");

            // إضافة طلبات على طاولة 1: 2 اسبريسو (5000 قرش) + 1 تشيز كيك (4500 قرش) = 9500 قرش
            string cart1Json = string.Format(
                "[{{\"productId\":\"{0}\",\"productName\":\"{1}\",\"quantityMilli\":2000,\"unitPricePiasters\":2500,\"totalPiasters\":5000}}," +
                "{{\"productId\":\"{2}\",\"productName\":\"{3}\",\"quantityMilli\":1000,\"unitPricePiasters\":4500,\"totalPiasters\":4500}}]",
                prodCoffee.Id, prodCoffee.Name, prodCake.Id, prodCake.Name
            );

            table1 = TableManagementService.UpdateTableOrder(
                table1.Id, cart1Json, 9500, 0, 9500, 2, "بدون سكر إضافي", "كابتن زياد", 2, "usr_cashier_1", null
            );
            Assert.AreEqual(9500, table1.CurrentTotalPiasters, "إجمالي طلبات الطاولة 1 يجب أن يكون 9500 قرش");
            Assert.AreEqual(2, table1.ItemsCount, "عدد عناصر الطلب يجب أن يكون 2");

            // تحويل طاولة 1 إلى طاولة 2
            table2 = TableManagementService.TransferTable(table1.Id, table2.Id, "usr_cashier_1");
            table1 = TableManagementService.GetTableById(table1.Id);

            Assert.AreEqual("available", table1.Status, "الطاولة المنقول منها يجب أن تصبح متاحة فارغة");
            Assert.AreEqual(0, table1.CurrentTotalPiasters, "إجمالي الطاولة المنقول منها يجب أن يصفر");
            Assert.AreEqual("occupied", table2.Status, "الطاولة المنقول إليها يجب أن تصبح مشغولة");
            Assert.AreEqual(9500, table2.CurrentTotalPiasters, "الطلبات والإجمالي يجب أن ينتقلا بالكامل للطاولة الجديدة");

            // فتح طاولة 3 بطلب 1 اسبريسو (2500 قرش)
            table3 = TableManagementService.OpenTable(table3.Id, "كابتن سارة", 1, "usr_cashier_1");
            string cart3Json = string.Format(
                "[{{\"productId\":\"{0}\",\"productName\":\"{1}\",\"quantityMilli\":1000,\"unitPricePiasters\":2500,\"totalPiasters\":2500}}]",
                prodCoffee.Id, prodCoffee.Name
            );
            table3 = TableManagementService.UpdateTableOrder(
                table3.Id, cart3Json, 2500, 0, 2500, 1, "", "كابتن سارة", 1, "usr_cashier_1", null
            );

            // دمج طاولة 3 داخل طاولة 2
            table2 = TableManagementService.MergeTables(table3.Id, table2.Id, "usr_cashier_1");
            table3 = TableManagementService.GetTableById(table3.Id);

            Assert.AreEqual("available", table3.Status, "الطاولة المدمجة يجب أن تصبح متاحة بعد الدمج");
            Assert.AreEqual(12000, table2.CurrentTotalPiasters, "إجمالي الطاولة المستهدفة بعد الدمج يجب أن يكون 9500 + 2500 = 12000 قرش");

            // تقسيم الفاتورة: فصل تشيز كيك (4500 قرش)
            // في السلة المدمجة: الصنف الأول اسبريسو (index 0)، الصنف الثاني تشيز كيك (index 1)
            var splitRequest = new List<TableSplitItemRequest>
            {
                new TableSplitItemRequest
                {
                    CartLineIndex = 1,
                    ProductId = prodCake.Id,
                    QuantityMilli = 1000
                }
            };

            var splitResult = TableManagementService.SplitTableBill(table2.Id, splitRequest, "usr_cashier_1");
            Assert.IsNotNull(splitResult, "نتيجة فصل الفاتورة لا يجب أن تكون فارغة");
            Assert.AreEqual(4500, splitResult.SplitSubtotalPiasters, "إجمالي الجزء المفصول يجب أن يطابق 4500 قرش");
            Assert.AreEqual(7500, splitResult.SourceTable.CurrentTotalPiasters, "المتبقي على طاولة 2 يجب أن يكون 12000 - 4500 = 7500 قرش");
            Assert.AreEqual("occupied", splitResult.SourceTable.Status, "طاولة 2 يجب أن تظل مشغولة بالمتبقي");

            // محاسبة الجزء المفصول
            var splitSale = new Sale
            {
                CashierId = "usr_cashier_1",
                CashierName = "كاشير 1",
                PaymentMethod = "cash",
                PaidPiasters = 4500,
                Items = new List<SaleItem>
                {
                    new SaleItem
                    {
                        ProductId = prodCake.Id,
                        ProductName = prodCake.Name,
                        QuantityMilli = 1000,
                        UnitPricePiasters = 4500,
                        TotalPiasters = 4500
                    }
                }
            };
            SaleService.ProcessSale(splitSale, null);

            // محاسبة المتبقي على الطاولة مع تمرير TableId لإغلاقها آلياً
            var finalTableSale = new Sale
            {
                CashierId = "usr_cashier_1",
                CashierName = "كاشير 1",
                PaymentMethod = "cash",
                TableId = table2.Id,
                PaidPiasters = 7500,
                Items = new List<SaleItem>
                {
                    new SaleItem
                    {
                        ProductId = prodCoffee.Id,
                        ProductName = prodCoffee.Name,
                        QuantityMilli = 3000,
                        UnitPricePiasters = 2500,
                        TotalPiasters = 7500
                    }
                }
            };
            SaleService.ProcessSale(finalTableSale, null);

            // التحقق من إغلاق الطاولة تلقائياً وتصفيرها
            table2 = TableManagementService.GetTableById(table2.Id);
            Assert.AreEqual("available", table2.Status, "الطاولة يجب أن تعود متاحة (available) تلقائياً بمجرد إتمام السداد");
            Assert.AreEqual(0, table2.CurrentTotalPiasters, "إجمالي الطاولة يجب أن يصفر بعد إغلاق الفاتورة");
            Assert.IsNull(table2.ActiveHeldSaleId, "معرف الفاتورة المعلقة يجب أن يُحذف");
        }

        [Test]
        public void Scenario_Cafe02_Modifiers_PriceAuthority_ExtraPiasters_AndDeductionValidation()
        {
            // 1. Arrange: منتج ومجموعات إضافات ومستخدم كاشير مقيد الصلاحيات
            SecurityService.SetCurrentUserForTesting(new UserDto
            {
                Id = "usr_cashier_1",
                Role = "cashier",
                Username = "cashier1",
                DisplayName = "كاشير 1",
                IsActive = true
            });

            OpenTestShift();

            var prod = CreateTestProduct("لاتيه مثلج مخصوص", 3500, 1200, 50000);
            ProductRepo.Upsert(prod);

            var groupSize = new ModifierGroup
            {
                Name = "حجم الكوب",
                SelectionType = "single",
                IsRequired = true,
                MinSelections = 1,
                MaxSelections = 1,
                DisplayOrder = 1,
                IsActive = true
            };
            groupSize = ModifierService.SaveGroup(groupSize);

            var optLarge = new ModifierOption
            {
                GroupId = groupSize.Id,
                Name = "حجم كبير L",
                ExtraPricePiasters = 1000, // +10.00 ج
                CostPiasters = 300,
                IsActive = true
            };
            optLarge = ModifierService.SaveOption(optLarge);

            var groupFlavor = new ModifierGroup
            {
                Name = "نكهات سيرب إضافية",
                SelectionType = "multiple",
                IsRequired = false,
                MinSelections = 0,
                MaxSelections = 3,
                DisplayOrder = 2,
                IsActive = true
            };
            groupFlavor = ModifierService.SaveGroup(groupFlavor);

            var optCaramel = new ModifierOption
            {
                GroupId = groupFlavor.Id,
                Name = "كراميل مملح",
                ExtraPricePiasters = 800, // +8.00 ج
                CostPiasters = 250,
                IsActive = true
            };
            optCaramel = ModifierService.SaveOption(optCaramel);

            ModifierService.LinkProductGroups(prod.Id, new List<string> { groupSize.Id, groupFlavor.Id });

            // 2. Act: عملية بيع نظامية مع إضافات معتمدة
            // السعر الأساسي 3500 + 1000 (كبير) + 800 (كراميل) = 5300 قرش
            var sale = new Sale
            {
                CashierId = "usr_cashier_1",
                CashierName = "كاشير 1",
                PaymentMethod = "cash",
                PaidPiasters = 5300,
                Items = new List<SaleItem>
                {
                    new SaleItem
                    {
                        ProductId = prod.Id,
                        ProductName = prod.Name,
                        QuantityMilli = 1000,
                        UnitPricePiasters = 5300,
                        TotalPiasters = 5300,
                        Modifiers = new List<SaleItemModifier>
                        {
                            new SaleItemModifier
                            {
                                OptionId = optLarge.Id,
                                GroupName = groupSize.Name,
                                OptionName = optLarge.Name,
                                ExtraPricePiasters = optLarge.ExtraPricePiasters
                            },
                            new SaleItemModifier
                            {
                                OptionId = optCaramel.Id,
                                GroupName = groupFlavor.Name,
                                OptionName = optCaramel.Name,
                                ExtraPricePiasters = optCaramel.ExtraPricePiasters
                            }
                        }
                    }
                }
            };

            var processedSale = SaleService.ProcessSale(sale, null);
            Assert.IsNotNull(processedSale, "عملية البيع مع الإضافات المعتمدة يجب أن تنجح بالكامل");
            Assert.AreEqual(5300, processedSale.TotalPiasters, "إجمالي الفاتورة يجب أن يحسب سعر الصنف مع الإضافات بدقة (5300 قرش)");

            // 3. اختبار التلاعب في السعر: محاولة بيع الصنف بسعر غير مصرح به
            // الكاشير يحاول وضع السعر 4000 قرش مع الإضافات (+1800) مما يعني أن الأساسي 2200 بدلاً من 3500 بدون خصم مصرح
            var tamperedSale = new Sale
            {
                CashierId = "usr_cashier_1",
                CashierName = "كاشير 1",
                PaymentMethod = "cash",
                PaidPiasters = 4000,
                Items = new List<SaleItem>
                {
                    new SaleItem
                    {
                        ProductId = prod.Id,
                        ProductName = prod.Name,
                        QuantityMilli = 1000,
                        UnitPricePiasters = 4000,
                        TotalPiasters = 4000,
                        Modifiers = new List<SaleItemModifier>
                        {
                            new SaleItemModifier
                            {
                                OptionId = optLarge.Id,
                                GroupName = groupSize.Name,
                                OptionName = optLarge.Name,
                                ExtraPricePiasters = optLarge.ExtraPricePiasters
                            },
                            new SaleItemModifier
                            {
                                OptionId = optCaramel.Id,
                                GroupName = groupFlavor.Name,
                                OptionName = optCaramel.Name,
                                ExtraPricePiasters = optCaramel.ExtraPricePiasters
                            }
                        }
                    }
                }
            };

            try
            {
                SaleService.ProcessSale(tamperedSale, null);
                Assert.Fail("يجب رفض تعديل سعر الصنف العشوائي عند وجود إضافات بواسطة آلية enforcePriceAuthority");
            }
            catch (InvalidOperationException ex)
            {
                Assert.IsTrue(ex.Message.Contains("تعديل سعر") || ex.Message.Contains("غير مطابق") || ex.Message.Contains("سعر الصنف"),
                    "رسالة الخطأ يجب أن تشير لرفض التلاعب في السعر الأساسي: " + ex.Message);
            }
        }

        [Test]
        public void Scenario_Cafe03_DeliveryOrder_Fees_RiderCustody_AndExpenseSettlement()
        {
            // 1. Arrange: منطقة توصيل وطيار
            OpenTestShift();

            var zone = new DeliveryZone
            {
                Name = "مدينة نصر - المنطقة الأولى",
                FeePiasters = 2500, // 25 ج خدمة توصيل
                EstimatedMinutes = 35,
                MinOrderPiasters = 5000,
                RiderCommissionPiasters = 1200, // 12 ج عمولة للطيار
                DisplayOrder = 1,
                IsActive = true
            };
            zone = DeliveryService.SaveZone(zone);

            var rider = new DeliveryRider
            {
                Name = "عمر السريع",
                Phone = "01099887766",
                VehicleType = "motorcycle",
                CommissionPerOrderPiasters = 1200,
                Status = "available",
                IsActive = true
            };
            rider = DeliveryService.SaveRider(rider);

            var mealProd = CreateTestProduct("وجبة برجر دبل كومبو", 12000, 6000, 50000);
            ProductRepo.Upsert(mealProd);

            // 2. Act: فاتورة دليفري مع رسوم خدمة وتوصيل
            // الأصناف: 12000 قرش
            // رسوم توصيل: 2500 قرش
            // رسوم خدمة: 1000 قرش
            // الإجمالي: 15500 قرش (غير مدفوعة كاش مقدماً - في ذمة الطيار)
            var sale = new Sale
            {
                CashierId = "usr_cashier_1",
                CashierName = "كاشير 1",
                PaymentMethod = "cash",
                OrderType = "delivery",
                DeliveryFeePiasters = 2500,
                ServiceChargePiasters = 1000,
                PaidPiasters = 0, // سيسدد عند الاستلام
                DeliveryInfo = new DeliveryOrderCreateInfo
                {
                    CustomerName = "طارق محمود",
                    CustomerPhone = "01011112222",
                    DeliveryAddress = "شارع عباس العقاد - عمارة 14 الدور 3",
                    ZoneId = zone.Id,
                    ZoneName = zone.Name,
                    DeliveryFeePiasters = zone.FeePiasters
                },
                Items = new List<SaleItem>
                {
                    new SaleItem
                    {
                        ProductId = mealProd.Id,
                        ProductName = mealProd.Name,
                        QuantityMilli = 1000,
                        UnitPricePiasters = 12000,
                        TotalPiasters = 12000
                    }
                }
            };

            var processedSale = SaleService.ProcessSale(sale, null);
            Assert.AreEqual(15500, processedSale.TotalPiasters, "إجمالي فاتورة الدليفري يجب أن يشمل قيمة الأصناف ورسوم التوصيل والخدمة (15500 قرش)");

            // التحقق من إنشاء طلب دليفري مرتبط بحالة تجهيز (preparing)
            var orders = DeliveryService.GetOrders("preparing");
            Assert.GreaterOrEqual(orders.Count, 1, "يجب إنشاء أمر توصيل بحالة preparing");
            var dOrder = orders[0];
            Assert.AreEqual(processedSale.Id, dOrder.SaleId, "أمر التوصيل يجب أن يرتبط بنفس الفاتورة");
            Assert.AreEqual(15500, dOrder.TotalToCollectPiasters, "إجمالي أمر التوصيل يجب أن يكون 15500 قرش");
            Assert.IsFalse(dOrder.IsSettled, "أمر التوصيل يجب ألا يكون مسوّى بعد");

            // إسناد الطلب للطيار
            dOrder = DeliveryService.AssignOrderToRider(dOrder.Id, rider.Id, "usr_cashier_1");
            Assert.AreEqual("out_for_delivery", dOrder.Status, "حالة الطلب بعد الإسناد يجب أن تصبح out_for_delivery");
            Assert.AreEqual(rider.Id, dOrder.RiderId, "الطلب يجب أن يسند للطيار عمر السريع");

            // فحص ملخص عهدة الطيار قبل التوريد
            var preSummary = DeliveryService.GetRiderSettlementSummary(rider.Id);
            Assert.AreEqual(1, preSummary.UnsettledOrdersCount, "الطيار لديه طلب واحد غير مسوّى");
            Assert.AreEqual(15500, preSummary.TotalCashToCollectPiasters, "إجمالي الكاش المحصل مع الطيار يجب أن يكون 15500 قرش");
            Assert.AreEqual(1200, preSummary.RiderCommissionPiasters, "عمولة الطيار يجب أن تكون 1200 قرش");
            Assert.AreEqual(14300, preSummary.NetDrawerDepositPiasters, "الصافي المستحق لدرج النقدية = 15500 - 1200 = 14300 قرش");

            // توريد عهدة الطيار مع قيد العمولة كمصروف
            var postSummary = DeliveryService.SettleRider(rider.Id, "usr_cashier_1", true);
            Assert.AreEqual(1, postSummary.UnsettledOrdersCount, "تقرير التصفية يوثق تسوية طلب واحد");
            Assert.AreEqual(15500, postSummary.TotalCashToCollectPiasters, "تقرير التصفية يوثق تحصيل 15500 قرش");

            // فحص رصيد الطيار بعد التوريد
            var freshSummary = DeliveryService.GetRiderSettlementSummary(rider.Id);
            Assert.AreEqual(0, freshSummary.UnsettledOrdersCount, "بعد التوريد يجب أن يصبح عدد الطلبات غير المسواة صفراً");
            Assert.AreEqual(0, freshSummary.TotalCashToCollectPiasters, "رصيد الكاش المعلق مع الطيار يجب أن يصبح صفراً");

            // التحقق من إدراج مصروف عمولة التوصيل في جدول المصروفات
            using (var conn = new SQLiteConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("SELECT amount_piasters, notes FROM expenses WHERE category = 'عمولات توصيل وطيارين' LIMIT 1;", conn))
                {
                    using (var reader = cmd.ExecuteReader())
                    {
                        Assert.IsTrue(reader.Read(), "يجب العثور على قيد مصروف لعمولة الطيار");
                        long amount = Convert.ToInt64(reader["amount_piasters"]);
                        Assert.AreEqual(1200, amount, "قيمة مصروف العمولة يجب أن تطابق 1200 قرش");
                    }
                }
            }
        }

        [Test]
        public void Scenario_Cafe04_BOMRecipes_DepletionOnSale_AndAtomicReversalOnCancellation()
        {
            // 1. Arrange: خامات خام ومنتج مصنع برسبّي يخصم عند البيع (on_sale)
            OpenTestShift();

            var rawBeans = CreateTestProduct("بن اسبريسو خام", 0, 250, 100000); // 100 وحدة، التكلفة 250 قرش
            ProductRepo.Upsert(rawBeans);

            var rawMilk = CreateTestProduct("حليب طازج معقم", 0, 80, 60000); // 60 وحدة، التكلفة 80 قرش
            ProductRepo.Upsert(rawMilk);

            var menuDrink = CreateTestProduct("فلات وايت مخصوص", 4000, 0, 0); // رصيده صفر، يباع بناءً على الخامات
            ProductRepo.Upsert(menuDrink);

            var recipe = new Recipe
            {
                ProductId = menuDrink.Id,
                Name = "رسبي فلات وايت مخصوص",
                YieldQtyMilli = 1000, // ينتج كوب واحد
                DepletionMode = "on_sale",
                IsActive = true,
                Ingredients = new List<RecipeIngredient>
                {
                    new RecipeIngredient
                    {
                        IngredientProductId = rawBeans.Id,
                        QuantityMilli = 18000, // 18 جرام
                        WastagePercent = 0
                    },
                    new RecipeIngredient
                    {
                        IngredientProductId = rawMilk.Id,
                        QuantityMilli = 25000, // 25 مل
                        WastagePercent = 0
                    }
                }
            };

            // حفظ الرسبي مع تحديث تكلفة المنتج تلقائياً
            // التكلفة المتوقعة: (18 * 250) + (25 * 80) = 4500 + 2000 = 6500 قرش
            recipe = RecipeService.SaveRecipe(recipe, true);

            var updatedMenuDrink = ProductRepo.GetById(menuDrink.Id);
            Assert.AreEqual(6500, updatedMenuDrink.CostPiasters, "تكلفة المنتج يجب أن تُحسب تلقائياً من خامات الرسبي وتصبح 6500 قرش");

            // 2. Act: بيع 2 كوب فلات وايت (رصيد الصنف الأصلي 0 ومع ذلك يُسمح بالبيع لوجود رسبي on_sale)
            var sale = new Sale
            {
                CashierId = "usr_cashier_1",
                CashierName = "كاشير 1",
                PaymentMethod = "cash",
                PaidPiasters = 8000,
                Items = new List<SaleItem>
                {
                    new SaleItem
                    {
                        ProductId = menuDrink.Id,
                        ProductName = menuDrink.Name,
                        QuantityMilli = 2000, // كوبين
                        UnitPricePiasters = 4000,
                        TotalPiasters = 8000
                    }
                }
            };

            var processedSale = SaleService.ProcessSale(sale, null);
            Assert.IsNotNull(processedSale, "عملية البيع يجب أن تكتمل بنجاح دون اعتراض رصيد الصنف التام");

            // التحقق من خصم الخامات بدقة في المخزن:
            // البن: 100000 - (2 * 18000) = 100000 - 36000 = 64000 ملي
            // الحليب: 60000 - (2 * 25000) = 60000 - 50000 = 10000 ملي
            var currentBeans = ProductRepo.GetById(rawBeans.Id);
            var currentMilk = ProductRepo.GetById(rawMilk.Id);

            Assert.AreEqual(64000, currentBeans.StockQuantityMilli, "رصيد البن المتبقي يجب أن يكون 64000 ملي");
            Assert.AreEqual(10000, currentMilk.StockQuantityMilli, "رصيد الحليب المتبقي يجب أن يكون 10000 ملي");

            // التحقق من تدوين حركات المخزون بنوع RECIPE_SALE_CONSUMPTION
            using (var conn = new SQLiteConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("SELECT COUNT(*) FROM stock_movements WHERE reference_id = @sid AND movement_type = 'RECIPE_SALE_CONSUMPTION';", conn))
                {
                    cmd.Parameters.AddWithValue("@sid", processedSale.Id);
                    long count = Convert.ToInt64(cmd.ExecuteScalar());
                    Assert.AreEqual(2, count, "يجب تسجيل حركتي استهلاك خامات (بن وحليب) للفاتورة");
                }
            }

            // 3. إلغاء الفاتورة والتحقق من الاسترجاع الذري للخامات
            SaleService.CancelSale(processedSale.Id, "usr_cashier_1", "طلب إلغاء تجريبي لفحص عكس الخامات", null);

            var restoredBeans = ProductRepo.GetById(rawBeans.Id);
            var restoredMilk = ProductRepo.GetById(rawMilk.Id);

            Assert.AreEqual(100000, restoredBeans.StockQuantityMilli, "رصيد البن يجب أن يعود كاملاً 100000 ملي بعد إلغاء الفاتورة");
            Assert.AreEqual(60000, restoredMilk.StockQuantityMilli, "رصيد الحليب يجب أن يعود كاملاً 60000 ملي بعد إلغاء الفاتورة");

            // التحقق من تدوين حركات العكس بنوع RECIPE_SALE_REVERSAL
            using (var conn = new SQLiteConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("SELECT COUNT(*) FROM stock_movements WHERE reference_id = @sid AND movement_type = 'RECIPE_SALE_REVERSAL';", conn))
                {
                    cmd.Parameters.AddWithValue("@sid", processedSale.Id);
                    long count = Convert.ToInt64(cmd.ExecuteScalar());
                    Assert.AreEqual(2, count, "يجب تسجيل حركتي عكس استهلاك خامات بنوع RECIPE_SALE_REVERSAL");
                }
            }
        }

        [Test]
        public void Scenario_Cafe05_BOMRecipes_BatchProduction_ForOnProductionDepletion()
        {
            // 1. Arrange: خامات إنتاج دفعة لمنتج مخبوزات (batch_production)
            var rawFlour = CreateTestProduct("دقيق فاخر ممتاز", 0, 50, 500000); // 500 كجم، 50 قرش
            ProductRepo.Upsert(rawFlour);

            var rawButter = CreateTestProduct("زبدة طبيعية", 0, 300, 100000); // 100 كجم، 300 قرش
            ProductRepo.Upsert(rawButter);

            var croissant = CreateTestProduct("كرواسون سادة فرنسي", 2500, 0, 0); // رصيده 0
            ProductRepo.Upsert(croissant);

            var recipe = new Recipe
            {
                ProductId = croissant.Id,
                Name = "رسبي دفعة كرواسون 10 قطع",
                YieldQtyMilli = 10000, // ينتج 10 قطع (10000 ملي)
                DepletionMode = "batch_production",
                IsActive = true,
                Ingredients = new List<RecipeIngredient>
                {
                    new RecipeIngredient
                    {
                        IngredientProductId = rawFlour.Id,
                        QuantityMilli = 50000, // 50 وحدة دقيق
                        WastagePercent = 0
                    },
                    new RecipeIngredient
                    {
                        IngredientProductId = rawButter.Id,
                        QuantityMilli = 20000, // 20 وحدة زبدة
                        WastagePercent = 0
                    }
                }
            };

            recipe = RecipeService.SaveRecipe(recipe, true);

            // 2. Act: إصدار أمر تشغيل وإنتاج دفعة بحجم 20 قطعة (20000 ملي)
            var batch = RecipeService.ProduceBatch(recipe.Id, 20000, "دفعة إنتاج الصباح للفرن", "usr_cashier_1", "شيف المخبوزات");

            Assert.IsNotNull(batch, "أمر الإنتاج يجب أن يُنفذ بنجاح");
            Assert.AreEqual(20000, batch.ProducedQtyMilli, "كمية الإنتاج المنفذة يجب أن تطابق 20000 ملي (20 قطعة)");

            // التحقق من رصيد المنتج النهائي بالمخزن: يجب أن يزيد بمقدار 20000 ملي
            var producedCroissant = ProductRepo.GetById(croissant.Id);
            Assert.AreEqual(20000, producedCroissant.StockQuantityMilli, "رصيد الكرواسون التام يجب أن يصبح 20000 ملي");

            // التحقق من خصم الخامات:
            // الدقيق المطلوب: (20000 * 50000) / 10000 = 100000 ملي
            // المتبقي: 500000 - 100000 = 400000 ملي
            // الزبدة المطلوبة: (20000 * 20000) / 10000 = 40000 ملي
            // المتبقي: 100000 - 40000 = 60000 ملي
            var currentFlour = ProductRepo.GetById(rawFlour.Id);
            var currentButter = ProductRepo.GetById(rawButter.Id);

            Assert.AreEqual(400000, currentFlour.StockQuantityMilli, "رصيد الدقيق يجب أن يخصم منه 100000 ملي ويتبقى 400000 ملي");
            Assert.AreEqual(60000, currentButter.StockQuantityMilli, "رصيد الزبدة يجب أن يخصم منه 40000 ملي ويتبقى 60000 ملي");

            // التحقق من تسجيل سجل أمر الإنتاج في الدفاتر
            var log = RecipeService.GetProductionLog(10);
            Assert.GreaterOrEqual(log.Count, 1, "يجب وجود سجل إنتاج بالدفاتر");
            Assert.AreEqual(batch.Id, log[0].Id, "أول سجل يجب أن يطابق دفعة الإنتاج الحالية");
        }
    }
}
