using System;
using System.Collections.Generic;
using System.Data.SQLite;
using System.IO;
using RafiqPOS.Models;

namespace RafiqPOS.Repositories
{
    /// <summary>
    /// مستودع الروشتات الطبية وأرشيف الصور (Story 131 / Feature #188 / Task 188-6)
    /// </summary>
    public class PrescriptionRepository
    {
        private readonly string _connectionString;
        private readonly string _baseDataFolder;

        public PrescriptionRepository(string connectionString, string baseDataFolder = null)
        {
            _connectionString = connectionString;
            _baseDataFolder = baseDataFolder;
        }

        public void Insert(Prescription p, SQLiteConnection externalConn = null, SQLiteTransaction externalTrans = null)
        {
            if (p == null) throw new ArgumentNullException("p");

            if (string.IsNullOrEmpty(p.Id))
            {
                p.Id = Guid.NewGuid().ToString();
            }
            if (string.IsNullOrEmpty(p.CreatedAt))
            {
                p.CreatedAt = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss");
            }

            string sql = @"
                INSERT INTO prescriptions (
                    id, customer_id, patient_name, patient_phone, patient_national_id,
                    doctor_name, clinic, prescription_no, prescription_date,
                    notes, image_path, created_by, created_at, updated_at
                ) VALUES (
                    @id, @customerId, @patientName, @patientPhone, @patientNationalId,
                    @doctorName, @clinic, @prescriptionNo, @prescriptionDate,
                    @notes, @imagePath, @createdBy, @createdAt, @updatedAt
                );";

            if (externalConn != null && externalTrans != null)
            {
                using (var cmd = new SQLiteCommand(sql, externalConn, externalTrans))
                {
                    BindPrescriptionParameters(cmd, p);
                    cmd.ExecuteNonQuery();
                }
            }
            else
            {
                using (var conn = new SQLiteConnection(_connectionString))
                {
                    conn.Open();
                    using (var trans = conn.BeginTransaction())
                    {
                        try
                        {
                            using (var cmd = new SQLiteCommand(sql, conn, trans))
                            {
                                BindPrescriptionParameters(cmd, p);
                                cmd.ExecuteNonQuery();
                            }
                            trans.Commit();
                        }
                        catch
                        {
                            trans.Rollback();
                            throw;
                        }
                    }
                }
            }
        }

        private static void BindPrescriptionParameters(SQLiteCommand cmd, Prescription p)
        {
            cmd.Parameters.AddWithValue("@id", p.Id);
            cmd.Parameters.AddWithValue("@customerId", (object)p.CustomerId ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@patientName", p.PatientName);
            cmd.Parameters.AddWithValue("@patientPhone", (object)p.PatientPhone ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@patientNationalId", (object)p.PatientNationalId ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@doctorName", p.DoctorName);
            cmd.Parameters.AddWithValue("@clinic", (object)p.Clinic ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@prescriptionNo", (object)p.PrescriptionNo ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@prescriptionDate", p.PrescriptionDate);
            cmd.Parameters.AddWithValue("@notes", (object)p.Notes ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@imagePath", (object)p.ImagePath ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@createdBy", p.CreatedBy ?? "system");
            cmd.Parameters.AddWithValue("@createdAt", p.CreatedAt);
            cmd.Parameters.AddWithValue("@updatedAt", (object)p.UpdatedAt ?? DBNull.Value);
        }

        public void LinkSalePrescription(string saleId, string prescriptionId, SQLiteConnection externalConn = null, SQLiteTransaction externalTrans = null)
        {
            if (string.IsNullOrEmpty(saleId) || string.IsNullOrEmpty(prescriptionId)) return;

            string sql = @"
                INSERT OR IGNORE INTO sale_prescriptions (sale_id, prescription_id, created_at)
                VALUES (@saleId, @rxId, @createdAt);";

            string nowIso = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss");

            if (externalConn != null && externalTrans != null)
            {
                using (var cmd = new SQLiteCommand(sql, externalConn, externalTrans))
                {
                    cmd.Parameters.AddWithValue("@saleId", saleId);
                    cmd.Parameters.AddWithValue("@rxId", prescriptionId);
                    cmd.Parameters.AddWithValue("@createdAt", nowIso);
                    cmd.ExecuteNonQuery();
                }
            }
            else
            {
                using (var conn = new SQLiteConnection(_connectionString))
                {
                    conn.Open();
                    using (var trans = conn.BeginTransaction())
                    {
                        try
                        {
                            using (var cmd = new SQLiteCommand(sql, conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@saleId", saleId);
                                cmd.Parameters.AddWithValue("@rxId", prescriptionId);
                                cmd.Parameters.AddWithValue("@createdAt", nowIso);
                                cmd.ExecuteNonQuery();
                            }
                            trans.Commit();
                        }
                        catch
                        {
                            trans.Rollback();
                            throw;
                        }
                    }
                }
            }
        }

        public Prescription GetById(string id)
        {
            if (string.IsNullOrEmpty(id)) return null;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "SELECT * FROM prescriptions WHERE id = @id LIMIT 1;";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", id);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            return MapPrescription(reader);
                        }
                    }
                }
            }

            return null;
        }

        public List<Prescription> GetAll(string search = null, int limit = 50)
        {
            var list = new List<Prescription>();

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "SELECT * FROM prescriptions WHERE 1=1";

                if (!string.IsNullOrEmpty(search))
                {
                    sql += " AND (patient_name LIKE @q OR doctor_name LIKE @q OR prescription_no LIKE @q OR patient_phone LIKE @q)";
                }

                sql += " ORDER BY created_at DESC LIMIT @limit;";

                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    if (!string.IsNullOrEmpty(search))
                    {
                        cmd.Parameters.AddWithValue("@q", "%" + search.Trim() + "%");
                    }
                    cmd.Parameters.AddWithValue("@limit", limit > 0 ? limit : 50);

                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            list.Add(MapPrescription(reader));
                        }
                    }
                }
            }

            return list;
        }

        public List<Prescription> GetPrescriptionsForSale(string saleId)
        {
            var list = new List<Prescription>();
            if (string.IsNullOrEmpty(saleId)) return list;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT p.* 
                    FROM prescriptions p
                    JOIN sale_prescriptions sp ON p.id = sp.prescription_id
                    WHERE sp.sale_id = @sid
                    ORDER BY p.created_at ASC;";

                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@sid", saleId);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            list.Add(MapPrescription(reader));
                        }
                    }
                }
            }

            return list;
        }

        public string SavePrescriptionImage(string prescriptionId, byte[] imageBytes, string extension)
        {
            if (string.IsNullOrEmpty(prescriptionId)) throw new ArgumentNullException("prescriptionId");
            if (imageBytes == null || imageBytes.Length == 0) return null;

            // Maximum allowed size: 1.5MB after compression (P5 invariant)
            if (imageBytes.Length > 2 * 1024 * 1024)
            {
                throw new InvalidOperationException("حجم صورة الروشتة يتجاوز الحد الأقصى المسموح به (2 ميجابايت).");
            }

            // Image Header / Magic Bytes Validation (CWE-434 defense)
            if (!IsValidImageHeader(imageBytes))
            {
                throw new InvalidOperationException("الملف المرفق ليس صورة صالحة مدعومة (يجب أن يكون الملف بصيغة JPG أو PNG أو WEBP حقيقية).");
            }

            string baseDir = !string.IsNullOrEmpty(_baseDataFolder) ? _baseDataFolder : AppDomain.CurrentDomain.BaseDirectory;
            string subPath = Path.Combine("prescriptions", DateTime.UtcNow.ToString("yyyy"), DateTime.UtcNow.ToString("MM"));
            string fullDir = Path.Combine(baseDir, subPath);

            if (!Directory.Exists(fullDir))
            {
                Directory.CreateDirectory(fullDir);
            }

            // Extension Whitelist (strictly allow only safe image formats)
            string ext = "jpg";
            if (!string.IsNullOrEmpty(extension))
            {
                string cleanExt = extension.Trim().TrimStart('.').ToLowerInvariant();
                if (cleanExt == "jpeg" || cleanExt == "jpg" || cleanExt == "png" || cleanExt == "webp")
                {
                    ext = cleanExt;
                }
            }

            // Sanitize prescriptionId against path manipulation
            string safeRxId = System.Text.RegularExpressions.Regex.Replace(prescriptionId ?? "", @"[^a-zA-Z0-9_\-]", "");
            if (string.IsNullOrEmpty(safeRxId)) safeRxId = Guid.NewGuid().ToString("N");

            string fileName = string.Format("rx_{0}_{1}.{2}", safeRxId, DateTime.UtcNow.ToString("yyyyMMddHHmmss"), ext);
            
            string canonicalFullDir = Path.GetFullPath(fullDir);
            if (!canonicalFullDir.EndsWith(Path.DirectorySeparatorChar.ToString()))
            {
                canonicalFullDir += Path.DirectorySeparatorChar;
            }

            string fullPath = Path.GetFullPath(Path.Combine(fullDir, fileName));
            if (!fullPath.StartsWith(canonicalFullDir, StringComparison.OrdinalIgnoreCase))
            {
                throw new System.Security.SecurityException("مسار غير آمن لحفظ صورة الروشتة.");
            }

            File.WriteAllBytes(fullPath, imageBytes);

            string relativePath = Path.Combine(subPath, fileName).Replace("\\", "/");

            // Update prescription record
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("UPDATE prescriptions SET image_path = @img, updated_at = @now WHERE id = @id;", conn))
                {
                    cmd.Parameters.AddWithValue("@img", relativePath);
                    cmd.Parameters.AddWithValue("@now", DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss"));
                    cmd.Parameters.AddWithValue("@id", prescriptionId);
                    cmd.ExecuteNonQuery();
                }
            }

            return relativePath;
        }

        private static Prescription MapPrescription(SQLiteDataReader r)
        {
            return new Prescription
            {
                Id = r["id"].ToString(),
                CustomerId = r["customer_id"] != DBNull.Value ? r["customer_id"].ToString() : null,
                PatientName = r["patient_name"].ToString(),
                PatientPhone = r["patient_phone"] != DBNull.Value ? r["patient_phone"].ToString() : null,
                PatientNationalId = r["patient_national_id"] != DBNull.Value ? r["patient_national_id"].ToString() : null,
                DoctorName = r["doctor_name"].ToString(),
                Clinic = r["clinic"] != DBNull.Value ? r["clinic"].ToString() : null,
                PrescriptionNo = r["prescription_no"] != DBNull.Value ? r["prescription_no"].ToString() : null,
                PrescriptionDate = r["prescription_date"].ToString(),
                Notes = r["notes"] != DBNull.Value ? r["notes"].ToString() : null,
                ImagePath = r["image_path"] != DBNull.Value ? r["image_path"].ToString() : null,
                CreatedBy = r["created_by"].ToString(),
                CreatedAt = r["created_at"].ToString(),
                UpdatedAt = r["updated_at"] != DBNull.Value ? r["updated_at"].ToString() : null
            };
        }

        private static bool IsValidImageHeader(byte[] bytes)
        {
            if (bytes == null || bytes.Length < 4) return false;

            // JPEG: FF D8 FF
            if (bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF) return true;

            // PNG: 89 50 4E 47
            if (bytes.Length >= 8 && bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47) return true;

            // WEBP: RIFF....WEBP
            if (bytes.Length >= 12 &&
                bytes[0] == 0x52 && bytes[1] == 0x49 && bytes[2] == 0x46 && bytes[3] == 0x46 &&
                bytes[8] == 0x57 && bytes[9] == 0x45 && bytes[10] == 0x42 && bytes[11] == 0x50)
            {
                return true;
            }

            return false;
        }
    }
}

