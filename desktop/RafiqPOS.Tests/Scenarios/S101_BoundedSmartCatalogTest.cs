using System.Collections.Generic;
using NUnit.Framework;
using RafiqPOS.Models;

namespace RafiqPOS.Tests.Scenarios
{
    [TestFixture]
    public class S101_BoundedSmartCatalogTest : TestBase
    {
        [Test]
        public void SmartCatalog_Limit_Bounds_The_Rows_And_Full_Load_Returns_Every_Active_Product()
        {
            for (int i = 0; i < 6; i++)
            {
                CreateTestProduct("صنف كتالوج " + (char)('أ' + i), 1000 + i, 500, 10000, "SC_BAR_" + i);
            }
            int total = ProductRepo.GetTotalCount();
            Assert.GreaterOrEqual(total, 6);

            List<Product> bounded = ProductRepo.GetSmartCatalog(3);
            Assert.AreEqual(3, bounded.Count, "الحد الأقصى يقيّد عدد الأصناف المحمّلة");

            List<Product> all = ProductRepo.GetSmartCatalog(50000);
            Assert.AreEqual(total, all.Count, "التحميل الكامل يعيد كل الأصناف النشطة");

            foreach (Product p in bounded)
            {
                Assert.IsNotNull(p.Units, "شكل النتيجة ثابت: الوحدات مرفقة");
                Assert.IsNotNull(p.Barcodes, "شكل النتيجة ثابت: الباركودات مرفقة");
                Assert.IsFalse(string.IsNullOrEmpty(p.CategoryName), "اسم القسم موجود");
            }
        }
    }
}
