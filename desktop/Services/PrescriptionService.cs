using System;
using System.Collections.Generic;
using System.IO;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    /// <summary>
    /// خدمة إدارة الروشتات الطبية وأرشيف الصور (Story 131 / Feature #188 / Task 188-6)
    /// </summary>
    public class PrescriptionService
    {
        private readonly PrescriptionRepository _prescriptionRepo;
        private readonly string _baseDataFolder;

        public PrescriptionService(PrescriptionRepository prescriptionRepo, string baseDataFolder = null)
        {
            _prescriptionRepo = prescriptionRepo;
            _baseDataFolder = baseDataFolder;
        }

        public Prescription SavePrescription(Prescription p)
        {
            if (p == null) throw new ArgumentNullException("p");
            if (string.IsNullOrWhiteSpace(p.PatientName))
            {
                throw new InvalidOperationException("اسم المريض مطلوب لحفظ الروشتة.");
            }
            if (string.IsNullOrWhiteSpace(p.DoctorName))
            {
                throw new InvalidOperationException("اسم الطبيب المعالج مطلوب لحفظ الروشتة.");
            }
            if (string.IsNullOrWhiteSpace(p.PrescriptionDate))
            {
                p.PrescriptionDate = DateTime.UtcNow.ToString("yyyy-MM-dd");
            }

            _prescriptionRepo.Insert(p);
            return p;
        }

        public Prescription GetById(string id)
        {
            return _prescriptionRepo.GetById(id);
        }

        public List<Prescription> GetAll(string search = null, int limit = 50)
        {
            return _prescriptionRepo.GetAll(search, limit);
        }

        public string UploadImage(string prescriptionId, byte[] imageBytes, string extension)
        {
            return _prescriptionRepo.SavePrescriptionImage(prescriptionId, imageBytes, extension);
        }

        public byte[] GetImageBytes(string relativePath)
        {
            if (string.IsNullOrEmpty(relativePath)) return null;

            string baseDir = !string.IsNullOrEmpty(_baseDataFolder) ? _baseDataFolder : AppDomain.CurrentDomain.BaseDirectory;
            string allowedDir = Path.GetFullPath(Path.Combine(baseDir, "prescriptions"));
            if (!allowedDir.EndsWith(Path.DirectorySeparatorChar.ToString()))
            {
                allowedDir += Path.DirectorySeparatorChar;
            }

            string cleanRelative = relativePath.Trim().TrimStart('/', '\\').Replace("/", "\\");
            string fullPath = Path.GetFullPath(Path.Combine(baseDir, cleanRelative));

            // Strict Path Traversal Defense: Ensure requested file is located strictly inside prescriptions directory
            if (!fullPath.StartsWith(allowedDir, StringComparison.OrdinalIgnoreCase))
            {
                RafiqPOS.Common.Logger.Warn("Security: Attempted path traversal in prescription image retrieval blocked: " + relativePath);
                return null;
            }

            if (File.Exists(fullPath))
            {
                return File.ReadAllBytes(fullPath);
            }

            return null;
        }
    }
}
