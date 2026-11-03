using System;
using System.Collections.Generic;
using System.Data.SQLite;
using System.Globalization;
using System.IO;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    // Real production initialization, migrations, authenticated IPC and SQLite. No mocked services.
    // The inherited fixture tears down all static DatabaseService state and its disposable directory.
    [NonParallelizable]
    public abstract class S40_FinanceFixture : S30_Step3BFixtureBase
    {
        protected static SQLiteConnection OpenFinanceConnection()
        {
            var builder = new SQLiteConnectionStringBuilder(DatabaseService.ConnectionString);
            string path = Path.GetFullPath(builder.DataSource);
            Assert.IsTrue(path.StartsWith(Path.GetFullPath(Path.GetTempPath()), StringComparison.OrdinalIgnoreCase)
                && path.IndexOf("rafiq_nunit_3b_", StringComparison.Ordinal) >= 0,
                "Refusing to open a non-test finance database: " + path);
            builder.ForeignKeys = true;
            var conn = new SQLiteConnection(builder.ConnectionString);
            try
            {
                conn.Open();
                using (var cmd = new SQLiteCommand(
                    "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;", conn))
                    cmd.ExecuteNonQuery();
                return conn;
            }
            catch { conn.Dispose(); throw; }
        }

        protected static object FinanceValue(string sql, params object[] pairs)
        {
            using (var conn = OpenFinanceConnection())
            using (var cmd = new SQLiteCommand(sql, conn))
            {
                for (int i = 0; i < pairs.Length; i += 2)
                    cmd.Parameters.AddWithValue((string)pairs[i], pairs[i + 1] ?? DBNull.Value);
                return cmd.ExecuteScalar();
            }
        }

        protected static long FinanceCount(string sql, params object[] pairs)
        {
            return Convert.ToInt64(FinanceValue(sql, pairs), CultureInfo.InvariantCulture);
        }

        protected static void FinanceExecute(string sql, params object[] pairs)
        {
            using (var conn = OpenFinanceConnection())
            using (var cmd = new SQLiteCommand(sql, conn))
            {
                for (int i = 0; i < pairs.Length; i += 2)
                    cmd.Parameters.AddWithValue((string)pairs[i], pairs[i + 1] ?? DBNull.Value);
                cmd.ExecuteNonQuery();
            }
        }

        // Full row snapshots catch mutations with unchanged row counts (balance, stock, claim state).
        // Audit/security logging is intentionally not business state.
        protected static string FinancialState()
        {
            string[] tables = { "sales", "sale_items", "payments", "returns", "return_items",
                "products", "stock_movements", "customers", "customer_ledger", "counters",
                "digital_accounts", "digital_transactions", "digital_account_fundings",
                "insurance_claim_lines", "insurance_claim_batches", "expenses",
                "epay_terminals", "epay_transactions", "epay_terminal_fundings",
                "shifts", "daily_closings", "delivery_orders", "delivery_riders",
                "cash_drawer_transactions" };
            var state = new SortedDictionary<string, List<string>>(StringComparer.Ordinal);
            using (var conn = OpenFinanceConnection())
            {
                foreach (string table in tables)
                {
                    using (var exists = new SQLiteCommand("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=@name;", conn))
                    {
                        exists.Parameters.AddWithValue("@name", table);
                        if (Convert.ToInt64(exists.ExecuteScalar()) == 0) continue;
                    }
                    var rows = new List<string>();
                    using (var cmd = new SQLiteCommand("SELECT * FROM \"" + table + "\";", conn))
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            var values = new object[reader.FieldCount];
                            reader.GetValues(values);
                            rows.Add(JsonConvert.SerializeObject(values));
                        }
                    }
                    rows.Sort(StringComparer.Ordinal);
                    state.Add(table, rows);
                }
            }
            return JsonConvert.SerializeObject(state);
        }

        protected static DigitalAccount Wallet(long balance)
        {
            return DatabaseService.DigitalAccounts.SaveAccount(new DigitalAccount
            {
                Name = "Finance regression wallet", Type = "wallet", Provider = "vodafone_cash",
                AccountNumber = "01012345678", BalancePiasters = balance, IsActive = true
            });
        }

        protected static Sale CashSale(Product product, Shift shift, long price)
        {
            return DatabaseService.Sales.ProcessSale(new Sale
            {
                CashierId = AdminId, CashierName = "Finance regression",
                ShiftId = shift.Id, PaymentMethod = "cash", PaidPiasters = price,
                Items = new List<SaleItem> { new SaleItem
                {
                    ProductId = product.Id, ProductName = product.Name, QuantityMilli = 1000,
                    Unit = product.Unit, ConversionFactor = 1, UnitPricePiasters = price, TotalPiasters = price
                } }
            }, Guid.NewGuid().ToString("N"));
        }

        protected static Return Refund(Sale sale, string productId, string saleItemId)
        {
            return new Return
            {
                SaleId = sale.Id, CashierId = AdminId, RefundMethod = "cash", Reason = "Finance regression",
                Items = new List<ReturnItem> { new ReturnItem
                {
                    ProductId = productId, SaleItemId = saleItemId, ProductName = "Refund line",
                    QuantityMilli = 1000, UnitPricePiasters = sale.Items[0].UnitPricePiasters,
                    TotalPiasters = sale.Items[0].TotalPiasters, Unit = sale.Items[0].Unit,
                    ConversionFactor = 1, IsDamaged = false
                } }
            };
        }

        protected static InsuranceClaimLine PendingClaim(Sale sale)
        {
            var company = DatabaseService.InsuranceRepo.SaveCompany(new InsuranceCompany { Name = "Finance insurer" });
            var contract = DatabaseService.InsuranceRepo.SaveContract(new InsuranceContract
            {
                CompanyId = company.Id, Name = "Finance contract", PatientShareBps = 2000
            });
            var claim = new InsuranceClaimLine
            {
                SaleId = sale.Id, CompanyId = company.Id, ContractId = contract.Id,
                MemberNo = "FIN-001", PatientName = "Test patient",
                TotalInvoicePiasters = 10000, CoveredPiasters = 10000,
                PatientPiasters = 2000, CompanyPiasters = 8000, Status = "pending"
            };
            using (var conn = OpenFinanceConnection())
            using (var tx = conn.BeginTransaction())
            {
                DatabaseService.InsuranceRepo.InsertClaimLine(claim, conn, tx);
                tx.Commit();
            }
            return claim;
        }
    }

    [TestFixture]
    [NonParallelizable]
    public class S40_PrioritizedMoneySafetyTest : S40_FinanceFixture
    {
        [Test]
        public void FIN01_OmittedDestination_InsufficientCash_RejectsWithoutPosting()
        {
            OpenShift(0);
            var wallet = Wallet(0);
            string before = FinancialState();
            var response = Dispatch("wallets:processTransaction", new JObject
            {
                { "accountId", wallet.Id }, { "txType", "cash_in" },
                { "amountPiasters", 10000 }, { "profitPiasters", 100 },
                { "idempotencyKey", Guid.NewGuid().ToString("N") }
            });
            Assert.IsFalse(response.Success, "Omitted destination defaults to drawer BEFORE sufficiency check. " + Describe(response));
            Assert.AreEqual(before, FinancialState(), "Rejected 9,900-piaster drawer outflow must be atomic.");
        }

        [Test]
        public void FIN01_OmittedDestination_ClosedDay_RejectsWithoutPosting()
        {
            var wallet = Wallet(20000);
            string day = DatabaseService.DailyClosing.GetCurrentBusinessDate();
            DatabaseService.DailyClosing.SaveClosing(new DailyClosingSaveRequest
            {
                BusinessDate = day, ActualCashPiasters = 0, CashierId = AdminId
            });
            string before = FinancialState();
            var response = Dispatch("wallets:processTransaction", new JObject
            {
                { "accountId", wallet.Id }, { "txType", "cash_out" },
                { "amountPiasters", 10000 }, { "profitPiasters", 100 },
                { "idempotencyKey", Guid.NewGuid().ToString("N") }
            });
            Assert.IsFalse(response.Success, "A sealed day cannot gain drawer income via a missing destination.");
            Assert.AreEqual(before, FinancialState());
        }

        [TestCase("external")]
        [TestCase("cash_drawer")]
        public void FIN03_UIFundingSource_IsHonoredThroughIPC(string source)
        {
            OpenShift(50000);
            var wallet = Wallet(0);
            string day = DatabaseService.DailyClosing.GetCurrentBusinessDate();
            long before = DatabaseService.DailyClosing.GetLiveDrawerBalance(day).AvailableCashPiasters;
            var response = Dispatch("wallets:fundAccount", new JObject
            {
                { "accountId", wallet.Id }, { "amountPiasters", 10000 },
                { "source", source }, { "notes", "Exact WalletsView funding field" },
                { "idempotencyKey", Guid.NewGuid().ToString("N") }
            });
            Assert.IsTrue(response.Success, Describe(response));
            Assert.AreEqual(10000, DatabaseService.DigitalAccounts.GetAccountById(wallet.Id).BalancePiasters);
            Assert.AreEqual(source, Convert.ToString(FinanceValue(
                "SELECT funding_source FROM digital_account_fundings WHERE account_id=@id;", "@id", wallet.Id)));
            Assert.AreEqual(before - (source == "cash_drawer" ? 10000 : 0),
                DatabaseService.DailyClosing.GetLiveDrawerBalance(day).AvailableCashPiasters);
        }

        [TestCase(false)]
        [TestCase(true)]
        public void FIN06_ProductOrForeignInvoiceLineMismatch_RejectsAndRollsBack(bool foreignLine)
        {
            var shift = OpenShift(50000);
            var a = CreateProduct("Invoice A", 10000, 3000, 10000);
            var b = CreateProduct("Invoice B", 10000, 3000, 10000);
            var saleA = CashSale(a, shift, 10000);
            var saleB = CashSale(b, shift, 10000);
            var request = Refund(saleA, foreignLine ? a.Id : b.Id,
                foreignLine ? saleB.Items[0].Id : saleA.Items[0].Id);
            string before = FinancialState();
            Assert.Throws<InvalidOperationException>(delegate { DatabaseService.Returns.ProcessReturn(request); });
            Assert.AreEqual(before, FinancialState(),
                "Mismatched identity cannot change any inventory, refund, ledger, counter or balance row.");
        }

        [TestCase(100, false, false)]
        [TestCase(1200, false, true)]
        [TestCase(100, true, true)]
        public void FIN07_PackageFactor12_RequiresUnitPriceOrExplicitOverride(long price, bool approved, bool accepted)
        {
            var product = CreateProduct("Twelve pack", 100, 30, 24000);
            var unit = new ProductUnit
            {
                ProductId = product.Id, UnitName = "box12", ConversionFactor = 12,
                SellPricePiasters = 1200, CostPricePiasters = 360, IsBaseUnit = false
            };
            DatabaseService.ProductUnitRepo.Create(unit);
            LoginAs(CashierId);
            var shift = DatabaseService.Shifts.OpenShift(new OpenShiftRequest
            {
                PosRegisterId = "default_pos", CashierId = CashierId,
                CashierName = "Finance cashier", OpeningFloatPiasters = 50000
            });
            var request = new Sale
            {
                CashierId = CashierId, ShiftId = shift.Id, PaymentMethod = "cash", PaidPiasters = price,
                SupervisorPin = approved ? "7418" : null,
                Items = new List<SaleItem> { new SaleItem
                {
                    ProductId = product.Id, ProductName = product.Name, QuantityMilli = 1000,
                    Unit = unit.UnitName, ConversionFactor = 12, UnitPricePiasters = price, TotalPiasters = price
                } }
            };
            string before = FinancialState();
            if (!accepted)
            {
                Assert.Throws<InvalidOperationException>(delegate { DatabaseService.Sales.ProcessSale(request); });
                Assert.AreEqual(before, FinancialState());
            }
            else
            {
                var sale = DatabaseService.Sales.ProcessSale(request);
                Assert.AreEqual(price, sale.TotalPiasters);
                Assert.AreEqual(12000, Stock(product.Id));
                Assert.AreEqual(12, sale.Items[0].ConversionFactor);
                if (approved)
                    Assert.AreEqual(1, FinanceCount(
                        "SELECT COUNT(*) FROM audit_logs WHERE action='SALE_PRICE_OVERRIDE_APPROVED' AND entity_id=@id;",
                        "@id", sale.Id), "Base-price package must require a real audited approval.");
            }
        }

        [Test]
        public void FIN08_BatchCreation_InsertsParentBeforeImmediateForeignKeyLink()
        {
            var shift = OpenShift(50000);
            var sale = CashSale(CreateProduct("Claim stock", 10000, 3000, 10000), shift, 10000);
            var claim = PendingClaim(sale);
            Assert.AreEqual(1, FinanceCount("PRAGMA foreign_keys;"));
            var batch = DatabaseService.InsuranceRepo.CreateClaimBatch(claim.CompanyId, "2026-11",
                new List<string> { claim.Id }, AdminId);
            Assert.AreEqual(8000, batch.TotalAmountPiasters);
            Assert.AreEqual(1, batch.TotalClaimsCount);
            Assert.AreEqual(batch.Id, Convert.ToString(FinanceValue(
                "SELECT claim_batch_id FROM insurance_claim_lines WHERE id=@id;", "@id", claim.Id)));
            Assert.AreEqual("batched", Convert.ToString(FinanceValue(
                "SELECT status FROM insurance_claim_lines WHERE id=@id;", "@id", claim.Id)));
            using (var conn = OpenFinanceConnection())
            using (var cmd = new SQLiteCommand("PRAGMA foreign_key_check;", conn))
            using (var reader = cmd.ExecuteReader())
                Assert.IsFalse(reader.Read(), "Batch/link must leave no FK violations.");
        }
    }
}
