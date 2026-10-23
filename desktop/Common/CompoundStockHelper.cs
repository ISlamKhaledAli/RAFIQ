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
        public static string FormatCompoundStock(long stockQuantityMilli, List<ProductUnit> units, string baseUnitName)
        {
            if (string.IsNullOrWhiteSpace(baseUnitName))
            {
                baseUnitName = "قطعة";
            }

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
                    parts.Add(string.Format("{0} {1}", count, u.UnitName));
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
