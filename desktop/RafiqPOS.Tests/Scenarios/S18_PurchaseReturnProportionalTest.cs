using System.Collections.Generic;
using NUnit.Framework;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Tests.Scenarios
{
    [TestFixture]
    public class S18_PurchaseReturnProportionalTest : TestBase
    {
        [Test]
        public void Returning_A_Line_Piece_By_Piece_Credits_Exactly_The_Line_Total()
        {
            var prod = CreateTestProduct("صنف مرتجع مشتريات", 1500, 600, 0);
            var supplier = SupplierRepo.Save(new Supplier { Name = "مورد التناسب", IsActive = true });
            var purchaseRepo = new PurchaseRepository(ConnectionString, CounterRepo, SupplierRepo, PriceHistoryRepo, AuditRepo);

            // 3 وحدات بإجمالي 20.00 ج: التكلفة الفعلية للوحدة 6.666... قرش
            var purchase = purchaseRepo.CreatePurchase(new Purchase
            {
                SupplierId = supplier.Id,
                PaidAmountPiasters = 0,
                DiscountPiasters = 1,
                Items = new List<PurchaseItem>
                {
                    new PurchaseItem { ProductId = prod.Id, QuantityMilli = 3000, UnitCostPiasters = 667 }
                }
            }, "LATEST");
            long purchaseLineTotal = purchase.NetCostPiasters;
            Assert.AreEqual(2000, purchaseLineTotal, "صافي السطر 20.00 ج بعد خصم قرش");

            long credited = 0;
            for (int i = 0; i < 3; i++)
            {
                var ret = purchaseRepo.CreatePurchaseReturn(new PurchaseReturn
                {
                    SupplierId = supplier.Id,
                    PurchaseId = purchase.Id,
                    Items = new List<PurchaseReturnItem>
                    {
                        new PurchaseReturnItem { ProductId = prod.Id, QuantityMilli = 1000 }
                    }
                });
                credited += ret.TotalCostPiasters;
            }

            Assert.AreEqual(purchaseLineTotal, credited, "مجموع المرتجعات يساوي إجمالي سطر الشراء بالضبط دون زيادة للمورد");
        }
    }
}
