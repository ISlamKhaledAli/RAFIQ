using System;
using System.Collections.Generic;

namespace RafiqPOS.Models
{
    public class CustomerPatientInfo
    {
        public string CustomerId { get; set; }
        public string CustomerName { get; set; }
        public string CustomerPhone { get; set; }
        public int? BirthYear { get; set; }
        public string Gender { get; set; }
        public string Allergies { get; set; }
        public string ChronicConditions { get; set; }
        public string Notes { get; set; }
        public string CreatedAt { get; set; }
        public string UpdatedAt { get; set; }
    }

    public class ChronicMedication
    {
        public string Id { get; set; }
        public string CustomerId { get; set; }
        public string ProductId { get; set; }
        public string ProductName { get; set; }
        public string Barcode { get; set; }
        public int DailyQtyMilli { get; set; }
        public int DaysSupply { get; set; }
        public string LastDispensedAt { get; set; }
        public string NextDueDate { get; set; }
        public string Notes { get; set; }
        public string CreatedAt { get; set; }
        public long PricePiasters { get; set; }
        public long StockQuantityMilli { get; set; }
    }

    public class PatientDueAlert
    {
        public string CustomerId { get; set; }
        public string CustomerName { get; set; }
        public string CustomerPhone { get; set; }
        public int MedicationsCount { get; set; }
        public int OverdueCount { get; set; }
        public int DueSoonCount { get; set; }
        public string EarliestDueDate { get; set; }
        public List<string> MedicationNames { get; set; }

        public PatientDueAlert()
        {
            this.MedicationNames = new List<string>();
        }
    }

    public class AllergyConflictItem
    {
        public string ProductId { get; set; }
        public string ProductName { get; set; }
        public string AllergyMatch { get; set; }
        public string IngredientName { get; set; }
        public string WarningDetails { get; set; }
    }

    public class AllergyCheckResult
    {
        public bool HasConflict { get; set; }
        public string CustomerId { get; set; }
        public string CustomerName { get; set; }
        public List<AllergyConflictItem> Conflicts { get; set; }

        public AllergyCheckResult()
        {
            this.Conflicts = new List<AllergyConflictItem>();
        }
    }
}
