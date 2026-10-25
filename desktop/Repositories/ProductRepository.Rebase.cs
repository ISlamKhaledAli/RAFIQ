using System;
using System.Collections.Generic;
using System.Data.SQLite;
using Newtonsoft.Json;
using RafiqPOS.Common;
using RafiqPOS.Models;

namespace RafiqPOS.Repositories
{
    public class RebaseResult
    {
        [JsonProperty("success")]
        public bool Success { get; set; }

        [JsonProperty("message")]
        public string Message { get; set; }

        [JsonProperty("productId")]
        public string ProductId { get; set; }

        [JsonProperty("oldBaseUnit")]
        public string OldBaseUnit { get; set; }

        [JsonProperty("newBaseUnit")]
        public string NewBaseUnit { get; set; }

        [JsonProperty("rebaseFactor")]
        public int RebaseFactor { get; set; }

        [JsonProperty("oldStockMilli")]
        public long OldStockMilli { get; set; }

        [JsonProperty("newStockMilli")]
        public long NewStockMilli { get; set; }

        [JsonProperty("product")]
        public Product Product { get; set; }
    }

    public partial class ProductRepository
    {
        /// <summary>
        /// خوارزمية إعادة التأسيس الذرية (RebaseProductBaseUnit)
        /// تحويل الوحدة الأساسية للصنف (مثل علبة إلى قرص) مع مضاعفة المخزون والتشغيلات والوحدات ذرياً (Task 183-4 / Feature #183)
        /// </summary>
        public RebaseResult RebaseProductBaseUnit(string productId, string newBaseUnitName, int rebaseFactor, string userId = "usr_admin_default", string userName = "مدير النظام")
        {
            if (string.IsNullOrWhiteSpace(productId))
            {
                throw new ArgumentException("معرف الصنف مطلوب لإعادة التأسيس.");
            }
            if (string.IsNullOrWhiteSpace(newBaseUnitName))
            {
                throw new ArgumentException("اسم الوحدة الأساسية الجديدة مطلوب.");
            }
            if (rebaseFactor < 2 || rebaseFactor > 10000)
            {
                throw new ArgumentOutOfRangeException("rebaseFactor", "معامل إعادة التأسيس يجب أن يكون رقماً صحيحاً بين 2 و 10,000.");
            }

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();

                // 1. Pre-execution checks
                var product = GetById(productId);
                if (product == null)
                {
                    throw new InvalidOperationException("الصنف المراد إعادة تأسيسه غير موجود.");
                }

                if (product.HasVariants || !string.IsNullOrEmpty(product.ParentId))
                {
                    throw new InvalidOperationException("لا يمكن إعادة تأسيس صنف يحتوي على مقاسات أو ألوان في الإصدار الحالي.");
                }

                string oldUnitName = !string.IsNullOrWhiteSpace(product.Unit) ? product.Unit.Trim() : "علبة";
                string cleanNewBase = newBaseUnitName.Trim();

                // Strict Identity Guard: Block rebasing if current unit is already the new base unit
                if (string.Equals(oldUnitName, cleanNewBase, StringComparison.OrdinalIgnoreCase))
                {
                    throw new InvalidOperationException(string.Format("الوحدة الأساسية الحالية للصنف مسجلة بالفعل باسم '{0}'. لا يمكن إعادة تأسيس المخزن لنفس الوحدة تجنباً لتكرار مضاعفة الأرصدة.", oldUnitName));
                }

                // Check pending held sales for this product in current open shifts
                using (var heldCmd = new SQLiteCommand(@"
                    SELECT COUNT(*) FROM held_sales 
                    WHERE cart_json LIKE '%' || @pid || '%';
                ", conn))
                {
                    heldCmd.Parameters.AddWithValue("@pid", productId);
                    long heldCount = Convert.ToInt64(heldCmd.ExecuteScalar());
                    if (heldCount > 0)
                    {
                        throw new InvalidOperationException("لا يمكن إعادة تأسيس الصنف لوجود فواتير معلقة (Held Sales) تحتوي عليه في الوردية الحالية. يرجى استرجاعها وإتمامها أو إلغاؤها أولاً لحماية سلامة البيانات.");
                    }
                }

                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        string now = DateTime.UtcNow.ToString("o");
                        long oldStockMilli = product.StockQuantityMilli;
                        long newStockMilli = oldStockMilli * rebaseFactor;
                        long oldMinStockMilli = product.MinStockQuantityMilli;
                        long newMinStockMilli = oldMinStockMilli * rebaseFactor;

                        // Multiply batches
                        using (var bCmd = new SQLiteCommand("UPDATE product_batches SET quantity_milli = quantity_milli * @f, updated_at = @now WHERE product_id = @pid;", conn, trans))
                        {
                            bCmd.Parameters.AddWithValue("@f", rebaseFactor);
                            bCmd.Parameters.AddWithValue("@now", now);
                            bCmd.Parameters.AddWithValue("@pid", productId);
                            bCmd.ExecuteNonQuery();
                        }

                        // Clean up any stale/conflicting units before establishing new hierarchy
                        // Ensure old base unit exists as a unit with conversion_factor = rebaseFactor
                        bool oldUnitExists = false;
                        using (var chkOld = new SQLiteCommand("SELECT id FROM product_units WHERE product_id = @pid AND unit_name = @uname LIMIT 1;", conn, trans))
                        {
                            chkOld.Parameters.AddWithValue("@pid", productId);
                            chkOld.Parameters.AddWithValue("@uname", oldUnitName);
                            var oldIdObj = chkOld.ExecuteScalar();
                            if (oldIdObj != null && oldIdObj != DBNull.Value)
                            {
                                oldUnitExists = true;
                                using (var upOld = new SQLiteCommand("UPDATE product_units SET conversion_factor = @f, is_base_unit = 0, sell_price_piasters = @price, cost_price_piasters = @cost, updated_at = @now WHERE id = @uid;", conn, trans))
                                {
                                    upOld.Parameters.AddWithValue("@f", rebaseFactor);
                                    upOld.Parameters.AddWithValue("@price", product.PricePiasters);
                                    upOld.Parameters.AddWithValue("@cost", product.CostPiasters);
                                    upOld.Parameters.AddWithValue("@now", now);
                                    upOld.Parameters.AddWithValue("@uid", oldIdObj.ToString());
                                    upOld.ExecuteNonQuery();
                                }
                            }
                        }

                        if (!oldUnitExists)
                        {
                            using (var insOld = new SQLiteCommand(@"
                                INSERT INTO product_units (
                                    id, product_id, unit_name, conversion_factor, is_base_unit,
                                    sell_price_piasters, cost_price_piasters, barcode, is_divisible,
                                    sort_order, created_at, updated_at
                                ) VALUES (
                                    @id, @pid, @uname, @f, 0,
                                    @price, @cost, @barcode, 0,
                                    1, @now, @now
                                );
                            ", conn, trans))
                            {
                                insOld.Parameters.AddWithValue("@id", "punit_" + Guid.NewGuid().ToString("N"));
                                insOld.Parameters.AddWithValue("@pid", productId);
                                insOld.Parameters.AddWithValue("@uname", oldUnitName);
                                insOld.Parameters.AddWithValue("@f", rebaseFactor);
                                insOld.Parameters.AddWithValue("@price", product.PricePiasters);
                                insOld.Parameters.AddWithValue("@cost", product.CostPiasters);
                                insOld.Parameters.AddWithValue("@barcode", (object)product.Barcode ?? DBNull.Value);
                                insOld.Parameters.AddWithValue("@now", now);
                                insOld.ExecuteNonQuery();
                            }
                        }

                        // Calculate new base unit prices (rounded to nearest piaster)
                        long newBaseSellPrice = (product.PricePiasters + (rebaseFactor / 2)) / rebaseFactor;
                        long newBaseCostPrice = (product.CostPiasters + (rebaseFactor / 2)) / rebaseFactor;

                        // Insert or update new base unit
                        bool newBaseExists = false;
                        using (var chkNew = new SQLiteCommand("SELECT id FROM product_units WHERE product_id = @pid AND unit_name = @uname LIMIT 1;", conn, trans))
                        {
                            chkNew.Parameters.AddWithValue("@pid", productId);
                            chkNew.Parameters.AddWithValue("@uname", cleanNewBase);
                            var newIdObj = chkNew.ExecuteScalar();
                            if (newIdObj != null && newIdObj != DBNull.Value)
                            {
                                newBaseExists = true;
                                using (var upNew = new SQLiteCommand("UPDATE product_units SET conversion_factor = 1, is_base_unit = 1, is_divisible = 0, sell_price_piasters = @price, cost_price_piasters = @cost, updated_at = @now WHERE id = @uid;", conn, trans))
                                {
                                    upNew.Parameters.AddWithValue("@price", newBaseSellPrice);
                                    upNew.Parameters.AddWithValue("@cost", newBaseCostPrice);
                                    upNew.Parameters.AddWithValue("@now", now);
                                    upNew.Parameters.AddWithValue("@uid", newIdObj.ToString());
                                    upNew.ExecuteNonQuery();
                                }
                            }
                        }

                        if (!newBaseExists)
                        {
                            using (var insNew = new SQLiteCommand(@"
                                INSERT INTO product_units (
                                    id, product_id, unit_name, conversion_factor, is_base_unit,
                                    sell_price_piasters, cost_price_piasters, barcode, is_divisible,
                                    sort_order, created_at, updated_at
                                ) VALUES (
                                    @id, @pid, @uname, 1, 1,
                                    @price, @cost, NULL, 0,
                                    0, @now, @now
                                );
                            ", conn, trans))
                            {
                                insNew.Parameters.AddWithValue("@id", "punit_" + Guid.NewGuid().ToString("N"));
                                insNew.Parameters.AddWithValue("@pid", productId);
                                insNew.Parameters.AddWithValue("@uname", cleanNewBase);
                                insNew.Parameters.AddWithValue("@price", newBaseSellPrice);
                                insNew.Parameters.AddWithValue("@cost", newBaseCostPrice);
                                insNew.Parameters.AddWithValue("@now", now);
                                insNew.ExecuteNonQuery();
                            }
                        }

                        // Update product master record
                        using (var upProd = new SQLiteCommand(@"
                            UPDATE products SET
                                stock_quantity_milli = @stock,
                                min_stock_quantity_milli = @minStock,
                                unit = @newUnit,
                                price_piasters = @price,
                                cost_piasters = @cost,
                                is_loose_sellable = 1,
                                default_sale_unit_id = COALESCE(default_sale_unit_id, (SELECT id FROM product_units WHERE product_id = @pid AND conversion_factor = @f LIMIT 1)),
                                display_unit_id = COALESCE(display_unit_id, (SELECT id FROM product_units WHERE product_id = @pid AND conversion_factor = @f LIMIT 1)),
                                updated_at = @now
                            WHERE id = @pid;
                        ", conn, trans))
                        {
                            upProd.Parameters.AddWithValue("@stock", newStockMilli);
                            upProd.Parameters.AddWithValue("@minStock", newMinStockMilli);
                            upProd.Parameters.AddWithValue("@newUnit", cleanNewBase);
                            upProd.Parameters.AddWithValue("@price", newBaseSellPrice);
                            upProd.Parameters.AddWithValue("@cost", newBaseCostPrice);
                            upProd.Parameters.AddWithValue("@f", rebaseFactor);
                            upProd.Parameters.AddWithValue("@now", now);
                            upProd.Parameters.AddWithValue("@pid", productId);
                            upProd.ExecuteNonQuery();
                        }

                        // Record stock movement (UNIT_REBASE)
                        using (var smCmd = new SQLiteCommand(@"
                            INSERT INTO stock_movements (
                                id, product_id, movement_type, quantity_milli, reference_id, reference_type,
                                unit_cost_piasters, note, batch_number, created_at
                            ) VALUES (
                                @id, @pid, 'UNIT_REBASE', 0, @pid, 'UNIT_REBASE',
                                @cost, @note, NULL, @now
                            );
                        ", conn, trans))
                        {
                            smCmd.Parameters.AddWithValue("@id", "sm_" + Guid.NewGuid().ToString("N"));
                            smCmd.Parameters.AddWithValue("@pid", productId);
                            smCmd.Parameters.AddWithValue("@cost", newBaseCostPrice);
                            smCmd.Parameters.AddWithValue("@note", string.Format("إعادة تأسيس الوحدة الأساسية للصنف من '{0}' إلى '{1}' بمعامل {2}. الرصيد تحول من {3} إلى {4}", oldUnitName, cleanNewBase, rebaseFactor, oldStockMilli / 1000, newStockMilli / 1000));
                            smCmd.Parameters.AddWithValue("@now", now);
                            smCmd.ExecuteNonQuery();
                        }

                        // Record audit log
                        string auditDetails = string.Format("{{\"oldBaseUnit\":\"{0}\",\"newBaseUnit\":\"{1}\",\"rebaseFactor\":{2},\"oldStockMilli\":{3},\"newStockMilli\":{4},\"newBaseSellPrice\":{5},\"newBaseCostPrice\":{6}}}",
                            oldUnitName, cleanNewBase, rebaseFactor, oldStockMilli, newStockMilli, newBaseSellPrice, newBaseCostPrice);

                        _auditRepo.Log(conn, trans, new AuditLog
                        {
                            Id = "aud_" + Guid.NewGuid().ToString("N"),
                            UserId = string.IsNullOrWhiteSpace(userId) ? "usr_admin_default" : userId,
                            Action = "UNIT_REBASE",
                            EntityType = "PRODUCT",
                            EntityId = productId,
                            DetailsJson = auditDetails,
                            CreatedAt = now
                        });

                        trans.Commit();

                        var updatedProd = GetById(productId);
                        return new RebaseResult
                        {
                            Success = true,
                            Message = string.Format("تمت إعادة تأسيس الوحدة الأساسية بنجاح إلى '{0}' ومضاعفة الرصيد بمعامل {1}.", cleanNewBase, rebaseFactor),
                            ProductId = productId,
                            OldBaseUnit = oldUnitName,
                            NewBaseUnit = cleanNewBase,
                            RebaseFactor = rebaseFactor,
                            OldStockMilli = oldStockMilli,
                            NewStockMilli = newStockMilli,
                            Product = updatedProd
                        };
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
        /// حفظ مستويات التعبئة وتحديث الصنف والوحدات ذرياً (Task 183-2 / Feature #183)
        /// </summary>
        public Product SavePackagingLevels(string productId, List<ProductUnit> units, string defaultSaleUnitId, string defaultPurchaseUnitId, string displayUnitId, bool isLooseSellable, int? multiplyStockByFactor = null)
        {
            if (string.IsNullOrWhiteSpace(productId))
            {
                throw new ArgumentException("معرف الصنف مطلوب لحفظ مستويات التعبئة.");
            }
            if (units == null || units.Count == 0)
            {
                throw new ArgumentException("يجب توفير مستوى واحد على الأقل للوحدات.");
            }

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        var prod = GetById(productId);
                        if (prod == null)
                        {
                            throw new InvalidOperationException("الصنف غير موجود.");
                        }

                        string now = DateTime.UtcNow.ToString("o");

                        // Find base unit among units
                        ProductUnit baseUnit = null;
                        for (int i = 0; i < units.Count; i++)
                        {
                            if (units[i] != null && (units[i].IsBaseUnit || units[i].ConversionFactor == 1))
                            {
                                baseUnit = units[i];
                                break;
                            }
                        }
                        if (baseUnit == null)
                        {
                            baseUnit = units[0];
                            baseUnit.IsBaseUnit = true;
                            baseUnit.ConversionFactor = 1;
                        }

                        // Track existing units to clean up removed ones
                        var existingUnits = GetUnitsForProductInternal(conn, productId, trans);
                        var submittedIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

                        for (int i = 0; i < units.Count; i++)
                        {
                            var u = units[i];
                            if (u == null) continue;
                            if (string.IsNullOrWhiteSpace(u.Id))
                            {
                                u.Id = "punit_" + Guid.NewGuid().ToString("N");
                            }
                            u.ProductId = productId;
                            submittedIds.Add(u.Id);

                            using (var upsertCmd = new SQLiteCommand(@"
                                INSERT INTO product_units (
                                    id, product_id, unit_name, conversion_factor, is_base_unit,
                                    sell_price_piasters, cost_price_piasters, barcode, is_divisible,
                                    sort_order, created_at, updated_at
                                ) VALUES (
                                    @id, @pid, @name, @factor, @isBase,
                                    @sellPrice, @costPrice, @barcode, @isDivisible,
                                    @sortOrder, @now, @now
                                )
                                ON CONFLICT(id) DO UPDATE SET
                                    unit_name = excluded.unit_name,
                                    conversion_factor = excluded.conversion_factor,
                                    is_base_unit = excluded.is_base_unit,
                                    sell_price_piasters = excluded.sell_price_piasters,
                                    cost_price_piasters = excluded.cost_price_piasters,
                                    barcode = excluded.barcode,
                                    is_divisible = excluded.is_divisible,
                                    sort_order = excluded.sort_order,
                                    updated_at = excluded.updated_at;
                            ", conn, trans))
                            {
                                upsertCmd.Parameters.AddWithValue("@id", u.Id);
                                upsertCmd.Parameters.AddWithValue("@pid", productId);
                                upsertCmd.Parameters.AddWithValue("@name", u.UnitName);
                                upsertCmd.Parameters.AddWithValue("@factor", u.ConversionFactor > 0 ? u.ConversionFactor : 1);
                                upsertCmd.Parameters.AddWithValue("@isBase", u.IsBaseUnit ? 1 : 0);
                                upsertCmd.Parameters.AddWithValue("@sellPrice", u.SellPricePiasters);
                                upsertCmd.Parameters.AddWithValue("@costPrice", u.CostPricePiasters);
                                upsertCmd.Parameters.AddWithValue("@barcode", string.IsNullOrWhiteSpace(u.Barcode) ? (object)DBNull.Value : u.Barcode.Trim());
                                upsertCmd.Parameters.AddWithValue("@isDivisible", u.IsDivisible ? 1 : 0);
                                upsertCmd.Parameters.AddWithValue("@sortOrder", i);
                                upsertCmd.Parameters.AddWithValue("@now", now);
                                upsertCmd.ExecuteNonQuery();
                            }
                        }

                        // Delete units that were removed if they have no sales
                        for (int i = 0; i < existingUnits.Count; i++)
                        {
                            var eu = existingUnits[i];
                            if (!submittedIds.Contains(eu.Id))
                            {
                                using (var delCmd = new SQLiteCommand(@"
                                    DELETE FROM product_units 
                                    WHERE id = @uid 
                                      AND NOT EXISTS (SELECT 1 FROM sale_items WHERE unit_id = @uid);
                                ", conn, trans))
                                {
                                    delCmd.Parameters.AddWithValue("@uid", eu.Id);
                                    delCmd.ExecuteNonQuery();
                                }
                            }
                        }

                        // Update product table with packaging metadata and base unit sync
                        using (var upProd = new SQLiteCommand(@"
                            UPDATE products SET
                                unit = @baseUnitName,
                                price_piasters = @baseSellPrice,
                                cost_piasters = @baseCostPrice,
                                default_sale_unit_id = @defSale,
                                default_purchase_unit_id = @defPur,
                                display_unit_id = @dispUnit,
                                is_loose_sellable = @isLoose,
                                updated_at = @now
                            WHERE id = @pid;
                        ", conn, trans))
                        {
                            upProd.Parameters.AddWithValue("@baseUnitName", baseUnit.UnitName);
                            upProd.Parameters.AddWithValue("@baseSellPrice", baseUnit.SellPricePiasters);
                            upProd.Parameters.AddWithValue("@baseCostPrice", baseUnit.CostPricePiasters);
                            upProd.Parameters.AddWithValue("@defSale", string.IsNullOrWhiteSpace(defaultSaleUnitId) ? (object)DBNull.Value : defaultSaleUnitId);
                            upProd.Parameters.AddWithValue("@defPur", string.IsNullOrWhiteSpace(defaultPurchaseUnitId) ? (object)DBNull.Value : defaultPurchaseUnitId);
                            upProd.Parameters.AddWithValue("@dispUnit", string.IsNullOrWhiteSpace(displayUnitId) ? (object)DBNull.Value : displayUnitId);
                            upProd.Parameters.AddWithValue("@isLoose", isLooseSellable ? 1 : 0);
                            upProd.Parameters.AddWithValue("@now", now);
                            upProd.Parameters.AddWithValue("@pid", productId);
                            upProd.ExecuteNonQuery();
                        }

                        // If user requested rebasing/multiplying/dividing existing stock to match new pack hierarchy
                        if (multiplyStockByFactor.HasValue && multiplyStockByFactor.Value != 0 && multiplyStockByFactor.Value != 1 && prod.StockQuantityMilli > 0)
                        {
                            long oldStock = prod.StockQuantityMilli;
                            long newStock;
                            long deltaStock;
                            string smNote;

                            if (multiplyStockByFactor.Value > 1)
                            {
                                int factor = multiplyStockByFactor.Value;
                                newStock = oldStock * factor;
                                deltaStock = newStock - oldStock;
                                string topName = units.Count > 0 && units[0] != null ? units[0].UnitName : "عبوة";
                                string baseName = baseUnit.UnitName;
                                smNote = string.Format("تحويل وتعديل رصيد المخزن عند اعتماد التعبئة: {0} {1} × {2} = {3} {4}", oldStock / 1000, topName, factor, newStock / 1000, baseName);

                                using (var upBatches = new SQLiteCommand("UPDATE product_batches SET quantity_milli = quantity_milli * @f, updated_at = @now WHERE product_id = @pid;", conn, trans))
                                {
                                    upBatches.Parameters.AddWithValue("@f", factor);
                                    upBatches.Parameters.AddWithValue("@now", now);
                                    upBatches.Parameters.AddWithValue("@pid", productId);
                                    upBatches.ExecuteNonQuery();
                                }
                            }
                            else
                            {
                                int divisor = Math.Abs(multiplyStockByFactor.Value);
                                newStock = divisor > 0 ? (oldStock / divisor) : oldStock;
                                deltaStock = newStock - oldStock;
                                string fromName = !string.IsNullOrEmpty(prod.Unit) ? prod.Unit : "وحدة";
                                string toName = baseUnit.UnitName;
                                smNote = string.Format("تحويل وتعديل رصيد المخزن عند إرجاع أو دمج التعبئة: {0} {1} ÷ {2} = {3} {4}", oldStock / 1000, fromName, divisor, newStock / 1000, toName);

                                using (var upBatches = new SQLiteCommand("UPDATE product_batches SET quantity_milli = quantity_milli / @d, updated_at = @now WHERE product_id = @pid;", conn, trans))
                                {
                                    upBatches.Parameters.AddWithValue("@d", divisor);
                                    upBatches.Parameters.AddWithValue("@now", now);
                                    upBatches.Parameters.AddWithValue("@pid", productId);
                                    upBatches.ExecuteNonQuery();
                                }
                            }

                            using (var upStock = new SQLiteCommand("UPDATE products SET stock_quantity_milli = @ns, updated_at = @now WHERE id = @pid;", conn, trans))
                            {
                                upStock.Parameters.AddWithValue("@ns", newStock);
                                upStock.Parameters.AddWithValue("@now", now);
                                upStock.Parameters.AddWithValue("@pid", productId);
                                upStock.ExecuteNonQuery();
                            }

                            using (var smCmd = new SQLiteCommand(@"
                                INSERT INTO stock_movements (
                                    id, product_id, movement_type, quantity_milli, reference_id, reference_type,
                                    unit_cost_piasters, note, batch_number, created_at
                                ) VALUES (
                                    @smId, @pid, 'UNIT_REBASE', @qty, 'PACKAGING_SAVE', 'UNIT_REBASE',
                                    @cost, @note, NULL, @now
                                );
                            ", conn, trans))
                            {
                                smCmd.Parameters.AddWithValue("@smId", Guid.NewGuid().ToString());
                                smCmd.Parameters.AddWithValue("@pid", productId);
                                smCmd.Parameters.AddWithValue("@qty", deltaStock);
                                smCmd.Parameters.AddWithValue("@cost", baseUnit.CostPricePiasters);
                                smCmd.Parameters.AddWithValue("@note", smNote);
                                smCmd.Parameters.AddWithValue("@now", now);
                                smCmd.ExecuteNonQuery();
                            }
                        }

                        trans.Commit();
                        return GetById(productId);
                    }
                    catch
                    {
                        trans.Rollback();
                        throw;
                    }
                }
            }
        }
    }
}
