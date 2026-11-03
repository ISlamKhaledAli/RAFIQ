using System;
using System.Collections.Generic;
using System.Globalization;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using RafiqPOS.Models;
using RafiqPOS.Repositories;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    [TestFixture]
    [NonParallelizable]
    public class S44_InsuranceReturnAndWalletPolicyTest : S40_FinanceFixture
    {
        private static Sale FiveUnitInsuredSale(Shift shift, Product product)
        {
            var company = DatabaseService.InsuranceRepo.SaveCompany(new InsuranceCompany { Name = "Partial-return insurer" });
            var contract = DatabaseService.InsuranceRepo.SaveContract(new InsuranceContract
            {
                CompanyId = company.Id, Name = "80 percent company coverage", PatientShareBps = 2000
            });
            var customer = DatabaseService.Customers.SaveCustomer(new Customer { Name = "Insured partial-return customer" });
            var sale = DatabaseService.Sales.ProcessSale(new Sale
            {
                CashierId = AdminId, CashierName = "Insurance regression", ShiftId = shift.Id,
                CustomerId = customer.Id, PaymentMethod = "insurance", PaidPiasters = 2000,
                InsuranceClaim = new InsuranceClaimLine
                {
                    CompanyId = company.Id, ContractId = contract.Id, MemberNo = "PARTIAL-001",
                    PatientName = "Test patient", Status = "pending"
                },
                Items = new List<SaleItem> { new SaleItem
                {
                    ProductId = product.Id, ProductName = product.Name, QuantityMilli = 5000,
                    Unit = product.Unit, ConversionFactor = 1, UnitPricePiasters = 2000, TotalPiasters = 10000
                } }
            }, Guid.NewGuid().ToString("N"));
            Assert.AreEqual(8000, PendingCompanyAmount(sale.Id));
            Assert.AreEqual(5000, Stock(product.Id));
            Assert.AreEqual(2000, FinanceCount(
                "SELECT SUM(amount_piasters) FROM payments WHERE sale_id=@s AND method='cash';", "@s", sale.Id));
            return sale;
        }

        private static long PendingCompanyAmount(string saleId)
        {
            long total = 0;
            foreach (var claim in DatabaseService.InsuranceRepo.GetPendingClaimLines())
                if (claim.SaleId == saleId) total += claim.CompanyPiasters;
            return total;
        }

        private static Return OneUnitReturn(Sale sale, string method, long submittedPrice)
        {
            return new Return
            {
                SaleId = sale.Id, CustomerId = sale.CustomerId, CashierId = AdminId,
                RefundMethod = method, Reason = "One of five insured units returned",
                IdempotencyKey = Guid.NewGuid().ToString("N"),
                Items = new List<ReturnItem> { new ReturnItem
                {
                    SaleItemId = sale.Items[0].Id, ProductId = sale.Items[0].ProductId,
                    ProductName = sale.Items[0].ProductName, Unit = sale.Items[0].Unit, ConversionFactor = 1,
                    QuantityMilli = 1000, UnitPricePiasters = submittedPrice,
                    TotalPiasters = submittedPrice, IsDamaged = false
                } }
            };
        }

        private static void AssertExplicitInsurancePolicy(Exception error)
        {
            StringAssert.IsMatch("تأمين|تامين|مطالب|[Ii]nsurance", error.Message,
                "An unsupported insured return must explain the insurance/reconciliation policy, not fail for another reason.");
        }

        [TestCase(2000)]
        [TestCase(1)]
        public void FIN09_PendingPartialInsuredReturn_AdjustsAuthoritativeClaimOrExplicitlyRejects(long clientPrice)
        {
            var shift = OpenShift(50000);
            var product = CreateProduct("Five insured units", 2000, 600, 10000);
            var sale = FiveUnitInsuredSale(shift, product);
            string before = FinancialState();
            Return result;
            try
            {
                // This cash amount is within the invoice's actual 2,000-piaster cash receipt.
                // A policy rejection is valid until an authoritative coverage allocation exists.
                result = DatabaseService.Returns.ProcessReturn(OneUnitReturn(sale, "cash", clientPrice));
            }
            catch (InvalidOperationException error)
            {
                AssertExplicitInsurancePolicy(error);
                Assert.AreEqual(before, FinancialState(), "Rejected return cannot leave stock, cash, debt or claim changes.");
                Assert.AreEqual(8000, PendingCompanyAmount(sale.Id));
                return;
            }
            Assert.IsNotNull(result);
            Assert.AreEqual(2000, result.TotalPiasters, "Original invoice, not submitted price, controls the returned value.");
            Assert.AreEqual(6000, Stock(product.Id));
            Assert.AreEqual(6400, PendingCompanyAmount(sale.Id),
                "One of five units removes 1,600 of the original 8,000 company receivable; never retain an overclaim.");
        }

        private static string ImportSubmittedBatch(Sale sale)
        {
            string id = Guid.NewGuid().ToString("N");
            FinanceExecute(@"INSERT INTO insurance_claim_batches
                (id,batch_number,company_id,period,total_claims_count,total_amount_piasters,status,created_by,created_at)
                SELECT @b,@number,company_id,'2026-11',1,company_piasters,'submitted',@by,created_at
                FROM insurance_claim_lines WHERE sale_id=@s;
                UPDATE insurance_claim_lines SET status='batched',claim_batch_id=@b WHERE sale_id=@s;",
                "@b", id, "@number", "PARTIAL-" + id, "@by", AdminId, "@s", sale.Id);
            return id;
        }

        [TestCase(false, "cash")]
        [TestCase(true, "cash")]
        [TestCase(false, "credit")]
        [TestCase(true, "credit")]
        public void FIN09_BatchedOrSettledPartialReturn_RejectsWithCompleteRollback(bool settled, string method)
        {
            var shift = OpenShift(50000);
            var product = CreateProduct("Submitted insured units", 2000, 600, 10000);
            var sale = FiveUnitInsuredSale(shift, product);
            string batch = ImportSubmittedBatch(sale);
            if (settled)
                DatabaseService.Insurance.SettleBatch(batch, 8000, 0, null, null, AdminId);
            string before = FinancialState();
            var error = Assert.Throws<InvalidOperationException>(delegate
            {
                DatabaseService.Returns.ProcessReturn(OneUnitReturn(sale, method, 2000));
            });
            AssertExplicitInsurancePolicy(error);
            Assert.AreEqual(before, FinancialState(), "Reject before any return, customer-credit, stock, counter or claim write.");
            Assert.AreEqual(5000, Stock(product.Id));
            Assert.AreEqual(0, FinanceCount("SELECT COUNT(*) FROM returns WHERE sale_id=@s;", "@s", sale.Id));
        }

        [TestCase(false)]
        [TestCase(true)]
        public void FIN05_OriginalShiftClosedButDayOpen_WalletOrEpayCancellationRejects(bool epay)
        {
            // Choose a supported cutoff at least six hours from now, so a midnight/noon boundary
            // cannot turn this into an older-business-day test while timestamps are delimited below.
            int hour = DateTime.Now.Hour;
            DatabaseService.SettingsRepo.Set("business_day_cutoff_hour", hour >= 6 && hour < 18 ? "0" : "12");
            var originalShift = OpenShift(50000);
            var epayRepo = new EpayRepository(DatabaseService.ConnectionString, DatabaseService.AuditRepo);
            string transactionId;
            string table;
            if (epay)
            {
                var terminal = epayRepo.SaveTerminal(new EpayTerminal
                {
                    Name = "Closed-shift terminal", Provider = "fawry", BalancePiasters = 50000, IsActive = true
                });
                transactionId = epayRepo.CreateTransaction(new EpayTransaction
                {
                    TerminalId = terminal.Id, ServiceType = "bill", BillAmountPiasters = 10000,
                    CustomerFeePiasters = 100, PaymentChannel = "cash_drawer",
                    IdempotencyKey = Guid.NewGuid().ToString("N"), CashierName = "Shift regression"
                }).Id;
                table = "epay_transactions";
            }
            else
            {
                transactionId = DatabaseService.DigitalAccounts.ProcessTransaction(new DigitalTransaction
                {
                    AccountId = Wallet(50000).Id, TxType = "cash_out", AmountPiasters = 10000,
                    ProfitPiasters = 100, PaymentDestination = "cash_drawer",
                    IdempotencyKey = Guid.NewGuid().ToString("N"), CashierName = "Shift regression"
                }).Id;
                table = "digital_transactions";
            }
            // Delimit historical membership without sleeps or a clock-change hook.
            // UTC offsets are retained; otherwise an "ambiguous timestamp" guard could hide a missing closed-shift guard.
            // Arrange timestamps while the shift is OPEN; production deliberately forbids updating a closed row.
            DateTime anchor = DateTime.UtcNow;
            FinanceExecute("UPDATE shifts SET opened_at=@open WHERE id=@id;",
                "@open", anchor.AddMinutes(-3).ToString("o"), "@id", originalShift.Id);
            FinanceExecute("UPDATE " + table + " SET created_at=@at WHERE id=@id;",
                "@at", anchor.AddMinutes(-2).ToString("o"), "@id", transactionId);
            var closed = DatabaseService.Shifts.CloseShift(new CloseShiftRequest
            {
                ShiftId = originalShift.Id, ActualCashPiasters = 60100
            });
            Assert.AreEqual(60100, closed.ExpectedCashPiasters);
            OpenShift(60100);
            string day = DatabaseService.DailyClosing.GetCurrentBusinessDate();
            Assert.IsFalse(DatabaseService.DailyClosing.IsDayClosed(day), "Current day must remain open.");
            Assert.IsFalse(DatabaseService.DailyClosing.IsDayClosed(originalShift.BusinessDate), "Original day must remain open too.");
            Assert.AreEqual(0, FinanceCount("SELECT COUNT(*) FROM daily_closings;"), "This must exercise the shift, not day seal.");
            string before = FinancialState();
            var error = Assert.Throws<InvalidOperationException>(delegate
            {
                if (epay) epayRepo.CancelTransaction(transactionId, "Closed shift regression", AdminId);
                else DatabaseService.DigitalAccounts.CancelTransaction(transactionId, "Closed shift regression", AdminId);
            });
            StringAssert.Contains("وردية", error.Message, "The original closed shift must be the reason, not the current day or ambiguous timestamp.");
            Assert.AreEqual(before, FinancialState());
            Assert.AreEqual(60100, DatabaseService.Shifts.GetShiftSummary(originalShift.Id).ExpectedCashPiasters);
        }

        [TestCase("drawer")]
        [TestCase("bank_transfer")]
        [TestCase("invalid_destination")]
        public void FIN01_InvalidPaymentDestination_RejectsWithoutPosting(string destination)
        {
            OpenShift(50000);
            var wallet = Wallet(50000);
            string before = FinancialState();
            var response = Dispatch("wallets:processTransaction", new JObject
            {
                { "accountId", wallet.Id }, { "txType", "cash_in" },
                { "amountPiasters", 10000 }, { "profitPiasters", 100 },
                { "paymentDestination", destination }, { "idempotencyKey", Guid.NewGuid().ToString("N") }
            });
            Assert.IsFalse(response.Success);
            StringAssert.IsMatch("وجه|[Dd]estination", Describe(response), "Invalid destination must fail explicitly.");
            Assert.AreEqual(before, FinancialState());
        }

        [TestCase("source", "safe")]
        [TestCase("fundingSource", "safe")]
        [TestCase("source", "wallet")]
        [TestCase("fundingSource", "wallet")]
        [TestCase("source", "invalid_source")]
        [TestCase("fundingSource", "invalid_source")]
        public void FIN03_InvalidFundingSourceInEitherField_RejectsWithoutPosting(string field, string source)
        {
            OpenShift(50000);
            var wallet = Wallet(0);
            var payload = new JObject
            {
                { "accountId", wallet.Id }, { "amountPiasters", 10000 },
                { "idempotencyKey", Guid.NewGuid().ToString("N") }
            };
            payload[field] = source;
            string before = FinancialState();
            var response = Dispatch("wallets:fundAccount", payload);
            Assert.IsFalse(response.Success);
            StringAssert.IsMatch("مصدر|[Ss]ource", Describe(response));
            Assert.AreEqual(before, FinancialState());
        }

        [TestCase("external", "cash_drawer")]
        [TestCase("cash_drawer", "external")]
        [TestCase("external_cash", "bank_transfer")]
        public void FIN03_ConflictingFundingSourceAliases_RejectWithoutPosting(string source, string fundingSource)
        {
            OpenShift(50000);
            var wallet = Wallet(0);
            string before = FinancialState();
            var response = Dispatch("wallets:fundAccount", new JObject
            {
                { "accountId", wallet.Id }, { "amountPiasters", 10000 },
                { "source", source }, { "fundingSource", fundingSource },
                { "idempotencyKey", Guid.NewGuid().ToString("N") }
            });
            Assert.IsFalse(response.Success, "Neither alias can silently override contradictory financial intent.");
            StringAssert.IsMatch("متناقض|تعارض|[Cc]onflict", Describe(response));
            Assert.AreEqual(before, FinancialState());
        }

        [TestCase("external_cash", "external", "external")]
        [TestCase(" EXTERNAL_CASH ", " External ", "external")]
        [TestCase("cash_drawer", " Cash_Drawer ", "cash_drawer")]
        [TestCase("bank_transfer", "BANK_TRANSFER", "bank_transfer")]
        public void FIN03_EquivalentFundingSourceAliases_PostOneCanonicalFunding(string source, string fundingSource, string canonical)
        {
            OpenShift(50000);
            var wallet = Wallet(0);
            string day = DatabaseService.DailyClosing.GetCurrentBusinessDate();
            DispatchOk("wallets:fundAccount", new JObject
            {
                { "accountId", wallet.Id }, { "amountPiasters", 10000 },
                { "source", source }, { "fundingSource", fundingSource },
                { "idempotencyKey", Guid.NewGuid().ToString("N") }
            });
            Assert.AreEqual(10000, DatabaseService.DigitalAccounts.GetAccountById(wallet.Id).BalancePiasters);
            Assert.AreEqual(1, FinanceCount("SELECT COUNT(*) FROM digital_account_fundings WHERE account_id=@a;", "@a", wallet.Id));
            Assert.AreEqual(canonical, Convert.ToString(FinanceValue(
                "SELECT funding_source FROM digital_account_fundings WHERE account_id=@a;", "@a", wallet.Id), CultureInfo.InvariantCulture));
            Assert.AreEqual(canonical == "cash_drawer" ? 40000 : 50000,
                DatabaseService.DailyClosing.GetLiveDrawerBalance(day).AvailableCashPiasters);
        }
    }
}
