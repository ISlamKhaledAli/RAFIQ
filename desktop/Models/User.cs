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

        [JsonProperty("parentId")]
        public string ParentId { get; set; }

        [JsonProperty("maxDepth")]
        public int MaxDepth { get; set; }

        [JsonProperty("createdBy")]
        public string CreatedBy { get; set; }

        [JsonProperty("canDelegate")]
        public bool CanDelegate { get; set; }

        [JsonIgnore]
        public string PasswordHash { get; set; }

        [JsonIgnore]
        public string PasswordSalt { get; set; }

        [JsonProperty("role")]
        public string Role { get; set; } // "root", "admin", "cashier", etc.

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

        [JsonProperty("parentId")]
        public string ParentId { get; set; }

        [JsonProperty("maxDepth")]
        public int MaxDepth { get; set; }

        [JsonProperty("createdBy")]
        public string CreatedBy { get; set; }

        [JsonProperty("canDelegate")]
        public bool CanDelegate { get; set; }

        [JsonProperty("hasPassword")]
        public bool HasPassword { get; set; }

        [JsonProperty("children")]
        public List<UserDto> Children { get; set; }

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
