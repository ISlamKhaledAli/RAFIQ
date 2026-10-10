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
            NormalizeAdminRoles();
        }

        private void NormalizeAdminRoles()
        {
            if (_userRepo == null) return;
            try
            {
                var all = _userRepo.GetAll(false);
                bool hasRoot = false;
                for (int i = 0; i < all.Count; i++)
                {
                    if (all[i].Role == "root") hasRoot = true;
                }

                for (int i = 0; i < all.Count; i++)
                {
                    var u = all[i];
                    if (u.Role == "owner" || (!hasRoot && (u.Id == "usr_admin_default" || u.Username == "admin")))
                    {
                        u.Role = "root";
                        u.MaxDepth = 99;
                        u.CanDelegate = true;
                        hasRoot = true;
                        _userRepo.Update(u);
                    }
                    if ((u.Role == "admin" || u.Role == "root") && string.IsNullOrEmpty(u.PinSalt) && !string.IsNullOrEmpty(u.PinCodeHash))
                    {
                        try
                        {
                            ChangeUserPin(u.Id, u.PinCodeHash);
                        }
                        catch
                        {
                        }
                    }
                }

                if (!hasRoot && all.Count > 0)
                {
                    var first = all[0];
                    first.Role = "root";
                    first.MaxDepth = 99;
                    first.CanDelegate = true;
                    _userRepo.Update(first);
                }
            }
            catch
            {
            }
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
            return _currentUserSession;
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

            // Check Password first if set
            bool matches = false;
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

            if (user.Role == "root")
            {
                if (!isActive)
                {
                    throw new InvalidOperationException("لا يمكن تعطيل حساب الـ Root المالك للنظام.");
                }
                if (role != "root")
                {
                    throw new InvalidOperationException("لا يمكن تغيير دور حساب الـ Root.");
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

            if (user.Role == "root")
            {
                throw new InvalidOperationException("حساب الـ Root يملك جميع الصلاحيات دائماً ولا يمكن تقييده.");
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

            if (user.Role == "root") return true;

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

            int remainingSeconds = GetRemainingLockoutSeconds();
            if (remainingSeconds > 0)
            {
                result.Success = false;
                result.IsLocked = true;
                result.RemainingLockoutSeconds = remainingSeconds;
                result.Message = string.Format("النظام مقفل مؤقتاً لحماية البيانات. يرجى الانتظار {0} ثانية.", remainingSeconds);
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

            // Find all active admins (supporting both 'admin' and 'owner' roles)
            var allUsers = _userRepo.GetAll(true);
            var admins = new List<User>();
            for (int i = 0; i < allUsers.Count; i++)
            {
                if (allUsers[i].Role == "admin" || allUsers[i].Role == "owner" || allUsers[i].Role == "root")
                {
                    admins.Add(allUsers[i]);
                }
            }

            if (admins.Count == 0)
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

            for (int i = 0; i < admins.Count; i++)
            {
                var admin = admins[i];
                if (string.IsNullOrEmpty(admin.PinCodeHash))
                    continue;

                bool matches = false;
                if (!string.IsNullOrEmpty(admin.PinSalt))
                {
                    byte[] salt = Convert.FromBase64String(admin.PinSalt);
                    byte[] expectedHash = Convert.FromBase64String(admin.PinCodeHash);
                    byte[] actualHash = HashWithSalt(pin, salt);
                    matches = SlowEquals(expectedHash, actualHash);
                }
                else
                {
                    // Plain text match for legacy seeded admin (e.g. "1234")
                    matches = (admin.PinCodeHash == pin);
                }

                if (matches)
                {
                    LogAudit("SUPERVISOR_OVERRIDE", "SECURITY", admin.Username, string.Format("موافقة مدير على العملية: {0} بواسطة {1}", action, admin.DisplayName));
                    result.Success = true;
                    result.SupervisorName = admin.DisplayName;
                    result.Message = "تمت موافقة مدير النظام بنجاح.";
                    return result;
                }
            }

            result.Success = false;
            result.Message = "الرقم السري لمدير النظام غير صحيح.";
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

        public static readonly string[] ALL_PERMISSIONS = new string[]
        {
            "pos.access", "pos.sell", "pos.discount_line", "pos.discount_invoice", "pos.discount_unlimited",
            "pos.hold_invoice", "pos.price_override", "pos.void_line", "pos.quick_add", "pos.reprint",
            "invoices.view", "invoices.cancel", "returns.create", "returns.without_invoice",
            "products.view", "products.create", "products.edit", "products.edit_price", "products.edit_cost",
            "products.archive", "products.import", "products.export", "categories.manage",
            "stock.view", "stock.adjust", "stock.movement_log",
            "purchases.view", "purchases.create", "suppliers.manage",
            "customers.view", "customers.create", "customers.edit", "customers.ledger",
            "customers.payment", "customers.payment_cancel", "customers.credit_sale",
            "reports.sales", "reports.profit", "reports.inventory", "reports.customers", "reports.cashier", "reports.daily_closing",
            "settings.store", "settings.printer", "settings.barcode", "settings.features", "settings.backup", "settings.restore", "settings.license",
            "users.view", "users.create", "users.edit", "users.deactivate", "users.reset_pin", "users.delegate",
            "audit_log.view", "expenses.view", "expenses.create", "expenses.delete",
            // Legacy aliases
            "pos", "customers", "products", "inventory", "reports", "settings", "users",
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

            if (u.Role == "root")
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
                Permissions = GetEffectivePermissions(u),
                ParentId = u.ParentId,
                MaxDepth = u.MaxDepth,
                CreatedBy = u.CreatedBy,
                CanDelegate = u.CanDelegate,
                HasPassword = !string.IsNullOrEmpty(u.PasswordHash),
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
            p["pos.discount_line"] = true;
            p["pos.discount_invoice"] = isAdmin;
            p["pos.discount_unlimited"] = isAdmin;
            p["pos.price_override"] = isAdmin;

            // Invoices & Returns
            p["invoices.view"] = true;
            p["invoices.cancel"] = isAdmin;
            p["returns.create"] = isAdmin;
            p["returns.without_invoice"] = isAdmin;

            // Products
            p["products.view"] = true;
            p["products.create"] = isAdmin;
            p["products.edit"] = isAdmin;
            p["products.edit_price"] = isAdmin;
            p["products.edit_cost"] = isAdmin;
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
            p["settings.features"] = isAdmin;
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
            p["audit_log.view"] = isAdmin;
            p["expenses.view"] = isAdmin;
            p["expenses.create"] = isAdmin;
            p["expenses.delete"] = isAdmin;

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
