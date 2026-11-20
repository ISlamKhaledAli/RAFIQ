using System;
using System.Collections.Generic;
using System.Data.SQLite;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    [TestFixture]
    [NonParallelizable]
    public class S104_InsurancePrescriptionCreditAndLedgerTest : S30_Step3BFixtureBase
    {
        private InsuranceCompany _company;
        private InsuranceContract _contract20Percent;
        private InsuranceContract _contractFullCoverage;

        [SetUp]
        public void SetUpInsurance()
        {
            _company = DatabaseService.Insurance.SaveCompany(new InsuranceCompany
            {
                Name = "شركة مصر للتأمين الطبي",
                Phone = "01012345678",
                IsActive = true
            });

            _contract20Percent = DatabaseService.Insurance.SaveContract(new InsuranceContract
            {
                CompanyId = _company.Id,
                Name = "عقد فئة ذهبية - 20% تحمل",
                PatientShareBps = 2000, // 20% patient share
                IsActive = true
            });

            _contractFullCoverage = DatabaseService.Insurance.SaveContract(new InsuranceContract
            {
                CompanyId = _company.Id,
                Name = "عقد فئة شاملة - تغطية 100%",
                PatientShareBps = 0, // 0% patient share
                IsActive = true
            });
        }

        private Customer CreateCustomer(string name)
        {
            return DatabaseService.Customers.SaveCustomer(new Customer
            {
                Name = name,
                Phone = "011" + Guid.NewGuid().ToString("N").Substring(0, 8),
                BalancePiasters = 0,
                CreditLimitPiasters = 1000000 // 10,000 EGP
            });
        }

        [Test]
        public void Scenario1_StandardCashSale_WithoutInsurance_WorksNormally()
        {
            OpenShift(0);
            var prod = CreateProduct("منتج سوبرماركت كاش", 10000, 7000, 50000); // 100 EGP, 50 units

            var sale = new Sale
            {
                TotalPiasters = 10000,
                SubtotalPiasters = 10000,
                PaidPiasters = 10000,
                PaymentMethod = "cash",
                Items = new List<SaleItem>
                {
                    new SaleItem
                    {
                        ProductId = prod.Id,
                        ProductName = prod.Name,
                        UnitPricePiasters = 10000,
                        QuantityMilli = 1000,
                        TotalPiasters = 10000
                    }
                },
                Payments = new List<SalePayment>
                {
                    new SalePayment { Method = "cash", AmountPiasters = 10000 }
                }
            };

            var processed = DatabaseService.Sales.ProcessSale(sale);
            Assert.AreEqual("completed", processed.Status);
            Assert.AreEqual(10000, processed.PaidPiasters);
            Assert.AreEqual(49000, Stock(prod.Id));
            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM customer_ledger;"));
            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM insurance_claim_lines;"));
        }

        [Test]
        public void Scenario2_StandardCreditSale_WithoutInsurance_DebitsCustomerNormally()
        {
            OpenShift(0);
            var cust = CreateCustomer("عميل آجل عادي");
            var prod = CreateProduct("منتج آجل عادي", 5000, 3000, 20000); // 50 EGP

            var sale = new Sale
            {
                CustomerId = cust.Id,
                TotalPiasters = 5000,
                SubtotalPiasters = 5000,
                PaidPiasters = 0,
                PaymentMethod = "credit",
                Items = new List<SaleItem>
                {
                    new SaleItem
                    {
                        ProductId = prod.Id,
                        ProductName = prod.Name,
                        UnitPricePiasters = 5000,
                        QuantityMilli = 1000,
                        TotalPiasters = 5000
                    }
                },
                Payments = new List<SalePayment>
                {
                    new SalePayment { Method = "credit", AmountPiasters = 5000 }
                }
            };

            var processed = DatabaseService.Sales.ProcessSale(sale);
            Assert.AreEqual("completed", processed.Status);
            Assert.AreEqual(0, processed.PaidPiasters);
            
            var reloadedCust = DatabaseService.Customers.GetById(cust.Id);
            Assert.AreEqual(5000, reloadedCust.BalancePiasters, "Customer balance must be debited by full 5000 piasters");
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM customer_ledger WHERE customer_id = @cid AND type = 'sale';", "@cid", cust.Id));
            Assert.AreEqual(5000, Scalar("SELECT amount_piasters FROM customer_ledger WHERE customer_id = @cid AND type = 'sale';", "@cid", cust.Id));
        }

        [Test]
        public void Scenario3_InsuranceSale_CashPatientCoPay_NoCustomerDebtRecorded()
        {
            OpenShift(0);
            var cust = CreateCustomer("مريض نقدي");
            var prod = CreateProduct("دواء بروشتة كاش", 10000, 6000, 20000); // 100 EGP

            var sale = new Sale
            {
                CustomerId = cust.Id,
                TotalPiasters = 10000,
                SubtotalPiasters = 10000,
                PaidPiasters = 10000,
                PaymentMethod = "insurance",
                InsuranceClaim = new InsuranceClaimLine
                {
                    CompanyId = _company.Id,
                    CompanyName = _company.Name,
                    ContractId = _contract20Percent.Id,
                    ContractName = _contract20Percent.Name,
                    PatientName = "أحمد محمد كاش",
                    MemberNo = "CARD-12345",
                    ApprovalNo = "APP-9988"
                },
                Items = new List<SaleItem>
                {
                    new SaleItem
                    {
                        ProductId = prod.Id,
                        ProductName = prod.Name,
                        UnitPricePiasters = 10000,
                        QuantityMilli = 1000,
                        TotalPiasters = 10000
                    }
                },
                Payments = new List<SalePayment>
                {
                    new SalePayment { Method = "insurance", AmountPiasters = 8000 },
                    new SalePayment { Method = "cash", AmountPiasters = 2000 }
                }
            };

            var processed = DatabaseService.Sales.ProcessSale(sale);
            Assert.AreEqual("completed", processed.Status);
            Assert.AreEqual(10000, processed.PaidPiasters);
            Assert.IsNotNull(processed.InsuranceClaim);
            Assert.AreEqual(8000, processed.InsuranceClaim.CompanyPiasters);
            Assert.AreEqual(2000, processed.InsuranceClaim.PatientPiasters);
            Assert.AreEqual("pending", processed.InsuranceClaim.Status);

            var reloadedCust = DatabaseService.Customers.GetById(cust.Id);
            Assert.AreEqual(0, reloadedCust.BalancePiasters, "Patient paid co-pay in cash, balance must remain 0");
            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM customer_ledger WHERE customer_id = @cid;", "@cid", cust.Id));

            // Verify claim line in DB
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM insurance_claim_lines WHERE sale_id = @sid;", "@sid", processed.Id));
            Assert.AreEqual(8000, Scalar("SELECT company_piasters FROM insurance_claim_lines WHERE sale_id = @sid;", "@sid", processed.Id));
        }

        [Test]
        public void Scenario4_InsuranceSale_CreditPatientCoPay_DebitsOnlyPatientShareAndSetsPaidToCompanyCoverage()
        {
            OpenShift(0);
            var cust = CreateCustomer("مريض آجل");
            var prod = CreateProduct("دواء بروشتة آجل", 10000, 6000, 20000); // 100 EGP

            // Patient share 20% = 2000 piasters. Company covers 80% = 8000 piasters.
            // Patient wants to pay their 2000 piasters co-pay on credit (آجل)!
            var sale = new Sale
            {
                CustomerId = cust.Id,
                TotalPiasters = 10000,
                SubtotalPiasters = 10000,
                PaidPiasters = 8000, // Only company share is non-credit!
                PaymentMethod = "credit",
                InsuranceClaim = new InsuranceClaimLine
                {
                    CompanyId = _company.Id,
                    CompanyName = _company.Name,
                    ContractId = _contract20Percent.Id,
                    ContractName = _contract20Percent.Name,
                    PatientName = "محمد سمير آجل",
                    MemberNo = "CARD-54321",
                    ApprovalNo = "APP-7766"
                },
                Items = new List<SaleItem>
                {
                    new SaleItem
                    {
                        ProductId = prod.Id,
                        ProductName = prod.Name,
                        UnitPricePiasters = 10000,
                        QuantityMilli = 1000,
                        TotalPiasters = 10000
                    }
                },
                Payments = new List<SalePayment>
                {
                    new SalePayment { Method = "insurance", AmountPiasters = 8000 },
                    new SalePayment { Method = "credit", AmountPiasters = 2000 }
                }
            };

            var processed = DatabaseService.Sales.ProcessSale(sale);
            Assert.AreEqual("completed", processed.Status);
            // CRUCIAL: PaidPiasters must NOT be 10000 (which would mean falsely collected cash), but 8000 (the insurance company share)
            Assert.AreEqual(8000, processed.PaidPiasters, "PaidPiasters must reflect non-credit portion (company coverage)");
            
            // CRUCIAL: Customer balance must be debited by 2000 piasters (the patient co-pay), NOT 0, and NOT 10000!
            var reloadedCust = DatabaseService.Customers.GetById(cust.Id);
            Assert.AreEqual(2000, reloadedCust.BalancePiasters, "Customer balance must increase by exactly the patient co-pay (2000 piasters)");

            // Verify customer_ledger row
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM customer_ledger WHERE customer_id = @cid AND type = 'sale';", "@cid", cust.Id));
            Assert.AreEqual(2000, Scalar("SELECT amount_piasters FROM customer_ledger WHERE customer_id = @cid AND type = 'sale';", "@cid", cust.Id));

            // Verify ledger notes explain insurance co-pay
            string note = "";
            using (var conn = new SQLiteConnection(DatabaseService.ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("SELECT notes FROM customer_ledger WHERE customer_id = @cid AND type = 'sale';", conn))
                {
                    cmd.Parameters.AddWithValue("@cid", cust.Id);
                    note = Convert.ToString(cmd.ExecuteScalar());
                }
            }
            StringAssert.Contains("تحمل مريض", note, "Customer ledger note must clarify that this debt is patient insurance co-pay");

            // Verify insurance claim line in DB
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM insurance_claim_lines WHERE sale_id = @sid;", "@sid", processed.Id));
            Assert.AreEqual(8000, Scalar("SELECT company_piasters FROM insurance_claim_lines WHERE sale_id = @sid;", "@sid", processed.Id));
            Assert.AreEqual(2000, Scalar("SELECT patient_piasters FROM insurance_claim_lines WHERE sale_id = @sid;", "@sid", processed.Id));
            var clm = DatabaseService.Insurance.GetClaimLineBySaleId(processed.Id);
            Assert.IsNotNull(clm);
            Assert.AreEqual("pending", clm.Status);
        }

        [Test]
        public void Scenario5_InsuranceSale_100PercentCoverage_ZeroPatientShare()
        {
            OpenShift(0);
            var prod = CreateProduct("دواء شامل 100%", 6000, 3500, 20000); // 60 EGP

            var sale = new Sale
            {
                TotalPiasters = 6000,
                SubtotalPiasters = 6000,
                PaidPiasters = 6000,
                PaymentMethod = "insurance",
                InsuranceClaim = new InsuranceClaimLine
                {
                    CompanyId = _company.Id,
                    CompanyName = _company.Name,
                    ContractId = _contractFullCoverage.Id,
                    ContractName = _contractFullCoverage.Name,
                    PatientName = "خالد تغطية شاملة",
                    MemberNo = "CARD-FULL-1"
                },
                Items = new List<SaleItem>
                {
                    new SaleItem
                    {
                        ProductId = prod.Id,
                        ProductName = prod.Name,
                        UnitPricePiasters = 6000,
                        QuantityMilli = 1000,
                        TotalPiasters = 6000
                    }
                },
                Payments = new List<SalePayment>
                {
                    new SalePayment { Method = "insurance", AmountPiasters = 6000 }
                }
            };

            var processed = DatabaseService.Sales.ProcessSale(sale);
            Assert.AreEqual("completed", processed.Status);
            Assert.AreEqual(6000, processed.PaidPiasters);
            Assert.AreEqual(6000, processed.InsuranceClaim.CompanyPiasters);
            Assert.AreEqual(0, processed.InsuranceClaim.PatientPiasters);
            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM customer_ledger;"));
        }

        [Test]
        public void Scenario6_BatchClaimsCreation_WithCustomBatchNumber_AndSettlement()
        {
            OpenShift(0);
            var prod = CreateProduct("دواء للمطالبات", 5000, 3000, 20000); // 50 EGP

            // Create 2 insurance sales
            var sale1 = DatabaseService.Sales.ProcessSale(new Sale
            {
                TotalPiasters = 5000,
                SubtotalPiasters = 5000,
                PaidPiasters = 5000,
                PaymentMethod = "insurance",
                InsuranceClaim = new InsuranceClaimLine
                {
                    CompanyId = _company.Id,
                    ContractId = _contract20Percent.Id,
                    PatientName = "مريض مطالبة 1",
                    MemberNo = "M-1"
                },
                Items = new List<SaleItem>
                {
                    new SaleItem { ProductId = prod.Id, ProductName = prod.Name, UnitPricePiasters = 5000, QuantityMilli = 1000, TotalPiasters = 5000 }
                },
                Payments = new List<SalePayment>
                {
                    new SalePayment { Method = "insurance", AmountPiasters = 4000 },
                    new SalePayment { Method = "cash", AmountPiasters = 1000 }
                }
            });

            var sale2 = DatabaseService.Sales.ProcessSale(new Sale
            {
                TotalPiasters = 5000,
                SubtotalPiasters = 5000,
                PaidPiasters = 5000,
                PaymentMethod = "insurance",
                InsuranceClaim = new InsuranceClaimLine
                {
                    CompanyId = _company.Id,
                    ContractId = _contract20Percent.Id,
                    PatientName = "مريض مطالبة 2",
                    MemberNo = "M-2"
                },
                Items = new List<SaleItem>
                {
                    new SaleItem { ProductId = prod.Id, ProductName = prod.Name, UnitPricePiasters = 5000, QuantityMilli = 1000, TotalPiasters = 5000 }
                },
                Payments = new List<SalePayment>
                {
                    new SalePayment { Method = "insurance", AmountPiasters = 4000 },
                    new SalePayment { Method = "cash", AmountPiasters = 1000 }
                }
            });

            // Get pending claim lines
            var claim1 = DatabaseService.Insurance.GetClaimLineBySaleId(sale1.Id);
            var claim2 = DatabaseService.Insurance.GetClaimLineBySaleId(sale2.Id);
            Assert.IsNotNull(claim1);
            Assert.IsNotNull(claim2);
            Assert.AreEqual("pending", claim1.Status);
            Assert.AreEqual("pending", claim2.Status);

            // Create batch with custom batch number
            string customBatchNum = "CLM-2026-11-TEST";
            var batch = DatabaseService.Insurance.CreateBatch(
                _company.Id,
                customBatchNum,
                "2026-11",
                "مطالبة شهر 11 التجريبية",
                new List<string> { claim1.Id, claim2.Id },
                AdminId
            );

            Assert.IsNotNull(batch);
            Assert.AreEqual(customBatchNum, batch.BatchNumber);
            Assert.AreEqual(8000, batch.TotalAmountPiasters, "Batch total must be 4000 + 4000 = 8000 piasters");
            Assert.AreEqual(2, batch.TotalClaimsCount);

            // Verify claim lines became 'batched'
            var reloadedClaim1 = DatabaseService.Insurance.GetClaimLineBySaleId(sale1.Id);
            Assert.AreEqual("batched", reloadedClaim1.Status);
            Assert.AreEqual(batch.Id, reloadedClaim1.ClaimBatchId);

            // Settle batch: 7,500 piasters approved, 500 piasters rejected with expense deduction
            var settledBatch = DatabaseService.Insurance.SettleBatch(
                batch.Id,
                7500,
                500,
                "صنف غير مدرج بجدول التعاقد",
                "expense",
                AdminId
            );

            Assert.IsNotNull(settledBatch);
            Assert.AreEqual("partially_settled", settledBatch.Status, "Batch with rejected amount must be marked partially_settled");
            Assert.AreEqual(7500, settledBatch.SettledAmountPiasters);
            Assert.AreEqual(500, settledBatch.RejectedAmountPiasters);
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM expenses WHERE category = 'insurance_rejection' AND is_cancelled = 0;"));
            Assert.AreEqual(500, Scalar("SELECT amount_piasters FROM expenses WHERE category = 'insurance_rejection' AND is_cancelled = 0;"));

            // Re-settle / Edit settlement: change to 6000 approved, 2000 rejected
            var editedBatch = DatabaseService.Insurance.SettleBatch(
                batch.Id,
                6000,
                2000,
                "تعديل إشعار التسوية بعد استلام تقرير الشركة المحدث",
                "expense",
                AdminId
            );
            Assert.AreEqual("partially_settled", editedBatch.Status);
            Assert.AreEqual(6000, editedBatch.SettledAmountPiasters);
            Assert.AreEqual(2000, editedBatch.RejectedAmountPiasters);
            // Must have only 1 active expense of exactly 2000 piasters (the previous 500 must be cancelled)
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM expenses WHERE category = 'insurance_rejection' AND is_cancelled = 0;"));
            Assert.AreEqual(2000, Scalar("SELECT amount_piasters FROM expenses WHERE category = 'insurance_rejection' AND is_cancelled = 0;"));
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM expenses WHERE category = 'insurance_rejection' AND is_cancelled = 1;"));

            // Re-settle / Edit settlement again: full settlement (8000 approved, 0 rejected)
            var fullBatch = DatabaseService.Insurance.SettleBatch(
                batch.Id,
                8000,
                0,
                null,
                "expense",
                AdminId
            );
            Assert.AreEqual("settled", fullBatch.Status);
            Assert.AreEqual(8000, fullBatch.SettledAmountPiasters);
            Assert.AreEqual(0, fullBatch.RejectedAmountPiasters);
            // All rejection expenses for this batch must now be cancelled, exactly 0 active!
            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM expenses WHERE category = 'insurance_rejection' AND is_cancelled = 0;"));
        }

        [Test]
        public void Scenario7_SalesHistoryQueries_MapInsuranceDetailsAndSupportFilters()
        {
            OpenShift(0);
            var prod = CreateProduct("دواء للاستعلام", 8000, 5000, 20000); // 80 EGP

            var sale = DatabaseService.Sales.ProcessSale(new Sale
            {
                TotalPiasters = 8000,
                SubtotalPiasters = 8000,
                PaidPiasters = 8000,
                PaymentMethod = "insurance",
                InsuranceClaim = new InsuranceClaimLine
                {
                    CompanyId = _company.Id,
                    CompanyName = _company.Name,
                    ContractId = _contract20Percent.Id,
                    ContractName = _contract20Percent.Name,
                    PatientName = "فريد شوقي التأمين",
                    MemberNo = "CARD-SEARCH-777",
                    ApprovalNo = "APP-SEARCH-888"
                },
                Items = new List<SaleItem>
                {
                    new SaleItem { ProductId = prod.Id, ProductName = prod.Name, UnitPricePiasters = 8000, QuantityMilli = 1000, TotalPiasters = 8000 }
                },
                Payments = new List<SalePayment>
                {
                    new SalePayment { Method = "insurance", AmountPiasters = 6400 },
                    new SalePayment { Method = "cash", AmountPiasters = 1600 }
                }
            });

            // 1. GetRecentSales returns populated InsuranceClaim
            var recents = DatabaseService.Sales.GetRecentSales(10);
            var foundRecent = recents.Find(s => s.Id == sale.Id);
            Assert.IsNotNull(foundRecent, "Sale must be returned by GetRecentSales");
            Assert.IsNotNull(foundRecent.InsuranceClaim, "InsuranceClaim must be mapped in GetRecentSales");
            Assert.AreEqual(_company.Name, foundRecent.InsuranceClaim.CompanyName);
            Assert.AreEqual("فريد شوقي التأمين", foundRecent.InsuranceClaim.PatientName);
            Assert.AreEqual("CARD-SEARCH-777", foundRecent.InsuranceClaim.MemberNo);
            Assert.AreEqual(6400, foundRecent.InsuranceClaim.CompanyPiasters);
            Assert.AreEqual(1600, foundRecent.InsuranceClaim.PatientPiasters);

            // 2. Filter by status = "insurance"
            var insuranceSales = DatabaseService.Sales.GetRecentSales(10, status: "insurance");
            Assert.IsTrue(insuranceSales.Exists(s => s.Id == sale.Id), "Must be returned when status = 'insurance'");

            // 3. Search by patient name
            var searchByPatient = DatabaseService.Sales.SearchSales(query: "فريد شوقي");
            Assert.IsTrue(searchByPatient.Exists(s => s.Id == sale.Id), "Must be found by patient name search");

            // 4. Search by member card number
            var searchByCard = DatabaseService.Sales.SearchSales(query: "CARD-SEARCH-777");
            Assert.IsTrue(searchByCard.Exists(s => s.Id == sale.Id), "Must be found by card number search");
        }

        [Test]
        public void Scenario8_InsuranceSale_PartialPayment_CashAndCreditCoPay_DebitsOnlyRemainingPatientShare()
        {
            OpenShift(0);
            var cust = CreateCustomer("مريض سداد جزئي");
            var prod = CreateProduct("دواء تجزئة السداد", 10000, 6000, 20000); // 100 EGP

            // Total 100 EGP = 10000 piasters.
            // Contract 20% patient share = 2000 piasters.
            // Company share = 8000 piasters.
            // Patient pays 1200 piasters cash, and remaining 800 piasters on credit!
            var sale = new Sale
            {
                CustomerId = cust.Id,
                TotalPiasters = 10000,
                SubtotalPiasters = 10000,
                PaidPiasters = 9200, // 8000 company + 1200 cash
                PaymentMethod = "multi",
                InsuranceClaim = new InsuranceClaimLine
                {
                    CompanyId = _company.Id,
                    CompanyName = _company.Name,
                    ContractId = _contract20Percent.Id,
                    ContractName = _contract20Percent.Name,
                    PatientName = "مريض سداد جزئي",
                    MemberNo = "CARD-PARTIAL-123"
                },
                Items = new List<SaleItem>
                {
                    new SaleItem
                    {
                        ProductId = prod.Id,
                        ProductName = prod.Name,
                        UnitPricePiasters = 10000,
                        QuantityMilli = 1000,
                        TotalPiasters = 10000
                    }
                },
                Payments = new List<SalePayment>
                {
                    new SalePayment { Method = "insurance", AmountPiasters = 8000 },
                    new SalePayment { Method = "cash", AmountPiasters = 1200 },
                    new SalePayment { Method = "credit", AmountPiasters = 800 }
                }
            };

            var processed = DatabaseService.Sales.ProcessSale(sale);
            Assert.AreEqual("completed", processed.Status);
            // Non-credit payments paid: 8000 insurance + 1200 cash = 9200 piasters
            Assert.AreEqual(9200, processed.PaidPiasters, "PaidPiasters must reflect insurance coverage + patient cash payment");

            // CRUCIAL: Customer balance must be debited ONLY by remaining credit (800 piasters), NOT 2000 and NOT 0!
            var reloadedCust = DatabaseService.Customers.GetById(cust.Id);
            Assert.AreEqual(800, reloadedCust.BalancePiasters, "Customer balance must increase ONLY by the unpaid co-pay portion (800 piasters)");

            // Verify customer_ledger row
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM customer_ledger WHERE customer_id = @cid AND type = 'sale';", "@cid", cust.Id));
            Assert.AreEqual(800, Scalar("SELECT amount_piasters FROM customer_ledger WHERE customer_id = @cid AND type = 'sale';", "@cid", cust.Id));

            // Verify insurance claim line
            var clm = DatabaseService.Insurance.GetClaimLineBySaleId(processed.Id);
            Assert.IsNotNull(clm);
            Assert.AreEqual("pending", clm.Status);
            Assert.AreEqual(8000, clm.CompanyPiasters);
            Assert.AreEqual(2000, clm.PatientPiasters);
        }

        [Test]
        public void Scenario9_InsuranceBatchSettlement_ToCashDrawer_IncreasesDrawerCash()
        {
            OpenShift(0);
            var prod = CreateProduct("دواء مطالبة للتوريد بالدرج", 10000, 6000, 20000); // 100 EGP
            var sale = new Sale
            {
                TotalPiasters = 10000,
                SubtotalPiasters = 10000,
                PaidPiasters = 2000, // Patient copay 20%
                PaymentMethod = "multi",
                InsuranceClaim = new InsuranceClaimLine
                {
                    CompanyId = _company.Id,
                    CompanyName = _company.Name,
                    ContractId = _contract20Percent.Id,
                    ContractName = _contract20Percent.Name,
                    PatientName = "مريض توريد درج",
                    MemberNo = "CARD-DRAWER-101"
                },
                Items = new List<SaleItem>
                {
                    new SaleItem
                    {
                        ProductId = prod.Id,
                        ProductName = prod.Name,
                        UnitPricePiasters = 10000,
                        QuantityMilli = 1000,
                        TotalPiasters = 10000
                    }
                },
                Payments = new List<SalePayment>
                {
                    new SalePayment { Method = "insurance", AmountPiasters = 8000 },
                    new SalePayment { Method = "cash", AmountPiasters = 2000 }
                }
            };
            var processed = DatabaseService.Sales.ProcessSale(sale);
            var clm = DatabaseService.Insurance.GetClaimLineBySaleId(processed.Id);
            Assert.IsNotNull(clm);

            // Create batch
            var batch = DatabaseService.Insurance.CreateBatch(
                _company.Id,
                "CLM-TEST-DRAWER-01",
                "2026-11",
                "دفعة اختبار توريد للدرج",
                new List<string> { clm.Id },
                "usr_admin"
            );
            Assert.AreEqual(8000, batch.TotalAmountPiasters);

            // Initial cash in drawer should be patient copay (2000 piasters)
            var activeShift = DatabaseService.ShiftRepo.GetActiveShift();
            var summaryBefore = DatabaseService.ShiftRepo.CalculateShiftMetrics(activeShift);
            long cashBefore = summaryBefore.AvailableCashInDrawerPiasters;
            Assert.AreEqual(2000, cashBefore);

            // Settle batch with receipt destination: drawer
            var settled = DatabaseService.Insurance.SettleBatch(
                batch.Id,
                8000, // approved
                0,    // rejected
                null,
                "expense",
                "usr_admin",
                "تسوية سداد نقدي بالدرج",
                "drawer",
                null
            );

            Assert.AreEqual("settled", settled.Status);
            Assert.AreEqual("drawer", settled.SettlementReceiptTarget);
            Assert.IsNotNull(settled.SettlementDrawerTxId);

            // Cash in drawer must now be 2000 (copay) + 8000 (insurance settlement) = 10000 piasters!
            var summaryAfter = DatabaseService.ShiftRepo.CalculateShiftMetrics(activeShift);
            Assert.AreEqual(10000, summaryAfter.AvailableCashInDrawerPiasters, "Drawer cash must increase by approved insurance settlement amount");
            Assert.AreEqual(8000, summaryAfter.CashInPiasters, "CashInPiasters must include the 8000 piasters receipt");
        }

        [Test]
        public void Scenario10_InsuranceBatchSettlement_EditToDigitalAccount_CancelsDrawerAndCreditsWallet()
        {
            OpenShift(0);
            var prod = CreateProduct("دواء مطالبة تحويل لمحفظة", 10000, 6000, 20000);
            var sale = new Sale
            {
                TotalPiasters = 10000,
                SubtotalPiasters = 10000,
                PaidPiasters = 2000,
                PaymentMethod = "multi",
                InsuranceClaim = new InsuranceClaimLine
                {
                    CompanyId = _company.Id,
                    CompanyName = _company.Name,
                    ContractId = _contract20Percent.Id,
                    ContractName = _contract20Percent.Name,
                    PatientName = "مريض تحويل محفظة",
                    MemberNo = "CARD-WALLET-202"
                },
                Items = new List<SaleItem>
                {
                    new SaleItem
                    {
                        ProductId = prod.Id,
                        ProductName = prod.Name,
                        UnitPricePiasters = 10000,
                        QuantityMilli = 1000,
                        TotalPiasters = 10000
                    }
                },
                Payments = new List<SalePayment>
                {
                    new SalePayment { Method = "insurance", AmountPiasters = 8000 },
                    new SalePayment { Method = "cash", AmountPiasters = 2000 }
                }
            };
            var processed = DatabaseService.Sales.ProcessSale(sale);
            var clm = DatabaseService.Insurance.GetClaimLineBySaleId(processed.Id);

            var batch = DatabaseService.Insurance.CreateBatch(
                _company.Id,
                "CLM-TEST-WALLET-02",
                "2026-11",
                "دفعة اختبار تعديل للمحفظة",
                new List<string> { clm.Id },
                "usr_admin"
            );

            // First: settle to drawer
            var firstSettled = DatabaseService.Insurance.SettleBatch(
                batch.Id,
                8000,
                0,
                null,
                "expense",
                "usr_admin",
                null,
                "drawer",
                null
            );
            string firstDrawerTxId = firstSettled.SettlementDrawerTxId;
            Assert.IsNotNull(firstDrawerTxId);

            var activeShift = DatabaseService.ShiftRepo.GetActiveShift();
            var summaryStep1 = DatabaseService.ShiftRepo.CalculateShiftMetrics(activeShift);
            Assert.AreEqual(10000, summaryStep1.AvailableCashInDrawerPiasters);

            // Create a digital account (InstaPay or Vodafone Cash)
            var wallet = DatabaseService.DigitalAccounts.SaveAccount(new DigitalAccount
            {
                Name = "محفظة فودافون كاش الصيدلية",
                Type = "wallet",
                Provider = "vodafone_cash",
                AccountNumber = "01099998888",
                BalancePiasters = 5000, // Initial 50 EGP
                IsActive = true
            });
            Assert.AreEqual(5000, wallet.BalancePiasters);

            // Second: EDIT settlement to digital account!
            var edited = DatabaseService.Insurance.SettleBatch(
                batch.Id,
                8000,
                0,
                null,
                "expense",
                "usr_admin",
                "تعديل وجهة الاستلام إلى فودافون كاش",
                "digital_account",
                wallet.Id
            );

            Assert.AreEqual("settled", edited.Status);
            Assert.AreEqual("digital_account", edited.SettlementReceiptTarget);
            Assert.AreEqual(wallet.Id, edited.SettlementReceiptAccountId);
            Assert.IsNotNull(edited.SettlementDigitalTxId);

            // Verify drawer cash: previous drawer receipt cancelled, drawer returns to 2000 piasters!
            var summaryStep2 = DatabaseService.ShiftRepo.CalculateShiftMetrics(activeShift);
            Assert.AreEqual(2000, summaryStep2.AvailableCashInDrawerPiasters, "Drawer cash must drop back to 2000 because previous receipt was cancelled atomically");
            Assert.AreEqual(0, summaryStep2.CashInPiasters, "Active CashIn must be 0 after cancelling previous drawer transaction");

            // Verify previous drawer transaction is marked cancelled in DB
            var prevDrawerTx = DatabaseService.ShiftRepo.GetDrawerTransactionById(firstDrawerTxId);
            Assert.IsNotNull(prevDrawerTx);
            Assert.IsTrue(prevDrawerTx.IsCancelled, "Previous drawer transaction must be flagged is_cancelled = 1");

            // Verify wallet balance: 5000 initial + 8000 settlement = 13000 piasters!
            var reloadedWallet = DatabaseService.DigitalAccounts.GetAccountById(wallet.Id);
            Assert.AreEqual(13000, reloadedWallet.BalancePiasters, "Wallet balance must be credited with 8000 piasters");
        }

        [Test]
        public void Scenario11_InsuranceBatchSettlement_EditToNone_CancelsWalletWithoutDiscrepancy()
        {
            OpenShift(0);
            var prod = CreateProduct("دواء مطالبة إلغاء محفظة", 10000, 6000, 20000);
            var sale = new Sale
            {
                TotalPiasters = 10000,
                SubtotalPiasters = 10000,
                PaidPiasters = 2000,
                PaymentMethod = "multi",
                InsuranceClaim = new InsuranceClaimLine
                {
                    CompanyId = _company.Id,
                    CompanyName = _company.Name,
                    ContractId = _contract20Percent.Id,
                    ContractName = _contract20Percent.Name,
                    PatientName = "مريض إلغاء توريد",
                    MemberNo = "CARD-NONE-303"
                },
                Items = new List<SaleItem>
                {
                    new SaleItem
                    {
                        ProductId = prod.Id,
                        ProductName = prod.Name,
                        UnitPricePiasters = 10000,
                        QuantityMilli = 1000,
                        TotalPiasters = 10000
                    }
                },
                Payments = new List<SalePayment>
                {
                    new SalePayment { Method = "insurance", AmountPiasters = 8000 },
                    new SalePayment { Method = "cash", AmountPiasters = 2000 }
                }
            };
            var processed = DatabaseService.Sales.ProcessSale(sale);
            var clm = DatabaseService.Insurance.GetClaimLineBySaleId(processed.Id);

            var batch = DatabaseService.Insurance.CreateBatch(
                _company.Id,
                "CLM-TEST-NONE-03",
                "2026-11",
                "دفعة اختبار إلغاء التوريد",
                new List<string> { clm.Id },
                "usr_admin"
            );

            var instapay = DatabaseService.DigitalAccounts.SaveAccount(new DigitalAccount
            {
                Name = "حساب إنستاباي الصيدلية",
                Type = "instapay",
                Provider = "instapay",
                AccountNumber = "pharmacy@instapay",
                BalancePiasters = 10000, // 100 EGP
                IsActive = true
            });

            // Settle to InstaPay
            DatabaseService.Insurance.SettleBatch(
                batch.Id,
                8000,
                0,
                null,
                "expense",
                "usr_admin",
                null,
                "digital_account",
                instapay.Id
            );

            var walletAfterSettlement = DatabaseService.DigitalAccounts.GetAccountById(instapay.Id);
            Assert.AreEqual(18000, walletAfterSettlement.BalancePiasters);

            // Now EDIT settlement to 'none' (External bank / check)
            var edited = DatabaseService.Insurance.SettleBatch(
                batch.Id,
                8000,
                0,
                null,
                "expense",
                "usr_admin",
                "تعديل وجهة الاستلام إلى شيك بنكي خارجي",
                "none",
                null
            );

            Assert.AreEqual("settled", edited.Status);
            Assert.AreEqual("none", edited.SettlementReceiptTarget);

            // InstaPay balance must be safely restored to initial 10000 piasters!
            var walletAfterReversal = DatabaseService.DigitalAccounts.GetAccountById(instapay.Id);
            Assert.AreEqual(10000, walletAfterReversal.BalancePiasters, "InstaPay balance must be reverted to initial 10000 without any surplus or shortage");

            // Cash drawer should remain strictly at 2000 piasters (copay only)
            var activeShift = DatabaseService.ShiftRepo.GetActiveShift();
            var summary = DatabaseService.ShiftRepo.CalculateShiftMetrics(activeShift);
            Assert.AreEqual(2000, summary.AvailableCashInDrawerPiasters, "Drawer cash must not be affected");
        }
    }
}
