using System;
using Newtonsoft.Json;

namespace RafiqPOS.Models
{
    public class Supplier
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("name")]
        public string Name { get; set; }

        [JsonProperty("phone")]
        public string Phone { get; set; }

        [JsonProperty("companyName")]
        public string CompanyName { get; set; }

        [JsonProperty("address")]
        public string Address { get; set; }

        [JsonProperty("balancePiasters")]
        public long BalancePiasters { get; set; }

        [JsonProperty("notes")]
        public string Notes { get; set; }

        [JsonProperty("isActive")]
        public bool IsActive { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }

        [JsonProperty("updatedAt")]
        public string UpdatedAt { get; set; }
    }
}
