using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// M1: أصناف الكافيه المصنعة برسبي (on_sale) تُصرف من خاماتها فقط، مع فحص كفاية الخامات قبل الحفظ
    /// ومراعاة معامل وحدة البيع لخامات الإضافات، وعكس متماثل عند الإلغاء والمرتجع.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S30_CafeRecipeStockTest : S30_Step3BFixtureBase
    {
        private Product _beans;
        private Product _milk;
        private Product _latte;
        private ProductUnit _tray;
        private ModifierOption _extraShot;

        private void ArrangeCafe(long beansMilli, long milkMilli)
        {
            DatabaseService.SettingsRepo.Set("allow_negative_stock", "0");
            OpenShift(100000);

            _beans = CreateProduct("بن اسبريسو خام", 0, 250, beansMilli);
            _milk = CreateProduct("حليب طازج", 0, 80, milkMilli);
            _latte = CreateProduct("لاتيه", 4000, 0, 0);

            DatabaseService.ProductUnits.EnsureDefaultBaseUnit(_latte);
            _tray = DatabaseService.ProductUnits.CreateUnit(new ProductUnit
            {
                ProductId = _latte.Id,
                UnitName = "صينية 4 أكواب",
                ConversionFactor = 4,
                IsBaseUnit = false,
                SellPricePiasters = 16000,
                CostPricePiasters = 0,
                Barcode = "TRAY_" + Guid.NewGuid().ToString("N").Substring(0, 8),
                IsDivisible = false,
                SortOrder = 1
            });

            DatabaseService.Recipes.SaveRecipe(new Recipe
            {
                ProductId = _latte.Id,
                Name = "رسبي لاتيه",
                YieldQtyMilli = 1000,
                DepletionMode = "on_sale",
                IsActive = true,
                Ingredients = new List<RecipeIngredient>
                {
                    new RecipeIngredient { IngredientProductId = _beans.Id, QuantityMilli = 18000, WastagePercent = 0 },
                    new RecipeIngredient { IngredientProductId = _milk.Id, QuantityMilli = 25000, WastagePercent = 0 }
                }
            }, true);

            var group = DatabaseService.Modifiers.SaveGroup(new ModifierGroup
            {
                Name = "إضافات القهوة",
                SelectionType = "multiple",
                IsRequired = false,
                MinSelections = 0,
                MaxSelections = 3,
                IsActive = true
            });
            _extraShot = DatabaseService.Modifiers.SaveOption(new ModifierOption
            {
                GroupId = group.Id,
                Name = "شوت إضافي",
                ExtraPricePiasters = 0,
                LinkedIngredientId = _beans.Id,
                LinkedQtyMilli = 9000,
                IsActive = true
            });
            _latte = DatabaseService.Products.GetById(_latte.Id);
        }

        private JObject TrayLineWithExtraShot()
        {
            var line = CartLine(_latte, 1000, 16000);
            line["unitId"] = _tray.Id;
            line["unitName"] = _tray.UnitName;
            line["unit"] = _tray.UnitName;
            line["conversionFactor"] = 4;
            // Same shape as ItemModifiersModal.handleConfirm
            line["modifiers"] = new JArray
            {
                new JObject
                {
                    { "optionId", _extraShot.Id },
                    { "groupName", "إضافات القهوة" },
                    { "optionName", "شوت إضافي" },
                    { "extraPricePiasters", 0 },
                    { "quantityMilli", 1000 }
                }
            };
            return line;
        }

        [Test]
        public void RecipeSale_DeductsIngredientsOnly_WithModifierTimesUnitFactor_AndCancelRestoresSymmetrically()
        {
            ArrangeCafe(200000, 200000);

            var res = DispatchOk("sales:create", SalePayload(new JArray { TrayLineWithExtraShot() }, 16000, "cash", 16000, null));
            string saleId = Data(res)["id"].ToString();

            Assert.AreEqual(0, Stock(_latte.Id), "صنف المنيو لا يُخصم من رصيده لأن خاماته هي التي تُصرف (كان يصبح -4 للأبد)");
            // 4 cups x 18 g recipe + 4 cups x 9 g extra shot = 108 g
            Assert.AreEqual(200000 - 108000, Stock(_beans.Id), "البن = رسبي 4 أكواب + شوت إضافي لكل كوب من الصينية (معامل الوحدة 4)");
            Assert.AreEqual(200000 - 100000, Stock(_milk.Id), "الحليب = 4 أكواب × 25");
            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM stock_movements WHERE reference_id = @s AND product_id = @p;", "@s", saleId, "@p", _latte.Id),
                "لا حركة مخزون لصنف المنيو نفسه");

            DispatchOk("sales:cancel", new JObject { { "saleId", saleId }, { "reason", "طلب العميل" } });

            Assert.AreEqual(0, Stock(_latte.Id), "الإلغاء لا يضيف رصيداً لصنف لم يُخصم أصلاً");
            Assert.AreEqual(200000, Stock(_beans.Id), "الإلغاء يعيد البن كاملاً");
            Assert.AreEqual(200000, Stock(_milk.Id), "الإلغاء يعيد الحليب كاملاً");
        }

        [Test]
        public void RecipeSale_IsRejected_WhenIngredientsAreInsufficient_AndNegativeStockIsOff()
        {
            ArrangeCafe(200000, 30000);

            var res = Dispatch("sales:create", SalePayload(new JArray { CartLine(_latte, 2000, 4000) }, 8000, "cash", 8000, null));

            Assert.IsFalse(res.Success, "كوبان يحتاجان 50 مل حليب والمتاح 30 فقط مع منع البيع بالسالب");
            Assert.AreEqual("SALE_VALIDATION_FAILED", res.Error.Code);
            StringAssert.Contains("حليب طازج", res.Error.Message, "الرسالة تسمي الخامة الناقصة");
            Assert.AreEqual(30000, Stock(_milk.Id), "لا خصم جزئي للخامات");
            Assert.AreEqual(200000, Stock(_beans.Id));
            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM sales;"), "لم تُحفظ أي فاتورة");
        }

        [Test]
        public void RecipeSale_Return_DoesNotInflateMenuItemStock()
        {
            ArrangeCafe(200000, 200000);

            var res = DispatchOk("sales:create", SalePayload(new JArray { CartLine(_latte, 1000, 4000) }, 4000, "cash", 4000, null));
            JObject sale = Data(res);
            string saleItemId = sale["items"][0]["id"].ToString();

            DispatchOk("returns:create", new JObject
            {
                { "saleId", sale["id"].ToString() },
                { "reason", "مرتجع من العميل" },
                { "refundMethod", "cash" },
                { "idempotencyKey", Guid.NewGuid().ToString() },
                { "items", new JArray
                    {
                        new JObject
                        {
                            { "saleItemId", saleItemId },
                            { "productId", _latte.Id },
                            { "productName", _latte.Name },
                            { "quantityMilli", 1000 },
                            { "unitPricePiasters", 4000 },
                            { "totalPiasters", 4000 },
                            { "isDamaged", false }
                        }
                    }
                }
            });

            Assert.AreEqual(0, Stock(_latte.Id), "مشروب محضّر لا يعود رصيداً لصنف لم يُخصم أصلاً");
            Assert.AreEqual(200000 - 18000, Stock(_beans.Id), "الخامات المستهلكة في التحضير لا تعود بالمرتجع");
        }
    }
}
