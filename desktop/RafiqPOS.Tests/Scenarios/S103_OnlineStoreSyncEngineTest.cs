using System;
using System.Collections.Generic;
using System.Data.SQLite;
using NUnit.Framework;
using RafiqPOS.Common;
using RafiqPOS.Database;
using RafiqPOS.Models;
using RafiqPOS.Repositories;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    [TestFixture]
    [NonParallelizable]
    public class S103_OnlineStoreSyncEngineTest : TestBase
    {
        private long Scalar(string sql)
        {
            using (var conn = new SQLiteConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    object val = cmd.ExecuteScalar();
                    return val == null || val == DBNull.Value ? 0 : Convert.ToInt64(val);
                }
            }
        }

        [Test]
        public void Migration67_CreatesAllOnlineStoreTablesAndColumnsIdempotently()
        {
            Assert.GreaterOrEqual(MigrationRunner.LATEST_SUPPORTED_VERSION, 67);
            Assert.AreEqual(1L, Scalar("SELECT COUNT(*) FROM schema_migrations WHERE version = 67;"));

            Assert.AreEqual(1L, Scalar("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='sync_outbox';"));
            Assert.AreEqual(1L, Scalar("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='sync_inbox';"));
            Assert.AreEqual(1L, Scalar("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='sync_state';"));
            Assert.AreEqual(1L, Scalar("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='product_images';"));

            Assert.AreEqual(1L, Scalar("SELECT COUNT(*) FROM pragma_table_info('products') WHERE name='is_online';"));
            Assert.AreEqual(1L, Scalar("SELECT COUNT(*) FROM pragma_table_info('products') WHERE name='is_featured';"));
            Assert.AreEqual(1L, Scalar("SELECT COUNT(*) FROM pragma_table_info('products') WHERE name='online_description';"));
            Assert.AreEqual(1L, Scalar("SELECT COUNT(*) FROM pragma_table_info('products') WHERE name='compare_price_piasters';"));
            Assert.AreEqual(1L, Scalar("SELECT COUNT(*) FROM pragma_table_info('categories') WHERE name='is_online';"));
            Assert.AreEqual(1L, Scalar("SELECT COUNT(*) FROM pragma_table_info('categories') WHERE name='image_url';"));

            // Idempotency check: re-running migrations must succeed cleanly
            MigrationRunner.ApplyMigrations(ConnectionString, TestDbPath);
            Assert.AreEqual(1L, Scalar("SELECT COUNT(*) FROM schema_migrations WHERE version = 67;"));
        }

        [Test]
        public void SyncRepository_OutboxCrashRecovery_ResetsStuckSyncingItemsToPending()
        {
            var repo = new SyncRepository(ConnectionString);
            repo.EnqueueOutbox("product", "prod-crash-1", "upsert", "{\"id\":\"prod-crash-1\"}");

            var pending = repo.GetPendingOutboxItems(10);
            Assert.GreaterOrEqual(pending.Count, 1);

            var ids = new List<string> { pending[0].Id };
            repo.MarkOutboxItemsStatus(ids, "syncing");

            // Simulate power outage recovery on next startup
            int recovered = repo.ResetStuckSyncingItems();
            Assert.GreaterOrEqual(recovered, 1);

            var afterRecovery = repo.GetPendingOutboxItems(10);
            Assert.IsTrue(afterRecovery.Exists(delegate(SyncOutboxItem x) { return x.Id == pending[0].Id && x.SyncStatus == "pending"; }));
        }

        [Test]
        public void SyncRepository_InboxOrders_IdempotentInsertAndAtomicStatusUpdateEnqueuesOutbox()
        {
            var repo = new SyncRepository(ConnectionString);
            var order = new OnlineOrderDto
            {
                Id = "ord-cloud-test-1001",
                OrderNumber = 15,
                CustomerName = "أحمد محمد",
                CustomerPhone = "01012345678",
                CustomerAddress = "شارع النيل",
                DeliveryMethod = "delivery",
                DeliveryFee = 1500,
                Subtotal = 45000,
                Total = 46500,
                Status = "new",
                Items = new List<OnlineOrderItemDto>
                {
                    new OnlineOrderItemDto
                    {
                        Id = "oi-1",
                        ProductId = "p-1",
                        ProductName = "حليب جهينة 1 لتر",
                        ProductPrice = 4500,
                        Quantity = 10000,
                        LineTotal = 45000
                    }
                }
            };

            bool firstInsert = repo.SaveInboxOrder(order);
            bool duplicateInsert = repo.SaveInboxOrder(order);
            Assert.IsTrue(firstInsert, "أول إدخال للطلب يجب أن ينجح");
            Assert.IsFalse(duplicateInsert, "تكرار نفس الطلب يجب أن يُتجاهل بأمان");
            Assert.AreEqual(1, repo.GetNewOrdersCount());

            bool updated = repo.UpdateInboxOrderStatus(order.Id, "accepted", null, "inv-pos-99");
            Assert.IsTrue(updated);
            Assert.AreEqual(0, repo.GetNewOrdersCount());

            var orders = repo.GetInboxOrders("accepted");
            Assert.AreEqual(1, orders.Count);
            Assert.AreEqual(46500L, orders[0].TotalPiasters);
            Assert.AreEqual("inv-pos-99", orders[0].PosInvoiceId);

            // Verify atomic outbox enqueue for cloud notification
            var outbox = repo.GetPendingOutboxItems(50);
            Assert.IsTrue(outbox.Exists(delegate(SyncOutboxItem x)
            {
                return x.EntityType == "order_status" && x.EntityId == order.Id && x.PayloadJson.Contains("accepted");
            }), "تحديث حالة الطلب يجب أن يُضاف تلقائياً لصندوق الصادر");
        }

        [Test]
        public void ProductRepository_UpdateOnlineFields_PersistsIntegerPiastersAndVisibility()
        {
            var prod = CreateTestProduct("شاي العروسة 250 جم", 5500, 4500, 20000);
            bool ok = ProductRepo.UpdateOnlineFields(prod.Id, false, true, "شاي ناعم فاخر عبوة 250 جرام", 6200);
            Assert.IsTrue(ok);

            var reloaded = ProductRepo.GetById(prod.Id);
            Assert.IsNotNull(reloaded);
            Assert.IsFalse(reloaded.IsOnline);
            Assert.IsTrue(reloaded.IsFeatured);
            Assert.AreEqual("شاي ناعم فاخر عبوة 250 جرام", reloaded.OnlineDescription);
            Assert.AreEqual(6200L, reloaded.ComparePricePiasters);
        }

        [Test]
        public void SyncEngine_DisabledConfigAndApiKeyMasking_BehaveSafely()
        {
            var syncRepo = new SyncRepository(ConnectionString);
            var catRepo = new CategoryRepository(ConnectionString);
            var engine = new SyncEngine(syncRepo, ProductRepo, catRepo);

            var cycle = engine.RunSyncCycle(true, false);
            Assert.IsFalse(cycle.Success);
            Assert.IsTrue(cycle.Skipped);

            var state = engine.SaveConfig(new SyncConfigUpdateRequest
            {
                OnlineStoreEnabled = true,
                StoreCloudId = "store-uuid-1234",
                SyncApiKey = "rfq_live_secret_key_987654321",
                OnlineStoreSlug = "Al-Nour-Market",
                SyncIntervalSeconds = 120
            });

            Assert.IsTrue(state.OnlineStoreEnabled);
            Assert.AreEqual("store-uuid-1234", state.StoreCloudId);
            Assert.AreEqual("al-nour-market", state.OnlineStoreSlug);
            Assert.AreEqual(120, state.SyncIntervalSeconds);
            Assert.IsTrue(state.HasApiKey);
            Assert.IsFalse(state.SyncApiKeyMasked.Contains("secret"), "مفتاح الـ API لا يظهر كاملاً أبداً للواجهة");
            Assert.IsTrue(state.SyncApiKeyMasked.Contains("••••"));

            // Saving masked key back must NOT overwrite real secret
            engine.SaveConfig(new SyncConfigUpdateRequest { SyncApiKey = state.SyncApiKeyMasked });
            Assert.AreEqual("rfq_live_secret_key_987654321", syncRepo.GetState("sync_api_key"));
        }

        [Test]
        public void FeatureRegistry_And_SecurityService_EnforceOnlineStoreRBAC()
        {
            var feature = FeatureRegistry.GetDefinition("feature_online_store");
            Assert.IsNotNull(feature, "ميزة feature_online_store يجب أن تكون مسجلة");
            Assert.IsFalse(feature.DefaultValue, "ميزة المتجر الإلكتروني تكون معطلة افتراضياً حتى تفعيل الاشتراك");

            var adminPerms = SecurityService.GetPermissionsForRole("admin");
            var cashierPerms = SecurityService.GetPermissionsForRole("cashier");

            Assert.IsTrue(adminPerms["online_store.manage"]);
            Assert.IsTrue(adminPerms["online_store.view_orders"]);
            Assert.IsTrue(adminPerms["online_store.process_orders"]);
            Assert.IsTrue(adminPerms["online_store.sync"]);
            Assert.IsTrue(adminPerms["online_store.images"]);

            Assert.IsFalse(cashierPerms["online_store.manage"], "الكاشير لا يملك صلاحية تغيير إعدادات المتجر الإلكتروني");
            Assert.IsFalse(cashierPerms["online_store.images"]);
            Assert.IsTrue(cashierPerms["online_store.view_orders"], "الكاشير يرى الطلبات الواردة لتجهيزها");
            Assert.IsTrue(cashierPerms["online_store.process_orders"]);
        }

        [Test]
        public void StockOutbox_DeduplicatesAndRespectsEnabledFlag_And_DailySalesSummaryComputesIntegerTotals()
        {
            var repo = new SyncRepository(ConnectionString);

            // When disabled (default), stock changes must NOT bloat sync_outbox
            repo.NotifyProductsStockChanged(new string[] { "p-1", "p-2", "p-1" });
            Assert.AreEqual(0, repo.GetPendingOutboxCount(), "لا يُسجل شيء في الصادر طالما المتجر الإلكتروني معطل");

            // When enabled, deduplicates product IDs cleanly
            repo.SetState("online_store_enabled", "1");
            repo.NotifyProductsStockChanged(new string[] { "p-1", "p-2", "p-1", "" });
            Assert.AreEqual(2, repo.GetPendingOutboxCount(), "يجب تسجيل الأصناف الفريدة فقط في الصادر");

            // Daily sales summary returns clean integer totals with zero errors on empty/populated DB
            var summary = repo.GetTodaySalesSummary();
            Assert.IsNotNull(summary);
            Assert.AreEqual(DateTime.Today.ToString("yyyy-MM-dd"), summary.SummaryDate);
            Assert.AreEqual(0L, summary.TotalSales);
            Assert.AreEqual(0, summary.InvoiceCount);
        }

        [Test]
        public void SyncEngine_RemainsCompletelyDormant_WhenOnlineStoreDisabled()
        {
            var repo = new SyncRepository(ConnectionString);
            var catRepo = new CategoryRepository(ConnectionString);
            var engine = new SyncEngine(repo, ProductRepo, catRepo);

            // Default state is disabled -> Start() MUST NOT spawn timer or mark running
            engine.Start();
            Assert.IsFalse(engine.IsRunning, "محرك المزامنة يجب ألا يعمل نهائياً طالما المتجر الإلكتروني غير مفعل");

            // Even if enabled in sync_state, disabling stops it immediately
            engine.SaveConfig(new SyncConfigUpdateRequest { OnlineStoreEnabled = false });
            Assert.IsFalse(engine.IsRunning);
        }

        [Test]
        public void IsExplicitStoreDeactivation_StrictlyDistinguishesBetweenNetworkLagAndAdministrativeShutoff()
        {
            // 1. Temporary network drops, timeouts, and DNS failures MUST NOT be treated as deactivation
            var offlineResp = new SyncHttpResponse { StatusCode = 0, IsSuccess = false, ErrorMessage = "تعذر الاتصال بالسيرفر السحابي: The operation has timed out" };
            Assert.IsFalse(SyncEngine.IsExplicitStoreDeactivation(offlineResp), "انقطاع أو تأخر النت يجب ألا يُعتبر إيقافاً للمتجر (حرمة الأوفلاين)");

            var server502Resp = new SyncHttpResponse { StatusCode = 502, IsSuccess = false, Body = "Bad Gateway" };
            Assert.IsFalse(SyncEngine.IsExplicitStoreDeactivation(server502Resp));

            var server500Resp = new SyncHttpResponse { StatusCode = 500, IsSuccess = false, Body = "Internal Server Error" };
            Assert.IsFalse(SyncEngine.IsExplicitStoreDeactivation(server500Resp));

            // 2. Explicit Cloud Administrative shutoff (403 STORE_LICENSE_INACTIVE / STORE_DISABLED) MUST be recognized
            var deactResp = new SyncHttpResponse
            {
                StatusCode = 403,
                IsSuccess = false,
                Body = "{\"error\":\"هذا المتجر الإلكتروني غير متاح حالياً. يرجى التواصل مع إدارة المحل.\",\"code\":\"STORE_LICENSE_INACTIVE\"}"
            };
            Assert.IsTrue(SyncEngine.IsExplicitStoreDeactivation(deactResp), "كود 403 STORE_LICENSE_INACTIVE يجب تمييزه كإيقاف إداري صريح");

            var disabledResp = new SyncHttpResponse
            {
                StatusCode = 403,
                IsSuccess = false,
                Body = "{\"error\":\"Store account is disabled or inactive\"}"
            };
            Assert.IsTrue(SyncEngine.IsExplicitStoreDeactivation(disabledResp), "رد تعطيل المتجر يجب تمييزه كإيقاف إداري صريح");

            var notFoundResp = new SyncHttpResponse
            {
                StatusCode = 404,
                IsSuccess = false,
                Body = "{\"error\":\"Store not found\"}"
            };
            Assert.IsTrue(SyncEngine.IsExplicitStoreDeactivation(notFoundResp));
        }

        [Test]
        public void HandleExplicitDeactivation_InstantlyDisablesState_And_FiresReactiveEvents()
        {
            var repo = new SyncRepository(ConnectionString);
            var catRepo = new CategoryRepository(ConnectionString);
            var engine = new SyncEngine(repo, ProductRepo, catRepo);

            repo.SetState("online_store_enabled", "1");
            repo.SetState("store_cloud_id", "test-store-1");
            repo.SetState("sync_api_key", "test-key-1");

            bool eventFired = false;
            SyncStateDto capturedState = null;
            engine.OnSyncStateChanged += delegate(SyncStateDto st)
            {
                eventFired = true;
                capturedState = st;
            };

            bool featureEventFired = false;
            string changedFeatureKey = "";
            bool changedFeatureVal = true;
            engine.OnFeatureStateChanged += delegate(string k, bool val)
            {
                featureEventFired = true;
                changedFeatureKey = k;
                changedFeatureVal = val;
            };

            // Trigger explicit deactivation (simulating cloud 403 response)
            engine.HandleExplicitDeactivation("HTTP 403 STORE_LICENSE_INACTIVE");

            // 1. Database state is immediately 0
            Assert.AreEqual("0", repo.GetState("online_store_enabled"));

            // 2. Engine is stopped
            Assert.IsFalse(engine.IsRunning);

            // 3. Reactive UI events fired
            Assert.IsTrue(eventFired, "يجب إطلاق حدث OnSyncStateChanged للواجهة فوراً");
            Assert.IsNotNull(capturedState);
            Assert.IsFalse(capturedState.OnlineStoreEnabled);

            Assert.IsTrue(featureEventFired, "يجب إطلاق حدث OnFeatureStateChanged للواجهة فوراً");
            Assert.AreEqual("feature_online_store", changedFeatureKey);
            Assert.IsFalse(changedFeatureVal);
        }
    }
}
