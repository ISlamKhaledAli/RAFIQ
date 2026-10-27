using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace RafiqPOS.Common
{
    /// <summary>
    /// تعريف الميزة في السجل المركزي (Feature Definition)
    /// </summary>
    public class FeatureDefinition
    {
        [JsonProperty("key")]
        public string Key { get; set; }

        [JsonProperty("nameAr")]
        public string NameAr { get; set; }

        [JsonProperty("descriptionAr")]
        public string DescriptionAr { get; set; }

        [JsonProperty("category")]
        public string Category { get; set; }

        [JsonProperty("defaultValue")]
        public bool DefaultValue { get; set; }

        [JsonProperty("requires")]
        public List<string> Requires { get; set; }

        [JsonProperty("ownedCommands")]
        public List<string> OwnedCommands { get; set; }

        [JsonProperty("ownedPermissions")]
        public List<string> OwnedPermissions { get; set; }

        public FeatureDefinition()
        {
            Requires = new List<string>();
            OwnedCommands = new List<string>();
            OwnedPermissions = new List<string>();
        }
    }

    /// <summary>
    /// سجل الميزات المركزي الموحد (Feature Registry)
    /// المصدر الوحيد للحقيقة لكافة مفاتيح ميزات النظام (Feature #182 / Task 182-1)
    /// </summary>
    public static class FeatureRegistry
    {
        private static readonly List<FeatureDefinition> _definitions;
        private static readonly Dictionary<string, FeatureDefinition> _byKey;
        private static readonly Dictionary<string, string> _commandToFeatureMap;

        static FeatureRegistry()
        {
            _definitions = new List<FeatureDefinition>();
            _byKey = new Dictionary<string, FeatureDefinition>(StringComparer.OrdinalIgnoreCase);
            _commandToFeatureMap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

            // =========================================================================
            // 1. الميزات الأساسية الحالية (9 مفاتيح)
            // =========================================================================

            Register(new FeatureDefinition
            {
                Key = "feature_scale_weight",
                NameAr = "ميزان الباركود والأصناف الموزونة",
                DescriptionAr = "قراءة باركود ميزان الجبن واللحوم والخضار وحساب الوزن والسعر تلقائياً بدون إدخال يدوي.",
                Category = "المبيعات ونقاط البيع",
                DefaultValue = false
            });

            Register(new FeatureDefinition
            {
                Key = "feature_credit_debts",
                NameAr = "حساب الشكك ودفتر ديون العملاء",
                DescriptionAr = "البيع بالآجل على الحساب ومتابعة كشف الحساب والحد الائتماني لكل عميل وسندات القبض.",
                Category = "المالية والحسابات",
                DefaultValue = true,
                OwnedCommands = new List<string>
                {
                    "customers:recordPayment",
                    "customers:cancelPayment",
                    "customers:recalculateBalance"
                },
                OwnedPermissions = new List<string>
                {
                    "customers.manage_debt",
                    "customers.pay"
                }
            });

            Register(new FeatureDefinition
            {
                Key = "feature_fast_buttons",
                NameAr = "أزرار الأصناف السريعة",
                DescriptionAr = "عرض وتخصيص شبكة أزرار الأصناف السريعة وشائعة البيع بدون باركود على شاشة الكاشير.",
                Category = "المبيعات ونقاط البيع",
                DefaultValue = true,
                OwnedCommands = new List<string>
                {
                    "quickItems:save",
                    "quickItems:delete",
                    "quickItems:deleteCategory",
                    "quickItems:renameCategory",
                    "quickItems:reorder"
                },
                OwnedPermissions = new List<string>
                {
                    "pos.quick_items"
                }
            });

            Register(new FeatureDefinition
            {
                Key = "feature_taxes",
                NameAr = "ضريبة القيمة المضافة",
                DescriptionAr = "تطبيق وحساب نسبة ضريبة القيمة المضافة على المبيعات والفواتير الضريبية.",
                Category = "المالية والحسابات",
                DefaultValue = false
            });

            Register(new FeatureDefinition
            {
                Key = "feature_expiry_dates",
                NameAr = "تواريخ الصلاحية وتشغيلات البضاعة",
                DescriptionAr = "متابعة تواريخ انتهاء الصلاحية والتنبيهات وسياسة صرف الأقدم أولاً (FEFO).",
                Category = "المخزون والتشغيلات",
                DefaultValue = false,
                OwnedCommands = new List<string>
                {
                    "batch:save",
                    "batch:adjust",
                    "batch:disposeExpired"
                },
                OwnedPermissions = new List<string>
                {
                    "batches.manage",
                    "inventory.expiry"
                }
            });

            Register(new FeatureDefinition
            {
                Key = "feature_multi_units",
                NameAr = "تعدد وحدات البيع والقياس",
                DescriptionAr = "تعريف وحدات كبرى وصغرى للصنف (كرتونة / دستة / قطعة) ومعاملات التحويل بينها.",
                Category = "المنتجات والمخزون",
                DefaultValue = false,
                OwnedCommands = new List<string>
                {
                    "productUnits:save",
                    "productUnits:delete",
                    "productUnits:setBase"
                },
                OwnedPermissions = new List<string>
                {
                    "products.units"
                }
            });

            Register(new FeatureDefinition
            {
                Key = "feature_matrix_variants",
                NameAr = "المقاسات والألوان ومصفوفة الملابس",
                DescriptionAr = "إدارة الصنف الواحد بأكثر من مقاس ولون مع باركود خاص لكل متغير لمحلات الملابس والأحذية.",
                Category = "المنتجات والمخزون",
                DefaultValue = false,
                OwnedCommands = new List<string>
                {
                    "variants:createMatrix",
                    "variants:delete",
                    "variants:deleteVariant"
                },
                OwnedPermissions = new List<string>
                {
                    "products.variants"
                }
            });

            Register(new FeatureDefinition
            {
                Key = "feature_epay_services",
                NameAr = "ماكينات وخدمات الدفع الإلكتروني",
                DescriptionAr = "إدارة ماكينات الدفع الإلكتروني (فوري، أمان) وعمليات الشحن والخدمات والعمولات المستقلة.",
                Category = "الخدمات والمدفوعات",
                DefaultValue = true,
                OwnedCommands = new List<string>
                {
                    "epay:createTransaction",
                    "epay:fundTerminal",
                    "epay:saveTerminal",
                    "epay:adjustBalance"
                },
                OwnedPermissions = new List<string>
                {
                    "epay.manage",
                    "epay.transact"
                }
            });

            Register(new FeatureDefinition
            {
                Key = "feature_digital_wallets",
                NameAr = "خدمات وكالة وسحب وإيداع المحافظ",
                DescriptionAr = "تقديم خدمات السحب والإيداع وتحويل الأموال للجمهور كنشاط تجاري بعمولة وإدارة أرصدة خطوط الكاش المستقلة عن مبيعات المحل.",
                Category = "الخدمات والمدفوعات",
                DefaultValue = false,
                OwnedCommands = new List<string>
                {
                    "wallets:processTransaction",
                    "wallets:fundAccount",
                    "wallets:saveAccount",
                    "wallets:createAccount",
                    "wallets:updateAccount",
                    "wallets:deleteAccount",
                    "wallets:adjustBalance",
                    "wallets:cancelTransaction"
                },
                OwnedPermissions = new List<string>
                {
                    "wallets.manage",
                    "wallets.transact"
                }
            });

            Register(new FeatureDefinition
            {
                Key = "feature_pos_digital_payments",
                NameAr = "قبول الدفع بإنستاباي والمحافظ في الكاشير",
                DescriptionAr = "إتاحة سداد فواتير المبيعات للعملاء عبر تحويلات إنستاباي ومحافظ الهواتف الذكية (فودافون كاش، أورانج، وي، اتصالات) كطرق دفع معتمدة في شاشة البيع.",
                Category = "المبيعات ونقاط البيع",
                DefaultValue = true
            });

            // =========================================================================
            // 2. ميزات المحطة 13 (الصيدليات والبيع بالتجزئة وفك العبوات)
            // =========================================================================

            Register(new FeatureDefinition
            {
                Key = "feature_loose_selling",
                NameAr = "البيع بالتجزئة وفك العبوات",
                DescriptionAr = "بيع الأصناف بالوحدات المفكوكة (بالشريط والقرص للأدوية، بالسيجارة للسجائر، بالبيضة) مع معالج التعبئة الذكي.",
                Category = "المنتجات والمخزون",
                DefaultValue = false,
                Requires = new List<string> { "feature_multi_units" },
                OwnedCommands = new List<string>
                {
                    "products:rebaseUnit",
                    "products:rebaseBaseUnit",
                    "packaging:saveLevels"
                },
                OwnedPermissions = new List<string>
                {
                    "products.packaging.edit",
                    "products.unit_rebase",
                    "pos.change_unit"
                }
            });

            Register(new FeatureDefinition
            {
                Key = "feature_batch_pricing",
                NameAr = "ازدواج تسعير التشغيلات على الرف",
                DescriptionAr = "بيع نفس الصنف بأسعار مختلفة حسب التشغيلة وتقسيم بنود الفاتورة آلياً عند اختلاف الأسعار.",
                Category = "المبيعات والتشغيلات",
                DefaultValue = false,
                Requires = new List<string> { "feature_expiry_dates" },
                OwnedPermissions = new List<string>
                {
                    "pos.select_batch"
                }
            });

            Register(new FeatureDefinition
            {
                Key = "feature_shelf_locations",
                NameAr = "مواقع التخزين والرفوف والأدراج",
                DescriptionAr = "تحديد ومتابعة أماكن تخزين الأصناف في الأدراج والرفوف والثلاجة وتوليد جرد مخصص للمكان.",
                Category = "المستودعات وإدارة الرفوف",
                DefaultValue = false,
                OwnedCommands = new List<string>
                {
                    "locations:save",
                    "locations:delete"
                },
                OwnedPermissions = new List<string>
                {
                    "inventory.locations.manage"
                }
            });

            Register(new FeatureDefinition
            {
                Key = "feature_shortage_book",
                NameAr = "دفتر النواقص وطلب الموزع",
                DescriptionAr = "تسجيل نواقص الكاشير والأصناف المطلوبة وتحويلها لمسودة فاتورة شراء مقسمة حسب المورد المفضل.",
                Category = "المشتريات والموردين",
                DefaultValue = false,
                OwnedCommands = new List<string>
                {
                    "shortages:save",
                    "shortages:convertToPurchase",
                    "shortages:delete"
                },
                OwnedPermissions = new List<string>
                {
                    "shortage.view",
                    "shortage.manage",
                    "shortage.convert_to_purchase"
                }
            });

            Register(new FeatureDefinition
            {
                Key = "feature_pharmacy",
                NameAr = "موديول الصيدلية المتكامل",
                DescriptionAr = "الملف الدوائي الكامل، الأشكال والجرعات الصيدلية، والبحث العلمي في شاشة الكاشير.",
                Category = "الصيدلية والأدوية",
                DefaultValue = false,
                Requires = new List<string>
                {
                    "feature_expiry_dates",
                    "feature_multi_units",
                    "feature_loose_selling"
                },
                OwnedCommands = new List<string>
                {
                    "pharma:saveDrugInfo",
                    "pharma:getStocktakingSheet",
                    "pharma:applyStocktaking",
                    "printer:printDosageLabel",
                    "reports:getPharmaExpiryHeatmap",
                    "reports:getPharmaStagnant",
                    "reports:getPharmaProfitability"
                },
                OwnedPermissions = new List<string>
                {
                    "pharma.drug_info.edit",
                    "pharma.stocktaking.manage",
                    "pharma.dosage_labels.print",
                    "reports.pharma.view"
                }
            });

            Register(new FeatureDefinition
            {
                Key = "feature_pharma_alternatives",
                NameAr = "المواد الفعالة والبدائل والمثائل",
                DescriptionAr = "اقتراح المثائل والبدائل العلاجية المتطابقة للأدوية الناقصة مع ترتيب الأقرب في السعر والمخزون.",
                Category = "الصيدلية والأدوية",
                DefaultValue = false,
                Requires = new List<string> { "feature_pharmacy" },
                OwnedPermissions = new List<string>
                {
                    "pharma.alternatives.view"
                }
            });

            Register(new FeatureDefinition
            {
                Key = "feature_controlled_drugs",
                NameAr = "أدوية الجدول والرقابة الدوائية",
                DescriptionAr = "إدارة وحوكمة صرف أدوية الجدول والمهدئات مع تقارير التفتيش الصيدلي وسجل الوارد والمنصرف.",
                Category = "الصيدلية والأدوية",
                DefaultValue = false,
                Requires = new List<string> { "feature_pharmacy" },
                OwnedCommands = new List<string>
                {
                    "pharma:saveControlledDispense"
                },
                OwnedPermissions = new List<string>
                {
                    "pharma.controlled.dispense",
                    "pharma.controlled.approve",
                    "pharma.controlled.register_view",
                    "pharma.controlled.view_full"
                }
            });

            Register(new FeatureDefinition
            {
                Key = "feature_prescriptions",
                NameAr = "إدارة وصرف الروشتات الطبية",
                DescriptionAr = "تسجيل بيانات وأرشفة صور الروشتات الطبية ودعم الصرف التلقائي المتكرر.",
                Category = "الصيدلية والأدوية",
                DefaultValue = false,
                Requires = new List<string> { "feature_pharmacy" },
                OwnedCommands = new List<string>
                {
                    "prescriptions:save",
                    "prescriptions:delete"
                },
                OwnedPermissions = new List<string>
                {
                    "prescriptions.manage"
                }
            });

            Register(new FeatureDefinition
            {
                Key = "feature_patient_profiles",
                NameAr = "ملف المريض والأمراض المزمنة",
                DescriptionAr = "متابعة التاريخ العلاجي للمرضى وحساسية المواد الفعالة ومواعيد استحقاق أدوية الأمراض المزمنة.",
                Category = "الصيدلية والأدوية",
                DefaultValue = false,
                Requires = new List<string> { "feature_pharmacy" },
                OwnedCommands = new List<string>
                {
                    "patients:saveProfile",
                    "patients:saveChronicMed",
                    "patients:deleteChronicMed"
                },
                OwnedPermissions = new List<string>
                {
                    "patients.view",
                    "patients.edit"
                }
            });

            Register(new FeatureDefinition
            {
                Key = "feature_insurance",
                NameAr = "التأمين الطبي والتعاقدات",
                DescriptionAr = "إدارة شركات التأمين والنسب والتحملات والمطالبات الشهرية وتتبع التحصيل.",
                Category = "الصيدلية والأدوية",
                DefaultValue = false,
                Requires = new List<string> { "feature_pharmacy" },
                OwnedCommands = new List<string>
                {
                    "insurance:saveCompany",
                    "insurance:deleteCompany",
                    "insurance:saveContract",
                    "insurance:deleteContract",
                    "insurance:saveMember",
                    "insurance:createBatch",
                    "insurance:settleBatch"
                },
                OwnedPermissions = new List<string>
                {
                    "insurance.manage_contracts",
                    "insurance.sell",
                    "insurance.claims.manage",
                    "insurance.claims.settle"
                }
            });

            Register(new FeatureDefinition
            {
                Key = "feature_expiry_returns",
                NameAr = "مرتجع الصلاحية للموزعين والإعدام",
                DescriptionAr = "حساب نوافذ مرتجعات الأدوية للموردين قبل الانتهاء ونسب الاسترداد ومحاضر إعدام البضاعة المنتهية.",
                Category = "المخزون والتشغيلات",
                DefaultValue = false,
                Requires = new List<string> { "feature_expiry_dates" },
                OwnedCommands = new List<string>
                {
                    "pharma:createExpiryReturn",
                    "pharma:writeOffExpiredBatches"
                },
                OwnedPermissions = new List<string>
                {
                    "pharma.expiry_returns.manage"
                }
            });

            Register(new FeatureDefinition
            {
                Key = "feature_drug_reference",
                NameAr = "دليل الأدوية المرجعي",
                DescriptionAr = "قاعدة بيانات مرجعية منفصلة لاستيراد وتحديث أسعار وبيانات الأدوية من الإكسل لسرعة إضافة الأصناف.",
                Category = "الصيدلية والأدوية",
                DefaultValue = false,
                Requires = new List<string> { "feature_pharmacy" },
                OwnedCommands = new List<string>
                {
                    "pharma:confirmDrugReferenceImport",
                    "pharma:clearDrugReference"
                },
                OwnedPermissions = new List<string>
                {
                    "pharma.drug_reference.import"
                }
            });

            Register(new FeatureDefinition
            {
                Key = "feature_drug_interactions",
                NameAr = "محرك التفاعلات والتعارضات الدوائية",
                DescriptionAr = "فحص سريري لحظي لتعارض الأدوية داخل سلة البيع وتحذير الصيدلي قبل إصدار الفاتورة.",
                Category = "الصيدلية والأدوية",
                DefaultValue = true,
                Requires = new List<string> { "feature_pharmacy" },
                OwnedCommands = new List<string>
                {
                    "ddi:save",
                    "ddi:delete",
                    "ddi:importFromExcel"
                },
                OwnedPermissions = new List<string>
                {
                    "pharma.ddi.manage",
                    "pharma.ddi.override"
                }
            });
        }

        private static void Register(FeatureDefinition def)
        {
            _definitions.Add(def);
            _byKey[def.Key] = def;

            if (def.OwnedCommands != null)
            {
                for (int i = 0; i < def.OwnedCommands.Count; i++)
                {
                    string cmd = def.OwnedCommands[i];
                    if (!string.IsNullOrEmpty(cmd))
                    {
                        _commandToFeatureMap[cmd] = def.Key;
                    }
                }
            }
        }

        public static List<FeatureDefinition> GetAllDefinitions()
        {
            return new List<FeatureDefinition>(_definitions);
        }

        public static FeatureDefinition GetDefinition(string key)
        {
            if (string.IsNullOrEmpty(key)) return null;
            FeatureDefinition def;
            if (_byKey.TryGetValue(key, out def))
            {
                return def;
            }
            return null;
        }

        public static string GetFeatureForCommand(string command)
        {
            if (string.IsNullOrEmpty(command)) return null;
            string featureKey;
            if (_commandToFeatureMap.TryGetValue(command, out featureKey))
            {
                return featureKey;
            }
            return null;
        }

        /// <summary>
        /// استثناء استعلامات القراءة التاريخية والتقارير من حظر بوابة الميزات
        /// لضمان إمكانية قراءة وطباعة الفواتير والبيانات القديمة دائماً حتى لو تم قفل الميزة
        /// </summary>
        public static bool IsHistoricalOrReadCommand(string command)
        {
            if (string.IsNullOrEmpty(command)) return false;

            if (command.StartsWith("reports:", StringComparison.OrdinalIgnoreCase)) return true;
            if (command.EndsWith(":get", StringComparison.OrdinalIgnoreCase)) return true;
            if (command.EndsWith(":getAll", StringComparison.OrdinalIgnoreCase)) return true;
            if (command.EndsWith(":search", StringComparison.OrdinalIgnoreCase)) return true;
            if (command.EndsWith(":list", StringComparison.OrdinalIgnoreCase)) return true;
            if (command.EndsWith(":getById", StringComparison.OrdinalIgnoreCase)) return true;
            if (command.EndsWith(":getSummary", StringComparison.OrdinalIgnoreCase)) return true;
            if (command.EndsWith(":getStatement", StringComparison.OrdinalIgnoreCase)) return true;
            if (command.EndsWith(":getLedger", StringComparison.OrdinalIgnoreCase)) return true;
            if (command.EndsWith(":export", StringComparison.OrdinalIgnoreCase)) return true;

            return false;
        }

        /// <summary>
        /// التحقق من تبعيات الميزات عند التفعيل والتعطيل
        /// </summary>
        public static bool ValidateDependencies(string key, bool enabled, Dictionary<string, bool> currentFlags, out string errorMessage)
        {
            errorMessage = null;
            FeatureDefinition def = GetDefinition(key);
            if (def == null) return true;

            if (enabled)
            {
                List<string> missing = new List<string>();
                for (int i = 0; i < def.Requires.Count; i++)
                {
                    string reqKey = def.Requires[i];
                    bool reqEnabled = false;
                    if (currentFlags != null && currentFlags.ContainsKey(reqKey))
                    {
                        reqEnabled = currentFlags[reqKey];
                    }
                    if (!reqEnabled)
                    {
                        FeatureDefinition reqDef = GetDefinition(reqKey);
                        missing.Add(reqDef != null ? reqDef.NameAr : reqKey);
                    }
                }

                if (missing.Count > 0)
                {
                    errorMessage = string.Format("الميزة «{0}» تتطلب أولاً تفعيل الميزات التالية: {1}", def.NameAr, string.Join("، ", missing.ToArray()));
                    return false;
                }
            }
            else
            {
                List<string> dependents = new List<string>();
                var all = GetAllDefinitions();
                for (int i = 0; i < all.Count; i++)
                {
                    var otherDef = all[i];
                    if (string.Equals(otherDef.Key, key, StringComparison.OrdinalIgnoreCase)) continue;

                    bool isOtherEnabled = false;
                    if (currentFlags != null && currentFlags.ContainsKey(otherDef.Key))
                    {
                        isOtherEnabled = currentFlags[otherDef.Key];
                    }

                    if (isOtherEnabled && otherDef.Requires.Contains(key))
                    {
                        dependents.Add(otherDef.NameAr);
                    }
                }

                if (dependents.Count > 0)
                {
                    errorMessage = string.Format("لا يمكن تعطيل الميزة «{0}» لأن الميزات التالية مفعلة وتعتمد عليها: {1}", def.NameAr, string.Join("، ", dependents.ToArray()));
                    return false;
                }
            }

            return true;
        }
    }
}
