using System;
using System.Data.SQLite;
using System.IO;
using System.Reflection;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using RafiqPOS.Bridge;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// قاعدة اختبارات خطوة الإطلاق 3B: تهيئة كاملة مثل الإنتاج (DatabaseService.Initialize) وإرسال طلبات IPC
    /// بنفس شكل البيانات التي ترسلها الواجهة، مع جلسة مستخدم حقيقية.
    /// </summary>
    public abstract class S30_Step3BFixtureBase
    {
        protected const string AdminId = "usr_admin_default";
        protected const string CashierId = "usr_cashier_1";

        private string _baseFolder;

        [SetUp]
        public void Step3BSetUp()
        {
            _baseFolder = Path.Combine(Path.GetTempPath(), "rafiq_nunit_3b_" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(_baseFolder);
            SecurityService.SetCurrentUserForTesting(null);
            DatabaseService.Initialize(_baseFolder);
            Assert.IsFalse(DatabaseService.IsCorrupted, "قاعدة الاختبار يجب أن تكون سليمة");
            // Licensing is out of scope here: an unactivated test store must still be able to sell
            if (DatabaseService.License != null) DatabaseService.License.StopBackgroundPeriodicCheck();
            typeof(DatabaseService).GetProperty("License", BindingFlags.Static | BindingFlags.Public).GetSetMethod(true).Invoke(null, new object[] { null });
            // The seeded accounts must replace their default PINs before the IPC gate lets them work
            DatabaseService.Security.ChangeUserPin(AdminId, "7418");
            DatabaseService.Security.ChangeUserPin(CashierId, "8529");
            LoginAs(AdminId);
        }

        [TearDown]
        public void Step3BTearDown()
        {
            SecurityService.SetCurrentUserForTesting(null);
            if (DatabaseService.License != null) DatabaseService.License.StopBackgroundPeriodicCheck();
            if (DatabaseService.Backup != null) DatabaseService.Backup.StopBackgroundPeriodicCheck();
            const BindingFlags flags = BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic;
            foreach (PropertyInfo prop in typeof(DatabaseService).GetProperties(flags))
            {
                MethodInfo setter = prop.GetSetMethod(true);
                if (setter != null && !prop.PropertyType.IsValueType) setter.Invoke(null, new object[] { null });
            }
            foreach (FieldInfo field in typeof(DatabaseService).GetFields(flags))
            {
                if (field.IsLiteral || field.IsInitOnly) continue;
                field.SetValue(null, field.FieldType.IsValueType ? Activator.CreateInstance(field.FieldType) : null);
            }
            SaleService.ClearIdempotencyCache();
            // The dispatcher caches its e-pay repository per process; each test has its own database
            FieldInfo epayRepo = typeof(IpcDispatcher).GetField("_epayRepo", BindingFlags.Static | BindingFlags.NonPublic);
            if (epayRepo != null) epayRepo.SetValue(null, null);
            SQLiteConnection.ClearAllPools();
            GC.Collect();
            GC.WaitForPendingFinalizers();
            try { Directory.Delete(_baseFolder, true); } catch (IOException) { } catch (UnauthorizedAccessException) { }
        }

        protected static void LoginAs(string userId)
        {
            var user = DatabaseService.UserRepo.GetById(userId);
            Assert.IsNotNull(user, "المستخدم غير موجود: " + userId);
            SecurityService.SetCurrentUserForTesting(SecurityService.MapToDto(user));
        }

        protected static BridgeResponse Dispatch(string action, JObject payload)
        {
            return IpcDispatcher.Dispatch(new BridgeRequest
            {
                Id = Guid.NewGuid().ToString("N"),
                Action = action,
                Payload = payload
            });
        }

        protected static BridgeResponse DispatchOk(string action, JObject payload)
        {
            var res = Dispatch(action, payload);
            Assert.IsTrue(res.Success, action + " فشل: " + Describe(res));
            return res;
        }

        protected static string Describe(BridgeResponse res)
        {
            return res != null && res.Error != null ? res.Error.Code + ": " + res.Error.Message : "";
        }

        protected static JObject Data(BridgeResponse res)
        {
            return JObject.FromObject(res.Data);
        }

        protected static Shift OpenShift(long openingFloatPiasters)
        {
            return DatabaseService.Shifts.OpenShift(new OpenShiftRequest
            {
                PosRegisterId = "default_pos",
                CashierId = AdminId,
                CashierName = "مدير النظام",
                OpeningFloatPiasters = openingFloatPiasters
            });
        }

        protected static Product CreateProduct(string name, long pricePiasters, long costPiasters, long stockMilli)
        {
            return DatabaseService.Products.SaveProduct(new Product
            {
                Name = name,
                Barcode = "BAR_3B_" + Guid.NewGuid().ToString("N").Substring(0, 10),
                PricePiasters = pricePiasters,
                CostPiasters = costPiasters,
                StockQuantityMilli = stockMilli,
                Unit = "piece",
                IsActive = true
            }, true, true);
        }

        protected static long Stock(string productId)
        {
            return DatabaseService.Products.GetById(productId).StockQuantityMilli;
        }

        protected static long Scalar(string sql, params object[] nameValuePairs)
        {
            using (var conn = new SQLiteConnection(DatabaseService.ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    for (int i = 0; i + 1 < nameValuePairs.Length; i += 2)
                    {
                        cmd.Parameters.AddWithValue((string)nameValuePairs[i], nameValuePairs[i + 1]);
                    }
                    object val = cmd.ExecuteScalar();
                    return val == null || val == DBNull.Value ? 0 : Convert.ToInt64(val);
                }
            }
        }

        protected static void Execute(string sql, params object[] nameValuePairs)
        {
            using (var conn = new SQLiteConnection(DatabaseService.ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    for (int i = 0; i + 1 < nameValuePairs.Length; i += 2)
                    {
                        cmd.Parameters.AddWithValue((string)nameValuePairs[i], nameValuePairs[i + 1]);
                    }
                    cmd.ExecuteNonQuery();
                }
            }
        }

        /// <summary>سطر سلة بنفس الشكل الذي ترسله شاشة الكاشير (CartItem)</summary>
        protected static JObject CartLine(Product product, long quantityMilli, long unitPricePiasters)
        {
            return new JObject
            {
                { "id", "cart_" + Guid.NewGuid().ToString("N").Substring(0, 8) },
                { "productId", product.Id },
                { "productName", product.Name },
                { "barcode", product.Barcode },
                { "quantityMilli", quantityMilli },
                { "unitPricePiasters", unitPricePiasters },
                { "unitCostPiasters", product.CostPiasters },
                { "discountPiasters", 0 },
                { "totalPiasters", unitPricePiasters * quantityMilli / 1000 },
                { "unit", product.Unit },
                { "conversionFactor", 1 },
                { "stockQuantityMilli", product.StockQuantityMilli }
            };
        }

        /// <summary>طلب sales:create بنفس حقول PosView.handleCheckout</summary>
        protected static JObject SalePayload(JArray items, long totalPiasters, string paymentMethod, long paidPiasters, string customerId)
        {
            return new JObject
            {
                { "subtotalPiasters", totalPiasters },
                { "discountPiasters", 0 },
                { "taxPiasters", 0 },
                { "totalPiasters", totalPiasters },
                { "paidPiasters", paidPiasters },
                { "paymentMethod", paymentMethod },
                { "customerId", customerId },
                { "status", "completed" },
                { "items", items },
                { "changePiasters", 0 },
                { "idempotencyKey", Guid.NewGuid().ToString() },
                { "orderType", "takeaway" },
                { "serviceChargePiasters", 0 },
                { "deliveryFeePiasters", 0 }
            };
        }
    }
}
