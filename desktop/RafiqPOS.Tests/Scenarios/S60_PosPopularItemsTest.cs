using System;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// قائمة "الأكثر طلباً ومبيعاً" في شاشة البيع: SalesCount = عدد القطع الأساسية المباعة في آخر 30 يوماً
    /// (الفواتير الملغاة والقديمة لا تُحسب).
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S60_PosPopularItemsTest : S30_Step3BFixtureBase
    {
        private static int SalesCountOf(JArray catalog, string productId)
        {
            foreach (var p in catalog)
            {
                if (p["id"].ToString() == productId) return (int)p["salesCount"];
            }
            Assert.Fail("الصنف غير موجود في كتالوج شاشة البيع");
            return -1;
        }

        private static JObject Sell(Product product, long quantityMilli)
        {
            JObject line = CartLine(product, quantityMilli, 1000);
            long total = 1000 * quantityMilli / 1000;
            return Data(DispatchOk("sales:create", SalePayload(new JArray { line }, total, "cash", total, null)));
        }

        [Test]
        public void SmartCatalog_SalesCount_IsBaseUnitsSoldInLast30Days_ExcludingOldAndCancelledSales()
        {
            DatabaseService.SettingsRepo.Set("allow_negative_stock", "0");
            OpenShift(100000);
            var seller = CreateProduct("صنف الأكثر مبيعاً", 1000, 500, 500000);
            var minor = CreateProduct("صنف أقل مبيعاً", 1000, 500, 500000);
            var oldOnly = CreateProduct("صنف بيع من شهرين", 1000, 500, 500000);
            var cancelledOnly = CreateProduct("صنف فاتورته ملغاة", 1000, 500, 500000);
            var untouched = CreateProduct("صنف بلا مبيعات", 1000, 500, 500000);

            Sell(seller, 3000);
            Sell(seller, 2000);
            Sell(minor, 1000);
            JObject oldSale = Sell(oldOnly, 4000);
            JObject cancelledSale = Sell(cancelledOnly, 4000);

            Execute("UPDATE sales SET created_at = @old WHERE id = @id;",
                "@old", DateTime.UtcNow.AddDays(-40).ToString("o"), "@id", oldSale["id"].ToString());
            Execute("UPDATE sales SET status = 'cancelled' WHERE id = @id;", "@id", cancelledSale["id"].ToString());

            JArray catalog = (JArray)Data(DispatchOk("products:getSmartCatalog", new JObject { { "limit", 1000 } }))["products"];

            Assert.AreEqual(5, SalesCountOf(catalog, seller.Id), "3 + 2 قطع في آخر 30 يوماً");
            Assert.AreEqual(1, SalesCountOf(catalog, minor.Id));
            Assert.AreEqual(0, SalesCountOf(catalog, oldOnly.Id), "فاتورة عمرها 40 يوماً خارج نافذة الـ 30 يوماً");
            Assert.AreEqual(0, SalesCountOf(catalog, cancelledOnly.Id), "الفاتورة الملغاة لا تُحسب");
            Assert.AreEqual(0, SalesCountOf(catalog, untouched.Id));
        }
    }
}
