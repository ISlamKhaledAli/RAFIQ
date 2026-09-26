using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace RafiqPOS.Models
{
    public class User
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("username")]
        public string Username { get; set; }

        [JsonProperty("displayName")]
        public string DisplayName { get; set; }

        [JsonIgnore]
        public string PinCodeHash { get; set; }

        [JsonIgnore]
        public string PinSalt { get; set; }

        [JsonProperty("role")]
        public string Role { get; set; } // "admin" or "cashier"

        [JsonProperty("isActive")]
        public bool IsActive { get; set; }

        [JsonProperty("failedAttempts")]
        public int FailedAttempts { get; set; }

        [JsonProperty("lockoutUntil")]
        public string LockoutUntil { get; set; }

        [JsonProperty("permissionsJson")]
        public string PermissionsJson { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }

        [JsonProperty("updatedAt")]
        public string UpdatedAt { get; set; }

        [JsonProperty("lastLoginAt")]
        public string LastLoginAt { get; set; }
    }

    public class UserDto
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("username")]
        public string Username { get; set; }

        [JsonProperty("displayName")]
        public string DisplayName { get; set; }

        [JsonProperty("role")]
        public string Role { get; set; }

        [JsonProperty("isActive")]
        public bool IsActive { get; set; }

        [JsonProperty("isLocked")]
        public bool IsLocked { get; set; }

        [JsonProperty("remainingLockoutSeconds")]
        public int RemainingLockoutSeconds { get; set; }

        [JsonProperty("permissions")]
        public Dictionary<string, bool> Permissions { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }

        [JsonProperty("lastLoginAt")]
        public string LastLoginAt { get; set; }
    }

    public class LoginResult
    {
        [JsonProperty("success")]
        public bool Success { get; set; }

        [JsonProperty("user")]
        public UserDto User { get; set; }

        [JsonProperty("isLocked")]
        public bool IsLocked { get; set; }

        [JsonProperty("remainingLockoutSeconds")]
        public int RemainingLockoutSeconds { get; set; }

        [JsonProperty("message")]
        public string Message { get; set; }
    }
}
