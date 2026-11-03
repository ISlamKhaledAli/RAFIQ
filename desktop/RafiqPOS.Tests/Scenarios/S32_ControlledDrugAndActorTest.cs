using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// M4 / M5 / L3 / L6: سجل أدوية الجدول بالوحدة الصغرى لكل سطر، هوية المنفذ من جلسة الخادم فقط،
    /// منتهي الصلاحية بالتاريخ المحلي، ولا بيع خارج الوردية ببادئة معرّف من العميل.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S32_ControlledDrugAndActorTest : S30_Step3BFixtureBase
    {
        private static JObject DispenseFor(Product product, long quantityMilli)
        {
            // Same shape as ControlledDrugDispenseModal.handleSave
            return new JObject
            {
                { "productId", product.Id },
                { "productName", product.Name },
                { "quantityMilli", quantityMilli },
                { "patientName", "محمود علي" },
                { "doctorName", "د. سامي حسن" },
                { "prescriptionNo", "RX-7781" },
                { "prescriptionDate", DateTime.Now.ToString("yyyy-MM-dd") },
                { "entryType", "dispense" }
            };
        }

        [Test]
        public void M4_ControlledRegister_LogsOneEntryPerLine_InBaseUnits()
        {
            OpenShift(0);
            var drug = CreateProduct("ترامادول 50 مجم", 300, 200, 100000);
            DatabaseService.ProductUnits.EnsureDefaultBaseUnit(drug);
            ProductUnit box;
            using (ProductWritePolicy.EnterTrustedFixtureOperation())
            box = DatabaseService.ProductUnits.CreateUnit(new ProductUnit
            {
                ProductId = drug.Id,
                UnitName = "علبة 10 أقراص",
                ConversionFactor = 10,
                IsBaseUnit = false,
                SellPricePiasters = 3000,
                CostPricePiasters = 2000,
                Barcode = "BOX_" + Guid.NewGuid().ToString("N").Substring(0, 8),
                IsDivisible = false,
                SortOrder = 1
            });
            DatabaseService.PharmaRepo.SavePharmaInfo(new ProductPharmaInfo
            {
                ProductId = drug.Id,
                ScientificName = "Tramadol",
                RxStatus = "controlled",
                ControlledSchedule = "جدول ثاني"
            }, AdminId);
            drug = DatabaseService.Products.GetById(drug.Id);

            var boxLine = CartLine(drug, 1000, 3000);
            boxLine["unitId"] = box.Id;
            boxLine["unitName"] = box.UnitName;
            boxLine["unit"] = box.UnitName;
            boxLine["conversionFactor"] = 10;
            boxLine["isControlled"] = true;
            boxLine["controlledDispense"] = DispenseFor(drug, 1000);
            var tabletsLine = CartLine(drug, 3000, 300);
            tabletsLine["isControlled"] = true;
            tabletsLine["controlledDispense"] = DispenseFor(drug, 3000);

            var payload = SalePayload(new JArray { boxLine, tabletsLine }, 3900, "cash", 3900, null);
            payload["controlledDispenses"] = new JArray { DispenseFor(drug, 1000), DispenseFor(drug, 3000) };
            var res = DispatchOk("sales:create", payload);
            string saleId = Data(res)["id"].ToString();

            Assert.AreEqual(2, Scalar("SELECT COUNT(*) FROM controlled_dispenses WHERE sale_id = @s;", "@s", saleId), "قيد لكل سطر");
            Assert.AreEqual(13000, Scalar("SELECT COALESCE(SUM(quantity_milli), 0) FROM controlled_dispenses WHERE sale_id = @s;", "@s", saleId),
                "علبة (10 أقراص) + 3 أقراص = 13 قرصاً في السجل");
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM controlled_dispenses WHERE sale_id = @s AND quantity_milli = 10000;", "@s", saleId), "العلبة تُسجل 10 أقراص لا 1");
            Assert.AreEqual(2, Scalar("SELECT COUNT(DISTINCT sale_item_id) FROM controlled_dispenses WHERE sale_id = @s;", "@s", saleId), "كل قيد مربوط بسطره");
            Assert.AreEqual(100000 - 13000, Stock(drug.Id), "المخزون والسجل بنفس الوحدة");
        }

        [Test]
        public void M5_AuditActor_ComesFromSession_NotFromPayload()
        {
            OpenShift(50000);
            var product = CreateProduct("صابون", 1000, 700, 10000);
            string adminName = DatabaseService.UserRepo.GetById(AdminId).DisplayName;

            DispatchOk("inventory:adjustStock", new JObject
            {
                { "productId", product.Id },
                { "newStockQuantityMilli", 8000 },
                { "adjustmentType", "damage" },
                { "reason", "تالف بالمخزن" },
                { "userId", "usr_spoofed" }
            });
            DispatchOk("shifts:cashIn", new JObject
            {
                { "shiftId", DatabaseService.Shifts.GetActiveShift().Id },
                { "amountPiasters", 1000 },
                { "reason", "فكة" },
                { "performedById", "usr_spoofed" },
                { "performedByName", "مستخدم مزيف" }
            });
            DispatchOk("expenses:create", new JObject
            {
                { "amountPiasters", 500 },
                { "category", "نثريات" },
                { "notes", "مياه" },
                { "source", "drawer" },
                { "createdBy", "مستخدم مزيف" }
            });

            var customer = DatabaseService.Customers.SaveCustomer(new Customer { Name = "عميل تدقيق", Phone = "01055500011", BalancePiasters = 20000, CreditLimitPiasters = 100000 });
            DispatchOk("customers:recordPayment", new JObject
            {
                { "customerId", customer.Id }, { "amountPiasters", 5000 }, { "notes", "سداد" }, { "paymentMethod", "cash" }
            });
            string ledgerId;
            using (var conn = new System.Data.SQLite.SQLiteConnection(DatabaseService.ConnectionString))
            {
                conn.Open();
                using (var cmd = new System.Data.SQLite.SQLiteCommand("SELECT id FROM customer_ledger WHERE customer_id = @c AND type = 'payment' LIMIT 1;", conn))
                {
                    cmd.Parameters.AddWithValue("@c", customer.Id);
                    ledgerId = Convert.ToString(cmd.ExecuteScalar());
                }
            }
            DispatchOk("customers:cancelPayment", new JObject
            {
                { "customerId", customer.Id }, { "ledgerEntryId", ledgerId }, { "reason", "خطأ" }, { "userName", "مستخدم مزيف" }
            });

            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM audit_logs WHERE user_id IN ('usr_spoofed', 'مستخدم مزيف');"), "لا هوية من بيانات الطلب في سجل التدقيق");
            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM cash_drawer_transactions WHERE performed_by_id = 'usr_spoofed' OR performed_by_name = 'مستخدم مزيف';"));
            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM expenses WHERE created_by = 'مستخدم مزيف';"));
            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM customer_ledger WHERE notes LIKE '%مستخدم مزيف%';"));
            Assert.Greater(Scalar("SELECT COUNT(*) FROM audit_logs WHERE user_id = @u;", "@u", AdminId), 0, "التسوية مسجلة باسم مستخدم الجلسة");
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM customer_ledger WHERE type = 'payment_cancel' AND notes LIKE @n;", "@n", "%" + adminName + "%"));
        }

        [Test]
        public void L6_ClientDemoPrefix_CannotSellOutsideAShift()
        {
            var product = CreateProduct("بسكويت", 500, 300, 10000);
            Assert.IsNull(DatabaseService.Shifts.GetActiveShift(), "لا توجد وردية مفتوحة");

            var payload = SalePayload(new JArray { CartLine(product, 1000, 500) }, 500, "cash", 500, null);
            payload["id"] = "demo_bypass_" + Guid.NewGuid().ToString("N").Substring(0, 6);
            var res = Dispatch("sales:create", payload);

            Assert.IsFalse(res.Success, "معرّف يبدأ بـ demo_ لا يتخطى شرط الوردية");
            StringAssert.Contains("وردية", res.Error.Message);
            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM sales;"));
            Assert.AreEqual(10000, Stock(product.Id));
        }

        [Test]
        public void L3_BatchExpiredYesterdayLocal_IsBlockedWithoutSupervisor()
        {
            OpenShift(0);
            var product = CreateProduct("شراب كحة", 2500, 1500, 0);
            string yesterdayLocal = DateTime.Now.Date.AddDays(-1).ToString("yyyy-MM-dd");
            var batch = DatabaseService.ProductBatchRepo.CreateOrUpdateBatch(new ProductBatch
            {
                ProductId = product.Id,
                BatchNumber = "EXP-LOCAL-1",
                ExpiryDate = yesterdayLocal,
                QuantityMilli = 5000,
                CostPricePiasters = 1500,
                SellPricePiasters = 2500,
                Status = "ACTIVE"
            });
            DatabaseService.SettingsRepo.Set("allow_negative_stock", "1");

            var line = CartLine(product, 1000, 2500);
            line["batchId"] = batch.Id;
            line["batchNumber"] = batch.BatchNumber;
            line["expiryDate"] = yesterdayLocal;
            var res = Dispatch("sales:create", SalePayload(new JArray { line }, 2500, "cash", 2500, null));

            Assert.IsFalse(res.Success, "تشغيلة انتهت أمس بالتوقيت المحلي لا تُباع حتى قبل منتصف ليل UTC");
            StringAssert.Contains("منتهي الصلاحية", res.Error.Message);
        }
    }
}
