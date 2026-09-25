using System;
using System.Collections.Generic;
using RafiqPOS.Models;

namespace RafiqPOS.Services
{
    public static class StoreCatalogSeeder
    {
        public static int GetCatalogCount(string templateId)
        {
            var list = GetCatalogForTemplate(templateId);
            return list != null ? list.Count : 0;
        }

        public static List<TemplateProductItem> GetCatalogForTemplate(string templateId)
        {
            if (string.IsNullOrEmpty(templateId))
            {
                templateId = "supermarket";
            }

            templateId = templateId.Trim().ToLowerInvariant();

            if (templateId == "phones_electronics")
            {
                return GetPhonesElectronicsCatalog();
            }
            else if (templateId == "dairy_bakery")
            {
                return GetDairyBakeryCatalog();
            }
            else if (templateId == "produce_butchery")
            {
                return GetProduceButcheryCatalog();
            }
            else if (templateId == "stationery_gifts" || templateId == "accessories_gifts")
            {
                return GetStationeryGiftsCatalog();
            }
            else if (templateId == "spices_roastery")
            {
                return GetSpicesRoasteryCatalog();
            }
            else if (templateId == "clothing_apparel")
            {
                return GetClothingApparelCatalog();
            }
            else if (templateId == "general_grocery")
            {
                return GetGeneralGroceryCatalog();
            }
            else
            {
                // Default: supermarket
                return GetSupermarketCatalog();
            }
        }

        // 1. سوبرماركت ومواد غذائية (Supermarket & Groceries)
        private static List<TemplateProductItem> GetSupermarketCatalog()
        {
            var list = new List<TemplateProductItem>();

            // ألبان وأجبان
            list.Add(new TemplateProductItem { Name = "لبن جهينة كامل الدسم 1 لتر", Barcode = "6223001234011", CategoryName = "ألبان وأجبان", PricePiasters = 4200, CostPiasters = 3500, StockQuantityMilli = 50000, MinStockQuantityMilli = 10000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "جبنة دومتي فيتا 500 جم", Barcode = "6223001234028", CategoryName = "ألبان وأجبان", PricePiasters = 3800, CostPiasters = 3100, StockQuantityMilli = 40000, MinStockQuantityMilli = 8000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "جبنة عبور لاند تتراباك 250 جم", Barcode = "6223001234035", CategoryName = "ألبان وأجبان", PricePiasters = 2000, CostPiasters = 1650, StockQuantityMilli = 60000, MinStockQuantityMilli = 12000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "جبنة رومي قديمة فاخرة كجم", Barcode = "6223001234042", CategoryName = "ألبان وأجبان", PricePiasters = 32000, CostPiasters = 26000, StockQuantityMilli = 20000, MinStockQuantityMilli = 5000, Unit = "kg" });
            list.Add(new TemplateProductItem { Name = "زبادي جهينة طبيعي 105 جم", Barcode = "6223001234059", CategoryName = "ألبان وأجبان", PricePiasters = 850, CostPiasters = 650, StockQuantityMilli = 45000, MinStockQuantityMilli = 10000, Unit = "piece" });

            // معلبات وبقوليات وزيوت
            list.Add(new TemplateProductItem { Name = "شاي العروسة ناعم 250 جم", Barcode = "6224005544015", CategoryName = "معلبات وبقوليات", PricePiasters = 5500, CostPiasters = 4700, StockQuantityMilli = 30000, MinStockQuantityMilli = 6000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "شاي ليبتون أحمر 100 فتلة", Barcode = "6224005544022", CategoryName = "معلبات وبقوليات", PricePiasters = 7500, CostPiasters = 6300, StockQuantityMilli = 25000, MinStockQuantityMilli = 5000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "سكر حر معبأ الضحى 1 كجم", Barcode = "6224005544039", CategoryName = "معلبات وبقوليات", PricePiasters = 3500, CostPiasters = 3100, StockQuantityMilli = 80000, MinStockQuantityMilli = 15000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "أرز مصري الضحى فاخر 1 كجم", Barcode = "6224005544046", CategoryName = "معلبات وبقوليات", PricePiasters = 3600, CostPiasters = 3000, StockQuantityMilli = 70000, MinStockQuantityMilli = 15000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "مكرونة الملكة خواتم 400 جم", Barcode = "6224005544053", CategoryName = "معلبات وبقوليات", PricePiasters = 1500, CostPiasters = 1150, StockQuantityMilli = 90000, MinStockQuantityMilli = 20000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "مكرونة روجينا فرن 400 جم", Barcode = "6224005544060", CategoryName = "معلبات وبقوليات", PricePiasters = 2200, CostPiasters = 1800, StockQuantityMilli = 50000, MinStockQuantityMilli = 10000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "صلصة طماطم هاينز 360 جم", Barcode = "6224005544077", CategoryName = "معلبات وبقوليات", PricePiasters = 2500, CostPiasters = 1950, StockQuantityMilli = 40000, MinStockQuantityMilli = 8000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "تونة صن شاين قطع سهلة الفتح 185 جم", Barcode = "6224005544084", CategoryName = "معلبات وبقوليات", PricePiasters = 6500, CostPiasters = 5300, StockQuantityMilli = 35000, MinStockQuantityMilli = 8000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "فول مدمس حدائق كاليفورنيا 400 جم", Barcode = "6224005544091", CategoryName = "معلبات وبقوليات", PricePiasters = 2200, CostPiasters = 1750, StockQuantityMilli = 40000, MinStockQuantityMilli = 10000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "زيت ذرة عافية بلس 800 مل", Barcode = "6225001122013", CategoryName = "معلبات وبقوليات", PricePiasters = 8500, CostPiasters = 7400, StockQuantityMilli = 35000, MinStockQuantityMilli = 8000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "زيت عباد الشمس كريستال 800 مل", Barcode = "6225001122020", CategoryName = "معلبات وبقوليات", PricePiasters = 7800, CostPiasters = 6800, StockQuantityMilli = 40000, MinStockQuantityMilli = 8000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "سمن كريستال أبيض 700 جم", Barcode = "6225001122037", CategoryName = "معلبات وبقوليات", PricePiasters = 8000, CostPiasters = 6900, StockQuantityMilli = 30000, MinStockQuantityMilli = 6000, Unit = "piece" });

            // منظفات وعناية منزلية
            list.Add(new TemplateProductItem { Name = "مسحوق غسيل إريال أوتوماتيك 2.5 كجم", Barcode = "6226009988011", CategoryName = "منظفات وعناية منزلية", PricePiasters = 18500, CostPiasters = 15500, StockQuantityMilli = 20000, MinStockQuantityMilli = 5000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "صابون سائل بريل ليمون 1 لتر", Barcode = "6226009988028", CategoryName = "منظفات وعناية منزلية", PricePiasters = 3800, CostPiasters = 3000, StockQuantityMilli = 35000, MinStockQuantityMilli = 8000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "كلوركس مبيض أبيض 950 مل", Barcode = "6226009988035", CategoryName = "منظفات وعناية منزلية", PricePiasters = 2500, CostPiasters = 1900, StockQuantityMilli = 30000, MinStockQuantityMilli = 6000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "صابون تواليت لوكس 120 جم", Barcode = "6226009988042", CategoryName = "منظفات وعناية منزلية", PricePiasters = 1500, CostPiasters = 1150, StockQuantityMilli = 50000, MinStockQuantityMilli = 10000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "معجون أسنان سيجنال تو 75 مل", Barcode = "6226009988059", CategoryName = "منظفات وعناية منزلية", PricePiasters = 2800, CostPiasters = 2100, StockQuantityMilli = 25000, MinStockQuantityMilli = 5000, Unit = "piece" });

            // مشروبات وعصائر
            list.Add(new TemplateProductItem { Name = "مياه معدنية بركة 1.5 لتر", Barcode = "6227003344013", CategoryName = "مشروبات وعصائر", PricePiasters = 800, CostPiasters = 550, StockQuantityMilli = 80000, MinStockQuantityMilli = 15000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "مياه معدنية دساني 600 مل", Barcode = "6227003344020", CategoryName = "مشروبات وعصائر", PricePiasters = 500, CostPiasters = 350, StockQuantityMilli = 100000, MinStockQuantityMilli = 20000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "كوكاكولا كانز 330 مل", Barcode = "6227003344037", CategoryName = "مشروبات وعصائر", PricePiasters = 1500, CostPiasters = 1150, StockQuantityMilli = 60000, MinStockQuantityMilli = 12000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "بيبسي كانز 330 مل", Barcode = "6227003344044", CategoryName = "مشروبات وعصائر", PricePiasters = 1500, CostPiasters = 1150, StockQuantityMilli = 60000, MinStockQuantityMilli = 12000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "عصير بيتي مانجو 200 مل", Barcode = "6227003344051", CategoryName = "مشروبات وعصائر", PricePiasters = 700, CostPiasters = 500, StockQuantityMilli = 50000, MinStockQuantityMilli = 10000, Unit = "piece" });

            // بسكويت وحلويات
            list.Add(new TemplateProductItem { Name = "شيبسي بطاطس عائلي طماطم 85 جم", Barcode = "6228004455018", CategoryName = "بسكويت وحلويات", PricePiasters = 1500, CostPiasters = 1150, StockQuantityMilli = 50000, MinStockQuantityMilli = 10000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "دوريتوس حار حلو 75 جم", Barcode = "6228004455025", CategoryName = "بسكويت وحلويات", PricePiasters = 1500, CostPiasters = 1150, StockQuantityMilli = 45000, MinStockQuantityMilli = 10000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "بسكويت أوريو كلاسيك 6 قطع", Barcode = "6228004455032", CategoryName = "بسكويت وحلويات", PricePiasters = 1000, CostPiasters = 750, StockQuantityMilli = 60000, MinStockQuantityMilli = 12000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "بسكويت شاي أولكر 12 قطعة", Barcode = "6228004455049", CategoryName = "بسكويت وحلويات", PricePiasters = 700, CostPiasters = 500, StockQuantityMilli = 70000, MinStockQuantityMilli = 15000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "شيكولاتة جالاكسي ناعمة 40 جم", Barcode = "6228004455056", CategoryName = "بسكويت وحلويات", PricePiasters = 3000, CostPiasters = 2300, StockQuantityMilli = 40000, MinStockQuantityMilli = 8000, Unit = "piece" });

            // مخبوزات وعام
            list.Add(new TemplateProductItem { Name = "عيش فينو كيس 5 رغيف طازج", Barcode = "6229007788013", CategoryName = "مخبوزات", PricePiasters = 1000, CostPiasters = 700, StockQuantityMilli = 30000, MinStockQuantityMilli = 6000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "بقسماط مطحون الضحى 500 جم", Barcode = "6229007788020", CategoryName = "مخبوزات", PricePiasters = 2500, CostPiasters = 1900, StockQuantityMilli = 25000, MinStockQuantityMilli = 5000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "كيس تسوق كبير للمحل", Barcode = "6229007788037", CategoryName = "معلبات وبقوليات", PricePiasters = 150, CostPiasters = 80, StockQuantityMilli = 200000, MinStockQuantityMilli = 30000, Unit = "piece" });

            return list;
        }

        // 2. محلات هواتف وموبايل وإلكترونيات (Phones & Electronics)
        private static List<TemplateProductItem> GetPhonesElectronicsCatalog()
        {
            var list = new List<TemplateProductItem>();

            // كابلات وشواحن
            list.Add(new TemplateProductItem { Name = "كابل شحن سريع Type-C إلى Type-C Anker 60W", Barcode = "6971100110015", CategoryName = "كابلات وشواحن", PricePiasters = 12000, CostPiasters = 8000, StockQuantityMilli = 25000, MinStockQuantityMilli = 5000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "كابل شحن Type-C إلى USB Joyroom سريع", Barcode = "6971100110022", CategoryName = "كابلات وشواحن", PricePiasters = 6500, CostPiasters = 3500, StockQuantityMilli = 30000, MinStockQuantityMilli = 6000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "كابل شحن Lightning آيفون سريع معتمد", Barcode = "6971100110039", CategoryName = "كابلات وشواحن", PricePiasters = 8500, CostPiasters = 4500, StockQuantityMilli = 25000, MinStockQuantityMilli = 5000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "رأس شاحن سريع 20W PD Type-C", Barcode = "6971100110046", CategoryName = "كابلات وشواحن", PricePiasters = 18000, CostPiasters = 11000, StockQuantityMilli = 20000, MinStockQuantityMilli = 4000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "رأس شاحن سوبر فاست 33W شاومي/سامسونج", Barcode = "6971100110053", CategoryName = "كابلات وشواحن", PricePiasters = 25000, CostPiasters = 16000, StockQuantityMilli = 15000, MinStockQuantityMilli = 3000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "شاحن سيارة سريع مخرجين 30W Metal", Barcode = "6971100110060", CategoryName = "كابلات وشواحن", PricePiasters = 9500, CostPiasters = 5500, StockQuantityMilli = 18000, MinStockQuantityMilli = 4000, Unit = "piece" });

            // سماعات وصوتيات
            list.Add(new TemplateProductItem { Name = "سماعة بلوتوث لاسلكية Earbuds Pro", Barcode = "6972200220011", CategoryName = "سماعات وصوتيات", PricePiasters = 35000, CostPiasters = 22000, StockQuantityMilli = 12000, MinStockQuantityMilli = 3000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "سماعة رقبة رياضية بلوتوث Magnetic", Barcode = "6972200220028", CategoryName = "سماعات وصوتيات", PricePiasters = 22000, CostPiasters = 13500, StockQuantityMilli = 15000, MinStockQuantityMilli = 3000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "سماعة أذن سلكية AUX مدخل 3.5 ملم صوت نقي", Barcode = "6972200220035", CategoryName = "سماعات وصوتيات", PricePiasters = 4500, CostPiasters = 2000, StockQuantityMilli = 40000, MinStockQuantityMilli = 8000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "سماعة سلكية مدخل Type-C ديجيتال", Barcode = "6972200220042", CategoryName = "سماعات وصوتيات", PricePiasters = 7500, CostPiasters = 4000, StockQuantityMilli = 25000, MinStockQuantityMilli = 5000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "صب بلوتوث صغير محمول ضد الصدمات", Barcode = "6972200220059", CategoryName = "سماعات وصوتيات", PricePiasters = 16000, CostPiasters = 9500, StockQuantityMilli = 10000, MinStockQuantityMilli = 2000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "وصلة تحويل صوت Type-C إلى AUX", Barcode = "6972200220066", CategoryName = "سماعات وصوتيات", PricePiasters = 3500, CostPiasters = 1500, StockQuantityMilli = 30000, MinStockQuantityMilli = 6000, Unit = "piece" });

            // لاصقات حماية وشاشات
            list.Add(new TemplateProductItem { Name = "لاصقة حماية شاشة زجاج 9D عالي الصلابة", Barcode = "6973300330017", CategoryName = "لاصقات حماية وشاشات", PricePiasters = 4000, CostPiasters = 1200, StockQuantityMilli = 60000, MinStockQuantityMilli = 15000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "لاصقة حماية شاشة خصوصية سيراميك ملقوف", Barcode = "6973300330024", CategoryName = "لاصقات حماية وشاشات", PricePiasters = 6000, CostPiasters = 2000, StockQuantityMilli = 45000, MinStockQuantityMilli = 10000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "لاصقة حماية عدسات كاميرا خلفية معدنية", Barcode = "6973300330031", CategoryName = "لاصقات حماية وشاشات", PricePiasters = 3000, CostPiasters = 1000, StockQuantityMilli = 35000, MinStockQuantityMilli = 8000, Unit = "piece" });

            // جرابات وحافظات
            list.Add(new TemplateProductItem { Name = "جراب سيليكون شفاف ماج سيف مضاد للصدمات", Barcode = "6974400440013", CategoryName = "جرابات وحافظات", PricePiasters = 6500, CostPiasters = 2500, StockQuantityMilli = 40000, MinStockQuantityMilli = 8000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "جراب ظهر كربوني أسود ضد الانزلاق", Barcode = "6974400440020", CategoryName = "جرابات وحافظات", PricePiasters = 5000, CostPiasters = 2000, StockQuantityMilli = 35000, MinStockQuantityMilli = 7000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "جراب جلد قلاب مغناطيسي متكامل", Barcode = "6974400440037", CategoryName = "جرابات وحافظات", PricePiasters = 9000, CostPiasters = 4500, StockQuantityMilli = 20000, MinStockQuantityMilli = 4000, Unit = "piece" });

            // باور بانك وبطاريات
            list.Add(new TemplateProductItem { Name = "باور بانك 10,000 مللي أمبير شحن سريع", Barcode = "6975500550019", CategoryName = "باور بانك وبطاريات", PricePiasters = 42000, CostPiasters = 29000, StockQuantityMilli = 10000, MinStockQuantityMilli = 2000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "باور بانك 20,000 مللي أمبير شحن فائق 22.5W", Barcode = "6975500550026", CategoryName = "باور بانك وبطاريات", PricePiasters = 68000, CostPiasters = 48000, StockQuantityMilli = 8000, MinStockQuantityMilli = 2000, Unit = "piece" });

            // كروت ميموري وفلاشات
            list.Add(new TemplateProductItem { Name = "كارت ميموري كينجستون 32 جيجا Class 10", Barcode = "6976600660015", CategoryName = "كروت ميموري وفلاشات", PricePiasters = 11000, CostPiasters = 7500, StockQuantityMilli = 20000, MinStockQuantityMilli = 5000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "كارت ميموري سان ديسك 64 جيجا Ultra", Barcode = "6976600660022", CategoryName = "كروت ميموري وفلاشات", PricePiasters = 16500, CostPiasters = 11500, StockQuantityMilli = 18000, MinStockQuantityMilli = 4000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "فلاشة كينجستون 32 جيجا معدن USB 3.2", Barcode = "6976600660039", CategoryName = "كروت ميموري وفلاشات", PricePiasters = 13000, CostPiasters = 8500, StockQuantityMilli = 20000, MinStockQuantityMilli = 5000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "فلاشة مزدوجة Type-C & USB 64 جيجا", Barcode = "6976600660046", CategoryName = "كروت ميموري وفلاشات", PricePiasters = 22000, CostPiasters = 14500, StockQuantityMilli = 12000, MinStockQuantityMilli = 3000, Unit = "piece" });

            // صيانة وخدمات
            list.Add(new TemplateProductItem { Name = "حامل موبايل مغناطيسي لتابلوه السيارة", Barcode = "6977700770011", CategoryName = "صيانة وخدمات سريعة", PricePiasters = 7000, CostPiasters = 3500, StockQuantityMilli = 25000, MinStockQuantityMilli = 5000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "رينج لايت مع حامل ثلاثي للبث والتصوير", Barcode = "6977700770028", CategoryName = "صيانة وخدمات سريعة", PricePiasters = 19000, CostPiasters = 12000, StockQuantityMilli = 8000, MinStockQuantityMilli = 2000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "مصاريف صيانة وتركيب شاشة/بطارية", Barcode = "6978800880017", CategoryName = "صيانة وخدمات سريعة", PricePiasters = 5000, CostPiasters = 1000, StockQuantityMilli = 100000, MinStockQuantityMilli = 1000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "تنظيف سوكيت الشحن والسماعة", Barcode = "6978800880024", CategoryName = "صيانة وخدمات سريعة", PricePiasters = 2500, CostPiasters = 500, StockQuantityMilli = 100000, MinStockQuantityMilli = 1000, Unit = "piece" });

            return list;
        }

        // 3. مكتبات وأدوات مدرسية وهدايا (Stationery & Gifts)
        private static List<TemplateProductItem> GetStationeryGiftsCatalog()
        {
            var list = new List<TemplateProductItem>();

            // طباعة وتصوير
            list.Add(new TemplateProductItem { Name = "باكت ورق تصوير A4 دبل إيه Double A 80 جم", Barcode = "8851100110012", CategoryName = "طباعة وتصوير مستندات", PricePiasters = 21000, CostPiasters = 18000, StockQuantityMilli = 15000, MinStockQuantityMilli = 3000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "باكت ورق تصوير A4 مالتي أوفيس 75 جم", Barcode = "8851100110029", CategoryName = "طباعة وتصوير مستندات", PricePiasters = 17500, CostPiasters = 15000, StockQuantityMilli = 20000, MinStockQuantityMilli = 4000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "تصوير مستند ورقة واحدة وجه", Barcode = "8851100110036", CategoryName = "طباعة وتصوير مستندات", PricePiasters = 150, CostPiasters = 50, StockQuantityMilli = 100000, MinStockQuantityMilli = 1000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "تصوير مستند وجهين", Barcode = "8851100110043", CategoryName = "طباعة وتصوير مستندات", PricePiasters = 250, CostPiasters = 80, StockQuantityMilli = 100000, MinStockQuantityMilli = 1000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "طباعة ورق ألوان ليزر فاخرة", Barcode = "8851100110050", CategoryName = "طباعة وتصوير مستندات", PricePiasters = 600, CostPiasters = 250, StockQuantityMilli = 100000, MinStockQuantityMilli = 1000, Unit = "piece" });

            // أدوات كتابة وأقلام
            list.Add(new TemplateProductItem { Name = "قلم جاف أزرق روتو 0.7 ملم", Barcode = "8852200220018", CategoryName = "أدوات كتابة وأقلام", PricePiasters = 600, CostPiasters = 420, StockQuantityMilli = 80000, MinStockQuantityMilli = 15000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "قلم جاف بريكس أزرق ناعم", Barcode = "8852200220025", CategoryName = "أدوات كتابة وأقلام", PricePiasters = 500, CostPiasters = 350, StockQuantityMilli = 90000, MinStockQuantityMilli = 20000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "قلم جاف يوني بول كروي ياباني أصلي", Barcode = "8852200220032", CategoryName = "أدوات كتابة وأقلام", PricePiasters = 3000, CostPiasters = 2200, StockQuantityMilli = 30000, MinStockQuantityMilli = 6000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "طقم أقلام سنون 0.5 ملم مع علبة سنون", Barcode = "8852200220049", CategoryName = "أدوات كتابة وأقلام", PricePiasters = 2500, CostPiasters = 1600, StockQuantityMilli = 35000, MinStockQuantityMilli = 7000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "طقم أقلام ماركر فسفوري تظليل 4 ألوان", Barcode = "8852200220056", CategoryName = "أدوات كتابة وأقلام", PricePiasters = 3500, CostPiasters = 2200, StockQuantityMilli = 25000, MinStockQuantityMilli = 5000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "قلم تصحيح حبر كوريكتور سائل", Barcode = "8852200220063", CategoryName = "أدوات كتابة وأقلام", PricePiasters = 1500, CostPiasters = 950, StockQuantityMilli = 40000, MinStockQuantityMilli = 8000, Unit = "piece" });

            // كشاكيل ودفاتر
            list.Add(new TemplateProductItem { Name = "كشكول سلك كبير 80 ورقة مربعات/مسطر", Barcode = "8853300330014", CategoryName = "كشاكيل ودفاتر", PricePiasters = 2500, CostPiasters = 1750, StockQuantityMilli = 40000, MinStockQuantityMilli = 8000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "كشكول سلك فاخر 140 ورقة مقسم فواصل", Barcode = "8853300330021", CategoryName = "كشاكيل ودفاتر", PricePiasters = 4500, CostPiasters = 3200, StockQuantityMilli = 25000, MinStockQuantityMilli = 5000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "كراسة رسم كانسون مقاس وسط", Barcode = "8853300330038", CategoryName = "كشاكيل ودفاتر", PricePiasters = 3000, CostPiasters = 2100, StockQuantityMilli = 30000, MinStockQuantityMilli = 6000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "كراس لغة إنجليزية 28 ورقة", Barcode = "8853300330045", CategoryName = "كشاكيل ودفاتر", PricePiasters = 800, CostPiasters = 550, StockQuantityMilli = 50000, MinStockQuantityMilli = 10000, Unit = "piece" });

            // أدوات هندسية ومدرسية
            list.Add(new TemplateProductItem { Name = "طقم أدوات هندسية متكامل برجل ومثلثات", Barcode = "8854400440010", CategoryName = "أدوات هندسية ومدرسية", PricePiasters = 3500, CostPiasters = 2200, StockQuantityMilli = 25000, MinStockQuantityMilli = 5000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "مسطرة حديد 30 سم غير قابلة للكسر", Barcode = "8854400440027", CategoryName = "أدوات هندسية ومدرسية", PricePiasters = 1500, CostPiasters = 850, StockQuantityMilli = 40000, MinStockQuantityMilli = 8000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "براية معدنية ألمانية فاخرة", Barcode = "8854400440034", CategoryName = "أدوات هندسية ومدرسية", PricePiasters = 1000, CostPiasters = 600, StockQuantityMilli = 45000, MinStockQuantityMilli = 9000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "ممحاة فابر كاستل بيضاء كبيرة", Barcode = "8854400440041", CategoryName = "أدوات هندسية ومدرسية", PricePiasters = 800, CostPiasters = 500, StockQuantityMilli = 60000, MinStockQuantityMilli = 12000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "صمغ جلو ستيك يو هيد UHU أصلي", Barcode = "8854400440058", CategoryName = "أدوات هندسية ومدرسية", PricePiasters = 2000, CostPiasters = 1350, StockQuantityMilli = 35000, MinStockQuantityMilli = 7000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "علبة ألوان خشبية فابر كاستل 12 لون", Barcode = "8854400440065", CategoryName = "أدوات هندسية ومدرسية", PricePiasters = 4500, CostPiasters = 3100, StockQuantityMilli = 25000, MinStockQuantityMilli = 5000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "آلة حاسبة علمية كاسيو fx-991", Barcode = "8855500550016", CategoryName = "أدوات هندسية ومدرسية", PricePiasters = 45000, CostPiasters = 34000, StockQuantityMilli = 5000, MinStockQuantityMilli = 1000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "بطارية إنرجايزر قلم AA طقم قطعتين", Barcode = "8856600660012", CategoryName = "أدوات هندسية ومدرسية", PricePiasters = 3500, CostPiasters = 2400, StockQuantityMilli = 30000, MinStockQuantityMilli = 6000, Unit = "piece" });

            // ألعاب وهدايا
            list.Add(new TemplateProductItem { Name = "كيس هدايا كرتون فاخر مقاس كبير", Barcode = "8857700770018", CategoryName = "ألعاب وهدايا", PricePiasters = 1500, CostPiasters = 800, StockQuantityMilli = 40000, MinStockQuantityMilli = 8000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "صندوق هدايا كرتون مقوى مع فيونكة", Barcode = "8857700770025", CategoryName = "ألعاب وهدايا", PricePiasters = 3500, CostPiasters = 1800, StockQuantityMilli = 20000, MinStockQuantityMilli = 4000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "دبدوب هدية قطيفة متوسط ناعم", Barcode = "8857700770032", CategoryName = "ألعاب وهدايا", PricePiasters = 12000, CostPiasters = 7500, StockQuantityMilli = 10000, MinStockQuantityMilli = 2000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "مكعب روبيك سحري سرعة", Barcode = "8857700770049", CategoryName = "ألعاب وهدايا", PricePiasters = 4500, CostPiasters = 2500, StockQuantityMilli = 20000, MinStockQuantityMilli = 4000, Unit = "piece" });

            return list;
        }

        // 4. ألبان ومخبوزات ومعلبات (Dairy & Bakery)
        private static List<TemplateProductItem> GetDairyBakeryCatalog()
        {
            var list = new List<TemplateProductItem>();

            // ألبان سائبة ومعبأة
            list.Add(new TemplateProductItem { Name = "لبن جاموسي طازج فلاحي كجم", Barcode = "6221101100118", CategoryName = "ألبان سائبة ومعبأة", PricePiasters = 3200, CostPiasters = 2600, StockQuantityMilli = 60000, MinStockQuantityMilli = 10000, Unit = "kg" });
            list.Add(new TemplateProductItem { Name = "لبن بقري طازج كجم", Barcode = "6221101100224", CategoryName = "ألبان سائبة ومعبأة", PricePiasters = 2800, CostPiasters = 2300, StockQuantityMilli = 40000, MinStockQuantityMilli = 8000, Unit = "kg" });
            list.Add(new TemplateProductItem { Name = "زبادي بلدي طازج بالفخار/كوب كبير", Barcode = "6221101100330", CategoryName = "ألبان سائبة ومعبأة", PricePiasters = 900, CostPiasters = 680, StockQuantityMilli = 50000, MinStockQuantityMilli = 10000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "قشطة بلدي فلاحي طازجة كجم", Barcode = "6221102200771", CategoryName = "ألبان سائبة ومعبأة", PricePiasters = 22000, CostPiasters = 17500, StockQuantityMilli = 15000, MinStockQuantityMilli = 3000, Unit = "kg" });
            list.Add(new TemplateProductItem { Name = "زبدة بلدي جاموسي كجم", Barcode = "6221102200887", CategoryName = "ألبان سائبة ومعبأة", PricePiasters = 24000, CostPiasters = 19500, StockQuantityMilli = 20000, MinStockQuantityMilli = 4000, Unit = "kg" });

            // أجبان بيضاء ومطبوخة
            list.Add(new TemplateProductItem { Name = "جبنة قريش فلاحي كجم", Barcode = "6221102200115", CategoryName = "أجبان بيضاء ومطبوخة", PricePiasters = 7500, CostPiasters = 6200, StockQuantityMilli = 30000, MinStockQuantityMilli = 6000, Unit = "kg" });
            list.Add(new TemplateProductItem { Name = "جبنة براميلي فلفل دمياطي كجم", Barcode = "6221102200221", CategoryName = "أجبان بيضاء ومطبوخة", PricePiasters = 14500, CostPiasters = 12000, StockQuantityMilli = 25000, MinStockQuantityMilli = 5000, Unit = "kg" });
            list.Add(new TemplateProductItem { Name = "جبنة إسطنبولي حادقة كجم", Barcode = "6221102200337", CategoryName = "أجبان بيضاء ومطبوخة", PricePiasters = 14000, CostPiasters = 11500, StockQuantityMilli = 20000, MinStockQuantityMilli = 4000, Unit = "kg" });
            list.Add(new TemplateProductItem { Name = "جبنة رومي قديمة بطارخ كجم", Barcode = "6221102200443", CategoryName = "أجبان بيضاء ومطبوخة", PricePiasters = 32000, CostPiasters = 26500, StockQuantityMilli = 20000, MinStockQuantityMilli = 4000, Unit = "kg" });
            list.Add(new TemplateProductItem { Name = "جبنة شيدر مستوردة كجم", Barcode = "6221102200559", CategoryName = "أجبان بيضاء ومطبوخة", PricePiasters = 28000, CostPiasters = 23000, StockQuantityMilli = 15000, MinStockQuantityMilli = 3000, Unit = "kg" });
            list.Add(new TemplateProductItem { Name = "جبنة موتزاريلا مبشورة طبيعي 500 جم", Barcode = "6221102200665", CategoryName = "أجبان بيضاء ومطبوخة", PricePiasters = 7500, CostPiasters = 5800, StockQuantityMilli = 30000, MinStockQuantityMilli = 6000, Unit = "piece" });

            // بيض ومستلزمات
            list.Add(new TemplateProductItem { Name = "طبق بيض أحمر مزارع 30 بيضة", Barcode = "6221103300112", CategoryName = "بيض ومستلزمات", PricePiasters = 16500, CostPiasters = 14500, StockQuantityMilli = 25000, MinStockQuantityMilli = 5000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "طبق بيض بلدي 30 بيضة", Barcode = "6221103300228", CategoryName = "بيض ومستلزمات", PricePiasters = 17500, CostPiasters = 15500, StockQuantityMilli = 20000, MinStockQuantityMilli = 4000, Unit = "piece" });

            // مخبوزات طازجة
            list.Add(new TemplateProductItem { Name = "عيش فينو ممتاز كيس 10 أرغفة", Barcode = "6221104400119", CategoryName = "مخبوزات طازجة", PricePiasters = 1500, CostPiasters = 1150, StockQuantityMilli = 40000, MinStockQuantityMilli = 8000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "عيش بلدي مدعم كيس 5 أرغفة", Barcode = "6221104400225", CategoryName = "مخبوزات طازجة", PricePiasters = 750, CostPiasters = 500, StockQuantityMilli = 50000, MinStockQuantityMilli = 10000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "عيش توست أبيض فاخر ريتش بيك", Barcode = "6221104400331", CategoryName = "مخبوزات طازجة", PricePiasters = 4200, CostPiasters = 3300, StockQuantityMilli = 20000, MinStockQuantityMilli = 4000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "بقسماط سمسم أصابع كجم", Barcode = "6221104400447", CategoryName = "مخبوزات طازجة", PricePiasters = 6500, CostPiasters = 4800, StockQuantityMilli = 25000, MinStockQuantityMilli = 5000, Unit = "kg" });
            list.Add(new TemplateProductItem { Name = "قرص طرية سادة فلاحي كجم", Barcode = "6221104400553", CategoryName = "مخبوزات طازجة", PricePiasters = 7000, CostPiasters = 5000, StockQuantityMilli = 20000, MinStockQuantityMilli = 4000, Unit = "kg" });
            list.Add(new TemplateProductItem { Name = "كيكة إنجليزي فانيليا وشيكولاتة", Barcode = "6221104400669", CategoryName = "مخبوزات طازجة", PricePiasters = 3500, CostPiasters = 2400, StockQuantityMilli = 15000, MinStockQuantityMilli = 3000, Unit = "piece" });

            // معلبات وعسل
            list.Add(new TemplateProductItem { Name = "عسل نحل زهور حبة البركة 500 جم امتنان", Barcode = "6221105500116", CategoryName = "معلبات وعسل", PricePiasters = 8500, CostPiasters = 6500, StockQuantityMilli = 18000, MinStockQuantityMilli = 4000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "عسل أسود قصب مصري فاخر 1 كجم", Barcode = "6221105500222", CategoryName = "معلبات وعسل", PricePiasters = 4500, CostPiasters = 3200, StockQuantityMilli = 25000, MinStockQuantityMilli = 5000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "طحينة سمسم بيضاء فاخرة 500 جم", Barcode = "6221105500338", CategoryName = "معلبات وعسل", PricePiasters = 6500, CostPiasters = 4800, StockQuantityMilli = 20000, MinStockQuantityMilli = 4000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "حلاوة طحينية الرشيدي الميزان 500 جم", Barcode = "6221105500444", CategoryName = "معلبات وعسل", PricePiasters = 5500, CostPiasters = 4200, StockQuantityMilli = 25000, MinStockQuantityMilli = 5000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "مخلل بلدي مشكل بوليف كجم", Barcode = "6221105500550", CategoryName = "معلبات وعسل", PricePiasters = 3500, CostPiasters = 2200, StockQuantityMilli = 30000, MinStockQuantityMilli = 6000, Unit = "kg" });

            return list;
        }

        // 5. خضار وفاكهة ومجزر (Produce, Fruit & Meat)
        private static List<TemplateProductItem> GetProduceButcheryCatalog()
        {
            var list = new List<TemplateProductItem>();

            // خضروات طازجة
            list.Add(new TemplateProductItem { Name = "طماطم بلدي طازجة سلك كجم", Barcode = "2001", CategoryName = "خضروات طازجة", PricePiasters = 1500, CostPiasters = 1000, StockQuantityMilli = 80000, MinStockQuantityMilli = 15000, Unit = "kg" });
            list.Add(new TemplateProductItem { Name = "بطاطس كارا تحمير كجم", Barcode = "2002", CategoryName = "خضروات طازجة", PricePiasters = 1800, CostPiasters = 1250, StockQuantityMilli = 90000, MinStockQuantityMilli = 20000, Unit = "kg" });
            list.Add(new TemplateProductItem { Name = "بصل أحمر بلدي كجم", Barcode = "2003", CategoryName = "خضروات طازجة", PricePiasters = 1400, CostPiasters = 950, StockQuantityMilli = 70000, MinStockQuantityMilli = 15000, Unit = "kg" });
            list.Add(new TemplateProductItem { Name = "بصل أبيض تخزين كجم", Barcode = "2004", CategoryName = "خضروات طازجة", PricePiasters = 1500, CostPiasters = 1000, StockQuantityMilli = 60000, MinStockQuantityMilli = 12000, Unit = "kg" });
            list.Add(new TemplateProductItem { Name = "خيار بلدي صوب كجم", Barcode = "2005", CategoryName = "خضروات طازجة", PricePiasters = 1600, CostPiasters = 1100, StockQuantityMilli = 50000, MinStockQuantityMilli = 10000, Unit = "kg" });
            list.Add(new TemplateProductItem { Name = "ليمون بلدي أصفر كجم", Barcode = "2006", CategoryName = "خضروات طازجة", PricePiasters = 2500, CostPiasters = 1700, StockQuantityMilli = 30000, MinStockQuantityMilli = 6000, Unit = "kg" });
            list.Add(new TemplateProductItem { Name = "فلفل رومي أخضر بلدي كجم", Barcode = "2007", CategoryName = "خضروات طازجة", PricePiasters = 2000, CostPiasters = 1400, StockQuantityMilli = 35000, MinStockQuantityMilli = 7000, Unit = "kg" });
            list.Add(new TemplateProductItem { Name = "فلفل حار بلدي كجم", Barcode = "2008", CategoryName = "خضروات طازجة", PricePiasters = 2200, CostPiasters = 1500, StockQuantityMilli = 25000, MinStockQuantityMilli = 5000, Unit = "kg" });
            list.Add(new TemplateProductItem { Name = "باذنجان رومي قلي كجم", Barcode = "2009", CategoryName = "خضروات طازجة", PricePiasters = 1200, CostPiasters = 750, StockQuantityMilli = 40000, MinStockQuantityMilli = 8000, Unit = "kg" });
            list.Add(new TemplateProductItem { Name = "كوسة بلدي طازجة كجم", Barcode = "2010", CategoryName = "خضروات طازجة", PricePiasters = 1800, CostPiasters = 1200, StockQuantityMilli = 35000, MinStockQuantityMilli = 7000, Unit = "kg" });
            list.Add(new TemplateProductItem { Name = "جزر سكري كجم", Barcode = "2011", CategoryName = "خضروات طازجة", PricePiasters = 1500, CostPiasters = 900, StockQuantityMilli = 40000, MinStockQuantityMilli = 8000, Unit = "kg" });
            list.Add(new TemplateProductItem { Name = "ثوم بلدي أحمر كجم", Barcode = "2012", CategoryName = "خضروات طازجة", PricePiasters = 4500, CostPiasters = 3200, StockQuantityMilli = 20000, MinStockQuantityMilli = 4000, Unit = "kg" });

            // ورقيات وأعشاب
            list.Add(new TemplateProductItem { Name = "حزمة بقدونس/كزبرة/شبت", Barcode = "2013", CategoryName = "ورقيات وأعشاب", PricePiasters = 200, CostPiasters = 100, StockQuantityMilli = 100000, MinStockQuantityMilli = 10000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "حزمة جرجير بلدي طازج", Barcode = "2014", CategoryName = "ورقيات وأعشاب", PricePiasters = 200, CostPiasters = 100, StockQuantityMilli = 80000, MinStockQuantityMilli = 10000, Unit = "piece" });

            // فواكه موسمية
            list.Add(new TemplateProductItem { Name = "موز بلدي سكري كجم", Barcode = "2015", CategoryName = "فواكه موسمية", PricePiasters = 2000, CostPiasters = 1450, StockQuantityMilli = 50000, MinStockQuantityMilli = 10000, Unit = "kg" });
            list.Add(new TemplateProductItem { Name = "تفاح أحمر سكري كجم", Barcode = "2016", CategoryName = "فواكه موسمية", PricePiasters = 4500, CostPiasters = 3400, StockQuantityMilli = 40000, MinStockQuantityMilli = 8000, Unit = "kg" });
            list.Add(new TemplateProductItem { Name = "تفاح أصفر جولدن كجم", Barcode = "2017", CategoryName = "فواكه موسمية", PricePiasters = 5000, CostPiasters = 3800, StockQuantityMilli = 30000, MinStockQuantityMilli = 6000, Unit = "kg" });
            list.Add(new TemplateProductItem { Name = "برتقال بلدي عصير كجم", Barcode = "2018", CategoryName = "فواكه موسمية", PricePiasters = 1200, CostPiasters = 750, StockQuantityMilli = 50000, MinStockQuantityMilli = 10000, Unit = "kg" });
            list.Add(new TemplateProductItem { Name = "برتقال بصرة للأكل كجم", Barcode = "2019", CategoryName = "فواكه موسمية", PricePiasters = 1500, CostPiasters = 1000, StockQuantityMilli = 45000, MinStockQuantityMilli = 9000, Unit = "kg" });
            list.Add(new TemplateProductItem { Name = "فراولة بلدي فاخرة كجم", Barcode = "2020", CategoryName = "فواكه موسمية", PricePiasters = 3000, CostPiasters = 2100, StockQuantityMilli = 30000, MinStockQuantityMilli = 6000, Unit = "kg" });
            list.Add(new TemplateProductItem { Name = "جوافة بناتي سكرية كجم", Barcode = "2021", CategoryName = "فواكه موسمية", PricePiasters = 2500, CostPiasters = 1650, StockQuantityMilli = 35000, MinStockQuantityMilli = 7000, Unit = "kg" });

            // لحوم ودواجن ومجمدات
            list.Add(new TemplateProductItem { Name = "لحم بقري بلدي كندوز كجم", Barcode = "2022", CategoryName = "لحوم ودواجن", PricePiasters = 38000, CostPiasters = 32000, StockQuantityMilli = 25000, MinStockQuantityMilli = 5000, Unit = "kg" });
            list.Add(new TemplateProductItem { Name = "لحم مفروم بلدي خالي الدسم كجم", Barcode = "2023", CategoryName = "لحوم ودواجن", PricePiasters = 36000, CostPiasters = 30000, StockQuantityMilli = 20000, MinStockQuantityMilli = 4000, Unit = "kg" });
            list.Add(new TemplateProductItem { Name = "كبدة بلدي طازجة كجم", Barcode = "2024", CategoryName = "لحوم ودواجن", PricePiasters = 40000, CostPiasters = 34000, StockQuantityMilli = 15000, MinStockQuantityMilli = 3000, Unit = "kg" });
            list.Add(new TemplateProductItem { Name = "سجق بلدي متبل خلطة خاصة كجم", Barcode = "2025", CategoryName = "لحوم ودواجن", PricePiasters = 32000, CostPiasters = 25000, StockQuantityMilli = 20000, MinStockQuantityMilli = 4000, Unit = "kg" });
            list.Add(new TemplateProductItem { Name = "دجاج أبيض طازج مذبوح كجم", Barcode = "2026", CategoryName = "لحوم ودواجن", PricePiasters = 9500, CostPiasters = 8200, StockQuantityMilli = 40000, MinStockQuantityMilli = 8000, Unit = "kg" });
            list.Add(new TemplateProductItem { Name = "صدور دجاج بانيه طازجة كجم", Barcode = "2027", CategoryName = "لحوم ودواجن", PricePiasters = 21000, CostPiasters = 17500, StockQuantityMilli = 30000, MinStockQuantityMilli = 6000, Unit = "kg" });
            list.Add(new TemplateProductItem { Name = "أوراك دجاج طازجة كجم", Barcode = "2028", CategoryName = "لحوم ودواجن", PricePiasters = 11000, CostPiasters = 9200, StockQuantityMilli = 35000, MinStockQuantityMilli = 7000, Unit = "kg" });
            list.Add(new TemplateProductItem { Name = "برجر بقري مجمد كيس 8 قطع", Barcode = "2029", CategoryName = "مجمدات", PricePiasters = 7500, CostPiasters = 5500, StockQuantityMilli = 20000, MinStockQuantityMilli = 4000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "كفتة لحم مجمدة 400 جم", Barcode = "2030", CategoryName = "مجمدات", PricePiasters = 6500, CostPiasters = 4800, StockQuantityMilli = 20000, MinStockQuantityMilli = 4000, Unit = "piece" });

            return list;
        }

        // 6. عطارة ومحامص وبن وتوابل (Spices & Coffee)
        private static List<TemplateProductItem> GetSpicesRoasteryCatalog()
        {
            var list = new List<TemplateProductItem>();

            // بن ومشروبات ساخنة
            list.Add(new TemplateProductItem { Name = "ثمن بن محوج مخصوص وسط مطحون طازج", Barcode = "6224401100114", CategoryName = "بن ومشروبات ساخنة", PricePiasters = 4500, CostPiasters = 3400, StockQuantityMilli = 35000, MinStockQuantityMilli = 7000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "ربع بن سادة فاتح أرابيكا ممتاز", Barcode = "6224401100220", CategoryName = "بن ومشروبات ساخنة", PricePiasters = 7000, CostPiasters = 5200, StockQuantityMilli = 30000, MinStockQuantityMilli = 6000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "ربع بن محوج دبل هيل غامق", Barcode = "6224401100336", CategoryName = "بن ومشروبات ساخنة", PricePiasters = 9500, CostPiasters = 7200, StockQuantityMilli = 25000, MinStockQuantityMilli = 5000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "كيس بن فرنساوي بندق 200 جم", Barcode = "6224401100442", CategoryName = "بن ومشروبات ساخنة", PricePiasters = 6500, CostPiasters = 4800, StockQuantityMilli = 20000, MinStockQuantityMilli = 4000, Unit = "piece" });

            // توابل وبهارات
            list.Add(new TemplateProductItem { Name = "كمون بلدي مطحون 100 جم", Barcode = "6224402200111", CategoryName = "توابل وبهارات", PricePiasters = 2500, CostPiasters = 1750, StockQuantityMilli = 40000, MinStockQuantityMilli = 8000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "فلفل أسود حب برازيلي 100 جم", Barcode = "6224402200227", CategoryName = "توابل وبهارات", PricePiasters = 3500, CostPiasters = 2400, StockQuantityMilli = 35000, MinStockQuantityMilli = 7000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "فلفل أسود ناعم مطحون 100 جم", Barcode = "6224402200333", CategoryName = "توابل وبهارات", PricePiasters = 3500, CostPiasters = 2400, StockQuantityMilli = 35000, MinStockQuantityMilli = 7000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "كزبرة ناشفة مطحونة 100 جم", Barcode = "6224402200449", CategoryName = "توابل وبهارات", PricePiasters = 1500, CostPiasters = 950, StockQuantityMilli = 45000, MinStockQuantityMilli = 9000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "بابريكا مدخنة إسباني 100 جم", Barcode = "6224402200555", CategoryName = "توابل وبهارات", PricePiasters = 2500, CostPiasters = 1650, StockQuantityMilli = 30000, MinStockQuantityMilli = 6000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "شطة حمراء سوداني حارة 100 جم", Barcode = "6224402200661", CategoryName = "توابل وبهارات", PricePiasters = 1800, CostPiasters = 1100, StockQuantityMilli = 35000, MinStockQuantityMilli = 7000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "بهارات لحمة مشكلة سبع بهارات 100 جم", Barcode = "6224402200777", CategoryName = "توابل وبهارات", PricePiasters = 3000, CostPiasters = 1900, StockQuantityMilli = 30000, MinStockQuantityMilli = 6000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "بهارات فراخ وتتبيلة شوي 100 جم", Barcode = "6224402200883", CategoryName = "توابل وبهارات", PricePiasters = 2800, CostPiasters = 1800, StockQuantityMilli = 30000, MinStockQuantityMilli = 6000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "قرفة عيدان سيلاني 100 جم", Barcode = "6224402200999", CategoryName = "توابل وبهارات", PricePiasters = 3500, CostPiasters = 2200, StockQuantityMilli = 25000, MinStockQuantityMilli = 5000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "حبهان (هيل) حب أخضر نمرة واحد 50 جم", Barcode = "6224402201002", CategoryName = "توابل وبهارات", PricePiasters = 5000, CostPiasters = 3600, StockQuantityMilli = 20000, MinStockQuantityMilli = 4000, Unit = "piece" });

            // مكسرات ومحامص
            list.Add(new TemplateProductItem { Name = "لب سوبر أسمر محمص 250 جم", Barcode = "6224403300118", CategoryName = "مكسرات ومحامص", PricePiasters = 3500, CostPiasters = 2500, StockQuantityMilli = 40000, MinStockQuantityMilli = 8000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "لب سوري دوار الشمس محمص 250 جم", Barcode = "6224403300224", CategoryName = "مكسرات ومحامص", PricePiasters = 2500, CostPiasters = 1700, StockQuantityMilli = 50000, MinStockQuantityMilli = 10000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "لب أبيض قرع محمص 250 جم", Barcode = "6224403300330", CategoryName = "مكسرات ومحامص", PricePiasters = 5500, CostPiasters = 3900, StockQuantityMilli = 30000, MinStockQuantityMilli = 6000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "فول سوداني بقشره محمص 250 جم", Barcode = "6224403300446", CategoryName = "مكسرات ومحامص", PricePiasters = 2000, CostPiasters = 1350, StockQuantityMilli = 45000, MinStockQuantityMilli = 9000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "فول سوداني مقشر مملح ومحمص 250 جم", Barcode = "6224403300552", CategoryName = "مكسرات ومحامص", PricePiasters = 2500, CostPiasters = 1650, StockQuantityMilli = 40000, MinStockQuantityMilli = 8000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "كاجو جامبو محمص ومملح 250 جم", Barcode = "6224403300668", CategoryName = "مكسرات ومحامص", PricePiasters = 14500, CostPiasters = 11000, StockQuantityMilli = 15000, MinStockQuantityMilli = 3000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "فستق أمريكي محمص ومملح 250 جم", Barcode = "6224403300774", CategoryName = "مكسرات ومحامص", PricePiasters = 16500, CostPiasters = 12500, StockQuantityMilli = 12000, MinStockQuantityMilli = 3000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "لوز إسباني محمص 250 جم", Barcode = "6224403300880", CategoryName = "مكسرات ومحامص", PricePiasters = 13500, CostPiasters = 10000, StockQuantityMilli = 15000, MinStockQuantityMilli = 3000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "عين جمل أمريكي مقشر 250 جم", Barcode = "6224403300996", CategoryName = "مكسرات ومحامص", PricePiasters = 12000, CostPiasters = 9000, StockQuantityMilli = 15000, MinStockQuantityMilli = 3000, Unit = "piece" });

            // أعشاب طبيعية وياميش
            list.Add(new TemplateProductItem { Name = "كركديه أسواني لوزة فاخر 250 جم", Barcode = "6224404400115", CategoryName = "أعشاب طبيعية", PricePiasters = 4500, CostPiasters = 3000, StockQuantityMilli = 30000, MinStockQuantityMilli = 6000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "يانسون بلدي نقي 100 جم", Barcode = "6224404400221", CategoryName = "أعشاب طبيعية", PricePiasters = 2000, CostPiasters = 1300, StockQuantityMilli = 35000, MinStockQuantityMilli = 7000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "حلبة حصى بلدي 250 جم", Barcode = "6224404400337", CategoryName = "أعشاب طبيعية", PricePiasters = 1800, CostPiasters = 1150, StockQuantityMilli = 30000, MinStockQuantityMilli = 6000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "نعناع بلدي مجفف ناعم 100 جم", Barcode = "6224404400443", CategoryName = "أعشاب طبيعية", PricePiasters = 1500, CostPiasters = 900, StockQuantityMilli = 40000, MinStockQuantityMilli = 8000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "تمر مجدول فاخر علبة 1 كجم", Barcode = "6224405500112", CategoryName = "ياميش وتمور", PricePiasters = 12000, CostPiasters = 8500, StockQuantityMilli = 20000, MinStockQuantityMilli = 4000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "تين مجفف سوري باكت 400 جم", Barcode = "6224405500228", CategoryName = "ياميش وتمور", PricePiasters = 7500, CostPiasters = 5500, StockQuantityMilli = 15000, MinStockQuantityMilli = 3000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "قمر الدين سوري فاخر لفة 400 جم", Barcode = "6224405500334", CategoryName = "ياميش وتمور", PricePiasters = 4500, CostPiasters = 3200, StockQuantityMilli = 25000, MinStockQuantityMilli = 5000, Unit = "piece" });

            return list;
        }

        // 7. ملابس وأحذية وأزياء (Clothing & Apparel)
        private static List<TemplateProductItem> GetClothingApparelCatalog()
        {
            var list = new List<TemplateProductItem>();

            // ملابس رجالي
            list.Add(new TemplateProductItem { Name = "تيشيرت قطن سادة رجالي رقبة دائرية", Barcode = "6225501100111", CategoryName = "ملابس رجالي", PricePiasters = 15000, CostPiasters = 9500, StockQuantityMilli = 30000, MinStockQuantityMilli = 6000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "تيشيرت بولو رجالي كاجوال خامة بيكيه", Barcode = "6225501100227", CategoryName = "ملابس رجالي", PricePiasters = 22000, CostPiasters = 14000, StockQuantityMilli = 25000, MinStockQuantityMilli = 5000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "قميص كاجوال قطن سليم فيت رجالي", Barcode = "6225501100333", CategoryName = "ملابس رجالي", PricePiasters = 28000, CostPiasters = 18000, StockQuantityMilli = 20000, MinStockQuantityMilli = 4000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "قميص كلاسيك أبيض للمناسبات والبدل", Barcode = "6225501100449", CategoryName = "ملابس رجالي", PricePiasters = 32000, CostPiasters = 21000, StockQuantityMilli = 15000, MinStockQuantityMilli = 3000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "بنطلون جينز أزرق غامق مريح", Barcode = "6225501100555", CategoryName = "ملابس رجالي", PricePiasters = 35000, CostPiasters = 23000, StockQuantityMilli = 20000, MinStockQuantityMilli = 4000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "بنطلون جبردين كلاسيك كحلي", Barcode = "6225501100661", CategoryName = "ملابس رجالي", PricePiasters = 30000, CostPiasters = 19500, StockQuantityMilli = 18000, MinStockQuantityMilli = 4000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "سويت شيرت ميلتون خريفي شبابي", Barcode = "6225501100777", CategoryName = "ملابس رجالي", PricePiasters = 32000, CostPiasters = 20000, StockQuantityMilli = 15000, MinStockQuantityMilli = 3000, Unit = "piece" });

            // ملابس حريمي
            list.Add(new TemplateProductItem { Name = "فستان كاجوال حريمي مطبوع", Barcode = "6225502200118", CategoryName = "ملابس حريمي", PricePiasters = 38000, CostPiasters = 24500, StockQuantityMilli = 12000, MinStockQuantityMilli = 3000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "بلوزة حرير شيفون حريمي أنيقة", Barcode = "6225502200224", CategoryName = "ملابس حريمي", PricePiasters = 26000, CostPiasters = 16500, StockQuantityMilli = 15000, MinStockQuantityMilli = 3000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "بنطلون جينز حريمي هاي ويست", Barcode = "6225502200330", CategoryName = "ملابس حريمي", PricePiasters = 32000, CostPiasters = 21000, StockQuantityMilli = 16000, MinStockQuantityMilli = 3000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "عباية خروج سوداء قماش كريب فاخر", Barcode = "6225502200446", CategoryName = "ملابس حريمي", PricePiasters = 55000, CostPiasters = 36000, StockQuantityMilli = 10000, MinStockQuantityMilli = 2000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "بيجامة قطن بناتي/حريمي صيفي", Barcode = "6225502200552", CategoryName = "ملابس حريمي", PricePiasters = 24000, CostPiasters = 15000, StockQuantityMilli = 18000, MinStockQuantityMilli = 4000, Unit = "piece" });

            // ملابس أطفال
            list.Add(new TemplateProductItem { Name = "تيشيرت أطفال قطن رسومات كرتونية", Barcode = "6225503300115", CategoryName = "ملابس أطفال", PricePiasters = 11000, CostPiasters = 6500, StockQuantityMilli = 25000, MinStockQuantityMilli = 5000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "ترنج أطفال رياضي قطعتين", Barcode = "6225503300221", CategoryName = "ملابس أطفال", PricePiasters = 26000, CostPiasters = 16500, StockQuantityMilli = 15000, MinStockQuantityMilli = 3000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "شورت أطفال جينز مريح", Barcode = "6225503300337", CategoryName = "ملابس أطفال", PricePiasters = 14000, CostPiasters = 8500, StockQuantityMilli = 20000, MinStockQuantityMilli = 4000, Unit = "piece" });

            // أحذية وحقائب
            list.Add(new TemplateProductItem { Name = "حذاء رياضي كوتشي كاجوال خفيف", Barcode = "6225504400112", CategoryName = "أحذية وحقائب", PricePiasters = 32000, CostPiasters = 20000, StockQuantityMilli = 15000, MinStockQuantityMilli = 3000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "حذاء كلاسيك جلد طبيعي رجالي أسود", Barcode = "6225504400228", CategoryName = "أحذية وحقائب", PricePiasters = 45000, CostPiasters = 29000, StockQuantityMilli = 10000, MinStockQuantityMilli = 2000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "شبشب سليبر مريح خروج/منزل", Barcode = "6225504400334", CategoryName = "أحذية وحقائب", PricePiasters = 9500, CostPiasters = 5000, StockQuantityMilli = 25000, MinStockQuantityMilli = 5000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "شنطة يد حريمي كروس جلد راقية", Barcode = "6225504400440", CategoryName = "أحذية وحقائب", PricePiasters = 28000, CostPiasters = 17500, StockQuantityMilli = 12000, MinStockQuantityMilli = 3000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "محفظة جيب جلد طبيعي رجالي", Barcode = "6225504400556", CategoryName = "أحذية وحقائب", PricePiasters = 12000, CostPiasters = 6500, StockQuantityMilli = 20000, MinStockQuantityMilli = 4000, Unit = "piece" });

            // إكسسوارات ملابس
            list.Add(new TemplateProductItem { Name = "حزام جلد طبيعي إبزيم معدني", Barcode = "6225505500119", CategoryName = "إكسسوارات ملابس", PricePiasters = 8500, CostPiasters = 4500, StockQuantityMilli = 20000, MinStockQuantityMilli = 4000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "طرحة شيفون سادة ألوان متعددة", Barcode = "6225505500225", CategoryName = "إكسسوارات ملابس", PricePiasters = 6500, CostPiasters = 3500, StockQuantityMilli = 35000, MinStockQuantityMilli = 7000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "شال صوف شتوي حريمي دافئ", Barcode = "6225505500331", CategoryName = "إكسسوارات ملابس", PricePiasters = 13000, CostPiasters = 7500, StockQuantityMilli = 15000, MinStockQuantityMilli = 3000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "شراب قطن مصري طقم 3 قطع", Barcode = "6225505500447", CategoryName = "إكسسوارات ملابس", PricePiasters = 4500, CostPiasters = 2500, StockQuantityMilli = 40000, MinStockQuantityMilli = 8000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "كيس ملابس هدايا سميك فاخر", Barcode = "6225505500553", CategoryName = "إكسسوارات ملابس", PricePiasters = 500, CostPiasters = 220, StockQuantityMilli = 50000, MinStockQuantityMilli = 10000, Unit = "piece" });

            return list;
        }

        // 8. بقالة ومحل تجاري عام (General Grocery)
        private static List<TemplateProductItem> GetGeneralGroceryCatalog()
        {
            var list = new List<TemplateProductItem>();

            list.Add(new TemplateProductItem { Name = "لبن جهينة كامل الدسم 1 لتر", Barcode = "6223001234011", CategoryName = "أغذية ومشروبات", PricePiasters = 4200, CostPiasters = 3500, StockQuantityMilli = 40000, MinStockQuantityMilli = 8000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "جبنة دومتي فيتا 500 جم", Barcode = "6223001234028", CategoryName = "أغذية ومشروبات", PricePiasters = 3800, CostPiasters = 3100, StockQuantityMilli = 35000, MinStockQuantityMilli = 7000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "أرز مصري فاخر 1 كجم", Barcode = "6224005544046", CategoryName = "أغذية ومشروبات", PricePiasters = 3500, CostPiasters = 2900, StockQuantityMilli = 50000, MinStockQuantityMilli = 10000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "سكر حر معبأ 1 كجم", Barcode = "6224005544039", CategoryName = "أغذية ومشروبات", PricePiasters = 3500, CostPiasters = 3100, StockQuantityMilli = 60000, MinStockQuantityMilli = 12000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "زيت خليط هدية 700 مل", Barcode = "6225001122044", CategoryName = "أغذية ومشروبات", PricePiasters = 5500, CostPiasters = 4600, StockQuantityMilli = 40000, MinStockQuantityMilli = 8000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "شاي العروسة ناعم 40 جم", Barcode = "6224005544107", CategoryName = "أغذية ومشروبات", PricePiasters = 1200, CostPiasters = 950, StockQuantityMilli = 60000, MinStockQuantityMilli = 12000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "مكرونة الملكة 400 جم", Barcode = "6224005544053", CategoryName = "أغذية ومشروبات", PricePiasters = 1500, CostPiasters = 1150, StockQuantityMilli = 60000, MinStockQuantityMilli = 12000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "صلصة طماطم هاينز ظرف 35 جم", Barcode = "6224005544114", CategoryName = "أغذية ومشروبات", PricePiasters = 400, CostPiasters = 280, StockQuantityMilli = 80000, MinStockQuantityMilli = 15000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "تونة مفتتة دولفين 140 جم", Barcode = "6224005544121", CategoryName = "أغذية ومشروبات", PricePiasters = 3500, CostPiasters = 2700, StockQuantityMilli = 30000, MinStockQuantityMilli = 6000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "مياه معدنية بركة 1.5 لتر", Barcode = "6227003344013", CategoryName = "أغذية ومشروبات", PricePiasters = 800, CostPiasters = 550, StockQuantityMilli = 60000, MinStockQuantityMilli = 12000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "مياه معدنية 600 مل", Barcode = "6227003344020", CategoryName = "أغذية ومشروبات", PricePiasters = 500, CostPiasters = 350, StockQuantityMilli = 80000, MinStockQuantityMilli = 15000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "كوكاكولا كانز 330 مل", Barcode = "6227003344037", CategoryName = "أغذية ومشروبات", PricePiasters = 1500, CostPiasters = 1150, StockQuantityMilli = 50000, MinStockQuantityMilli = 10000, Unit = "piece" });

            list.Add(new TemplateProductItem { Name = "شيبسي عائلي طماطم", Barcode = "6228004455018", CategoryName = "حلويات وتسالي", PricePiasters = 1500, CostPiasters = 1150, StockQuantityMilli = 45000, MinStockQuantityMilli = 10000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "شيبسي حجم وسط جبنة متبلة", Barcode = "6228004455063", CategoryName = "حلويات وتسالي", PricePiasters = 1000, CostPiasters = 750, StockQuantityMilli = 50000, MinStockQuantityMilli = 10000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "بسكويت أوريو 6 قطع", Barcode = "6228004455032", CategoryName = "حلويات وتسالي", PricePiasters = 1000, CostPiasters = 750, StockQuantityMilli = 55000, MinStockQuantityMilli = 10000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "بسكويت لوكس شاي", Barcode = "6228004455070", CategoryName = "حلويات وتسالي", PricePiasters = 500, CostPiasters = 350, StockQuantityMilli = 60000, MinStockQuantityMilli = 12000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "لوليتا وعصائر مثلجة", Barcode = "6228004455087", CategoryName = "حلويات وتسالي", PricePiasters = 300, CostPiasters = 150, StockQuantityMilli = 50000, MinStockQuantityMilli = 10000, Unit = "piece" });

            list.Add(new TemplateProductItem { Name = "صابون غسيل أواني بريل 500 مل", Barcode = "6226009988066", CategoryName = "منظفات", PricePiasters = 2000, CostPiasters = 1500, StockQuantityMilli = 30000, MinStockQuantityMilli = 6000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "مسحوق تايد يدوي كيس 500 جم", Barcode = "6226009988073", CategoryName = "منظفات", PricePiasters = 2500, CostPiasters = 1950, StockQuantityMilli = 30000, MinStockQuantityMilli = 6000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "صابون تواليت لوكس 120 جم", Barcode = "6226009988042", CategoryName = "منظفات", PricePiasters = 1500, CostPiasters = 1150, StockQuantityMilli = 40000, MinStockQuantityMilli = 8000, Unit = "piece" });

            list.Add(new TemplateProductItem { Name = "علبة سجائر كليوباترا بوكس", Barcode = "6229900010014", CategoryName = "دخان وسجائر", PricePiasters = 4000, CostPiasters = 3600, StockQuantityMilli = 50000, MinStockQuantityMilli = 10000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "علبة سجائر إل إم أزرق", Barcode = "6229900010021", CategoryName = "دخان وسجائر", PricePiasters = 7200, CostPiasters = 6700, StockQuantityMilli = 30000, MinStockQuantityMilli = 6000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "ولاعة إلكترونية عادية", Barcode = "6229900010038", CategoryName = "دخان وسجائر", PricePiasters = 500, CostPiasters = 250, StockQuantityMilli = 60000, MinStockQuantityMilli = 10000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "علبة كبريت فراشة", Barcode = "6229900010045", CategoryName = "عام", PricePiasters = 100, CostPiasters = 50, StockQuantityMilli = 100000, MinStockQuantityMilli = 20000, Unit = "piece" });
            list.Add(new TemplateProductItem { Name = "كيس تسوق عادي", Barcode = "6229900010052", CategoryName = "عام", PricePiasters = 100, CostPiasters = 40, StockQuantityMilli = 150000, MinStockQuantityMilli = 25000, Unit = "piece" });

            return list;
        }
    }
}
