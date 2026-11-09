using System;
using System.Collections.Generic;
using System.Data.SQLite;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using RafiqPOS.Bridge;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    [TestFixture]
    [NonParallelizable]
    public class S12_SecurityHardeningTest : TestBase
    {
        private const string AdminId = "usr_admin_default";
        private const string CashierId = "usr_cashier_1";

        [SetUp]
        public void SecuritySetUp()
        {
            DatabaseService.Settings = new SettingsService(SettingsRepo, AuditRepo);
            DatabaseService.Backup = BackupService;
            DatabaseService.Sales = SaleService;
            SecurityService.SetCurrentUserForTesting(null);
        }

        [TearDown]
        public override void BaseTearDown()
        {
            SecurityService.SetCurrentUserForTesting(null);
            DatabaseService.Settings = null;
            DatabaseService.Backup = null;
            DatabaseService.Sales = null;
            base.BaseTearDown();
        }

        private BridgeResponse Dispatch(string action, object payload)
        {
            return IpcDispatcher.Dispatch(new BridgeRequest
            {
                Id = Guid.NewGuid().ToString("N"),
                Action = action,
                Payload = payload != null ? JObject.FromObject(payload) : null
            });
        }

        private static string ErrorCode(BridgeResponse res)
        {
            return res != null && res.Error != null ? res.Error.Code : null;
        }

        private static string Describe(BridgeResponse res)
        {
            return res != null && res.Error != null ? res.Error.Code + ": " + res.Error.Message : "";
        }

        private void LoginAs(string userId)
        {
            var user = UserRepo.GetById(userId);
            Assert.IsNotNull(user, "المستخدم غير موجود: " + userId);
            SecurityService.SetCurrentUserForTesting(SecurityService.MapToDto(user));
        }

        // The seeded owner must replace its default PIN before the IPC gate lets it do anything else
        private void PrepareOwnerWithRealPin()
        {
            SecurityService.ChangeUserPin(AdminId, "7418");
        }

        private long CountAudit(string action)
        {
            using (var conn = new SQLiteConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("SELECT COUNT(*) FROM audit_logs WHERE action = @a;", conn))
                {
                    cmd.Parameters.AddWithValue("@a", action);
                    return Convert.ToInt64(cmd.ExecuteScalar());
                }
            }
        }

        private UserDto CreateDelegateUnderAdmin(string username, Dictionary<string, bool> perms, bool canDelegate, int maxDepth)
        {
            LoginAs(AdminId);
            var created = SecurityService.CreateSubUser(null, username, "موظف " + username, null, "7418", "cashier", perms, canDelegate, maxDepth);
            SecurityService.SetCurrentUserForTesting(null);
            return created;
        }

        // ---------- Fix 1: owner recovery code exposure + recovery brute force ----------

        [Test]
        public void Fix1_RecoveryCode_IsReturnedOnlyToAdminSessions()
        {
            PrepareOwnerWithRealPin();
            LoginAs(CashierId);
            var cashierRes = Dispatch("backup:getRecoveryStatus", null);
            Assert.IsTrue(cashierRes.Success, "طلب الحالة نفسه مسموح لأي جلسة");
            JObject cashierData = JObject.FromObject(cashierRes.Data);
            Assert.IsNull(cashierData["recoveryCode"], "الكاشير يجب ألا يستلم كود استرجاع المالك أبداً");

            LoginAs(AdminId);
            var adminRes = Dispatch("backup:getRecoveryStatus", null);
            Assert.IsTrue(adminRes.Success, Describe(adminRes));
            JObject adminData = JObject.FromObject(adminRes.Data);
            Assert.IsFalse(string.IsNullOrEmpty((string)adminData["recoveryCode"]), "المالك يستلم الكود لتأكيد حفظه");
        }

        [Test]
        public void Fix1_ResetWithRecovery_IsRateLimitedAndAudited()
        {
            string realCode = BackupService.GetOrCreateRecoveryCode();

            BridgeResponse last = null;
            for (int i = 0; i < 3; i++)
            {
                last = Dispatch("security:resetWithRecovery", new { recoveryCode = "RFK-AAAA-BBB" + i, newPin = "7418" });
                Assert.IsFalse(last.Success);
            }

            var whileLocked = Dispatch("security:resetWithRecovery", new { recoveryCode = realCode, newPin = "7418" });
            Assert.IsFalse(whileLocked.Success, "بعد المحاولات الخاطئة يجب قفل الاسترجاع حتى بالكود الصحيح");
            Assert.AreEqual(3, CountAudit("RECOVERY_CODE_FAILED"), "كل محاولة خاطئة تُسجل في سجل التدقيق");
            Assert.AreEqual(1, CountAudit("RECOVERY_RESET_LOCKED"), "المحاولة أثناء القفل تُسجل أيضاً");

            SettingsRepo.Set("security_recovery_lockout_until", "");
            var ok = Dispatch("security:resetWithRecovery", new { recoveryCode = realCode, newPin = "7418" });
            Assert.IsTrue(ok.Success, "الكود الصحيح بعد انتهاء القفل يعيد تعيين رقم المالك");
            Assert.AreEqual(1, CountAudit("RECOVERY_RESET_SUCCESS"));
            Assert.IsTrue(SecurityService.VerifyUserPin(AdminId, "7418"));
        }

        [Test]
        public void Fix1_ResetWithRecovery_AcceptsSignedCloudflareRecoveryToken()
        {
            var payload = new Newtonsoft.Json.Linq.JObject();
            payload["iss"] = "rafiq-license-server";
            payload["sub"] = "RECOVERY-TEST";
            payload["fp"] = EncryptionService.GenerateDeviceFingerprint();
            payload["shop"] = "Test Shop";
            payload["type"] = "lifetime";
            payload["kind"] = "pin_reset";
            payload["iat"] = RafiqPOS.Common.LicenseTokenVerifier.ToUnix(DateTime.UtcNow);
            payload["exp"] = RafiqPOS.Common.LicenseTokenVerifier.ToUnix(DateTime.UtcNow.AddHours(24));
            payload["jti"] = Guid.NewGuid().ToString();

            string signedToken = RafiqPOS.Common.LicenseTokenVerifier.SignWithEphemeralTestKey(payload);
            string fullRecoveryCode = "RFQ-REC-" + signedToken;

            // Reset lockout before test
            SettingsRepo.Set("security_recovery_lockout_until", "");
            SettingsRepo.Set("security_recovery_failed_attempts", "0");

            var ok = Dispatch("security:resetWithRecovery", new { recoveryCode = fullRecoveryCode, newPin = "9821" });
            Assert.IsTrue(ok.Success, "كود الاسترجاع الرقمي RFQ-REC- يعيد تعيين رقم المالك بنجاح");
            Assert.IsTrue(SecurityService.VerifyUserPin(AdminId, "9821"));

            // Re-using the same single-use token must fail
            SettingsRepo.Set("security_recovery_lockout_until", "");
            var reuse = Dispatch("security:resetWithRecovery", new { recoveryCode = fullRecoveryCode, newPin = "1122" });
            Assert.IsFalse(reuse.Success, "إعادة استخدام كود الاسترجاع المستهلك ذو الـ JTI لمرة واحدة يجب أن يفشل");
        }

        // ---------- Fix 2: privilege escalation through user management ----------

        [Test]
        public void Fix2_NonAdminDelegate_CannotEscalate()
        {
            var perms = new Dictionary<string, bool>
            {
                { "users.view", true }, { "users.create", true }, { "users.edit", true }, { "users.delegate", true }, { "pos.sell", true }
            };
            var supervisor = CreateDelegateUnderAdmin("supa", perms, true, 2);
            Assert.IsTrue(supervisor.CanDelegate);

            LoginAs(supervisor.Id);

            Assert.Throws<UnauthorizedAccessException>(delegate
            {
                SecurityService.CreateSubUser(null, "evil_admin", "مدير مزيف", null, "7418", "admin", null, false, 0);
            }, "غير المدير لا يمكنه إنشاء حساب مدير");

            Assert.Throws<UnauthorizedAccessException>(delegate
            {
                SecurityService.CreateSubUser(AdminId, "sibling", "خارج الشجرة", null, "7418", "cashier", null, false, 0);
            }, "لا يمكن وضع الحساب تحت أب خارج شجرة المستخدم");

            var ipcAdmin = Dispatch("users:createSubUser", new { parentId = AdminId, username = "evil2", displayName = "x", pin = "7418", role = "admin" });
            Assert.IsFalse(ipcAdmin.Success, "IPC يرفض إنشاء مدير عبر parentId مزيف");
            Assert.IsNull(UserRepo.GetByUsername("evil2"));

            var child = SecurityService.CreateSubUser(null, "child1", "تابع", null, "7418", "cashier",
                new Dictionary<string, bool> { { "users.view", true }, { "settings.store", true }, { "products.clear_all", true } }, true, 5);
            Assert.AreEqual(supervisor.Id, child.ParentId, "الأب دائماً هو صاحب الجلسة");
            Assert.IsTrue(child.Permissions["users.view"]);
            Assert.IsFalse(child.Permissions["settings.store"], "لا يمكن منح صلاحية لا يملكها المانح");
            Assert.IsFalse(child.Permissions["products.clear_all"]);
            Assert.LessOrEqual(child.MaxDepth, 1, "عمق التفويض للتابع أقل من عمق المانح");

            Assert.Throws<UnauthorizedAccessException>(delegate
            {
                SecurityService.UpdateUserPermissions(supervisor.Id, new Dictionary<string, bool> { { "settings.store", true } });
            }, "لا أحد يعدّل صلاحياته بنفسه");

            Assert.Throws<UnauthorizedAccessException>(delegate
            {
                SecurityService.UpdateUserPermissions(CashierId, new Dictionary<string, bool> { { "pos.sell", false } });
            }, "لا يمكن تعديل حساب ليس تابعاً لك");

            SecurityService.UpdateUserPermissions(child.Id, new Dictionary<string, bool> { { "products.clear_all", true }, { "pos.sell", true } });
            var childAfter = SecurityService.MapToDto(UserRepo.GetById(child.Id));
            Assert.IsFalse(childAfter.Permissions["products.clear_all"], "تعديل الصلاحيات لا يتجاوز صلاحيات المعدِّل");
            Assert.IsTrue(childAfter.Permissions["pos.sell"]);

            Assert.Throws<UnauthorizedAccessException>(delegate
            {
                SecurityService.SetUserDelegation(supervisor.Id, true, 50);
            }, "لا أحد يرفع عمق تفويضه بنفسه");

            SecurityService.SetUserDelegation(child.Id, true, 50);
            Assert.LessOrEqual(UserRepo.GetById(child.Id).MaxDepth, 1);

            LoginAs(AdminId);
            SecurityService.UpdateUserPermissions(child.Id, new Dictionary<string, bool> { { "products.clear_all", true } });
            Assert.IsTrue(SecurityService.MapToDto(UserRepo.GetById(child.Id)).Permissions["products.clear_all"], "المدير مستثنى من قيود الشجرة");
        }

        // ---------- Fix 3: settings write allowlists ----------

        [Test]
        public void Fix3_SettingsWrite_IsLimitedToThePermissionAllowlist()
        {
            PrepareOwnerWithRealPin();
            var printerOnly = CreateDelegateUnderAdmin("printer_staff", new Dictionary<string, bool> { { "settings.printer", true } }, false, 0);
            SettingsRepo.Set("allow_negative_stock", "0");
            LoginAs(printerOnly.Id);

            var printerSave = Dispatch("settings:save", new Dictionary<string, string> { { "default_printer_name", "XP-80" }, { "printer_auto_print", "1" } });
            Assert.IsTrue(printerSave.Success, "مفاتيح الطابعة مسموحة لصاحب صلاحية الطابعة " + Describe(printerSave));
            Assert.AreEqual("XP-80", SettingsRepo.Get("default_printer_name", ""));

            var policy = Dispatch("settings:save", new Dictionary<string, string> { { "allow_negative_stock", "1" } });
            Assert.AreEqual("FORBIDDEN", ErrorCode(policy), "سياسات المتجر للمدير فقط");
            Assert.AreEqual("0", SettingsRepo.Get("allow_negative_stock", ""));

            var batch = Dispatch("settings:updateBatch", new { settings = new Dictionary<string, string> { { "max_discount_percent_cashier", "100" } } });
            Assert.AreEqual("FORBIDDEN", ErrorCode(batch));
            Assert.AreNotEqual("100", SettingsRepo.Get("max_discount_percent_cashier", ""));

            var store = Dispatch("settings:save", new Dictionary<string, string> { { "store_name", "اسم مزيف" } });
            Assert.AreEqual("FORBIDDEN", ErrorCode(store), "بيانات المحل تتطلب settings.store");

            var unchanged = Dispatch("settings:save", new Dictionary<string, string> { { "default_printer_name", "XP-80" }, { "allow_negative_stock", "0" } });
            Assert.IsTrue(unchanged.Success, "إعادة إرسال قيمة غير متغيرة لا تُعد تعديلاً");

            LoginAs(AdminId);
            var adminSave = Dispatch("settings:save", new Dictionary<string, string> { { "allow_negative_stock", "1" } });
            Assert.IsTrue(adminSave.Success, Describe(adminSave));
            Assert.AreEqual("1", SettingsRepo.Get("allow_negative_stock", ""));
        }

        // ---------- Fix 4 + 5: forced PIN change gate and default PIN handling ----------

        [Test]
        public void Fix4_MustChangePin_BlocksEverythingExceptPinChange()
        {
            var login = SecurityService.Login("admin", "1234");
            Assert.IsTrue(login.Success, "المالك يدخل برقمه المبدئي 1234");
            Assert.IsTrue(login.MustChangePin, "ويُجبر على تغييره");

            Assert.AreEqual("MUST_CHANGE_PIN", ErrorCode(Dispatch("shifts:open", new { posRegisterId = "default_pos", openingFloatPiasters = 0 })));
            Assert.AreEqual("MUST_CHANGE_PIN", ErrorCode(Dispatch("products:save", new { name = "x" })));
            Assert.AreEqual("MUST_CHANGE_PIN", ErrorCode(Dispatch("settings:getAll", null)));
            Assert.AreNotEqual("MUST_CHANGE_PIN", ErrorCode(Dispatch("security:getStatus", null)));

            var change = Dispatch("users:changePin", new { id = AdminId, newPin = "7418", currentPin = "1234" });
            Assert.IsTrue(change.Success, "تغيير الرقم بالرقم الحالي 1234 يعمل");

            Assert.IsTrue(Dispatch("settings:getAll", null).Success, "بعد التغيير تعود الصلاحيات الطبيعية");
            Assert.IsFalse(UserRepo.GetById(AdminId).MustChangePin);
        }

        [Test]
        public void Fix4_CashierForcedChange_CanOnlyChangeOwnPin()
        {
            var login = SecurityService.Login("cashier1", "0000");
            Assert.IsTrue(login.Success);
            Assert.IsTrue(login.MustChangePin, "الرقم المبدئي الضعيف يفرض التغيير");

            var other = Dispatch("users:changePin", new { id = AdminId, newPin = "7418", currentPin = "1234" });
            Assert.IsFalse(other.Success, "الكاشير لا يغير رقم غيره");

            var own = Dispatch("users:changePin", new { id = CashierId, newPin = "8529", currentPin = "0000" });
            Assert.IsTrue(own.Success, "الكاشير يغير رقمه بنفسه برقمه الحالي");
            Assert.IsFalse(UserRepo.GetById(CashierId).MustChangePin);
            Assert.IsTrue(SecurityService.Login("cashier1", "8529").Success);
        }

        [Test]
        public void Fix4_RecoveryCodeLogin_CanCompleteForcedChange()
        {
            LoginAs(AdminId);
            var initial = SecurityService.SetPin("7418", null, null);
            Assert.IsTrue(initial.Success);
            SecurityService.SetCurrentUserForTesting(null);

            var login = SecurityService.Login("admin", initial.RecoveryCode);
            Assert.IsTrue(login.Success, "الدخول برمز الطوارئ مسموح للمالك");
            Assert.IsTrue(UserRepo.GetById(AdminId).MustChangePin, "الدخول بالرمز يفرض تغيير الرقم ويُحفظ في القاعدة");
            Assert.AreEqual("MUST_CHANGE_PIN", ErrorCode(Dispatch("settings:getAll", null)));

            var change = Dispatch("security:setPin", new { newPin = "8529", currentPin = initial.RecoveryCode });
            Assert.IsTrue(change.Success, "جلسة الطوارئ تعيّن رقماً جديداً بدون الرقم المنسي " + Describe(change));
            Assert.IsTrue(Dispatch("settings:getAll", null).Success);
            Assert.IsTrue(SecurityService.Login("admin", "8529").Success);
        }

        [Test]
        public void Fix5_DefaultPins_AreUpgradedAndUsable()
        {
            var admin = UserRepo.GetById(AdminId);
            Assert.IsFalse(string.IsNullOrEmpty(admin.PinSalt), "الرقم النصي القديم للمالك يُحفظ مشفراً عند بدء التشغيل");
            Assert.AreNotEqual("1234", admin.PinCodeHash);
            Assert.IsTrue(admin.MustChangePin, "الترقية لا تلغي إجبار التغيير");

            string legacyCashierHash = UserRepo.GetById(CashierId).PinCodeHash;
            var cashierLogin = SecurityService.Login("cashier1", "0000");
            Assert.IsTrue(cashierLogin.Success, "حساب cashier1 المبذور بـ 10,000 تكرار يمكنه الدخول");
            Assert.AreNotEqual(legacyCashierHash, UserRepo.GetById(CashierId).PinCodeHash, "يُعاد تشفيره بالمعيار الحالي");
            Assert.IsTrue(SecurityService.Login("cashier1", "0000").Success, "الدخول بعد إعادة التشفير ما زال يعمل");

            // Existing installs that still hold the plaintext seed are fixed by the next startup
            using (var conn = new SQLiteConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("UPDATE users SET pin_code_hash = '1234', pin_salt = '' WHERE id = @id;", conn))
                {
                    cmd.Parameters.AddWithValue("@id", AdminId);
                    cmd.ExecuteNonQuery();
                }
            }
            var restarted = new SecurityService(SettingsRepo, AuditRepo, UserRepo);
            Assert.IsFalse(string.IsNullOrEmpty(UserRepo.GetById(AdminId).PinSalt));
            Assert.IsTrue(restarted.Login("admin", "1234").Success);
        }

        // ---------- Fix 6: invoice discount permission ----------

        [Test]
        public void Fix6_InvoiceDiscount_RequiresPermissionOrSupervisor()
        {
            var prod = CreateTestProduct("صنف خصم", 10000, 6000, 50000);
            OpenTestShift();
            PrepareOwnerWithRealPin();
            LoginAs(CashierId);

            Func<long, long, string, Sale> makeSale = delegate(long invoiceDiscount, long lineDiscount, string supPin)
            {
                return new Sale
                {
                    CashierId = CashierId,
                    CashierName = "كاشير 1",
                    PaymentMethod = "cash",
                    PaidPiasters = 10000,
                    DiscountPiasters = invoiceDiscount,
                    SupervisorPin = supPin,
                    Items = new List<SaleItem>
                    {
                        new SaleItem
                        {
                            ProductId = prod.Id,
                            ProductName = prod.Name,
                            QuantityMilli = 1000,
                            UnitPricePiasters = 10000,
                            DiscountPiasters = lineDiscount,
                            TotalPiasters = 10000 - lineDiscount
                        }
                    }
                };
            };

            var ex = Assert.Throws<InvalidOperationException>(delegate
            {
                SaleService.ProcessSale(makeSale(100, 0, null), null);
            });
            StringAssert.Contains("صلاحية خصم على إجمالي الفاتورة", ex.Message);

            var approved = SaleService.ProcessSale(makeSale(100, 0, "7418"), null);
            Assert.AreEqual(100, approved.DiscountPiasters, "اعتماد المشرف يسمح بخصم الفاتورة");

            var lineOk = SaleService.ProcessSale(makeSale(0, 100, null), null);
            Assert.IsNotNull(lineOk, "الكاشير الافتراضي يملك خصم الصنف");
        }

        // ================= Round 2 =================

        private long ScalarLong(string sql, string param)
        {
            using (var conn = new SQLiteConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@p", param);
                    return Convert.ToInt64(cmd.ExecuteScalar());
                }
            }
        }

        // Exactly what PosView.handleConfirmPayment posts: discountPiasters = invoice-level discount only
        private static JObject UiSalePayload(string productId, long unitPrice, long lineDiscount, long invoiceDiscount, string supervisorPin)
        {
            long lineNet = unitPrice - lineDiscount;
            long net = lineNet - invoiceDiscount;
            string json = "{" +
                "\"subtotalPiasters\":" + unitPrice + "," +
                "\"discountPiasters\":" + invoiceDiscount + "," +
                "\"taxPiasters\":0," +
                "\"totalPiasters\":" + net + "," +
                "\"paidPiasters\":" + net + "," +
                "\"paymentMethod\":\"cash\"," +
                "\"status\":\"completed\"," +
                "\"items\":[{\"productId\":\"" + productId + "\",\"productName\":\"صنف\",\"quantityMilli\":1000," +
                    "\"unitPricePiasters\":" + unitPrice + ",\"discountPiasters\":" + lineDiscount + ",\"totalPiasters\":" + lineNet + "," +
                    "\"taxPiasters\":0,\"taxRatePercent\":0,\"unit\":\"piece\"}]," +
                "\"payments\":[{\"method\":\"cash\",\"amountPiasters\":" + net + "}]," +
                "\"changePiasters\":0," +
                "\"idempotencyKey\":\"" + Guid.NewGuid().ToString("N") + "\"," +
                "\"orderType\":\"takeaway\",\"serviceChargePiasters\":0,\"deliveryFeePiasters\":0" +
                (supervisorPin != null ? ",\"supervisorPin\":\"" + supervisorPin + "\"" : "") +
                "}";
            return JObject.Parse(json);
        }

        [Test]
        public void R1_UiSalePayload_LineDiscountIsNotTreatedAsInvoiceDiscountOrDoubleCounted()
        {
            var prod = CreateTestProduct("صنف خصم سطر", 10000, 6000, 50000);
            OpenTestShift();
            PrepareOwnerWithRealPin();

            LoginAs(CashierId);
            var cashierSale = Dispatch("sales:create", UiSalePayload(prod.Id, 10000, 500, 0, null));
            Assert.IsTrue(cashierSale.Success, "كاشير افتراضي بخصم صنف داخل الحد يبيع بنجاح " + Describe(cashierSale));
            Sale cs = (Sale)cashierSale.Data;
            Assert.AreEqual(9500, cs.TotalPiasters, "الصافي = الإجمالي - خصم الصنف مرة واحدة");
            Assert.AreEqual(0, cs.DiscountPiasters, "خصم الفاتورة يبقى صفراً");
            Assert.AreEqual(9500, ScalarLong("SELECT total_piasters FROM sales WHERE id = @p;", cs.Id));
            Assert.AreEqual(500, ScalarLong("SELECT COALESCE(SUM(discount_piasters),0) FROM sale_items WHERE sale_id = @p;", cs.Id));

            var cashierInvoice = Dispatch("sales:create", UiSalePayload(prod.Id, 10000, 0, 300, null));
            Assert.AreEqual("SALE_VALIDATION_FAILED", ErrorCode(cashierInvoice), "خصم الفاتورة بدون صلاحية مرفوض");

            LoginAs(AdminId);
            var adminSale = Dispatch("sales:create", UiSalePayload(prod.Id, 10000, 500, 300, null));
            Assert.IsTrue(adminSale.Success, Describe(adminSale));
            Sale asl = (Sale)adminSale.Data;
            Assert.AreEqual(9200, asl.TotalPiasters, "خصم الصنف + خصم الفاتورة بدون ازدواج");
            Assert.AreEqual(300, ScalarLong("SELECT discount_piasters FROM sales WHERE id = @p;", asl.Id));
        }

        [Test]
        public void F1_SettingsResponses_NeverLeakSecrets()
        {
            PrepareOwnerWithRealPin();
            BackupService.GetOrCreateRecoveryCode();
            SettingsRepo.Set("license_token", "eyJ.secret.token");
            SettingsRepo.Set("license_key", "RFQ-AAAA-BBBB-CCCC");
            SettingsRepo.Set("transfer_release_code", "RFQ-REL-X");
            LoginAs(AdminId);

            var save = Dispatch("settings:save", new Dictionary<string, string>());
            Assert.IsTrue(save.Success);
            string saveJson = Newtonsoft.Json.JsonConvert.SerializeObject(save.Data);
            Assert.IsFalse(saveJson.Contains("security_") || saveJson.Contains("owner_") || saveJson.Contains("license_"), "settings:save لا يعيد أي إعدادات: " + saveJson);

            var all = Dispatch("settings:getAll", null);
            var data = (Dictionary<string, string>)all.Data;
            foreach (var key in data.Keys)
            {
                string k = key.ToLowerInvariant();
                Assert.IsFalse(k.StartsWith("license_") || k.StartsWith("transfer_") || k.StartsWith("owner_") || k.StartsWith("security_")
                    || k.Contains("hash") || k.Contains("salt") || k.Contains("token"), "مفتاح حساس ظهر في getAll: " + key);
            }
            Assert.IsTrue(data.ContainsKey("store_name"), "الإعدادات العادية ما زالت متاحة");

            var tamper = Dispatch("settings:save", new Dictionary<string, string> { { "owner_recovery_code_confirmed", "1" }, { "license_token", "x" } });
            Assert.IsTrue(tamper.Success);
            Assert.AreEqual("eyJ.secret.token", SettingsRepo.Get("license_token", ""), "المفاتيح المحمية لا تُكتب عبر settings:save");
        }

        [Test]
        public void F4_DelegateCannotGrantPermissionsByOmission()
        {
            var perms = GetAllFalseExcept("users.view", "users.create", "users.edit", "pos.access", "pos.sell");
            var supervisor = CreateDelegateUnderAdmin("supnodisc", perms, true, 2);
            Assert.IsFalse(supervisor.Permissions["pos.discount_line"], "المشرف نفسه لا يملك خصم الصنف");

            LoginAs(supervisor.Id);
            var emptyChild = SecurityService.CreateSubUser(null, "child_empty", "تابع1", null, "7418", "cashier", new Dictionary<string, bool>(), false, 0);
            var nullChild = SecurityService.CreateSubUser(null, "child_null", "تابع2", null, "7418", "cashier", null, false, 0);
            Assert.IsFalse(emptyChild.Permissions["pos.discount_line"], "خريطة فارغة لا ترث افتراضيات الدور");
            Assert.IsFalse(nullChild.Permissions["pos.discount_line"], "null لا يرث افتراضيات الدور");
            Assert.IsTrue(nullChild.Permissions["pos.sell"], "الافتراضي المسموح للمشرف يبقى");

            SecurityService.UpdateUserPermissions(emptyChild.Id, null);
            Assert.IsFalse(SecurityService.MapToDto(UserRepo.GetById(emptyChild.Id)).Permissions["pos.discount_line"]);
            Assert.IsFalse(SecurityService.HasPermission(emptyChild.Id, "customers.payment"), "صلاحية افتراضية لا يملكها المشرف لا تُمنح");
        }

        private static Dictionary<string, bool> GetAllFalseExcept(params string[] allowed)
        {
            var map = SecurityService.GetAllPermissionsDictionary(false);
            for (int i = 0; i < allowed.Length; i++) map[allowed[i]] = true;
            return map;
        }

        [Test]
        public void F5_SetPassword_EnforcesHierarchyAndLockout()
        {
            var perms = GetAllFalseExcept("users.view", "users.create", "users.reset_pin", "pos.access", "pos.sell");
            var supervisor = CreateDelegateUnderAdmin("suppass", perms, true, 2);
            LoginAs(supervisor.Id);
            var child = SecurityService.CreateSubUser(null, "childpass", "تابع", null, "7418", "cashier", null, false, 0);

            var ownerPwd = Dispatch("users:setPassword", new { userId = AdminId, newPassword = "hack1234", currentPassword = "" });
            Assert.IsFalse(ownerPwd.Success, "لا يمكن تغيير كلمة مرور المالك من حساب تابع");
            var siblingPwd = Dispatch("users:setPassword", new { userId = CashierId, newPassword = "hack1234" });
            Assert.IsFalse(siblingPwd.Success, "لا يمكن تغيير كلمة مرور حساب خارج الشجرة");
            var childPwd = Dispatch("users:setPassword", new { userId = child.Id, newPassword = "good1234" });
            Assert.IsTrue(childPwd.Success, "المشرف يغير كلمة مرور تابعه " + Describe(childPwd));

            for (int i = 0; i < 5; i++)
            {
                var wrong = Dispatch("users:setPassword", new { userId = supervisor.Id, newPassword = "newpass99", currentPassword = "000" + i });
                Assert.IsFalse(wrong.Success);
            }
            var correctWhileLocked = Dispatch("users:setPassword", new { userId = supervisor.Id, newPassword = "newpass99", currentPassword = "7418" });
            Assert.IsFalse(correctWhileLocked.Success, "بعد 5 محاولات خاطئة يُقفل التغيير حتى بالبيانات الصحيحة");
            Assert.Greater(UserRepo.GetById(supervisor.Id).FailedAttempts, 4, "العداد محفوظ في قاعدة البيانات");
        }

        [Test]
        public void F6_SupervisorThrottle_IsPersistentAndIndependent()
        {
            PrepareOwnerWithRealPin();
            for (int i = 0; i < 3; i++)
            {
                Assert.IsFalse(SecurityService.VerifySupervisorPin("000" + i, "TEST").Success);
            }
            var restarted = new SecurityService(SettingsRepo, AuditRepo, UserRepo);
            var lockedAfterRestart = restarted.VerifySupervisorPin("7418", "TEST");
            Assert.IsTrue(lockedAfterRestart.IsLocked, "قفل اعتماد المشرف يبقى بعد إعادة التشغيل");
            Assert.IsTrue(restarted.Login("admin", "7418").Success, "قفل اعتماد المشرف لا يقفل دخول المالك");

            SettingsRepo.Set("security_supervisor_lockout_until", "");
            SettingsRepo.Set("security_supervisor_failed_attempts", "0");
            for (int i = 0; i < 4; i++)
            {
                SecurityService.ResetWithRecoveryCode("RFK-ZZZZ-YYY" + i, "8529");
            }
            Assert.Greater(Convert.ToInt32(SettingsRepo.Get("security_recovery_failed_attempts", "0")), 4);
            Assert.IsTrue(SecurityService.VerifySupervisorPin("7418", "TEST").Success, "إغراق رمز الاسترجاع لا يعطل اعتماد المشرف");

            // Store-PIN (security:verifyPin) failures use their own counter and never shorten the recovery lockout
            LoginAs(AdminId);
            Assert.IsTrue(SecurityService.SetPin("7419", null, null).Success);
            string longLock = DateTime.UtcNow.AddHours(1).ToString("o");
            SettingsRepo.Set("security_recovery_lockout_until", longLock);
            for (int i = 0; i < 10; i++)
            {
                SecurityService.VerifyPin("000" + i, "TEST");
                SettingsRepo.Set("security_lockout_until", "");
            }
            Assert.AreEqual(longLock, SettingsRepo.Get("security_recovery_lockout_until", ""), "قفل الاسترجاع الطويل لا يُقصَّر بفشل الرقم السري");
            Assert.IsFalse(SecurityService.ResetWithRecoveryCode("RFK-AAAA-BBBB", "8529").Success, "الاسترجاع ما زال مقفلاً");
        }

        [Test]
        public void F6_SupervisorFailure_DoesNotClearAdminLoginLockout()
        {
            PrepareOwnerWithRealPin();
            for (int i = 0; i < 5; i++) SecurityService.Login("admin", "999" + i);
            Assert.IsFalse(string.IsNullOrEmpty(UserRepo.GetById(AdminId).LockoutUntil), "دخول المالك مقفل");
            SecurityService.VerifySupervisorPin("1111", "TEST");
            Assert.IsFalse(string.IsNullOrEmpty(UserRepo.GetById(AdminId).LockoutUntil), "فشل اعتماد المشرف لا يلغي قفل الدخول");
        }

        [Test]
        public void F11_RootStaysChallengeOnly()
        {
            PrepareOwnerWithRealPin();
            LoginAs(AdminId);
            var initial = SecurityService.SetPin("7419", null, null);
            Assert.IsTrue(initial.Success);
            SecurityService.SetCurrentUserForTesting(null);
            Assert.IsFalse(SecurityService.Login("islam", initial.RecoveryCode).Success, "رمز الاسترجاع لا يفتح حساب الروت");

            LoginAs(AdminId);
            Assert.Throws<UnauthorizedAccessException>(delegate { SecurityService.ChangeUserPinSecure("usr_root_developer", "8529", null, null); });
            Assert.Throws<UnauthorizedAccessException>(delegate { SecurityService.SetUserPassword("usr_root_developer", "rootpass1", null); });
        }

        [Test]
        public void F12_DelegationDepth_IsRelativeToTargetPosition()
        {
            var perms = GetAllFalseExcept("users.view", "users.create", "users.delegate", "pos.access");
            var supervisor = CreateDelegateUnderAdmin("supdepth", perms, true, 3);
            LoginAs(supervisor.Id);
            var child = SecurityService.CreateSubUser(null, "lvl1", "مستوى1", null, "7418", "cashier", null, true, 2);
            LoginAs(child.Id);
            var grandChild = SecurityService.CreateSubUser(null, "lvl2", "مستوى2", null, "7418", "cashier", null, false, 0);

            LoginAs(supervisor.Id);
            SecurityService.SetUserDelegation(grandChild.Id, true, 10);
            Assert.AreEqual(1, UserRepo.GetById(grandChild.Id).MaxDepth, "الحفيد يحصل على 3 - 2 = 1 فقط");

            SecurityService.SetUserDelegation(supervisor.Id, true, 3);
            Assert.AreEqual(3, UserRepo.GetById(supervisor.Id).MaxDepth, "إعادة حفظ نفس التفويض لنفسك عملية بلا أثر وليست خطأ");
        }

        [Test]
        public void F15_PlaintextPin_IsOnlyAcceptedByTheStartupMigration()
        {
            using (var conn = new SQLiteConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("UPDATE users SET pin_code_hash = '2580', pin_salt = '' WHERE id = @id;", conn))
                {
                    cmd.Parameters.AddWithValue("@id", CashierId);
                    cmd.ExecuteNonQuery();
                }
            }
            Assert.IsFalse(SecurityService.Login("cashier1", "2580").Success, "رقم نصي غير مشفر يُرفض أثناء التشغيل");

            var restarted = new SecurityService(SettingsRepo, AuditRepo, UserRepo);
            Assert.IsFalse(string.IsNullOrEmpty(UserRepo.GetById(CashierId).PinSalt), "الترحيل عند بدء التشغيل يشفر كل الأرقام النصية");
            Assert.IsTrue(restarted.Login("cashier1", "2580").Success);
        }

        [Test]
        public void D1_DeviceMismatch_BlocksSellingButKeepsLicenseData()
        {
            SettingsRepo.Set("license_key", "RFQ-AAAA-BBBB-CCCC");
            SettingsRepo.Set("license_token", "token-kept-for-support");
            SettingsRepo.Set("license_status", "mismatched");
            var license = new LicenseService(SettingsRepo, null);
            LicenseService.InvalidateCache();
            Assert.IsTrue(license.IsLicenseExpired(), "حالة عدم تطابق الجهاز توقف البيع");
            StringAssert.Contains("الدعم الفني", license.GetBlockedActionMessage());
            Assert.AreEqual("mismatched", license.CheckExpiry().Status);
            Assert.AreEqual("RFQ-AAAA-BBBB-CCCC", SettingsRepo.Get("license_key", ""), "مفتاح الترخيص لا يُمسح");
            Assert.AreEqual("token-kept-for-support", SettingsRepo.Get("license_token", ""), "التوكن لا يُمسح");
        }
    }
}
