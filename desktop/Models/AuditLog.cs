using System;
using Newtonsoft.Json;

namespace RafiqPOS.Models
{
    public class AuditLog
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("userId")]
        public string UserId { get; set; }

        [JsonProperty("userDisplayName")]
        public string UserDisplayName { get; set; }

        [JsonProperty("action")]
        public string Action { get; set; }

        [JsonProperty("actionArabic")]
        public string ActionArabic { get; set; }

        [JsonProperty("entityType")]
        public string EntityType { get; set; }

        [JsonProperty("entityId")]
        public string EntityId { get; set; }

        [JsonProperty("detailsJson")]
        public string DetailsJson { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }

        [JsonProperty("prevHash")]
        public string PrevHash { get; set; }

        [JsonProperty("recordHash")]
        public string RecordHash { get; set; }
    }

    public class AuditChainVerificationResult
    {
        [JsonProperty("isValid")]
        public bool IsValid { get; set; }

        [JsonProperty("isTampered")]
        public bool IsTampered { get; set; }

        [JsonProperty("totalRecordsVerified")]
        public int TotalRecordsVerified { get; set; }

        [JsonProperty("tamperedRecordId")]
        public string TamperedRecordId { get; set; }

        [JsonProperty("tamperedRecordIndex")]
        public int TamperedRecordIndex { get; set; }

        [JsonProperty("errorMessage")]
        public string ErrorMessage { get; set; }
    }
}
