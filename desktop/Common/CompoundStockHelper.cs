using System;
using System.Collections.Generic;
using RafiqPOS.Models;

namespace RafiqPOS.Common
{
    /// <summary>
    /// دالة العرض المشترك للمخزون المركب (Compound Stock Display)
    /// تعرض الرصيد بصيغة مركبة («10 علب و 7 أقراص») مع تمييز العبوات المفتوحة (Feature #183 / Task 183-6)
    /// </summary>
    public static class CompoundStockHelper
    {
        public static string LocalizeUnit(string unit)
        {
            if (string.IsNullOrWhiteSpace(unit)) return "قطعة";
            string lower = unit.Trim().ToLowerInvariant();
            if (lower == "piece" || lower == "pieces" || lower == "pcs" || lower == "pc" || lower == "item" || lower == "unit") return "قطعة";
            if (lower == "box" || lower == "boxes") return "علبة";
            if (lower == "carton" || lower == "cartons" || lower == "ctn") return "كرتونة";
            if (lower == "pack" || lower == "packs" || lower == "packet") return "باكت";
            if (lower == "strip" || lower == "strips") return "شريط";
            if (lower == "tablet" || lower == "tablets" || lower == "pill" || lower == "pills" || lower == "tab") return "قرص";
            if (lower == "capsule" || lower == "capsules" || lower == "cap") return "كبسولة";
            if (lower == "kg" || lower == "kilo" || lower == "kilogram") return "كجم";
            if (lower == "g" || lower == "gram" || lower == "gm") return "جم";
            if (lower == "bottle" || lower == "bottles") return "زجاجة";
            if (lower == "can" || lower == "cans") return "كانز";
            if (lower == "liter" || lower == "l" || lower == "liters") return "لتر";
            if (lower == "meter" || lower == "m" || lower == "meters") return "متر";
            if (lower == "roll" || lower == "rolls") return "بكرة";
            if (lower == "bag" || lower == "bags") return "كيس";
            if (lower == "dozen" || lower == "dozens") return "دستة";
            return unit.Trim();
        }

        public static string FormatCompoundStock(long stockQuantityMilli, List<ProductUnit> units, string baseUnitName)
        {
            baseUnitName = LocalizeUnit(baseUnitName);

            long totalBasePieces = stockQuantityMilli / 1000;
            if (stockQuantityMilli < 0)
            {
                return string.Format("{0} {1}", totalBasePieces, baseUnitName);
            }

            if (units == null || units.Count <= 1)
            {
                return string.Format("{0} {1}", totalBasePieces, baseUnitName);
            }

            // Sort non-base units descending by conversion factor
            var sortedUnits = new List<ProductUnit>();
            for (int i = 0; i < units.Count; i++)
            {
                var u = units[i];
                if (u != null && u.ConversionFactor > 1)
                {
                    sortedUnits.Add(u);
                }
            }

            if (sortedUnits.Count == 0)
            {
                return string.Format("{0} {1}", totalBasePieces, baseUnitName);
            }

            sortedUnits.Sort(delegate(ProductUnit a, ProductUnit b)
            {
                return b.ConversionFactor.CompareTo(a.ConversionFactor);
            });

            long remaining = totalBasePieces;
            var parts = new List<string>();

            for (int i = 0; i < sortedUnits.Count; i++)
            {
                var u = sortedUnits[i];
                if (u.ConversionFactor <= 0) continue;
                long count = remaining / u.ConversionFactor;
                if (count > 0)
                {
                    parts.Add(string.Format("{0} {1}", count, LocalizeUnit(u.UnitName)));
                    remaining = remaining % u.ConversionFactor;
                }
            }

            if (remaining > 0 || parts.Count == 0)
            {
                parts.Add(string.Format("{0} {1}", remaining, baseUnitName));
            }

            return string.Join(" و ", parts.ToArray());
        }

        public static bool IsOpenPackage(long stockQuantityMilli, List<ProductUnit> units)
        {
            if (units == null || units.Count == 0 || stockQuantityMilli <= 0) return false;
            long totalBasePieces = stockQuantityMilli / 1000;

            int packageFactor = 0;
            for (int i = 0; i < units.Count; i++)
            {
                var u = units[i];
                if (u != null && u.ConversionFactor > 1)
                {
                    if (packageFactor == 0 || u.ConversionFactor < packageFactor)
                    {
                        packageFactor = u.ConversionFactor;
                    }
                }
            }

            if (packageFactor <= 1) return false;
            return (totalBasePieces % packageFactor) != 0;
        }
    }
}
