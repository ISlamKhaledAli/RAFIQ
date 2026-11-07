using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using RafiqPOS.Bridge;
using RafiqPOS.Common;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// فلتر الفترة (dateFrom / dateTo) في سجلات المخزن والمشتريات والموردين وسجل الأسعار:
    /// أيام محلية شاملة الطرفين تُطبَّق في SQL حتى لا تضيع السجلات الأقدم عندما يكون التحميل محدوداً بعدد.
    /// كل التواريخ المخزنة هنا UTC بصيغة ISO ("o") مثل ما تكتبه الشاشات الحقيقية.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S62_DateRangeFiltersTest : S30_Step3BFixtureBase
    {
        // سنة قديمة حتى لا تتداخل مع سجلات "الآن" التي ينشئها الاختبار نفسه
        private const int Year = 2001;

        /// <summary>وقت حائطي محلي → نص UTC بصيغة ISO كما يخزنه النظام</summary>
        private static string UtcIso(int month, int day, int hour, int minute, int second, long extraTicks)
        {
            return UtcIsoInYear(Year, month, day, hour, minute, second, extraTicks);
        }

        private static string UtcIsoInYear(int year, int month, int day, int hour, int minute, int second, long extraTicks)
        {
            DateTime local = new DateTime(year, month, day, hour, minute, second, DateTimeKind.Local).AddTicks(extraTicks);
            return local.ToUniversalTime().ToString("o");
        }

        private static JArray Rows(BridgeResponse res)
        {
            return JArray.FromObject(res.Data);
        }

        private static List<string> Values(JArray rows, string field)
        {
            var list = new List<string>();
            foreach (var row in rows) list.Add(row[field].ToString());
            list.Sort(StringComparer.Ordinal);
            return list;
        }

        private static void AssertSameSet(string[] expected, List<string> actual, string message)
        {
            var sorted = new List<string>(expected);
            sorted.Sort(StringComparer.Ordinal);
            CollectionAssert.AreEqual(sorted, actual, message);
        }

        private static void InsertMovement(string id, string productId, string note, string createdAt)
        {
            Execute(@"INSERT INTO stock_movements (id, product_id, movement_type, quantity_milli, reference_id, reference_type, unit_cost_piasters, note, batch_number, created_at)
                      VALUES (@id, @pid, 'ADJUSTMENT', 1000, NULL, NULL, 500, @note, NULL, @createdAt);",
                "@id", id, "@pid", productId, "@note", note, "@createdAt", createdAt);
        }

        [Test]
        public void LocalDateRange_ConvertsLocalDaysToHalfOpenUtcBounds()
        {
            LocalDateRange none = LocalDateRange.Parse(null, "  ");
            Assert.IsFalse(none.HasBounds);

            LocalDateRange range = LocalDateRange.Parse("2001-03-10", "2001-03-12");
            Assert.AreEqual(new DateTime(2001, 3, 10, 0, 0, 0, DateTimeKind.Local).ToUniversalTime(), range.FromUtc.Value, "بداية يوم من");
            Assert.AreEqual(new DateTime(2001, 3, 13, 0, 0, 0, DateTimeKind.Local).ToUniversalTime(), range.ToExclusiveUtc.Value, "نهاية يوم إلى = بداية اليوم التالي");

            LocalDateRange swapped = LocalDateRange.Parse("2001-03-12", "2001-03-10");
            Assert.AreEqual(range.FromUtc.Value, swapped.FromUtc.Value, "من بعد إلى يتم تبديلهما");
            Assert.AreEqual(range.ToExclusiveUtc.Value, swapped.ToExclusiveUtc.Value);

            LocalDateRange onlyFrom = LocalDateRange.Parse("2001-03-10", null);
            Assert.IsTrue(onlyFrom.FromUtc.HasValue);
            Assert.IsFalse(onlyFrom.ToExclusiveUtc.HasValue);

            LocalDateRange onlyTo = LocalDateRange.Parse("", "2001-03-12");
            Assert.IsFalse(onlyTo.FromUtc.HasValue);
            Assert.IsTrue(onlyTo.ToExclusiveUtc.HasValue);

            Assert.Throws<ArgumentException>(delegate { LocalDateRange.Parse("10/03/2001", null); });
            Assert.Throws<ArgumentException>(delegate { LocalDateRange.Parse(null, "2001-3-1x"); });
        }

        [Test]
        public void StockMovements_DateRange_IncludesBothBoundaryDaysFromMidnightToLastTick()
        {
            var product = CreateProduct("صنف حدود الأيام", 1000, 500, 0);
            InsertMovement("sm_a", product.Id, "A-اليوم السابق 23:59:59", UtcIso(3, 9, 23, 59, 59, 9999999));
            InsertMovement("sm_b", product.Id, "B-بداية يوم من", UtcIso(3, 10, 0, 0, 0, 0));
            InsertMovement("sm_e", product.Id, "E-منتصف الفترة", UtcIso(3, 11, 12, 0, 0, 0));
            InsertMovement("sm_c", product.Id, "C-نهاية يوم إلى", UtcIso(3, 12, 23, 59, 59, 9999999));
            InsertMovement("sm_d", product.Id, "D-اليوم التالي 00:00:00", UtcIso(3, 13, 0, 0, 0, 0));

            var both = Rows(DispatchOk("inventory:getMovements", new JObject { { "productId", product.Id }, { "dateFrom", "2001-03-10" }, { "dateTo", "2001-03-12" }, { "limit", 100 } }));
            AssertSameSet(new[] { "B-بداية يوم من", "C-نهاية يوم إلى", "E-منتصف الفترة" }, Values(both, "note"), "الطرفان شاملان");

            var swapped = Rows(DispatchOk("inventory:getMovements", new JObject { { "productId", product.Id }, { "dateFrom", "2001-03-12" }, { "dateTo", "2001-03-10" }, { "limit", 100 } }));
            AssertSameSet(new[] { "B-بداية يوم من", "C-نهاية يوم إلى", "E-منتصف الفترة" }, Values(swapped, "note"), "من بعد إلى يتم تبديلهما");

            var onlyFrom = Rows(DispatchOk("inventory:getMovements", new JObject { { "productId", product.Id }, { "dateFrom", "2001-03-12" }, { "limit", 100 } }));
            AssertSameSet(new[] { "C-نهاية يوم إلى", "D-اليوم التالي 00:00:00" }, Values(onlyFrom, "note"), "من فقط");

            var onlyTo = Rows(DispatchOk("inventory:getMovements", new JObject { { "productId", product.Id }, { "dateTo", "2001-03-10" }, { "limit", 100 } }));
            AssertSameSet(new[] { "A-اليوم السابق 23:59:59", "B-بداية يوم من" }, Values(onlyTo, "note"), "إلى فقط");

            var sameDay = Rows(DispatchOk("inventory:getMovements", new JObject { { "productId", product.Id }, { "dateFrom", "2001-03-11" }, { "dateTo", "2001-03-11" }, { "limit", 100 } }));
            AssertSameSet(new[] { "E-منتصف الفترة" }, Values(sameDay, "note"), "يوم واحد");

            var unfiltered = Rows(DispatchOk("inventory:getMovements", new JObject { { "productId", product.Id }, { "limit", 100 } }));
            Assert.GreaterOrEqual(unfiltered.Count, 5, "بدون تواريخ السلوك القديم كما هو");
        }

        [Test]
        public void StockMovements_DateRange_IsAppliedInSqlBeforeTheLimit_SoOlderMatchesAreNotLost()
        {
            var product = CreateProduct("صنف حد التحميل", 1000, 500, 0);
            for (int i = 1; i <= 4; i++)
            {
                InsertMovement("sm_new" + i, product.Id, "جديد " + i, UtcIsoInYear(Year + 1, 1, 10 + i, 12, 0, 0, 0));
            }
            InsertMovement("sm_old", product.Id, "قديم", UtcIso(3, 15, 12, 0, 0, 0));

            var capped = Rows(DispatchOk("inventory:getMovements", new JObject { { "productId", product.Id }, { "limit", 3 } }));
            Assert.AreEqual(3, capped.Count);
            CollectionAssert.DoesNotContain(Values(capped, "note"), "قديم", "الحد يقص الأقدم عند غياب الفلتر");

            var ranged = Rows(DispatchOk("inventory:getMovements", new JObject { { "productId", product.Id }, { "dateFrom", "2001-03-15" }, { "dateTo", "2001-03-15" }, { "limit", 3 } }));
            AssertSameSet(new[] { "قديم" }, Values(ranged, "note"), "الفلتر قبل الحد في SQL");
        }

        [Test]
        public void StockMovements_DateRange_CombinesWithTypeAndProduct_AndRejectsMalformedDates()
        {
            var p1 = CreateProduct("صنف أول", 1000, 500, 0);
            var p2 = CreateProduct("صنف ثان", 1000, 500, 0);
            InsertMovement("sm_p1", p1.Id, "p1", UtcIso(3, 11, 12, 0, 0, 0));
            InsertMovement("sm_p2", p2.Id, "p2", UtcIso(3, 11, 12, 0, 0, 0));
            Execute("UPDATE stock_movements SET movement_type = 'SALE' WHERE id = 'sm_p2';");

            var onlyP1Adj = Rows(DispatchOk("inventory:getMovements", new JObject { { "productId", p1.Id }, { "movementType", "ADJUSTMENT" }, { "dateFrom", "2001-03-11" }, { "dateTo", "2001-03-11" } }));
            AssertSameSet(new[] { "p1" }, Values(onlyP1Adj, "note"), "الفترة مع الصنف والنوع معاً");

            var sales = Rows(DispatchOk("inventory:getMovements", new JObject { { "movementType", "SALE" }, { "dateFrom", "2001-03-11" }, { "dateTo", "2001-03-11" } }));
            AssertSameSet(new[] { "p2" }, Values(sales, "note"), "النوع مع الفترة");

            var bad = Dispatch("inventory:getMovements", new JObject { { "dateFrom", "not-a-date" } });
            Assert.IsFalse(bad.Success, "تاريخ بصيغة غير صحيحة يُرفض ولا يُهمل بصمت");
        }

        [Test]
        public void Purchases_DateRange_IncludesBothBoundaryDays_AndKeepsOldBehaviourWithoutDates()
        {
            Execute(@"INSERT INTO purchases (id, invoice_number, invoice_date, total_cost_piasters, net_cost_piasters, created_at, updated_at) VALUES (@id, @no, @d, 1000, 1000, @d, @d);",
                "@id", "pur_a", "@no", 9001, "@d", UtcIso(3, 9, 23, 59, 59, 9999999));
            Execute(@"INSERT INTO purchases (id, invoice_number, invoice_date, total_cost_piasters, net_cost_piasters, created_at, updated_at) VALUES (@id, @no, @d, 1000, 1000, @d, @d);",
                "@id", "pur_b", "@no", 9002, "@d", UtcIso(3, 10, 0, 0, 0, 0));
            Execute(@"INSERT INTO purchases (id, invoice_number, invoice_date, total_cost_piasters, net_cost_piasters, created_at, updated_at) VALUES (@id, @no, @d, 1000, 1000, @d, @d);",
                "@id", "pur_c", "@no", 9003, "@d", UtcIso(3, 12, 23, 59, 59, 9999999));
            Execute(@"INSERT INTO purchases (id, invoice_number, invoice_date, total_cost_piasters, net_cost_piasters, created_at, updated_at) VALUES (@id, @no, @d, 1000, 1000, @d, @d);",
                "@id", "pur_d", "@no", 9004, "@d", UtcIso(3, 13, 0, 0, 0, 0));

            var ranged = Rows(DispatchOk("purchases:getAll", new JObject { { "dateFrom", "2001-03-10" }, { "dateTo", "2001-03-12" }, { "limit", 100 } }));
            AssertSameSet(new[] { "9002", "9003" }, Values(ranged, "invoiceNumber"), "طرفا الفترة شاملان");

            var swapped = Rows(DispatchOk("purchases:getAll", new JObject { { "dateFrom", "2001-03-12" }, { "dateTo", "2001-03-10" }, { "limit", 100 } }));
            AssertSameSet(new[] { "9002", "9003" }, Values(swapped, "invoiceNumber"), "تبديل من وإلى");

            var limited = Rows(DispatchOk("purchases:getAll", new JObject { { "dateFrom", "2001-03-09" }, { "dateTo", "2001-03-09" }, { "limit", 1 } }));
            AssertSameSet(new[] { "9001" }, Values(limited, "invoiceNumber"), "الفلتر قبل الحد");

            var all = Rows(DispatchOk("purchases:getAll", new JObject { { "limit", 100 } }));
            Assert.AreEqual(4, all.Count, "بدون تواريخ تظهر كل الفواتير");
        }

        [Test]
        public void SupplierTransactions_DateRange_IsAppliedInSqlBeforeTheLimit()
        {
            Supplier supplier = DatabaseService.Suppliers.Save(new Supplier { Name = "مورد كشف الحساب", IsActive = true });
            for (int i = 1; i <= 4; i++)
            {
                Execute(@"INSERT INTO supplier_transactions (id, supplier_id, transaction_type, reference_id, amount_piasters, payment_source, balance_after_piasters, notes, created_at)
                          VALUES (@id, @sid, 'PURCHASE_INVOICE', NULL, 1000, 'cash_drawer', 1000, @note, @d);",
                    "@id", "stx_new" + i, "@sid", supplier.Id, "@note", "جديدة " + i, "@d", UtcIsoInYear(Year + 1, 1, 10 + i, 12, 0, 0, 0));
            }
            Execute(@"INSERT INTO supplier_transactions (id, supplier_id, transaction_type, reference_id, amount_piasters, payment_source, balance_after_piasters, notes, created_at)
                      VALUES (@id, @sid, 'PAYMENT', NULL, -500, 'cash_drawer', 500, @note, @d);",
                "@id", "stx_old", "@sid", supplier.Id, "@note", "قديمة", "@d", UtcIso(3, 12, 23, 59, 59, 9999999));
            Execute(@"INSERT INTO supplier_transactions (id, supplier_id, transaction_type, reference_id, amount_piasters, payment_source, balance_after_piasters, notes, created_at)
                      VALUES (@id, @sid, 'PAYMENT', NULL, -500, 'cash_drawer', 0, @note, @d);",
                "@id", "stx_next", "@sid", supplier.Id, "@note", "اليوم التالي", "@d", UtcIso(3, 13, 0, 0, 0, 0));

            var capped = Rows(DispatchOk("suppliers:getTransactions", new JObject { { "supplierId", supplier.Id }, { "limit", 3 } }));
            CollectionAssert.DoesNotContain(Values(capped, "notes"), "قديمة");

            var ranged = Rows(DispatchOk("suppliers:getTransactions", new JObject { { "supplierId", supplier.Id }, { "dateFrom", "2001-03-12" }, { "dateTo", "2001-03-12" }, { "limit", 3 } }));
            AssertSameSet(new[] { "قديمة" }, Values(ranged, "notes"), "آخر لحظة من يوم إلى داخل الفترة واليوم التالي خارجها");
        }

        [Test]
        public void PriceHistory_DateRange_FiltersTheProductLogInSql()
        {
            var product = CreateProduct("صنف سجل الأسعار", 1000, 500, 0);
            Execute(@"INSERT INTO product_price_history (id, product_id, old_price_piasters, new_price_piasters, old_cost_piasters, new_cost_piasters, change_reason, created_at)
                      VALUES ('ph_in', @pid, 1000, 1200, 500, 600, 'داخل', @d);", "@pid", product.Id, "@d", UtcIso(3, 10, 0, 0, 0, 0));
            Execute(@"INSERT INTO product_price_history (id, product_id, old_price_piasters, new_price_piasters, old_cost_piasters, new_cost_piasters, change_reason, created_at)
                      VALUES ('ph_out', @pid, 1200, 1300, 600, 650, 'خارج', @d);", "@pid", product.Id, "@d", UtcIso(3, 9, 23, 59, 59, 9999999));

            var ranged = Rows(DispatchOk("products:getPriceHistory", new JObject { { "productId", product.Id }, { "dateFrom", "2001-03-10" }, { "dateTo", "2001-03-10" }, { "limit", 50 } }));
            AssertSameSet(new[] { "داخل" }, Values(ranged, "changeReason"), "بداية اليوم 00:00:00 داخل الفترة وقبلها بثانية خارجها");

            var all = Rows(DispatchOk("products:getPriceHistory", new JObject { { "productId", product.Id }, { "limit", 50 } }));
            Assert.GreaterOrEqual(all.Count, 2, "بدون تواريخ يظهر السجل كاملاً");
        }
    }
}
