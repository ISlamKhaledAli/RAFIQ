using System;
using System.Collections.Generic;
using System.Data.SQLite;
using RafiqPOS.Models;

namespace RafiqPOS.Repositories
{
    /// <summary>
    /// مستودع بيانات التفاعلات الدوائية المرجعية (Drug Interactions Repository)
    /// Story 137 / Feature #194 / F-01
    /// </summary>
    public class DrugInteractionRepository
    {
        private readonly string _connectionString;
        private readonly AuditLogRepository _auditRepo;

        public DrugInteractionRepository(string connectionString, AuditLogRepository auditRepo = null)
        {
            _connectionString = connectionString;
            _auditRepo = auditRepo;
        }

        /// <summary>
        /// فحص دفعة من أزواج المواد الفعالة واستخراج التعارضات المسجلة
        /// </summary>
        public List<DrugInteraction> CheckPairs(List<Tuple<string, string>> pairs)
        {
            var results = new List<DrugInteraction>();
            if (pairs == null || pairs.Count == 0) return results;

            // Remove duplicates from candidate pairs
            var distinctPairs = new List<Tuple<string, string>>();
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            for (int i = 0; i < pairs.Count; i++)
            {
                var p = pairs[i];
                if (p == null || string.IsNullOrEmpty(p.Item1) || string.IsNullOrEmpty(p.Item2)) continue;

                string a = PharmaRepository.NormalizePharmaText(p.Item1);
                string b = PharmaRepository.NormalizePharmaText(p.Item2);
                if (string.IsNullOrEmpty(a) || string.IsNullOrEmpty(b) || a == b) continue;

                // Sort consistently
                string sortedA = string.CompareOrdinal(a, b) <= 0 ? a : b;
                string sortedB = string.CompareOrdinal(a, b) <= 0 ? b : a;
                string key = sortedA + "|" + sortedB;

                if (!seen.Contains(key))
                {
                    seen.Add(key);
                    distinctPairs.Add(new Tuple<string, string>(sortedA, sortedB));
                }
            }

            if (distinctPairs.Count == 0) return results;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();

                // Process in chunks of 40 pairs to keep parameter count low (< 100)
                int chunkSize = 40;
                for (int start = 0; start < distinctPairs.Count; start += chunkSize)
                {
                    int count = Math.Min(chunkSize, distinctPairs.Count - start);
                    var chunk = distinctPairs.GetRange(start, count);

                    var whereClauses = new List<string>();
                    for (int i = 0; i < chunk.Count; i++)
                    {
                        whereClauses.Add(string.Format("((active_ingredient_a = @a{0} AND active_ingredient_b = @b{0}) OR (active_ingredient_a = @b{0} AND active_ingredient_b = @a{0}))", i));
                    }

                    string sql = @"
                        SELECT id, active_ingredient_a, active_ingredient_b, severity,
                               mechanism_ar, clinical_risk_ar, recommendation_ar, alternative_ar,
                               source, created_at, updated_at
                        FROM drug_interactions
                        WHERE " + string.Join(" OR ", whereClauses.ToArray()) + ";";

                    using (var cmd = new SQLiteCommand(sql, conn))
                    {
                        for (int i = 0; i < chunk.Count; i++)
                        {
                            cmd.Parameters.AddWithValue(string.Format("@a{0}", i), chunk[i].Item1);
                            cmd.Parameters.AddWithValue(string.Format("@b{0}", i), chunk[i].Item2);
                        }

                        using (var reader = cmd.ExecuteReader())
                        {
                            while (reader.Read())
                            {
                                results.Add(MapFromReader(reader));
                            }
                        }
                    }
                }
            }

            return results;
        }

        /// <summary>
        /// استعلام جدول التفاعلات للشاشة الإدارية مع الفلترة والترقيم
        /// </summary>
        public List<DrugInteraction> GetAll(string search, string severity, int page, int limit, out int totalCount)
        {
            var list = new List<DrugInteraction>();
            totalCount = 0;

            if (page < 1) page = 1;
            if (limit < 1) limit = 20;
            int offset = (page - 1) * limit;

            string normalizedSearch = !string.IsNullOrEmpty(search) ? PharmaRepository.NormalizePharmaText(search) : "";
            string sevFilter = !string.IsNullOrEmpty(severity) && severity.ToLowerInvariant() != "all" ? severity.ToLowerInvariant() : "";

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();

                // Build WHERE condition
                var conditions = new List<string>();
                if (!string.IsNullOrEmpty(normalizedSearch))
                {
                    conditions.Add("(active_ingredient_a LIKE @q OR active_ingredient_b LIKE @q OR mechanism_ar LIKE @q OR clinical_risk_ar LIKE @q OR recommendation_ar LIKE @q OR alternative_ar LIKE @q)");
                }
                if (!string.IsNullOrEmpty(sevFilter))
                {
                    conditions.Add("severity = @sev");
                }

                string whereClause = conditions.Count > 0 ? "WHERE " + string.Join(" AND ", conditions.ToArray()) : "";

                // Count query
                string countSql = "SELECT COUNT(*) FROM drug_interactions " + whereClause + ";";
                using (var countCmd = new SQLiteCommand(countSql, conn))
                {
                    if (!string.IsNullOrEmpty(normalizedSearch))
                    {
                        countCmd.Parameters.AddWithValue("@q", "%" + normalizedSearch + "%");
                    }
                    if (!string.IsNullOrEmpty(sevFilter))
                    {
                        countCmd.Parameters.AddWithValue("@sev", sevFilter);
                    }
                    totalCount = Convert.ToInt32(countCmd.ExecuteScalar());
                }

                // Data query (order by severity weight: severe first, then moderate, then minor)
                string dataSql = @"
                    SELECT id, active_ingredient_a, active_ingredient_b, severity,
                           mechanism_ar, clinical_risk_ar, recommendation_ar, alternative_ar,
                           source, created_at, updated_at
                    FROM drug_interactions
                    " + whereClause + @"
                    ORDER BY 
                        CASE severity 
                            WHEN 'severe' THEN 1 
                            WHEN 'moderate' THEN 2 
                            WHEN 'minor' THEN 3 
                            ELSE 4 
                        END, 
                        active_ingredient_a ASC
                    LIMIT @limit OFFSET @offset;";

                using (var cmd = new SQLiteCommand(dataSql, conn))
                {
                    if (!string.IsNullOrEmpty(normalizedSearch))
                    {
                        cmd.Parameters.AddWithValue("@q", "%" + normalizedSearch + "%");
                    }
                    if (!string.IsNullOrEmpty(sevFilter))
                    {
                        cmd.Parameters.AddWithValue("@sev", sevFilter);
                    }
                    cmd.Parameters.AddWithValue("@limit", limit);
                    cmd.Parameters.AddWithValue("@offset", offset);

                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            list.Add(MapFromReader(reader));
                        }
                    }
                }
            }

            return list;
        }

        public DrugInteraction GetById(string id)
        {
            if (string.IsNullOrEmpty(id)) return null;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT id, active_ingredient_a, active_ingredient_b, severity,
                           mechanism_ar, clinical_risk_ar, recommendation_ar, alternative_ar,
                           source, created_at, updated_at
                    FROM drug_interactions
                    WHERE id = @id LIMIT 1;";

                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", id);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            return MapFromReader(reader);
                        }
                    }
                }
            }
            return null;
        }

        public DrugInteraction Save(DrugInteraction item, string userId)
        {
            if (item == null) throw new ArgumentNullException("item");

            string ingA = PharmaRepository.NormalizePharmaText(item.ActiveIngredientA);
            string ingB = PharmaRepository.NormalizePharmaText(item.ActiveIngredientB);

            if (string.IsNullOrEmpty(ingA)) throw new ArgumentException("المادة الفعالة الأولى مطلوبة.");
            if (string.IsNullOrEmpty(ingB)) throw new ArgumentException("المادة الفعالة الثانية مطلوبة.");
            if (ingA == ingB) throw new ArgumentException("لا يمكن تسجيل تعارض المادة الفعالة مع نفسها.");
            if (string.IsNullOrEmpty(item.MechanismAr)) throw new ArgumentException("شرح آلية التفاعل مطلوب.");
            if (string.IsNullOrEmpty(item.ClinicalRiskAr)) throw new ArgumentException("الخطر السريري مطلوب.");
            if (string.IsNullOrEmpty(item.RecommendationAr)) throw new ArgumentException("التوصية الطبية مطلوبة.");

            // Sort a <= b
            if (string.CompareOrdinal(ingA, ingB) > 0)
            {
                string temp = ingA;
                ingA = ingB;
                ingB = temp;
            }

            item.ActiveIngredientA = ingA;
            item.ActiveIngredientB = ingB;

            if (string.IsNullOrEmpty(item.Id))
            {
                item.Id = Guid.NewGuid().ToString();
            }

            string now = DateTime.UtcNow.ToString("o");
            item.UpdatedAt = now;
            if (string.IsNullOrEmpty(item.CreatedAt))
            {
                item.CreatedAt = now;
            }

            string sev = (item.Severity ?? "moderate").ToLowerInvariant();
            if (sev != "severe" && sev != "moderate" && sev != "minor")
            {
                sev = "moderate";
            }
            item.Severity = sev;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        string upsertSql = @"
                            INSERT INTO drug_interactions (
                                id, active_ingredient_a, active_ingredient_b, severity,
                                mechanism_ar, clinical_risk_ar, recommendation_ar, alternative_ar,
                                source, created_at, updated_at
                            ) VALUES (
                                @id, @a, @b, @sev, @mech, @risk, @rec, @alt, @source, @created, @updated
                            )
                            ON CONFLICT(id) DO UPDATE SET
                                active_ingredient_a = excluded.active_ingredient_a,
                                active_ingredient_b = excluded.active_ingredient_b,
                                severity = excluded.severity,
                                mechanism_ar = excluded.mechanism_ar,
                                clinical_risk_ar = excluded.clinical_risk_ar,
                                recommendation_ar = excluded.recommendation_ar,
                                alternative_ar = excluded.alternative_ar,
                                updated_at = excluded.updated_at;";

                        using (var cmd = new SQLiteCommand(upsertSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@id", item.Id);
                            cmd.Parameters.AddWithValue("@a", item.ActiveIngredientA);
                            cmd.Parameters.AddWithValue("@b", item.ActiveIngredientB);
                            cmd.Parameters.AddWithValue("@sev", item.Severity);
                            cmd.Parameters.AddWithValue("@mech", item.MechanismAr);
                            cmd.Parameters.AddWithValue("@risk", item.ClinicalRiskAr);
                            cmd.Parameters.AddWithValue("@rec", item.RecommendationAr);
                            cmd.Parameters.AddWithValue("@alt", item.AlternativeAr ?? "");
                            cmd.Parameters.AddWithValue("@source", item.Source ?? "custom");
                            cmd.Parameters.AddWithValue("@created", item.CreatedAt);
                            cmd.Parameters.AddWithValue("@updated", item.UpdatedAt);
                            cmd.ExecuteNonQuery();
                        }

                        if (_auditRepo != null)
                        {
                            _auditRepo.Log(new AuditLog
                            {
                                UserId = !string.IsNullOrEmpty(userId) ? userId : "system",
                                Action = "DDI_SAVE",
                                EntityType = "drug_interaction",
                                EntityId = item.Id,
                                DetailsJson = string.Format("حفظ تعارض دوائي بين {0} و {1} بدرجة {2}", item.ActiveIngredientA, item.ActiveIngredientB, item.Severity)
                            });
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

            return item;
        }

        public bool Delete(string id, string userId)
        {
            if (string.IsNullOrEmpty(id)) return false;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        int rows = 0;
                        using (var cmd = new SQLiteCommand("DELETE FROM drug_interactions WHERE id = @id;", conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@id", id);
                            rows = cmd.ExecuteNonQuery();
                        }

                        if (rows > 0 && _auditRepo != null)
                        {
                            _auditRepo.Log(new AuditLog
                            {
                                UserId = !string.IsNullOrEmpty(userId) ? userId : "system",
                                Action = "DDI_DELETE",
                                EntityType = "drug_interaction",
                                EntityId = id,
                                DetailsJson = "حذف تعارض دوائي من قاعدة البيانات"
                            });
                        }

                        trans.Commit();
                        return rows > 0;
                    }
                    catch
                    {
                        trans.Rollback();
                        throw;
                    }
                }
            }
        }

        public int BulkImport(List<DrugInteraction> items, string userId)
        {
            if (items == null || items.Count == 0) return 0;

            int count = 0;
            string now = DateTime.UtcNow.ToString("o");

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        string upsertSql = @"
                            INSERT INTO drug_interactions (
                                id, active_ingredient_a, active_ingredient_b, severity,
                                mechanism_ar, clinical_risk_ar, recommendation_ar, alternative_ar,
                                source, created_at, updated_at
                            ) VALUES (
                                @id, @a, @b, @sev, @mech, @risk, @rec, @alt, @source, @created, @updated
                            )
                            ON CONFLICT(active_ingredient_a, active_ingredient_b) DO UPDATE SET
                                severity = excluded.severity,
                                mechanism_ar = excluded.mechanism_ar,
                                clinical_risk_ar = excluded.clinical_risk_ar,
                                recommendation_ar = excluded.recommendation_ar,
                                alternative_ar = excluded.alternative_ar,
                                updated_at = excluded.updated_at;";

                        for (int i = 0; i < items.Count; i++)
                        {
                            var item = items[i];
                            if (item == null) continue;

                            string ingA = PharmaRepository.NormalizePharmaText(item.ActiveIngredientA);
                            string ingB = PharmaRepository.NormalizePharmaText(item.ActiveIngredientB);
                            if (string.IsNullOrEmpty(ingA) || string.IsNullOrEmpty(ingB) || ingA == ingB) continue;

                            if (string.CompareOrdinal(ingA, ingB) > 0)
                            {
                                string t = ingA; ingA = ingB; ingB = t;
                            }

                            string sev = (item.Severity ?? "moderate").ToLowerInvariant();
                            if (sev != "severe" && sev != "moderate" && sev != "minor") sev = "moderate";

                            using (var cmd = new SQLiteCommand(upsertSql, conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@id", !string.IsNullOrEmpty(item.Id) ? item.Id : Guid.NewGuid().ToString());
                                cmd.Parameters.AddWithValue("@a", ingA);
                                cmd.Parameters.AddWithValue("@b", ingB);
                                cmd.Parameters.AddWithValue("@sev", sev);
                                cmd.Parameters.AddWithValue("@mech", item.MechanismAr ?? "");
                                cmd.Parameters.AddWithValue("@risk", item.ClinicalRiskAr ?? "");
                                cmd.Parameters.AddWithValue("@rec", item.RecommendationAr ?? "");
                                cmd.Parameters.AddWithValue("@alt", item.AlternativeAr ?? "");
                                cmd.Parameters.AddWithValue("@source", item.Source ?? "excel_import");
                                cmd.Parameters.AddWithValue("@created", now);
                                cmd.Parameters.AddWithValue("@updated", now);
                                cmd.ExecuteNonQuery();
                                count++;
                            }
                        }

                        if (_auditRepo != null)
                        {
                            _auditRepo.Log(new AuditLog
                            {
                                UserId = !string.IsNullOrEmpty(userId) ? userId : "system",
                                Action = "DDI_BULK_IMPORT",
                                EntityType = "drug_interactions",
                                EntityId = "bulk",
                                DetailsJson = string.Format("استيراد مجمع لـ {0} تفاعل دوائي من ملف إكسل", count)
                            });
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

            return count;
        }

        private static DrugInteraction MapFromReader(SQLiteDataReader reader)
        {
            return new DrugInteraction
            {
                Id = reader["id"].ToString(),
                ActiveIngredientA = reader["active_ingredient_a"].ToString(),
                ActiveIngredientB = reader["active_ingredient_b"].ToString(),
                Severity = reader["severity"].ToString(),
                MechanismAr = reader["mechanism_ar"].ToString(),
                ClinicalRiskAr = reader["clinical_risk_ar"].ToString(),
                RecommendationAr = reader["recommendation_ar"].ToString(),
                AlternativeAr = reader["alternative_ar"] != DBNull.Value ? reader["alternative_ar"].ToString() : "",
                Source = reader["source"] != DBNull.Value ? reader["source"].ToString() : "clinical_core",
                CreatedAt = reader["created_at"].ToString(),
                UpdatedAt = reader["updated_at"].ToString()
            };
        }
    }
}
