using System;
using System.Collections.Generic;
using System.Data.SQLite;
using Newtonsoft.Json;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class StoreTemplateService
    {
        private readonly string _connectionString;
        private readonly SettingsRepository _settingsRepo;
        private readonly CategoryService _categoryService;
        private readonly QuickItemService _quickItemService;
        private readonly AuditLogRepository _auditRepo;

        public StoreTemplateService(
            string connectionString,
            SettingsRepository settingsRepo,
            CategoryService categoryService,
            QuickItemService quickItemService,
            AuditLogRepository auditRepo)
        {
            this._connectionString = connectionString;
            this._settingsRepo = settingsRepo;
            this._categoryService = categoryService;
            this._quickItemService = quickItemService;
            this._auditRepo = auditRepo;
        }

        public bool IsFirstRunNeeded()
        {
            string completed = _settingsRepo.Get("first_run_completed", "0");
            return completed != "1" && completed.ToLower() != "true";
        }

        public List<StoreTemplate> GetAllTemplates()
        {
            var list = new List<StoreTemplate>();

            try
            {
                using (var conn = new SQLiteConnection(_connectionString))
                {
                    conn.Open();
                    using (var cmd = new SQLiteCommand("SELECT id, name, description, icon, feature_flags_json, categories_json, quick_items_json, default_settings_json, is_active FROM store_templates WHERE is_active = 1 ORDER BY rowid ASC;", conn))
                    {
                        using (var reader = cmd.ExecuteReader())
                        {
                            while (reader.Read())
                            {
                                var tpl = new StoreTemplate();
                                tpl.Id = reader.GetString(0);
                                tpl.Name = reader.GetString(1);
                                tpl.Description = reader.IsDBNull(2) ? "" : reader.GetString(2);
                                tpl.Icon = reader.IsDBNull(3) ? "store" : reader.GetString(3);

                                string flagsJson = reader.IsDBNull(4) ? "" : reader.GetString(4);
                                if (!string.IsNullOrEmpty(flagsJson))
                                {
                                    tpl.FeatureFlags = JsonConvert.DeserializeObject<Dictionary<string, bool>>(flagsJson) ?? new Dictionary<string, bool>();
                                }

                                string catsJson = reader.IsDBNull(5) ? "" : reader.GetString(5);
                                if (!string.IsNullOrEmpty(catsJson))
                                {
                                    tpl.Categories = JsonConvert.DeserializeObject<List<string>>(catsJson) ?? new List<string>();
                                }

                                string itemsJson = reader.IsDBNull(6) ? "" : reader.GetString(6);
                                if (!string.IsNullOrEmpty(itemsJson))
                                {
                                    tpl.QuickItems = JsonConvert.DeserializeObject<List<TemplateQuickItem>>(itemsJson) ?? new List<TemplateQuickItem>();
                                }

                                string settingsJson = reader.IsDBNull(7) ? "" : reader.GetString(7);
                                if (!string.IsNullOrEmpty(settingsJson))
                                {
                                    tpl.DefaultSettings = JsonConvert.DeserializeObject<Dictionary<string, string>>(settingsJson) ?? new Dictionary<string, string>();
                                }

                                tpl.IsActive = reader.GetInt32(8) == 1;
                                list.Add(tpl);
                            }
                        }
                    }
                }
            }
            catch
            {
                // Fallback to built-in presets if table query fails
            }

            if (list.Count < 8)
            {
                list = GetFallbackTemplates();
                EnsureTemplatesSeeded(list);
            }

            return list;
        }

        private void EnsureTemplatesSeeded(List<StoreTemplate> templates)
        {
            try
            {
                using (var conn = new SQLiteConnection(_connectionString))
                {
                    conn.Open();
                    using (var trans = conn.BeginTransaction())
                    {
                        for (int i = 0; i < templates.Count; i++)
                        {
                            var tpl = templates[i];
                            string sql = @"
                                INSERT OR REPLACE INTO store_templates (id, name, description, icon, feature_flags_json, categories_json, quick_items_json, default_settings_json, is_active, created_at)
                                VALUES (@id, @name, @desc, @icon, @flags, @cats, @items, @settings, 1, datetime('now'));
                            ";
                            using (var cmd = new SQLiteCommand(sql, conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@id", tpl.Id);
                                cmd.Parameters.AddWithValue("@name", tpl.Name);
                                cmd.Parameters.AddWithValue("@desc", tpl.Description ?? "");
                                cmd.Parameters.AddWithValue("@icon", tpl.Icon ?? "store");
                                cmd.Parameters.AddWithValue("@flags", JsonConvert.SerializeObject(tpl.FeatureFlags));
                                cmd.Parameters.AddWithValue("@cats", JsonConvert.SerializeObject(tpl.Categories));
                                cmd.Parameters.AddWithValue("@items", JsonConvert.SerializeObject(tpl.QuickItems));
                                cmd.Parameters.AddWithValue("@settings", JsonConvert.SerializeObject(tpl.DefaultSettings));
                                cmd.ExecuteNonQuery();
                            }
                        }
                        trans.Commit();
                    }
                }
            }
            catch
            {
                // Ignored
            }
        }

        public StoreTemplate GetTemplateById(string id)
        {
            var all = GetAllTemplates();
            for (int i = 0; i < all.Count; i++)
            {
                if (string.Equals(all[i].Id, id, StringComparison.OrdinalIgnoreCase))
                {
                    return all[i];
                }
            }
            return all.Count > 0 ? all[0] : null;
        }

        public ApplyTemplateResult ApplyTemplate(ApplyTemplateRequest req)
        {
            var result = new ApplyTemplateResult();

            if (req == null || string.IsNullOrEmpty(req.TemplateId))
            {
                result.Success = false;
                result.Message = "معرّف قالب المحل مطلوب.";
                return result;
            }

            var template = GetTemplateById(req.TemplateId);
            if (template == null)
            {
                result.Success = false;
                result.Message = "القالب المطلوب غير موجود في النظام.";
                return result;
            }

            try
            {
                // 1. Save Store Settings & Feature Flags (Task 106-3)
                var settingsBatch = new Dictionary<string, string>();
                settingsBatch["store_type"] = template.Id;
                settingsBatch["first_run_completed"] = "1";

                if (!string.IsNullOrWhiteSpace(req.StoreName))
                    settingsBatch["store_name"] = req.StoreName.Trim();
                if (!string.IsNullOrWhiteSpace(req.StorePhone))
                    settingsBatch["store_phone"] = req.StorePhone.Trim();
                if (!string.IsNullOrWhiteSpace(req.StoreAddress))
                    settingsBatch["store_address"] = req.StoreAddress.Trim();
                if (!string.IsNullOrWhiteSpace(req.ReceiptHeader))
                    settingsBatch["receipt_header"] = req.ReceiptHeader.Trim();
                if (!string.IsNullOrWhiteSpace(req.ReceiptFooter))
                    settingsBatch["receipt_footer"] = req.ReceiptFooter.Trim();
                if (!string.IsNullOrWhiteSpace(req.DefaultPrinter))
                    settingsBatch["default_printer_name"] = req.DefaultPrinter.Trim();
                if (!string.IsNullOrWhiteSpace(req.BackupFolder))
                    settingsBatch["backup_target_folder"] = req.BackupFolder.Trim();

                // Apply template feature flags
                if (template.FeatureFlags != null)
                {
                    foreach (var kvp in template.FeatureFlags)
                    {
                        settingsBatch[kvp.Key] = kvp.Value ? "1" : "0";
                    }
                }

                // Apply template default settings
                if (template.DefaultSettings != null)
                {
                    foreach (var kvp in template.DefaultSettings)
                    {
                        if (!settingsBatch.ContainsKey(kvp.Key))
                        {
                            settingsBatch[kvp.Key] = kvp.Value;
                        }
                    }
                }

                         // 2. Clear unused categories and seed template categories
                int catsCreated = 0;
                if (template.Categories != null && _categoryService != null)
                {
                    try
                    {
                        using (var conn = new SQLiteConnection(_connectionString))
                        {
                            conn.Open();
                            using (var cleanCatCmd = new SQLiteCommand(@"
                                DELETE FROM categories 
                                WHERE id NOT IN (SELECT DISTINCT category_id FROM products WHERE category_id IS NOT NULL AND category_id != '');
                            ", conn))
                            {
                                cleanCatCmd.ExecuteNonQuery();
                            }
                        }
                    }
                    catch
                    {
                        // Non-blocking
                    }

                    var existingCats = _categoryService.GetAll(true);
                    var existingNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    for (int i = 0; i < existingCats.Count; i++)
                    {
                        existingNames.Add(existingCats[i].Name);
                    }

                    for (int i = 0; i < template.Categories.Count; i++)
                    {
                        string catName = template.Categories[i];
                        if (!string.IsNullOrWhiteSpace(catName) && !existingNames.Contains(catName.Trim()))
                        {
                            try
                            {
                                var newCat = new Category();
                                newCat.Name = catName.Trim();
                                newCat.DisplayOrder = i + 1;
                                newCat.IsActive = true;
                                _categoryService.SaveCategory(newCat);
                                catsCreated++;
                            }
                            catch
                            {
                                // Ignore duplicate conflicts
                            }
                        }
                    }
                }

                // 3. Clear ALL existing quick items and seed selected template quick items ONLY
                int itemsCreated = 0;
                if (template.QuickItems != null && _quickItemService != null)
                {
                    _quickItemService.ClearAll();

                    for (int i = 0; i < template.QuickItems.Count; i++)
                    {
                        var tplItem = template.QuickItems[i];
                        if (tplItem != null && !string.IsNullOrWhiteSpace(tplItem.Name))
                        {
                            try
                            {
                                var qItem = new QuickItem();
                                qItem.Id = Guid.NewGuid().ToString();
                                qItem.Name = tplItem.Name.Trim();
                                qItem.PricePiasters = tplItem.PricePiasters;
                                qItem.IsOpenPrice = tplItem.IsOpenPrice;
                                qItem.Unit = string.IsNullOrEmpty(tplItem.Unit) ? "piece" : tplItem.Unit;
                                qItem.CategoryName = string.IsNullOrEmpty(tplItem.CategoryName) ? "عام" : tplItem.CategoryName;
                                qItem.DisplayOrder = i + 1;
                                _quickItemService.Save(qItem);
                                itemsCreated++;
                            }
                            catch
                            {
                                // Ignore item save conflicts
                            }
                        }
                    }
                }

                // 4. Audit Log
                if (_auditRepo != null)
                {
                    _auditRepo.Log(new AuditLog
                    {
                        UserId = "system",
                        Action = "FIRST_RUN_WIZARD_COMPLETED",
                        EntityType = "TEMPLATE",
                        EntityId = template.Id,
                        DetailsJson = string.Format("تم تهيئة النظام بنجاح بقالب: {0} ({1} تصنيفات، {2} أصناف سريعة)", template.Name, catsCreated, itemsCreated)
                    });
                }

                result.Success = true;
                result.Message = string.Format("تم تهيئة النظام بنجاح لنشاط: {0}", template.Name);
                result.CategoriesCount = catsCreated;
                result.QuickItemsCount = itemsCreated;
                return result;
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.Message = "حدث خطأ أثناء تطبيق القالب: " + ex.Message;
                return result;
            }
        }

        private static List<StoreTemplate> GetFallbackTemplates()
        {
            var list = new List<StoreTemplate>();

            // 1. Supermarket
            var t1 = new StoreTemplate();
            t1.Id = "supermarket";
            t1.Name = "سوبرماركت ومواد غذائية";
            t1.Description = "مناسب لمحلات السوبرماركت ومحلات البقالة الكبيرة التي تستخدم الباركود والميزان والآجل";
            t1.Icon = "shopping-cart";
            t1.FeatureFlags["feature_scale_weight"] = true;
            t1.FeatureFlags["feature_credit_debts"] = true;
            t1.FeatureFlags["feature_fast_buttons"] = true;
            t1.FeatureFlags["feature_taxes"] = false;
            t1.FeatureFlags["feature_expiry_dates"] = true;
            t1.FeatureFlags["feature_multi_units"] = true;
            t1.Categories = new List<string> { "معلبات وبقوليات", "ألبان وأجبان", "منظفات وعناية منزلية", "بسكويت وحلويات", "مشروبات وعصائر", "مخبوزات", "خضار وفاكهة" };
            t1.QuickItems = new List<TemplateQuickItem>
            {
                new TemplateQuickItem { Name = "خبز بلدي طازج", PricePiasters = 100, Unit = "piece", CategoryName = "مخبوزات" },
                new TemplateQuickItem { Name = "عيش فينو كيس 5 رغيف", PricePiasters = 1000, Unit = "piece", CategoryName = "مخبوزات" },
                new TemplateQuickItem { Name = "سكر حر ناعم 1 كجم", PricePiasters = 3500, Unit = "piece", CategoryName = "معلبات وبقوليات" },
                new TemplateQuickItem { Name = "شاي العروسة 40 جم", PricePiasters = 1200, Unit = "piece", CategoryName = "معلبات وبقوليات" },
                new TemplateQuickItem { Name = "مياه معدنية 1.5 لتر", PricePiasters = 800, Unit = "piece", CategoryName = "مشروبات وعصائر" },
                new TemplateQuickItem { Name = "لبن جهينة 1 لتر", PricePiasters = 4200, Unit = "piece", CategoryName = "ألبان وأجبان" },
                new TemplateQuickItem { Name = "طماطم بلدي طازجة", PricePiasters = 1500, Unit = "kg", CategoryName = "خضار وفاكهة" },
                new TemplateQuickItem { Name = "كيس تسوق كبير", PricePiasters = 150, Unit = "piece", CategoryName = "عام" }
            };
            t1.DefaultSettings["receipt_header"] = "أهلاً بكم في سوبرماركت رفيق";
            t1.DefaultSettings["receipt_footer"] = "شكراً لزيارتكم! البضاعة المباعة ترد وتستبدل خلال 14 يوماً بموجب الفاتورة.";
            list.Add(t1);

            // 2. Phones, Mobile & Electronics
            var t2 = new StoreTemplate();
            t2.Id = "phones_electronics";
            t2.Name = "محلات هواتف وموبايل وإلكترونيات";
            t2.Description = "مخصص لمحلات الهواتف الذكية والإلكترونيات وصيانة الجوال والإكسسوارات (بدون ميزان وأوزان)";
            t2.Icon = "smartphone";
            t2.FeatureFlags["feature_scale_weight"] = false;
            t2.FeatureFlags["feature_credit_debts"] = true;
            t2.FeatureFlags["feature_fast_buttons"] = true;
            t2.FeatureFlags["feature_taxes"] = false;
            t2.FeatureFlags["feature_expiry_dates"] = false;
            t2.FeatureFlags["feature_multi_units"] = false;
            t2.Categories = new List<string> { "كابلات وشواحن", "سماعات وصوتيات", "جرابات وحافظات", "لاصقات حماية وشاشات", "باور بانك وبطاريات", "كروت ميموري وفلاشات", "صيانة وخدمات سريعة" };
            t2.QuickItems = new List<TemplateQuickItem>
            {
                new TemplateQuickItem { Name = "كابل شحن سريع Type-C", PricePiasters = 4500, Unit = "piece", CategoryName = "كابلات وشواحن" },
                new TemplateQuickItem { Name = "كابل شحن آيفون Lightning", PricePiasters = 5000, Unit = "piece", CategoryName = "كابلات وشواحن" },
                new TemplateQuickItem { Name = "رأس شاحن سريع 20W", PricePiasters = 12000, Unit = "piece", CategoryName = "كابلات وشواحن" },
                new TemplateQuickItem { Name = "لاصقة حماية شاشة 9D", PricePiasters = 3000, Unit = "piece", CategoryName = "لاصقات حماية وشاشات" },
                new TemplateQuickItem { Name = "جراب سيليكون شفاف حماية", PricePiasters = 3500, Unit = "piece", CategoryName = "جرابات وحافظات" },
                new TemplateQuickItem { Name = "سماعة أذن سلكية AUX", PricePiasters = 4000, Unit = "piece", CategoryName = "سماعات وصوتيات" },
                new TemplateQuickItem { Name = "كارت ميموري 32 جيجا", PricePiasters = 9500, Unit = "piece", CategoryName = "كروت ميموري وفلاشات" },
                new TemplateQuickItem { Name = "صيانة وتركيب سريع", PricePiasters = 3000, Unit = "piece", CategoryName = "صيانة وخدمات سريعة", IsOpenPrice = true }
            };
            t2.DefaultSettings["receipt_header"] = "متجر رفيق للهواتف والإلكترونيات";
            t2.DefaultSettings["receipt_footer"] = "شكراً لتعاملكم معنا! نحرص دائماً على تقديم أفضل المنتجات والضمان المعتمد.";
            list.Add(t2);

            // 3. Dairy & Bakery
            var t3 = new StoreTemplate();
            t3.Id = "dairy_bakery";
            t3.Name = "ألبان ومخبوزات ومعلبات";
            t3.Description = "مناسب لمحلات اللبانة والأجبان والمخابز التي تعتمد على البيع بالوزن والأصناف الطازجة";
            t3.Icon = "milk";
            t3.FeatureFlags["feature_scale_weight"] = true;
            t3.FeatureFlags["feature_credit_debts"] = true;
            t3.FeatureFlags["feature_fast_buttons"] = true;
            t3.FeatureFlags["feature_taxes"] = false;
            t3.FeatureFlags["feature_expiry_dates"] = true;
            t3.FeatureFlags["feature_multi_units"] = false;
            t3.Categories = new List<string> { "ألبان سائبة ومعبأة", "أجبان بيضاء ومطبوخة", "مخبوزات طازجة", "بيض ومستلزمات", "معلبات وعسل" };
            t3.QuickItems = new List<TemplateQuickItem>
            {
                new TemplateQuickItem { Name = "لبن جاموسي طازج كجم", PricePiasters = 3000, Unit = "kg", CategoryName = "ألبان سائبة ومعبأة" },
                new TemplateQuickItem { Name = "لبن بقري طازج كجم", PricePiasters = 2600, Unit = "kg", CategoryName = "ألبان سائبة ومعبأة" },
                new TemplateQuickItem { Name = "جبنة قريش كجم", PricePiasters = 7000, Unit = "kg", CategoryName = "أجبان بيضاء ومطبوخة" },
                new TemplateQuickItem { Name = "جبنة براميلي فلفل كجم", PricePiasters = 14000, Unit = "kg", CategoryName = "أجبان بيضاء ومطبوخة" },
                new TemplateQuickItem { Name = "رغيف فينو", PricePiasters = 150, Unit = "piece", CategoryName = "مخبوزات طازجة" },
                new TemplateQuickItem { Name = "طبق بيض أحمر 30 بيضة", PricePiasters = 16500, Unit = "piece", CategoryName = "بيض ومستلزمات" },
                new TemplateQuickItem { Name = "زبادي بلدي كبير", PricePiasters = 800, Unit = "piece", CategoryName = "ألبان سائبة ومعبأة" }
            };
            t3.DefaultSettings["receipt_header"] = "ألبان ومخبوزات رفيق";
            t3.DefaultSettings["receipt_footer"] = "منتجات طازجة يومياً.. شكراً لثقتكم الغالية";
            list.Add(t3);

            // 4. Produce & Butchery (Vegetables, Fruits & Fresh Meat)
            var t4 = new StoreTemplate();
            t4.Id = "produce_butchery";
            t4.Name = "خضار وفاكهة ومجزر";
            t4.Description = "مناسب لمحلات الخضار والفاكهة والجزارة والمجمدات التي تعتمد أساسياً على الميزان الإلكتروني";
            t4.Icon = "apple";
            t4.FeatureFlags["feature_scale_weight"] = true;
            t4.FeatureFlags["feature_credit_debts"] = true;
            t4.FeatureFlags["feature_fast_buttons"] = true;
            t4.FeatureFlags["feature_taxes"] = false;
            t4.FeatureFlags["feature_expiry_dates"] = false;
            t4.FeatureFlags["feature_multi_units"] = false;
            t4.Categories = new List<string> { "خضروات طازجة", "فواكه موسمية", "ورقيات وأعشاب", "لحوم ودواجن", "مجمدات" };
            t4.QuickItems = new List<TemplateQuickItem>
            {
                new TemplateQuickItem { Name = "طماطم بلدي طازجة", PricePiasters = 1500, Unit = "kg", CategoryName = "خضروات طازجة" },
                new TemplateQuickItem { Name = "بطاطس تحمير كجم", PricePiasters = 1800, Unit = "kg", CategoryName = "خضروات طازجة" },
                new TemplateQuickItem { Name = "بصل أحمر بلدي كجم", PricePiasters = 1400, Unit = "kg", CategoryName = "خضروات طازجة" },
                new TemplateQuickItem { Name = "خيار صوب بلدي كجم", PricePiasters = 1600, Unit = "kg", CategoryName = "خضروات طازجة" },
                new TemplateQuickItem { Name = "ليمون بلدي كجم", PricePiasters = 2500, Unit = "kg", CategoryName = "خضروات طازجة" },
                new TemplateQuickItem { Name = "موز بلدي طازج كجم", PricePiasters = 2000, Unit = "kg", CategoryName = "فواكه موسمية" },
                new TemplateQuickItem { Name = "تفاح أحمر سكري كجم", PricePiasters = 4500, Unit = "kg", CategoryName = "فواكه موسمية" }
            };
            t4.DefaultSettings["receipt_header"] = "أسواق رفيق للخضار والفاكهة الطازجة";
            t4.DefaultSettings["receipt_footer"] = "بضاعة طازجة بأعلى جودة.. شكراً لزيارتكم!";
            list.Add(t4);

            // 5. Stationery & Gifts
            var t5 = new StoreTemplate();
            t5.Id = "stationery_gifts";
            t5.Name = "مكتبات وأدوات مدرسية وهدايا";
            t5.Description = "مناسب للمكتبات والقرطاسية، الهدايا، الألعاب ومستلزمات الطباعة (بدون ميزان)";
            t5.Icon = "book";
            t5.FeatureFlags["feature_scale_weight"] = false;
            t5.FeatureFlags["feature_credit_debts"] = true;
            t5.FeatureFlags["feature_fast_buttons"] = true;
            t5.FeatureFlags["feature_taxes"] = false;
            t5.FeatureFlags["feature_expiry_dates"] = false;
            t5.FeatureFlags["feature_multi_units"] = false;
            t5.Categories = new List<string> { "أدوات كتابة وأقلام", "كشاكيل ودفاتر", "أدوات هندسية ومدرسية", "ألعاب وهدايا", "طباعة وتصوير مستندات" };
            t5.QuickItems = new List<TemplateQuickItem>
            {
                new TemplateQuickItem { Name = "قلم جاف أزرق", PricePiasters = 500, Unit = "piece", CategoryName = "أدوات كتابة وأقلام" },
                new TemplateQuickItem { Name = "كشكول سلك 60 ورقة", PricePiasters = 2000, Unit = "piece", CategoryName = "كشاكيل ودفاتر" },
                new TemplateQuickItem { Name = "باكت ورق تصوير A4", PricePiasters = 18000, Unit = "piece", CategoryName = "طباعة وتصوير مستندات" },
                new TemplateQuickItem { Name = "تصوير مستند وجهين", PricePiasters = 150, Unit = "piece", CategoryName = "طباعة وتصوير مستندات" },
                new TemplateQuickItem { Name = "تغليف هدية فاخر", PricePiasters = 2500, Unit = "piece", CategoryName = "ألعاب وهدايا", IsOpenPrice = true },
                new TemplateQuickItem { Name = "كيس هدايا كرتون", PricePiasters = 1000, Unit = "piece", CategoryName = "ألعاب وهدايا" },
                new TemplateQuickItem { Name = "بطارية قلم AA", PricePiasters = 1500, Unit = "piece", CategoryName = "أدوات هندسية ومدرسية" }
            };
            t5.DefaultSettings["receipt_header"] = "مكتبة رفيق للقرطاسية والهدايا";
            t5.DefaultSettings["receipt_footer"] = "نتمنى لطلابنا الأعزاء دوام التوفيق والنجاح!";
            list.Add(t5);

            // 6. Spices, Roastery & Coffee
            var t6 = new StoreTemplate();
            t6.Id = "spices_roastery";
            t6.Name = "عطارة ومحامص وبن وتوابل";
            t6.Description = "مناسب لمحلات العطارة والبن والمحامص والمكسرات بالأوزان والجرامات والميزان";
            t6.Icon = "flame";
            t6.FeatureFlags["feature_scale_weight"] = true;
            t6.FeatureFlags["feature_credit_debts"] = true;
            t6.FeatureFlags["feature_fast_buttons"] = true;
            t6.FeatureFlags["feature_taxes"] = false;
            t6.FeatureFlags["feature_expiry_dates"] = true;
            t6.FeatureFlags["feature_multi_units"] = false;
            t6.Categories = new List<string> { "بن ومشروبات ساخنة", "مكسرات ومحامص", "توابل وبهارات", "أعشاب طبيعية", "ياميش وتمور" };
            t6.QuickItems = new List<TemplateQuickItem>
            {
                new TemplateQuickItem { Name = "ثمن بن محوج وسط", PricePiasters = 4500, Unit = "piece", CategoryName = "بن ومشروبات ساخنة" },
                new TemplateQuickItem { Name = "ربع بن سادة فاتح", PricePiasters = 7000, Unit = "piece", CategoryName = "بن ومشروبات ساخنة" },
                new TemplateQuickItem { Name = "كمون بلدي مطحون 100 جم", PricePiasters = 2500, Unit = "piece", CategoryName = "توابل وبهارات" },
                new TemplateQuickItem { Name = "فلفل أسود حب 100 جم", PricePiasters = 3500, Unit = "piece", CategoryName = "توابل وبهارات" },
                new TemplateQuickItem { Name = "فول سوداني مقشر 250 جم", PricePiasters = 2500, Unit = "piece", CategoryName = "مكسرات ومحامص" },
                new TemplateQuickItem { Name = "لب سوبر ممتاز 250 جم", PricePiasters = 3500, Unit = "piece", CategoryName = "مكسرات ومحامص" }
            };
            t6.DefaultSettings["receipt_header"] = "محامص وعطارة رفيق الأصيلة";
            t6.DefaultSettings["receipt_footer"] = "أفضل مذاق وأجود حبوب البن المحمص.. نعتز بثقتكم!";
            list.Add(t6);

            // 7. Clothing & Apparel
            var t7 = new StoreTemplate();
            t7.Id = "clothing_apparel";
            t7.Name = "ملابس وأحذية وأزياء";
            t7.Description = "مناسب لمحلات الملابس الجاهزة، الأحذية، الإكسسوارات والحقائب (بدون ميزان وصلاحية)";
            t7.Icon = "shirt";
            t7.FeatureFlags["feature_scale_weight"] = false;
            t7.FeatureFlags["feature_credit_debts"] = true;
            t7.FeatureFlags["feature_fast_buttons"] = true;
            t7.FeatureFlags["feature_taxes"] = false;
            t7.FeatureFlags["feature_expiry_dates"] = false;
            t7.FeatureFlags["feature_multi_units"] = false;
            t7.Categories = new List<string> { "ملابس رجالي", "ملابس حريمي", "ملابس أطفال", "أحذية وحقائب", "إكسسوارات ملابس" };
            t7.QuickItems = new List<TemplateQuickItem>
            {
                new TemplateQuickItem { Name = "تيشيرت قطن أساسي", PricePiasters = 15000, Unit = "piece", CategoryName = "ملابس رجالي" },
                new TemplateQuickItem { Name = "شراب قطن فاخر", PricePiasters = 2500, Unit = "piece", CategoryName = "إكسسوارات ملابس" },
                new TemplateQuickItem { Name = "حزام جلد كلاسيك", PricePiasters = 8500, Unit = "piece", CategoryName = "إكسسوارات ملابس" },
                new TemplateQuickItem { Name = "كيس تسوق فاخر", PricePiasters = 500, Unit = "piece", CategoryName = "عام" },
                new TemplateQuickItem { Name = "طرحة شيفون سادة", PricePiasters = 6000, Unit = "piece", CategoryName = "ملابس حريمي" }
            };
            t7.DefaultSettings["receipt_header"] = "متاجر رفيق للأزياء والموضة";
            t7.DefaultSettings["receipt_footer"] = "شكراً لزيارتكم! الاستبدال والاسترجاع خلال 14 يوماً مع الحفاظ على التيكت.";
            list.Add(t7);

            // 8. General Grocery
            var t8 = new StoreTemplate();
            t8.Id = "general_grocery";
            t8.Name = "بقالة ومحل تجاري عام";
            t8.Description = "إعداد عام متوازن يناسب كافة المحلات والأنشطة التجارية المتنوعة";
            t8.Icon = "store";
            t8.FeatureFlags["feature_scale_weight"] = true;
            t8.FeatureFlags["feature_credit_debts"] = true;
            t8.FeatureFlags["feature_fast_buttons"] = true;
            t8.FeatureFlags["feature_taxes"] = false;
            t8.FeatureFlags["feature_expiry_dates"] = false;
            t8.FeatureFlags["feature_multi_units"] = false;
            t8.Categories = new List<string> { "عام", "أغذية ومشروبات", "منظفات", "حلويات وتسالي", "دخان وسجائر" };
            t8.QuickItems = new List<TemplateQuickItem>
            {
                new TemplateQuickItem { Name = "كيس تسوق", PricePiasters = 100, Unit = "piece", CategoryName = "عام" },
                new TemplateQuickItem { Name = "ولاعة عادية", PricePiasters = 500, Unit = "piece", CategoryName = "دخان وسجائر" },
                new TemplateQuickItem { Name = "علبة كبريت", PricePiasters = 100, Unit = "piece", CategoryName = "عام" },
                new TemplateQuickItem { Name = "مياه صغيرة 500 مل", PricePiasters = 500, Unit = "piece", CategoryName = "أغذية ومشروبات" },
                new TemplateQuickItem { Name = "شيبسي عائلي", PricePiasters = 1500, Unit = "piece", CategoryName = "حلويات وتسالي" }
            };
            t8.DefaultSettings["receipt_header"] = "أهلاً بكم في متجرنا";
            t8.DefaultSettings["receipt_footer"] = "شكراً لتعاملكم معنا";
            list.Add(t8);

            return list;
        }
    }
}
