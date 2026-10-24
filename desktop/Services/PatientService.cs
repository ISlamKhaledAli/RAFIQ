using System;
using System.Collections.Generic;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class PatientService
    {
        private readonly PatientRepository _patientRepo;
        private readonly SecurityService _securityService;

        public PatientService(PatientRepository patientRepo, SecurityService securityService = null)
        {
            if (patientRepo == null) throw new ArgumentNullException("patientRepo");
            this._patientRepo = patientRepo;
            this._securityService = securityService;
        }

        public CustomerPatientInfo GetProfile(string customerId)
        {
            if (string.IsNullOrEmpty(customerId)) return null;
            return _patientRepo.GetProfile(customerId);
        }

        public CustomerPatientInfo SaveProfile(CustomerPatientInfo info, string userId)
        {
            if (info == null) throw new ArgumentNullException("info");
            if (string.IsNullOrEmpty(info.CustomerId)) throw new ArgumentException("معرف العميل مطلوب.");

            if (info.BirthYear.HasValue)
            {
                int currentYear = DateTime.Now.Year;
                if (info.BirthYear.Value < 1900 || info.BirthYear.Value > currentYear)
                {
                    throw new ArgumentException(string.Format("سنة الميلاد يجب أن تكون بين 1900 و {0}.", currentYear));
                }
            }

            return _patientRepo.SaveProfile(info, userId);
        }

        public List<ChronicMedication> GetChronicMedications(string customerId)
        {
            if (string.IsNullOrEmpty(customerId)) return new List<ChronicMedication>();
            return _patientRepo.GetChronicMedications(customerId);
        }

        public ChronicMedication SaveChronicMedication(ChronicMedication med, string userId)
        {
            if (med == null) throw new ArgumentNullException("med");
            if (string.IsNullOrEmpty(med.CustomerId)) throw new ArgumentException("معرف العميل مطلوب.");
            if (string.IsNullOrEmpty(med.ProductId)) throw new ArgumentException("معرف الصنف مطلوب.");

            if (med.DailyQtyMilli <= 0)
            {
                med.DailyQtyMilli = 1000;
            }

            return _patientRepo.SaveChronicMedication(med, userId);
        }

        public bool DeleteChronicMedication(string id, string userId)
        {
            if (string.IsNullOrEmpty(id)) return false;
            return _patientRepo.DeleteChronicMedication(id, userId);
        }

        public List<PatientDueAlert> GetDueAlerts(int daysAhead)
        {
            if (daysAhead < 0) daysAhead = 0;
            return _patientRepo.GetDueAlerts(daysAhead);
        }

        public bool RecordDispense(string customerId, List<string> productIds, int supplyDays, string dispensedAt, string userId)
        {
            if (string.IsNullOrEmpty(customerId) || productIds == null || productIds.Count == 0)
            {
                return false;
            }
            if (supplyDays <= 0) supplyDays = 30;
            return _patientRepo.RecordDispense(customerId, productIds, supplyDays, dispensedAt, userId);
        }

        public AllergyCheckResult CheckAllergies(string customerId, List<string> productIds)
        {
            if (string.IsNullOrEmpty(customerId) || productIds == null || productIds.Count == 0)
            {
                return new AllergyCheckResult { CustomerId = customerId };
            }
            return _patientRepo.CheckAllergies(customerId, productIds);
        }
    }
}
