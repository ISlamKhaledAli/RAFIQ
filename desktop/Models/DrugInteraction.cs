using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace RafiqPOS.Models
{
    /// <summary>
    /// كيان التفاعل والتعارض الدوائي المرجعي (Drug-Drug Interaction Entity)
    /// Story 137 / Feature #194 / F-01
    /// </summary>
    public class DrugInteraction
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("activeIngredientA")]
        public string ActiveIngredientA { get; set; }

        [JsonProperty("activeIngredientB")]
        public string ActiveIngredientB { get; set; }

        /// <summary>
        /// درجة الخطورة: 'severe' (مانع صرف حرج) | 'moderate' (فصل زمني) | 'minor' (إرشادي)
        /// </summary>
        [JsonProperty("severity")]
        public string Severity { get; set; }

        [JsonProperty("mechanismAr")]
        public string MechanismAr { get; set; }

        [JsonProperty("clinicalRiskAr")]
        public string ClinicalRiskAr { get; set; }

        [JsonProperty("recommendationAr")]
        public string RecommendationAr { get; set; }

        [JsonProperty("alternativeAr")]
        public string AlternativeAr { get; set; }

        [JsonProperty("source")]
        public string Source { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }

        [JsonProperty("updatedAt")]
        public string UpdatedAt { get; set; }

        public DrugInteraction()
        {
            Id = Guid.NewGuid().ToString();
            Severity = "moderate";
            AlternativeAr = "";
            Source = "clinical_core";
            string now = DateTime.UtcNow.ToString("o");
            CreatedAt = now;
            UpdatedAt = now;
        }
    }

    /// <summary>
    /// عنصر تعارض دوائي مكتشف في سلة البيع
    /// </summary>
    public class InteractionConflictItem
    {
        [JsonProperty("interactionId")]
        public string InteractionId { get; set; }

        [JsonProperty("productAId")]
        public string ProductAId { get; set; }

        [JsonProperty("productAName")]
        public string ProductAName { get; set; }

        [JsonProperty("activeIngredientA")]
        public string ActiveIngredientA { get; set; }

        [JsonProperty("productBId")]
        public string ProductBId { get; set; }

        [JsonProperty("productBName")]
        public string ProductBName { get; set; }

        [JsonProperty("activeIngredientB")]
        public string ActiveIngredientB { get; set; }

        [JsonProperty("severity")]
        public string Severity { get; set; }

        [JsonProperty("mechanismAr")]
        public string MechanismAr { get; set; }

        [JsonProperty("clinicalRiskAr")]
        public string ClinicalRiskAr { get; set; }

        [JsonProperty("recommendationAr")]
        public string RecommendationAr { get; set; }

        [JsonProperty("alternativeAr")]
        public string AlternativeAr { get; set; }
    }

    /// <summary>
    /// النتيجة الشاملة لفحص سلة البيع من التعارضات الدوائية
    /// </summary>
    public class CartInteractionCheckResult
    {
        [JsonProperty("hasInteractions")]
        public bool HasInteractions { get; set; }

        /// <summary>
        /// أقصى درجة خطورة مكتشفة: 'severe' | 'moderate' | 'minor' | 'none'
        /// </summary>
        [JsonProperty("maxSeverity")]
        public string MaxSeverity { get; set; }

        /// <summary>
        /// هل تتطلب السلة إذناً أو تجاوزاً رسمياً من الصيدلي المشرف؟ (في حالة severe)
        /// </summary>
        [JsonProperty("requiresOverride")]
        public bool RequiresOverride { get; set; }

        [JsonProperty("conflicts")]
        public List<InteractionConflictItem> Conflicts { get; set; }

        [JsonProperty("checkedPairsCount")]
        public int CheckedPairsCount { get; set; }

        public CartInteractionCheckResult()
        {
            HasInteractions = false;
            MaxSeverity = "none";
            RequiresOverride = false;
            Conflicts = new List<InteractionConflictItem>();
            CheckedPairsCount = 0;
        }
    }

    /// <summary>
    /// نموذج طلب تجاوز تحذير التعارض الدوائي الحرج
    /// </summary>
    public class DdiOverrideRequest
    {
        [JsonProperty("pin")]
        public string Pin { get; set; }

        [JsonProperty("reason")]
        public string Reason { get; set; }

        [JsonProperty("conflictProductIds")]
        public List<string> ConflictProductIds { get; set; }

        public DdiOverrideRequest()
        {
            ConflictProductIds = new List<string>();
        }
    }
}
