using System;
using Newtonsoft.Json;

namespace RafiqPOS.Models
{
    /// <summary>
    /// نموذج موقع التخزين والرفوف والأدراج (Feature #185 / Story 128)
    /// </summary>
    public class StorageLocation
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("code")]
        public string Code { get; set; }

        [JsonProperty("name")]
        public string Name { get; set; }

        /// <summary>
        /// نوع الموقع: shelf (رف), drawer (درج), fridge (ثلاجة), room (مخزن / غرفة)
        /// </summary>
        [JsonProperty("type")]
        public string Type { get; set; }

        [JsonProperty("description")]
        public string Description { get; set; }

        [JsonProperty("isActive")]
        public bool IsActive { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }

        [JsonProperty("updatedAt")]
        public string UpdatedAt { get; set; }

        [JsonProperty("productsCount")]
        public int ProductsCount { get; set; }

        public StorageLocation()
        {
            Type = "shelf";
            IsActive = true;
        }
    }
}
