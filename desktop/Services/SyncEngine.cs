using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using RafiqPOS.Common;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class SyncEngine
    {
        private readonly SyncRepository _syncRepo;
        private readonly ProductRepository _productRepo;
        private readonly CategoryRepository _categoryRepo;
        private readonly SyncHttpClient _http;

        private readonly object _syncLock = new object();
        private Timer _timer;
        private Timer _ordersPulseTimer;
        private const int FAST_ORDER_PULSE_INTERVAL_MS = 15000;
        private const int SAFETY_PULL_WHEN_REALTIME_CONNECTED_SECONDS = 180;
        private const int FALLBACK_PULL_WHEN_REALTIME_DISCONNECTED_SECONDS = 15;
        private volatile bool _isRunning;
        private volatile bool _isSyncing;
        private volatile bool _isCashierBusy;
        private volatile bool _isRealtimeConnected;
        private DateTime _lastSafetyOrdersPullUtc = DateTime.MinValue;
        private int _consecutiveFailures;
        private DateTime _circuitOpenUntilUtc = DateTime.MinValue;
        private string _lastError = "";

        private class CachedRealtimeSessionInfo
        {
            public bool Enabled;
            public string WsUrl;
            public string StoreId;
            public string ExpiresAt;
            public DateTime ExpiresAtUtc;
        }

        private CachedRealtimeSessionInfo _cachedRealtimeSession;
        private readonly object _realtimeSessionLock = new object();

        public event Action<int> OnNewOnlineOrdersReceived;
        public event Action<OnlineOrdersSyncedEvent> OnOrdersSynced;
        public event Action<string, bool> OnFeatureStateChanged;
        public event Action<SyncStateDto> OnSyncStateChanged;

        public SyncEngine(
            SyncRepository syncRepo,
            ProductRepository productRepo,
            CategoryRepository categoryRepo,
            SyncHttpClient httpClient = null)
        {
            _syncRepo = syncRepo;
            _productRepo = productRepo;
            _categoryRepo = categoryRepo;
            _http = httpClient ?? new SyncHttpClient();
        }

        public bool IsSyncing
        {
            get { return _isSyncing; }
        }

        public string LastError
        {
            get { return _lastError; }
        }

        public void SetCashierBusy(bool busy)
        {
            _isCashierBusy = busy;
        }

        public void SetRealtimeConnected(bool connected)
        {
            _isRealtimeConnected = connected;
        }

        /// <summary>
        /// Exchanges the store's C#-only Sync API Key for a short-lived signed WebSocket session URL
        /// so WebView2 can connect to the StoreRealtimeHub Durable Object without ever seeing the API Key.
        /// Low-overhead in-memory token cache: returns in 0ms on cache hit, zero IPC blocking.
        /// </summary>
        public object RequestRealtimeSession()
        {
            if (!ShouldRunBackgroundSync())
            {
                return new { enabled = false, wsUrl = "", storeId = "", expiresAt = "" };
            }

            lock (_realtimeSessionLock)
            {
                if (_cachedRealtimeSession != null && _cachedRealtimeSession.Enabled && DateTime.UtcNow < _cachedRealtimeSession.ExpiresAtUtc)
                {
                    return new
                    {
                        enabled = _cachedRealtimeSession.Enabled,
                        wsUrl = _cachedRealtimeSession.WsUrl,
                        storeId = _cachedRealtimeSession.StoreId,
                        expiresAt = _cachedRealtimeSession.ExpiresAt
                    };
                }
            }

            string storeId = _syncRepo.GetState("store_cloud_id", "");
            string apiKey = _syncRepo.GetState("sync_api_key", "");
            string baseUrl = _syncRepo.GetState("cloud_api_url", "https://rafiq-store-api.rafiq-store-api.workers.dev/api/v1").TrimEnd('/');

            if (string.IsNullOrEmpty(storeId) || string.IsNullOrEmpty(apiKey))
            {
                return new { enabled = false, wsUrl = "", storeId = "", expiresAt = "" };
            }

            // Quick 3500ms timeout so offline or lagging networks never stall the desktop app or IPC queue
            SyncHttpResponse resp = _http.PostJson(baseUrl + "/sync/realtime-token", "{}", storeId, apiKey, 3500);
            if (!resp.IsSuccess || string.IsNullOrEmpty(resp.Body))
            {
                if (IsExplicitStoreDeactivation(resp))
                {
                    HandleExplicitDeactivation(resp.ErrorMessage ?? resp.Body);
                    return new { enabled = false, wsUrl = "", storeId = storeId, expiresAt = "", disabledByServer = true };
                }
                return new { enabled = false, wsUrl = "", storeId = storeId, expiresAt = "", error = resp.ErrorMessage ?? "تعذر الحصول على جلسة الاتصال الفوري." };
            }

            try
            {
                JObject obj = JObject.Parse(resp.Body);
                string wsUrl = obj["ws_url"] != null ? obj["ws_url"].ToString() : "";
                string expiresAt = obj["expires_at"] != null ? obj["expires_at"].ToString() : "";
                if (string.IsNullOrEmpty(wsUrl))
                {
                    return new { enabled = false, wsUrl = "", storeId = storeId, expiresAt = "" };
                }

                lock (_realtimeSessionLock)
                {
                    _cachedRealtimeSession = new CachedRealtimeSessionInfo
                    {
                        Enabled = true,
                        WsUrl = wsUrl,
                        StoreId = storeId,
                        ExpiresAt = expiresAt,
                        // Cloudflare signed tokens are valid for 6 hours; cache safely for 5 hours
                        ExpiresAtUtc = DateTime.UtcNow.AddHours(5)
                    };
                }

                return new
                {
                    enabled = true,
                    wsUrl = wsUrl,
                    storeId = storeId,
                    expiresAt = expiresAt
                };
            }
            catch (Exception ex)
            {
                Logger.Warn("SyncEngine parse realtime token warning: " + ex.Message);
                return new { enabled = false, wsUrl = "", storeId = storeId, expiresAt = "" };
            }
        }

        /// <summary>
        /// Starts the background sync scheduler safely. Never throws on startup.
        /// </summary>
        public bool IsRunning
        {
            get { return _isRunning; }
        }

        /// <summary>
        /// Checks whether the central feature flag (feature_online_store) is enabled on this POS.
        /// When Settings is unavailable (isolated unit tests), falls back to sync_state check.
        /// </summary>
        public bool IsOnlineStoreFeatureEnabled()
        {
            if (DatabaseService.Settings != null)
            {
                return DatabaseService.Settings.IsFeatureEnabled("feature_online_store");
            }
            return _syncRepo.GetState("online_store_enabled", "0") == "1";
        }

        /// <summary>
        /// Sync Engine MUST remain 100% dormant (zero timers, zero threads, zero network)
        /// unless BOTH feature_online_store AND online_store_enabled are explicitly ON.
        /// </summary>
        public bool ShouldRunBackgroundSync()
        {
            try
            {
                if (!IsOnlineStoreFeatureEnabled()) return false;
                return _syncRepo.GetState("online_store_enabled", "0") == "1";
            }
            catch
            {
                return false;
            }
        }

        public void Start()
        {
            if (_isRunning) return;
            if (!ShouldRunBackgroundSync())
            {
                // 100% dormant when Online Store feature or sync is disabled
                return;
            }
            _isRunning = true;

            try
            {
                // Crash-recovery: revert rows stuck in 'syncing' from unclean shutdown/power loss
                int recovered = _syncRepo.ResetStuckSyncingItems();
                if (recovered > 0)
                {
                    Logger.Info("SyncEngine: تم استعادة " + recovered + " عنصر عالق في قائمة انتظار المزامنة.");
                }
            }
            catch (Exception ex)
            {
                Logger.Warn("SyncEngine startup recovery warning: " + ex.Message);
            }

            int intervalMs = GetIntervalMilliseconds();
            // Full background housekeeping cycle (sales summaries, heartbeat, cleanup)
            _timer = new Timer(OnTimerElapsed, null, 25000, intervalMs);
            // Fast real-time pulse for incoming online orders, 2-way order status, and urgent stock deltas (every 8s)
            _ordersPulseTimer = new Timer(OnFastOrderPulseElapsed, null, 3000, FAST_ORDER_PULSE_INTERVAL_MS);
            // Sync real Desktop shop name & true-color receipt logo automatically on startup if changed
            TriggerStoreProfileSync();
        }

        public void Stop()
        {
            _isRunning = false;
            lock (_realtimeSessionLock)
            {
                _cachedRealtimeSession = null;
            }
            if (_timer != null)
            {
                try
                {
                    _timer.Dispose();
                }
                catch { }
                _timer = null;
            }
            if (_ordersPulseTimer != null)
            {
                try
                {
                    _ordersPulseTimer.Dispose();
                }
                catch { }
                _ordersPulseTimer = null;
            }
        }

        public void RestartTimer()
        {
            if (!_isRunning || _timer == null) return;
            int intervalMs = GetIntervalMilliseconds();
            try
            {
                _timer.Change(intervalMs, intervalMs);
            }
            catch { }
        }

        private int GetIntervalMilliseconds()
        {
            try
            {
                string raw = _syncRepo.GetState("sync_interval_seconds", "300");
                int sec;
                if (int.TryParse(raw, out sec) && sec >= 30 && sec <= 3600)
                {
                    return sec * 1000;
                }
            }
            catch { }
            return 300000; // Default 5 minutes
        }

        private void OnTimerElapsed(object state)
        {
            if (!_isRunning) return;
            if (!ShouldRunBackgroundSync())
            {
                Stop();
                return;
            }
            if (_isCashierBusy) return; // Active Cashier Guard: pause background sync during active checkout

            // Circuit breaker check
            if (_circuitOpenUntilUtc > DateTime.UtcNow)
            {
                return;
            }

            Thread bgThread = new Thread(delegate()
            {
                try
                {
                    RunSyncCycle(false, false);
                }
                catch (Exception ex)
                {
                    Logger.Warn("SyncEngine background cycle error: " + ex.Message);
                }
            });
            bgThread.IsBackground = true;
            bgThread.Priority = ThreadPriority.BelowNormal;
            bgThread.Start();
        }

        private void OnFastOrderPulseElapsed(object state)
        {
            if (!_isRunning) return;
            if (!ShouldRunBackgroundSync())
            {
                Stop();
                return;
            }
            if (_circuitOpenUntilUtc > DateTime.UtcNow)
            {
                return;
            }

            Thread pulseThread = new Thread(delegate()
            {
                try
                {
                    RunFastOrderPulse(false);
                }
                catch (Exception ex)
                {
                    Logger.Warn("SyncEngine fast order pulse error: " + ex.Message);
                }
            });
            pulseThread.IsBackground = true;
            pulseThread.Priority = ThreadPriority.BelowNormal;
            pulseThread.Start();
        }

        /// <summary>
        /// Adaptive ultra-lightweight pulse:
        /// - When called with forceOrderPull=true (triggered instantly by Durable Object WebSocket push or POS action):
        ///   immediately flushes pending outbox and pulls orders in < 200ms.
        /// - When called by the 15s background timer (forceOrderPull=false):
        ///   * If WebSocket is CONNECTED and outbox is empty: skips HTTP completely for 180s (saves ~95% Cloudflare Free quota!).
        ///   * If outbox has pending stock/status changes: flushes them within 15s.
        ///   * If WebSocket is DISCONNECTED: automatically falls back to 15s safety polling.
        /// </summary>
        public void RunFastOrderPulse(bool forceOrderPull = true)
        {
            if (!Monitor.TryEnter(_syncLock))
            {
                return;
            }

            try
            {
                if (!ShouldRunBackgroundSync())
                {
                    Stop();
                    return;
                }

                string storeId = _syncRepo.GetState("store_cloud_id", "");
                string apiKey = _syncRepo.GetState("sync_api_key", "");
                string baseUrl = _syncRepo.GetState("cloud_api_url", "https://rafiq-store-api.rafiq-store-api.workers.dev/api/v1").TrimEnd('/');

                if (string.IsNullOrEmpty(storeId) || string.IsNullOrEmpty(apiKey))
                {
                    return;
                }

                int pendingOutbox = _syncRepo.GetPendingOutboxCount();
                long secondsSincePull = (long)((DateTime.UtcNow - _lastSafetyOrdersPullUtc).Ticks / TimeSpan.TicksPerSecond);
                int targetPullInterval = _isRealtimeConnected
                    ? SAFETY_PULL_WHEN_REALTIME_CONNECTED_SECONDS
                    : FALLBACK_PULL_WHEN_REALTIME_DISCONNECTED_SECONDS;
                bool shouldPullOrders = forceOrderPull || secondsSincePull >= targetPullInterval;

                // Zero HTTP requests when WebSocket is connected, idle, and outbox is empty!
                if (!shouldPullOrders && pendingOutbox == 0)
                {
                    return;
                }

                // 1. If there are pending outbox deltas (order status updates or stock changes), flush them rapidly
                if (pendingOutbox > 0 && !_isCashierBusy)
                {
                    try
                    {
                        var tempResult = new SyncCycleResult();
                        ProcessOutboxInternal(baseUrl, storeId, apiKey, tempResult);
                    }
                    catch (Exception outboxEx)
                    {
                        Logger.Warn("SyncEngine fast pulse outbox warning: " + outboxEx.Message);
                    }
                }

                // 2. Pull pending incoming orders & 2-way Web Dashboard status updates ONLY when triggered or safety interval elapsed
                List<OnlineOrderNotificationDto> newlyInserted = null;
                int updatedCount = 0;
                if (shouldPullOrders)
                {
                    bool networkOk = PullPendingOrdersDetailed(baseUrl, storeId, apiKey, out newlyInserted, out updatedCount);
                    if (!networkOk)
                    {
                        RecordFailure("تعذر الاتصال بالسحابة أثناء فحص الطلبات الفوري.");
                        return;
                    }
                    _lastSafetyOrdersPullUtc = DateTime.UtcNow;
                }

                _consecutiveFailures = 0;
                _circuitOpenUntilUtc = DateTime.MinValue;
                _lastError = "";

                string nowIso = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ");
                if ((newlyInserted != null && newlyInserted.Count > 0) || updatedCount > 0 || pendingOutbox > 0)
                {
                    _syncRepo.SetState("last_sync_timestamp", nowIso);
                }

                if ((newlyInserted != null && newlyInserted.Count > 0) || updatedCount > 0)
                {
                    EmitOrdersSyncedEvent(newlyInserted, updatedCount, nowIso);
                }
            }
            catch (Exception ex)
            {
                Logger.Warn("SyncEngine fast pulse error: " + ex.Message);
            }
            finally
            {
                Monitor.Exit(_syncLock);
            }
        }

        /// <summary>
        /// Strictly differentiates between explicit administrative cloud deactivation (HTTP 403 STORE_LICENSE_INACTIVE / STORE_DISABLED)
        /// versus normal offline / temporary network lag (timeouts, DNS drop, 5xx server issues).
        /// When offline or server lag: store remains active locally (offline-first).
        /// When explicit deactivation: store is immediately disabled locally and UI is notified.
        /// </summary>
        public static bool IsExplicitStoreDeactivation(SyncHttpResponse resp)
        {
            if (resp == null) return false;
            if (resp.StatusCode == 403)
            {
                string body = (resp.Body ?? "").Trim();
                string err = (resp.ErrorMessage ?? "").Trim();
                if (body.IndexOf("STORE_LICENSE_INACTIVE", StringComparison.OrdinalIgnoreCase) >= 0 ||
                    body.IndexOf("STORE_DISABLED", StringComparison.OrdinalIgnoreCase) >= 0 ||
                    body.IndexOf("disabled or inactive", StringComparison.OrdinalIgnoreCase) >= 0 ||
                    err.IndexOf("STORE_LICENSE_INACTIVE", StringComparison.OrdinalIgnoreCase) >= 0 ||
                    err.IndexOf("STORE_DISABLED", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    return true;
                }
            }
            if (resp.StatusCode == 404)
            {
                string body = (resp.Body ?? "").Trim();
                if (body.IndexOf("Store not found", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    return true;
                }
            }
            return false;
        }

        public void HandleExplicitDeactivation(string reason)
        {
            try
            {
                Logger.Warn("SyncEngine: رصد إيقاف المتجر الإلكتروني السحابي من السيرفر المركزي: " + reason);
                _syncRepo.SetState("online_store_enabled", "0");
                _lastError = "تم إيقاف المتجر الإلكتروني السحابي من قبل الإدارة.";
                lock (_realtimeSessionLock)
                {
                    _cachedRealtimeSession = null;
                }

                if (DatabaseService.Settings != null)
                {
                    try
                    {
                        DatabaseService.Settings.SetFeatureFlag("feature_online_store", false);
                    }
                    catch (Exception setEx)
                    {
                        Logger.Warn("SyncEngine SetFeatureFlag warning: " + setEx.Message);
                    }
                }

                Stop();

                SyncStateDto state = GetState();
                if (OnSyncStateChanged != null)
                {
                    try { OnSyncStateChanged(state); }
                    catch { }
                }

                if (OnFeatureStateChanged != null)
                {
                    try { OnFeatureStateChanged("feature_online_store", false); }
                    catch { }
                }

                // Trigger background license verification to align full license state with central server
                if (DatabaseService.License != null)
                {
                    ThreadPool.QueueUserWorkItem(delegate(object _)
                    {
                        try { DatabaseService.License.VerifyLicenseOnline(); }
                        catch { }
                    });
                }
            }
            catch (Exception ex)
            {
                Logger.Warn("SyncEngine HandleExplicitDeactivation error: " + ex.Message);
            }
        }

        /// <summary>
        /// Gets the complete current state of the online store sync subsystem for UI display.
        /// </summary>
        public SyncStateDto GetState()
        {
            var states = _syncRepo.GetAllStates();
            string enabled = states.ContainsKey("online_store_enabled") ? states["online_store_enabled"] : "0";
            string storeId = states.ContainsKey("store_cloud_id") ? states["store_cloud_id"] : "";
            string apiKey = states.ContainsKey("sync_api_key") ? states["sync_api_key"] : "";
            string slug = states.ContainsKey("online_store_slug") ? states["online_store_slug"] : "";
            string apiUrl = states.ContainsKey("cloud_api_url") ? states["cloud_api_url"] : "https://rafiq-store-api.rafiq-store-api.workers.dev/api/v1";
            string lastSync = states.ContainsKey("last_sync_timestamp") ? states["last_sync_timestamp"] : "";
            string intervalStr = states.ContainsKey("sync_interval_seconds") ? states["sync_interval_seconds"] : "300";

            int interval = 300;
            int.TryParse(intervalStr, out interval);

            string maskedKey = "";
            if (!string.IsNullOrEmpty(apiKey))
            {
                if (apiKey.Length <= 8) maskedKey = "****";
                else maskedKey = apiKey.Substring(0, 4) + "••••••••" + apiKey.Substring(apiKey.Length - 4);
            }

            return new SyncStateDto
            {
                OnlineStoreEnabled = enabled == "1",
                StoreCloudId = storeId,
                SyncApiKeyMasked = maskedKey,
                HasApiKey = !string.IsNullOrEmpty(apiKey),
                OnlineStoreSlug = slug,
                CloudApiUrl = apiUrl,
                LastSyncTimestamp = lastSync,
                SyncIntervalSeconds = interval,
                PendingOutboxCount = _syncRepo.GetPendingOutboxCount(),
                FailedOutboxCount = _syncRepo.GetFailedOutboxCount(),
                NewOrdersCount = _syncRepo.GetNewOrdersCount(),
                IsSyncing = _isSyncing,
                LastError = _lastError
            };
        }

        /// <summary>
        /// Saves cloud connection configuration safely. Never overwrites existing API key if blank/masked.
        /// </summary>
        public SyncStateDto SaveConfig(SyncConfigUpdateRequest req)
        {
            if (req == null) throw new ArgumentNullException("req");

            if (req.OnlineStoreEnabled.HasValue)
            {
                _syncRepo.SetState("online_store_enabled", req.OnlineStoreEnabled.Value ? "1" : "0");
                if (DatabaseService.Settings != null)
                {
                    try { DatabaseService.Settings.SetFeatureFlag("feature_online_store", req.OnlineStoreEnabled.Value); }
                    catch { }
                }
                if (OnFeatureStateChanged != null)
                {
                    try { OnFeatureStateChanged("feature_online_store", req.OnlineStoreEnabled.Value); }
                    catch { }
                }
            }
            if (req.StoreCloudId != null)
            {
                _syncRepo.SetState("store_cloud_id", req.StoreCloudId.Trim());
            }
            if (!string.IsNullOrWhiteSpace(req.SyncApiKey) && !req.SyncApiKey.Contains("••••"))
            {
                _syncRepo.SetState("sync_api_key", req.SyncApiKey.Trim());
            }
            if (req.OnlineStoreSlug != null)
            {
                _syncRepo.SetState("online_store_slug", req.OnlineStoreSlug.Trim().ToLowerInvariant());
            }
            if (!string.IsNullOrWhiteSpace(req.CloudApiUrl))
            {
                _syncRepo.SetState("cloud_api_url", req.CloudApiUrl.Trim().TrimEnd('/'));
            }
            if (req.SyncIntervalSeconds.HasValue && req.SyncIntervalSeconds.Value >= 30 && req.SyncIntervalSeconds.Value <= 3600)
            {
                _syncRepo.SetState("sync_interval_seconds", req.SyncIntervalSeconds.Value.ToString());
                RestartTimer();
            }

            // Reset circuit breaker after config update
            _consecutiveFailures = 0;
            _circuitOpenUntilUtc = DateTime.MinValue;
            _lastError = "";

            // Dynamically start or completely stop background timer based on enabled state
            if (ShouldRunBackgroundSync())
            {
                if (!_isRunning) Start();
            }
            else
            {
                Stop();
            }

            return GetState();
        }

        /// <summary>
        /// Runs a complete sync cycle. Thread-safe and non-overlapping.
        /// </summary>
        public SyncCycleResult RunSyncCycle(
            bool isManual = true,
            bool fullCatalogPush = false,
            List<string> categoryIds = null,
            bool onlyInStock = true,
            bool onlyOnline = true,
            bool pruneOutOfStock = true,
            List<string> excludedProductIds = null,
            List<string> selectedProductIds = null)
        {
            var result = new SyncCycleResult();

            if (!Monitor.TryEnter(_syncLock))
            {
                result.Success = false;
                result.Skipped = true;
                result.Message = "عملية مزامنة أخرى قيد التنفيذ حالياً.";
                return result;
            }

            try
            {
                _isSyncing = true;

                if (isManual)
                {
                    _consecutiveFailures = 0;
                    _circuitOpenUntilUtc = DateTime.MinValue;
                }

                if (!IsOnlineStoreFeatureEnabled())
                {
                    Stop();
                    result.Success = false;
                    result.Skipped = true;
                    result.Message = "ميزة المتجر الإلكتروني غير مفعلة على هذا الجهاز.";
                    return result;
                }

                string enabled = _syncRepo.GetState("online_store_enabled", "0");
                if (enabled != "1")
                {
                    Stop();
                    result.Success = false;
                    result.Skipped = true;
                    result.Message = "المتجر الإلكتروني غير مفعل في إعدادات المزامنة.";
                    return result;
                }

                string storeId = _syncRepo.GetState("store_cloud_id", "");
                string apiKey = _syncRepo.GetState("sync_api_key", "");
                string baseUrl = _syncRepo.GetState("cloud_api_url", "https://rafiq-store-api.rafiq-store-api.workers.dev/api/v1").TrimEnd('/');

                if (string.IsNullOrEmpty(storeId) || string.IsNullOrEmpty(apiKey))
                {
                    result.Success = false;
                    result.Skipped = true;
                    result.Message = "يرجى إدخال معرف المتجر السحابي (Store ID) ومفتاح المزامنة (API Key) أولاً.";
                    _lastError = result.Message;
                    return result;
                }

                // 1. Quick Health Probe (5s timeout) so offline stores don't burn outbox retries
                SyncHttpResponse health = _http.GetJson(baseUrl + "/health", null, null, 5000);
                if (!health.IsSuccess)
                {
                    RecordFailure("السحابة غير متاحة حالياً (وضع أوفلاين): " + health.ErrorMessage);
                    result.Success = false;
                    result.Message = _lastError;
                    return result;
                }

                // 2. Sync real Desktop store identity (store_name, phone, address, true-color receipt logo)
                SyncStoreProfileInternal(baseUrl, storeId, apiKey, fullCatalogPush);

                // 2b. Full catalog push if requested
                if (fullCatalogPush)
                {
                    int pushed = PushFullCatalogInternal(
                        baseUrl,
                        storeId,
                        apiKey,
                        result,
                        categoryIds,
                        onlyInStock,
                        onlyOnline,
                        pruneOutOfStock,
                        excludedProductIds,
                        selectedProductIds);
                    result.CatalogSyncedCount += pushed;
                }

                // 3. Process pending outbox items (catalog deltas + order status updates)
                ProcessOutboxInternal(baseUrl, storeId, apiKey, result);

                // 4. Download new pending online orders & 2-way Web Dashboard status updates
                List<OnlineOrderNotificationDto> newlyInsertedOrders;
                int updatedExistingOrders;
                if (PullPendingOrdersDetailed(baseUrl, storeId, apiKey, out newlyInsertedOrders, out updatedExistingOrders))
                {
                    _lastSafetyOrdersPullUtc = DateTime.UtcNow;
                }
                int newOrders = newlyInsertedOrders != null ? newlyInsertedOrders.Count : 0;
                result.NewOrdersDownloaded = newOrders;

                if (newOrders > 0 || updatedExistingOrders > 0)
                {
                    EmitOrdersSyncedEvent(newlyInsertedOrders, updatedExistingOrders, DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"));
                }

                // 4b. Pull 2-way catalog updates from Web Dashboard (descriptions, online status, featured status)
                int downloadedCatalogUpdates = PullCloudCatalogUpdatesDetailed(baseUrl, storeId, apiKey);
                result.CatalogUpdatesDownloaded = downloadedCatalogUpdates;

                // 5. Upload aggregate-only POS sales summaries (30-day backfill once/day or on full push; today on routine ticks)
                UploadDailySalesSummaryInternal(baseUrl, storeId, apiKey, fullCatalogPush);

                // 6. Heartbeat & finish
                _http.PostJson(baseUrl + "/sync/heartbeat", "{}", storeId, apiKey, 10000);

                string nowIso = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ");
                _syncRepo.SetState("last_sync_timestamp", nowIso);
                _syncRepo.PurgeOldSyncedOutbox(7);

                _consecutiveFailures = 0;
                _circuitOpenUntilUtc = DateTime.MinValue;
                _lastError = "";

                result.Success = true;
                result.SyncedAt = nowIso;
                result.Message = "تمت المزامنة بنجاح.";
                return result;
            }
            catch (Exception ex)
            {
                RecordFailure("خطأ أثناء المزامنة: " + ex.Message);
                result.Success = false;
                result.Message = _lastError;
                return result;
            }
            finally
            {
                _isSyncing = false;
                Monitor.Exit(_syncLock);
            }
        }

        private void RecordFailure(string error)
        {
            _lastError = error;
            _consecutiveFailures++;
            if (_consecutiveFailures >= 5)
            {
                // Circuit breaker opens for 30 minutes after 5 consecutive failures
                _circuitOpenUntilUtc = DateTime.UtcNow.AddMinutes(30);
                Logger.Warn("SyncEngine: تم فتح قاطع الدائرة (Circuit Breaker) لمدة 30 دقيقة بعد 5 محاولات فاشلة.");
            }
        }

        private static bool IsDemoOrStressId(string id)
        {
            if (string.IsNullOrEmpty(id)) return false;
            return id.StartsWith("demo_", StringComparison.OrdinalIgnoreCase) ||
                   id.StartsWith("stress_", StringComparison.OrdinalIgnoreCase);
        }

        private static bool IsEligibleForCloudStore(Product p)
        {
            if (p == null) return false;
            if (!p.IsActive || !p.IsOnline) return false;
            if (p.StockQuantityMilli <= 0) return false;
            if (IsDemoOrStressId(p.Id)) return false;
            return true;
        }

        private int PushFullCatalogInternal(
            string baseUrl,
            string storeId,
            string apiKey,
            SyncCycleResult result,
            List<string> categoryIds = null,
            bool onlyInStock = true,
            bool onlyOnline = true,
            bool pruneOutOfStock = true,
            List<string> excludedProductIds = null,
            List<string> selectedProductIds = null)
        {
            var allCategories = _categoryRepo != null ? _categoryRepo.GetAll(false) : new List<Category>();
            var categories = new List<Category>();

            HashSet<string> targetCatSet = null;
            if (categoryIds != null && categoryIds.Count > 0)
            {
                targetCatSet = new HashSet<string>(categoryIds, StringComparer.OrdinalIgnoreCase);
            }

            for (int i = 0; i < allCategories.Count; i++)
            {
                var c = allCategories[i];
                if (c == null) continue;
                if (targetCatSet != null && !targetCatSet.Contains(c.Id))
                {
                    continue; // Skip categories not in selected list
                }
                categories.Add(c);
            }

            // Fetch products according to filters
            var products = _productRepo != null
                ? _productRepo.GetProductsForCloudSync(onlyOnline, onlyInStock, categoryIds, excludedProductIds, selectedProductIds)
                : new List<Product>();

            var catPayload = new List<object>();
            for (int i = 0; i < categories.Count; i++)
            {
                var c = categories[i];
                if (c == null || IsDemoOrStressId(c.Id)) continue;
                catPayload.Add(new
                {
                    id = c.Id,
                    name = c.Name,
                    parent_id = (string)null,
                    sort_order = c.DisplayOrder,
                    is_active = c.IsActive ? 1 : 0,
                    is_online = c.IsOnline ? 1 : 0
                });
            }

            // Track IDs of all eligible products so stale/out-of-stock rows in Cloud D1 can be pruned cleanly
            var keepProductIds = new List<string>(products.Count);
            for (int i = 0; i < products.Count; i++)
            {
                keepProductIds.Add(products[i].Id);
            }

            // Batch products in chunks of 150 (D1 executes them in atomic 50-statement batches)
            int totalSynced = 0;
            const int batchSize = 150;

            if (products.Count == 0 && catPayload.Count > 0)
            {
                string body = JsonConvert.SerializeObject(new { categories = catPayload, products = new object[0] });
                SyncHttpResponse resp = _http.PostJson(baseUrl + "/sync/catalog", body, storeId, apiKey, 30000);
                if (!resp.IsSuccess) throw new Exception("فشل مزامنة الأقسام: " + resp.ErrorMessage);
            }
            else
            {
                for (int offset = 0; offset < products.Count; offset += batchSize)
                {
                    var prodBatch = new List<object>();
                    int end = Math.Min(offset + batchSize, products.Count);
                    for (int i = offset; i < end; i++)
                    {
                        prodBatch.Add(BuildCloudProductDto(products[i]));
                    }

                    var payload = new
                    {
                        categories = offset == 0 ? catPayload : new List<object>(),
                        products = prodBatch
                    };

                    string json = JsonConvert.SerializeObject(payload);
                    SyncHttpResponse resp = _http.PostJson(baseUrl + "/sync/catalog", json, storeId, apiKey, 30000);
                    if (!resp.IsSuccess)
                    {
                        throw new Exception("فشل مزامنة الكتالوج: " + resp.ErrorMessage);
                    }

                    totalSynced += prodBatch.Count;
                }
            }

            // Prune only when doing a full catalog push (no category filter) and pruning is enabled.
            // When uploading selective categories, prune MUST NOT run so products in other categories are preserved on Cloud D1!
            bool canPrune = pruneOutOfStock && (categoryIds == null || categoryIds.Count == 0) && (selectedProductIds == null || selectedProductIds.Count == 0);
            if (canPrune)
            {
                try
                {
                    string pruneBody = JsonConvert.SerializeObject(new { keep_product_ids = keepProductIds });
                    SyncHttpResponse pruneResp = _http.PostJson(baseUrl + "/sync/catalog/prune", pruneBody, storeId, apiKey, 30000);
                    if (pruneResp.IsSuccess && !string.IsNullOrEmpty(pruneResp.Body) && result != null)
                    {
                        JObject pruneObj = JObject.Parse(pruneResp.Body);
                        JToken prunedTok = pruneObj["total_pruned"];
                        if (prunedTok != null && prunedTok.Type == JTokenType.Integer)
                        {
                            result.PrunedOutOfStockCount += prunedTok.Value<int>();
                        }
                    }
                }
                catch (Exception ex)
                {
                    Logger.Warn("SyncEngine catalog prune warning: " + ex.Message);
                }
            }

            return totalSynced;
        }

        private void ProcessOutboxInternal(string baseUrl, string storeId, string apiKey, SyncCycleResult result)
        {
            // Drain up to 5 batches (500 outbox entries) in a single sync cycle so bulk edits clear smoothly
            for (int pass = 0; pass < 5; pass++)
            {
                var items = _syncRepo.GetPendingOutboxItems(100);
                if (items.Count == 0) return;

                var catalogOutboxIds = new List<string>();
                var productIdsToSync = new HashSet<string>();
                var categoryIdsToSync = new HashSet<string>();
                var stockOutboxIds = new List<string>();
                var stockProductIdsToSync = new HashSet<string>();
                var orderStatusItems = new List<SyncOutboxItem>();

                for (int i = 0; i < items.Count; i++)
                {
                    var item = items[i];
                    if (item.EntityType == "product")
                    {
                        catalogOutboxIds.Add(item.Id);
                        productIdsToSync.Add(item.EntityId);
                    }
                    else if (item.EntityType == "category")
                    {
                        catalogOutboxIds.Add(item.Id);
                        categoryIdsToSync.Add(item.EntityId);
                    }
                    else if (item.EntityType == "stock")
                    {
                        stockOutboxIds.Add(item.Id);
                        stockProductIdsToSync.Add(item.EntityId);
                    }
                    else if (item.EntityType == "order_status")
                    {
                        orderStatusItems.Add(item);
                    }
                }

                // 1. Sync catalog deltas (only upload in-stock online active products; remove/hide out-of-stock or disabled)
                if (catalogOutboxIds.Count > 0)
                {
                    _syncRepo.MarkOutboxItemsStatus(catalogOutboxIds, "syncing");

                    var catPayloads = new List<object>();
                    foreach (string catId in categoryIdsToSync)
                    {
                        if (IsDemoOrStressId(catId)) continue;
                        var cat = _categoryRepo != null ? _categoryRepo.GetById(catId) : null;
                        if (cat != null)
                        {
                            catPayloads.Add(new
                            {
                                id = cat.Id,
                                name = cat.Name,
                                parent_id = (string)null,
                                sort_order = cat.DisplayOrder,
                                is_active = cat.IsActive ? 1 : 0,
                                is_online = cat.IsOnline ? 1 : 0
                            });
                        }
                    }

                    var prodPayloads = new List<object>();
                    var removeProductIds = new List<string>();
                    foreach (string prodId in productIdsToSync)
                    {
                        if (IsDemoOrStressId(prodId)) continue;
                        var prod = _productRepo != null ? _productRepo.GetById(prodId) : null;
                        if (IsEligibleForCloudStore(prod))
                        {
                            prodPayloads.Add(BuildCloudProductDto(prod));
                        }
                        else
                        {
                            removeProductIds.Add(prodId);
                        }
                    }

                    if (catPayloads.Count > 0 || prodPayloads.Count > 0 || removeProductIds.Count > 0)
                    {
                        string json = JsonConvert.SerializeObject(new
                        {
                            categories = catPayloads,
                            products = prodPayloads,
                            remove_product_ids = removeProductIds
                        });
                        SyncHttpResponse resp = _http.PostJson(baseUrl + "/sync/catalog", json, storeId, apiKey, 30000);
                        if (resp.IsSuccess)
                        {
                            _syncRepo.MarkOutboxItemsStatus(catalogOutboxIds, "synced");
                            result.CatalogSyncedCount += prodPayloads.Count + catPayloads.Count;
                            try
                            {
                                if (!string.IsNullOrEmpty(resp.Body))
                                {
                                    JObject respObj = JObject.Parse(resp.Body);
                                    JToken remTok = respObj["removed_products"];
                                    if (remTok != null && remTok.Type == JTokenType.Integer)
                                    {
                                        result.PrunedOutOfStockCount += remTok.Value<int>();
                                    }
                                }
                            }
                            catch { }
                        }
                        else
                        {
                            _syncRepo.MarkOutboxItemsStatus(catalogOutboxIds, "failed", resp.ErrorMessage);
                            if (IsExplicitStoreDeactivation(resp))
                            {
                                HandleExplicitDeactivation(resp.ErrorMessage ?? resp.Body);
                                return;
                            }
                            throw new Exception("فشل رفع تغييرات الكتالوج: " + resp.ErrorMessage);
                        }
                    }
                    else
                    {
                        _syncRepo.MarkOutboxItemsStatus(catalogOutboxIds, "synced");
                    }
                }

                // 2. Sync coalesced stock level updates (remove out-of-stock; auto-upsert newly restocked items)
                if (stockOutboxIds.Count > 0)
                {
                    _syncRepo.MarkOutboxItemsStatus(stockOutboxIds, "syncing");
                    var stockItems = new List<object>();
                    var removeStockProductIds = new List<string>();

                    foreach (string prodId in stockProductIdsToSync)
                    {
                        // Skip if already synced in full catalog delta above
                        if (productIdsToSync.Contains(prodId)) continue;
                        if (IsDemoOrStressId(prodId)) continue;

                        var prod = _productRepo != null ? _productRepo.GetById(prodId) : null;
                        if (IsEligibleForCloudStore(prod))
                        {
                            stockItems.Add(new
                            {
                                product_id = prod.Id,
                                stock_quantity = prod.StockQuantityMilli
                            });
                        }
                        else
                        {
                            removeStockProductIds.Add(prodId);
                        }
                    }

                    if (stockItems.Count > 0 || removeStockProductIds.Count > 0)
                    {
                        string stockJson = JsonConvert.SerializeObject(new
                        {
                            items = stockItems,
                            remove_product_ids = removeStockProductIds
                        });
                        SyncHttpResponse stockResp = _http.PostJson(baseUrl + "/sync/stock", stockJson, storeId, apiKey, 30000);
                        if (stockResp.IsSuccess)
                        {
                            _syncRepo.MarkOutboxItemsStatus(stockOutboxIds, "synced");
                            result.StockSyncedCount += stockItems.Count;

                            // If any restocked product was previously pruned when out-of-stock, upload its full DTO now
                            try
                            {
                                if (!string.IsNullOrEmpty(stockResp.Body))
                                {
                                    JObject stockObj = JObject.Parse(stockResp.Body);
                                    JToken remTok = stockObj["removed_count"];
                                    if (remTok != null && remTok.Type == JTokenType.Integer)
                                    {
                                        result.PrunedOutOfStockCount += remTok.Value<int>();
                                    }

                                    JToken missingTok = stockObj["missing_product_ids"];
                                    if (missingTok != null && missingTok.Type == JTokenType.Array)
                                    {
                                        var missingIds = missingTok.ToObject<List<string>>();
                                        if (missingIds != null && missingIds.Count > 0)
                                        {
                                            var restockedPayloads = new List<object>();
                                            for (int m = 0; m < missingIds.Count; m++)
                                            {
                                                var restockedProd = _productRepo != null ? _productRepo.GetById(missingIds[m]) : null;
                                                if (IsEligibleForCloudStore(restockedProd))
                                                {
                                                    restockedPayloads.Add(BuildCloudProductDto(restockedProd));
                                                }
                                            }
                                            if (restockedPayloads.Count > 0)
                                            {
                                                string upsertJson = JsonConvert.SerializeObject(new
                                                {
                                                    categories = new object[0],
                                                    products = restockedPayloads
                                                });
                                                SyncHttpResponse upsertResp = _http.PostJson(baseUrl + "/sync/catalog", upsertJson, storeId, apiKey, 30000);
                                                if (upsertResp.IsSuccess)
                                                {
                                                    result.CatalogSyncedCount += restockedPayloads.Count;
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            catch (Exception ex)
                            {
                                Logger.Warn("SyncEngine restocked product upsert warning: " + ex.Message);
                            }
                        }
                        else
                        {
                            _syncRepo.MarkOutboxItemsStatus(stockOutboxIds, "failed", stockResp.ErrorMessage);
                            if (IsExplicitStoreDeactivation(stockResp))
                            {
                                HandleExplicitDeactivation(stockResp.ErrorMessage ?? stockResp.Body);
                                return;
                            }
                        }
                    }
                    else
                    {
                        _syncRepo.MarkOutboxItemsStatus(stockOutboxIds, "synced");
                    }
                }

                // 3. Sync order status updates
                for (int i = 0; i < orderStatusItems.Count; i++)
                {
                    var statusItem = orderStatusItems[i];
                    var idList = new List<string> { statusItem.Id };
                    _syncRepo.MarkOutboxItemsStatus(idList, "syncing");

                    SyncHttpResponse resp = _http.PostJson(baseUrl + "/sync/orders/status", statusItem.PayloadJson, storeId, apiKey, 15000);
                    if (resp.IsSuccess)
                    {
                        _syncRepo.MarkOutboxItemsStatus(idList, "synced");
                        result.OrderStatusesUploaded++;
                    }
                    else
                    {
                        _syncRepo.MarkOutboxItemsStatus(idList, "failed", resp.ErrorMessage);
                        if (IsExplicitStoreDeactivation(resp))
                        {
                            HandleExplicitDeactivation(resp.ErrorMessage ?? resp.Body);
                            return;
                        }
                    }
                }

                // If fewer than 100 items were returned, outbox is completely drained
                if (items.Count < 100) break;
            }
        }

        private void UploadDailySalesSummaryInternal(string baseUrl, string storeId, string apiKey, bool includeBackfill)
        {
            try
            {
                string todayKey = DateTime.Today.ToString("yyyy-MM-dd");
                string lastBackfillDate = _syncRepo.GetState("last_sales_backfill_date", "");
                bool shouldBackfill = includeBackfill || (lastBackfillDate != todayKey);

                if (shouldBackfill)
                {
                    var summaries = _syncRepo.GetRecentDailySalesSummaries(30);
                    if (summaries == null || summaries.Count == 0)
                    {
                        _syncRepo.SetState("last_sales_backfill_date", todayKey);
                        return;
                    }

                    // Send all 30-day summaries in ONE single batch HTTP POST instead of 30 sequential requests
                    string batchJson = JsonConvert.SerializeObject(new { summaries = summaries });
                    SyncHttpResponse resp = _http.PostJson(baseUrl + "/sync/sales-summary", batchJson, storeId, apiKey, 25000);
                    if (resp.IsSuccess)
                    {
                        _syncRepo.SetState("last_sales_backfill_date", todayKey);
                    }
                    else
                    {
                        Logger.Warn("SyncEngine daily sales summary batch warning: " + resp.ErrorMessage);
                    }
                }
                else
                {
                    var summary = _syncRepo.GetTodaySalesSummary();
                    if (summary == null) return;

                    string json = JsonConvert.SerializeObject(summary);
                    SyncHttpResponse resp = _http.PostJson(baseUrl + "/sync/sales-summary", json, storeId, apiKey, 15000);
                    if (!resp.IsSuccess)
                    {
                        Logger.Warn("SyncEngine daily sales summary warning: " + resp.ErrorMessage);
                    }
                }
            }
            catch (Exception ex)
            {
                Logger.Warn("SyncEngine daily sales summary error: " + ex.Message);
            }
        }

        private void EmitOrdersSyncedEvent(List<OnlineOrderNotificationDto> newlyInserted, int updatedCount, string syncedAtIso)
        {
            int newCount = newlyInserted != null ? newlyInserted.Count : 0;
            if (newCount > 0 && OnNewOnlineOrdersReceived != null)
            {
                try
                {
                    OnNewOnlineOrdersReceived(newCount);
                }
                catch { }
            }

            if (OnOrdersSynced != null)
            {
                try
                {
                    var evt = new OnlineOrdersSyncedEvent
                    {
                        NewOrdersCount = newCount,
                        UpdatedOrdersCount = updatedCount,
                        TotalPendingNewCount = _syncRepo.GetNewOrdersCount(),
                        SyncedAt = syncedAtIso,
                        NewOrders = newlyInserted ?? new List<OnlineOrderNotificationDto>()
                    };
                    OnOrdersSynced(evt);
                }
                catch { }
            }
        }

        private bool PullPendingOrdersDetailed(
            string baseUrl,
            string storeId,
            string apiKey,
            out List<OnlineOrderNotificationDto> newlyInserted,
            out int updatedCount)
        {
            newlyInserted = new List<OnlineOrderNotificationDto>();
            updatedCount = 0;

            SyncHttpResponse resp = _http.GetJson(baseUrl + "/sync/orders/pending", storeId, apiKey, 10000);
            if (!resp.IsSuccess || string.IsNullOrEmpty(resp.Body))
            {
                if (IsExplicitStoreDeactivation(resp))
                {
                    HandleExplicitDeactivation(resp.ErrorMessage ?? resp.Body);
                }
                return false;
            }

            try
            {
                JObject obj = JObject.Parse(resp.Body);
                JToken ordersToken = obj["orders"];
                if (ordersToken != null && ordersToken.Type == JTokenType.Array)
                {
                    var orders = ordersToken.ToObject<List<OnlineOrderDto>>();
                    if (orders != null)
                    {
                        for (int i = 0; i < orders.Count; i++)
                        {
                            OnlineOrderDto ord = orders[i];
                            if (ord == null) continue;
                            InboxSaveOutcome outcome = _syncRepo.SaveInboxOrderDetailed(ord);
                            if (outcome == InboxSaveOutcome.Inserted)
                            {
                                newlyInserted.Add(new OnlineOrderNotificationDto
                                {
                                    OrderId = ord.Id,
                                    OrderNumber = ord.OrderNumber,
                                    CustomerName = ord.CustomerName,
                                    CustomerPhone = ord.CustomerPhone,
                                    TotalPiasters = ord.Total,
                                    DeliveryMethod = ord.DeliveryMethod,
                                    PaymentMethod = ord.PaymentMethod,
                                    ItemsCount = ord.Items != null ? ord.Items.Count : 0,
                                    ProcessStatus = ord.Status
                                });
                            }
                            else if (outcome == InboxSaveOutcome.Updated)
                            {
                                updatedCount++;
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Logger.Warn("SyncEngine parse pending orders warning: " + ex.Message);
            }

            return true;
        }

        private int PullCloudCatalogUpdatesDetailed(string baseUrl, string storeId, string apiKey)
        {
            if (_productRepo == null) return 0;

            SyncHttpResponse resp = _http.GetJson(baseUrl + "/sync/catalog/updates", storeId, apiKey, 15000);
            if (!resp.IsSuccess || string.IsNullOrEmpty(resp.Body))
            {
                return 0;
            }

            try
            {
                JObject obj = JObject.Parse(resp.Body);
                JToken prodsTok = obj["products"];
                if (prodsTok != null && prodsTok.Type == JTokenType.Array)
                {
                    var deltas = prodsTok.ToObject<List<CloudCatalogProductDelta>>();
                    if (deltas != null && deltas.Count > 0)
                    {
                        return _productRepo.ApplyCloudCatalogUpdates(deltas);
                    }
                }
            }
            catch (Exception ex)
            {
                Logger.Warn("SyncEngine parse catalog updates warning: " + ex.Message);
            }

            return 0;
        }

        private static object BuildCloudProductDto(Product p)
        {
            return new
            {
                id = p.Id,
                category_id = p.CategoryId,
                name = p.Name,
                description = string.IsNullOrWhiteSpace(p.OnlineDescription) ? null : p.OnlineDescription,
                barcode = p.Barcode,
                sku = p.InternalCode,
                price_piasters = p.PricePiasters,
                compare_price = p.ComparePricePiasters,
                cost_piasters = p.CostPiasters,
                unit_name = CompoundStockHelper.LocalizeUnit(p.Unit),
                tax_rate = p.TaxRatePercent * 100,
                stock_quantity = p.StockQuantityMilli,
                low_stock_threshold = p.MinStockQuantityMilli,
                is_active = p.IsActive ? 1 : 0,
                is_online = p.IsOnline ? 1 : 0,
                is_featured = p.IsFeatured ? 1 : 0,
                sort_order = p.QuickDisplayOrder
            };
        }

        /// <summary>
        /// Triggers a non-blocking cloud sync of the shop's name, phone, address, and original full-color logo.
        /// </summary>
        public void TriggerStoreProfileSync()
        {
            if (!ShouldRunBackgroundSync()) return;
            ThreadPool.QueueUserWorkItem(delegate(object _)
            {
                if (!Monitor.TryEnter(_syncLock)) return;
                try
                {
                    string storeId = _syncRepo.GetState("store_cloud_id", "");
                    string apiKey = _syncRepo.GetState("sync_api_key", "");
                    string baseUrl = _syncRepo.GetState("cloud_api_url", "https://rafiq-store-api.rafiq-store-api.workers.dev/api/v1").TrimEnd('/');
                    if (string.IsNullOrEmpty(storeId) || string.IsNullOrEmpty(apiKey)) return;
                    SyncStoreProfileInternal(baseUrl, storeId, apiKey, false);
                }
                catch (Exception ex)
                {
                    Logger.Warn("SyncEngine TriggerStoreProfileSync warning: " + ex.Message);
                }
                finally
                {
                    Monitor.Exit(_syncLock);
                }
            });
        }

        private void SyncStoreProfileInternal(string baseUrl, string storeId, string apiKey, bool forcePush)
        {
            try
            {
                if (DatabaseService.SettingsRepo == null) return;

                string storeName = (DatabaseService.SettingsRepo.Get("store_name", "") ?? "").Trim();
                // If store_name was never edited by user or empty, fallback to license_shop_name
                if (string.IsNullOrEmpty(storeName))
                {
                    storeName = (DatabaseService.SettingsRepo.Get("license_shop_name", "") ?? "").Trim();
                }
                if (string.IsNullOrEmpty(storeName) || string.Equals(storeName, "test", StringComparison.OrdinalIgnoreCase))
                {
                    string fallbackName = (DatabaseService.SettingsRepo.Get("store_name", "") ?? "").Trim();
                    if (!string.IsNullOrEmpty(fallbackName) && !string.Equals(fallbackName, "test", StringComparison.OrdinalIgnoreCase))
                    {
                        storeName = fallbackName;
                    }
                    else
                    {
                        storeName = "متجر رفيق";
                    }
                }

                string storePhone = (DatabaseService.SettingsRepo.Get("store_phone", "") ?? "").Trim();
                string storeAddress = (DatabaseService.SettingsRepo.Get("store_address", "") ?? "").Trim();

                // 1. Gather all active digital accounts (Wallets & InstaPay) directly from digital_accounts table
                var activeAccounts = DatabaseService.DigitalAccounts != null
                    ? DatabaseService.DigitalAccounts.GetAllAccounts(false)
                    : new List<DigitalAccount>();

                var validAccounts = new List<object>();
                string defaultWalletPhone = "";
                string defaultWalletName = "";
                string defaultWalletProvider = "vodafone_cash";
                string defaultInstapayHandle = "";
                string defaultInstapayName = "";

                for (int i = 0; i < activeAccounts.Count; i++)
                {
                    var acc = activeAccounts[i];
                    if (acc == null || !acc.IsActive || string.IsNullOrWhiteSpace(acc.AccountNumber)) continue;

                    string accNum = acc.AccountNumber.Trim();
                    string holder = (acc.HolderName ?? acc.Name ?? "").Trim();

                    validAccounts.Add(new
                    {
                        id = acc.Id,
                        name = acc.Name,
                        type = acc.Type,
                        provider = acc.Provider,
                        account_number = accNum,
                        holder_name = holder,
                        is_default = acc.IsDefault
                    });

                    if (acc.Type == "instapay" || acc.Provider == "instapay")
                    {
                        if (string.IsNullOrEmpty(defaultInstapayHandle) || acc.IsDefault)
                        {
                            defaultInstapayHandle = accNum;
                            defaultInstapayName = holder;
                        }
                    }
                    else if (acc.Type == "wallet" || acc.Provider == "vodafone_cash" || acc.Provider == "orange_cash" || acc.Provider == "etisalat_cash" || acc.Provider == "we_pay")
                    {
                        if (string.IsNullOrEmpty(defaultWalletPhone) || acc.IsDefault)
                        {
                            defaultWalletPhone = accNum;
                            defaultWalletName = holder;
                            defaultWalletProvider = acc.Provider ?? "vodafone_cash";
                        }
                    }
                }

                // Settings fallbacks if no digital accounts configured yet
                if (string.IsNullOrEmpty(defaultWalletPhone) && DatabaseService.SettingsRepo != null)
                {
                    defaultWalletPhone = (DatabaseService.SettingsRepo.Get("store_wallet_number", "") ?? "").Trim();
                }
                if (string.IsNullOrEmpty(defaultInstapayHandle) && DatabaseService.SettingsRepo != null)
                {
                    defaultInstapayHandle = (DatabaseService.SettingsRepo.Get("store_instapay_address", "") ?? "").Trim();
                }

                // Always prefer the untouched original full-color logo (`store_logo_raw`) over thermal monochrome copy
                string rawLogo = (DatabaseService.SettingsRepo.Get("store_logo_raw", "") ?? "").Trim();
                string urlLogo = (DatabaseService.SettingsRepo.Get("store_logo_url", "") ?? "").Trim();
                string customLogoDataUrl = ResolveTrueColorCustomLogoDataUrl(rawLogo, urlLogo);

                string accountsJson = JsonConvert.SerializeObject(validAccounts);
                string fingerprintInput = storeName + "|" + storePhone + "|" + storeAddress + "|" + defaultWalletPhone + "|" + defaultInstapayHandle + "|" + accountsJson + "|" + (customLogoDataUrl ?? "__NO_LOGO__");
                string fingerprint = ComputeSha256Hex(fingerprintInput);
                string lastHash = _syncRepo.GetState("last_store_profile_hash", "");

                if (!forcePush && string.Equals(fingerprint, lastHash, StringComparison.Ordinal))
                {
                    return;
                }

                string optimizedLogo = !string.IsNullOrEmpty(customLogoDataUrl)
                    ? NormalizeTrueColorLogoDataUrl(customLogoDataUrl)
                    : null;

                var payload = new
                {
                    name = storeName,
                    phone = storePhone,
                    address = storeAddress,
                    vodafone_cash_phone = defaultWalletPhone,
                    vodafone_cash_name = defaultWalletName,
                    vodafone_cash_provider = defaultWalletProvider,
                    instapay_handle = defaultInstapayHandle,
                    instapay_name = defaultInstapayName,
                    digital_accounts = validAccounts,
                    logo_data_url = optimizedLogo,
                    clear_logo = string.IsNullOrEmpty(optimizedLogo)
                };

                string json = JsonConvert.SerializeObject(payload);
                SyncHttpResponse resp = _http.PostJson(baseUrl + "/sync/store-profile", json, storeId, apiKey, 20000);
                if (resp.IsSuccess)
                {
                    _syncRepo.SetState("last_store_profile_hash", fingerprint);
                }
                else
                {
                    if (IsExplicitStoreDeactivation(resp))
                    {
                        HandleExplicitDeactivation(resp.ErrorMessage ?? resp.Body);
                    }
                    Logger.Warn("SyncEngine store profile sync warning: " + resp.ErrorMessage);
                }
            }
            catch (Exception ex)
            {
                Logger.Warn("SyncEngine store profile sync error: " + ex.Message);
            }
        }

        private static bool IsBuiltInDefaultLogoPath(string val)
        {
            if (string.IsNullOrWhiteSpace(val)) return true;
            string v = val.Trim().ToLowerInvariant();
            return v == "/logo.png" ||
                   v == "/receipt_logo.png" ||
                   v == "/receipt_logo_square.png" ||
                   v == "/rafiq_logo.png";
        }

        private static string ResolveTrueColorCustomLogoDataUrl(string rawLogo, string urlLogo)
        {
            if (!IsBuiltInDefaultLogoPath(rawLogo) && rawLogo.StartsWith("data:image/", StringComparison.OrdinalIgnoreCase))
            {
                return rawLogo;
            }
            if (!IsBuiltInDefaultLogoPath(urlLogo) && urlLogo.StartsWith("data:image/", StringComparison.OrdinalIgnoreCase))
            {
                return urlLogo;
            }
            return null;
        }

        /// <summary>
        /// Ensures the custom store logo stays crisp, full-color (32-bit ARGB transparency preserved),
        /// and compact (<= 512x512 PNG) for instant cloud CDN delivery.
        /// Adheres strictly to Rule 1 (Integer arithmetic only).
        /// </summary>
        private static string NormalizeTrueColorLogoDataUrl(string dataUrl)
        {
            try
            {
                int commaIdx = dataUrl.IndexOf(',');
                if (commaIdx <= 0) return dataUrl;

                string base64Part = dataUrl.Substring(commaIdx + 1).Trim();
                byte[] rawBytes = Convert.FromBase64String(base64Part);

                using (var ms = new MemoryStream(rawBytes))
                using (var img = Image.FromStream(ms))
                {
                    int maxDim = 512;
                    bool needsResize = img.Width > maxDim || img.Height > maxDim || rawBytes.Length > 450 * 1024;
                    if (!needsResize)
                    {
                        return dataUrl;
                    }

                    int targetW = img.Width;
                    int targetH = img.Height;
                    if (img.Width > maxDim || img.Height > maxDim)
                    {
                        if (img.Width >= img.Height)
                        {
                            targetW = maxDim;
                            targetH = Math.Max(1, (img.Height * maxDim) / Math.Max(1, img.Width));
                        }
                        else
                        {
                            targetH = maxDim;
                            targetW = Math.Max(1, (img.Width * maxDim) / Math.Max(1, img.Height));
                        }
                    }

                    using (var bmp = new Bitmap(targetW, targetH, PixelFormat.Format32bppArgb))
                    using (var g = Graphics.FromImage(bmp))
                    {
                        g.Clear(Color.Transparent);
                        g.CompositingQuality = CompositingQuality.HighQuality;
                        g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                        g.SmoothingMode = SmoothingMode.HighQuality;
                        g.PixelOffsetMode = PixelOffsetMode.HighQuality;
                        g.DrawImage(img, 0, 0, targetW, targetH);

                        using (var outMs = new MemoryStream())
                        {
                            bmp.Save(outMs, ImageFormat.Png);
                            return "data:image/png;base64," + Convert.ToBase64String(outMs.ToArray());
                        }
                    }
                }
            }
            catch
            {
                return dataUrl;
            }
        }

        private static string ComputeSha256Hex(string text)
        {
            using (var sha = SHA256.Create())
            {
                byte[] bytes = Encoding.UTF8.GetBytes(text ?? "");
                byte[] hash = sha.ComputeHash(bytes);
                var sb = new StringBuilder(hash.Length * 2);
                for (int i = 0; i < hash.Length; i++)
                {
                    sb.Append(hash[i].ToString("x2"));
                }
                return sb.ToString();
            }
        }

        /// <summary>
        /// Purges online orders both in local SQLite sync_inbox and in Cloudflare D1.
        /// </summary>
        public bool PurgeAllOrders()
        {
            try
            {
                // 1. Wipe local inbox orders
                _syncRepo.ClearInboxOrders();

                // 2. Wipe pending order items from outbox
                _syncRepo.ClearOrderOutbox();

                // 3. Purge from cloud D1 if configured
                PurgeCloudOrders();

                // 4. Notify UI via event so orders disappear immediately without reload
                if (OnOrdersSynced != null)
                {
                    try
                    {
                        var evt = new OnlineOrdersSyncedEvent
                        {
                            NewOrdersCount = 0,
                            UpdatedOrdersCount = 0,
                            TotalPendingNewCount = 0,
                            SyncedAt = DateTime.UtcNow.ToString("o"),
                            NewOrders = new List<OnlineOrderNotificationDto>()
                        };
                        OnOrdersSynced(evt);
                    }
                    catch { }
                }

                return true;
            }
            catch (Exception ex)
            {
                Logger.Error("فشل تصفير ومسح طلبات الأونلاين", ex);
                return false;
            }
        }

        public bool PurgeCloudOrders()
        {
            try
            {
                string storeId = _syncRepo.GetState("store_cloud_id", "");
                string apiKey = _syncRepo.GetState("sync_api_key", "");
                string baseUrl = _syncRepo.GetState("cloud_api_url", "https://rafiq-store-api.rafiq-store-api.workers.dev/api/v1").TrimEnd('/');

                if (string.IsNullOrWhiteSpace(storeId) || string.IsNullOrWhiteSpace(apiKey))
                {
                    return false;
                }
                string url = baseUrl + "/sync/orders/purge";
                SyncHttpResponse resp = _http.PostJson(url, "{}", storeId, apiKey, 15000);
                return resp != null && resp.IsSuccess;
            }
            catch (Exception ex)
            {
                Logger.Warn("SyncEngine purge cloud orders warning: " + ex.Message);
                return false;
            }
        }

        public bool PurgeCloudCatalog()
        {
            try
            {
                string storeId = _syncRepo.GetState("store_cloud_id", "");
                string apiKey = _syncRepo.GetState("sync_api_key", "");
                string baseUrl = _syncRepo.GetState("cloud_api_url", "https://rafiq-store-api.rafiq-store-api.workers.dev/api/v1").TrimEnd('/');

                if (string.IsNullOrWhiteSpace(storeId) || string.IsNullOrWhiteSpace(apiKey))
                {
                    return false;
                }
                string url = baseUrl + "/sync/catalog/purge";
                SyncHttpResponse resp = _http.PostJson(url, "{}", storeId, apiKey, 15000);
                return resp != null && resp.IsSuccess;
            }
            catch (Exception ex)
            {
                Logger.Warn("SyncEngine purge cloud catalog warning: " + ex.Message);
                return false;
            }
        }
    }
}
