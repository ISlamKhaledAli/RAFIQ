using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
using Newtonsoft.Json;
using RafiqPOS.Models;
using RafiqPOS.Repositories;
using RafiqPOS.Common;

namespace RafiqPOS.Services
{
    public class PinStatusResult
    {
        public bool IsPinSet { get; set; }
        public bool IsEnabled { get; set; }
        public bool IsLocked { get; set; }
        public int RemainingLockoutSeconds { get; set; }
        public int FailedAttempts { get; set; }
        public int IdleTimeoutMinutes { get; set; }
        public Dictionary<string, bool> ProtectedActions { get; set; }
        public UserDto CurrentUser { get; set; }
    }

    public class PinVerificationResult
    {
        public bool Success { get; set; }
        public bool IsLocked { get; set; }
        public int RemainingLockoutSeconds { get; set; }
        public int FailedAttempts { get; set; }
        public string Message { get; set; }
        public string SupervisorName { get; set; }
    }

    public class SetPinResult
    {
        public bool Success { get; set; }
        public string Message { get; set; }
        public string RecoveryCode { get; set; }
    }

    public class SecurityService
    {
        private const string KEY_PIN_HASH = "security_pin_hash";
        private const string KEY_PIN_SALT = "security_pin_salt";
        private const string KEY_RECOVERY_HASH = "security_recovery_hash";
        private const string KEY_RECOVERY_SALT = "security_recovery_salt";
        private const string KEY_PIN_ENABLED = "security_pin_enabled";
        private const string KEY_FAILED_ATTEMPTS = "security_failed_attempts";
        private const string KEY_LOCKOUT_UNTIL = "security_lockout_until";
        private const string KEY_PROTECTED_ACTIONS = "security_protected_actions";
        private const string KEY_IDLE_TIMEOUT_MINUTES = "security_idle_timeout_minutes";
        // Separate persistent throttles so one channel can never reset or shorten another (F6/F14)
        private const string KEY_SUPERVISOR_FAILED = "security_supervisor_failed_attempts";
        private const string KEY_SUPERVISOR_LOCKOUT = "security_supervisor_lockout_until";
        private const string KEY_RECOVERY_FAILED = "security_recovery_failed_attempts";
        private const string KEY_RECOVERY_LOCKOUT = "security_recovery_lockout_until";

        private const int PBKDF2_ITERATIONS = 50000;
        // Older installers seeded user PINs with 10k iterations; accepted once and re-hashed on use
        private const int LEGACY_PBKDF2_ITERATIONS = 10000;
        private const int HASH_BYTE_SIZE = 32;
        private const int SALT_BYTE_SIZE = 16;

        private readonly SettingsRepository _settingsRepo;
        private readonly AuditLogRepository _auditRepo;
        private readonly UserRepository _userRepo;

        // Current active session
        private static UserDto _currentUserSession;
        // Session that was opened with the owner recovery code; it may set a new PIN without the forgotten one
        private static string _recoveryLoginUserId;

        // The store owner is role "admin" with this id; managers are other role "admin" accounts (no extra role value exists)
        public const string OWNER_ID = "usr_admin_default";
        private const string OWNER_USERNAME = "admin";
        public const int TIER_CASHIER = 0;
        public const int TIER_MANAGER = 1;
        public const int TIER_OWNER = 2;
        public const int TIER_ROOT = 3;
        private const string OWNER_ONLY_MESSAGE = "هذه العملية متاحة لصاحب المحل فقط";

        // Owner-grade keys: always on for the owner/root, off for a manager until the owner explicitly grants each one; never held by cashiers
        public static readonly string[] DELEGABLE_OWNER_PERMISSIONS = new string[] { "system.updates", "settings.restore", "settings.license" };

        private static bool IsOwnerIdentity(string id, string username, string role)
        {
            // Both the id match and the username match only count for an account that really is role "admin"
            if (role != "admin") return false;
            return id == OWNER_ID || string.Equals(username, OWNER_USERNAME, StringComparison.OrdinalIgnoreCase);
        }

        public static bool IsOwnerUser(User u)
        {
            return u != null && IsOwnerIdentity(u.Id, u.Username, u.Role);
        }

        // root=3, owner=2, manager (any other admin)=1, cashier=0
        public static int Tier(User u)
        {
            if (u == null) return -1;
            return TierOf(u.Id, u.Username, u.Role);
        }

        public static int TierOf(string id, string username, string role)
        {
            if (role == "root") return TIER_ROOT;
            if (IsOwnerIdentity(id, username, role)) return TIER_OWNER;
            if (role == "admin") return TIER_MANAGER;
            return TIER_CASHIER;
        }

        // True for the owner-grade keys (owner/root by default, a manager only when the owner granted the key)
        public static bool IsOwnerOnlyPermission(string permKey)
        {
            for (int i = 0; i < DELEGABLE_OWNER_PERMISSIONS.Length; i++)
            {
                if (DELEGABLE_OWNER_PERMISSIONS[i] == permKey) return true;
            }
            return false;
        }

        // A manager holds an owner-grade key only when his own PermissionsJson explicitly says true
        private static bool IsOwnerGradeGranted(User manager, string permKey)
        {
            if (manager == null || string.IsNullOrEmpty(manager.PermissionsJson)) return false;
            try
            {
                var custom = JsonConvert.DeserializeObject<Dictionary<string, bool>>(manager.PermissionsJson);
                bool granted;
                return custom != null && custom.TryGetValue(permKey, out granted) && granted;
            }
            catch
            {
                return false;
            }
        }

        // Owner-grade keys currently granted to a manager, in DELEGABLE_OWNER_PERMISSIONS order
        private static List<string> GrantedOwnerGradeKeys(User manager)
        {
            var granted = new List<string>();
            for (int i = 0; i < DELEGABLE_OWNER_PERMISSIONS.Length; i++)
            {
                if (IsOwnerGradeGranted(manager, DELEGABLE_OWNER_PERMISSIONS[i])) granted.Add(DELEGABLE_OWNER_PERMISSIONS[i]);
            }
            return granted;
        }

        // Owner or developer root: the only accounts allowed to run store-wide dangerous operations
        public bool IsCurrentSessionOwner()
        {
            if (_currentUserSession == null) return false;
            int tier = TierOf(_currentUserSession.Id, _currentUserSession.Username, _currentUserSession.Role);
            return tier >= TIER_OWNER;
        }

        private string GetOwnerId()
        {
            if (_userRepo == null) return OWNER_ID;
            User owner = _userRepo.GetById(OWNER_ID);
            if (owner == null) owner = _userRepo.GetByUsername(OWNER_USERNAME);
            return owner != null ? owner.Id : OWNER_ID;
        }

        private User GetSessionUser()
        {
            if (_currentUserSession == null || _userRepo == null) return null;
            return _userRepo.GetById(_currentUserSession.Id);
        }

        // Fetched-from-DB caller must outrank the target (root outranks everyone); admins edit their own record only through the self paths
        private static bool CallerOutranks(User caller, User target)
        {
            int callerTier = Tier(caller);
            if (callerTier >= TIER_ROOT) return true;
            return callerTier > Tier(target);
        }


        public SecurityService(SettingsRepository settingsRepo, AuditLogRepository auditRepo, UserRepository userRepo = null)
        {
            this._settingsRepo = settingsRepo;
            this._auditRepo = auditRepo;
            this._userRepo = userRepo;
            NormalizeAdminRoles();
        }

        private void NormalizeAdminRoles()
        {
            if (_userRepo == null) return;
            try
            {
                // 1. Ensure Developer Root account exists and is ACTIVE as root, authenticated EXCLUSIVELY via 1-hour dynamic OTP (No static password)
                EnsureRootDeveloperAccount();
                MigratePlaintextPins();

                // 2. Ensure Store Owner "admin" exists as role "admin" (صاحب المحل)
                var ownerUser = _userRepo.GetByUsername("admin");
                if (ownerUser == null)
                {
                    ownerUser = _userRepo.GetById("usr_admin_default");
                }
                if (ownerUser == null)
                {
                    byte[] oSaltBytes = GenerateSalt();
                    string oSaltStr = Convert.ToBase64String(oSaltBytes);
                    byte[] oHashBytes = HashWithSalt("1234", oSaltBytes);
                    string oHashStr = Convert.ToBase64String(oHashBytes);

                    ownerUser = new User();
                    ownerUser.Id = "usr_admin_default";
                    ownerUser.Username = "admin";
                    ownerUser.DisplayName = "صاحب المحل";
                    ownerUser.Role = "admin";
                    ownerUser.CanDelegate = true;
                    ownerUser.MaxDepth = 10;
                    ownerUser.ParentId = null;
                    ownerUser.IsActive = true;
                    ownerUser.MustChangePin = true;
                    ownerUser.PinCodeHash = oHashStr;
                    ownerUser.PinSalt = oSaltStr;
                    ownerUser.CreatedAt = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss");
                    ownerUser.UpdatedAt = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss");
                    _userRepo.Insert(ownerUser);
                }
                else
                {
                    bool oChanged = false;
                    if (ownerUser.Role != "admin") { ownerUser.Role = "admin"; oChanged = true; }
                    // The owner may rename the account; only an empty name is restored
                    if (string.IsNullOrWhiteSpace(ownerUser.DisplayName)) { ownerUser.DisplayName = "صاحب المحل"; oChanged = true; }
                    if (!ownerUser.CanDelegate) { ownerUser.CanDelegate = true; oChanged = true; }
                    if (ownerUser.MaxDepth < 10) { ownerUser.MaxDepth = 10; oChanged = true; }
                    if (ownerUser.ParentId == "usr_root_developer" || ownerUser.ParentId == ownerUser.Id) { ownerUser.ParentId = null; oChanged = true; }
                    if (!string.IsNullOrEmpty(ownerUser.PermissionsJson)) { ownerUser.PermissionsJson = null; oChanged = true; }
                    if (!ownerUser.IsActive) { ownerUser.IsActive = true; oChanged = true; }
                    if (oChanged) _userRepo.Update(ownerUser);
                }

                // 3. Ensure Cashier 1 exists and is linked under admin, and clean any stale unauthorized permissions
                var allUsers = _userRepo.GetAll();
                if (allUsers != null)
                {
                    foreach (var u in allUsers)
                    {
                        // Managers (non-owner admins): always directly under the owner and allowed to create cashiers
                        if (u != null && u.Role == "admin" && !IsOwnerUser(u))
                        {
                            bool mChanged = false;
                            if (!u.CanDelegate) { u.CanDelegate = true; mChanged = true; }
                            if (u.MaxDepth < 1) { u.MaxDepth = 1; mChanged = true; }
                            if (ownerUser != null && u.ParentId != ownerUser.Id) { u.ParentId = ownerUser.Id; mChanged = true; }
                            if (mChanged) _userRepo.Update(u);
                            continue;
                        }

                        if (u != null && u.Role == "cashier")
                        {
                            bool uChanged = false;
                            if (string.IsNullOrEmpty(u.ParentId))
                            {
                                u.ParentId = "usr_admin_default";
                                uChanged = true;
                            }
                            if (!string.IsNullOrEmpty(u.PermissionsJson))
                            {
                                try
                                {
                                    var pDict = JsonConvert.DeserializeObject<Dictionary<string, bool>>(u.PermissionsJson);
                                    if (pDict != null)
                                    {
                                        if (pDict.ContainsKey("invoices.view") && pDict["invoices.view"])
                                        {
                                            pDict["invoices.view"] = false;
                                            uChanged = true;
                                        }
                                        if (pDict.ContainsKey("epay.fund") && pDict["epay.fund"])
                                        {
                                            pDict["epay.fund"] = false;
                                            uChanged = true;
                                        }
                                        if (pDict.ContainsKey("epay.terminals_manage") && pDict["epay.terminals_manage"])
                                        {
                                            pDict["epay.terminals_manage"] = false;
                                            uChanged = true;
                                        }
                                        if (pDict.ContainsKey("epay.history") && pDict["epay.history"])
                                        {
                                            pDict["epay.history"] = false;
                                            uChanged = true;
                                        }
                                        if (pDict.ContainsKey("epay.analytics") && pDict["epay.analytics"])
                                        {
                                            pDict["epay.analytics"] = false;
                                            uChanged = true;
                                        }
                                        if (uChanged)
                                        {
                                            u.PermissionsJson = JsonConvert.SerializeObject(pDict);
                                        }
                                    }
                                }
                                catch
                                {
                                }
                            }
                            if (uChanged) _userRepo.Update(u);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                // Startup must never fail because of normalisation, but a failed heal must be visible in the log
                Logger.Error("فشل تطبيع حسابات المديرين عند بدء التشغيل (NormalizeAdminRoles): " + ex.Message, ex);
            }
        }

        // One-time startup conversion of plaintext PIN seeds (e.g. migration v1 admin '1234') into salted hashes
        private void MigratePlaintextPins()
        {
            var users = _userRepo.GetAll(false);
            for (int i = 0; i < users.Count; i++)
            {
                User u = users[i];
                if (u == null || u.Role == "root" || string.IsNullOrEmpty(u.PinCodeHash) || !string.IsNullOrEmpty(u.PinSalt)) continue;
                string plainPin = u.PinCodeHash;
                UpgradeLegacyPinHash(u, plainPin);
                if (IsWeakPin(plainPin) && !u.MustChangePin)
                {
                    u.MustChangePin = true;
                    _userRepo.Update(u);
                }
            }
        }

        public static void ResetUsersToFactoryDefaults(System.Data.SQLite.SQLiteConnection conn, System.Data.SQLite.SQLiteTransaction trans)
        {
            if (conn == null) return;

            // 1. Delete all users except developer root if it exists
            using (var delCmd = new System.Data.SQLite.SQLiteCommand("DELETE FROM users WHERE id NOT IN ('usr_root_developer');", conn, trans))
            {
                delCmd.ExecuteNonQuery();
            }

            // 2. Generate factory admin PIN ('1234')
            byte[] oSaltBytes = GenerateSalt();
            string oSaltStr = Convert.ToBase64String(oSaltBytes);
            byte[] oHashBytes = HashWithSalt("1234", oSaltBytes);
            string oHashStr = Convert.ToBase64String(oHashBytes);
            string nowIso = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss");

            using (var insAdmin = new System.Data.SQLite.SQLiteCommand(@"
                INSERT OR REPLACE INTO users (id, username, display_name, pin_code_hash, pin_salt, role, is_active, failed_attempts, created_at, updated_at, max_depth, can_delegate, must_change_pin, permissions_json)
                VALUES ('usr_admin_default', 'admin', 'صاحب المحل', @pinHash, @pinSalt, 'admin', 1, 0, @now, @now, 10, 1, 1, NULL);
            ", conn, trans))
            {
                insAdmin.Parameters.AddWithValue("@pinHash", oHashStr);
                insAdmin.Parameters.AddWithValue("@pinSalt", oSaltStr);
                insAdmin.Parameters.AddWithValue("@now", nowIso);
                insAdmin.ExecuteNonQuery();
            }

            // 3. Generate factory cashier PIN ('0000')
            byte[] cSaltBytes = GenerateSalt();
            string cSaltStr = Convert.ToBase64String(cSaltBytes);
            byte[] cHashBytes = HashWithSalt("0000", cSaltBytes);
            string cHashStr = Convert.ToBase64String(cHashBytes);

            using (var insCashier = new System.Data.SQLite.SQLiteCommand(@"
                INSERT OR REPLACE INTO users (id, username, display_name, pin_code_hash, pin_salt, role, is_active, failed_attempts, created_at, updated_at, max_depth, can_delegate, must_change_pin, parent_id, permissions_json)
                VALUES ('usr_cashier_1', 'cashier1', 'كاشير (1)', @pinHash, @pinSalt, 'cashier', 1, 0, @now, @now, 0, 0, 1, 'usr_admin_default', NULL);
            ", conn, trans))
            {
                insCashier.Parameters.AddWithValue("@pinHash", cHashStr);
                insCashier.Parameters.AddWithValue("@pinSalt", cSaltStr);
                insCashier.Parameters.AddWithValue("@now", nowIso);
                insCashier.ExecuteNonQuery();
            }

            // 4. Reset root user lockout / failed attempts if root exists
            using (var rootCmd = new System.Data.SQLite.SQLiteCommand("UPDATE users SET failed_attempts = 0, lockout_until = NULL, is_active = 1 WHERE id = 'usr_root_developer';", conn, trans))
            {
                rootCmd.ExecuteNonQuery();
            }

            // 5. Reset in-memory session immediately
            _currentUserSession = null;
            _recoveryLoginUserId = null;
        }

        private User EnsureRootDeveloperAccount()
        {
            if (_userRepo == null) return null;
            try
            {
                var devUser = _userRepo.GetByUsername("islam");
                if (devUser == null)
                {
                    devUser = _userRepo.GetById("usr_root_developer");
                }
                if (devUser == null)
                {
                    devUser = new User();
                    devUser.Id = "usr_root_developer";
                    devUser.Username = "islam";
                    devUser.DisplayName = "المطور (Root)";
                    devUser.Role = "root";
                    devUser.CanDelegate = true;
                    devUser.MaxDepth = 99;
                    devUser.ParentId = null;
                    devUser.IsActive = true;
                    devUser.MustChangePin = false;
                    devUser.PinCodeHash = ""; // No static PIN
                    devUser.PinSalt = "";
                    devUser.PasswordHash = ""; // No static Password
                    devUser.PasswordSalt = "";
                    devUser.CreatedAt = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss");
                    devUser.UpdatedAt = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss");
                    _userRepo.Insert(devUser);
                    LogAudit("SECURITY_ROOT_PROVISION", "SECURITY", "usr_root_developer", "تم تهيئة حساب المطور الرئيسي (Root) المحمي برمز OTP ديناميكي");
                }
                else
                {
                    bool needUpdate = false;
                    if (!devUser.IsActive) { devUser.IsActive = true; needUpdate = true; }
                    if (devUser.Role != "root") { devUser.Role = "root"; needUpdate = true; }
                    if (!devUser.CanDelegate) { devUser.CanDelegate = true; needUpdate = true; }
                    if (devUser.MaxDepth != 99) { devUser.MaxDepth = 99; needUpdate = true; }
                    if (!string.IsNullOrEmpty(devUser.PinCodeHash) || !string.IsNullOrEmpty(devUser.PasswordHash))
                    {
                        devUser.PinCodeHash = "";
                        devUser.PinSalt = "";
                        devUser.PasswordHash = "";
                        devUser.PasswordSalt = "";
                        needUpdate = true;
                    }
                    if (needUpdate)
                    {
                        _userRepo.Update(devUser);
                    }
                }
                return devUser;
            }
            catch
            {
                return new User
                {
                    Id = "usr_root_developer",
                    Username = "islam",
                    DisplayName = "المطور (Root)",
                    Role = "root",
                    IsActive = true,
                    CanDelegate = true,
                    MaxDepth = 99
                };
            }
        }

        public static UserDto CurrentUser
        {
            get { return _currentUserSession; }
        }

        public static void SetCurrentUserForTesting(UserDto user)
        {
            _currentUserSession = user;
        }

        public PinStatusResult GetStatus()
        {
            string pinHash = _settingsRepo.Get(KEY_PIN_HASH, "");
            bool isPinSet = !string.IsNullOrEmpty(pinHash);
            string enabledStr = _settingsRepo.Get(KEY_PIN_ENABLED, "1");
            bool isEnabled = isPinSet && (enabledStr == "1" || enabledStr.ToLower() == "true");

            int failedAttempts = 0;
            int.TryParse(_settingsRepo.Get(KEY_FAILED_ATTEMPTS, "0"), out failedAttempts);

            int remainingSeconds = GetRemainingLockoutSeconds();
            bool isLocked = remainingSeconds > 0;

            int idleTimeout = GetIdleTimeoutMinutes();
            Dictionary<string, bool> protectedActions = GetProtectedActions();

            var status = new PinStatusResult();
            status.IsPinSet = isPinSet;
            status.IsEnabled = isEnabled;
            status.IsLocked = isLocked;
            status.RemainingLockoutSeconds = remainingSeconds;
            status.FailedAttempts = failedAttempts;
            status.IdleTimeoutMinutes = idleTimeout;
            status.ProtectedActions = protectedActions;
            status.CurrentUser = GetCurrentSessionUser();
            return status;
        }

        public int GetIdleTimeoutMinutes()
        {
            string val = _settingsRepo.Get(KEY_IDLE_TIMEOUT_MINUTES, "15");
            int minutes;
            if (int.TryParse(val, out minutes))
            {
                return Math.Max(0, minutes);
            }
            return 15;
        }

        public void SetIdleTimeoutMinutes(int minutes)
        {
            _settingsRepo.Set(KEY_IDLE_TIMEOUT_MINUTES, Math.Max(0, minutes).ToString());
            LogAudit("IDLE_TIMEOUT_UPDATED", "SECURITY", "SYSTEM", string.Format("تم تحديث مهلة الخمول إلى {0} دقيقة", minutes));
        }

        public UserDto GetCurrentSessionUser()
        {
            if (_currentUserSession != null && _userRepo != null)
            {
                var refreshed = _userRepo.GetById(_currentUserSession.Id);
                if (refreshed != null)
                {
                    _currentUserSession = MapToDto(refreshed);
                    _currentUserSession.IsRecoverySession = _recoveryLoginUserId == refreshed.Id;
                }
            }
            return _currentUserSession;
        }

        public LoginResult Login(string usernameOrId, string pin)
        {
            // Security hardening: immediately invalidate prior session so failed attempts never inherit privileges
            _currentUserSession = null;
            _recoveryLoginUserId = null;

            var res = new LoginResult();

            if (string.IsNullOrEmpty(usernameOrId) || string.IsNullOrEmpty(pin))
            {
                res.Success = false;
                res.Message = "اسم الموظف والرقم السري مطلوبان.";
                return res;
            }

            if (_userRepo == null)
            {
                res.Success = false;
                res.Message = "خدمة الموظفين غير مهيأة.";
                return res;
            }

            User user = _userRepo.GetById(usernameOrId);
            if (user == null)
            {
                user = _userRepo.GetByUsername(usernameOrId);
            }
            if (user == null && string.Equals(usernameOrId, "root", StringComparison.OrdinalIgnoreCase))
            {
                user = _userRepo.GetByUsername("islam") ?? _userRepo.GetById("usr_root_developer");
            }
            if (user == null && string.Equals(usernameOrId, "islam", StringComparison.OrdinalIgnoreCase))
            {
                user = _userRepo.GetById("usr_root_developer");
            }
            if (user == null && (string.Equals(usernameOrId, "root", StringComparison.OrdinalIgnoreCase) || string.Equals(usernameOrId, "islam", StringComparison.OrdinalIgnoreCase)))
            {
                user = EnsureRootDeveloperAccount();
            }

            if (user == null)
            {
                res.Success = false;
                res.Message = "بيانات الموظف غير صحيحة.";
                return res;
            }

            if (!user.IsActive)
            {
                res.Success = false;
                res.Message = "هذا الحساب معطّل. يرجى مراجعة مدير النظام.";
                return res;
            }

            // 1. Strict Lockout check upfront before any credential evaluation
            int remainingSec = GetUserRemainingLockoutSeconds(user);
            if (remainingSec > 0)
            {
                res.Success = false;
                res.IsLocked = true;
                res.RemainingLockoutSeconds = remainingSec;
                res.Message = string.Format("الحساب مقفل مؤقتاً لحماية الأمان. يرجى الانتظار {0} ثانية.", remainingSec);
                return res;
            }

            bool matches = false;

            // Emergency Recovery Code for Store Owner only (managers never receive or use it)
            // Root stays challenge-only: recovery codes are never accepted for it
            if (user.Role == "admin" && IsOwnerUser(user) && !string.IsNullOrEmpty(pin) &&
                (pin.Trim().StartsWith("RFQ-REC-", StringComparison.OrdinalIgnoreCase) || pin.Trim().StartsWith("RFK", StringComparison.OrdinalIgnoreCase)))
            {
                if (VerifyRecoveryCodeInternal(pin))
                {
                    matches = true;
                    user.MustChangePin = true;
                    _userRepo.Update(user);
                    _recoveryLoginUserId = user.Id;
                    LogAudit("EMERGENCY_RECOVERY_LOGIN", "SECURITY", user.Username, "تم تسجيل الدخول بنجاح باستخدام كود استرجاع الدعم الفني المعتمد");
                }
            }

            // 3. Standard credentials verification
            if (!matches)
            {

                // Check Password first if set
                if (!string.IsNullOrEmpty(user.PasswordHash) && !string.IsNullOrEmpty(user.PasswordSalt))
                {
                    try
                    {
                        byte[] pSalt = Convert.FromBase64String(user.PasswordSalt);
                        byte[] expectedPHash = Convert.FromBase64String(user.PasswordHash);
                        byte[] actualPHash = HashWithSalt(pin, pSalt);
                        matches = SlowEquals(expectedPHash, actualPHash);
                    }
                    catch
                    {
                    }
                }

                // If not matched by password, check PIN hash
                if (!matches && !string.IsNullOrEmpty(user.PinCodeHash))
                {
                    bool needsUpgrade;
                    matches = VerifyStoredPin(user.PinCodeHash, user.PinSalt, pin, out needsUpgrade);
                    if (matches && needsUpgrade)
                    {
                        UpgradeLegacyPinHash(user, pin);
                        // Factory-seeded weak PINs (admin 1234 / cashier1 0000) must be replaced before any work
                        if (IsWeakPin(pin) && !user.MustChangePin)
                        {
                            user.MustChangePin = true;
                            _userRepo.Update(user);
                        }
                    }
                }
            }

            if (matches)
            {
                // Reset failed attempts & update last login
                _userRepo.RecordLoginAttempt(user.Id, true);
                user.FailedAttempts = 0;
                user.LockoutUntil = null;
                user.LastLoginAt = DateTime.UtcNow.ToString("o");

                var dto = MapToDto(user);
                dto.IsRecoverySession = _recoveryLoginUserId == user.Id;
                _currentUserSession = dto;

                string roleName = user.Role == "root" ? "المالك (Root)" : (user.Role == "admin" ? "مدير النظام" : user.Role);
                LogAudit("USER_LOGIN", "SECURITY", user.Username, string.Format("تسجيل دخول الموظف: {0} ({1})", user.DisplayName, roleName));

                res.Success = true;
                res.User = dto;
                res.IsLocked = false;
                res.RemainingLockoutSeconds = 0;
                res.MustChangePin = user.MustChangePin;
                res.Message = "تم تسجيل الدخول بنجاح.";
                return res;
            }
            else
            {
                int failed = user.FailedAttempts + 1;
                int lockoutSec = LoginLockoutSeconds(failed);

                _userRepo.RecordLoginAttempt(user.Id, false, lockoutSec);
                LogAudit("LOGIN_FAILED", "SECURITY", user.Username, string.Format("محاولة دخول خاطئة للموظف: {0} (المحاولة {1})", user.DisplayName, failed));

                res.Success = false;
                res.IsLocked = lockoutSec > 0;
                res.RemainingLockoutSeconds = lockoutSec;
                res.Message = lockoutSec > 0
                    ? string.Format("تم إدخال الرقم السري بشكل خاطئ عدة مرات. تم قفل الحساب لمدة {0} ثانية.", lockoutSec)
                    : string.Format("الرقم السري غير صحيح. المحاولات المتبقية قبل القفل: {0}", Math.Max(0, 5 - failed));
                return res;
            }
        }

        private static int LoginLockoutSeconds(int failedAttempts)
        {
            if (failedAttempts >= 10) return 300;
            if (failedAttempts >= 5) return 30;
            return 0;
        }

        public void Logout()
        {
            if (_currentUserSession != null)
            {
                LogAudit("USER_LOGOUT", "SECURITY", _currentUserSession.Username, string.Format("تسجيل خروج الموظف: {0}", _currentUserSession.DisplayName));
                _currentUserSession = null;
                _recoveryLoginUserId = null;
            }
        }

        public List<UserDto> GetActiveUsers()
        {
            var list = new List<UserDto>();
            if (_userRepo != null)
            {
                var users = _userRepo.GetAll(true);
                for (int i = 0; i < users.Count; i++)
                {
                    if (users[i].Role != "root")
                    {
                        list.Add(MapToDto(users[i]));
                    }
                }
            }
            return list;
        }

        public List<UserDto> GetAllUsers()
        {
            var list = new List<UserDto>();
            if (_userRepo != null)
            {
                var users = _userRepo.GetAll(false);
                bool isRootCaller = _currentUserSession != null && _currentUserSession.Role == "root";
                for (int i = 0; i < users.Count; i++)
                {
                    if (!isRootCaller && users[i].Role == "root") continue;
                    list.Add(MapToDto(users[i]));
                }
                list.Sort(CompareTreeNodes);
            }
            return list;
        }

        // Soft delete: the account is disabled, its credentials are wiped and its username is released, but history keeps resolving the name
        public bool DeleteUser(string userId)
        {
            if (_userRepo == null) throw new InvalidOperationException("UserRepository is null");
            if (string.IsNullOrEmpty(userId)) throw new ArgumentException("الموظف غير موجود");

            User user = _userRepo.GetById(userId);
            if (user == null) throw new ArgumentException("الموظف غير موجود");

            User caller = GetSessionUser();
            if (caller == null || !caller.IsActive)
            {
                throw new UnauthorizedAccessException("يجب تسجيل الدخول بحساب نشط لحذف الموظفين.");
            }
            if (caller.Id == user.Id)
            {
                throw new InvalidOperationException("لا يمكنك حذف حسابك بنفسك.");
            }

            int targetTier = Tier(user);
            if (targetTier >= TIER_OWNER)
            {
                throw new InvalidOperationException("لا يمكن حذف حساب صاحب المحل أو حساب المطور.");
            }
            if (Tier(caller) < TIER_MANAGER)
            {
                throw new UnauthorizedAccessException("غير مصرح: حذف الموظفين يتطلب صلاحيات مدير النظام.");
            }
            if (!CallerOutranks(caller, user))
            {
                throw new UnauthorizedAccessException("حذف حسابات المديرين متاح لصاحب المحل فقط.");
            }

            if (user.IsActive && (user.Role == "admin" || user.Role == "root") && _userRepo.GetActiveAdminCount() <= 1)
            {
                throw new InvalidOperationException("لا يمكن حذف آخر مدير نظام نشط.");
            }
            if (_userRepo.HasOpenShift(user.Id))
            {
                throw new InvalidOperationException("لا يمكن حذف موظف لديه وردية مفتوحة. يرجى إغلاق الوردية أولاً.");
            }

            // Subordinates move to the owner (managers) or to the deleted user's own parent (legacy delegating cashiers)
            string ownerId = GetOwnerId();
            string newParentId = ownerId;
            if (targetTier == TIER_CASHIER && !string.IsNullOrEmpty(user.ParentId) && user.ParentId != user.Id)
            {
                User oldParent = _userRepo.GetById(user.ParentId);
                if (oldParent != null) newParentId = oldParent.Id;
            }

            string originalUsername = user.Username;
            string displayName = user.DisplayName;
            string role = user.Role;
            if (!_userRepo.SoftDelete(user.Id, newParentId))
            {
                throw new InvalidOperationException("تعذر حذف الموظف: الحساب محذوف بالفعل.");
            }

            LogAudit("USER_DELETED", "SECURITY", originalUsername, string.Format("تم حذف الموظف: {0} ({1}) بواسطة: {2} ({3})", displayName, role, caller.DisplayName, caller.Username));
            return true;
        }

        public UserDto CreateUser(string username, string displayName, string pin, string role)
        {
            return CreateSubUser(null, username, displayName, null, pin, role, null, role == "admin", role == "admin" ? 2 : 0);
        }

        public UserDto CreateSubUser(string parentUserId, string username, string displayName, string password, string pin, string role, Dictionary<string, bool> permissions, bool canDelegate, int maxDepth)
        {
            if (_userRepo == null) throw new InvalidOperationException("UserRepository is null");

            if (string.IsNullOrEmpty(username)) throw new ArgumentException("اسم المستخدم مطلوب");
            if (string.IsNullOrEmpty(displayName)) throw new ArgumentException("اسم الموظف مطلوب");
            if (string.IsNullOrEmpty(password) && string.IsNullOrEmpty(pin))
                throw new ArgumentException("يجب إدخال كلمة مرور أو رقم سري للموظف");

            string cleanUsername = username.Trim().ToLowerInvariant();
            if (_userRepo.GetByUsername(cleanUsername) != null)
            {
                throw new InvalidOperationException("اسم المستخدم موجود بالفعل");
            }

            string targetRole = string.IsNullOrEmpty(role) ? "cashier" : role.Trim().ToLowerInvariant();
            if (targetRole == "root")
            {
                throw new UnauthorizedAccessException("غير مصرح بإنشاء حسابات برتبة Root نهائياً.");
            }
            if (targetRole != "admin")
            {
                targetRole = "cashier";
            }

            // Cashiers nest under the creator (or a requested parent the caller may reach); managers always sit directly under the owner
            User caller = _currentUserSession != null ? _userRepo.GetById(_currentUserSession.Id) : null;
            bool callerIsAdmin = caller != null && (caller.Role == "admin" || caller.Role == "root");
            bool callerIsOwnerOrRoot = caller != null && Tier(caller) >= TIER_OWNER;
            User parent = caller;

            if (targetRole == "admin")
            {
                if (!callerIsAdmin)
                {
                    throw new UnauthorizedAccessException("غير مصرح بإنشاء حساب برتبة مدير نظام إلا من قبل مدير نظام آخر.");
                }
                if (!callerIsOwnerOrRoot)
                {
                    throw new UnauthorizedAccessException(OWNER_ONLY_MESSAGE);
                }
                // The client-supplied parent is ignored for managers
                User ownerParent = _userRepo.GetById(OWNER_ID) ?? _userRepo.GetByUsername(OWNER_USERNAME);
                parent = ownerParent ?? caller;
            }
            else if (caller != null && !string.IsNullOrEmpty(parentUserId) && parentUserId != caller.Id)
            {
                User requestedParent = _userRepo.GetById(parentUserId);
                if (requestedParent == null)
                {
                    throw new ArgumentException("المشرف المحدد للحساب الجديد غير موجود.");
                }
                if (requestedParent.Role == "root" && caller.Role != "root")
                {
                    throw new UnauthorizedAccessException("غير مصرح بإنشاء حسابات تحت حساب المطور.");
                }
                // Only the owner/root may place accounts anywhere; managers and legacy delegates stay inside their own subtree
                if (!callerIsOwnerOrRoot && !IsDescendantOf(requestedParent.Id, caller.Id))
                {
                    throw new UnauthorizedAccessException("لا يمكن إنشاء حساب إلا تحت حسابك أو أحد الحسابات التابعة لك.");
                }
                parent = requestedParent;
            }

            if (parent == null)
            {
                if (_userRepo.GetActiveRootCount() > 0)
                {
                    throw new UnauthorizedAccessException("غير مصرح بإنشاء حساب بدون مستخدم أب.");
                }
            }

            bool isParentRoot = (parent != null && parent.Role == "root");
            int childMaxDepth = 0;
            bool childCanDelegate = false;

            if (parent != null)
            {
                if (!parent.IsActive)
                {
                    throw new InvalidOperationException("حساب المستخدم الأب معطّل، لا يمكن إنشاء حسابات فرعية تحته.");
                }

                if (!isParentRoot)
                {
                    // Admin parents (owner and managers) create cashiers without any delegation flag; only legacy cashier parents are checked
                    if (parent.Role != "admin")
                    {
                        if (!parent.CanDelegate)
                        {
                            throw new UnauthorizedAccessException("المستخدم لا يملك صلاحية تفويض أو إنشاء حسابات فرعية.");
                        }
                        if (parent.MaxDepth <= 0)
                        {
                            throw new InvalidOperationException("تم الوصول إلى أقصى عمق مسموح به للتفويض الفرعي.");
                        }
                    }

                    childMaxDepth = Math.Min(maxDepth, parent.MaxDepth - 1);
                    if (childMaxDepth < 0) childMaxDepth = 0;
                    childCanDelegate = canDelegate && (childMaxDepth > 0);

                    // Filter permissions: child can only receive permissions that parent actually possesses
                    var parentPerms = GetEffectivePermissions(parent);
                    if (callerIsAdmin)
                    {
                        if (targetRole == "cashier" && permissions != null)
                        {
                            // A provided map is authoritative: every key not explicitly true is stored false (no silent role-default grants)
                            permissions = BuildExplicitPermissionMap(permissions, GetEffectivePermissions(caller), parentPerms);
                        }
                        else
                        {
                            var filtered = new Dictionary<string, bool>();
                            if (permissions != null)
                            {
                                foreach (var kvp in permissions)
                                {
                                    bool parentHas = parentPerms.ContainsKey(kvp.Key) && parentPerms[kvp.Key];
                                    filtered[kvp.Key] = kvp.Value && parentHas;
                                }
                            }
                            permissions = filtered;
                        }
                    }
                    else
                    {
                        // Non-admins only ever create cashiers; persist a complete map so nothing is inherited by omission
                        permissions = BuildBoundedPermissionMap("cashier", permissions, GetEffectivePermissions(caller), parentPerms);
                    }
                }
                else
                {
                    if (callerIsAdmin && targetRole == "cashier" && permissions != null)
                    {
                        permissions = BuildExplicitPermissionMap(permissions, GetEffectivePermissions(caller), GetEffectivePermissions(parent));
                    }
                    childMaxDepth = maxDepth > 0 ? maxDepth : 2;
                    childCanDelegate = canDelegate;
                }
            }

            if (targetRole == "admin")
            {
                // Managers are the delegation unit of the new model: they may create cashiers under themselves
                childCanDelegate = true;
                childMaxDepth = 1;
            }
            else if (callerIsAdmin && (!callerIsOwnerOrRoot || !childCanDelegate))
            {
                // Cashiers created by admins no longer delegate (only the owner/root may still create a legacy delegating cashier explicitly)
                childCanDelegate = false;
                childMaxDepth = 0;
            }

            string passSaltStr = null;
            string passHashStr = null;
            if (!string.IsNullOrEmpty(password))
            {
                byte[] pSalt = GenerateSalt();
                byte[] pHash = HashWithSalt(password, pSalt);
                passSaltStr = Convert.ToBase64String(pSalt);
                passHashStr = Convert.ToBase64String(pHash);
            }

            string pinSaltStr = null;
            string pinHashStr = null;
            if (!string.IsNullOrEmpty(pin))
            {
                byte[] pSalt = GenerateSalt();
                byte[] pHash = HashWithSalt(pin, pSalt);
                pinSaltStr = Convert.ToBase64String(pSalt);
                pinHashStr = Convert.ToBase64String(pHash);
            }

            // New managers start without owner-grade grants (the owner grants them later); cashiers can never hold them
            if (targetRole == "admin")
            {
                permissions = null;
            }
            else if (permissions != null)
            {
                for (int i = 0; i < DELEGABLE_OWNER_PERMISSIONS.Length; i++)
                {
                    permissions[DELEGABLE_OWNER_PERMISSIONS[i]] = false;
                }
            }

            string permsJson = permissions != null ? JsonConvert.SerializeObject(permissions) : null;

            var user = new User
            {
                Id = "usr_" + Guid.NewGuid().ToString("N"),
                Username = cleanUsername,
                DisplayName = displayName.Trim(),
                PasswordHash = passHashStr,
                PasswordSalt = passSaltStr,
                PinCodeHash = pinHashStr ?? "",
                PinSalt = pinSaltStr ?? "",
                Role = targetRole,
                IsActive = true,
                FailedAttempts = 0,
                PermissionsJson = permsJson,
                ParentId = parent != null ? parent.Id : null,
                MaxDepth = childMaxDepth,
                CreatedBy = parent != null ? parent.Id : null,
                CanDelegate = childCanDelegate,
                CreatedAt = DateTime.UtcNow.ToString("o")
            };

            _userRepo.Insert(user);
            LogAudit("USER_CREATED", "SECURITY", user.Username, string.Format("تم إنشاء حساب جديد: {0} ({1}) تحت: {2}", user.DisplayName, user.Role, parent != null ? parent.DisplayName : "Root"));

            return MapToDto(user);
        }

        // role == null/empty keeps the account's current role; isActiveArg == null keeps its current status
        public void UpdateUser(string userId, string displayName, string role, bool? isActiveArg)
        {
            if (_userRepo == null) throw new InvalidOperationException("UserRepository is null");

            var user = _userRepo.GetById(userId);
            if (user == null) throw new ArgumentException("الموظف غير موجود");

            User caller = GetSessionUser();
            if (caller == null || !caller.IsActive)
            {
                throw new UnauthorizedAccessException("يجب تسجيل الدخول بحساب نشط لتعديل بيانات الموظفين.");
            }

            bool isActive = isActiveArg.HasValue ? isActiveArg.Value : user.IsActive;
            bool isSelf = caller.Id == user.Id;
            int targetTier = Tier(user);
            string targetRole = string.IsNullOrWhiteSpace(role) ? (string.IsNullOrEmpty(user.Role) ? "cashier" : user.Role) : role.Trim().ToLowerInvariant();

            // The owner can never be disabled or demoted, by anyone
            if (targetTier >= TIER_OWNER)
            {
                if (!isActive)
                {
                    throw new InvalidOperationException("لا يمكن تعطيل حساب صاحب المحل المالك للنظام.");
                }
                if (targetRole != "root" && targetRole != "admin")
                {
                    throw new InvalidOperationException("لا يمكن خفض رتبة حساب صاحب المحل.");
                }
            }

            if (targetRole == "root" && user.Role != "root")
            {
                throw new UnauthorizedAccessException("غير مصرح بترقية أي حساب إلى رتبة Root.");
            }

            // Authority: a caller may only modify a strictly lower tier (root may modify anyone); everybody may rename themselves
            if (isSelf)
            {
                if (user.Role != "root" && targetRole != (user.Role == "admin" ? "admin" : "cashier"))
                {
                    throw new UnauthorizedAccessException("لا يمكنك تغيير رتبتك بنفسك.");
                }
                if (isActive != user.IsActive)
                {
                    throw new UnauthorizedAccessException("لا يمكنك تغيير حالة حسابك بنفسك.");
                }
            }
            else
            {
                if (Tier(caller) < TIER_MANAGER)
                {
                    throw new UnauthorizedAccessException("غير مصرح: تعديل بيانات الموظفين يتطلب صلاحيات مدير النظام.");
                }
                if (!CallerOutranks(caller, user))
                {
                    if (targetTier >= TIER_OWNER)
                    {
                        throw new UnauthorizedAccessException("لا يمكن تعديل حساب صاحب المحل.");
                    }
                    throw new UnauthorizedAccessException("إدارة حسابات المديرين متاحة لصاحب المحل فقط.");
                }
            }

            bool promoting = user.Role != "root" && user.Role != "admin" && targetRole == "admin";
            bool demoting = user.Role == "admin" && targetTier == TIER_MANAGER && targetRole != "admin";
            if (promoting && Tier(caller) < TIER_OWNER)
            {
                throw new UnauthorizedAccessException("ترقية موظف إلى رتبة مدير متاحة لصاحب المحل فقط.");
            }

            if (user.IsActive && (user.Role == "admin" || user.Role == "root") && (targetRole != "admin" && targetRole != "root" || !isActive))
            {
                int activeAdmins = _userRepo.GetActiveAdminCount();
                if (activeAdmins <= 1)
                {
                    throw new InvalidOperationException("لا يمكن تعطيل أو تغيير دور آخر مدير نظام نشط.");
                }
            }

            bool wasActive = user.IsActive;
            string oldRole = user.Role;
            if (!string.IsNullOrWhiteSpace(displayName))
            {
                user.DisplayName = displayName.Trim();
            }

            string reparentChildrenTo = null;
            if (promoting)
            {
                // Promoted accounts become managers directly under the owner
                user.Role = "admin";
                user.ParentId = GetOwnerId();
                user.CanDelegate = true;
                user.MaxDepth = 1;
                user.PermissionsJson = null;
            }
            else if (demoting)
            {
                // Demoted managers become plain cashiers under the owner; their cashiers move to the owner too
                string ownerId = GetOwnerId();
                user.Role = "cashier";
                user.ParentId = ownerId;
                user.CanDelegate = false;
                user.MaxDepth = 0;
                user.PermissionsJson = null;
                reparentChildrenTo = ownerId;
            }
            user.IsActive = isActive;

            _userRepo.Update(user, reparentChildrenTo);
            LogAudit("USER_UPDATED", "SECURITY", user.Username, string.Format("تم تحديث بيانات الموظف: {0} ({1}) - الحالة: {2}", user.DisplayName, user.Role, isActive ? "نشط" : "معطّل"));
            if (promoting || demoting)
            {
                LogAudit("USER_ROLE_CHANGED", "SECURITY", user.Username, string.Format("تغيير رتبة الموظف {0} من {1} إلى {2}", user.DisplayName, oldRole, user.Role));
            }

            // Disabling a manager never disables his cashiers; only legacy delegating cashiers cascade to their subordinates
            if (wasActive && !isActive && user.Role != "admin" && user.Role != "root")
            {
                CascadeDeactivate(user.Id);
            }
        }

        public void UpdateUserPermissions(string userId, Dictionary<string, bool> permissions)
        {
            if (_userRepo == null) throw new InvalidOperationException("UserRepository is null");
            var user = _userRepo.GetById(userId);
            if (user == null) throw new ArgumentException("الموظف غير موجود");

            if (user.Role == "root" || user.Username == "root")
            {
                throw new InvalidOperationException("حساب الـ Root يملك جميع الصلاحيات دائماً ولا يمكن تقييده أو سحب الصلاحيات منه.");
            }

            if (IsOwnerUser(user) && !IsCurrentSessionRoot())
            {
                throw new InvalidOperationException("لا يمكن تعديل صلاحيات صاحب المحل إلا من خلال حساب الـ Root الأعلى.");
            }

            User caller = RequireHierarchyAuthority(user);
            bool targetIsManager = Tier(user) == TIER_MANAGER;
            List<string> grantedBefore = GrantedOwnerGradeKeys(user);
            if (targetIsManager)
            {
                // Only the owner/root reach here (tier rule). A manager keeps every daily power, so only the owner-grade grants are stored
                var grants = new Dictionary<string, bool>();
                for (int i = 0; i < DELEGABLE_OWNER_PERMISSIONS.Length; i++)
                {
                    string key = DELEGABLE_OWNER_PERMISSIONS[i];
                    if (permissions != null && permissions.ContainsKey(key) && permissions[key]) grants[key] = true;
                }
                permissions = grants;
            }
            else
            {
                if (caller.Role != "admin" && caller.Role != "root")
                {
                    // Non-admins persist a complete map bounded by their own and the target's parent permissions
                    User targetParent = !string.IsNullOrEmpty(user.ParentId) ? _userRepo.GetById(user.ParentId) : null;
                    permissions = BuildBoundedPermissionMap(user.Role, permissions, GetEffectivePermissions(caller),
                        targetParent != null ? GetEffectivePermissions(targetParent) : null);
                }
                if (permissions != null)
                {
                    // Cashiers can never hold owner-grade keys, whoever edits them
                    for (int i = 0; i < DELEGABLE_OWNER_PERMISSIONS.Length; i++)
                    {
                        permissions[DELEGABLE_OWNER_PERMISSIONS[i]] = false;
                    }
                }
            }

            string permsJson = permissions != null ? JsonConvert.SerializeObject(permissions) : "{}";
            user.PermissionsJson = permsJson;
            _userRepo.Update(user);
            LogAudit("USER_PERMISSIONS_UPDATED", "SECURITY", user.Username, string.Format("تم تحديث صلاحيات الحساب: {0}", user.DisplayName));
            if (targetIsManager) LogOwnerGradeChanges(caller, user, grantedBefore, GrantedOwnerGradeKeys(user));

            CascadeRevokePermissions(user.Id, targetIsManager ? GetEffectivePermissions(user) : permissions);
        }

        private void LogOwnerGradeChanges(User caller, User target, List<string> before, List<string> after)
        {
            var granted = new List<string>();
            var revoked = new List<string>();
            for (int i = 0; i < DELEGABLE_OWNER_PERMISSIONS.Length; i++)
            {
                string key = DELEGABLE_OWNER_PERMISSIONS[i];
                bool was = before.Contains(key);
                bool now = after.Contains(key);
                if (now && !was) granted.Add(key);
                else if (was && !now) revoked.Add(key);
            }
            if (granted.Count == 0 && revoked.Count == 0) return;
            LogAudit("USER_PERMISSIONS_CHANGED", "SECURITY", target.Username, string.Format(
                "صلاحيات خاصة بالمالك للمدير {0}: منح [{1}] - سحب [{2}] - بواسطة: {3}",
                target.DisplayName, string.Join(", ", granted.ToArray()), string.Join(", ", revoked.ToArray()), caller.Username));
        }

        public void SetUserDelegation(string userId, bool canDelegate, int maxDepth)
        {
            if (_userRepo == null) throw new InvalidOperationException("UserRepository is null");
            var user = _userRepo.GetById(userId);
            if (user == null) throw new ArgumentException("الموظف غير موجود");

            if (maxDepth < 0) maxDepth = 0;
            // Re-saving the same delegation (e.g. the edit form after a profile update) is a harmless no-op
            if (user.CanDelegate == canDelegate && user.MaxDepth == maxDepth) return;

            if (user.Role == "root")
            {
                throw new InvalidOperationException("حساب الـ Root يملك أعلى مستوى تفويض دائماً.");
            }

            User caller = RequireHierarchyAuthority(user);
            if (caller.Role != "admin" && caller.Role != "root")
            {
                // Depth budget shrinks with the target's distance below the caller in the tree
                int allowedDepth = Math.Max(0, caller.MaxDepth - GetDistanceBelow(user.Id, caller.Id));
                if (maxDepth > allowedDepth) maxDepth = allowedDepth;
                canDelegate = canDelegate && caller.CanDelegate && maxDepth > 0;
            }

            user.CanDelegate = canDelegate;
            user.MaxDepth = maxDepth;
            _userRepo.Update(user);
            LogAudit("USER_DELEGATION_UPDATED", "SECURITY", user.Username, string.Format("تحديث صلاحية التفويض للحساب: {0} (يمكنه التفويض: {1}, أقصى عمق: {2})", user.DisplayName, canDelegate, maxDepth));
        }

        // Every known permission gets an explicit value: requested (or the role default when omitted) AND held by caller AND parent
        private static Dictionary<string, bool> BuildBoundedPermissionMap(string targetRole, Dictionary<string, bool> requested,
            Dictionary<string, bool> callerPerms, Dictionary<string, bool> parentPerms)
        {
            var roleDefaults = GetPermissionsForRole(targetRole);
            var result = new Dictionary<string, bool>();
            for (int i = 0; i < ALL_PERMISSIONS.Length; i++)
            {
                string key = ALL_PERMISSIONS[i];
                bool wanted = requested != null && requested.ContainsKey(key)
                    ? requested[key]
                    : roleDefaults.ContainsKey(key) && roleDefaults[key];
                bool callerHas = callerPerms.ContainsKey(key) && callerPerms[key];
                bool parentHas = parentPerms == null || (parentPerms.ContainsKey(key) && parentPerms[key]);
                result[key] = wanted && callerHas && parentHas;
            }
            return result;
        }

        // Authoritative map: only keys explicitly true in the request survive (aliases normalised), still bounded by caller and parent
        private static Dictionary<string, bool> BuildExplicitPermissionMap(Dictionary<string, bool> requested,
            Dictionary<string, bool> callerPerms, Dictionary<string, bool> parentPerms)
        {
            var normalized = new Dictionary<string, bool>();
            if (requested != null)
            {
                foreach (var kvp in requested) normalized[kvp.Key] = kvp.Value;
            }
            SyncPermissionAliases(normalized);

            var result = new Dictionary<string, bool>();
            for (int i = 0; i < ALL_PERMISSIONS.Length; i++)
            {
                string key = ALL_PERMISSIONS[i];
                bool wanted = normalized.ContainsKey(key) && normalized[key];
                bool callerHas = callerPerms.ContainsKey(key) && callerPerms[key];
                bool parentHas = parentPerms == null || (parentPerms.ContainsKey(key) && parentPerms[key]);
                result[key] = wanted && callerHas && parentHas;
            }
            return result;
        }

        // Caller must be logged in, may not edit itself, and (unless admin/root) must be an ancestor of the target
        private User RequireHierarchyAuthority(User target)
        {
            User caller = _currentUserSession != null ? _userRepo.GetById(_currentUserSession.Id) : null;
            if (caller == null || !caller.IsActive)
            {
                throw new UnauthorizedAccessException("يجب تسجيل الدخول بحساب نشط لتعديل صلاحيات الموظفين.");
            }
            if (caller.Id == target.Id)
            {
                throw new UnauthorizedAccessException("لا يمكن تعديل صلاحيات أو تفويض حسابك بنفسك.");
            }
            bool callerIsAdmin = caller.Role == "admin" || caller.Role == "root";
            // Tier rule: managers manage cashiers only; owner and root manage managers; nobody edits an equal or higher tier
            if (callerIsAdmin && !CallerOutranks(caller, target))
            {
                throw new UnauthorizedAccessException("غير مصرح: لا يمكنك تعديل حساب بنفس مستواك أو أعلى منه. إدارة المديرين متاحة لصاحب المحل فقط.");
            }
            if (!callerIsAdmin && Tier(target) >= TIER_MANAGER)
            {
                throw new UnauthorizedAccessException("غير مصرح: لا يمكنك تعديل حساب مدير.");
            }
            if (!callerIsAdmin && !IsDescendantOf(target.Id, caller.Id))
            {
                throw new UnauthorizedAccessException("غير مصرح: يمكنك تعديل الحسابات التابعة لك فقط.");
            }
            return caller;
        }

        private bool IsDescendantOf(string userId, string ancestorId)
        {
            return GetDistanceBelow(userId, ancestorId) > 0;
        }

        // Number of parent links from userId up to ancestorId (1 = direct child); 0 when not a descendant
        private int GetDistanceBelow(string userId, string ancestorId)
        {
            if (string.IsNullOrEmpty(userId) || string.IsNullOrEmpty(ancestorId) || _userRepo == null) return 0;
            var visited = new HashSet<string>();
            int distance = 0;
            User current = _userRepo.GetById(userId);
            while (current != null && !string.IsNullOrEmpty(current.ParentId) && visited.Add(current.Id))
            {
                distance++;
                if (current.ParentId == ancestorId) return distance;
                current = _userRepo.GetById(current.ParentId);
            }
            return 0;
        }

        // Cascades only through legacy delegating cashiers: disabling a manager (or the owner) never disables his cashiers
        private void CascadeDeactivate(string parentId)
        {
            if (string.IsNullOrEmpty(parentId) || _userRepo == null) return;
            User parentUser = _userRepo.GetById(parentId);
            if (parentUser != null && (parentUser.Role == "admin" || parentUser.Role == "root")) return;
            var children = _userRepo.GetByParentId(parentId);
            for (int i = 0; i < children.Count; i++)
            {
                var child = children[i];
                if (child.Role == "admin" || child.Role == "root") continue;
                if (child.IsActive)
                {
                    _userRepo.SetStatus(child.Id, false);
                    LogAudit("CASCADE_DEACTIVATE", "SECURITY", child.Username, string.Format("تعطيل تلقائي للحساب {0} لتعطيل حسابه الأعلى", child.DisplayName));
                    CascadeDeactivate(child.Id);
                }
            }
        }

        private void CascadeRevokePermissions(string parentId, Dictionary<string, bool> parentPerms)
        {
            if (string.IsNullOrEmpty(parentId) || parentPerms == null || _userRepo == null) return;
            var children = _userRepo.GetByParentId(parentId);
            for (int i = 0; i < children.Count; i++)
            {
                var child = children[i];
                if (!string.IsNullOrEmpty(child.PermissionsJson))
                {
                    try
                    {
                        var childPerms = JsonConvert.DeserializeObject<Dictionary<string, bool>>(child.PermissionsJson);
                        if (childPerms != null)
                        {
                            bool changed = false;
                            var keys = new List<string>(childPerms.Keys);
                            for (int k = 0; k < keys.Count; k++)
                            {
                                string key = keys[k];
                                if (childPerms[key] && (!parentPerms.ContainsKey(key) || !parentPerms[key]))
                                {
                                    childPerms[key] = false;
                                    changed = true;
                                }
                            }
                            if (changed)
                            {
                                child.PermissionsJson = JsonConvert.SerializeObject(childPerms);
                                _userRepo.Update(child);
                                CascadeRevokePermissions(child.Id, childPerms);
                            }
                        }
                    }
                    catch
                    {
                    }
                }
            }
        }

        public List<UserDto> GetUserTree(string parentUserId = null)
        {
            if (_userRepo == null) return new List<UserDto>();

            var allUsers = _userRepo.GetAll(false);
            bool isRootCaller = _currentUserSession != null && _currentUserSession.Role == "root";
            var dtos = new Dictionary<string, UserDto>();
            for (int i = 0; i < allUsers.Count; i++)
            {
                // The developer root account is invisible to everyone else (same rule as GetAllUsers)
                if (!isRootCaller && allUsers[i].Role == "root") continue;
                var d = MapToDto(allUsers[i]);
                d.Children = new List<UserDto>();
                dtos[d.Id] = d;
            }

            var rootNodes = new List<UserDto>();
            foreach (var kvp in dtos)
            {
                var dto = kvp.Value;
                if (string.IsNullOrEmpty(dto.ParentId) || !dtos.ContainsKey(dto.ParentId))
                {
                    rootNodes.Add(dto);
                }
                else
                {
                    dtos[dto.ParentId].Children.Add(dto);
                }
            }

            // Managers before cashiers (root and owner first at the top level), then alphabetical
            rootNodes.Sort(CompareTreeNodes);
            foreach (var kvp2 in dtos)
            {
                kvp2.Value.Children.Sort(CompareTreeNodes);
            }

            if (!string.IsNullOrEmpty(parentUserId) && dtos.ContainsKey(parentUserId))
            {
                return new List<UserDto> { dtos[parentUserId] };
            }

            if (_currentUserSession != null && _currentUserSession.Role != "root" && _currentUserSession.Role != "admin")
            {
                if (dtos.ContainsKey(_currentUserSession.Id))
                {
                    return new List<UserDto> { dtos[_currentUserSession.Id] };
                }
            }

            return rootNodes;
        }

        private static int CompareTreeNodes(UserDto a, UserDto b)
        {
            int tierA = TierOf(a.Id, a.Username, a.Role);
            int tierB = TierOf(b.Id, b.Username, b.Role);
            if (tierA != tierB) return tierB.CompareTo(tierA);
            return string.Compare(a.DisplayName, b.DisplayName, StringComparison.CurrentCultureIgnoreCase);
        }

        public void SetUserPassword(string userId, string newPassword, string currentPasswordOrSupervisorPin)
        {
            if (_userRepo == null) throw new InvalidOperationException("UserRepository is null");
            var user = _userRepo.GetById(userId);
            if (user == null) throw new ArgumentException("الموظف غير موجود");

            if (string.IsNullOrEmpty(newPassword) || newPassword.Length < 4)
            {
                throw new ArgumentException("يجب أن لا تقل كلمة المرور عن 4 أحرف أو أرقام.");
            }

            User caller = _currentUserSession != null ? _userRepo.GetById(_currentUserSession.Id) : null;
            if (caller == null)
            {
                throw new UnauthorizedAccessException("غير مصرح بتغيير كلمة المرور دون تسجيل الدخول.");
            }
            if (user.Role == "root" && caller.Role != "root")
            {
                throw new UnauthorizedAccessException("حساب المطور (Root) يُدار بالتحدي المشفر فقط ولا يمكن تغيير بياناته.");
            }

            bool callerIsAdmin = caller.Role == "admin" || caller.Role == "root";
            if (caller.Id == user.Id && !callerIsAdmin)
            {
                // Self-service change must prove the current credential and is throttled like a login
                int remaining = GetUserRemainingLockoutSeconds(user);
                if (remaining > 0)
                {
                    throw new UnauthorizedAccessException(string.Format("الحساب مقفل مؤقتاً بسبب محاولات خاطئة. يرجى الانتظار {0} ثانية.", remaining));
                }
                bool proven = !string.IsNullOrEmpty(currentPasswordOrSupervisorPin) &&
                    (string.IsNullOrEmpty(user.PasswordHash)
                        ? VerifyUserPin(user.Id, currentPasswordOrSupervisorPin)
                        : VerifyUserPassword(user.Id, currentPasswordOrSupervisorPin));
                if (!proven)
                {
                    int failed = user.FailedAttempts + 1;
                    _userRepo.RecordLoginAttempt(user.Id, false, LoginLockoutSeconds(failed));
                    LogAudit("PASSWORD_CHANGE_FAILED", "SECURITY", user.Username, string.Format("محاولة تغيير كلمة مرور بكلمة حالية خاطئة (المحاولة {0})", failed));
                    throw new UnauthorizedAccessException("كلمة المرور الحالية غير صحيحة.");
                }
            }
            else if (caller.Id != user.Id)
            {
                RequireHierarchyAuthority(user);
            }

            byte[] salt = GenerateSalt();
            byte[] hash = HashWithSalt(newPassword, salt);
            _userRepo.UpdatePassword(userId, Convert.ToBase64String(hash), Convert.ToBase64String(salt));
            LogAudit("PASSWORD_CHANGED", "SECURITY", user.Username, string.Format("تم تغيير كلمة المرور للموظف: {0}", user.DisplayName));
        }

        public bool VerifyUserPassword(string userId, string password)
        {
            if (string.IsNullOrEmpty(userId) || string.IsNullOrEmpty(password) || _userRepo == null)
                return false;
            var user = _userRepo.GetById(userId);
            if (user == null || string.IsNullOrEmpty(user.PasswordHash) || string.IsNullOrEmpty(user.PasswordSalt))
                return false;

            try
            {
                byte[] salt = Convert.FromBase64String(user.PasswordSalt);
                byte[] expectedHash = Convert.FromBase64String(user.PasswordHash);
                byte[] actualHash = HashWithSalt(password, salt);
                return SlowEquals(expectedHash, actualHash);
            }
            catch
            {
                return false;
            }
        }

        public bool HasPermission(string permKey)
        {
            return HasPermission(null, permKey);
        }

        public bool HasPermission(string userId, string permKey)
        {
            if (string.IsNullOrEmpty(permKey)) return true;
            if (_userRepo == null) return false;

            User user = !string.IsNullOrEmpty(userId) ? _userRepo.GetById(userId) : null;
            if (user == null && _currentUserSession != null)
            {
                user = _userRepo.GetById(_currentUserSession.Id);
            }
            if (user == null) return false;

            // Authorization is decided by role only (Audit F-13); the owner account is enforced as role "admin" at startup.
            // Managers (non-owner admins) keep every key except the owner-grade ones, which need an explicit owner grant.
            if (user.Role == "root") return true;
            if (user.Role == "admin")
            {
                if (IsOwnerUser(user) || !IsOwnerOnlyPermission(permKey)) return true;
                return IsOwnerGradeGranted(user, permKey);
            }

            var perms = GetEffectivePermissions(user);
            return perms.ContainsKey(permKey) && perms[permKey];
        }

        public bool IsCurrentSessionRoot()
        {
            return _currentUserSession != null && _currentUserSession.Role == "root";
        }

        public bool IsCurrentSessionAdmin()
        {
            return _currentUserSession != null && (_currentUserSession.Role == "admin" || _currentUserSession.Role == "root");
        }

        public bool VerifyUserPin(string userId, string pin)
        {
            if (string.IsNullOrEmpty(userId) || string.IsNullOrEmpty(pin) || _userRepo == null)
                return false;

            User user = _userRepo.GetById(userId);
            if (user == null) return false;

            bool needsUpgrade;
            bool matches = VerifyStoredPin(user.PinCodeHash, user.PinSalt, pin, out needsUpgrade);
            if (matches && needsUpgrade)
            {
                UpgradeLegacyPinHash(user, pin);
            }
            return matches;
        }

        public void ChangeUserPinSecure(string targetUserId, string newPin, string currentPin, string supervisorPin)
        {
            if (_userRepo == null) throw new InvalidOperationException("UserRepository is null");

            User targetUser = _userRepo.GetById(targetUserId);
            if (targetUser == null) throw new ArgumentException("الموظف غير موجود");

            if (targetUser.Role == "root" && !IsCurrentSessionRoot())
            {
                throw new UnauthorizedAccessException("حساب المطور (Root) يُدار بالتحدي المشفر فقط ولا يمكن تعيين رقم سري له.");
            }

            bool isSelf = _currentUserSession != null && _currentUserSession.Id == targetUserId;
            // A session opened with the recovery code already proved ownership of the forgotten PIN
            bool recoverySession = isSelf && _recoveryLoginUserId == targetUserId;

            if (targetUser.Role == "admin")
            {
                // Changing an admin PIN requires: the account's own current PIN, the developer root session,
                // or approval from an admin strictly above the target (owner for a manager). A manager can never reset the owner or another manager.
                int approverTier = Tier(targetUser) + 1;
                bool verified = recoverySession;
                if (!verified && IsCurrentSessionRoot())
                {
                    verified = true;
                }
                if (!verified && !string.IsNullOrEmpty(currentPin))
                {
                    verified = VerifyCurrentPinThrottled(targetUser, currentPin);
                }
                if (!verified && !string.IsNullOrEmpty(supervisorPin))
                {
                    verified = VerifySupervisorPin(supervisorPin, "CHANGE_ADMIN_PIN", approverTier).Success;
                }

                if (!verified)
                {
                    throw new UnauthorizedAccessException("الرقم السري الحالي لمدير النظام غير صحيح. لا يمكن تغيير الرقم السري دون تأكيد الهوية.");
                }
            }
            else
            {
                // Target is cashier: must be admin session, or supervisor pin, or the cashier themselves with currentPin
                bool authorized = false;
                if (IsCurrentSessionAdmin())
                {
                    authorized = true;
                }
                else if (!string.IsNullOrEmpty(supervisorPin))
                {
                    authorized = VerifySupervisorPin(supervisorPin, "CHANGE_CASHIER_PIN").Success;
                }
                else if (isSelf && !string.IsNullOrEmpty(currentPin))
                {
                    authorized = VerifyCurrentPinThrottled(targetUser, currentPin);
                }

                if (!authorized)
                {
                    throw new UnauthorizedAccessException("غير مصرح: تغيير الرقم السري للكاشير يتطلب صلاحيات مدير النظام أو إدخال الرقم السري الحالي.");
                }
            }

            ChangeUserPin(targetUserId, newPin);
        }

        // Current-PIN checks are throttled with the account's persistent login counter so they cannot be used to guess PINs
        private bool VerifyCurrentPinThrottled(User user, string pin)
        {
            int remaining = GetUserRemainingLockoutSeconds(user);
            if (remaining > 0)
            {
                throw new UnauthorizedAccessException(string.Format("الحساب مقفل مؤقتاً بسبب محاولات خاطئة. يرجى الانتظار {0} ثانية.", remaining));
            }
            if (VerifyUserPin(user.Id, pin)) return true;

            int failed = user.FailedAttempts + 1;
            _userRepo.RecordLoginAttempt(user.Id, false, LoginLockoutSeconds(failed));
            LogAudit("PIN_CHANGE_FAILED", "SECURITY", user.Username, string.Format("محاولة تغيير رقم سري برقم حالي خاطئ (المحاولة {0})", failed));
            return false;
        }

        public void ChangeUserPin(string userId, string newPin)
        {
            if (_userRepo == null) throw new InvalidOperationException("UserRepository is null");

            if (string.IsNullOrEmpty(newPin) || newPin.Length < 4 || newPin.Length > 8)
                throw new ArgumentException("يجب أن يتكون الرقم السري من 4 إلى 8 أرقام");

            for (int i = 0; i < newPin.Length; i++)
            {
                if (!char.IsDigit(newPin[i])) throw new ArgumentException("يجب أن يحتوي الرقم السري على أرقام فقط");
            }

            if (IsWeakPin(newPin))
            {
                throw new ArgumentException("الرقم السري ضعيف وسهل التخمين. يرجى اختيار رقم سري أقوى (غير مكرر أو متتالي).");
            }

            var user = _userRepo.GetById(userId);
            if (user == null) throw new ArgumentException("الموظف غير موجود");

            byte[] salt = GenerateSalt();
            byte[] hash = HashWithSalt(newPin, salt);

            _userRepo.UpdatePin(userId, Convert.ToBase64String(hash), Convert.ToBase64String(salt));
            if (_currentUserSession != null && _currentUserSession.Id == userId)
            {
                _currentUserSession.MustChangePin = false;
                _currentUserSession.IsRecoverySession = false;
                _recoveryLoginUserId = null;
            }
            LogAudit("USER_PIN_CHANGED", "SECURITY", user.Username, string.Format("تم تغيير الرقم السري للموظف: {0}", user.DisplayName));
        }

        public static bool IsWeakPin(string pin)
        {
            if (string.IsNullOrEmpty(pin) || pin.Length < 4) return true;
            string[] sequential = new string[] {
                "1234", "4321", "0000", "1111", "2222", "3333", "4444",
                "5555", "6666", "7777", "8888", "9999", "0123", "9876",
                "12345", "54321", "123456", "654321"
            };
            for (int i = 0; i < sequential.Length; i++)
            {
                if (pin == sequential[i]) return true;
            }
            return false;
        }

        public PinVerificationResult VerifySupervisorPin(string pin, string action)
        {
            return VerifySupervisorPin(pin, action, TIER_MANAGER);
        }

        // minApproverTier: 1 = any admin (manager/owner/root), 2 = owner or root only
        public PinVerificationResult VerifySupervisorPin(string pin, string action, int minApproverTier)
        {
            var result = new PinVerificationResult();

            if (string.IsNullOrEmpty(pin))
            {
                result.Success = false;
                result.Message = "الرقم السري لمدير النظام مطلوب.";
                return result;
            }

            // Persistent supervisor-approval throttle (F-36): survives restarts, independent of login/recovery counters
            int remainingSeconds = GetRemainingLockoutSeconds(KEY_SUPERVISOR_LOCKOUT);
            if (remainingSeconds > 0)
            {
                result.Success = false;
                result.IsLocked = true;
                result.RemainingLockoutSeconds = remainingSeconds;
                result.Message = string.Format("تم تفعيل القفل الأمني لاعتماد المشرف بسبب تكرار المحاولات الفاشلة. يرجى الانتظار {0} ثانية.", remainingSeconds);
                return result;
            }

            // SEC-01 FIX: Backdoor OTP bypass removed. Supervisors must use their registered credentials.

            if (_userRepo == null)
            {
                string legacyHash = _settingsRepo.Get(KEY_PIN_HASH, "");
                if (string.IsNullOrEmpty(legacyHash))
                {
                    result.Success = false;
                    result.Message = "لا يوجد حساب مدير نظام مسجل برقم سري.";
                    return result;
                }
                return VerifyPin(pin, action);
            }

            var allUsers = _userRepo.GetAll(true);
            bool anyAdmin = false;
            for (int i = 0; i < allUsers.Count; i++)
            {
                var admin = allUsers[i];
                if (!admin.IsActive || (admin.Role != "admin" && admin.Role != "root")) continue;
                // Approval must come from an account of at least the requested tier
                if (Tier(admin) < minApproverTier) continue;
                anyAdmin = true;
                if (string.IsNullOrEmpty(admin.PinCodeHash)) continue;
                // An admin whose login is locked cannot approve operations either
                if (GetUserRemainingLockoutSeconds(admin) > 0) continue;

                bool needsUpgrade;
                if (!VerifyStoredPin(admin.PinCodeHash, admin.PinSalt, pin, out needsUpgrade)) continue;
                if (needsUpgrade)
                {
                    UpgradeLegacyPinHash(admin, pin);
                }

                ResetFailureCounter(KEY_SUPERVISOR_FAILED, KEY_SUPERVISOR_LOCKOUT);
                LogAudit("SUPERVISOR_OVERRIDE", "SECURITY", admin.Username, string.Format("موافقة مدير على العملية: {0} بواسطة {1}", action, admin.DisplayName));
                result.Success = true;
                result.SupervisorName = admin.DisplayName;
                result.Message = "تمت موافقة مدير النظام بنجاح.";
                return result;
            }

            if (!anyAdmin)
            {
                result.Success = false;
                result.Message = "لا يوجد حساب مدير نظام نشط مسجل برقم سري.";
                return result;
            }

            int failed = IncrementFailureCounter(KEY_SUPERVISOR_FAILED, 1);
            int lockoutSec = 0;
            if (failed >= 20) lockoutSec = 3600;
            else if (failed >= 10) lockoutSec = 1800;
            else if (failed >= 5) lockoutSec = 300;
            else if (failed >= 3) lockoutSec = 30;
            ExtendLockout(KEY_SUPERVISOR_LOCKOUT, lockoutSec);
            LogAudit("SUPERVISOR_PIN_FAILED", "SECURITY", failed.ToString(), string.Format("محاولة خاطئة لاعتماد المشرف للعملية {0} (المحاولة {1})", action, failed));

            result.Success = false;
            result.IsLocked = lockoutSec > 0;
            result.RemainingLockoutSeconds = GetRemainingLockoutSeconds(KEY_SUPERVISOR_LOCKOUT);
            result.FailedAttempts = failed;
            result.Message = lockoutSec > 0
                ? string.Format("تم إدخال الرقم السري بشكل خاطئ عدة مرات. تم قفل التحقق لمدة {0} ثانية.", result.RemainingLockoutSeconds)
                : "الرقم السري لمدير النظام غير صحيح.";
            return result;
        }

        public Dictionary<string, bool> GetProtectedActions()
        {
            string json = _settingsRepo.Get(KEY_PROTECTED_ACTIONS, "");
            var defaultActions = new Dictionary<string, bool>();
            defaultActions["settings"] = true;       // شاشة الإعدادات
            defaultActions["reports"] = true;        // شاشة التقارير والأرباح
            defaultActions["product_edit"] = true;   // تعديل أسعار وحذف المنتجات
            defaultActions["stock_adjust"] = true;   // تسوية المخزون اليدوية
            defaultActions["db_recovery"] = true;    // استعادة قاعدة البيانات
            defaultActions["discounts"] = false;     // خصومات الكاشير
            defaultActions["users"] = true;          // إدارة الموظفين

            if (!string.IsNullOrEmpty(json))
            {
                try
                {
                    var saved = JsonConvert.DeserializeObject<Dictionary<string, bool>>(json);
                    if (saved != null)
                    {
                        foreach (var kvp in saved)
                        {
                            defaultActions[kvp.Key] = kvp.Value;
                        }
                    }
                }
                catch
                {
                    // Fallback to defaults
                }
            }

            return defaultActions;
        }

        public PinVerificationResult VerifyPin(string pin, string action)
        {
            var result = new PinVerificationResult();

            int remainingSeconds = GetRemainingLockoutSeconds();
            if (remainingSeconds > 0)
            {
                result.Success = false;
                result.IsLocked = true;
                result.RemainingLockoutSeconds = remainingSeconds;
                result.Message = string.Format("النظام مقفل مؤقتاً لحماية البيانات. يرجى الانتظار {0} ثانية.", remainingSeconds);
                return result;
            }

            string pinHash = _settingsRepo.Get(KEY_PIN_HASH, "");
            string pinSaltStr = _settingsRepo.Get(KEY_PIN_SALT, "");

            if (string.IsNullOrEmpty(pinHash) || string.IsNullOrEmpty(pinSaltStr))
            {
                result.Success = true;
                result.IsLocked = false;
                result.RemainingLockoutSeconds = 0;
                result.FailedAttempts = 0;
                result.Message = "الرقم السري غير مفعل.";
                return result;
            }

            byte[] salt = Convert.FromBase64String(pinSaltStr);
            byte[] expectedHash = Convert.FromBase64String(pinHash);
            byte[] actualHash = HashWithSalt(pin ?? "", salt);

            bool matches = SlowEquals(expectedHash, actualHash);

            if (matches)
            {
                _settingsRepo.Set(KEY_FAILED_ATTEMPTS, "0");
                _settingsRepo.Set(KEY_LOCKOUT_UNTIL, "");

                LogAudit("PIN_VERIFIED", "ACTION", action ?? "general", "تم التحقق من الرقم السري بنجاح");

                result.Success = true;
                result.IsLocked = false;
                result.RemainingLockoutSeconds = 0;
                result.FailedAttempts = 0;
                result.Message = "تم التحقق بنجاح.";
                return result;
            }
            else
            {
                int failed = IncrementFailureCounter(KEY_FAILED_ATTEMPTS, 1);

                int lockoutSec = 0;
                if (failed >= 10)
                {
                    lockoutSec = 300;
                }
                else if (failed >= 5)
                {
                    lockoutSec = 30;
                }

                if (lockoutSec > 0)
                {
                    ExtendLockout(KEY_LOCKOUT_UNTIL, lockoutSec);
                    LogAudit("PIN_LOCKOUT", "SECURITY", failed.ToString(), string.Format("تم قفل الرقم السري لمدة {0} ثانية بعد {1} محاولات خاطئة", lockoutSec, failed));
                }
                else
                {
                    LogAudit("PIN_FAILED", "SECURITY", failed.ToString(), string.Format("محاولة إدخال رقم سري خاطئة ({0})", failed));
                }

                result.Success = false;
                result.IsLocked = lockoutSec > 0;
                result.RemainingLockoutSeconds = lockoutSec;
                result.FailedAttempts = failed;
                result.Message = lockoutSec > 0
                    ? string.Format("تم إدخال الرقم السري بشكل خاطئ عدة مرات. تم قفل المحاولات لمدة {0} ثانية.", lockoutSec)
                    : string.Format("الرقم السري غير صحيح. المحاولات المتبقية قبل القفل: {0}", Math.Max(0, 5 - failed));
                return result;
            }
        }

        public SetPinResult SetPin(string newPin, string currentPin, string recoveryCode)
        {
            return SetPinCore(newPin, currentPin, recoveryCode, false);
        }

        private static string ValidateNewPinFormat(string newPin)
        {
            if (string.IsNullOrEmpty(newPin) || newPin.Length < 4 || newPin.Length > 8)
            {
                return "يجب أن يتكون الرقم السري من 4 إلى 8 أرقام.";
            }

            for (int i = 0; i < newPin.Length; i++)
            {
                if (!char.IsDigit(newPin[i]))
                {
                    return "يجب أن يحتوي الرقم السري على أرقام فقط.";
                }
            }

            if (IsWeakPin(newPin))
            {
                return "الرقم السري ضعيف وسهل التخمين. يرجى اختيار رقم سري أقوى (غير مكرر أو متتالي).";
            }
            return null;
        }

        private SetPinResult SetPinCore(string newPin, string currentPin, string recoveryCode, bool identityAlreadyVerified)
        {
            var res = new SetPinResult();

            string formatError = ValidateNewPinFormat(newPin);
            if (formatError != null)
            {
                res.Success = false;
                res.Message = formatError;
                return res;
            }

            string existingHash = _settingsRepo.Get(KEY_PIN_HASH, "");
            bool isExisting = !string.IsNullOrEmpty(existingHash);

            bool sessionOpenedByRecovery = _currentUserSession != null && _recoveryLoginUserId == _currentUserSession.Id;
            if (isExisting && !identityAlreadyVerified && !sessionOpenedByRecovery)
            {
                bool authorized = false;
                if (!string.IsNullOrEmpty(currentPin))
                {
                    var verifyRes = VerifyPin(currentPin, "PIN_CHANGE_ATTEMPT");
                    if (verifyRes.Success)
                    {
                        authorized = true;
                    }
                    else
                    {
                        res.Success = false;
                        res.Message = "الرقم السري الحالي غير صحيح.";
                        return res;
                    }
                }
                else if (!string.IsNullOrEmpty(recoveryCode))
                {
                    bool validRecovery = VerifyRecoveryCodeInternal(recoveryCode);
                    if (validRecovery)
                    {
                        authorized = true;
                    }
                    else
                    {
                        res.Success = false;
                        res.Message = "رمز الاسترجاع غير صحيح.";
                        return res;
                    }
                }

                if (!authorized)
                {
                    res.Success = false;
                    res.Message = "يلزم إدخال الرقم السري الحالي أو رمز الاسترجاع لتغيير الرقم السري.";
                    return res;
                }
            }

            byte[] pinSalt = GenerateSalt();
            byte[] pinHash = HashWithSalt(newPin, pinSalt);

            string newRecoveryCode = GenerateRecoveryCode();
            byte[] recSalt = GenerateSalt();
            byte[] recHash = HashWithSalt(newRecoveryCode, recSalt);

            var batch = new Dictionary<string, string>();
            batch[KEY_PIN_HASH] = Convert.ToBase64String(pinHash);
            batch[KEY_PIN_SALT] = Convert.ToBase64String(pinSalt);
            batch[KEY_RECOVERY_HASH] = Convert.ToBase64String(recHash);
            batch[KEY_RECOVERY_SALT] = Convert.ToBase64String(recSalt);
            batch[KEY_PIN_ENABLED] = "1";
            batch[KEY_FAILED_ATTEMPTS] = "0";
            batch[KEY_LOCKOUT_UNTIL] = "";

            _settingsRepo.SaveBatch(batch);

            // Sync with default admin user if present
            if (_userRepo != null)
            {
                var admin = _userRepo.GetById("usr_admin_default");
                if (admin == null)
                {
                    admin = _userRepo.GetByUsername("admin");
                }
                if (admin != null)
                {
                    _userRepo.UpdatePin(admin.Id, Convert.ToBase64String(pinHash), Convert.ToBase64String(pinSalt));
                    if (_currentUserSession != null && (_currentUserSession.Id == admin.Id || _currentUserSession.Role == "admin"))
                    {
                        _currentUserSession.MustChangePin = false;
                    }
                }
            }

            _recoveryLoginUserId = null;
            LogAudit(isExisting ? "PIN_CHANGED" : "PIN_CREATED", "SECURITY", "OWNER", "تم تحديث الرقم السري وإنشاء رمز استرجاع جديد للطوارئ");

            res.Success = true;
            res.Message = "تم حفظ الرقم السري بنجاح. احفظ رمز الاسترجاع المرفق في مكان آمن.";
            res.RecoveryCode = newRecoveryCode;
            return res;
        }

        public SetPinResult ResetWithRecoveryCode(string recoveryCode, string newPin)
        {
            var res = new SetPinResult();

            int remainingSeconds = GetRemainingLockoutSeconds(KEY_RECOVERY_LOCKOUT);
            if (remainingSeconds > 0)
            {
                LogAudit("RECOVERY_RESET_LOCKED", "SECURITY", "OWNER", string.Format("محاولة استخدام رمز الاسترجاع أثناء القفل الأمني ({0} ثانية متبقية)", remainingSeconds));
                res.Success = false;
                res.Message = string.Format("النظام مقفل مؤقتاً. يرجى الانتظار {0} ثانية.", remainingSeconds);
                return res;
            }

            if (string.IsNullOrEmpty(recoveryCode))
            {
                LogAudit("RECOVERY_RESET_FAILED", "SECURITY", "OWNER", "محاولة استرجاع بدون رمز استرجاع");
                res.Success = false;
                res.Message = "رمز الاسترجاع مطلوب.";
                return res;
            }

            // Validate the new PIN first so a typo never consumes a single-use recovery token
            string formatError = ValidateNewPinFormat(newPin);
            if (formatError != null)
            {
                LogAudit("RECOVERY_RESET_FAILED", "SECURITY", "OWNER", "محاولة استرجاع برقم سري جديد غير صالح");
                res.Success = false;
                res.Message = formatError;
                return res;
            }

            if (!VerifyRecoveryCodeInternal(recoveryCode))
            {
                int failed = IncrementFailureCounter(KEY_RECOVERY_FAILED, 2);

                int lockoutSec = 0;
                if (failed >= 20)
                {
                    lockoutSec = 3600;
                }
                else if (failed >= 10)
                {
                    lockoutSec = 900;
                }
                else if (failed >= 5)
                {
                    lockoutSec = 60;
                }
                ExtendLockout(KEY_RECOVERY_LOCKOUT, lockoutSec);

                LogAudit("RECOVERY_CODE_FAILED", "SECURITY", failed.ToString(), string.Format("محاولة خاطئة لاستخدام رمز استرجاع الطوارئ (قفل {0} ثانية)", lockoutSec));

                res.Success = false;
                res.Message = lockoutSec > 0
                    ? string.Format("رمز الاسترجاع غير صحيح. تم قفل المحاولات لمدة {0} ثانية.", lockoutSec)
                    : "رمز الاسترجاع غير صحيح.";
                return res;
            }

            SetPinResult setRes = SetPinCore(newPin, null, recoveryCode, true);
            if (setRes.Success)
            {
                ResetFailureCounter(KEY_RECOVERY_FAILED, KEY_RECOVERY_LOCKOUT);
            }
            LogAudit(setRes.Success ? "RECOVERY_RESET_SUCCESS" : "RECOVERY_RESET_FAILED", "SECURITY", "OWNER",
                setRes.Success ? "تمت إعادة تعيين رقم المالك السري باستخدام رمز الاسترجاع" : "فشل حفظ الرقم السري الجديد بعد قبول رمز الاسترجاع");
            return setRes;
        }

        public bool DisablePin(string currentPin)
        {
            var verify = VerifyPin(currentPin, "PIN_DISABLE");
            if (!verify.Success) return false;

            _settingsRepo.Set(KEY_PIN_ENABLED, "0");
            LogAudit("PIN_DISABLED", "SECURITY", "OWNER", "تم إلغاء تفعيل قفل الشاشات بالرقم السري");
            return true;
        }

        public bool EnablePin(string currentPin)
        {
            var verify = VerifyPin(currentPin, "PIN_ENABLE");
            if (!verify.Success) return false;

            _settingsRepo.Set(KEY_PIN_ENABLED, "1");
            LogAudit("PIN_ENABLED", "SECURITY", "OWNER", "تم إعادة تفعيل قفل الشاشات بالرقم السري");
            return true;
        }

        public bool SaveProtectedActions(Dictionary<string, bool> actions, string currentPin)
        {
            string pinHash = _settingsRepo.Get(KEY_PIN_HASH, "");
            if (!string.IsNullOrEmpty(pinHash) && !string.IsNullOrEmpty(currentPin))
            {
                var verify = VerifyPin(currentPin, "SAVE_PROTECTED_ACTIONS");
                if (!verify.Success) return false;
            }

            string json = JsonConvert.SerializeObject(actions ?? new Dictionary<string, bool>());
            _settingsRepo.Set(KEY_PROTECTED_ACTIONS, json);
            LogAudit("PROTECTED_ACTIONS_UPDATED", "SECURITY", "SETTINGS", json);
            return true;
        }

        private bool VerifyRecoveryCodeInternal(string recoveryCode)
        {
            if (string.IsNullOrEmpty(recoveryCode)) return false;

            string cleanCode = recoveryCode.Trim().ToUpperInvariant().Replace(" ", "").Replace("-", "");

            // 1. PIN Reset Recovery code from Cloudflare license server (RFQ-REC-...) - SEC-02
            if (recoveryCode.Trim().StartsWith("RFQ-REC-", StringComparison.OrdinalIgnoreCase))
            {
                try
                {
                    string token = recoveryCode.Trim().Substring("RFQ-REC-".Length);
                    string fp = EncryptionService.GenerateDeviceFingerprint();
                    string verifyError;
                    VerifiedLicenseToken verified = LicenseTokenVerifier.Verify(token, fp, "pin_reset", out verifyError);
                    if (verified != null)
                    {
                        if (verified.IsExpired(DateTime.UtcNow))
                        {
                            Logger.Warn("محاولة استخدام كود استرجاع منتهي الصلاحية.");
                            return false;
                        }

                        // Single-use JTI verification
                        if (!string.IsNullOrEmpty(verified.Jti))
                        {
                            string usedJtis = _settingsRepo != null ? _settingsRepo.Get("used_recovery_jtis", "") : "";
                            if (usedJtis.Contains(verified.Jti))
                            {
                                Logger.Warn("محاولة إعادة استخدام كود استرجاع مستهلك سابقاً: " + verified.Jti);
                                return false;
                            }
                            if (_settingsRepo != null)
                            {
                                _settingsRepo.Set("used_recovery_jtis", usedJtis + ";" + verified.Jti);
                            }
                        }
                        return true;
                    }
                }
                catch (Exception ex)
                {
                    Logger.Warn("فشل التحقق من كود الاسترجاع الرقمي: " + ex.Message);
                }
            }

            // 2. Owner recovery hash stored by SecurityService
            string recHash = _settingsRepo.Get(KEY_RECOVERY_HASH, "");
            string recSaltStr = _settingsRepo.Get(KEY_RECOVERY_SALT, "");

            if (!string.IsNullOrEmpty(recHash) && !string.IsNullOrEmpty(recSaltStr))
            {
                byte[] salt = Convert.FromBase64String(recSaltStr);
                byte[] expectedHash = Convert.FromBase64String(recHash);
                byte[] actualHash = HashWithSalt(cleanCode, salt);
                byte[] actualHashRaw = HashWithSalt(recoveryCode.Trim().ToUpperInvariant(), salt);

                if (SlowEquals(expectedHash, actualHash) || SlowEquals(expectedHash, actualHashRaw))
                {
                    return true;
                }
            }

            // 3. Owner recovery code stored by BackupService
            string ownerHash = _settingsRepo.Get("owner_recovery_code_hash", "");
            if (!string.IsNullOrEmpty(ownerHash))
            {
                string computedHash = EncryptionService.HashRecoveryCode(cleanCode);
                if (string.Equals(ownerHash, computedHash, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }

            return false;
        }

        private int GetRemainingLockoutSeconds()
        {
            return GetRemainingLockoutSeconds(KEY_LOCKOUT_UNTIL);
        }

        private int GetRemainingLockoutSeconds(string lockoutKey)
        {
            return RemainingSeconds(_settingsRepo.Get(lockoutKey, ""));
        }

        private int GetUserRemainingLockoutSeconds(User user)
        {
            return user == null ? 0 : RemainingSeconds(user.LockoutUntil);
        }

        // Lockout timestamps are stored as UTC ISO-8601; parse them as UTC regardless of the machine time zone
        private static int RemainingSeconds(string lockoutUntilText)
        {
            DateTime lockoutUntil;
            if (!TryParseUtc(lockoutUntilText, out lockoutUntil)) return 0;
            DateTime utcNow = DateTime.UtcNow;
            return lockoutUntil > utcNow ? (int)Math.Ceiling((lockoutUntil - utcNow).TotalSeconds) : 0;
        }

        private static bool TryParseUtc(string text, out DateTime utc)
        {
            utc = DateTime.MinValue;
            if (string.IsNullOrEmpty(text)) return false;
            return DateTime.TryParse(text, System.Globalization.CultureInfo.InvariantCulture,
                System.Globalization.DateTimeStyles.AdjustToUniversal | System.Globalization.DateTimeStyles.AssumeUniversal, out utc);
        }

        private int IncrementFailureCounter(string failedKey, int step)
        {
            int failed;
            int.TryParse(_settingsRepo.Get(failedKey, "0"), out failed);
            failed += step;
            _settingsRepo.Set(failedKey, failed.ToString());
            return failed;
        }

        // Never shortens an existing lockout: the stored deadline only moves forward
        private void ExtendLockout(string lockoutKey, int seconds)
        {
            if (seconds <= 0) return;
            DateTime candidate = DateTime.UtcNow.AddSeconds(seconds);
            DateTime existing;
            if (TryParseUtc(_settingsRepo.Get(lockoutKey, ""), out existing) && existing >= candidate) return;
            _settingsRepo.Set(lockoutKey, candidate.ToString("o"));
        }

        private void ResetFailureCounter(string failedKey, string lockoutKey)
        {
            _settingsRepo.Set(failedKey, "0");
            _settingsRepo.Set(lockoutKey, "");
        }

        private static byte[] HashWithSalt(string input, byte[] salt)
        {
            return HashWithSalt(input, salt, PBKDF2_ITERATIONS);
        }

        private static byte[] HashWithSalt(string input, byte[] salt, int iterations)
        {
            using (var deriveBytes = new Rfc2898DeriveBytes(input ?? "", salt, iterations))
            {
                return deriveBytes.GetBytes(HASH_BYTE_SIZE);
            }
        }

        // Verifies a stored user PIN; the legacy 10k-iteration PBKDF2 format reports needsUpgrade
        private static bool VerifyStoredPin(string storedHash, string storedSalt, string pin, out bool needsUpgrade)
        {
            needsUpgrade = false;
            if (string.IsNullOrEmpty(storedHash) || string.IsNullOrEmpty(pin)) return false;

            // Plaintext seeds are converted once at startup (MigratePlaintextPins); an unsalted value is never accepted
            if (string.IsNullOrEmpty(storedSalt)) return false;

            byte[] salt;
            byte[] expectedHash;
            try
            {
                salt = Convert.FromBase64String(storedSalt);
                expectedHash = Convert.FromBase64String(storedHash);
            }
            catch (FormatException)
            {
                return false;
            }

            if (SlowEquals(expectedHash, HashWithSalt(pin, salt, PBKDF2_ITERATIONS)))
            {
                return true;
            }
            if (SlowEquals(expectedHash, HashWithSalt(pin, salt, LEGACY_PBKDF2_ITERATIONS)))
            {
                needsUpgrade = true;
                return true;
            }
            return false;
        }

        private void UpgradeLegacyPinHash(User user, string pin)
        {
            if (_userRepo == null || user == null) return;
            byte[] salt = GenerateSalt();
            string hashStr = Convert.ToBase64String(HashWithSalt(pin, salt));
            string saltStr = Convert.ToBase64String(salt);
            _userRepo.UpdatePin(user.Id, hashStr, saltStr, false);
            user.PinCodeHash = hashStr;
            user.PinSalt = saltStr;
            LogAudit("USER_PIN_REHASHED", "SECURITY", user.Username, "تمت ترقية تشفير الرقم السري للموظف إلى المعيار الحالي");
        }

        private static byte[] GenerateSalt()
        {
            byte[] salt = new byte[SALT_BYTE_SIZE];
            using (var rng = new RNGCryptoServiceProvider())
            {
                rng.GetBytes(salt);
            }
            return salt;
        }

        private static string GenerateRecoveryCode()
        {
            const string chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
            var result = new StringBuilder();
            result.Append("RFK-");

            byte[] randomBytes = new byte[8];
            using (var rng = new RNGCryptoServiceProvider())
            {
                rng.GetBytes(randomBytes);
            }

            for (int i = 0; i < 8; i++)
            {
                if (i == 4) result.Append("-");
                result.Append(chars[randomBytes[i] % chars.Length]);
            }

            return result.ToString();
        }

        private static bool SlowEquals(byte[] a, byte[] b)
        {
            if (a == null || b == null) return false;
            uint diff = (uint)a.Length ^ (uint)b.Length;
            for (int i = 0; i < a.Length && i < b.Length; i++)
            {
                diff |= (uint)(a[i] ^ b[i]);
            }
            return diff == 0;
        }

        public static readonly string[] ALL_PERMISSIONS = new string[]
        {
            "pos.access", "pos.sell", "pos.discount_line", "pos.discount_invoice", "pos.discount_unlimited",
            "pos.hold_invoice", "pos.price_override", "pos.void_line", "pos.quick_add", "pos.reprint", "pos.change_unit", "pos.select_batch",
            "invoices.view", "invoices.cancel", "returns.create", "returns.without_invoice",
            "products.view", "products.create", "products.edit", "products.edit_price", "products.edit_cost",
            "products.packaging.edit", "products.unit_rebase",
            "products.archive", "products.clear_all", "products.import", "products.export", "categories.manage",
            "stock.view", "stock.adjust", "stock.movement_log", "inventory.locations.manage",
            "purchases.view", "purchases.create", "suppliers.manage",
            "customers.view", "customers.create", "customers.edit", "customers.ledger",
            "customers.payment", "customers.payment_cancel", "customers.credit_sale", "customers.credit_limit_override",
            "customers.credit_limit", "customers.opening_balance",
            "reports.sales", "reports.profit", "reports.inventory", "reports.customers", "reports.cashier", "reports.daily_closing",
            "settings.store", "settings.printer", "settings.barcode", "settings.features", "settings.backup", "settings.restore", "settings.license", "system.updates",
            "users.view", "users.create", "users.edit", "users.deactivate", "users.reset_pin", "users.delegate",
            "audit_log.view", "expenses.view", "expenses.create", "expenses.edit", "expenses.delete", "expenses.cancel",
            "epay.access", "epay.transact", "epay.fund", "epay.terminals_manage", "epay.history", "epay.analytics", "epay.cancel", "epay.balance_adjust",
            "wallets.access", "wallets.transact", "wallets.fund", "wallets.accounts_manage", "wallets.history", "wallets.analytics", "wallets.cancel", "wallets.balance_adjust",
            "shifts.view", "shifts.open", "shifts.close", "shifts.cash_in", "shifts.cash_out",
            "shortage.view", "shortage.manage", "shortage.convert_to_purchase",
            "pharma.drug_info.edit", "pharma.alternatives.view",
            "pharma.controlled.dispense", "pharma.controlled.approve", "pharma.controlled.register_view", "pharma.controlled.view_full",
            "prescriptions.manage",
            "insurance.manage_contracts", "insurance.sell", "insurance.claims.manage", "insurance.claims.settle",
            "patients.view", "patients.edit",
            "pharma.expiry_returns.manage", "pharma.drug_reference.import",
            "pharma.stocktaking.manage", "pharma.dosage_labels.print", "reports.pharma.view",
            "pharma.ddi.manage", "pharma.ddi.override",
            "tables.view", "tables.manage_orders", "tables.transfer_merge", "tables.split_bill", "tables.configure_floor",
            "kot.print", "kot.configure",
            "modifiers.manage",
            "delivery.orders.manage", "delivery.riders.settle", "delivery.zones_riders.configure",
            "recipes.manage", "recipes.produce",
            // Legacy aliases
            "pos", "customers", "products", "inventory", "reports", "settings", "users", "epay", "wallets",
            "discounts", "price_edit", "stock_adjust", "db_recovery", "refunds", "cancel_sale"
        };

        public static Dictionary<string, bool> GetAllPermissionsDictionary(bool defaultValue)
        {
            var dict = new Dictionary<string, bool>();
            for (int i = 0; i < ALL_PERMISSIONS.Length; i++)
            {
                dict[ALL_PERMISSIONS[i]] = defaultValue;
            }
            return dict;
        }

        public static Dictionary<string, bool> GetEffectivePermissions(User u)
        {
            if (u == null) return new Dictionary<string, bool>();

            if (u.Role == "root" || u.Username == "root")
            {
                return GetAllPermissionsDictionary(true);
            }

            var p = GetPermissionsForRole(u.Role);
            if (!string.IsNullOrEmpty(u.PermissionsJson))
            {
                try
                {
                    var custom = JsonConvert.DeserializeObject<Dictionary<string, bool>>(u.PermissionsJson);
                    if (custom != null)
                    {
                        foreach (var kvp in custom)
                        {
                            p[kvp.Key] = kvp.Value;
                        }
                    }
                }
                catch
                {
                }
            }

            SyncPermissionAliases(p);

            // Owner-grade keys follow the same rule HasPermission enforces, so the UI shows what the server will allow
            if (u.Role == "admin" && IsOwnerUser(u))
            {
                for (int i = 0; i < DELEGABLE_OWNER_PERMISSIONS.Length; i++)
                {
                    p[DELEGABLE_OWNER_PERMISSIONS[i]] = true;
                }
            }
            else
            {
                bool isManager = u.Role == "admin";
                for (int i = 0; i < DELEGABLE_OWNER_PERMISSIONS.Length; i++)
                {
                    string key = DELEGABLE_OWNER_PERMISSIONS[i];
                    p[key] = isManager && IsOwnerGradeGranted(u, key);
                }
            }
            return p;
        }

        private static void SyncPermissionAliases(Dictionary<string, bool> p)
        {
            if (p == null) return;
            if (p.ContainsKey("pos.access")) p["pos"] = p["pos.access"];
            else if (p.ContainsKey("pos")) p["pos.access"] = p["pos"];

            if (p.ContainsKey("products.view")) p["products"] = p["products.view"];
            else if (p.ContainsKey("products")) p["products.view"] = p["products"];

            if (p.ContainsKey("customers.view")) p["customers"] = p["customers.view"];
            else if (p.ContainsKey("customers")) p["customers.view"] = p["customers"];

            if (p.ContainsKey("stock.view")) p["inventory"] = p["stock.view"];
            else if (p.ContainsKey("inventory")) p["stock.view"] = p["inventory"];

            if (p.ContainsKey("reports.sales")) p["reports"] = p["reports.sales"];
            else if (p.ContainsKey("reports")) p["reports.sales"] = p["reports"];

            if (p.ContainsKey("settings.store")) p["settings"] = p["settings.store"];
            else if (p.ContainsKey("settings")) p["settings.store"] = p["settings"];

            if (p.ContainsKey("users.view")) p["users"] = p["users.view"];
            else if (p.ContainsKey("users")) p["users.view"] = p["users"];

            if (p.ContainsKey("pos.discount_invoice")) p["discounts"] = p["pos.discount_invoice"];
            else if (p.ContainsKey("discounts")) p["pos.discount_invoice"] = p["discounts"];

            if (p.ContainsKey("stock.adjust")) p["stock_adjust"] = p["stock.adjust"];
            else if (p.ContainsKey("stock_adjust")) p["stock.adjust"] = p["stock_adjust"];

            if (p.ContainsKey("pos.price_override")) p["price_edit"] = p["pos.price_override"];
            else if (p.ContainsKey("price_edit")) p["pos.price_override"] = p["price_edit"];

            if (p.ContainsKey("epay.access")) p["epay"] = p["epay.access"];
            else if (p.ContainsKey("epay")) p["epay.access"] = p["epay"];

            if (p.ContainsKey("wallets.access")) p["wallets"] = p["wallets.access"];
            else if (p.ContainsKey("wallets")) p["wallets.access"] = p["wallets"];

            if (p.ContainsKey("customers.credit_limit_override")) p["credit_limit_override"] = p["customers.credit_limit_override"];
            else if (p.ContainsKey("credit_limit_override")) p["customers.credit_limit_override"] = p["credit_limit_override"];

            if (p.ContainsKey("expenses.delete")) p["expenses.cancel"] = p["expenses.delete"];
            else if (p.ContainsKey("expenses.cancel")) p["expenses.delete"] = p["expenses.cancel"];

            if (p.ContainsKey("reports.pharma.view")) p["reports.pharma"] = p["reports.pharma.view"];
            else if (p.ContainsKey("reports.pharma")) p["reports.pharma.view"] = p["reports.pharma"];
        }

        public static UserDto MapToDto(User u)
        {
            int remainingSec = 0;
            if (!string.IsNullOrEmpty(u.LockoutUntil))
            {
                DateTime lockDt;
                if (DateTime.TryParse(u.LockoutUntil, out lockDt))
                {
                    if (lockDt > DateTime.UtcNow)
                    {
                        remainingSec = (int)Math.Ceiling((lockDt - DateTime.UtcNow).TotalSeconds);
                    }
                }
            }

            return new UserDto
            {
                Id = u.Id,
                Username = u.Username,
                DisplayName = u.DisplayName,
                Role = u.Role,
                IsActive = u.IsActive,
                IsLocked = remainingSec > 0,
                RemainingLockoutSeconds = remainingSec,
                Permissions = GetEffectivePermissions(u),
                ParentId = u.ParentId,
                MaxDepth = u.MaxDepth,
                CreatedBy = u.CreatedBy,
                CanDelegate = u.CanDelegate,
                HasPassword = !string.IsNullOrEmpty(u.PasswordHash),
                HasPin = !string.IsNullOrEmpty(u.PinCodeHash),
                MustChangePin = u.MustChangePin,
                IsOwner = IsOwnerUser(u),
                Children = new List<UserDto>(),
                CreatedAt = u.CreatedAt,
                LastLoginAt = u.LastLoginAt
            };
        }

        public static Dictionary<string, bool> GetPermissionsForRole(string role)
        {
            var p = GetAllPermissionsDictionary(false);
            bool isRoot = (role == "root");
            bool isAdmin = (role == "admin" || isRoot);

            if (isRoot)
            {
                return GetAllPermissionsDictionary(true);
            }

            // POS
            p["pos.access"] = true;
            p["pos.sell"] = true;
            p["pos.hold_invoice"] = true;
            p["pos.void_line"] = true;
            p["pos.reprint"] = true;
            p["pos.quick_add"] = true;
            p["pos.change_unit"] = true;
            p["pos.discount_line"] = true;
            p["pos.discount_invoice"] = isAdmin;
            p["pos.discount_unlimited"] = isAdmin;
            p["pos.price_override"] = isAdmin;
            p["pos.select_batch"] = isAdmin;

            // Invoices & Returns
            p["invoices.view"] = isAdmin;
            p["invoices.cancel"] = isAdmin;
            p["returns.create"] = isAdmin;
            p["returns.without_invoice"] = isAdmin;

            // Products
            p["products.view"] = true;
            p["products.create"] = isAdmin;
            p["products.edit"] = isAdmin;
            p["products.edit_price"] = isAdmin;
            p["products.edit_cost"] = isAdmin;
            p["products.packaging.edit"] = isAdmin;
            p["products.unit_rebase"] = isAdmin;
            p["products.archive"] = isAdmin;
            p["products.clear_all"] = isAdmin;
            p["products.import"] = isAdmin;
            p["products.export"] = isAdmin;
            p["categories.manage"] = isAdmin;

            // Stock
            p["stock.view"] = isAdmin;
            p["stock.adjust"] = isAdmin;
            p["stock.movement_log"] = isAdmin;
            p["inventory.locations.manage"] = isAdmin;

            // Purchases & Suppliers
            p["purchases.view"] = isAdmin;
            p["purchases.create"] = isAdmin;
            p["suppliers.manage"] = isAdmin;

            // Customers
            p["customers.view"] = true;
            p["customers.create"] = true;
            p["customers.edit"] = isAdmin;
            p["customers.ledger"] = isAdmin;
            p["customers.payment"] = true;
            p["customers.payment_cancel"] = isAdmin;
            p["customers.credit_sale"] = true;
            p["customers.credit_limit_override"] = isAdmin;
            p["customers.credit_limit"] = isAdmin;
            p["customers.opening_balance"] = isAdmin;

            // Reports
            p["reports.sales"] = isAdmin;
            p["reports.profit"] = isAdmin;
            p["reports.inventory"] = isAdmin;
            p["reports.customers"] = isAdmin;
            p["reports.cashier"] = isAdmin;
            p["reports.daily_closing"] = isAdmin;

            // Settings
            p["settings.store"] = isAdmin;
            p["settings.printer"] = isAdmin;
            p["settings.barcode"] = isAdmin;
            p["settings.features"] = isRoot; // محصورة بحساب المشرف الأعلى (Root) فقط افتراضياً
            p["settings.backup"] = isAdmin;
            p["settings.restore"] = isAdmin;
            p["settings.license"] = isAdmin;
            p["system.updates"] = isAdmin;
            // Users
            p["users.view"] = isAdmin;
            p["users.create"] = isAdmin;
            p["users.edit"] = isAdmin;
            p["users.deactivate"] = isAdmin;
            p["users.reset_pin"] = isAdmin;
            p["users.delegate"] = isAdmin;

            // Audit & Expenses
            p["audit_log.view"] = isRoot;
            p["expenses.view"] = isAdmin;
            p["expenses.create"] = isAdmin;
            p["expenses.edit"] = isAdmin;
            p["expenses.delete"] = isAdmin;
            p["expenses.cancel"] = isAdmin;

            // E-Pay & Payment Terminals
            p["epay.access"] = true;
            p["epay.transact"] = true;
            p["epay.fund"] = isAdmin;
            p["epay.terminals_manage"] = isAdmin;
            p["epay.history"] = isAdmin;
            p["epay.analytics"] = isAdmin;
            p["epay.cancel"] = isAdmin;
            p["epay.balance_adjust"] = isAdmin;

            // Digital Wallets & InstaPay
            p["wallets.access"] = true;
            p["wallets.transact"] = true;
            p["wallets.fund"] = isAdmin;
            p["wallets.accounts_manage"] = isAdmin;
            p["wallets.history"] = isAdmin;
            p["wallets.analytics"] = isAdmin;
            p["wallets.cancel"] = isAdmin;
            p["wallets.balance_adjust"] = isAdmin;

            // Shifts & Cash Drawer
            p["shifts.view"] = true;
            p["shifts.open"] = true;
            p["shifts.close"] = true;
            p["shifts.cash_in"] = true;
            p["shifts.cash_out"] = isAdmin;

            // Shortages (Story 129 / Feature #186)
            p["shortage.view"] = true;
            p["shortage.manage"] = true;
            p["shortage.convert_to_purchase"] = isAdmin;

            // Pharmacy (Story 130 / Feature #187)
            p["pharma.drug_info.edit"] = isAdmin;
            p["pharma.alternatives.view"] = true;

            // Controlled Drugs & Prescriptions (Story 131 / Feature #188)
            p["pharma.controlled.dispense"] = isAdmin;
            p["pharma.controlled.approve"] = isAdmin;
            p["pharma.controlled.register_view"] = isAdmin;
            p["pharma.controlled.view_full"] = isRoot;
            p["prescriptions.manage"] = true;

            // Insurance & Corporate Billing (Story 132 / Feature #189)
            p["insurance.manage_contracts"] = isAdmin;
            p["insurance.sell"] = true;
            p["insurance.claims.manage"] = isAdmin;
            p["insurance.claims.settle"] = isAdmin;

            // Patient Profiles & Chronic Diseases (Story 133 / Feature #190)
            p["patients.view"] = true;
            p["patients.edit"] = isAdmin;

            // Expiry Returns & External Drug Reference (Story 134 / Feature #191)
            p["pharma.expiry_returns.manage"] = isAdmin;
            p["pharma.drug_reference.import"] = isAdmin;

            // Specialized Pharmacy Reports & Stocktaking (Story 135 / Feature #192)
            p["pharma.stocktaking.manage"] = isAdmin;
            p["pharma.dosage_labels.print"] = true;
            p["reports.pharma.view"] = isAdmin;
            p["pharma.ddi.manage"] = isAdmin;
            p["pharma.ddi.override"] = isAdmin;

            // Cafe, Restaurant & Manufacturing (Milestone 14: Stories 139–143 / Features #196–#200)
            p["tables.view"] = true;
            p["tables.manage_orders"] = true;
            p["tables.transfer_merge"] = true;
            p["tables.split_bill"] = true;
            p["tables.configure_floor"] = isAdmin;
            p["kot.print"] = true;
            p["kot.configure"] = isAdmin;
            p["modifiers.manage"] = isAdmin;
            p["delivery.orders.manage"] = true;
            p["delivery.riders.settle"] = isAdmin;
            p["delivery.zones_riders.configure"] = isAdmin;
            p["recipes.manage"] = isAdmin;
            p["recipes.produce"] = true;

            SyncPermissionAliases(p);

            return p;
        }

        private void LogAudit(string action, string entityType, string entityId, string details)
        {
            try
            {
                if (_auditRepo != null)
                {
                    string actorId = _currentUserSession != null ? _currentUserSession.Id : "system";
                    _auditRepo.Log(new AuditLog
                    {
                        UserId = actorId,
                        Action = action,
                        EntityType = entityType,
                        EntityId = entityId,
                        DetailsJson = details
                    });
                }
            }
            catch
            {
                // Non-blocking for audit failure
            }
        }

        /// <summary>
        /// Generates or retrieves the active developer root challenge (SEC-01).
        /// </summary>
        public string GenerateRootChallenge()
        {
            string deviceFp = EncryptionService.GenerateDeviceFingerprint();
            return RootChallengeManager.GetOrGenerateChallenge(deviceFp);
        }

        /// <summary>
        /// Authenticates the developer root user via a cryptographically signed Challenge-Response token (SEC-01).
        /// </summary>
        public LoginResult LoginWithRootChallenge(string responseToken)
        {
            var res = new LoginResult();
            string deviceFp = EncryptionService.GenerateDeviceFingerprint();
            string error;
            if (!RootChallengeManager.VerifyRootResponse(responseToken, deviceFp, out error))
            {
                res.Success = false;
                res.Message = error ?? "تصريح دخول Root غير صالح.";
                LogAudit("ROOT_CHALLENGE_FAILED", "SECURITY", "root", "فشل تسجيل الدخول بتصريح Root: " + res.Message);
                return res;
            }

            // Log in as developer root user
            User rootUser = null;
            if (_userRepo != null)
            {
                rootUser = _userRepo.GetByUsername("islam") ?? _userRepo.GetById("usr_root_developer");
            }

            if (rootUser == null)
            {
                rootUser = EnsureRootDeveloperAccount();
            }

            if (rootUser == null)
            {
                rootUser = new User
                {
                    Id = "usr_root_developer",
                    Username = "islam",
                    DisplayName = "مطور النظام (Root)",
                    Role = "root",
                    IsActive = true
                };
            }

            var dto = MapToDto(rootUser);
            _currentUserSession = dto;
            _recoveryLoginUserId = null;

            res.Success = true;
            res.User = dto;
            res.IsLocked = false;
            res.RemainingLockoutSeconds = 0;
            res.MustChangePin = false;
            res.Message = "تم تسجيل الدخول بصلاحيات مطور النظام (Root) بنجاح.";
            LogAudit("ROOT_CHALLENGE_LOGIN_SUCCESS", "SECURITY", rootUser.Username, "تسجيل دخول حساب المطور (Root) بنجاح عبر بروتوكول التحدي والاستجابة");
            return res;
        }
    }
}
