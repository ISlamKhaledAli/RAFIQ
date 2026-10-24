using System;
using System.Collections.Generic;
using System.Data.SQLite;
using Newtonsoft.Json;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    /// <summary>
    /// خدمة حوكمة أدوية الجدول والرقابة والمهدئات وسجل التفتيش الصيدلي (Story 131 / Feature #188)
    /// </summary>
    public class ControlledDrugService
    {
        private const string KEY_MANDATORY_FIELDS = "pharma_controlled_mandatory_fields";

        private readonly ControlledDrugRepository _controlledRepo;
        private readonly SettingsRepository _settingsRepo;
        private readonly EncryptionService _encryptionService;
        private readonly SecurityService _securityService;

        public ControlledDrugService(
            ControlledDrugRepository controlledRepo,
            SettingsRepository settingsRepo,
            EncryptionService encryptionService = null,
            SecurityService securityService = null)
        {
            _controlledRepo = controlledRepo;
            _settingsRepo = settingsRepo;
            _encryptionService = encryptionService ?? DatabaseService.Encryption;
            _securityService = securityService ?? DatabaseService.Security;
        }

        public List<string> GetMandatoryFields()
        {
            if (_settingsRepo != null)
            {
                string json = _settingsRepo.Get(KEY_MANDATORY_FIELDS, null);
                if (!string.IsNullOrEmpty(json))
                {
                    try
                    {
                        var fields = JsonConvert.DeserializeObject<List<string>>(json);
                        if (fields != null && fields.Count > 0)
                        {
                            return fields;
                        }
                    }
                    catch { }
                }
            }

            // الافتراضي الصارم: اسم المريض، واسم الطبيب، وتاريخ الروشتة (PHARMACY_MODULE_PLAN.md:262)
            return new List<string> { "patient_name", "doctor_name", "prescription_date" };
        }

        public void SaveMandatoryFields(List<string> fields)
        {
            if (fields == null) fields = new List<string>();

            // Always ensure base essential fields are mandatory
            if (!fields.Contains("patient_name")) fields.Add("patient_name");
            if (!fields.Contains("doctor_name")) fields.Add("doctor_name");
            if (!fields.Contains("prescription_date")) fields.Add("prescription_date");

            string json = JsonConvert.SerializeObject(fields);
            if (_settingsRepo != null)
            {
                _settingsRepo.Set(KEY_MANDATORY_FIELDS, json);
            }
        }

        public string MaskNationalId(string raw)
        {
            if (string.IsNullOrWhiteSpace(raw)) return string.Empty;
            string clean = raw.Trim();
            if (clean.Length <= 4) return new string('*', clean.Length);

            // e.g. "29901011234567" -> "29**********67"
            int prefixLen = Math.Min(2, clean.Length / 2);
            int suffixLen = Math.Min(2, clean.Length / 2);
            int starLen = clean.Length - prefixLen - suffixLen;
            if (starLen <= 0) starLen = 1;

            return clean.Substring(0, prefixLen) + new string('*', starLen) + clean.Substring(clean.Length - suffixLen);
        }

        public void ValidateAndPrepareDispense(
            ControlledDrugDispense dispense,
            string currentUserId,
            bool requiresSupervisorApproval,
            string supervisorPin)
        {
            if (dispense == null) throw new ArgumentNullException("dispense");

            var mandatory = GetMandatoryFields();

            if (mandatory.Contains("patient_name") && string.IsNullOrWhiteSpace(dispense.PatientName))
            {
                throw new InvalidOperationException("اسم المريض إلزامي لصرف أدوية الجدول والرقابة.");
            }
            if (mandatory.Contains("doctor_name") && string.IsNullOrWhiteSpace(dispense.DoctorName))
            {
                throw new InvalidOperationException("اسم الطبيب المعالج إلزامي لصرف أدوية الجدول والرقابة.");
            }
            if (mandatory.Contains("prescription_date") && string.IsNullOrWhiteSpace(dispense.PrescriptionDate))
            {
                throw new InvalidOperationException("تاريخ الروشتة إلزامي لصرف أدوية الجدول والرقابة.");
            }
            if (mandatory.Contains("patient_national_id") && string.IsNullOrWhiteSpace(dispense.PatientNationalId))
            {
                throw new InvalidOperationException("الرقم القومي للمريض إلزامي بحسب إعدادات الصيدلية الحالية.");
            }
            if (mandatory.Contains("patient_phone") && string.IsNullOrWhiteSpace(dispense.PatientPhone))
            {
                throw new InvalidOperationException("رقم هاتف المريض إلزامي بحسب إعدادات الصيدلية الحالية.");
            }
            if (mandatory.Contains("doctor_license_no") && string.IsNullOrWhiteSpace(dispense.DoctorLicenseNo))
            {
                throw new InvalidOperationException("رقم ترخيص مزاولة المهنة للطبيب إلزامي بحسب إعدادات الصيدلية الحالية.");
            }
            if (mandatory.Contains("prescription_no") && string.IsNullOrWhiteSpace(dispense.PrescriptionNo))
            {
                throw new InvalidOperationException("رقم الروشتة إلزامي بحسب إعدادات الصيدلية الحالية.");
            }

            // Task 188-4: Encrypt and mask national ID
            if (!string.IsNullOrWhiteSpace(dispense.PatientNationalId))
            {
                string rawNatId = dispense.PatientNationalId.Trim();
                dispense.PatientNationalIdMasked = MaskNationalId(rawNatId);

                if (_encryptionService != null)
                {
                    dispense.PatientNationalId = _encryptionService.EncryptString(rawNatId);
                }
            }

            dispense.DispensedBy = !string.IsNullOrEmpty(currentUserId) ? currentUserId : "system";

            // Task 188-4: Require pharmacist / supervisor PIN if cashier is not authorized
            if (requiresSupervisorApproval)
            {
                if (string.IsNullOrWhiteSpace(supervisorPin))
                {
                    throw new UnauthorizedAccessException("صرف أدوية الجدول والمهدئات يتطلب اعتماد الصيدلي المسؤول بالرمز السري (PIN).");
                }

                if (_securityService != null)
                {
                    var pinResult = _securityService.VerifySupervisorPin(supervisorPin, "PHARMA_CONTROLLED_DISPENSE");
                    if (pinResult == null || !pinResult.Success)
                    {
                        string msg = (pinResult != null && !string.IsNullOrEmpty(pinResult.Message))
                            ? pinResult.Message
                            : "الرمز السري للصيدلي المسؤول غير صحيح أو انتهت صلاحيته.";
                        throw new UnauthorizedAccessException(msg);
                    }
                    dispense.ApprovedBy = pinResult.SupervisorName ?? "المشرف المعتمد";
                }
            }
        }

        public List<ControlledDrugDispense> GetDispenses(
            string productId = null,
            string dateFrom = null,
            string dateTo = null,
            string entryType = null,
            bool canViewFullNationalId = false,
            int limit = 200)
        {
            var list = _controlledRepo.GetDispenses(productId, dateFrom, dateTo, entryType, limit);

            if (canViewFullNationalId && _encryptionService != null)
            {
                for (int i = 0; i < list.Count; i++)
                {
                    var item = list[i];
                    if (!string.IsNullOrEmpty(item.PatientNationalId))
                    {
                        try
                        {
                            string decrypted = _encryptionService.DecryptString(item.PatientNationalId);
                            if (!string.IsNullOrEmpty(decrypted))
                            {
                                item.PatientNationalId = decrypted;
                            }
                        }
                        catch { }
                    }
                }
            }
            else
            {
                // Strip ciphertext to avoid exposing encrypted blobs to client
                for (int i = 0; i < list.Count; i++)
                {
                    list[i].PatientNationalId = list[i].PatientNationalIdMasked;
                }
            }

            return list;
        }

        public List<ControlledInspectionReportRow> GetInspectionRegister(
            string productId,
            string dateFrom,
            string dateTo,
            bool canViewFullNationalId = false)
        {
            var rows = _controlledRepo.GetInspectionRegister(productId, dateFrom, dateTo);

            if (canViewFullNationalId && _encryptionService != null)
            {
                for (int i = 0; i < rows.Count; i++)
                {
                    var r = rows[i];
                    // If masked ID is present, we could check if original is needed
                }
            }

            return rows;
        }
    }
}
