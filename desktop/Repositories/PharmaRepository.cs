using System;
using System.Collections.Generic;
using System.Data.SQLite;
using RafiqPOS.Models;

namespace RafiqPOS.Repositories
{
    /// <summary>
    /// مستودع البيانات الصيدلانية الممتدة والأشكال والمواد الفعالة (Story 130 / Feature #187)
    /// </summary>
    public class PharmaRepository
    {
        private readonly string _connectionString;

        public PharmaRepository(string connectionString)
        {
            _connectionString = connectionString;
        }

        public ProductPharmaInfo GetPharmaInfo(string productId)
        {
            if (string.IsNullOrEmpty(productId)) return null;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT 
                        pi.product_id, pi.scientific_name, pi.normalized_scientific_name,
                        pi.dosage_form_id, df.name_ar AS dosage_form_name,
                        pi.strength_text, pi.route,
                        pi.manufacturer_id, m.name_ar AS manufacturer_name,
                        pi.registration_no, pi.rx_status, pi.controlled_schedule,
                        pi.storage_condition, pi.usage_notes,
                        pi.therapeutic_class_id, tc.name_ar AS therapeutic_class_name,
                        pi.created_at, pi.updated_at
                    FROM product_pharma_info pi
                    LEFT JOIN pharma_dosage_forms df ON pi.dosage_form_id = df.id
                    LEFT JOIN pharma_manufacturers m ON pi.manufacturer_id = m.id
                    LEFT JOIN therapeutic_classes tc ON pi.therapeutic_class_id = tc.id
                    WHERE pi.product_id = @pid LIMIT 1;";

                ProductPharmaInfo info = null;

                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@pid", productId);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            info = new ProductPharmaInfo
                            {
                                ProductId = reader["product_id"].ToString(),
                                ScientificName = reader["scientific_name"].ToString(),
                                NormalizedScientificName = reader["normalized_scientific_name"].ToString(),
                                DosageFormId = reader["dosage_form_id"] != DBNull.Value ? reader["dosage_form_id"].ToString() : null,
                                DosageFormName = reader["dosage_form_name"] != DBNull.Value ? reader["dosage_form_name"].ToString() : null,
                                StrengthText = reader["strength_text"] != DBNull.Value ? reader["strength_text"].ToString() : null,
                                Route = reader["route"] != DBNull.Value ? reader["route"].ToString() : null,
                                ManufacturerId = reader["manufacturer_id"] != DBNull.Value ? reader["manufacturer_id"].ToString() : null,
                                ManufacturerName = reader["manufacturer_name"] != DBNull.Value ? reader["manufacturer_name"].ToString() : null,
                                RegistrationNo = reader["registration_no"] != DBNull.Value ? reader["registration_no"].ToString() : null,
                                RxStatus = reader["rx_status"] != DBNull.Value ? reader["rx_status"].ToString() : "otc",
                                ControlledSchedule = reader["controlled_schedule"] != DBNull.Value ? reader["controlled_schedule"].ToString() : null,
                                StorageCondition = reader["storage_condition"] != DBNull.Value ? reader["storage_condition"].ToString() : "room",
                                UsageNotes = reader["usage_notes"] != DBNull.Value ? reader["usage_notes"].ToString() : null,
                                TherapeuticClassId = reader["therapeutic_class_id"] != DBNull.Value ? reader["therapeutic_class_id"].ToString() : null,
                                TherapeuticClassName = reader["therapeutic_class_name"] != DBNull.Value ? reader["therapeutic_class_name"].ToString() : null,
                                CreatedAt = reader["created_at"].ToString(),
                                UpdatedAt = reader["updated_at"] != DBNull.Value ? reader["updated_at"].ToString() : null
                            };
                        }
                    }
                }

                if (info != null)
                {
                    // Load ingredients
                    string ingSql = @"
                        SELECT 
                            ping.ingredient_id, ping.strength_value_micro, ping.strength_unit,
                            ai.name_en, ai.name_ar
                        FROM product_ingredients ping
                        JOIN active_ingredients ai ON ping.ingredient_id = ai.id
                        WHERE ping.product_id = @pid
                        ORDER BY ping.strength_value_micro DESC;";

                    using (var ingCmd = new SQLiteCommand(ingSql, conn))
                    {
                        ingCmd.Parameters.AddWithValue("@pid", productId);
                        using (var reader = ingCmd.ExecuteReader())
                        {
                            while (reader.Read())
                            {
                                info.Ingredients.Add(new ProductIngredientDto
                                {
                                    IngredientId = reader["ingredient_id"].ToString(),
                                    IngredientNameEn = reader["name_en"].ToString(),
                                    IngredientNameAr = reader["name_ar"] != DBNull.Value ? reader["name_ar"].ToString() : "",
                                    StrengthValueMicro = Convert.ToInt32(reader["strength_value_micro"]),
                                    StrengthUnit = reader["strength_unit"].ToString()
                                });
                            }
                        }
                    }
                }

                return info;
            }
        }

        public ProductPharmaInfo SavePharmaInfo(ProductPharmaInfo info, string userId)
        {
            if (info == null) throw new ArgumentNullException("info");
            if (string.IsNullOrEmpty(info.ProductId)) throw new ArgumentException("معرف المنتج مطلوب.");

            if (string.IsNullOrEmpty(info.ScientificName))
            {
                info.ScientificName = "";
            }
            info.NormalizedScientificName = NormalizePharmaText(info.ScientificName);

            info.UpdatedAt = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss");
            if (string.IsNullOrEmpty(info.CreatedAt))
            {
                info.CreatedAt = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss");
            }

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        string upsertSql = @"
                            INSERT OR REPLACE INTO product_pharma_info (
                                product_id, scientific_name, normalized_scientific_name,
                                dosage_form_id, strength_text, route, manufacturer_id,
                                registration_no, rx_status, controlled_schedule,
                                storage_condition, usage_notes, therapeutic_class_id,
                                created_at, updated_at
                            ) VALUES (
                                @product_id, @scientific_name, @normalized_scientific_name,
                                @dosage_form_id, @strength_text, @route, @manufacturer_id,
                                @registration_no, @rx_status, @controlled_schedule,
                                @storage_condition, @usage_notes, @therapeutic_class_id,
                                @created_at, @updated_at
                            );";

                        using (var cmd = new SQLiteCommand(upsertSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@product_id", info.ProductId);
                            cmd.Parameters.AddWithValue("@scientific_name", info.ScientificName);
                            cmd.Parameters.AddWithValue("@normalized_scientific_name", info.NormalizedScientificName);
                            cmd.Parameters.AddWithValue("@dosage_form_id", (object)info.DosageFormId ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@strength_text", (object)info.StrengthText ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@route", (object)info.Route ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@manufacturer_id", (object)info.ManufacturerId ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@registration_no", (object)info.RegistrationNo ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@rx_status", info.RxStatus ?? "otc");
                            cmd.Parameters.AddWithValue("@controlled_schedule", (object)info.ControlledSchedule ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@storage_condition", info.StorageCondition ?? "room");
                            cmd.Parameters.AddWithValue("@usage_notes", (object)info.UsageNotes ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@therapeutic_class_id", (object)info.TherapeuticClassId ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@created_at", info.CreatedAt);
                            cmd.Parameters.AddWithValue("@updated_at", info.UpdatedAt);

                            cmd.ExecuteNonQuery();
                        }

                        // Sync cold chain flag on products table based on storage_condition
                        bool isCold = (info.StorageCondition == "fridge" || info.StorageCondition == "freezer");
                        using (var pColdCmd = new SQLiteCommand("UPDATE products SET is_cold_chain = @cold WHERE id = @pid;", conn, trans))
                        {
                            pColdCmd.Parameters.AddWithValue("@cold", isCold ? 1 : 0);
                            pColdCmd.Parameters.AddWithValue("@pid", info.ProductId);
                            pColdCmd.ExecuteNonQuery();
                        }

                        // Sync ingredients
                        using (var delCmd = new SQLiteCommand("DELETE FROM product_ingredients WHERE product_id = @pid;", conn, trans))
                        {
                            delCmd.Parameters.AddWithValue("@pid", info.ProductId);
                            delCmd.ExecuteNonQuery();
                        }

                        if (info.Ingredients != null && info.Ingredients.Count > 0)
                        {
                            string insIngSql = @"
                                INSERT INTO product_ingredients (
                                    product_id, ingredient_id, strength_value_micro, strength_unit
                                ) VALUES (
                                    @pid, @iid, @micro, @unit
                                );";

                            for (int i = 0; i < info.Ingredients.Count; i++)
                            {
                                var ing = info.Ingredients[i];
                                if (string.IsNullOrEmpty(ing.IngredientId)) continue;

                                using (var insCmd = new SQLiteCommand(insIngSql, conn, trans))
                                {
                                    insCmd.Parameters.AddWithValue("@pid", info.ProductId);
                                    insCmd.Parameters.AddWithValue("@iid", ing.IngredientId);
                                    insCmd.Parameters.AddWithValue("@micro", ing.StrengthValueMicro);
                                    insCmd.Parameters.AddWithValue("@unit", ing.StrengthUnit ?? "mg");
                                    insCmd.ExecuteNonQuery();
                                }
                            }
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

            return GetPharmaInfo(info.ProductId);
        }

        public List<PharmaDosageForm> GetDosageForms(bool onlyActive = true)
        {
            var list = new List<PharmaDosageForm>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "SELECT id, name_ar, name_en, code, is_active FROM pharma_dosage_forms ";
                if (onlyActive) sql += " WHERE is_active = 1 ";
                sql += " ORDER BY name_ar ASC;";

                using (var cmd = new SQLiteCommand(sql, conn))
                using (var reader = cmd.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        list.Add(new PharmaDosageForm
                        {
                            Id = reader["id"].ToString(),
                            NameAr = reader["name_ar"].ToString(),
                            NameEn = reader["name_en"] != DBNull.Value ? reader["name_en"].ToString() : null,
                            Code = reader["code"] != DBNull.Value ? reader["code"].ToString() : null,
                            IsActive = Convert.ToInt32(reader["is_active"]) == 1
                        });
                    }
                }
            }
            return list;
        }

        public PharmaDosageForm SaveDosageForm(PharmaDosageForm form)
        {
            if (form == null) throw new ArgumentNullException("form");
            if (string.IsNullOrEmpty(form.Id)) form.Id = Guid.NewGuid().ToString();

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    INSERT OR REPLACE INTO pharma_dosage_forms (id, name_ar, name_en, code, is_active)
                    VALUES (@id, @name_ar, @name_en, @code, @is_active);";

                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", form.Id);
                    cmd.Parameters.AddWithValue("@name_ar", form.NameAr);
                    cmd.Parameters.AddWithValue("@name_en", (object)form.NameEn ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@code", (object)form.Code ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@is_active", form.IsActive ? 1 : 0);
                    cmd.ExecuteNonQuery();
                }
            }
            return form;
        }

        public List<PharmaManufacturer> GetManufacturers(bool onlyActive = true)
        {
            var list = new List<PharmaManufacturer>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "SELECT id, name_ar, name_en, country, is_active FROM pharma_manufacturers ";
                if (onlyActive) sql += " WHERE is_active = 1 ";
                sql += " ORDER BY name_ar ASC;";

                using (var cmd = new SQLiteCommand(sql, conn))
                using (var reader = cmd.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        list.Add(new PharmaManufacturer
                        {
                            Id = reader["id"].ToString(),
                            NameAr = reader["name_ar"].ToString(),
                            NameEn = reader["name_en"] != DBNull.Value ? reader["name_en"].ToString() : null,
                            Country = reader["country"] != DBNull.Value ? reader["country"].ToString() : null,
                            IsActive = Convert.ToInt32(reader["is_active"]) == 1
                        });
                    }
                }
            }
            return list;
        }

        public PharmaManufacturer SaveManufacturer(PharmaManufacturer manufacturer)
        {
            if (manufacturer == null) throw new ArgumentNullException("manufacturer");
            if (string.IsNullOrEmpty(manufacturer.Id)) manufacturer.Id = Guid.NewGuid().ToString();

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    INSERT OR REPLACE INTO pharma_manufacturers (id, name_ar, name_en, country, is_active)
                    VALUES (@id, @name_ar, @name_en, @country, @is_active);";

                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", manufacturer.Id);
                    cmd.Parameters.AddWithValue("@name_ar", manufacturer.NameAr);
                    cmd.Parameters.AddWithValue("@name_en", (object)manufacturer.NameEn ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@country", (object)manufacturer.Country ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@is_active", manufacturer.IsActive ? 1 : 0);
                    cmd.ExecuteNonQuery();
                }
            }
            return manufacturer;
        }

        public List<TherapeuticClass> GetTherapeuticClasses(bool onlyActive = true)
        {
            var list = new List<TherapeuticClass>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "SELECT id, name_ar, name_en, code, description, is_active FROM therapeutic_classes ";
                if (onlyActive) sql += " WHERE is_active = 1 ";
                sql += " ORDER BY name_ar ASC;";

                using (var cmd = new SQLiteCommand(sql, conn))
                using (var reader = cmd.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        list.Add(new TherapeuticClass
                        {
                            Id = reader["id"].ToString(),
                            NameAr = reader["name_ar"].ToString(),
                            NameEn = reader["name_en"] != DBNull.Value ? reader["name_en"].ToString() : null,
                            Code = reader["code"] != DBNull.Value ? reader["code"].ToString() : null,
                            Description = reader["description"] != DBNull.Value ? reader["description"].ToString() : null,
                            IsActive = Convert.ToInt32(reader["is_active"]) == 1
                        });
                    }
                }
            }
            return list;
        }

        public TherapeuticClass SaveTherapeuticClass(TherapeuticClass tc)
        {
            if (tc == null) throw new ArgumentNullException("tc");
            if (string.IsNullOrEmpty(tc.Id)) tc.Id = Guid.NewGuid().ToString();

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    INSERT OR REPLACE INTO therapeutic_classes (id, name_ar, name_en, code, description, is_active)
                    VALUES (@id, @name_ar, @name_en, @code, @description, @is_active);";

                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", tc.Id);
                    cmd.Parameters.AddWithValue("@name_ar", tc.NameAr);
                    cmd.Parameters.AddWithValue("@name_en", (object)tc.NameEn ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@code", (object)tc.Code ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@description", (object)tc.Description ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@is_active", tc.IsActive ? 1 : 0);
                    cmd.ExecuteNonQuery();
                }
            }
            return tc;
        }

        public List<ActiveIngredient> GetActiveIngredients(string search = null)
        {
            var list = new List<ActiveIngredient>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "SELECT id, name_en, name_ar, normalized_name, is_active FROM active_ingredients WHERE is_active = 1 ";
                if (!string.IsNullOrEmpty(search))
                {
                    sql += " AND (name_en LIKE @q OR name_ar LIKE @q OR normalized_name LIKE @nq) ";
                }
                sql += " ORDER BY name_en ASC LIMIT 100;";

                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    if (!string.IsNullOrEmpty(search))
                    {
                        cmd.Parameters.AddWithValue("@q", "%" + search.Trim() + "%");
                        cmd.Parameters.AddWithValue("@nq", "%" + NormalizePharmaText(search) + "%");
                    }

                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            list.Add(new ActiveIngredient
                            {
                                Id = reader["id"].ToString(),
                                NameEn = reader["name_en"].ToString(),
                                NameAr = reader["name_ar"] != DBNull.Value ? reader["name_ar"].ToString() : null,
                                NormalizedName = reader["normalized_name"].ToString(),
                                IsActive = Convert.ToInt32(reader["is_active"]) == 1
                            });
                        }
                    }
                }
            }
            return list;
        }

        public ActiveIngredient SaveActiveIngredient(ActiveIngredient ing)
        {
            if (ing == null) throw new ArgumentNullException("ing");
            if (string.IsNullOrEmpty(ing.Id)) ing.Id = Guid.NewGuid().ToString();
            if (string.IsNullOrEmpty(ing.NormalizedName))
            {
                ing.NormalizedName = NormalizePharmaText(ing.NameEn + " " + (ing.NameAr ?? ""));
            }

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    INSERT OR REPLACE INTO active_ingredients (id, name_en, name_ar, normalized_name, is_active)
                    VALUES (@id, @name_en, @name_ar, @normalized_name, @is_active);";

                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", ing.Id);
                    cmd.Parameters.AddWithValue("@name_en", ing.NameEn);
                    cmd.Parameters.AddWithValue("@name_ar", (object)ing.NameAr ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@normalized_name", ing.NormalizedName);
                    cmd.Parameters.AddWithValue("@is_active", ing.IsActive ? 1 : 0);
                    cmd.ExecuteNonQuery();
                }
            }
            return ing;
        }

        public static string NormalizePharmaText(string text)
        {
            if (string.IsNullOrEmpty(text)) return "";
            string lower = text.Trim().ToLowerInvariant();
            // Normalize Arabic letters
            lower = lower.Replace("أ", "ا").Replace("إ", "ا").Replace("آ", "ا")
                         .Replace("ة", "ه").Replace("ى", "ي");
            return lower;
        }
    }
}
