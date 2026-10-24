using System;
using System.Collections.Generic;
using System.Data.SQLite;
using RafiqPOS.Models;

namespace RafiqPOS.Repositories
{
    public class PatientRepository
    {
        private readonly string _connectionString;
        private readonly AuditLogRepository _auditRepo;

        public PatientRepository(string connectionString, AuditLogRepository auditRepo = null)
        {
            this._connectionString = connectionString;
            this._auditRepo = auditRepo;
        }

        public CustomerPatientInfo GetProfile(string customerId)
        {
            if (string.IsNullOrEmpty(customerId)) return null;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand(@"
                    SELECT c.id as customer_id, c.name as customer_name, c.phone as customer_phone,
                           cpi.birth_year, cpi.gender, cpi.allergies, cpi.chronic_conditions,
                           cpi.notes, cpi.created_at, cpi.updated_at
                    FROM customers c
                    LEFT JOIN customer_patient_info cpi ON cpi.customer_id = c.id
                    WHERE c.id = @customerId;
                ", conn))
                {
                    cmd.Parameters.AddWithValue("@customerId", customerId);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            var info = new CustomerPatientInfo();
                            info.CustomerId = reader["customer_id"].ToString();
                            info.CustomerName = reader["customer_name"].ToString();
                            info.CustomerPhone = reader["customer_phone"] != DBNull.Value ? reader["customer_phone"].ToString() : "";
                            
                            if (reader["birth_year"] != DBNull.Value)
                            {
                                int by;
                                if (int.TryParse(reader["birth_year"].ToString(), out by))
                                {
                                    info.BirthYear = by;
                                }
                            }
                            info.Gender = reader["gender"] != DBNull.Value ? reader["gender"].ToString() : "";
                            info.Allergies = reader["allergies"] != DBNull.Value ? reader["allergies"].ToString() : "";
                            info.ChronicConditions = reader["chronic_conditions"] != DBNull.Value ? reader["chronic_conditions"].ToString() : "";
                            info.Notes = reader["notes"] != DBNull.Value ? reader["notes"].ToString() : "";
                            info.CreatedAt = reader["created_at"] != DBNull.Value ? reader["created_at"].ToString() : "";
                            info.UpdatedAt = reader["updated_at"] != DBNull.Value ? reader["updated_at"].ToString() : "";
                            return info;
                        }
                    }
                }
            }

            return null;
        }

        public CustomerPatientInfo SaveProfile(CustomerPatientInfo info, string userId)
        {
            if (info == null || string.IsNullOrEmpty(info.CustomerId))
            {
                throw new ArgumentException("معرف العميل مطلوب لحفظ الملف الطبي.");
            }

            string now = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss");

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        // 1. Verify customer exists
                        using (var chkCmd = new SQLiteCommand("SELECT name, phone FROM customers WHERE id = @cid;", conn, trans))
                        {
                            chkCmd.Parameters.AddWithValue("@cid", info.CustomerId);
                            using (var r = chkCmd.ExecuteReader())
                            {
                                if (!r.Read())
                                {
                                    throw new InvalidOperationException("العميل غير مسجل بالنظام: " + info.CustomerId);
                                }
                                info.CustomerName = r["name"].ToString();
                                info.CustomerPhone = r["phone"] != DBNull.Value ? r["phone"].ToString() : "";
                            }
                        }

                        // 2. Insert or replace patient profile
                        using (var cmd = new SQLiteCommand(@"
                            INSERT INTO customer_patient_info (
                                customer_id, birth_year, gender, allergies, chronic_conditions,
                                notes, created_at, updated_at
                            ) VALUES (
                                @customerId, @birthYear, @gender, @allergies, @chronicConditions,
                                @notes, COALESCE((SELECT created_at FROM customer_patient_info WHERE customer_id = @customerId), @createdAt), @updatedAt
                            )
                            ON CONFLICT(customer_id) DO UPDATE SET
                                birth_year = excluded.birth_year,
                                gender = excluded.gender,
                                allergies = excluded.allergies,
                                chronic_conditions = excluded.chronic_conditions,
                                notes = excluded.notes,
                                updated_at = excluded.updated_at;
                        ", conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@customerId", info.CustomerId);
                            cmd.Parameters.AddWithValue("@birthYear", info.BirthYear.HasValue ? (object)info.BirthYear.Value : DBNull.Value);
                            cmd.Parameters.AddWithValue("@gender", (object)info.Gender ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@allergies", (object)info.Allergies ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@chronicConditions", (object)info.ChronicConditions ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@notes", (object)info.Notes ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@createdAt", now);
                            cmd.Parameters.AddWithValue("@updatedAt", now);
                            cmd.ExecuteNonQuery();
                        }

                        if (_auditRepo != null)
                        {
                            _auditRepo.Log(conn, trans, new AuditLog
                            {
                                Id = "aud_" + Guid.NewGuid().ToString("N"),
                                Action = "save_patient_profile",
                                EntityType = "customer_patient_info",
                                EntityId = info.CustomerId,
                                DetailsJson = Newtonsoft.Json.JsonConvert.SerializeObject(new { name = info.CustomerName, allergies = info.Allergies, chronic = info.ChronicConditions }),
                                CreatedAt = now,
                                UserId = userId ?? "system"
                            });
                        }

                        trans.Commit();
                        info.UpdatedAt = now;
                        return info;
                    }
                    catch
                    {
                        trans.Rollback();
                        throw;
                    }
                }
            }
        }

        public List<ChronicMedication> GetChronicMedications(string customerId)
        {
            var list = new List<ChronicMedication>();
            if (string.IsNullOrEmpty(customerId)) return list;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand(@"
                    SELECT cm.id, cm.customer_id, cm.product_id, cm.daily_qty_milli,
                           cm.last_dispensed_at, cm.next_due_date, cm.notes, cm.created_at,
                           p.name as product_name, p.barcode as product_barcode,
                           p.price_piasters, p.stock_quantity_milli
                    FROM chronic_medications cm
                    JOIN products p ON p.id = cm.product_id
                    WHERE cm.customer_id = @customerId
                    ORDER BY cm.created_at ASC;
                ", conn))
                {
                    cmd.Parameters.AddWithValue("@customerId", customerId);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            var med = new ChronicMedication();
                            med.Id = reader["id"].ToString();
                            med.CustomerId = reader["customer_id"].ToString();
                            med.ProductId = reader["product_id"].ToString();
                            med.ProductName = reader["product_name"].ToString();
                            med.Barcode = reader["product_barcode"] != DBNull.Value ? reader["product_barcode"].ToString() : "";
                            med.DailyQtyMilli = Convert.ToInt32(reader["daily_qty_milli"]);
                            med.LastDispensedAt = reader["last_dispensed_at"] != DBNull.Value ? reader["last_dispensed_at"].ToString() : null;
                            med.NextDueDate = reader["next_due_date"] != DBNull.Value ? reader["next_due_date"].ToString() : null;
                            med.Notes = reader["notes"] != DBNull.Value ? reader["notes"].ToString() : "";
                            med.CreatedAt = reader["created_at"].ToString();
                            med.PricePiasters = Convert.ToInt64(reader["price_piasters"]);
                            med.StockQuantityMilli = Convert.ToInt64(reader["stock_quantity_milli"]);
                            list.Add(med);
                        }
                    }
                }
            }

            return list;
        }

        public ChronicMedication SaveChronicMedication(ChronicMedication med, string userId)
        {
            if (med == null) throw new ArgumentNullException("med");
            if (string.IsNullOrEmpty(med.CustomerId)) throw new ArgumentException("معرف العميل مطلوب.");
            if (string.IsNullOrEmpty(med.ProductId)) throw new ArgumentException("معرف الصنف مطلوب.");

            if (string.IsNullOrEmpty(med.Id))
            {
                med.Id = Guid.NewGuid().ToString("N");
            }

            if (med.DailyQtyMilli <= 0)
            {
                med.DailyQtyMilli = 1000;
            }

            string now = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss");

            // Calculate next due date if missing
            if (string.IsNullOrEmpty(med.NextDueDate))
            {
                int supplyDays = med.DaysSupply > 0 ? med.DaysSupply : 30;
                DateTime baseDate = DateTime.UtcNow;
                if (!string.IsNullOrEmpty(med.LastDispensedAt))
                {
                    DateTime parsed;
                    if (DateTime.TryParse(med.LastDispensedAt, out parsed))
                    {
                        baseDate = parsed;
                    }
                }
                med.NextDueDate = baseDate.AddDays(supplyDays).ToString("yyyy-MM-dd");
            }

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        using (var cmd = new SQLiteCommand(@"
                            INSERT INTO chronic_medications (
                                id, customer_id, product_id, daily_qty_milli,
                                last_dispensed_at, next_due_date, notes, created_at
                            ) VALUES (
                                @id, @customerId, @productId, @dailyQtyMilli,
                                @lastDispensedAt, @nextDueDate, @notes, COALESCE((SELECT created_at FROM chronic_medications WHERE id = @id), @createdAt)
                            )
                            ON CONFLICT(id) DO UPDATE SET
                                daily_qty_milli = excluded.daily_qty_milli,
                                last_dispensed_at = excluded.last_dispensed_at,
                                next_due_date = excluded.next_due_date,
                                notes = excluded.notes;
                        ", conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@id", med.Id);
                            cmd.Parameters.AddWithValue("@customerId", med.CustomerId);
                            cmd.Parameters.AddWithValue("@productId", med.ProductId);
                            cmd.Parameters.AddWithValue("@dailyQtyMilli", med.DailyQtyMilli);
                            cmd.Parameters.AddWithValue("@lastDispensedAt", (object)med.LastDispensedAt ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@nextDueDate", (object)med.NextDueDate ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@notes", (object)med.Notes ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@createdAt", now);
                            cmd.ExecuteNonQuery();
                        }

                        // Load product info
                        using (var pCmd = new SQLiteCommand("SELECT name, barcode, price_piasters, stock_quantity_milli FROM products WHERE id = @pid;", conn, trans))
                        {
                            pCmd.Parameters.AddWithValue("@pid", med.ProductId);
                            using (var pr = pCmd.ExecuteReader())
                            {
                                if (pr.Read())
                                {
                                    med.ProductName = pr["name"].ToString();
                                    med.Barcode = pr["barcode"] != DBNull.Value ? pr["barcode"].ToString() : "";
                                    med.PricePiasters = Convert.ToInt64(pr["price_piasters"]);
                                    med.StockQuantityMilli = Convert.ToInt64(pr["stock_quantity_milli"]);
                                }
                            }
                        }

                        if (_auditRepo != null)
                        {
                            _auditRepo.Log(conn, trans, new AuditLog
                            {
                                Id = "aud_" + Guid.NewGuid().ToString("N"),
                                Action = "save_chronic_med",
                                EntityType = "chronic_medications",
                                EntityId = med.Id,
                                DetailsJson = Newtonsoft.Json.JsonConvert.SerializeObject(new { name = med.ProductName, customerId = med.CustomerId, nextDue = med.NextDueDate }),
                                CreatedAt = now,
                                UserId = userId ?? "system"
                            });
                        }

                        trans.Commit();
                        med.CreatedAt = now;
                        return med;
                    }
                    catch
                    {
                        trans.Rollback();
                        throw;
                    }
                }
            }
        }

        public bool DeleteChronicMedication(string id, string userId)
        {
            if (string.IsNullOrEmpty(id)) return false;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        using (var cmd = new SQLiteCommand("DELETE FROM chronic_medications WHERE id = @id;", conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@id", id);
                            int rows = cmd.ExecuteNonQuery();
                            if (rows > 0)
                            {
                                if (_auditRepo != null)
                                {
                                    _auditRepo.Log(conn, trans, new AuditLog
                                    {
                                        Id = "aud_" + Guid.NewGuid().ToString("N"),
                                        Action = "delete_chronic_med",
                                        EntityType = "chronic_medications",
                                        EntityId = id,
                                        DetailsJson = Newtonsoft.Json.JsonConvert.SerializeObject(new { medId = id }),
                                        CreatedAt = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss"),
                                        UserId = userId ?? "system"
                                    });
                                }
                                trans.Commit();
                                return true;
                            }
                        }
                        trans.Rollback();
                        return false;
                    }
                    catch
                    {
                        trans.Rollback();
                        throw;
                    }
                }
            }
        }

        public List<PatientDueAlert> GetDueAlerts(int daysAhead)
        {
            var result = new List<PatientDueAlert>();
            var dict = new Dictionary<string, PatientDueAlert>();

            if (daysAhead < 0) daysAhead = 0;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand(@"
                    SELECT cm.id, cm.customer_id, cm.product_id, cm.next_due_date,
                           c.name as customer_name, c.phone as customer_phone,
                           p.name as product_name,
                           CASE WHEN date(cm.next_due_date) < date('now') THEN 1 ELSE 0 END as is_overdue
                    FROM chronic_medications cm
                    JOIN customers c ON c.id = cm.customer_id
                    JOIN products p ON p.id = cm.product_id
                    WHERE cm.next_due_date IS NOT NULL 
                      AND date(cm.next_due_date) <= date('now', '+' || @daysAhead || ' days')
                    ORDER BY cm.next_due_date ASC;
                ", conn))
                {
                    cmd.Parameters.AddWithValue("@daysAhead", daysAhead);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            string custId = reader["customer_id"].ToString();
                            PatientDueAlert alert;
                            if (!dict.TryGetValue(custId, out alert))
                            {
                                alert = new PatientDueAlert();
                                alert.CustomerId = custId;
                                alert.CustomerName = reader["customer_name"].ToString();
                                alert.CustomerPhone = reader["customer_phone"] != DBNull.Value ? reader["customer_phone"].ToString() : "";
                                alert.EarliestDueDate = reader["next_due_date"].ToString();
                                dict[custId] = alert;
                                result.Add(alert);
                            }

                            alert.MedicationsCount++;
                            bool isOverdue = Convert.ToInt32(reader["is_overdue"]) == 1;
                            if (isOverdue) alert.OverdueCount++;
                            else alert.DueSoonCount++;

                            string pName = reader["product_name"].ToString();
                            if (!alert.MedicationNames.Contains(pName))
                            {
                                alert.MedicationNames.Add(pName);
                            }
                        }
                    }
                }
            }

            return result;
        }

        public bool RecordDispense(string customerId, List<string> productIds, int supplyDays, string dispensedAt, string userId)
        {
            if (string.IsNullOrEmpty(customerId) || productIds == null || productIds.Count == 0)
            {
                return false;
            }

            if (supplyDays <= 0) supplyDays = 30;
            string dispDate = !string.IsNullOrEmpty(dispensedAt) ? dispensedAt : DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss");
            DateTime baseDt;
            if (!DateTime.TryParse(dispDate, out baseDt)) baseDt = DateTime.UtcNow;
            string nextDue = baseDt.AddDays(supplyDays).ToString("yyyy-MM-dd");

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        foreach (string pid in productIds)
                        {
                            using (var cmd = new SQLiteCommand(@"
                                UPDATE chronic_medications
                                SET last_dispensed_at = @dispensedAt,
                                    next_due_date = @nextDue
                                WHERE customer_id = @customerId AND product_id = @productId;
                            ", conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@dispensedAt", dispDate);
                                cmd.Parameters.AddWithValue("@nextDue", nextDue);
                                cmd.Parameters.AddWithValue("@customerId", customerId);
                                cmd.Parameters.AddWithValue("@productId", pid);
                                cmd.ExecuteNonQuery();
                            }
                        }

                        if (_auditRepo != null)
                        {
                            _auditRepo.Log(conn, trans, new AuditLog
                            {
                                Id = "aud_" + Guid.NewGuid().ToString("N"),
                                Action = "dispense_chronic_meds",
                                EntityType = "chronic_medications",
                                EntityId = customerId,
                                DetailsJson = Newtonsoft.Json.JsonConvert.SerializeObject(new { customerId = customerId, count = productIds.Count, nextDue = nextDue }),
                                CreatedAt = dispDate,
                                UserId = userId ?? "system"
                            });
                        }

                        trans.Commit();
                        return true;
                    }
                    catch
                    {
                        trans.Rollback();
                        throw;
                    }
                }
            }
        }

        public AllergyCheckResult CheckAllergies(string customerId, List<string> productIds)
        {
            var res = new AllergyCheckResult();
            res.CustomerId = customerId;

            if (string.IsNullOrEmpty(customerId) || productIds == null || productIds.Count == 0)
            {
                return res;
            }

            // 1. Get patient allergies
            var profile = GetProfile(customerId);
            if (profile == null || string.IsNullOrWhiteSpace(profile.Allergies))
            {
                return res;
            }

            res.CustomerName = profile.CustomerName;

            // 2. Parse allergy keywords
            string[] rawTokens = profile.Allergies.Split(new char[] { ',', '،', ';', '؛', '\n', '\r', '|', '-' }, StringSplitOptions.RemoveEmptyEntries);
            var allergenTokens = new List<string>();
            for (int i = 0; i < rawTokens.Length; i++)
            {
                string t = rawTokens[i].Trim().ToLowerInvariant();
                if (t.Length >= 2 && !allergenTokens.Contains(t))
                {
                    allergenTokens.Add(t);
                    
                    // Arabic/English standard phonetic or generic aliases
                    if (t.Contains("بنسلين") || t.Contains("بنسيلين")) allergenTokens.Add("penicillin");
                    else if (t.Contains("penicillin")) allergenTokens.Add("بنسلين");

                    if (t.Contains("سلفا") || t.Contains("سولفا")) allergenTokens.Add("sulfa");
                    else if (t.Contains("sulfa")) allergenTokens.Add("سلفا");

                    if (t.Contains("باراسيتامول") || t.Contains("بنادول")) { allergenTokens.Add("paracetamol"); allergenTokens.Add("acetaminophen"); }
                    else if (t.Contains("paracetamol") || t.Contains("acetaminophen")) allergenTokens.Add("باراسيتامول");

                    if (t.Contains("اسبرين") || t.Contains("أسبرين")) { allergenTokens.Add("aspirin"); allergenTokens.Add("acetylsalicylic"); }
                    else if (t.Contains("aspirin")) allergenTokens.Add("أسبرين");

                    if (t.Contains("ايبوبروفين") || t.Contains("إيبوبروفين")) allergenTokens.Add("ibuprofen");
                    else if (t.Contains("ibuprofen")) allergenTokens.Add("ايبوبروفين");

                    if (t.Contains("مورفين")) allergenTokens.Add("morphine");
                    else if (t.Contains("morphine")) allergenTokens.Add("مورفين");
                }
            }

            if (allergenTokens.Count == 0) return res;

            // 3. For each product, check active ingredients and scientific name
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();

                foreach (string pid in productIds)
                {
                    if (string.IsNullOrEmpty(pid)) continue;

                    string prodName = "";
                    string sciName = "";
                    var ingredientNames = new List<string>();

                    using (var pCmd = new SQLiteCommand(@"
                        SELECT p.name as product_name,
                               COALESCE(ppi.scientific_name, '') as scientific_name
                        FROM products p
                        LEFT JOIN product_pharma_info ppi ON ppi.product_id = p.id
                        WHERE p.id = @pid;
                    ", conn))
                    {
                        pCmd.Parameters.AddWithValue("@pid", pid);
                        using (var r = pCmd.ExecuteReader())
                        {
                            if (r.Read())
                            {
                                prodName = r["product_name"].ToString();
                                sciName = r["scientific_name"].ToString();
                            }
                        }
                    }

                    using (var iCmd = new SQLiteCommand(@"
                        SELECT ai.name_ar, ai.name_en, ai.normalized_name
                        FROM product_ingredients pi
                        JOIN active_ingredients ai ON ai.id = pi.ingredient_id
                        WHERE pi.product_id = @pid;
                    ", conn))
                    {
                        iCmd.Parameters.AddWithValue("@pid", pid);
                        using (var ir = iCmd.ExecuteReader())
                        {
                            while (ir.Read())
                            {
                                string nAr = ir["name_ar"] != DBNull.Value ? ir["name_ar"].ToString() : "";
                                string nEn = ir["name_en"] != DBNull.Value ? ir["name_en"].ToString() : "";
                                string nNorm = ir["normalized_name"] != DBNull.Value ? ir["normalized_name"].ToString() : "";
                                if (!string.IsNullOrEmpty(nAr)) ingredientNames.Add(nAr);
                                if (!string.IsNullOrEmpty(nEn)) ingredientNames.Add(nEn);
                                if (!string.IsNullOrEmpty(nNorm)) ingredientNames.Add(nNorm);
                            }
                        }
                    }

                    // Check for keyword matches in product name, scientific name, or ingredients
                    string combinedSearchSpace = (prodName + " " + sciName + " " + string.Join(" ", ingredientNames.ToArray())).ToLowerInvariant();

                    for (int j = 0; j < allergenTokens.Count; j++)
                    {
                        string token = allergenTokens[j];
                        if (combinedSearchSpace.Contains(token))
                        {
                            var conflict = new AllergyConflictItem();
                            conflict.ProductId = pid;
                            conflict.ProductName = prodName;
                            conflict.AllergyMatch = token;
                            conflict.IngredientName = !string.IsNullOrEmpty(sciName) ? sciName : (ingredientNames.Count > 0 ? ingredientNames[0] : prodName);
                            conflict.WarningDetails = string.Format("تحذير حساسية: المريض يعاني من حساسية مسجلة تجاه ({0})، وهذا الصنف يحتوي على ({1})",
                                token, conflict.IngredientName);

                            res.Conflicts.Add(conflict);
                            res.HasConflict = true;
                            break; // Avoid duplicate warnings for same product
                        }
                    }
                }
            }

            return res;
        }
    }
}
