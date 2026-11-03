using System;
using System.Collections.Generic;
using NUnit.Framework;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    [TestFixture]
    public class S15_ProductUnitEditAtomicityTest : TestBase
    {
        private ProductUnitService _unitService;
        private Product _product;
        private ProductUnit _carton;

        [SetUp]
        public void SetUpSoldCartonUnit()
        {
            _unitService = new ProductUnitService(ConnectionString);
            _product = CreateTestProduct("عصير وحدات", 2500, 1800, 120000);
            _unitService.EnsureDefaultBaseUnit(_product);
            using (ProductWritePolicy.EnterTrustedFixtureOperation())
            _carton = _unitService.CreateUnit(new ProductUnit
            {
                ProductId = _product.Id,
                UnitName = "كرتونة 12",
                ConversionFactor = 12,
                IsBaseUnit = false,
                SellPricePiasters = 28000,
                CostPricePiasters = 21000,
                Barcode = "BC_CARTON_" + Guid.NewGuid().ToString("N").Substring(0, 8),
                IsDivisible = false,
                SortOrder = 1
            });

            SaleRepo.CreateSaleAtomic(new Sale
            {
                SubtotalPiasters = 28000,
                TotalPiasters = 28000,
                PaidPiasters = 28000,
                PaymentMethod = "cash",
                Status = "completed",
                Items = new List<SaleItem>
                {
                    new SaleItem
                    {
                        ProductId = _product.Id,
                        ProductName = _product.Name,
                        UnitId = _carton.Id,
                        UnitName = _carton.UnitName,
                        ConversionFactor = 12,
                        QuantityMilli = 1000,
                        UnitPricePiasters = 28000,
                        TotalPiasters = 28000,
                        UnitCostPiasters = 21000
                    }
                }
            });
        }

        [Test]
        public void Changing_Factor_Of_Sold_Unit_Rejects_Whole_Save()
        {
            var edited = ProductRepo.GetById(_product.Id);
            edited.Name = "اسم يجب ألا يُحفظ";
            edited.Units.Find(delegate (ProductUnit u) { return u.Id == _carton.Id; }).ConversionFactor = 24;

            InvalidOperationException ex;
            using (AdmitProductRequest("usr_admin_default"))
                ex = Assert.Throws<InvalidOperationException>(delegate { ProductService.SaveProduct(edited, true, true); });
            StringAssert.Contains("معامل التحويل", ex.Message);

            Assert.AreEqual("عصير وحدات", ProductRepo.GetById(_product.Id).Name, "تعديل الاسم تراجع مع رفض الوحدة");
            Assert.AreEqual(12, _unitService.GetUnitById(_carton.Id).ConversionFactor, "معامل التحويل لم يتغير");
        }

        [Test]
        public void Removing_Sold_Unit_Rejects_Whole_Save()
        {
            var edited = ProductRepo.GetById(_product.Id);
            edited.PricePiasters = 2700;
            edited.Units.RemoveAll(delegate (ProductUnit u) { return u.Id == _carton.Id; });

            InvalidOperationException ex;
            using (AdmitProductRequest("usr_admin_default"))
                ex = Assert.Throws<InvalidOperationException>(delegate { ProductService.SaveProduct(edited, true, true); });
            StringAssert.Contains("لا يمكن حذف الوحدة", ex.Message);

            Assert.AreEqual(2500, ProductRepo.GetById(_product.Id).PricePiasters, "تعديل السعر تراجع مع رفض حذف الوحدة");
            Assert.IsNotNull(_unitService.GetUnitById(_carton.Id), "الوحدة المباعة ما زالت موجودة");
        }

        [Test]
        public void Removing_And_ReAdding_Same_Unit_Name_Saves_Instead_Of_Unique_Failure()
        {
            using (ProductWritePolicy.EnterTrustedFixtureOperation())
            _unitService.CreateUnit(new ProductUnit
            {
                ProductId = _product.Id,
                UnitName = "دستة 6",
                ConversionFactor = 6,
                SellPricePiasters = 14000,
                CostPricePiasters = 10800,
                SortOrder = 2
            });

            var edited = ProductRepo.GetById(_product.Id);
            edited.PricePiasters = 2600;
            edited.Units.RemoveAll(delegate (ProductUnit u) { return u.UnitName == "دستة 6"; });
            edited.Units.Add(new ProductUnit { UnitName = "دستة 6", ConversionFactor = 6, SellPricePiasters = 14500, CostPricePiasters = 10800, SortOrder = 2 });

            using (AdmitProductRequest("usr_admin_default"))
                ProductService.SaveProduct(edited, true, true);

            Assert.AreEqual(2600, ProductRepo.GetById(_product.Id).PricePiasters, "الحفظ تم بالكامل");
            var dozens = _unitService.GetUnitsForProduct(_product.Id).FindAll(delegate (ProductUnit u) { return u.UnitName == "دستة 6"; });
            Assert.AreEqual(1, dozens.Count, "وحدة واحدة بنفس الاسم");
            Assert.AreEqual(14500, dozens[0].SellPricePiasters, "الوحدة المعاد إضافتها حدّثت الصف القائم");
        }

        [Test]
        public void Placeholder_Base_Unit_Without_Id_Maps_To_Existing_Base_Unit()
        {
            var edited = ProductRepo.GetById(_product.Id);
            edited.PricePiasters = 2700;
            edited.Units.RemoveAll(delegate (ProductUnit u) { return u.IsBaseUnit; });
            edited.Units.Insert(0, new ProductUnit { UnitName = "قطعة", ConversionFactor = 1, IsBaseUnit = true, SellPricePiasters = 2700, CostPricePiasters = 1800 });

            using (AdmitProductRequest("usr_admin_default"))
                ProductService.SaveProduct(edited, true, true);

            var units = _unitService.GetUnitsForProduct(_product.Id);
            Assert.AreEqual(1, units.FindAll(delegate (ProductUnit u) { return u.IsBaseUnit; }).Count, "وحدة أساسية واحدة فقط");
            Assert.IsNotNull(_unitService.GetUnitById(_carton.Id), "الكرتونة المباعة باقية");
            Assert.AreEqual(2700, ProductRepo.GetById(_product.Id).PricePiasters);
        }

        [Test]
        public void Duplicate_Unit_Names_Are_Rejected_With_Arabic_Message()
        {
            var edited = ProductRepo.GetById(_product.Id);
            edited.Units.Add(new ProductUnit { UnitName = _carton.UnitName, ConversionFactor = 12, SellPricePiasters = 28000 });

            InvalidOperationException ex;
            using (AdmitProductRequest("usr_admin_default"))
                ex = Assert.Throws<InvalidOperationException>(delegate { ProductService.SaveProduct(edited, true, true); });
            StringAssert.Contains("مكرر", ex.Message);
            StringAssert.DoesNotContain("UNIQUE", ex.Message);
        }
    }
}
