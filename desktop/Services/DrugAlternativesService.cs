using System;
using System.Collections.Generic;
using System.Data.SQLite;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    /// <summary>
    /// محرك البدائل والمثائل الدوائية وتصنيف مستويات الاستبدال (Story 130 / Feature #187 / Task 187-3)
    /// </summary>
    public class DrugAlternativesService
    {
        private readonly PharmaRepository _pharmaRepo;
        private readonly ProductRepository _productRepo;
        private readonly string _connectionString;

        public DrugAlternativesService(PharmaRepository pharmaRepo, ProductRepository productRepo, string connectionString)
        {
            _pharmaRepo = pharmaRepo;
            _productRepo = productRepo;
            _connectionString = connectionString;
        }

        public DrugAlternativesResult GetAlternatives(string productId)
        {
            var result = new DrugAlternativesResult();
            if (string.IsNullOrEmpty(productId)) return result;

            var targetProduct = _productRepo.GetById(productId);
            if (targetProduct == null) return result;

            var targetPharma = _pharmaRepo.GetPharmaInfo(productId);

            // Fallback: If product has no product_pharma_info row yet, check drug_reference by barcode
            if ((targetPharma == null || string.IsNullOrEmpty(targetPharma.ScientificName)) && !string.IsNullOrEmpty(targetProduct.Barcode))
            {
                using (var drefConn = new SQLiteConnection(_connectionString))
                {
                    drefConn.Open();
                    string dSql = "SELECT scientific_name, form, strength, manufacturer, therapeutic_class FROM drug_reference WHERE barcode = @barcode LIMIT 1;";
                    using (var dcmd = new SQLiteCommand(dSql, drefConn))
                    {
                        dcmd.Parameters.AddWithValue("@barcode", targetProduct.Barcode);
                        using (var dreader = dcmd.ExecuteReader())
                        {
                            if (dreader.Read())
                            {
                                string sci = dreader["scientific_name"] != DBNull.Value ? dreader["scientific_name"].ToString() : "";
                                if (!string.IsNullOrEmpty(sci))
                                {
                                    if (targetPharma == null) targetPharma = new ProductPharmaInfo { ProductId = productId };
                                    targetPharma.ScientificName = sci;
                                    targetPharma.NormalizedScientificName = PharmaRepository.NormalizePharmaText(sci);
                                    targetPharma.DosageFormName = dreader["form"] != DBNull.Value ? dreader["form"].ToString() : "";
                                    targetPharma.StrengthText = dreader["strength"] != DBNull.Value ? dreader["strength"].ToString() : "";
                                    targetPharma.ManufacturerName = dreader["manufacturer"] != DBNull.Value ? dreader["manufacturer"].ToString() : "";
                                    targetPharma.TherapeuticClassName = dreader["therapeutic_class"] != DBNull.Value ? dreader["therapeutic_class"].ToString() : "";
                                }
                            }
                        }
                    }
                }
            }

            if (targetPharma == null || string.IsNullOrEmpty(targetPharma.ScientificName)) return result;

            result.OriginalProductId = productId;
            result.OriginalProductName = targetProduct.Name;
            result.OriginalScientificName = targetPharma.ScientificName;
            result.OriginalPricePiasters = targetProduct.PricePiasters;

            // Load all other products with pharma info or drug reference
            var candidateMap = new Dictionary<string, CandidatePharma>();

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();

                string candSql = @"
                    SELECT 
                        p.id, p.name, p.barcode, p.price_piasters, p.stock_quantity_milli, p.is_cold_chain,
                        COALESCE(pi.scientific_name, dr.scientific_name, '') AS scientific_name,
                        COALESCE(pi.dosage_form_id, '') AS dosage_form_id,
                        COALESCE(df.name_ar, dr.form, '') AS dosage_form_name,
                        COALESCE(pi.strength_text, dr.strength, '') AS strength_text,
                        COALESCE(pi.manufacturer_id, '') AS manufacturer_id,
                        COALESCE(m.name_ar, dr.manufacturer, '') AS manufacturer_name,
                        COALESCE(pi.therapeutic_class_id, '') AS therapeutic_class_id,
                        COALESCE(tc.name_ar, dr.therapeutic_class, '') AS therapeutic_class_name
                    FROM products p
                    LEFT JOIN product_pharma_info pi ON p.id = pi.product_id
                    LEFT JOIN pharma_dosage_forms df ON pi.dosage_form_id = df.id
                    LEFT JOIN pharma_manufacturers m ON pi.manufacturer_id = m.id
                    LEFT JOIN therapeutic_classes tc ON pi.therapeutic_class_id = tc.id
                    LEFT JOIN drug_reference dr ON p.barcode = dr.barcode
                    WHERE p.id != @targetId AND p.is_active = 1
                      AND ((pi.scientific_name IS NOT NULL AND pi.scientific_name != '') OR (dr.scientific_name IS NOT NULL AND dr.scientific_name != ''));";

                using (var cmd = new SQLiteCommand(candSql, conn))
                {
                    cmd.Parameters.AddWithValue("@targetId", productId);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            string pid = reader["id"].ToString();
                            candidateMap[pid] = new CandidatePharma
                            {
                                ProductId = pid,
                                Name = reader["name"].ToString(),
                                Barcode = reader["barcode"] != DBNull.Value ? reader["barcode"].ToString() : "",
                                PricePiasters = Convert.ToInt64(reader["price_piasters"]),
                                StockQuantityMilli = Convert.ToInt32(reader["stock_quantity_milli"]),
                                IsColdChain = Convert.ToInt32(reader["is_cold_chain"]) == 1,
                                ScientificName = reader["scientific_name"].ToString(),
                                DosageFormId = reader["dosage_form_id"] != DBNull.Value ? reader["dosage_form_id"].ToString() : null,
                                DosageFormName = reader["dosage_form_name"] != DBNull.Value ? reader["dosage_form_name"].ToString() : "",
                                StrengthText = reader["strength_text"] != DBNull.Value ? reader["strength_text"].ToString() : "",
                                ManufacturerId = reader["manufacturer_id"] != DBNull.Value ? reader["manufacturer_id"].ToString() : null,
                                ManufacturerName = reader["manufacturer_name"] != DBNull.Value ? reader["manufacturer_name"].ToString() : "",
                                TherapeuticClassId = reader["therapeutic_class_id"] != DBNull.Value ? reader["therapeutic_class_id"].ToString() : null,
                                TherapeuticClassName = reader["therapeutic_class_name"] != DBNull.Value ? reader["therapeutic_class_name"].ToString() : "",
                                Ingredients = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)
                            };
                        }
                    }
                }

                // Load candidate structured ingredients
                string ingSql = @"
                    SELECT product_id, ingredient_id, strength_value_micro 
                    FROM product_ingredients 
                    WHERE product_id != @targetId;";

                using (var ingCmd = new SQLiteCommand(ingSql, conn))
                {
                    ingCmd.Parameters.AddWithValue("@targetId", productId);
                    using (var reader = ingCmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            string pid = reader["product_id"].ToString();
                            string iid = reader["ingredient_id"].ToString();
                            int micro = Convert.ToInt32(reader["strength_value_micro"]);
                            if (candidateMap.ContainsKey(pid))
                            {
                                candidateMap[pid].Ingredients[iid] = micro;
                            }
                        }
                    }
                }

                // Load nearest expiry date for candidates if batches exist
                string batchSql = @"
                    SELECT product_id, MIN(expiry_date) AS nearest_expiry
                    FROM product_batches
                    WHERE quantity_milli > 0 AND expiry_date IS NOT NULL AND expiry_date != ''
                    GROUP BY product_id;";

                using (var bCmd = new SQLiteCommand(batchSql, conn))
                using (var reader = bCmd.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        string pid = reader["product_id"].ToString();
                        if (candidateMap.ContainsKey(pid))
                        {
                            candidateMap[pid].NearestExpiryDate = reader["nearest_expiry"].ToString();
                        }
                    }
                }
            }

            // Target structured ingredient set
            var targetIngredients = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            if (targetPharma.Ingredients != null)
            {
                for (int i = 0; i < targetPharma.Ingredients.Count; i++)
                {
                    var ing = targetPharma.Ingredients[i];
                    targetIngredients[ing.IngredientId] = ing.StrengthValueMicro;
                }
            }

            // Target textual ingredients set
            var targetTextIngs = ExtractActiveIngredients(targetPharma.ScientificName);

            // Classification loop
            foreach (var kvp in candidateMap)
            {
                var cand = kvp.Value;
                int tier = 0;
                string tierDesc = "";

                bool hasStructuredIngredients = (targetIngredients.Count > 0 && cand.Ingredients.Count > 0);
                bool sameIngredients = false;
                bool sameStrengths = false;

                if (hasStructuredIngredients && targetIngredients.Count == cand.Ingredients.Count)
                {
                    sameIngredients = true;
                    sameStrengths = true;
                    foreach (var tKvp in targetIngredients)
                    {
                        if (!cand.Ingredients.ContainsKey(tKvp.Key))
                        {
                            sameIngredients = false;
                            sameStrengths = false;
                            break;
                        }
                        if (cand.Ingredients[tKvp.Key] != tKvp.Value)
                        {
                            sameStrengths = false;
                        }
                    }
                }
                else
                {
                    // Fall back to textual active ingredient extraction and comparison
                    var candTextIngs = ExtractActiveIngredients(cand.ScientificName);
                    if (targetTextIngs.Count > 0 && candTextIngs.Count > 0)
                    {
                        if (targetTextIngs.SetEquals(candTextIngs))
                        {
                            sameIngredients = true;
                            sameStrengths = AreSameStrength(targetPharma.StrengthText, cand.StrengthText);
                        }
                        else if (targetTextIngs.Overlaps(candTextIngs))
                        {
                            // Shares active ingredients -> Therapeutic Alternative (Tier 4)
                            tier = 4;
                            tierDesc = "بديل علاجي (يشترك في المواد الفعالة)";
                        }
                    }
                }

                if (sameIngredients)
                {
                    bool sameForm = AreSameDosageForm(targetPharma.DosageFormId, targetPharma.DosageFormName, cand.DosageFormId, cand.DosageFormName);

                    if (sameStrengths)
                    {
                        if (sameForm)
                        {
                            tier = 1; // Tier 1: Exact Generic (مثيل مطابق)
                            tierDesc = "مثيل مطابق (نفس المادة والشكل والتركيز)";
                        }
                        else
                        {
                            tier = 2; // Tier 2: Different Form (مثيل بشكل صيدلاني مختلف)
                            tierDesc = "مثيل بشكل صيدلاني مختلف";
                        }
                    }
                    else
                    {
                        if (sameForm)
                        {
                            tier = 3; // Tier 3: Different Strength (تركيز مختلف)
                            tierDesc = "نفس المادة بتركيز مختلف";
                        }
                        else
                        {
                            tier = 2; // Different Form & Strength
                            tierDesc = "مثيل بشكل صيدلاني مختلف";
                        }
                    }
                }
                else if (tier == 0)
                {
                    bool sameTherapeuticClass = (!string.IsNullOrEmpty(targetPharma.TherapeuticClassId) &&
                                                 !string.IsNullOrEmpty(cand.TherapeuticClassId) &&
                                                 string.Equals(targetPharma.TherapeuticClassId, cand.TherapeuticClassId, StringComparison.OrdinalIgnoreCase));

                    if (!sameTherapeuticClass && !string.IsNullOrEmpty(targetPharma.TherapeuticClassName) && !string.IsNullOrEmpty(cand.TherapeuticClassName))
                    {
                        sameTherapeuticClass = string.Equals(targetPharma.TherapeuticClassName.Trim(), cand.TherapeuticClassName.Trim(), StringComparison.OrdinalIgnoreCase);
                    }

                    if (sameTherapeuticClass)
                    {
                        tier = 4; // Tier 4: Therapeutic Alternative (بديل علاجي)
                        tierDesc = "بديل علاجي (نفس المجموعة الدوائية)";
                    }
                }

                if (tier > 0)
                {
                    var item = new DrugAlternativeItem
                    {
                        ProductId = cand.ProductId,
                        Name = cand.Name,
                        Barcode = cand.Barcode,
                        ScientificName = cand.ScientificName,
                        DosageFormName = cand.DosageFormName,
                        StrengthText = cand.StrengthText,
                        ManufacturerName = cand.ManufacturerName,
                        PricePiasters = cand.PricePiasters,
                        StockQuantityMilli = cand.StockQuantityMilli,
                        CompoundStockDisplay = FormatCompoundStock(cand.StockQuantityMilli),
                        MatchTier = tier,
                        TierDescription = tierDesc,
                        NearestExpiryDate = cand.NearestExpiryDate,
                        PriceDifferencePiasters = cand.PricePiasters - targetProduct.PricePiasters,
                        IsColdChain = cand.IsColdChain
                    };

                    if (tier == 1) result.ExactGenerics.Add(item);
                    else if (tier == 2) result.DifferentForms.Add(item);
                    else if (tier == 3) result.DifferentStrengths.Add(item);
                    else if (tier == 4) result.TherapeuticAlternatives.Add(item);
                }
            }

            // Sort each tier: In-stock first, then closest price to original, then furthest expiry
            long origPrice = targetProduct.PricePiasters;
            SortAlternatives(result.ExactGenerics, origPrice);
            SortAlternatives(result.DifferentForms, origPrice);
            SortAlternatives(result.DifferentStrengths, origPrice);
            SortAlternatives(result.TherapeuticAlternatives, origPrice);

            return result;
        }

        private static HashSet<string> ExtractActiveIngredients(string scientificName)
        {
            var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            if (string.IsNullOrEmpty(scientificName)) return set;
            var parts = scientificName.Split(new char[] { '+', '/', ',', ';', '&' }, StringSplitOptions.RemoveEmptyEntries);
            for (int i = 0; i < parts.Length; i++)
            {
                string trimmed = PharmaRepository.NormalizePharmaText(parts[i].Trim());
                if (!string.IsNullOrEmpty(trimmed))
                {
                    set.Add(trimmed);
                }
            }
            return set;
        }

        private static bool AreSameDosageForm(string formId1, string formName1, string formId2, string formName2)
        {
            if (!string.IsNullOrEmpty(formId1) && !string.IsNullOrEmpty(formId2) && string.Equals(formId1, formId2, StringComparison.OrdinalIgnoreCase))
                return true;

            string n1 = NormalizeForm(formName1);
            string n2 = NormalizeForm(formName2);
            if (!string.IsNullOrEmpty(n1) && !string.IsNullOrEmpty(n2) && n1 == n2)
                return true;

            return false;
        }

        private static string NormalizeForm(string form)
        {
            if (string.IsNullOrEmpty(form)) return "";
            string f = form.Trim().ToLowerInvariant();
            if (f.Contains("قرص") || f.Contains("أقراص") || f.Contains("tablet")) return "tablet";
            if (f.Contains("كبسول") || f.Contains("capsul")) return "capsule";
            if (f.Contains("شراب") || f.Contains("syrup")) return "syrup";
            if (f.Contains("معلق") || f.Contains("susp")) return "suspension";
            if (f.Contains("حقن") || f.Contains("inject") || f.Contains("amp") || f.Contains("vial")) return "injection";
            if (f.Contains("كريم") || f.Contains("مرهم") || f.Contains("cream") || f.Contains("oint")) return "cream";
            if (f.Contains("نقط") || f.Contains("قطرة") || f.Contains("drop")) return "drops";
            if (f.Contains("فوار") || f.Contains("efferv")) return "effervescent";
            if (f.Contains("بخاخ") || f.Contains("inhal") || f.Contains("spray")) return "inhaler";
            if (f.Contains("لبوس") || f.Contains("suppos")) return "suppository";
            if (f.Contains("أكياس") || f.Contains("sachet")) return "sachets";
            if (f.Contains("جل") || f.Contains("gel")) return "gel";
            if (f.Contains("لوشن") || f.Contains("lotion")) return "lotion";
            return f;
        }

        private static bool AreSameStrength(string str1, string str2)
        {
            if (string.IsNullOrEmpty(str1) && string.IsNullOrEmpty(str2)) return true;
            if (string.IsNullOrEmpty(str1) || string.IsNullOrEmpty(str2)) return false;
            string s1 = str1.ToLowerInvariant().Replace(" ", "");
            string s2 = str2.ToLowerInvariant().Replace(" ", "");
            return string.Equals(s1, s2, StringComparison.OrdinalIgnoreCase);
        }

        private static void SortAlternatives(List<DrugAlternativeItem> list, long originalPrice)
        {
            list.Sort(delegate(DrugAlternativeItem a, DrugAlternativeItem b)
            {
                // 1. In stock first
                bool aInStock = a.StockQuantityMilli > 0;
                bool bInStock = b.StockQuantityMilli > 0;
                if (aInStock != bInStock)
                {
                    return bInStock.CompareTo(aInStock); // true first
                }

                // 2. Closest price difference to original
                long aDiff = Math.Abs(a.PricePiasters - originalPrice);
                long bDiff = Math.Abs(b.PricePiasters - originalPrice);
                if (aDiff != bDiff)
                {
                    return aDiff.CompareTo(bDiff);
                }

                // 3. Furthest expiry date
                if (!string.IsNullOrEmpty(a.NearestExpiryDate) && !string.IsNullOrEmpty(b.NearestExpiryDate))
                {
                    return b.NearestExpiryDate.CompareTo(a.NearestExpiryDate);
                }

                return string.Compare(a.Name, b.Name, StringComparison.OrdinalIgnoreCase);
            });
        }

        private static string FormatCompoundStock(int milli)
        {
            if (milli <= 0) return "الرصيد نافد";
            int units = milli / 1000;
            int rem = milli % 1000;
            if (rem == 0) return units + " عبوة";
            return string.Format("{0} عبوة و {1} جزء", units, rem);
        }

        private class CandidatePharma
        {
            public string ProductId { get; set; }
            public string Name { get; set; }
            public string Barcode { get; set; }
            public long PricePiasters { get; set; }
            public int StockQuantityMilli { get; set; }
            public bool IsColdChain { get; set; }
            public string ScientificName { get; set; }
            public string DosageFormId { get; set; }
            public string DosageFormName { get; set; }
            public string StrengthText { get; set; }
            public string ManufacturerId { get; set; }
            public string ManufacturerName { get; set; }
            public string TherapeuticClassId { get; set; }
            public string TherapeuticClassName { get; set; }
            public string NearestExpiryDate { get; set; }
            public Dictionary<string, int> Ingredients { get; set; }
        }
    }
}
