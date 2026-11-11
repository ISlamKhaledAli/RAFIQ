using System;
using System.Collections.Generic;
using System.Text;
using System.Text.RegularExpressions;
using NUnit.Framework;
using RafiqPOS.Data;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// المسح بالباركود على كتالوج كبير: الاستعلام يجب أن يبدأ من تطابقات الباركود (فهارس الباركود) وليس من مسح كل الأصناف النشطة.
    /// على SQLite 3.42 و3.53 كان المخطط يقود الربط من idx_products_is_active (حوالي 7 مللي ثانية عند 50 ألف صنف)؛ العلامة +p.is_active تمنع ذلك.
    /// </summary>
    [TestFixture]
    public class S103_ExactBarcodePlanShapeTest : TestBase
    {
        private List<string> ExplainPlan(string sql, bool withAlt)
        {
            var lines = new List<string>();
            using (var conn = new SQLiteConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("EXPLAIN QUERY PLAN " + sql, conn))
                {
                    cmd.Parameters.AddWithValue("@bc", "6000000000001");
                    if (withAlt) cmd.Parameters.AddWithValue("@alt", "06000000000001");
                    cmd.Parameters.AddWithValue("@limit", 5);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read()) lines.Add(reader["detail"].ToString());
                    }
                }
            }
            return lines;
        }

        private void SeedProducts(int count)
        {
            Product template = CreateTestProduct("قالب", 1000, 700, 1000, "5999999999999");
            var columns = new List<string>();
            using (var conn = new SQLiteConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("PRAGMA table_info(products)", conn))
                using (var reader = cmd.ExecuteReader())
                {
                    while (reader.Read()) columns.Add(reader["name"].ToString());
                }
                var insert = new StringBuilder();
                var select = new StringBuilder();
                foreach (string c in columns)
                {
                    if (insert.Length > 0) { insert.Append(","); select.Append(","); }
                    insert.Append(c);
                    if (c == "id") select.Append("'plan_' || n.i");
                    else if (c == "barcode") select.Append("printf('%013d', 6000000000000 + n.i)");
                    else if (c == "name") select.Append("'صنف ' || n.i");
                    else select.Append("p." + c);
                }
                string sql = "WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < " + count + ") INSERT INTO products (" + insert + ") SELECT " + select
                    + " FROM n, (SELECT * FROM products WHERE id = @tid) p;";
                using (var tx = conn.BeginTransaction())
                {
                    using (var cmd = new SQLiteCommand(sql, conn, tx))
                    {
                        cmd.Parameters.AddWithValue("@tid", template.Id);
                        cmd.ExecuteNonQuery();
                    }
                    tx.Commit();
                }
            }
        }

        [Test]
        public void ExactBarcodeQuery_IsDrivenByTheBarcodeMatches_NotByAScanOfActiveProducts()
        {
            SeedProducts(20000);
            foreach (bool pharma in new bool[] { false, true })
            {
                foreach (bool alt in new bool[] { false, true })
                {
                    List<string> plan = ExplainPlan(ProductRepository.BuildExactBarcodeSql(pharma, alt), alt);
                    string text = string.Join(" | ", plan.ToArray());
                    Assert.IsFalse(Regex.IsMatch(text, @"SCAN (p|products)\b"), "no scan of products (pharma=" + pharma + ", alt=" + alt + "): " + text);
                    Assert.IsFalse(text.Contains("idx_products_is_active"), "the join must not be driven by idx_products_is_active: " + text);
                    StringAssert.Contains("SEARCH p USING INDEX sqlite_autoindex_products_1", text, "products joined by primary key: " + text);
                }
            }
        }

        [Test]
        public void ExactBarcodeLookup_StillReturnsOnlyActiveProducts_AndTheRightRow()
        {
            SeedProducts(2000);
            var found = ProductRepo.GetByExactBarcode("6000000001234");
            Assert.AreEqual(1, found.Count);
            Assert.AreEqual("plan_1234", found[0].Id);
            using (var conn = new SQLiteConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("UPDATE products SET is_active = 0 WHERE id = 'plan_1234'", conn)) cmd.ExecuteNonQuery();
            }
            Assert.AreEqual(0, ProductRepo.GetByExactBarcode("6000000001234").Count, "inactive products are still skipped");
        }
    }
}
