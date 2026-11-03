using System;
using System.Collections.Generic;
using NUnit.Framework;
using RafiqPOS.Models;
using RafiqPOS.Repositories;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    [TestFixture]
    [NonParallelizable]
    public class S47_CoreMoneyBoundarySafetyTest : S40_FinanceFixture
    {
        [TestCase("unit")]
        [TestCase("factor")]
        [TestCase("negativeFactor")]
        [TestCase("product")]
        [TestCase("foreignLine")]
        public void FIN06_DirectRepositoryRejectsForgedIdentityWithoutPosting(string change)
        {
            var shift = OpenShift(50000);
            var product = CreateProduct("Boundary stock", 10000, 3000, 10000);
            var other = CreateProduct("Other boundary stock", 10000, 3000, 10000);
            var sale = CashSale(product, shift, 10000);
            var request = Refund(sale, product.Id, sale.Items[0].Id);
            if (change == "unit") request.Items[0].Unit = "forged-unit";
            if (change == "factor") request.Items[0].ConversionFactor = 12;
            if (change == "negativeFactor") request.Items[0].ConversionFactor = -12;
            if (change == "product") request.Items[0].ProductId = other.Id;
            if (change == "foreignLine") request.Items[0].SaleItemId = CashSale(other, shift, 10000).Items[0].Id;
            string before = FinancialState();
            Assert.Throws<InvalidOperationException>(delegate { DatabaseService.ReturnRepo.CreateReturnAtomic(request); });
            Assert.AreEqual(before, FinancialState());
        }

        [Test]
        public void FIN06_DirectRepositoryRejectsRepeatedLinesAboveCumulativeQuantity()
        {
            var shift = OpenShift(50000);
            var product = CreateProduct("Aggregate boundary stock", 10000, 3000, 10000);
            var sale = CashSale(product, shift, 10000);
            var request = Refund(sale, product.Id, sale.Items[0].Id);
            request.Items[0].QuantityMilli = 600;
            request.Items[0].UnitPricePiasters = 5000;
            request.Items[0].TotalPiasters = 3000;
            request.Items.Add(new ReturnItem
            {
                SaleItemId = sale.Items[0].Id, ProductId = product.Id, Unit = sale.Items[0].Unit,
                QuantityMilli = 600, UnitPricePiasters = 5000, TotalPiasters = 3000, ConversionFactor = 1
            });
            string before = FinancialState();
            Assert.Throws<InvalidOperationException>(delegate { DatabaseService.ReturnRepo.CreateReturnAtomic(request); });
            Assert.AreEqual(before, FinancialState());
        }

        [Test]
        public void FIN06_ValidPackageReturnUsesPersistedInvoiceUnitAndRestoresBaseQuantity()
        {
            var shift = OpenShift(50000);
            var product = CreateProduct("Canonical package", 100, 30, 24000);
            var unit = new ProductUnit
            {
                ProductId = product.Id, UnitName = "box12", ConversionFactor = 12,
                SellPricePiasters = 1200, CostPricePiasters = 360, IsDivisible = false
            };
            DatabaseService.ProductUnitRepo.Create(unit);
            var sale = DatabaseService.Sales.ProcessSale(new Sale
            {
                CashierId = AdminId, ShiftId = shift.Id, PaymentMethod = "cash", PaidPiasters = 1200,
                Items = new List<SaleItem> { new SaleItem
                {
                    ProductId = product.Id, QuantityMilli = 1000, UnitPricePiasters = 1200,
                    Unit = "box12", UnitId = unit.Id, ConversionFactor = 12
                } }
            }, Guid.NewGuid().ToString("N"));
            Assert.AreEqual(12000, Stock(product.Id));
            Assert.AreEqual("box12", DatabaseService.SaleRepo.GetSaleById(sale.Id).Items[0].Unit);
            var request = Refund(sale, product.Id, sale.Items[0].Id);
            request.Items[0].ConversionFactor = 12;
            var returned = DatabaseService.Returns.ProcessReturn(request);
            Assert.AreEqual(1200, returned.TotalPiasters);
            Assert.AreEqual(24000, Stock(product.Id));
        }

        [Test]
        public void FIN11_ReusedRequestIsNotMutatedAndReplaysOriginal()
        {
            var shift = OpenShift(50000);
            var product = CreateProduct("Unmutated request", 10000, 3000, 10000);
            var request = new Sale
            {
                CashierId = AdminId, ShiftId = shift.Id, PaymentMethod = "cash", PaidPiasters = 10000,
                Items = new List<SaleItem> { new SaleItem { ProductId = product.Id, QuantityMilli = 1000,
                    UnitPricePiasters = 10000, Unit = product.Unit, ConversionFactor = 1 } }
            };
            string key = Guid.NewGuid().ToString("N");
            var saved = DatabaseService.Sales.ProcessSale(request, key);
            Assert.IsNull(request.Id);
            Assert.AreEqual(0, request.Items[0].UnitCostPiasters);
            string before = FinancialState();
            Assert.AreEqual(saved.Id, DatabaseService.Sales.ProcessSale(request, key).Id);
            Assert.AreEqual(before, FinancialState());
            FinanceExecute("UPDATE sales SET idempotency_fingerprint = NULL WHERE id = @id;", "@id", saved.Id);
            var error = Assert.Throws<InvalidOperationException>(delegate { DatabaseService.Sales.ProcessSale(request, key); });
            StringAssert.Contains("SALE_IDEMPOTENCY_RECONCILIATION_REQUIRED", error.Message);
        }

        [Test]
        public void FIN11_AnotherDatabaseCannotBeSatisfiedByEarlierReplayCache()
        {
            var shift = OpenShift(50000);
            var product = CreateProduct("Context isolation", 10000, 3000, 10000);
            string key = Guid.NewGuid().ToString("N");
            var request = new Sale
            {
                CashierId = AdminId, ShiftId = shift.Id, PaymentMethod = "cash", PaidPiasters = 10000,
                Items = new List<SaleItem> { new SaleItem { ProductId = product.Id, QuantityMilli = 1000,
                    UnitPricePiasters = 10000, Unit = product.Unit, ConversionFactor = 1 } }
            };
            DatabaseService.Sales.ProcessSale(request, key);
            var other = new SaleService(new SaleRepository("Data Source=:memory:;Version=3;"), DatabaseService.ProductRepo);
            Assert.Catch<System.Data.SQLite.SQLiteException>(delegate { other.ProcessSale(request, key); },
                "The empty other database must be consulted, never a global cached sale.");
        }

        private static Sale CodSale(Product product, Shift shift)
        {
            return DatabaseService.Sales.ProcessSale(new Sale
            {
                CashierId = AdminId, ShiftId = shift.Id, PaymentMethod = "cash", OrderType = "delivery",
                PaidPiasters = 0, DeliveryInfo = new DeliveryOrderCreateInfo { CustomerName = "COD buyer", DeliveryAddress = "Address" },
                Items = new List<SaleItem> { new SaleItem { ProductId = product.Id, QuantityMilli = 1000,
                    UnitPricePiasters = 10000, Unit = product.Unit, ConversionFactor = 1 } }
            }, Guid.NewGuid().ToString("N"));
        }

        [Test]
        public void FIN11_ClientPaymentTimestampCannotMovePostingIntoClosedHistory()
        {
            var shift = OpenShift(50000);
            var product = CreateProduct("Payment timestamp authority", 10000, 3000, 10000);
            var request = new Sale
            {
                CashierId = AdminId, ShiftId = shift.Id, PaymentMethod = "cash", PaidPiasters = 10000,
                Items = new List<SaleItem> { new SaleItem { ProductId = product.Id, QuantityMilli = 1000,
                    UnitPricePiasters = 10000, Unit = product.Unit, ConversionFactor = 1 } },
                Payments = new List<SalePayment> { new SalePayment
                    { Method = "cash", AmountPiasters = 10000, CreatedAt = "2001-01-01T00:00:00Z" } }
            };
            string key = Guid.NewGuid().ToString("N");
            var saved = DatabaseService.Sales.ProcessSale(request, key);
            Assert.AreEqual(saved.CreatedAt, FinanceValue("SELECT created_at FROM payments WHERE sale_id = @id;", "@id", saved.Id));
            string before = FinancialState();
            request.Payments[0].CreatedAt = "2002-01-01T00:00:00Z";
            Assert.AreEqual(saved.Id, DatabaseService.Sales.ProcessSale(request, key).Id);
            Assert.AreEqual(before, FinancialState());
        }

        [TestCase(true)]
        [TestCase(false)]
        public void FIN02_UncollectedCodCannotFundRefund_AndCanBeCancelledAtomically(bool refund)
        {
            var shift = OpenShift(50000);
            var product = CreateProduct("Uncollected COD", 10000, 3000, 10000);
            var sale = CodSale(product, shift);
            string before = FinancialState();
            if (refund)
            {
                Assert.Throws<InvalidOperationException>(delegate
                {
                    DatabaseService.Returns.ProcessReturn(Refund(sale, product.Id, sale.Items[0].Id));
                });
                Assert.AreEqual(before, FinancialState());
            }
            else
            {
                DatabaseService.SaleRepo.CancelSaleAtomic(sale.Id, "COD cancelled before handover", AdminId);
                Assert.AreEqual("returned", FinanceValue("SELECT status FROM delivery_orders WHERE sale_id = @id;", "@id", sale.Id));
                Assert.AreEqual(10000, Stock(product.Id));
                Assert.AreEqual(0, FinanceCount("SELECT COUNT(*) FROM cash_drawer_transactions;"));
                Assert.AreEqual(50000, DatabaseService.DailyClosing.GetLiveDrawerBalance(
                    DatabaseService.DailyClosing.GetCurrentBusinessDate()).AvailableCashPiasters);
            }
        }

        [Test]
        public void FIN02_CommissionFailureRollsBackHandoverLedgerAndTerminalState()
        {
            var shift = OpenShift(50000);
            var sale = CodSale(CreateProduct("Atomic COD", 10000, 3000, 10000), shift);
            var rider = DatabaseService.Delivery.SaveRider(new DeliveryRider
            {
                Name = "Atomic rider", CommissionPerOrderPiasters = 1000, IsActive = true, Status = "available"
            });
            string orderId = FinanceValue("SELECT id FROM delivery_orders WHERE sale_id = @id;", "@id", sale.Id).ToString();
            DatabaseService.Delivery.AssignOrderToRider(orderId, rider.Id, AdminId);
            FinanceExecute(@"CREATE TRIGGER fin02_fail_commission BEFORE INSERT ON expenses
                BEGIN SELECT RAISE(ABORT,'FIN02 commission rollback'); END;");
            string before = FinancialState();
            var error = Assert.Catch<Exception>(delegate { DatabaseService.Delivery.SettleRider(rider.Id, AdminId, true); });
            StringAssert.Contains("FIN02 commission rollback", error.ToString());
            Assert.AreEqual(before, FinancialState());
        }

        [Test]
        public void FIN02_LegacyUnsettledCodRequiresReconciliationWithoutChangingRecordedCash()
        {
            var shift = OpenShift(50000);
            var sale = CodSale(CreateProduct("Legacy COD", 10000, 3000, 10000), shift);
            var rider = DatabaseService.Delivery.SaveRider(new DeliveryRider
            {
                Name = "Legacy rider", CommissionPerOrderPiasters = 1000, IsActive = true, Status = "available"
            });
            string orderId = FinanceValue("SELECT id FROM delivery_orders WHERE sale_id = @id;", "@id", sale.Id).ToString();
            DatabaseService.Delivery.AssignOrderToRider(orderId, rider.Id, AdminId);
            FinanceExecute("UPDATE delivery_orders SET cash_handover_tracked = NULL WHERE id = @id;", "@id", orderId);
            Assert.AreEqual(60000, DatabaseService.DailyClosing.GetLiveDrawerBalance(
                DatabaseService.DailyClosing.GetCurrentBusinessDate()).AvailableCashPiasters);
            string before = FinancialState();
            var error = Assert.Throws<InvalidOperationException>(delegate { DatabaseService.Delivery.SettleRider(rider.Id, AdminId, true); });
            StringAssert.Contains("DELIVERY_HANDOVER_RECONCILIATION_REQUIRED", error.Message);
            Assert.AreEqual(before, FinancialState());
        }

        [TestCase(5000, 5000)]
        [TestCase(11000, -1000)]
        public void FIN02_CodHandoverUsesExplicitCashAndRetainsCustomerDebtOrDeposit(long cash, long balance)
        {
            var shift = OpenShift(50000);
            var product = CreateProduct("Explicit COD cash", 10000, 3000, 10000);
            var customer = DatabaseService.Customers.SaveCustomer(new Customer { Name = "COD account" });
            var rider = DatabaseService.Delivery.SaveRider(new DeliveryRider
            {
                Name = "Explicit cash rider", CommissionPerOrderPiasters = 1000, IsActive = true, Status = "available"
            });
            var sale = DatabaseService.Sales.ProcessSale(new Sale
            {
                CashierId = AdminId, ShiftId = shift.Id, CustomerId = customer.Id,
                OrderType = "delivery", PaymentMethod = "cash", PaidPiasters = cash, ChangePiasters = 0,
                DeliveryInfo = new DeliveryOrderCreateInfo { CustomerName = customer.Name, DeliveryAddress = "Address" },
                Items = new List<SaleItem> { new SaleItem { ProductId = product.Id, QuantityMilli = 1000,
                    UnitPricePiasters = 10000, Unit = product.Unit, ConversionFactor = 1 } }
            }, Guid.NewGuid().ToString("N"));
            string order = FinanceValue("SELECT id FROM delivery_orders WHERE sale_id = @id;", "@id", sale.Id).ToString();
            Assert.AreEqual(cash, FinanceCount("SELECT total_to_collect_piasters FROM delivery_orders WHERE id = @id;", "@id", order));
            Assert.AreEqual(balance, FinanceCount("SELECT balance_piasters FROM customers WHERE id = @id;", "@id", customer.Id));
            Assert.AreEqual(50000, DatabaseService.DailyClosing.GetLiveDrawerBalance(
                DatabaseService.DailyClosing.GetCurrentBusinessDate()).AvailableCashPiasters);
            DatabaseService.Delivery.AssignOrderToRider(order, rider.Id, AdminId);
            var settled = DatabaseService.Delivery.SettleRider(rider.Id, AdminId, true);
            Assert.AreEqual(cash - 1000, settled.NetDrawerDepositPiasters);
            Assert.AreEqual(50000 + cash - 1000, DatabaseService.DailyClosing.GetLiveDrawerBalance(
                DatabaseService.DailyClosing.GetCurrentBusinessDate()).AvailableCashPiasters);
            Assert.AreEqual(balance, FinanceCount("SELECT balance_piasters FROM customers WHERE id = @id;", "@id", customer.Id));
        }
    }
}
