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
        public Dictionary<string, bool> ProtectedActions { get; set; }
    }

    public class PinVerificationResult
    {
        public bool Success { get; set; }
        public bool IsLocked { get; set; }
        public int RemainingLockoutSeconds { get; set; }
        public int FailedAttempts { get; set; }
        public string Message { get; set; }
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

        private const int PBKDF2_ITERATIONS = 10000;
        private const int HASH_BYTE_SIZE = 32;
        private const int SALT_BYTE_SIZE = 16;

        private readonly SettingsRepository _settingsRepo;
        private readonly AuditLogRepository _auditRepo;

        public SecurityService(SettingsRepository settingsRepo, AuditLogRepository auditRepo)
        {
            this._settingsRepo = settingsRepo;
            this._auditRepo = auditRepo;
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

            Dictionary<string, bool> protectedActions = GetProtectedActions();

            var status = new PinStatusResult();
            status.IsPinSet = isPinSet;
            status.IsEnabled = isEnabled;
            status.IsLocked = isLocked;
            status.RemainingLockoutSeconds = remainingSeconds;
            status.FailedAttempts = failedAttempts;
            status.ProtectedActions = protectedActions;
            return status;
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
                    // In case of invalid JSON, fallback to defaults
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
                // PIN is not set yet
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
                // Reset failed attempts on success
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
                // Increment failed attempts and apply throttling
                int failed = 0;
                int.TryParse(_settingsRepo.Get(KEY_FAILED_ATTEMPTS, "0"), out failed);
                failed++;
                _settingsRepo.Set(KEY_FAILED_ATTEMPTS, failed.ToString());

                int lockoutSec = 0;
                if (failed >= 10)
                {
                    lockoutSec = 300; // 5 minutes lockout after 10 attempts
                }
                else if (failed >= 5)
                {
                    lockoutSec = 30; // 30 seconds lockout after 5 attempts
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
                // Must authenticate via current PIN or valid recovery code
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

            // Generate Salt and Hash for new PIN
            byte[] pinSalt = GenerateSalt();
            byte[] pinHash = HashWithSalt(newPin, pinSalt);

            // Generate one-time recovery code
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
                failed += 2; // Recovery code guessing is penalized heavily
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

            // Valid recovery code: now apply new PIN
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
            // Human-readable code avoiding 0/O, 1/I confusion
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

        private void LogAudit(string action, string entityType, string entityId, string details)
        {
            try
            {
                if (_auditRepo != null)
                {
                    _auditRepo.Log(new AuditLog
                    {
                        UserId = "system",
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
