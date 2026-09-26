using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
using Newtonsoft.Json;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

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

        public SecurityService(SettingsRepository settingsRepo, AuditLogRepository auditRepo, UserRepository userRepo = null)
        {
            this._settingsRepo = settingsRepo;
            this._auditRepo = auditRepo;
            this._userRepo = userRepo;
        }

        public static UserDto CurrentUser
        {
            get { return _currentUserSession; }
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
            if (_currentUserSession != null)
            {
                return _currentUserSession;
            }

            // If no user is logged in, check if default admin exists
            if (_userRepo != null)
            {
                var admin = _userRepo.GetById("usr_admin_default");
                if (admin != null)
                {
                    _currentUserSession = MapToDto(admin);
                    return _currentUserSession;
                }
            }

            return new UserDto
            {
                Id = "usr_admin_default",
                Username = "admin",
                DisplayName = "مدير النظام",
                Role = "admin",
                IsActive = true,
                Permissions = GetPermissionsForRole("admin")
            };
        }

        public LoginResult Login(string usernameOrId, string pin)
        {
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

            // Check Lockout
            int remainingSec = GetUserRemainingLockoutSeconds(user);
            if (remainingSec > 0)
            {
                res.Success = false;
                res.IsLocked = true;
                res.RemainingLockoutSeconds = remainingSec;
                res.Message = string.Format("الحساب مقفل مؤقتاً لحماية الأمان. يرجى الانتظار {0} ثانية.", remainingSec);
                return res;
            }

            // Check PIN hash
            bool matches = false;
            if (!string.IsNullOrEmpty(user.PinCodeHash))
            {
                if (!string.IsNullOrEmpty(user.PinSalt))
                {
                    byte[] salt = Convert.FromBase64String(user.PinSalt);
                    byte[] expectedHash = Convert.FromBase64String(user.PinCodeHash);
                    byte[] actualHash = HashWithSalt(pin, salt);
                    matches = SlowEquals(expectedHash, actualHash);
                }
                else
                {
                    // Legacy plain or simple fallback if empty salt
                    matches = user.PinCodeHash == pin;
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

                LogAudit("USER_LOGIN", "SECURITY", user.Username, string.Format("تسجيل دخول الموظف: {0} ({1})", user.DisplayName, user.Role == "admin" ? "مدير" : "كاشير"));

                res.Success = true;
                res.User = dto;
                res.IsLocked = false;
                res.RemainingLockoutSeconds = 0;
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
                    list.Add(MapToDto(users[i]));
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
                for (int i = 0; i < users.Count; i++)
                {
                    list.Add(MapToDto(users[i]));
                }
            }
            return list;
        }

        public UserDto CreateUser(string username, string displayName, string pin, string role)
        {
            if (_userRepo == null) throw new InvalidOperationException("UserRepository is null");

            if (string.IsNullOrEmpty(username)) throw new ArgumentException("اسم المستخدم مطلوب");
            if (string.IsNullOrEmpty(displayName)) throw new ArgumentException("اسم الموظف مطلوب");
            if (string.IsNullOrEmpty(pin) || pin.Length < 4 || pin.Length > 8)
                throw new ArgumentException("يجب أن يتكون الرقم السري من 4 إلى 8 أرقام");

            for (int i = 0; i < pin.Length; i++)
            {
                if (!char.IsDigit(pin[i])) throw new ArgumentException("يجب أن يحتوي الرقم السري على أرقام فقط");
            }

            string cleanUsername = username.Trim().ToLowerInvariant();
            if (_userRepo.GetByUsername(cleanUsername) != null)
            {
                throw new InvalidOperationException("اسم المستخدم موجود بالفعل");
            }

            byte[] salt = GenerateSalt();
            byte[] hash = HashWithSalt(pin, salt);

            var user = new User
            {
                Id = "usr_" + Guid.NewGuid().ToString("N"),
                Username = cleanUsername,
                DisplayName = displayName.Trim(),
                PinCodeHash = Convert.ToBase64String(hash),
                PinSalt = Convert.ToBase64String(salt),
                Role = role == "admin" ? "admin" : "cashier",
                IsActive = true,
                FailedAttempts = 0,
                CreatedAt = DateTime.UtcNow.ToString("o")
            };

            _userRepo.Insert(user);
            LogAudit("USER_CREATED", "SECURITY", user.Username, string.Format("تم إنشاء حساب جديد: {0} ({1})", user.DisplayName, user.Role));

            return MapToDto(user);
        }

        public void UpdateUser(string userId, string displayName, string role, bool isActive)
        {
            if (_userRepo == null) throw new InvalidOperationException("UserRepository is null");

            var user = _userRepo.GetById(userId);
            if (user == null) throw new ArgumentException("الموظف غير موجود");

            // Prevent removing last active admin
            if (user.Role == "admin" && (role != "admin" || !isActive))
            {
                int activeAdmins = _userRepo.GetActiveAdminCount();
                if (activeAdmins <= 1)
                {
                    throw new InvalidOperationException("لا يمكن تعطيل أو تغيير دور آخر مدير نظام نشط.");
                }
            }

            user.DisplayName = displayName.Trim();
            user.Role = role == "admin" ? "admin" : "cashier";
            user.IsActive = isActive;

            _userRepo.Update(user);
            LogAudit("USER_UPDATED", "SECURITY", user.Username, string.Format("تم تحديث بيانات الموظف: {0} ({1}) - الحالة: {2}", user.DisplayName, user.Role, isActive ? "نشط" : "معطّل"));
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

            var user = _userRepo.GetById(userId);
            if (user == null) throw new ArgumentException("الموظف غير موجود");

            byte[] salt = GenerateSalt();
            byte[] hash = HashWithSalt(newPin, salt);

            _userRepo.UpdatePin(userId, Convert.ToBase64String(hash), Convert.ToBase64String(salt));
            LogAudit("USER_PIN_CHANGED", "SECURITY", user.Username, string.Format("تم تغيير الرقم السري للموظف: {0}", user.DisplayName));
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

            if (_userRepo == null)
            {
                return VerifyPin(pin, action);
            }

            // Find all active admins
            var allUsers = _userRepo.GetAll(true);
            var admins = new List<User>();
            for (int i = 0; i < allUsers.Count; i++)
            {
                if (allUsers[i].Role == "admin")
                {
                    admins.Add(allUsers[i]);
                }
            }

            if (admins.Count == 0)
            {
                // Fallback to legacy single PIN verification
                return VerifyPin(pin, action);
            }

            for (int i = 0; i < admins.Count; i++)
            {
                var admin = admins[i];
                if (string.IsNullOrEmpty(admin.PinCodeHash) || string.IsNullOrEmpty(admin.PinSalt))
                    continue;

                byte[] salt = Convert.FromBase64String(admin.PinSalt);
                byte[] expectedHash = Convert.FromBase64String(admin.PinCodeHash);
                byte[] actualHash = HashWithSalt(pin, salt);

                if (SlowEquals(expectedHash, actualHash))
                {
                    LogAudit("SUPERVISOR_OVERRIDE", "SECURITY", admin.Username, string.Format("موافقة مدير على العملية: {0} بواسطة {1}", action, admin.DisplayName));
                    result.Success = true;
                    result.SupervisorName = admin.DisplayName;
                    result.Message = "تمت موافقة مدير النظام بنجاح.";
                    return result;
                }
            }

            result.Success = false;
            result.Message = "الرقم السري للمدير غير صحيح.";
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
            if (!string.IsNullOrEmpty(pinHash))
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
            string cleanCode = (recoveryCode ?? "").Trim().ToUpperInvariant().Replace(" ", "").Replace("-", "");
            string recHash = _settingsRepo.Get(KEY_RECOVERY_HASH, "");
            string recSaltStr = _settingsRepo.Get(KEY_RECOVERY_SALT, "");

            if (string.IsNullOrEmpty(recHash) || string.IsNullOrEmpty(recSaltStr))
            {
                return false;
            }

            byte[] salt = Convert.FromBase64String(recSaltStr);
            byte[] expectedHash = Convert.FromBase64String(recHash);
            byte[] actualHash = HashWithSalt(cleanCode, salt);

            return SlowEquals(expectedHash, actualHash);
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

        private static UserDto MapToDto(User u)
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
                Permissions = GetPermissionsForRole(u.Role),
                CreatedAt = u.CreatedAt,
                LastLoginAt = u.LastLoginAt
            };
        }

        public static Dictionary<string, bool> GetPermissionsForRole(string role)
        {
            var p = new Dictionary<string, bool>();
            bool isAdmin = (role == "admin");

            p["pos"] = true;                       // شاشة البيع متاحة للجميع
            p["customers"] = true;                 // العملاء والدفتر
            p["products"] = isAdmin;               // إدارة وحذف المنتجات
            p["inventory"] = isAdmin;              // شاشة الجرد
            p["reports"] = isAdmin;                // شاشة التقارير والأرباح
            p["settings"] = isAdmin;               // شاشة الإعدادات
            p["users"] = isAdmin;                  // إدارة الموظفين
            p["discounts"] = isAdmin;              // منح الخصومات المفتوحة
            p["price_edit"] = isAdmin;             // تعديل الأسعار يدويًا
            p["stock_adjust"] = isAdmin;           // تسوية المخزون
            p["db_recovery"] = isAdmin;            // استعادة وتصفير القاعدة
            p["refunds"] = isAdmin;                // فواتير المرتجع
            p["cancel_sale"] = isAdmin;            // إلغاء الفاتورة بالكامل
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
