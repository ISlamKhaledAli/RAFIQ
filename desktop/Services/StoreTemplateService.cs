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

            if (list.Count == 0)
            {
                list = GetFallbackTemplates();
            }

            return list;
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

                _settingsRepo.SaveBatch(settingsBatch);

                // 2. Seed Categories (Task 106-3)
                int catsCreated = 0;
                if (template.Categories != null && _categoryService != null)
                {
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

                // 3. Seed Quick Items (Task 106-3)
                int itemsCreated = 0;
                if (template.QuickItems != null && _quickItemService != null)
                {
                    var existingItems = _quickItemService.GetAll();
                    var existingNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    for (int i = 0; i < existingItems.Count; i++)
                    {
                        existingNames.Add(existingItems[i].Name);
                    }

                    for (int i = 0; i < template.QuickItems.Count; i++)
                    {
                        var tplItem = template.QuickItems[i];
                        if (tplItem != null && !string.IsNullOrWhiteSpace(tplItem.Name) && !existingNames.Contains(tplItem.Name.Trim()))
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
                result.Message = string.Format("تم تهيئة النظام بنجاح بقالب {0}.", template.Name);
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
            list.Add(t1);

            // 2. Dairy & Bakery
            var t2 = new StoreTemplate();
            t2.Id = "dairy_bakery";
            t2.Name = "ألبان ومخبوزات ومعلبات";
            t2.Description = "مناسب لمحلات اللبانة والأجبان والمخابز التي تعتمد على البيع بالوزن والأصناف الطازجة";
            t2.Icon = "milk";
            t2.FeatureFlags["feature_scale_weight"] = true;
            t2.FeatureFlags["feature_credit_debts"] = true;
            t2.FeatureFlags["feature_fast_buttons"] = true;
            t2.FeatureFlags["feature_taxes"] = false;
            t2.FeatureFlags["feature_expiry_dates"] = true;
            t2.FeatureFlags["feature_multi_units"] = false;
            t2.Categories = new List<string> { "ألبان سائبة ومعبأة", "أجبان بيضاء ومطبوخة", "مخبوزات طازجة", "بيض ومستلزمات", "معلبات وعسل" };
            t2.QuickItems = new List<TemplateQuickItem>
            {
                new TemplateQuickItem { Name = "لبن جاموسي طازج كجم", PricePiasters = 3000, Unit = "kg", CategoryName = "ألبان سائبة ومعبأة" },
                new TemplateQuickItem { Name = "لبن بقري طازج كجم", PricePiasters = 2600, Unit = "kg", CategoryName = "ألبان سائبة ومعبأة" },
                new TemplateQuickItem { Name = "جبنة قريش كجم", PricePiasters = 7000, Unit = "kg", CategoryName = "أجبان بيضاء ومطبوخة" },
                new TemplateQuickItem { Name = "جبنة براميلي فلفل كجم", PricePiasters = 14000, Unit = "kg", CategoryName = "أجبان بيضاء ومطبوخة" },
                new TemplateQuickItem { Name = "رغيف فينو", PricePiasters = 150, Unit = "piece", CategoryName = "مخبوزات طازجة" },
                new TemplateQuickItem { Name = "طبق بيض أحمر 30 بيضة", PricePiasters = 16500, Unit = "piece", CategoryName = "بيض ومستلزمات" },
                new TemplateQuickItem { Name = "زبادي بلدي كبير", PricePiasters = 800, Unit = "piece", CategoryName = "ألبان سائبة ومعبأة" }
            };
            list.Add(t2);

            // 3. Accessories & Gifts
            var t3 = new StoreTemplate();
            t3.Id = "accessories_gifts";
            t3.Name = "إكسسوارات ومكتبات وهدايا";
            t3.Description = "مناسب لمحلات الإكسسوارات والموبايل، الهدايا، والمكتبات (بدون ميزان وأوزان)";
            t3.Icon = "gift";
            t3.FeatureFlags["feature_scale_weight"] = false;
            t3.FeatureFlags["feature_credit_debts"] = true;
            t3.FeatureFlags["feature_fast_buttons"] = true;
            t3.FeatureFlags["feature_taxes"] = false;
            t3.FeatureFlags["feature_expiry_dates"] = false;
            t3.FeatureFlags["feature_multi_units"] = false;
            t3.Categories = new List<string> { "إكسسوارات هاتف", "أدوات مكتبية ومدرسية", "هدايا وعطور", "ألعاب وهوايات", "إلكترونيات وشواحن" };
            t3.QuickItems = new List<TemplateQuickItem>
            {
                new TemplateQuickItem { Name = "كابل شحن سريع Type-C", PricePiasters = 4500, Unit = "piece", CategoryName = "إكسسوارات هاتف" },
                new TemplateQuickItem { Name = "قلم جاف أزرق فاخر", PricePiasters = 500, Unit = "piece", CategoryName = "أدوات مكتبية ومدرسية" },
                new TemplateQuickItem { Name = "بطارية قلم AA", PricePiasters = 1500, Unit = "piece", CategoryName = "إلكترونيات وشواحن" },
                new TemplateQuickItem { Name = "تغليف هدية فاخر", PricePiasters = 2500, Unit = "piece", CategoryName = "هدايا وعطور", IsOpenPrice = true },
                new TemplateQuickItem { Name = "كيس هدايا كرتون", PricePiasters = 1000, Unit = "piece", CategoryName = "هدايا وعطور" },
                new TemplateQuickItem { Name = "لاصقة حماية شاشة", PricePiasters = 3000, Unit = "piece", CategoryName = "إكسسوارات هاتف" }
            };
            list.Add(t3);

            // 4. General Grocery
            var t4 = new StoreTemplate();
            t4.Id = "general_grocery";
            t4.Name = "بقالة ومحل تجاري عام";
            t4.Description = "إعداد عام متوازن يناسب كافة المحلات والأنشطة التجارية المتنوعة";
            t4.Icon = "store";
            t4.FeatureFlags["feature_scale_weight"] = true;
            t4.FeatureFlags["feature_credit_debts"] = true;
            t4.FeatureFlags["feature_fast_buttons"] = true;
            t4.FeatureFlags["feature_taxes"] = false;
            t4.FeatureFlags["feature_expiry_dates"] = false;
            t4.FeatureFlags["feature_multi_units"] = false;
            t4.Categories = new List<string> { "عام", "أغذية ومشروبات", "منظفات", "حلويات وتسالي", "دخان وسجائر" };
            t4.QuickItems = new List<TemplateQuickItem>
            {
                new TemplateQuickItem { Name = "كيس تسوق", PricePiasters = 100, Unit = "piece", CategoryName = "عام" },
                new TemplateQuickItem { Name = "ولاعة عادية", PricePiasters = 500, Unit = "piece", CategoryName = "دخان وسجائر" },
                new TemplateQuickItem { Name = "علبة كبريت", PricePiasters = 100, Unit = "piece", CategoryName = "عام" },
                new TemplateQuickItem { Name = "مياه صغيرة 500 مل", PricePiasters = 500, Unit = "piece", CategoryName = "أغذية ومشروبات" },
                new TemplateQuickItem { Name = "شيبسي عائلي", PricePiasters = 1500, Unit = "piece", CategoryName = "حلويات وتسالي" }
            };
            list.Add(t4);

            return list;
        }
    }
}
