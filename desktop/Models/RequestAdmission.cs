using System;
using System.Collections.Generic;

namespace RafiqPOS.Models
{
    internal sealed class RequestAdmission
    {
        private readonly Dictionary<string, bool> _permissions;
        internal readonly bool IsValid;
        internal readonly long Generation;
        internal readonly string ActorId;
        internal readonly string ActorName;
        internal readonly string Username;
        internal readonly string Role;
        internal readonly bool MustChangePin;

        internal bool IsAuthenticated { get { return IsValid && !string.IsNullOrEmpty(ActorId); } }
        internal bool IsAdmin { get { return IsAuthenticated && (Role == "admin" || Role == "root"); } }

        internal RequestAdmission(bool valid, long generation, User user, Dictionary<string, bool> permissions)
        {
            IsValid = valid;
            Generation = generation;
            if (user != null)
            {
                ActorId = user.Id;
                ActorName = string.IsNullOrEmpty(user.DisplayName) ? user.Username : user.DisplayName;
                Username = user.Username;
                Role = user.Role;
                MustChangePin = user.MustChangePin;
            }
            _permissions = permissions == null
                ? new Dictionary<string, bool>(StringComparer.Ordinal)
                : new Dictionary<string, bool>(permissions, StringComparer.Ordinal);
        }

        internal bool HasPermission(string permission)
        {
            if (!IsAuthenticated || string.IsNullOrEmpty(permission)) return false;
            bool allowed;
            return IsAdmin || (_permissions.TryGetValue(permission, out allowed) && allowed);
        }
    }
}
