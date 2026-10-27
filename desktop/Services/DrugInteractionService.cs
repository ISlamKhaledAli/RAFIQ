using System;
using System.Collections.Generic;
using System.Data.SQLite;
using System.IO;
using ClosedXML.Excel;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    /// <summary>
    /// خدمة محرك التفاعلات الدوائية والحوكمة السريرية (Drug-Drug Interactions Service)
    /// Story 137 / Feature #194 / F-01
    /// </summary>
    public class DrugInteractionService
    {
        private readonly DrugInteractionRepository _repo;
        private readonly PharmaRepository _pharmaRepo;
        private readonly ProductRepository _productRepo;
        private readonly string _connectionString;

        public DrugInteractionService(
            DrugInteractionRepository repo,
            PharmaRepository pharmaRepo,
            ProductRepository productRepo,
            string connectionString)
        {
            if (repo == null) throw new ArgumentNullException("repo");
            _repo = repo;
            _pharmaRepo = pharmaRepo;
            _productRepo = productRepo;
            _connectionString = connectionString;
        }

        private class ProductDrugData
        {
            public string ProductId { get; set; }
            public string ProductName { get; set; }
            public List<string> Ingredients { get; set; }

            public ProductDrugData()
            {
                Ingredients = new List<string>();
            }
        }

        /// <summary>
        /// فحص سلة البيع في الكاشير بالكامل لكافة أزواج الأدوية المتبادلة
        /// </summary>
        public CartInteractionCheckResult CheckCartInteractions(List<string> productIds)
        {
            var result = new CartInteractionCheckResult();
            if (productIds == null || productIds.Count < 2)
            {
                return result;
            }

            // 1. Filter distinct valid product IDs
            var distinctIds = new List<string>();
            var seenIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            for (int i = 0; i < productIds.Count; i++)
            {
                string pid = productIds[i];
                if (!string.IsNullOrEmpty(pid) && !seenIds.Contains(pid))
                {
                    seenIds.Add(pid);
                    distinctIds.Add(pid);
                }
            }

            if (distinctIds.Count < 2)
            {
                return result;
            }

            // 2. Fetch drug data (Product Name + Active Ingredients) for each product
            var productDataMap = new Dictionary<string, ProductDrugData>(StringComparer.OrdinalIgnoreCase);

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();

                // 2a. Fetch product names
                var nameParams = new List<string>();
                for (int i = 0; i < distinctIds.Count; i++) nameParams.Add(string.Format("@p{0}", i));

                string nameSql = "SELECT id, name FROM products WHERE id IN (" + string.Join(",", nameParams.ToArray()) + ");";
                using (var cmd = new SQLiteCommand(nameSql, conn))
                {
                    for (int i = 0; i < distinctIds.Count; i++) cmd.Parameters.AddWithValue(nameParams[i], distinctIds[i]);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            string pid = reader["id"].ToString();
                            string pName = reader["name"].ToString();
                            productDataMap[pid] = new ProductDrugData { ProductId = pid, ProductName = pName };
                        }
                    }
                }

                // 2b. Fetch active ingredients from product_ingredients JOIN active_ingredients
                string ingSql = @"
                    SELECT ping.product_id, ai.normalized_name, ai.name_en, ai.name_ar
                    FROM product_ingredients ping
                    JOIN active_ingredients ai ON ping.ingredient_id = ai.id
                    WHERE ping.product_id IN (" + string.Join(",", nameParams.ToArray()) + @")
                    AND ai.is_active = 1;";

                using (var cmd = new SQLiteCommand(ingSql, conn))
                {
                    for (int i = 0; i < distinctIds.Count; i++) cmd.Parameters.AddWithValue(nameParams[i], distinctIds[i]);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            string pid = reader["product_id"].ToString();
                            string norm = reader["normalized_name"] != DBNull.Value ? reader["normalized_name"].ToString().Trim() : "";
                            if (string.IsNullOrEmpty(norm))
                            {
                                string nameEn = reader["name_en"] != DBNull.Value ? reader["name_en"].ToString() : "";
                                norm = PharmaRepository.NormalizePharmaText(nameEn);
                            }

                            ProductDrugData d;
                            if (productDataMap.TryGetValue(pid, out d))
                            {
                                AddCandidateIngredients(d, norm);
                            }
                        }
                    }
                }

                // 2c. Fallback for products with no ingredients: check product_pharma_info.normalized_scientific_name
                var missingIngPids = new List<string>();
                for (int i = 0; i < distinctIds.Count; i++)
                {
                    string pid = distinctIds[i];
                    ProductDrugData d;
                    if (productDataMap.TryGetValue(pid, out d) && d.Ingredients.Count == 0)
                    {
                        missingIngPids.Add(pid);
                    }
                }

                if (missingIngPids.Count > 0)
                {
                    var fbParams = new List<string>();
                    for (int i = 0; i < missingIngPids.Count; i++) fbParams.Add(string.Format("@fb{0}", i));

                    string fbSql = "SELECT product_id, scientific_name, normalized_scientific_name FROM product_pharma_info WHERE product_id IN (" + string.Join(",", fbParams.ToArray()) + ");";
                    using (var cmd = new SQLiteCommand(fbSql, conn))
                    {
                        for (int i = 0; i < missingIngPids.Count; i++) cmd.Parameters.AddWithValue(fbParams[i], missingIngPids[i]);
                        using (var reader = cmd.ExecuteReader())
                        {
                            while (reader.Read())
                            {
                                string pid = reader["product_id"].ToString();
                                string sciNorm = reader["normalized_scientific_name"] != DBNull.Value ? reader["normalized_scientific_name"].ToString().Trim() : "";
                                if (string.IsNullOrEmpty(sciNorm))
                                {
                                    string sci = reader["scientific_name"] != DBNull.Value ? reader["scientific_name"].ToString() : "";
                                    sciNorm = PharmaRepository.NormalizePharmaText(sci);
                                }

                                ProductDrugData d;
                                if (!string.IsNullOrEmpty(sciNorm) && productDataMap.TryGetValue(pid, out d))
                                {
                                    AddCandidateIngredients(d, sciNorm);
                                }
                            }
                        }
                    }
                }

                // 2d. Fallback for products still missing ingredients: check drug_reference by barcode (26k directory)
                var stillMissingPids = new List<string>();
                for (int i = 0; i < distinctIds.Count; i++)
                {
                    string pid = distinctIds[i];
                    ProductDrugData d;
                    if (productDataMap.TryGetValue(pid, out d) && d.Ingredients.Count == 0)
                    {
                        stillMissingPids.Add(pid);
                    }
                }

                if (stillMissingPids.Count > 0)
                {
                    var drParams = new List<string>();
                    for (int i = 0; i < stillMissingPids.Count; i++) drParams.Add(string.Format("@dr{0}", i));

                    string drSql = @"
                        SELECT p.id, dr.scientific_name 
                        FROM products p 
                        JOIN drug_reference dr ON p.barcode = dr.barcode 
                        WHERE p.id IN (" + string.Join(",", drParams.ToArray()) + @")
                          AND dr.scientific_name IS NOT NULL 
                          AND dr.scientific_name != '';";

                    using (var cmd = new SQLiteCommand(drSql, conn))
                    {
                        for (int i = 0; i < stillMissingPids.Count; i++) cmd.Parameters.AddWithValue(drParams[i], stillMissingPids[i]);
                        using (var reader = cmd.ExecuteReader())
                        {
                            while (reader.Read())
                            {
                                string pid = reader["id"].ToString();
                                string sci = reader["scientific_name"] != DBNull.Value ? reader["scientific_name"].ToString() : "";
                                ProductDrugData d;
                                if (!string.IsNullOrEmpty(sci) && productDataMap.TryGetValue(pid, out d))
                                {
                                    AddCandidateIngredients(d, sci);
                                }
                            }
                        }
                    }
                }
            }

            // 3. Build Cartesian cross pairs between different products
            // Map: candidatePair -> List<Tuple<ProductDrugData, ProductDrugData, string, string>>
            var pairLookupMap = new Dictionary<string, List<Tuple<ProductDrugData, ProductDrugData, string, string>>>(StringComparer.OrdinalIgnoreCase);
            var queryPairs = new List<Tuple<string, string>>();

            var productList = new List<ProductDrugData>();
            for (int i = 0; i < distinctIds.Count; i++)
            {
                ProductDrugData d;
                if (productDataMap.TryGetValue(distinctIds[i], out d) && d.Ingredients.Count > 0)
                {
                    productList.Add(d);
                }
            }

            for (int i = 0; i < productList.Count; i++)
            {
                var prodA = productList[i];
                for (int j = i + 1; j < productList.Count; j++)
                {
                    var prodB = productList[j];

                    for (int ia = 0; ia < prodA.Ingredients.Count; ia++)
                    {
                        string ingA = prodA.Ingredients[ia];
                        for (int ib = 0; ib < prodB.Ingredients.Count; ib++)
                        {
                            string ingB = prodB.Ingredients[ib];
                            if (ingA == ingB) continue; // Same chemical substance, not a DDI pair

                            string sortedA = string.CompareOrdinal(ingA, ingB) <= 0 ? ingA : ingB;
                            string sortedB = string.CompareOrdinal(ingA, ingB) <= 0 ? ingB : ingA;
                            string key = sortedA + "|" + sortedB;

                            List<Tuple<ProductDrugData, ProductDrugData, string, string>> usages;
                            if (!pairLookupMap.TryGetValue(key, out usages))
                            {
                                usages = new List<Tuple<ProductDrugData, ProductDrugData, string, string>>();
                                pairLookupMap[key] = usages;
                                queryPairs.Add(new Tuple<string, string>(sortedA, sortedB));
                            }
                            usages.Add(new Tuple<ProductDrugData, ProductDrugData, string, string>(prodA, prodB, ingA, ingB));
                        }
                    }
                }
            }

            result.CheckedPairsCount = queryPairs.Count;
            if (queryPairs.Count == 0)
            {
                return result;
            }

            // 4. Query Database
            var matchedInteractions = _repo.CheckPairs(queryPairs);
            if (matchedInteractions.Count == 0)
            {
                return result;
            }

            // 5. Build Conflict Items
            var conflictList = new List<InteractionConflictItem>();
            var conflictSeen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            for (int m = 0; m < matchedInteractions.Count; m++)
            {
                var inter = matchedInteractions[m];
                string sortedA = string.CompareOrdinal(inter.ActiveIngredientA, inter.ActiveIngredientB) <= 0 ? inter.ActiveIngredientA : inter.ActiveIngredientB;
                string sortedB = string.CompareOrdinal(inter.ActiveIngredientA, inter.ActiveIngredientB) <= 0 ? inter.ActiveIngredientB : inter.ActiveIngredientA;
                string key = sortedA + "|" + sortedB;

                List<Tuple<ProductDrugData, ProductDrugData, string, string>> usages;
                if (pairLookupMap.TryGetValue(key, out usages))
                {
                    for (int u = 0; u < usages.Count; u++)
                    {
                        var usage = usages[u];
                        var pA = usage.Item1;
                        var pB = usage.Item2;

                        string dedupKey = string.Format("{0}|{1}|{2}", pA.ProductId, pB.ProductId, inter.Id);
                        if (!conflictSeen.Contains(dedupKey))
                        {
                            conflictSeen.Add(dedupKey);
                            conflictList.Add(new InteractionConflictItem
                            {
                                InteractionId = inter.Id,
                                ProductAId = pA.ProductId,
                                ProductAName = pA.ProductName,
                                ActiveIngredientA = usage.Item3,
                                ProductBId = pB.ProductId,
                                ProductBName = pB.ProductName,
                                ActiveIngredientB = usage.Item4,
                                Severity = inter.Severity,
                                MechanismAr = inter.MechanismAr,
                                ClinicalRiskAr = inter.ClinicalRiskAr,
                                RecommendationAr = inter.RecommendationAr,
                                AlternativeAr = inter.AlternativeAr
                            });
                        }
                    }
                }
            }

            // 6. Sort conflicts: severe first, then moderate, then minor
            conflictList.Sort(delegate (InteractionConflictItem x, InteractionConflictItem y)
            {
                int wx = GetSeverityWeight(x.Severity);
                int wy = GetSeverityWeight(y.Severity);
                if (wx != wy) return wx.CompareTo(wy);
                return string.Compare(x.ProductAName, y.ProductAName, StringComparison.OrdinalIgnoreCase);
            });

            result.Conflicts = conflictList;
            result.HasInteractions = conflictList.Count > 0;

            if (result.HasInteractions)
            {
                bool hasSevere = false;
                bool hasModerate = false;
                bool hasMinor = false;

                for (int c = 0; c < conflictList.Count; c++)
                {
                    string s = (conflictList[c].Severity ?? "").ToLowerInvariant();
                    if (s == "severe") hasSevere = true;
                    else if (s == "moderate") hasModerate = true;
                    else if (s == "minor") hasMinor = true;
                }

                if (hasSevere)
                {
                    result.MaxSeverity = "severe";
                    result.RequiresOverride = true;
                }
                else if (hasModerate)
                {
                    result.MaxSeverity = "moderate";
                    result.RequiresOverride = false;
                }
                else if (hasMinor)
                {
                    result.MaxSeverity = "minor";
                    result.RequiresOverride = false;
                }
            }

            return result;
        }

        private static int GetSeverityWeight(string sev)
        {
            if (string.IsNullOrEmpty(sev)) return 99;
            string s = sev.ToLowerInvariant();
            if (s == "severe") return 1;
            if (s == "moderate") return 2;
            if (s == "minor") return 3;
            return 4;
        }

        // =========================================================================
        // Management & CRUD Methods
        // =========================================================================

        public List<DrugInteraction> GetAll(string search, string severity, int page, int limit, out int totalCount)
        {
            return _repo.GetAll(search, severity, page, limit, out totalCount);
        }

        public DrugInteraction GetById(string id)
        {
            return _repo.GetById(id);
        }

        public DrugInteraction Save(DrugInteraction item, string userId)
        {
            return _repo.Save(item, userId);
        }

        public bool Delete(string id, string userId)
        {
            return _repo.Delete(id, userId);
        }

        // =========================================================================
        // Excel Import / Export via ClosedXML
        // =========================================================================

        public string ExportToExcel(string search, string severity, string targetFilePath)
        {
            int total;
            var list = _repo.GetAll(search, severity, 1, 10000, out total);

            using (var wb = new XLWorkbook())
            {
                var ws = wb.Worksheets.Add("التفاعلات والتعارضات الدوائية");
                ws.RightToLeft = true;
                ws.ShowGridLines = true;

                // Header styling
                var headerBg = XLColor.FromArgb(0, 55, 45); // #00372D Forest Dark
                var headerText = XLColor.White;

                string[] headers = new[]
                {
                    "المادة الفعالة الأولى",
                    "المادة الفعالة الثانية",
                    "درجة الخطورة (severe / moderate / minor)",
                    "آلية التفاعل الصيدلانية",
                    "الخطر السريري على المريض",
                    "التوصية الطبية للصيدلي",
                    "البديل الآمن المقترح",
                    "المصدر"
                };

                for (int c = 0; c < headers.Length; c++)
                {
                    var cell = ws.Cell(1, c + 1);
                    cell.Value = headers[c];
                    cell.Style.Font.Bold = true;
                    cell.Style.Font.FontColor = headerText;
                    cell.Style.Fill.BackgroundColor = headerBg;
                    cell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                    cell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
                }
                ws.Row(1).Height = 28;

                // Data Rows
                for (int r = 0; r < list.Count; r++)
                {
                    var item = list[r];
                    int rowNum = r + 2;

                    ws.Cell(rowNum, 1).Value = item.ActiveIngredientA;
                    ws.Cell(rowNum, 2).Value = item.ActiveIngredientB;
                    ws.Cell(rowNum, 3).Value = item.Severity;
                    ws.Cell(rowNum, 4).Value = item.MechanismAr;
                    ws.Cell(rowNum, 5).Value = item.ClinicalRiskAr;
                    ws.Cell(rowNum, 6).Value = item.RecommendationAr;
                    ws.Cell(rowNum, 7).Value = item.AlternativeAr ?? "";
                    ws.Cell(rowNum, 8).Value = item.Source ?? "clinical_core";

                    // Highlight severity
                    var sevCell = ws.Cell(rowNum, 3);
                    if (item.Severity == "severe")
                    {
                        sevCell.Style.Fill.BackgroundColor = XLColor.FromArgb(254, 226, 226); // Red soft
                        sevCell.Style.Font.FontColor = XLColor.FromArgb(178, 58, 46); // Red dark
                        sevCell.Style.Font.Bold = true;
                    }
                    else if (item.Severity == "moderate")
                    {
                        sevCell.Style.Fill.BackgroundColor = XLColor.FromArgb(254, 243, 199); // Yellow soft
                        sevCell.Style.Font.FontColor = XLColor.FromArgb(179, 114, 14); // Yellow dark
                    }
                    else
                    {
                        sevCell.Style.Fill.BackgroundColor = XLColor.FromArgb(234, 245, 238); // Green soft
                        sevCell.Style.Font.FontColor = XLColor.FromArgb(0, 109, 65); // Green dark
                    }
                }

                ws.Columns().AdjustToContents(15, 60);

                string finalPath = targetFilePath;
                if (string.IsNullOrEmpty(finalPath))
                {
                    string tempDir = Path.Combine(Path.GetTempPath(), "RafiqPOS_Exports");
                    if (!Directory.Exists(tempDir)) Directory.CreateDirectory(tempDir);
                    finalPath = Path.Combine(tempDir, string.Format("Drug_Interactions_{0:yyyyMMdd_HHmmss}.xlsx", DateTime.Now));
                }

                wb.SaveAs(finalPath);
                return finalPath;
            }
        }

        public string GenerateBlankTemplate(string targetFilePath)
        {
            using (var wb = new XLWorkbook())
            {
                var ws = wb.Worksheets.Add("قالب التفاعلات الدوائية");
                ws.RightToLeft = true;
                ws.ShowGridLines = true;

                var headerBg = XLColor.FromArgb(0, 55, 45);
                string[] headers = new[]
                {
                    "المادة الفعالة الأولى (بالإنجليزية)",
                    "المادة الفعالة الثانية (بالإنجليزية)",
                    "درجة الخطورة (severe / moderate / minor)",
                    "آلية التفاعل الصيدلانية (بالعربية)",
                    "الخطر السريري على المريض (بالعربية)",
                    "التوصية الطبية للصيدلي (بالعربية)",
                    "البديل الآمن المقترح (اختياري)"
                };

                for (int c = 0; c < headers.Length; c++)
                {
                    var cell = ws.Cell(1, c + 1);
                    cell.Value = headers[c];
                    cell.Style.Font.Bold = true;
                    cell.Style.Font.FontColor = XLColor.White;
                    cell.Style.Fill.BackgroundColor = headerBg;
                    cell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                }
                ws.Row(1).Height = 28;

                // Sample row
                ws.Cell(2, 1).Value = "warfarin";
                ws.Cell(2, 2).Value = "diclofenac";
                ws.Cell(2, 3).Value = "severe";
                ws.Cell(2, 4).Value = "تثبيط الصفائح وتقرح الغشاء المخاطي مع زيادة الوارفارين الحر";
                ws.Cell(2, 5).Value = "نزيف معدي معوي حاد وارتفاع حرج في نسبة السيولة";
                ws.Cell(2, 6).Value = "يمنع الجمع نهائياً واستبدال المسكن بالباراسيتامول";
                ws.Cell(2, 7).Value = "باراسيتامول (Paracetamol)";

                ws.Columns().AdjustToContents(15, 60);

                string finalPath = targetFilePath;
                if (string.IsNullOrEmpty(finalPath))
                {
                    string tempDir = Path.Combine(Path.GetTempPath(), "RafiqPOS_Templates");
                    if (!Directory.Exists(tempDir)) Directory.CreateDirectory(tempDir);
                    finalPath = Path.Combine(tempDir, "Drug_Interactions_Template.xlsx");
                }

                wb.SaveAs(finalPath);
                return finalPath;
            }
        }

        public int ImportFromExcel(string filePath, string userId)
        {
            if (string.IsNullOrEmpty(filePath) || !File.Exists(filePath))
            {
                throw new FileNotFoundException("ملف الإكسل غير موجود: " + filePath);
            }

            var itemsToImport = new List<DrugInteraction>();

            using (var wb = new XLWorkbook(filePath))
            {
                var ws = wb.Worksheet(1);
                int lastRow = ws.LastRowUsed() != null ? ws.LastRowUsed().RowNumber() : 0;

                for (int r = 2; r <= lastRow; r++)
                {
                    var row = ws.Row(r);
                    if (row == null || row.IsEmpty()) continue;

                    string ingA = row.Cell(1).GetString().Trim();
                    string ingB = row.Cell(2).GetString().Trim();
                    if (string.IsNullOrEmpty(ingA) || string.IsNullOrEmpty(ingB)) continue;

                    string sev = row.Cell(3).GetString().Trim().ToLowerInvariant();
                    if (sev != "severe" && sev != "moderate" && sev != "minor") sev = "moderate";

                    string mech = row.Cell(4).GetString().Trim();
                    string risk = row.Cell(5).GetString().Trim();
                    string rec = row.Cell(6).GetString().Trim();
                    string alt = row.Cell(7).GetString().Trim();

                    itemsToImport.Add(new DrugInteraction
                    {
                        ActiveIngredientA = ingA,
                        ActiveIngredientB = ingB,
                        Severity = sev,
                        MechanismAr = !string.IsNullOrEmpty(mech) ? mech : "تفاعل دوائي سريري مسجل",
                        ClinicalRiskAr = !string.IsNullOrEmpty(risk) ? risk : "خطر سريري محتمل",
                        RecommendationAr = !string.IsNullOrEmpty(rec) ? rec : "مراجعة الصيدلي قبل الصرف",
                        AlternativeAr = alt,
                        Source = "excel_import"
                    });
                }
            }

            return _repo.BulkImport(itemsToImport, userId);
        }

        private static void AddCandidateIngredients(ProductDrugData target, string raw)
        {
            if (target == null || string.IsNullOrEmpty(raw)) return;

            string[] subParts = raw.Split(new char[] { '+', '/', ',', ';' });
            for (int sp = 0; sp < subParts.Length; sp++)
            {
                string pNorm = PharmaRepository.NormalizePharmaText(subParts[sp].Trim());
                if (!string.IsNullOrEmpty(pNorm))
                {
                    if (!target.Ingredients.Contains(pNorm))
                    {
                        target.Ingredients.Add(pNorm);
                    }

                    // Extract primary base substance (e.g. "diclofenac" from "diclofenac potassium" or "atorvastatin" from "atorvastatin calcium")
                    string[] words = pNorm.Split(new char[] { ' ' });
                    if (words.Length > 1 && words[0].Length >= 4)
                    {
                        string rootWord = words[0];
                        if (!target.Ingredients.Contains(rootWord))
                        {
                            target.Ingredients.Add(rootWord);
                        }
                    }

                    // Canonical Clinical Substance Normalization (Coverage for all Egyptian 26k Drug Reference items)
                    MapCanonicalSubstances(target, pNorm);
                }
            }
        }

        private static void MapCanonicalSubstances(ProductDrugData target, string norm)
        {
            if (string.IsNullOrEmpty(norm) || target == null) return;

            // Anticoagulants & Antiplatelets
            if (norm.Contains("warfarin") && !target.Ingredients.Contains("warfarin")) target.Ingredients.Add("warfarin");
            if (norm.Contains("apixaban") && !target.Ingredients.Contains("apixaban")) target.Ingredients.Add("apixaban");
            if (norm.Contains("rivaroxaban") && !target.Ingredients.Contains("rivaroxaban")) target.Ingredients.Add("rivaroxaban");
            if (norm.Contains("dabigatran") && !target.Ingredients.Contains("dabigatran")) target.Ingredients.Add("dabigatran");
            if (norm.Contains("clopidogrel") && !target.Ingredients.Contains("clopidogrel")) target.Ingredients.Add("clopidogrel");
            if ((norm.Contains("aspirin") || norm.Contains("acetylsalicylic")) && !target.Ingredients.Contains("aspirin")) target.Ingredients.Add("aspirin");

            // Analgesics & NSAIDs
            if ((norm.Contains("paracetamol") || norm.Contains("acetaminophen")) && !target.Ingredients.Contains("paracetamol")) target.Ingredients.Add("paracetamol");
            if (norm.Contains("diclofenac") && !target.Ingredients.Contains("diclofenac")) target.Ingredients.Add("diclofenac");
            if (norm.Contains("ibuprofen") && !target.Ingredients.Contains("ibuprofen")) target.Ingredients.Add("ibuprofen");
            if (norm.Contains("ketoprofen") && !target.Ingredients.Contains("ketoprofen")) target.Ingredients.Add("ketoprofen");
            if (norm.Contains("meloxicam") && !target.Ingredients.Contains("meloxicam")) target.Ingredients.Add("meloxicam");
            if (norm.Contains("celecoxib") && !target.Ingredients.Contains("celecoxib")) target.Ingredients.Add("celecoxib");
            if (norm.Contains("piroxicam") && !target.Ingredients.Contains("piroxicam")) target.Ingredients.Add("piroxicam");
            if (norm.Contains("ketorolac") && !target.Ingredients.Contains("ketorolac")) target.Ingredients.Add("ketorolac");

            // Acid Suppressants
            if (norm.Contains("omeprazole") && !norm.Contains("esomeprazole") && !target.Ingredients.Contains("omeprazole")) target.Ingredients.Add("omeprazole");
            if (norm.Contains("esomeprazole") && !target.Ingredients.Contains("esomeprazole")) target.Ingredients.Add("esomeprazole");
            if (norm.Contains("pantoprazole") && !target.Ingredients.Contains("pantoprazole")) target.Ingredients.Add("pantoprazole");

            // Antimicrobials
            if (norm.Contains("ciprofloxacin") && !target.Ingredients.Contains("ciprofloxacin")) target.Ingredients.Add("ciprofloxacin");
            if (norm.Contains("levofloxacin") && !target.Ingredients.Contains("levofloxacin")) target.Ingredients.Add("levofloxacin");
            if (norm.Contains("clarithromycin") && !target.Ingredients.Contains("clarithromycin")) target.Ingredients.Add("clarithromycin");
            if (norm.Contains("erythromycin") && !target.Ingredients.Contains("erythromycin")) target.Ingredients.Add("erythromycin");
            if (norm.Contains("azithromycin") && !target.Ingredients.Contains("azithromycin")) target.Ingredients.Add("azithromycin");
            if (norm.Contains("metronidazole") && !target.Ingredients.Contains("metronidazole")) target.Ingredients.Add("metronidazole");
            if (norm.Contains("amoxicillin") && !target.Ingredients.Contains("amoxicillin")) target.Ingredients.Add("amoxicillin");
            if (norm.Contains("fluconazole") && !target.Ingredients.Contains("fluconazole")) target.Ingredients.Add("fluconazole");
            if (norm.Contains("ketoconazole") && !target.Ingredients.Contains("ketoconazole")) target.Ingredients.Add("ketoconazole");
            if (norm.Contains("itraconazole") && !target.Ingredients.Contains("itraconazole")) target.Ingredients.Add("itraconazole");
            if (norm.Contains("doxycycline") && !target.Ingredients.Contains("doxycycline")) target.Ingredients.Add("doxycycline");
            if (norm.Contains("linezolid") && !target.Ingredients.Contains("linezolid")) target.Ingredients.Add("linezolid");
            if (norm.Contains("meropenem") && !target.Ingredients.Contains("meropenem")) target.Ingredients.Add("meropenem");
            if (norm.Contains("trimethoprim") && !target.Ingredients.Contains("trimethoprim")) target.Ingredients.Add("trimethoprim");
            if (norm.Contains("rifampicin") && !target.Ingredients.Contains("rifampicin")) target.Ingredients.Add("rifampicin");

            // Cardiac & Antihypertensive
            if (norm.Contains("amiodarone") && !target.Ingredients.Contains("amiodarone")) target.Ingredients.Add("amiodarone");
            if (norm.Contains("digoxin") && !target.Ingredients.Contains("digoxin")) target.Ingredients.Add("digoxin");
            if (norm.Contains("atorvastatin") && !target.Ingredients.Contains("atorvastatin")) target.Ingredients.Add("atorvastatin");
            if (norm.Contains("simvastatin") && !target.Ingredients.Contains("simvastatin")) target.Ingredients.Add("simvastatin");
            if (norm.Contains("rosuvastatin") && !target.Ingredients.Contains("rosuvastatin")) target.Ingredients.Add("rosuvastatin");
            if (norm.Contains("captopril") && !target.Ingredients.Contains("captopril")) target.Ingredients.Add("captopril");
            if (norm.Contains("enalapril") && !target.Ingredients.Contains("enalapril")) target.Ingredients.Add("enalapril");
            if (norm.Contains("ramipril") && !target.Ingredients.Contains("ramipril")) target.Ingredients.Add("ramipril");
            if (norm.Contains("valsartan") && !target.Ingredients.Contains("valsartan")) target.Ingredients.Add("valsartan");
            if (norm.Contains("losartan") && !target.Ingredients.Contains("losartan")) target.Ingredients.Add("losartan");
            if (norm.Contains("spironolactone") && !target.Ingredients.Contains("spironolactone")) target.Ingredients.Add("spironolactone");
            if (norm.Contains("bisoprolol") && !target.Ingredients.Contains("bisoprolol")) target.Ingredients.Add("bisoprolol");
            if (norm.Contains("atenolol") && !target.Ingredients.Contains("atenolol")) target.Ingredients.Add("atenolol");
            if (norm.Contains("verapamil") && !target.Ingredients.Contains("verapamil")) target.Ingredients.Add("verapamil");
            if (norm.Contains("diltiazem") && !target.Ingredients.Contains("diltiazem")) target.Ingredients.Add("diltiazem");
            if (norm.Contains("amlodipine") && !target.Ingredients.Contains("amlodipine")) target.Ingredients.Add("amlodipine");
            if (norm.Contains("furosemide") && !target.Ingredients.Contains("furosemide")) target.Ingredients.Add("furosemide");
            if (norm.Contains("hydrochlorothiazide") && !target.Ingredients.Contains("hydrochlorothiazide")) target.Ingredients.Add("hydrochlorothiazide");
            if (norm.Contains("nitroglycerin") && !target.Ingredients.Contains("nitroglycerin")) target.Ingredients.Add("nitroglycerin");
            if (norm.Contains("isosorbide") && norm.Contains("dinitrate") && !target.Ingredients.Contains("isosorbide dinitrate")) target.Ingredients.Add("isosorbide dinitrate");
            if (norm.Contains("isosorbide") && norm.Contains("mononitrate") && !target.Ingredients.Contains("isosorbide mononitrate")) target.Ingredients.Add("isosorbide mononitrate");
            if (norm.Contains("gemfibrozil") && !target.Ingredients.Contains("gemfibrozil")) target.Ingredients.Add("gemfibrozil");

            // Phosphodiesterase Inhibitors
            if (norm.Contains("sildenafil") && !target.Ingredients.Contains("sildenafil")) target.Ingredients.Add("sildenafil");
            if (norm.Contains("tadalafil") && !target.Ingredients.Contains("tadalafil")) target.Ingredients.Add("tadalafil");
            if (norm.Contains("vardenafil") && !target.Ingredients.Contains("vardenafil")) target.Ingredients.Add("vardenafil");

            // CNS & Psychiatry
            if (norm.Contains("tramadol") && !target.Ingredients.Contains("tramadol")) target.Ingredients.Add("tramadol");
            if (norm.Contains("fluoxetine") && !target.Ingredients.Contains("fluoxetine")) target.Ingredients.Add("fluoxetine");
            if (norm.Contains("paroxetine") && !target.Ingredients.Contains("paroxetine")) target.Ingredients.Add("paroxetine");
            if (norm.Contains("sertraline") && !target.Ingredients.Contains("sertraline")) target.Ingredients.Add("sertraline");
            if (norm.Contains("escitalopram") && !target.Ingredients.Contains("escitalopram")) target.Ingredients.Add("escitalopram");
            if (norm.Contains("duloxetine") && !target.Ingredients.Contains("duloxetine")) target.Ingredients.Add("duloxetine");
            if (norm.Contains("alprazolam") && !target.Ingredients.Contains("alprazolam")) target.Ingredients.Add("alprazolam");
            if (norm.Contains("clonazepam") && !target.Ingredients.Contains("clonazepam")) target.Ingredients.Add("clonazepam");
            if (norm.Contains("morphine") && !target.Ingredients.Contains("morphine")) target.Ingredients.Add("morphine");
            if (norm.Contains("lithium") && !target.Ingredients.Contains("lithium")) target.Ingredients.Add("lithium");
            if (norm.Contains("carbamazepine") && !target.Ingredients.Contains("carbamazepine")) target.Ingredients.Add("carbamazepine");
            if ((norm.Contains("valproic") || norm.Contains("valproate")) && !target.Ingredients.Contains("valproic acid")) target.Ingredients.Add("valproic acid");

            // Endocrine, Oncology, Minerals
            if (norm.Contains("metformin") && !target.Ingredients.Contains("metformin")) target.Ingredients.Add("metformin");
            if (norm.Contains("glimepiride") && !target.Ingredients.Contains("glimepiride")) target.Ingredients.Add("glimepiride");
            if (norm.Contains("gliclazide") && !target.Ingredients.Contains("gliclazide")) target.Ingredients.Add("gliclazide");
            if (norm.Contains("methotrexate") && !target.Ingredients.Contains("methotrexate")) target.Ingredients.Add("methotrexate");
            if (norm.Contains("allopurinol") && !target.Ingredients.Contains("allopurinol")) target.Ingredients.Add("allopurinol");
            if (norm.Contains("azathioprine") && !target.Ingredients.Contains("azathioprine")) target.Ingredients.Add("azathioprine");
            if (norm.Contains("colchicine") && !target.Ingredients.Contains("colchicine")) target.Ingredients.Add("colchicine");
            if (norm.Contains("theophylline") && !target.Ingredients.Contains("theophylline")) target.Ingredients.Add("theophylline");
            if (norm.Contains("levothyroxine") && !target.Ingredients.Contains("levothyroxine")) target.Ingredients.Add("levothyroxine");
            if (norm.Contains("prednisolone") && !target.Ingredients.Contains("prednisolone")) target.Ingredients.Add("prednisolone");
            if (norm.Contains("isotretinoin") && !target.Ingredients.Contains("isotretinoin")) target.Ingredients.Add("isotretinoin");
            if ((norm.Contains("contrast") || norm.Contains("radiopaque")) && !target.Ingredients.Contains("contrast media")) target.Ingredients.Add("contrast media");
            if (norm.Contains("alcohol") && !target.Ingredients.Contains("alcohol")) target.Ingredients.Add("alcohol");

            // Minerals & Salts
            if (norm.Contains("calcium") && !target.Ingredients.Contains("calcium carbonate")) target.Ingredients.Add("calcium carbonate");
            if ((norm.Contains("iron") || norm.Contains("ferrous")) && !target.Ingredients.Contains("ferrous sulfate")) target.Ingredients.Add("ferrous sulfate");
            if ((norm.Contains("aluminum") || norm.Contains("antacid")) && !target.Ingredients.Contains("aluminum hydroxide")) target.Ingredients.Add("aluminum hydroxide");
            if (norm.Contains("potassium") && (norm.Contains("chloride") || norm.Contains("supplement")) && !target.Ingredients.Contains("potassium chloride")) target.Ingredients.Add("potassium chloride");
        }
    }
}
