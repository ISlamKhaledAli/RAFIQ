using System;
using System.Collections.Generic;
using NUnit.Framework;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    [TestFixture]
    [Category("FinancePure")]
    public class S50_ProductWritePolicyTest
    {
        private static bool MetadataOnly(string permission)
        {
            return permission == "products.edit";
        }

        private static Product Product()
        {
            return new Product
            {
                Id = "product-1", Name = "Item", PricePiasters = 1000, CostPiasters = 800,
                TaxRatePercent = 14, TaxCategoryCode = "VAT", Units = null
            };
        }

        private static ProductUnit Unit()
        {
            return new ProductUnit
            {
                Id = "unit-1", ProductId = "product-1", UnitName = "piece",
                ConversionFactor = 1, IsBaseUnit = true, SellPricePiasters = 1000, CostPricePiasters = 800
            };
        }

        [Test]
        public void MetadataEditor_CanRenameButCannotCreate()
        {
            Product previous = Product();
            Product requested = Product();
            requested.Name = "Renamed";
            Assert.DoesNotThrow(() => ProductWritePolicy.ValidateProduct(previous, requested, MetadataOnly));
            Assert.Throws<UnauthorizedAccessException>(() => ProductWritePolicy.ValidateProduct(null, requested, MetadataOnly));
            Assert.DoesNotThrow(() => ProductWritePolicy.ValidateProduct(null, requested, p => p == "products.create"));
        }

        [TestCase("price")]
        [TestCase("tax-rate")]
        [TestCase("tax-category")]
        [TestCase("open-price")]
        [TestCase("cost")]
        public void MetadataEditor_CannotChangeFinancialFields(string field)
        {
            Product previous = Product();
            Product requested = Product();
            if (field == "price") requested.PricePiasters = 1;
            if (field == "tax-rate") requested.TaxRatePercent = 0;
            if (field == "tax-category") requested.TaxCategoryCode = "EXEMPT";
            if (field == "open-price") requested.IsOpenPrice = true;
            if (field == "cost") requested.CostPiasters = 1;
            Assert.Throws<UnauthorizedAccessException>(() => ProductWritePolicy.ValidateProduct(previous, requested, MetadataOnly));
            Assert.AreEqual(1000, previous.PricePiasters);
            Assert.AreEqual(800, previous.CostPiasters);
        }

        [TestCase(false)]
        [TestCase(true)]
        public void EmbeddedUnits_CannotBypassPriceOrCostPermissions(bool cost)
        {
            Product previous = Product();
            Product requested = Product();
            previous.Units = new List<ProductUnit> { Unit() };
            requested.Units = new List<ProductUnit> { Unit() };
            if (cost) requested.Units[0].CostPricePiasters = 1;
            else requested.Units[0].SellPricePiasters = 1;
            Assert.Throws<UnauthorizedAccessException>(() => ProductWritePolicy.ValidateProduct(previous, requested, MetadataOnly));
        }

        [Test]
        public void ExistingUnit_MetadataRenameIsAllowedButNewPricedUnitRequiresPermissions()
        {
            ProductUnit requested = Unit();
            requested.UnitName = "renamed";
            Assert.DoesNotThrow(() => ProductWritePolicy.ValidateUnit(Unit(), requested, MetadataOnly));
            Assert.Throws<UnauthorizedAccessException>(() => ProductWritePolicy.ValidateUnit(null, requested, MetadataOnly));
            Assert.DoesNotThrow(() => ProductWritePolicy.ValidateUnit(null, requested, p => true));
        }

        [TestCase("price")]
        [TestCase("cost")]
        [TestCase("factor")]
        [TestCase("base")]
        public void ExistingUnit_FinancialChangesRequireTheirOwnPermission(string field)
        {
            ProductUnit requested = Unit();
            if (field == "price") requested.SellPricePiasters = 1;
            if (field == "cost") requested.CostPricePiasters = 1;
            if (field == "factor") requested.ConversionFactor = 12;
            if (field == "base") requested.IsBaseUnit = false;
            Assert.Throws<UnauthorizedAccessException>(() => ProductWritePolicy.ValidateUnit(Unit(), requested, MetadataOnly));
        }

        [Test]
        public void AUnitCannotBeReparentedEvenWithAllPermissions()
        {
            ProductUnit requested = Unit();
            requested.ProductId = "different-product";
            Assert.Throws<InvalidOperationException>(() => ProductWritePolicy.ValidateUnit(Unit(), requested, p => true));
        }
    }
}
