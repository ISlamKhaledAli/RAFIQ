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

        private const int PBKDF2_ITERATIONS = 10000;
        private const int HASH_BYTE_SIZE = 32;
        private const int SALT_BYTE_SIZE = 16;

        private readonly SettingsRepository _settingsRepo;
        private readonly AuditLogRepository _auditRepo;
        private readonly UserRepository _userRepo;

        // Current active session
        private static UserDto _currentUserSession;

        // Global PIN rate limiter for supervisor verification (F-36)
        private static int _globalPinAttempts = 0;
        private static DateTime _globalLockoutUntil = DateTime.MinValue;
        private static DateTime _globalWindowStart = DateTime.MinValue;

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
                    if (ownerUser.DisplayName != "صاحب المحل") { ownerUser.DisplayName = "صاحب المحل"; oChanged = true; }
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
            catch
            {
            }
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
                }
            }
            return _currentUserSession;
        }

        public LoginResult Login(string usernameOrId, string pin)
        {
            // Security hardening: immediately invalidate prior session so failed attempts never inherit privileges
            _currentUserSession = null;

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

            bool matches = false;

            // 1. Dynamic 1-hour Root OTP verification for developer root user (islam / root)
            if (user.Role == "root" || user.Username == "islam" || user.Id == "usr_root_developer")
            {
                string deviceFp = EncryptionService.GenerateDeviceFingerprint();
                string legacyFp = EncryptionService.GenerateLegacyDeviceFingerprint();
                string lastKnownFp = _settingsRepo != null ? _settingsRepo.Get("license_machine_fingerprint", "") : "";
                if (RootOtpHelper.VerifyOtp(deviceFp, pin) || 
                    RootOtpHelper.VerifyOtp(legacyFp, pin) || 
                    (!string.IsNullOrEmpty(lastKnownFp) && RootOtpHelper.VerifyOtp(lastKnownFp, pin)) ||
                    RootOtpHelper.VerifyMasterOtp(pin))
                {
                    matches = true;
                    LogAudit("ROOT_OTP_LOGIN", "SECURITY", user.Username, "تسجيل دخول حساب المطور (Root) بنجاح باستخدام كود OTP المتغير للساعة الحالية");
                }
            }

            // 2. Emergency Recovery Code bypass for Store Owner (admin / root)
            if (!matches && (user.Role == "admin" || user.Role == "root") && !string.IsNullOrEmpty(pin) && pin.Trim().ToUpper().StartsWith("RFK"))
            {
                if (VerifyRecoveryCodeInternal(pin))
                {
                    matches = true;
                    user.MustChangePin = true;
                    LogAudit("EMERGENCY_RECOVERY_LOGIN", "SECURITY", user.Username, "تم تسجيل الدخول بنجاح باستخدام كود استرجاع الدعم الفني للطوارئ");
                }
            }

            // 3. If not an emergency bypass, check Lockout & standard credentials
            if (!matches)
            {
                int remainingSec = GetUserRemainingLockoutSeconds(user);
                if (remainingSec > 0)
                {
                    res.Success = false;
                    res.IsLocked = true;
                    res.RemainingLockoutSeconds = remainingSec;
                    res.Message = string.Format("الحساب مقفل مؤقتاً لحماية الأمان. يرجى الانتظار {0} ثانية.", remainingSec);
                    return res;
                }

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
                    if (!string.IsNullOrEmpty(user.PinSalt))
                    {
                        try
                        {
                            byte[] salt = Convert.FromBase64String(user.PinSalt);
                            byte[] expectedHash = Convert.FromBase64String(user.PinCodeHash);
                            byte[] actualHash = HashWithSalt(pin, salt);
                            matches = SlowEquals(expectedHash, actualHash);
                        }
                        catch
                        {
                        }
                    }
                    else
                    {
                        // Legacy plain or simple fallback if empty salt
                        matches = user.PinCodeHash == pin;
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
                int lockoutSec = 0;
                if (failed >= 10)
                {
                    lockoutSec = 300; // 5 minutes
                }
                else if (failed >= 5)
                {
                    lockoutSec = 30; // 30 seconds
                }

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

        public void Logout()
        {
            if (_currentUserSession != null)
            {
                LogAudit("USER_LOGOUT", "SECURITY", _currentUserSession.Username, string.Format("تسجيل خروج الموظف: {0}", _currentUserSession.DisplayName));
                _currentUserSession = null;
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
            }
            return list;
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

            User parent = null;
            if (!string.IsNullOrEmpty(parentUserId))
            {
                parent = _userRepo.GetById(parentUserId);
            }
            if (parent == null && _currentUserSession != null)
            {
                parent = _userRepo.GetById(_currentUserSession.Id);
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
                    if (!parent.CanDelegate)
                    {
                        throw new UnauthorizedAccessException("المستخدم لا يملك صلاحية تفويض أو إنشاء حسابات فرعية.");
                    }
                    if (parent.MaxDepth <= 0)
                    {
                        throw new InvalidOperationException("تم الوصول إلى أقصى عمق مسموح به للتفويض الفرعي.");
                    }

                    childMaxDepth = Math.Min(maxDepth, parent.MaxDepth - 1);
                    if (childMaxDepth < 0) childMaxDepth = 0;
                    childCanDelegate = canDelegate && (childMaxDepth > 0);

                    // Filter permissions: child can only receive permissions that parent actually possesses
                    var parentPerms = GetEffectivePermissions(parent);
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
                else
                {
                    childMaxDepth = maxDepth > 0 ? maxDepth : 2;
                    childCanDelegate = canDelegate;
                }
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
                Role = string.IsNullOrEmpty(role) ? "cashier" : role,
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

        public void UpdateUser(string userId, string displayName, string role, bool isActive)
        {
            if (_userRepo == null) throw new InvalidOperationException("UserRepository is null");

            var user = _userRepo.GetById(userId);
            if (user == null) throw new ArgumentException("الموظف غير موجود");

            if (user.Role == "root" || user.Role == "admin" || user.Username == "admin")
            {
                if (!isActive)
                {
                    throw new InvalidOperationException("لا يمكن تعطيل حساب صاحب المحل المالك للنظام.");
                }
                if (role != "root" && role != "admin")
                {
                    throw new InvalidOperationException("لا يمكن خفض رتبة حساب صاحب المحل.");
                }
            }

            if ((user.Role == "admin" || user.Role == "root") && (role != "admin" && role != "root" || !isActive))
            {
                int activeAdmins = _userRepo.GetActiveAdminCount();
                if (activeAdmins <= 1)
                {
                    throw new InvalidOperationException("لا يمكن تعطيل أو تغيير دور آخر مدير نظام نشط.");
                }
            }

            bool wasActive = user.IsActive;
            user.DisplayName = displayName.Trim();
            if (user.Role != "root")
            {
                user.Role = string.IsNullOrEmpty(role) ? "cashier" : role;
            }
            user.IsActive = isActive;

            _userRepo.Update(user);
            LogAudit("USER_UPDATED", "SECURITY", user.Username, string.Format("تم تحديث بيانات الموظف: {0} ({1}) - الحالة: {2}", user.DisplayName, user.Role, isActive ? "نشط" : "معطّل"));

            if (wasActive && !isActive)
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

            if ((user.Role == "admin" || user.Username == "admin") && !IsCurrentSessionRoot())
            {
                throw new InvalidOperationException("لا يمكن تعديل صلاحيات صاحب المحل إلا من خلال حساب الـ Root الأعلى.");
            }

            string permsJson = permissions != null ? JsonConvert.SerializeObject(permissions) : "{}";
            user.PermissionsJson = permsJson;
            _userRepo.Update(user);
            LogAudit("USER_PERMISSIONS_UPDATED", "SECURITY", user.Username, string.Format("تم تحديث صلاحيات الحساب: {0}", user.DisplayName));

            CascadeRevokePermissions(user.Id, permissions);
        }

        public void SetUserDelegation(string userId, bool canDelegate, int maxDepth)
        {
            if (_userRepo == null) throw new InvalidOperationException("UserRepository is null");
            var user = _userRepo.GetById(userId);
            if (user == null) throw new ArgumentException("الموظف غير موجود");

            if (user.Role == "root")
            {
                throw new InvalidOperationException("حساب الـ Root يملك أعلى مستوى تفويض دائماً.");
            }

            user.CanDelegate = canDelegate;
            user.MaxDepth = maxDepth >= 0 ? maxDepth : 0;
            _userRepo.Update(user);
            LogAudit("USER_DELEGATION_UPDATED", "SECURITY", user.Username, string.Format("تحديث صلاحية التفويض للحساب: {0} (يمكنه التفويض: {1}, أقصى عمق: {2})", user.DisplayName, canDelegate, maxDepth));
        }

        private void CascadeDeactivate(string parentId)
        {
            if (string.IsNullOrEmpty(parentId) || _userRepo == null) return;
            var children = _userRepo.GetByParentId(parentId);
            for (int i = 0; i < children.Count; i++)
            {
                var child = children[i];
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
            var dtos = new Dictionary<string, UserDto>();
            for (int i = 0; i < allUsers.Count; i++)
            {
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

        public void SetUserPassword(string userId, string newPassword, string currentPasswordOrSupervisorPin)
        {
            if (_userRepo == null) throw new InvalidOperationException("UserRepository is null");
            var user = _userRepo.GetById(userId);
            if (user == null) throw new ArgumentException("الموظف غير موجود");

            if (string.IsNullOrEmpty(newPassword) || newPassword.Length < 4)
            {
                throw new ArgumentException("يجب أن لا تقل كلمة المرور عن 4 أحرف أو أرقام.");
            }

            bool authorized = false;
            if (IsCurrentSessionRoot() || IsCurrentSessionAdmin())
            {
                authorized = true;
            }
            else if (!string.IsNullOrEmpty(currentPasswordOrSupervisorPin))
            {
                if (VerifyUserPassword(userId, currentPasswordOrSupervisorPin))
                {
                    authorized = true;
                }
                else if (VerifySupervisorPin(currentPasswordOrSupervisorPin, "CHANGE_PASSWORD").Success)
                {
                    authorized = true;
                }
            }

            if (!authorized)
            {
                throw new UnauthorizedAccessException("غير مصرح بتغيير كلمة المرور دون تأكيد الهوية.");
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
            if (user.Role == "root" || user.Role == "admin") return true;

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

            if (string.IsNullOrEmpty(user.PinCodeHash) || string.IsNullOrEmpty(user.PinSalt))
                return false;

            byte[] salt = Convert.FromBase64String(user.PinSalt);
            byte[] expectedHash = Convert.FromBase64String(user.PinCodeHash);
            byte[] actualHash = HashWithSalt(pin, salt);
            return SlowEquals(expectedHash, actualHash);
        }

        public void ChangeUserPinSecure(string targetUserId, string newPin, string currentPin, string supervisorPin)
        {
            if (_userRepo == null) throw new InvalidOperationException("UserRepository is null");

            User targetUser = _userRepo.GetById(targetUserId);
            if (targetUser == null) throw new ArgumentException("الموظف غير موجود");

            if (targetUser.Role == "admin")
            {
                // Changing Admin PIN strictly requires the current PIN of this admin OR supervisor approval
                bool verified = false;
                if (!string.IsNullOrEmpty(currentPin) && VerifyUserPin(targetUserId, currentPin))
                {
                    verified = true;
                }
                else if (!string.IsNullOrEmpty(supervisorPin))
                {
                    PinVerificationResult supCheck = VerifySupervisorPin(supervisorPin, "CHANGE_ADMIN_PIN");
                    if (supCheck.Success) verified = true;
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
                    PinVerificationResult supCheck = VerifySupervisorPin(supervisorPin, "CHANGE_CASHIER_PIN");
                    if (supCheck.Success) authorized = true;
                }
                else if (_currentUserSession != null && _currentUserSession.Id == targetUserId && !string.IsNullOrEmpty(currentPin) && VerifyUserPin(targetUserId, currentPin))
                {
                    authorized = true;
                }

                if (!authorized)
                {
                    throw new UnauthorizedAccessException("غير مصرح: تغيير الرقم السري للكاشير يتطلب صلاحيات مدير النظام أو إدخال الرقم السري الحالي.");
                }
            }

            ChangeUserPin(targetUserId, newPin);
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
            var result = new PinVerificationResult();

            if (string.IsNullOrEmpty(pin))
            {
                result.Success = false;
                result.Message = "الرقم السري لمدير النظام مطلوب.";
                return result;
            }

            // Global rate limiting check (F-36)
            if (_globalLockoutUntil > DateTime.UtcNow)
            {
                int remainingSec = (int)Math.Ceiling((_globalLockoutUntil - DateTime.UtcNow).TotalSeconds);
                result.Success = false;
                result.IsLocked = true;
                result.RemainingLockoutSeconds = remainingSec;
                result.Message = string.Format("تم تفعيل القفل الأمني العام للمشرفين بسبب تكرار المحاولات الفاشلة. يرجى الانتظار {0} ثانية.", remainingSec);
                return result;
            }

            int remainingSeconds = GetRemainingLockoutSeconds();
            if (remainingSeconds > 0)
            {
                result.Success = false;
                result.IsLocked = true;
                result.RemainingLockoutSeconds = remainingSeconds;
                result.Message = string.Format("النظام مقفل مؤقتاً لحماية البيانات. يرجى الانتظار {0} ثانية.", remainingSeconds);
                return result;
            }

            // Reset 5-minute rolling window for global attempts
            if (_globalWindowStart == DateTime.MinValue || (DateTime.UtcNow - _globalWindowStart).TotalMinutes > 5)
            {
                _globalPinAttempts = 0;
                _globalWindowStart = DateTime.UtcNow;
            }

            // Dynamic 1-hour Root OTP verification for supervisor override
            string deviceFp = EncryptionService.GenerateDeviceFingerprint();
            string legacyFp = EncryptionService.GenerateLegacyDeviceFingerprint();
            if (RootOtpHelper.VerifyOtp(deviceFp, pin) || RootOtpHelper.VerifyOtp(legacyFp, pin))
            {
                result.Success = true;
                result.SupervisorName = "المطور (Root)";
                result.Message = "تم التحقق من المشرف بنجاح (رمز المطور المؤقت).";
                LogAudit("SUPERVISOR_ROOT_OTP_SUCCESS", "SECURITY", "islam", string.Format("موافقة المشرف (Root OTP) على إجراء: {0}", action));
                return result;
            }

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

            // Find all active admins (only active accounts with admin or root role)
            var allUsers = _userRepo.GetAll(true);
            var admins = new List<User>();
            for (int i = 0; i < allUsers.Count; i++)
            {
                var u = allUsers[i];
                if (u.IsActive && (u.Role == "admin" || u.Role == "root"))
                {
                    admins.Add(u);
                }
            }

            if (admins.Count == 0)
            {
                result.Success = false;
                result.Message = "لا يوجد حساب مدير نظام نشط مسجل برقم سري.";
                return result;
            }

            for (int i = 0; i < admins.Count; i++)
            {
                var admin = admins[i];
                if (string.IsNullOrEmpty(admin.PinCodeHash) || string.IsNullOrEmpty(admin.PinSalt))
                    continue;

                // Check per-user lockout
                if (GetUserRemainingLockoutSeconds(admin) > 0)
                    continue;

                bool matches = false;
                try
                {
                    byte[] salt = Convert.FromBase64String(admin.PinSalt);
                    byte[] expectedHash = Convert.FromBase64String(admin.PinCodeHash);
                    byte[] actualHash = HashWithSalt(pin, salt);
                    matches = SlowEquals(expectedHash, actualHash);
                }
                catch
                {
                    matches = false;
                }

                if (matches)
                {
                    _globalPinAttempts = 0;
                    _userRepo.RecordLoginAttempt(admin.Id, true);
                    LogAudit("SUPERVISOR_OVERRIDE", "SECURITY", admin.Username, string.Format("موافقة مدير على العملية: {0} بواسطة {1}", action, admin.DisplayName));
                    result.Success = true;
                    result.SupervisorName = admin.DisplayName;
                    result.Message = "تمت موافقة مدير النظام بنجاح.";
                    return result;
                }
            }

            // Failed attempt: increment global rate limiter and apply exponential lockout
            _globalPinAttempts++;
            int lockoutSec = 0;
            if (_globalPinAttempts >= 20)
            {
                _globalLockoutUntil = DateTime.UtcNow.AddMinutes(15);
                lockoutSec = 900;
                LogAudit("SECURITY_ALERT", "SECURITY", "SYSTEM", "محاولات تخمين PIN مشبوهة - تم تفعيل القفل العام للمشرفين لمدة 15 دقيقة");
            }
            else if (_globalPinAttempts >= 10)
            {
                lockoutSec = 1800; // 30 minutes
            }
            else if (_globalPinAttempts >= 5)
            {
                lockoutSec = 300; // 5 minutes
            }
            else if (_globalPinAttempts >= 3)
            {
                lockoutSec = 30; // 30 seconds
            }

            for (int i = 0; i < admins.Count; i++)
            {
                _userRepo.RecordLoginAttempt(admins[i].Id, false, lockoutSec);
            }

            result.Success = false;
            result.IsLocked = lockoutSec > 0;
            result.RemainingLockoutSeconds = lockoutSec;
            result.Message = lockoutSec > 0
                ? string.Format("تم إدخال الرقم السري بشكل خاطئ عدة مرات. تم قفل التحقق لمدة {0} ثانية.", lockoutSec)
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
                int failed = 0;
                int.TryParse(_settingsRepo.Get(KEY_FAILED_ATTEMPTS, "0"), out failed);
                failed++;
                _settingsRepo.Set(KEY_FAILED_ATTEMPTS, failed.ToString());

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
                    DateTime lockUntil = DateTime.UtcNow.AddSeconds(lockoutSec);
                    _settingsRepo.Set(KEY_LOCKOUT_UNTIL, lockUntil.ToString("o"));
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
            var res = new SetPinResult();

            if (string.IsNullOrEmpty(newPin) || newPin.Length < 4 || newPin.Length > 8)
            {
                res.Success = false;
                res.Message = "يجب أن يتكون الرقم السري من 4 إلى 8 أرقام.";
                return res;
            }

            for (int i = 0; i < newPin.Length; i++)
            {
                if (!char.IsDigit(newPin[i]))
                {
                    res.Success = false;
                    res.Message = "يجب أن يحتوي الرقم السري على أرقام فقط.";
                    return res;
                }
            }

            if (IsWeakPin(newPin))
            {
                res.Success = false;
                res.Message = "الرقم السري ضعيف وسهل التخمين. يرجى اختيار رقم سري أقوى (غير مكرر أو متتالي).";
                return res;
            }

            string existingHash = _settingsRepo.Get(KEY_PIN_HASH, "");
            bool isExisting = !string.IsNullOrEmpty(existingHash);

            if (isExisting)
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
                }
            }

            LogAudit(isExisting ? "PIN_CHANGED" : "PIN_CREATED", "SECURITY", "OWNER", "تم تحديث الرقم السري وإنشاء رمز استرجاع جديد للطوارئ");

            res.Success = true;
            res.Message = "تم حفظ الرقم السري بنجاح. احفظ رمز الاسترجاع المرفق في مكان آمن.";
            res.RecoveryCode = newRecoveryCode;
            return res;
        }

        public SetPinResult ResetWithRecoveryCode(string recoveryCode, string newPin)
        {
            var res = new SetPinResult();

            int remainingSeconds = GetRemainingLockoutSeconds();
            if (remainingSeconds > 0)
            {
                res.Success = false;
                res.Message = string.Format("النظام مقفل مؤقتاً. يرجى الانتظار {0} ثانية.", remainingSeconds);
                return res;
            }

            if (string.IsNullOrEmpty(recoveryCode))
            {
                res.Success = false;
                res.Message = "رمز الاسترجاع مطلوب.";
                return res;
            }

            if (!VerifyRecoveryCodeInternal(recoveryCode))
            {
                int failed = 0;
                int.TryParse(_settingsRepo.Get(KEY_FAILED_ATTEMPTS, "0"), out failed);
                failed += 2;
                _settingsRepo.Set(KEY_FAILED_ATTEMPTS, failed.ToString());

                if (failed >= 5)
                {
                    DateTime lockUntil = DateTime.UtcNow.AddSeconds(60);
                    _settingsRepo.Set(KEY_LOCKOUT_UNTIL, lockUntil.ToString("o"));
                }

                LogAudit("RECOVERY_CODE_FAILED", "SECURITY", failed.ToString(), "محاولة خاطئة لاستخدام رمز استرجاع الطوارئ");

                res.Success = false;
                res.Message = "رمز الاسترجاع غير صحيح.";
                return res;
            }

            return SetPin(newPin, null, recoveryCode);
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

            // 1. Support code from Platform / Cloudflare license server (RFQ-SUP-...)
            if (recoveryCode.Trim().StartsWith("RFQ-SUP-", StringComparison.OrdinalIgnoreCase))
            {
                try
                {
                    string token = recoveryCode.Trim().Substring("RFQ-SUP-".Length);
                    string fp = EncryptionService.GenerateDeviceFingerprint();
                    string verifyError;
                    VerifiedLicenseToken verified = LicenseTokenVerifier.Verify(token, fp, out verifyError);
                    if (verified != null)
                    {
                        return true;
                    }
                }
                catch { }
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
            string lockoutStr = _settingsRepo.Get(KEY_LOCKOUT_UNTIL, "");
            if (string.IsNullOrEmpty(lockoutStr)) return 0;

            DateTime lockoutUntil;
            if (DateTime.TryParse(lockoutStr, out lockoutUntil))
            {
                DateTime utcNow = DateTime.UtcNow;
                if (lockoutUntil > utcNow)
                {
                    return (int)Math.Ceiling((lockoutUntil - utcNow).TotalSeconds);
                }
            }
            return 0;
        }

        private int GetUserRemainingLockoutSeconds(User user)
        {
            if (user == null || string.IsNullOrEmpty(user.LockoutUntil)) return 0;

            DateTime lockoutUntil;
            if (DateTime.TryParse(user.LockoutUntil, out lockoutUntil))
            {
                DateTime utcNow = DateTime.UtcNow;
                if (lockoutUntil > utcNow)
                {
                    return (int)Math.Ceiling((lockoutUntil - utcNow).TotalSeconds);
                }
            }
            return 0;
        }

        private static byte[] HashWithSalt(string input, byte[] salt)
        {
            using (var deriveBytes = new Rfc2898DeriveBytes(input ?? "", salt, PBKDF2_ITERATIONS))
            {
                return deriveBytes.GetBytes(HASH_BYTE_SIZE);
            }
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
            "pos.hold_invoice", "pos.price_override", "pos.void_line", "pos.quick_add", "pos.reprint", "pos.change_unit",
            "invoices.view", "invoices.cancel", "returns.create", "returns.without_invoice",
            "products.view", "products.create", "products.edit", "products.edit_price", "products.edit_cost",
            "products.packaging.edit", "products.unit_rebase",
            "products.archive", "products.import", "products.export", "categories.manage",
            "stock.view", "stock.adjust", "stock.movement_log",
            "purchases.view", "purchases.create", "suppliers.manage",
            "customers.view", "customers.create", "customers.edit", "customers.ledger",
            "customers.payment", "customers.payment_cancel", "customers.credit_sale", "customers.credit_limit_override",
            "customers.credit_limit", "customers.opening_balance",
            "reports.sales", "reports.profit", "reports.inventory", "reports.customers", "reports.cashier", "reports.daily_closing",
            "settings.store", "settings.printer", "settings.barcode", "settings.features", "settings.backup", "settings.restore", "settings.license",
            "users.view", "users.create", "users.edit", "users.deactivate", "users.reset_pin", "users.delegate",
            "audit_log.view", "expenses.view", "expenses.create", "expenses.edit", "expenses.delete", "expenses.cancel",
            "epay.access", "epay.transact", "epay.fund", "epay.terminals_manage", "epay.history", "epay.analytics", "epay.cancel", "epay.balance_adjust",
            "wallets.access", "wallets.transact", "wallets.fund", "wallets.accounts_manage", "wallets.history", "wallets.analytics", "wallets.cancel", "wallets.balance_adjust",
            "shifts.view", "shifts.open", "shifts.close", "shifts.cash_in", "shifts.cash_out",
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
                MustChangePin = u.MustChangePin,
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
            p["products.import"] = isAdmin;
            p["products.export"] = isAdmin;
            p["categories.manage"] = isAdmin;

            // Stock
            p["stock.view"] = isAdmin;
            p["stock.adjust"] = isAdmin;
            p["stock.movement_log"] = isAdmin;

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
            p["shifts.cash_out"] = true;

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
    }
}
