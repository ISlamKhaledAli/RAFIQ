using System;
using System.Collections.Generic;
using System.Data.SQLite;
using RafiqPOS.Common;
using RafiqPOS.Models;

namespace RafiqPOS.Repositories
{
    public partial class ProductRepository
    {
        #region Feature #119 / Story 108: الباركود الداخلي القياسي للأصناف

        /// <summary>
        /// فحص هل الباركود مستخدم بالفعل في الأصناف أو الباركودات الإضافية أو الوحدات
        /// </summary>
        public bool IsBarcodeInUse(SQLiteConnection conn, SQLiteTransaction trans, string barcode, string excludeProductId = null)
        {
            if (string.IsNullOrWhiteSpace(barcode)) return false;
            string clean = barcode.Trim();

            string sql = @"
                SELECT 1 FROM products WHERE is_active = 1 AND barcode = @barcode AND (@excludeId IS NULL OR id != @excludeId)
                UNION ALL
                SELECT 1 FROM product_barcodes WHERE barcode = @barcode AND (@excludeId IS NULL OR product_id != @excludeId)
                UNION ALL
                SELECT 1 FROM product_units WHERE barcode = @barcode AND (@excludeId IS NULL OR product_id != @excludeId)
                LIMIT 1;
            ";
            using (var cmd = new SQLiteCommand(sql, conn, trans))
            {
                cmd.Parameters.AddWithValue("@barcode", clean);
                cmd.Parameters.AddWithValue("@excludeId", (object)excludeProductId ?? DBNull.Value);
                object res = cmd.ExecuteScalar();
                return res != null && res != DBNull.Value;
            }
        }

        /// <summary>
        /// توليد باركود داخلي قياسي فريد يمنع التعارض مع أي صنف مسجل
        /// </summary>
        public string GenerateUniqueInternalBarcode(SQLiteConnection conn, SQLiteTransaction trans)
        {
            const int maxAttempts = 10000;
            for (int attempt = 0; attempt < maxAttempts; attempt++)
            {
                long nextCounter = _counters.GetNextCounterNumber(conn, trans, "internal_barcode");
                string candidate = BarcodeGenerator.FormatInternalEan13(nextCounter);
                if (!IsBarcodeInUse(conn, trans, candidate))
                {
                    return candidate;
                }
            }
            throw new InvalidOperationException("تعذر توليد باركود داخلي فريد بعد عدة محاولات لتفادي التعارض.");
        }

        /// <summary>
        /// توليد الرقم المتوقع التالي للباركود الداخلي دون حفظه على منتج معين
        /// </summary>
        public string GenerateNextInternalBarcode()
        {
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        string bc = GenerateUniqueInternalBarcode(conn, trans);
                        trans.Commit();
                        return bc;
                    }
                    catch
                    {
                        trans.Rollback();
                        throw;
                    }
                }
            }
        }

        /// <summary>
        /// تعيين وتوليد باركود داخلي قياسي لصنف واحد محدد
        /// </summary>
        public AssignBarcodeResult AssignInternalBarcode(string productId, string userId = null)
        {
            if (string.IsNullOrWhiteSpace(productId))
            {
                return new AssignBarcodeResult
                {
                    Success = false,
                    Message = "معرف الصنف غير محدد."
                };
            }

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        string name = null;
                        string existingBarcode = null;
                        using (var cmdFind = new SQLiteCommand("SELECT name, barcode FROM products WHERE id = @id LIMIT 1;", conn, trans))
                        {
                            cmdFind.Parameters.AddWithValue("@id", productId);
                            using (var r = cmdFind.ExecuteReader())
                            {
                                if (r.Read())
                                {
                                    name = r["name"].ToString();
                                    existingBarcode = r["barcode"] != DBNull.Value ? r["barcode"].ToString() : "";
                                }
                            }
                        }

                        if (name == null)
                        {
                            trans.Rollback();
                            return new AssignBarcodeResult
                            {
                                Success = false,
                                Message = "الصنف غير موجود في قاعدة البيانات."
                            };
                        }

                        string generatedBarcode = GenerateUniqueInternalBarcode(conn, trans);
                        string now = DateTime.UtcNow.ToString("o");

                        using (var cmdUp = new SQLiteCommand("UPDATE products SET barcode = @bc, updated_at = @now WHERE id = @id;", conn, trans))
                        {
                            cmdUp.Parameters.AddWithValue("@bc", generatedBarcode);
                            cmdUp.Parameters.AddWithValue("@now", now);
                            cmdUp.Parameters.AddWithValue("@id", productId);
                            cmdUp.ExecuteNonQuery();
                        }

                        if (_auditRepo != null)
                        {
                            try
                            {
                                string details = string.Format("{{\"product_id\":\"{0}\",\"name\":\"{1}\",\"old_barcode\":\"{2}\",\"new_barcode\":\"{3}\"}}",
                                    productId,
                                    (name ?? "").Replace("\"", "\\\""),
                                    (existingBarcode ?? "").Replace("\"", "\\\""),
                                    generatedBarcode);

                                _auditRepo.Log(conn, trans, new AuditLog
                                {
                                    Id = "aud_" + Guid.NewGuid().ToString("N"),
                                    UserId = string.IsNullOrWhiteSpace(userId) ? "usr_admin_default" : userId,
                                    Action = "assign_internal_barcode",
                                    EntityType = "products",
                                    EntityId = productId,
                                    DetailsJson = details,
                                    CreatedAt = now
                                });
                            }
                            catch { }
                        }

                        trans.Commit();
                        return new AssignBarcodeResult
                        {
                            Success = true,
                            ProductId = productId,
                            Barcode = generatedBarcode,
                            Message = string.Format("تم تعيين الباركود الداخلي {0} للصنف '{1}' بنجاح.", generatedBarcode, name)
                        };
                    }
                    catch (Exception ex)
                    {
                        trans.Rollback();
                        Common.Logger.Error("فشل تعيين باركود داخلي للصنف: " + productId, ex);
                        throw;
                    }
                }
            }
        }

        /// <summary>
        /// توليد باركودات داخلية قياسية لجميع الأصناف النشطة التي ليس لها باركود دفعة واحدة
        /// في معاملة ذرية واحدة (ACID Transaction)
        /// </summary>
        public BulkGenerateBarcodesResult BulkGenerateInternalBarcodes(string userId = null)
        {
            var result = new BulkGenerateBarcodesResult();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        // 1. استرجاع كافة الأصناف النشطة التي ليس لها باركود
                        var missingProducts = new List<BulkBarcodeProductItem>();
                        string selectSql = @"
                            SELECT id, name, price_piasters
                            FROM products
                            WHERE is_active = 1 AND (barcode IS NULL OR TRIM(barcode) = '')
                            ORDER BY created_at ASC;
                        ";
                        using (var cmdSelect = new SQLiteCommand(selectSql, conn, trans))
                        {
                            using (var r = cmdSelect.ExecuteReader())
                            {
                                while (r.Read())
                                {
                                    missingProducts.Add(new BulkBarcodeProductItem
                                    {
                                        ProductId = r["id"].ToString(),
                                        ProductName = r["name"].ToString(),
                                        PricePiasters = Convert.ToInt64(r["price_piasters"])
                                    });
                                }
                            }
                        }

                        if (missingProducts.Count == 0)
                        {
                            trans.Commit();
                            result.Success = true;
                            result.Count = 0;
                            result.Message = "لا توجد أصناف نشطة بدون باركود في النظام.";
                            return result;
                        }

                        string now = DateTime.UtcNow.ToString("o");

                        // 2. توليد باركود فريد وتحديث كل صنف داخل المعاملة الذرية
                        for (int i = 0; i < missingProducts.Count; i++)
                        {
                            var prod = missingProducts[i];
                            string bc = GenerateUniqueInternalBarcode(conn, trans);
                            prod.Barcode = bc;

                            using (var cmdUpdate = new SQLiteCommand("UPDATE products SET barcode = @bc, updated_at = @now WHERE id = @id;", conn, trans))
                            {
                                cmdUpdate.Parameters.AddWithValue("@bc", bc);
                                cmdUpdate.Parameters.AddWithValue("@now", now);
                                cmdUpdate.Parameters.AddWithValue("@id", prod.ProductId);
                                cmdUpdate.ExecuteNonQuery();
                            }
                        }

                        // 3. تسجيل حركة التدقيق الأمني
                        if (_auditRepo != null)
                        {
                            try
                            {
                                string details = string.Format("{{\"count\":{0},\"action\":\"bulk_generate_internal_barcodes\"}}", missingProducts.Count);
                                _auditRepo.Log(conn, trans, new AuditLog
                                {
                                    Id = "aud_" + Guid.NewGuid().ToString("N"),
                                    UserId = string.IsNullOrWhiteSpace(userId) ? "usr_admin_default" : userId,
                                    Action = "bulk_generate_internal_barcodes",
                                    EntityType = "products",
                                    EntityId = "bulk",
                                    DetailsJson = details,
                                    CreatedAt = now
                                });
                            }
                            catch { }
                        }

                        trans.Commit();

                        result.Success = true;
                        result.Count = missingProducts.Count;
                        result.Products = missingProducts;
                        result.Message = string.Format("تم توليد وتعيين باركود داخلي قياسي (EAN-13) لـ {0} صنف بنجاح.", missingProducts.Count);
                        return result;
                    }
                    catch (Exception ex)
                    {
                        trans.Rollback();
                        Common.Logger.Error("فشل التوليد الجماعي للباركودات الداخلية للأصناف", ex);
                        throw;
                    }
                }
            }
        }

        /// <summary>
        /// حساب عدد الأصناف التي ليس لها باركود
        /// </summary>
        public int GetMissingBarcodeCount()
        {
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "SELECT COUNT(*) FROM products WHERE is_active = 1 AND (barcode IS NULL OR TRIM(barcode) = '');";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    object res = cmd.ExecuteScalar();
                    if (res != null && res != DBNull.Value)
                    {
                        return Convert.ToInt32(res);
                    }
                }
            }
            return 0;
        }

        #endregion
    }
}
