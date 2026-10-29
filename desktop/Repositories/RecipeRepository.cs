using System;
using System.Collections.Generic;
using System.Data.SQLite;
using RafiqPOS.Models;

namespace RafiqPOS.Repositories
{
    public class RecipeRepository
    {
        private readonly string _connectionString;
        private readonly AuditLogRepository _auditRepo;

        public RecipeRepository(string connectionString, AuditLogRepository auditRepo)
        {
            _connectionString = connectionString;
            _auditRepo = auditRepo;
        }

        public List<Recipe> GetAllRecipes()
        {
            var recipes = new List<Recipe>();
            var recipeMap = new Dictionary<string, Recipe>();

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT r.*, p.name AS product_name, COALESCE(p.price_piasters, 0) AS product_price_piasters
                    FROM recipes r
                    LEFT JOIN products p ON r.product_id = p.id
                    ORDER BY r.name ASC;
                ";
                using (var cmd = new SQLiteCommand(sql, conn))
                using (var reader = cmd.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        var rec = MapRecipe(reader);
                        recipes.Add(rec);
                        recipeMap[rec.Id] = rec;
                    }
                }

                if (recipes.Count > 0)
                {
                    string ingSql = @"
                        SELECT ri.*,
                               p.name AS ingredient_name,
                               COALESCE(p.unit, 'piece') AS ingredient_unit,
                               COALESCE(p.cost_piasters, 0) AS ingredient_cost_piasters,
                               COALESCE(p.stock_quantity_milli, 0) AS ingredient_stock_milli
                        FROM recipe_ingredients ri
                        LEFT JOIN products p ON ri.ingredient_product_id = p.id
                        ORDER BY ri.sort_order ASC, ri.created_at ASC;
                    ";
                    using (var cmd = new SQLiteCommand(ingSql, conn))
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            var ing = MapIngredient(reader);
                            Recipe parent;
                            if (recipeMap.TryGetValue(ing.RecipeId, out parent))
                            {
                                parent.Ingredients.Add(ing);
                                parent.EstimatedCostPiasters += ing.LineCostPiasters;
                            }
                        }
                    }
                }
            }

            return recipes;
        }

        public Recipe GetByProductId(string productId)
        {
            if (string.IsNullOrWhiteSpace(productId)) return null;
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                return GetByProductIdInternal(conn, null, productId);
            }
        }

        public Recipe GetByProductIdInternal(SQLiteConnection conn, SQLiteTransaction trans, string productId)
        {
            if (string.IsNullOrWhiteSpace(productId)) return null;
            Recipe rec = null;
            string sql = @"
                SELECT r.*, p.name AS product_name, COALESCE(p.price_piasters, 0) AS product_price_piasters
                FROM recipes r
                LEFT JOIN products p ON r.product_id = p.id
                WHERE r.product_id = @pid
                LIMIT 1;
            ";
            using (var cmd = new SQLiteCommand(sql, conn, trans))
            {
                cmd.Parameters.AddWithValue("@pid", productId);
                using (var reader = cmd.ExecuteReader())
                {
                    if (reader.Read())
                    {
                        rec = MapRecipe(reader);
                    }
                }
            }

            if (rec != null)
            {
                string ingSql = @"
                    SELECT ri.*,
                           p.name AS ingredient_name,
                           COALESCE(p.unit, 'piece') AS ingredient_unit,
                           COALESCE(p.cost_piasters, 0) AS ingredient_cost_piasters,
                           COALESCE(p.stock_quantity_milli, 0) AS ingredient_stock_milli
                    FROM recipe_ingredients ri
                    LEFT JOIN products p ON ri.ingredient_product_id = p.id
                    WHERE ri.recipe_id = @rid
                    ORDER BY ri.sort_order ASC, ri.created_at ASC;
                ";
                using (var cmd = new SQLiteCommand(ingSql, conn, trans))
                {
                    cmd.Parameters.AddWithValue("@rid", rec.Id);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            var ing = MapIngredient(reader);
                            rec.Ingredients.Add(ing);
                            rec.EstimatedCostPiasters += ing.LineCostPiasters;
                        }
                    }
                }
            }

            return rec;
        }

        public Recipe SaveRecipe(Recipe recipe, bool updateProductCost = true)
        {
            if (recipe == null) throw new ArgumentNullException("recipe");
            if (string.IsNullOrWhiteSpace(recipe.ProductId))
                throw new InvalidOperationException("يرجى اختيار الصنف النهائي للرسبي.");
            if (recipe.Ingredients == null || recipe.Ingredients.Count == 0)
                throw new InvalidOperationException("يجب إضافة خامة واحدة على الأقل في مكونات الرسبي.");

            for (int i = 0; i < recipe.Ingredients.Count; i++)
            {
                var ing = recipe.Ingredients[i];
                if (ing == null || string.IsNullOrWhiteSpace(ing.IngredientProductId))
                    throw new InvalidOperationException("يرجى تحديد الخامة لكل سطر في الرسبي.");
                if (ing.IngredientProductId == recipe.ProductId)
                    throw new InvalidOperationException("لا يمكن إضافة المنتج النهائي كمكون خام داخل رسبي نفسه (منع الحلقات الدائرية).");
                if (ing.QuantityMilli <= 0)
                    throw new InvalidOperationException("كمية الخامة يجب أن تكون أكبر من صفر.");
            }

            string nowIso = DateTime.UtcNow.ToString("o");
            if (recipe.YieldQtyMilli <= 0) recipe.YieldQtyMilli = 1000;
            if (string.IsNullOrWhiteSpace(recipe.DepletionMode)) recipe.DepletionMode = "on_sale";

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        // Check if a recipe already exists for this product
                        using (var chkCmd = new SQLiteCommand("SELECT id FROM recipes WHERE product_id = @pid LIMIT 1;", conn, trans))
                        {
                            chkCmd.Parameters.AddWithValue("@pid", recipe.ProductId);
                            object existingId = chkCmd.ExecuteScalar();
                            if (existingId != null && existingId != DBNull.Value)
                            {
                                recipe.Id = existingId.ToString();
                            }
                        }

                        if (string.IsNullOrWhiteSpace(recipe.Id))
                        {
                            recipe.Id = "rcp_" + Guid.NewGuid().ToString("N").Substring(0, 12);
                            recipe.CreatedAt = nowIso;
                        }

                        if (string.IsNullOrWhiteSpace(recipe.Name))
                        {
                            using (var pCmd = new SQLiteCommand("SELECT name FROM products WHERE id = @pid LIMIT 1;", conn, trans))
                            {
                                pCmd.Parameters.AddWithValue("@pid", recipe.ProductId);
                                object pName = pCmd.ExecuteScalar();
                                recipe.Name = pName != null && pName != DBNull.Value ? ("رسبي " + pName.ToString()) : "رسبي تصنيع";
                            }
                        }

                        string upsertSql = @"
                            INSERT INTO recipes (
                                id, product_id, name, yield_qty_milli, depletion_mode,
                                notes, is_active, created_at, updated_at
                            ) VALUES (
                                @id, @pid, @name, @yield, @mode,
                                @notes, @active, @createdAt, @updatedAt
                            )
                            ON CONFLICT(id) DO UPDATE SET
                                product_id = excluded.product_id,
                                name = excluded.name,
                                yield_qty_milli = excluded.yield_qty_milli,
                                depletion_mode = excluded.depletion_mode,
                                notes = excluded.notes,
                                is_active = excluded.is_active,
                                updated_at = excluded.updated_at;
                        ";
                        using (var cmd = new SQLiteCommand(upsertSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@id", recipe.Id);
                            cmd.Parameters.AddWithValue("@pid", recipe.ProductId);
                            cmd.Parameters.AddWithValue("@name", recipe.Name.Trim());
                            cmd.Parameters.AddWithValue("@yield", recipe.YieldQtyMilli);
                            cmd.Parameters.AddWithValue("@mode", recipe.DepletionMode);
                            cmd.Parameters.AddWithValue("@notes", recipe.Notes ?? "");
                            cmd.Parameters.AddWithValue("@active", recipe.IsActive ? 1 : 0);
                            cmd.Parameters.AddWithValue("@createdAt", recipe.CreatedAt ?? nowIso);
                            cmd.Parameters.AddWithValue("@updatedAt", nowIso);
                            cmd.ExecuteNonQuery();
                        }

                        using (var delIng = new SQLiteCommand("DELETE FROM recipe_ingredients WHERE recipe_id = @rid;", conn, trans))
                        {
                            delIng.Parameters.AddWithValue("@rid", recipe.Id);
                            delIng.ExecuteNonQuery();
                        }

                        for (int i = 0; i < recipe.Ingredients.Count; i++)
                        {
                            var ing = recipe.Ingredients[i];
                            string ingId = "ring_" + Guid.NewGuid().ToString("N").Substring(0, 12);
                            using (var insIng = new SQLiteCommand(@"
                                INSERT INTO recipe_ingredients (
                                    id, recipe_id, ingredient_product_id, quantity_milli,
                                    wastage_percent, sort_order, created_at
                                ) VALUES (
                                    @id, @rid, @ipid, @qty,
                                    @waste, @ord, @now
                                );", conn, trans))
                            {
                                insIng.Parameters.AddWithValue("@id", ingId);
                                insIng.Parameters.AddWithValue("@rid", recipe.Id);
                                insIng.Parameters.AddWithValue("@ipid", ing.IngredientProductId);
                                insIng.Parameters.AddWithValue("@qty", ing.QuantityMilli);
                                insIng.Parameters.AddWithValue("@waste", Math.Max(0, Math.Min(100, ing.WastagePercent)));
                                insIng.Parameters.AddWithValue("@ord", i);
                                insIng.Parameters.AddWithValue("@now", nowIso);
                                insIng.ExecuteNonQuery();
                            }
                        }

                        var saved = GetByProductIdInternal(conn, trans, recipe.ProductId);
                        if (updateProductCost && saved != null && saved.EstimatedCostPiasters > 0)
                        {
                            long unitCost = (saved.EstimatedCostPiasters * 1000L) / Math.Max(1L, saved.YieldQtyMilli);
                            using (var uProd = new SQLiteCommand("UPDATE products SET cost_piasters = @cost, updated_at = @now WHERE id = @pid;", conn, trans))
                            {
                                uProd.Parameters.AddWithValue("@cost", unitCost);
                                uProd.Parameters.AddWithValue("@now", nowIso);
                                uProd.Parameters.AddWithValue("@pid", recipe.ProductId);
                                uProd.ExecuteNonQuery();
                            }
                        }

                        trans.Commit();
                        return saved;
                    }
                    catch
                    {
                        trans.Rollback();
                        throw;
                    }
                }
            }
        }

        public bool DeleteRecipe(string recipeId)
        {
            if (string.IsNullOrWhiteSpace(recipeId)) return false;
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        using (var cmd1 = new SQLiteCommand("DELETE FROM recipe_ingredients WHERE recipe_id = @id;", conn, trans))
                        {
                            cmd1.Parameters.AddWithValue("@id", recipeId);
                            cmd1.ExecuteNonQuery();
                        }
                        int rows;
                        using (var cmd2 = new SQLiteCommand("DELETE FROM recipes WHERE id = @id;", conn, trans))
                        {
                            cmd2.Parameters.AddWithValue("@id", recipeId);
                            rows = cmd2.ExecuteNonQuery();
                        }
                        trans.Commit();
                        return rows > 0;
                    }
                    catch
                    {
                        trans.Rollback();
                        throw;
                    }
                }
            }
        }

        public ProductionBatch ProduceBatch(string recipeId, long producedQtyMilli, string notes, string userId, string userName)
        {
            if (string.IsNullOrWhiteSpace(recipeId)) throw new ArgumentNullException("recipeId");
            if (producedQtyMilli <= 0) throw new InvalidOperationException("الكمية المنتجة يجب أن تكون أكبر من صفر.");

            string nowIso = DateTime.UtcNow.ToString("o");
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        string productId = null;
                        using (var cmd = new SQLiteCommand("SELECT product_id FROM recipes WHERE id = @id LIMIT 1;", conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@id", recipeId);
                            object pidObj = cmd.ExecuteScalar();
                            if (pidObj != null && pidObj != DBNull.Value) productId = pidObj.ToString();
                        }
                        if (string.IsNullOrEmpty(productId))
                            throw new InvalidOperationException("لم يتم العثور على الرسبي المحدد.");

                        var recipe = GetByProductIdInternal(conn, trans, productId);
                        if (recipe == null || recipe.Ingredients.Count == 0)
                            throw new InvalidOperationException("الرسبي لا يحتوي على مكونات خام.");

                        string batchId = "prd_" + Guid.NewGuid().ToString("N").Substring(0, 12);
                        string batchNumber = "B-" + DateTime.Now.ToString("yyyyMMdd-HHmmss");
                        long totalBatchCostPiasters = 0;

                        long yieldMilli = Math.Max(1L, recipe.YieldQtyMilli);

                        for (int i = 0; i < recipe.Ingredients.Count; i++)
                        {
                            var ing = recipe.Ingredients[i];
                            long effectiveIngMilli = (ing.QuantityMilli * (100L + ing.WastagePercent)) / 100L;
                            long requiredMilli = (producedQtyMilli * effectiveIngMilli) / yieldMilli;
                            if (requiredMilli <= 0) continue;

                            long ingLineCost = (ing.IngredientCostPiasters * requiredMilli) / 1000L;
                            totalBatchCostPiasters += ingLineCost;

                            using (var uIng = new SQLiteCommand("UPDATE products SET stock_quantity_milli = stock_quantity_milli - @qty, updated_at = @now WHERE id = @pid;", conn, trans))
                            {
                                uIng.Parameters.AddWithValue("@qty", requiredMilli);
                                uIng.Parameters.AddWithValue("@now", nowIso);
                                uIng.Parameters.AddWithValue("@pid", ing.IngredientProductId);
                                uIng.ExecuteNonQuery();
                            }

                            using (var smCmd = new SQLiteCommand(@"
                                INSERT INTO stock_movements (
                                    id, product_id, movement_type, quantity_milli,
                                    reference_id, reference_type, unit_cost_piasters, note, batch_number, created_at
                                ) VALUES (
                                    @id, @pid, 'PRODUCTION_CONSUMPTION', @qty,
                                    @refId, 'PRODUCTION_BATCH', @cost, @note, @bnum, @now
                                );", conn, trans))
                            {
                                smCmd.Parameters.AddWithValue("@id", Guid.NewGuid().ToString());
                                smCmd.Parameters.AddWithValue("@pid", ing.IngredientProductId);
                                smCmd.Parameters.AddWithValue("@qty", -requiredMilli);
                                smCmd.Parameters.AddWithValue("@refId", batchId);
                                smCmd.Parameters.AddWithValue("@cost", ing.IngredientCostPiasters);
                                smCmd.Parameters.AddWithValue("@note", string.Format("استهلاك خامات أمر إنتاج ({0}) للصنف: {1}", batchNumber, recipe.ProductName));
                                smCmd.Parameters.AddWithValue("@bnum", batchNumber);
                                smCmd.Parameters.AddWithValue("@now", nowIso);
                                smCmd.ExecuteNonQuery();
                            }
                        }

                        long unitCostPiasters = (totalBatchCostPiasters * 1000L) / producedQtyMilli;

                        using (var uFin = new SQLiteCommand("UPDATE products SET stock_quantity_milli = stock_quantity_milli + @qty, cost_piasters = CASE WHEN @unitCost > 0 THEN @unitCost ELSE cost_piasters END, updated_at = @now WHERE id = @pid;", conn, trans))
                        {
                            uFin.Parameters.AddWithValue("@qty", producedQtyMilli);
                            uFin.Parameters.AddWithValue("@unitCost", unitCostPiasters);
                            uFin.Parameters.AddWithValue("@now", nowIso);
                            uFin.Parameters.AddWithValue("@pid", recipe.ProductId);
                            uFin.ExecuteNonQuery();
                        }

                        using (var smOut = new SQLiteCommand(@"
                            INSERT INTO stock_movements (
                                id, product_id, movement_type, quantity_milli,
                                reference_id, reference_type, unit_cost_piasters, note, batch_number, created_at
                            ) VALUES (
                                @id, @pid, 'PRODUCTION_OUTPUT', @qty,
                                @refId, 'PRODUCTION_BATCH', @cost, @note, @bnum, @now
                            );", conn, trans))
                        {
                            smOut.Parameters.AddWithValue("@id", Guid.NewGuid().ToString());
                            smOut.Parameters.AddWithValue("@pid", recipe.ProductId);
                            smOut.Parameters.AddWithValue("@qty", producedQtyMilli);
                            smOut.Parameters.AddWithValue("@refId", batchId);
                            smOut.Parameters.AddWithValue("@cost", unitCostPiasters);
                            smOut.Parameters.AddWithValue("@note", string.Format("إنتاج دفعة جديدة ({0}) من الصنف: {1}", batchNumber, recipe.ProductName));
                            smOut.Parameters.AddWithValue("@bnum", batchNumber);
                            smOut.Parameters.AddWithValue("@now", nowIso);
                            smOut.ExecuteNonQuery();
                        }

                        var batch = new ProductionBatch
                        {
                            Id = batchId,
                            BatchNumber = batchNumber,
                            RecipeId = recipe.Id,
                            ProductId = recipe.ProductId,
                            ProductName = recipe.ProductName ?? recipe.Name,
                            ProducedQtyMilli = producedQtyMilli,
                            TotalCostPiasters = totalBatchCostPiasters,
                            UnitCostPiasters = unitCostPiasters,
                            ProducedByUserId = userId,
                            ProducedByName = userName ?? "",
                            Notes = notes ?? "",
                            CreatedAt = nowIso
                        };

                        using (var insBatch = new SQLiteCommand(@"
                            INSERT INTO production_batches (
                                id, batch_number, recipe_id, product_id, product_name,
                                produced_qty_milli, total_cost_piasters, unit_cost_piasters,
                                produced_by_user_id, produced_by_name, notes, created_at
                            ) VALUES (
                                @id, @bnum, @rid, @pid, @pname,
                                @qty, @totCost, @unitCost,
                                @uid, @uname, @notes, @now
                            );", conn, trans))
                        {
                            insBatch.Parameters.AddWithValue("@id", batch.Id);
                            insBatch.Parameters.AddWithValue("@bnum", batch.BatchNumber);
                            insBatch.Parameters.AddWithValue("@rid", batch.RecipeId);
                            insBatch.Parameters.AddWithValue("@pid", batch.ProductId);
                            insBatch.Parameters.AddWithValue("@pname", batch.ProductName);
                            insBatch.Parameters.AddWithValue("@qty", batch.ProducedQtyMilli);
                            insBatch.Parameters.AddWithValue("@totCost", batch.TotalCostPiasters);
                            insBatch.Parameters.AddWithValue("@unitCost", batch.UnitCostPiasters);
                            insBatch.Parameters.AddWithValue("@uid", (object)batch.ProducedByUserId ?? DBNull.Value);
                            insBatch.Parameters.AddWithValue("@uname", batch.ProducedByName);
                            insBatch.Parameters.AddWithValue("@notes", batch.Notes);
                            insBatch.Parameters.AddWithValue("@now", nowIso);
                            insBatch.ExecuteNonQuery();
                        }

                        if (_auditRepo != null)
                        {
                            _auditRepo.Log(conn, trans, new AuditLog
                            {
                                Id = "aud_" + Guid.NewGuid().ToString("N"),
                                UserId = string.IsNullOrEmpty(userId) ? "usr_admin_default" : userId,
                                Action = "RECIPE_PRODUCE_BATCH",
                                EntityType = "PRODUCTION_BATCH",
                                EntityId = batch.Id,
                                DetailsJson = string.Format("إنتاج دفعة {0} للصنف {1} بكمية {2} مللي وتكلفة {3} قرش", batch.BatchNumber, batch.ProductName, batch.ProducedQtyMilli, batch.TotalCostPiasters),
                                CreatedAt = nowIso
                            });
                        }

                        trans.Commit();
                        return batch;
                    }
                    catch
                    {
                        trans.Rollback();
                        throw;
                    }
                }
            }
        }

        public List<ProductionBatch> GetProductionLog(int limit = 100)
        {
            var list = new List<ProductionBatch>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "SELECT * FROM production_batches ORDER BY created_at DESC LIMIT @lim;";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@lim", limit > 0 ? limit : 100);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            list.Add(new ProductionBatch
                            {
                                Id = reader["id"].ToString(),
                                BatchNumber = reader["batch_number"].ToString(),
                                RecipeId = reader["recipe_id"].ToString(),
                                ProductId = reader["product_id"].ToString(),
                                ProductName = reader["product_name"].ToString(),
                                ProducedQtyMilli = Convert.ToInt64(reader["produced_qty_milli"]),
                                TotalCostPiasters = Convert.ToInt64(reader["total_cost_piasters"]),
                                UnitCostPiasters = Convert.ToInt64(reader["unit_cost_piasters"]),
                                ProducedByUserId = reader["produced_by_user_id"] != DBNull.Value ? reader["produced_by_user_id"].ToString() : null,
                                ProducedByName = reader["produced_by_name"] != DBNull.Value ? reader["produced_by_name"].ToString() : "",
                                Notes = reader["notes"] != DBNull.Value ? reader["notes"].ToString() : "",
                                CreatedAt = reader["created_at"].ToString()
                            });
                        }
                    }
                }
            }
            return list;
        }

        /// <summary>
        /// خصم الخامات تلقائياً عند بيع صنف مربوط برسبي (on_sale) أو إضافات مربوطة بخامات داخل نفس الترانزاكشن الذري للبيع
        /// </summary>
        public bool DepleteRecipeForSaleItemAtomic(SQLiteConnection conn, SQLiteTransaction trans, Sale sale, SaleItem item, string nowIso)
        {
            if (item == null || string.IsNullOrWhiteSpace(item.ProductId)) return false;

            bool depletedRecipe = false;
            var recipe = GetByProductIdInternal(conn, trans, item.ProductId);
            if (recipe != null && recipe.IsActive && string.Equals(recipe.DepletionMode, "on_sale", StringComparison.OrdinalIgnoreCase) && recipe.Ingredients.Count > 0)
            {
                long yieldMilli = Math.Max(1L, recipe.YieldQtyMilli);
                int factor = item.ConversionFactor > 0 ? item.ConversionFactor : 1;
                long soldBaseMilli = item.QuantityMilli * factor;

                for (int i = 0; i < recipe.Ingredients.Count; i++)
                {
                    var ing = recipe.Ingredients[i];
                    long effectiveIngMilli = (ing.QuantityMilli * (100L + ing.WastagePercent)) / 100L;
                    long deductMilli = (soldBaseMilli * effectiveIngMilli) / yieldMilli;
                    if (deductMilli <= 0) continue;

                    using (var uIng = new SQLiteCommand("UPDATE products SET stock_quantity_milli = stock_quantity_milli - @qty, updated_at = @now WHERE id = @pid;", conn, trans))
                    {
                        uIng.Parameters.AddWithValue("@qty", deductMilli);
                        uIng.Parameters.AddWithValue("@now", nowIso);
                        uIng.Parameters.AddWithValue("@pid", ing.IngredientProductId);
                        uIng.ExecuteNonQuery();
                    }

                    using (var smCmd = new SQLiteCommand(@"
                        INSERT INTO stock_movements (
                            id, product_id, movement_type, quantity_milli,
                            reference_id, reference_type, unit_cost_piasters, note, batch_number, created_at
                        ) VALUES (
                            @id, @pid, 'RECIPE_SALE_CONSUMPTION', @qty,
                            @refId, 'SALE', @cost, @note, NULL, @now
                        );", conn, trans))
                    {
                        smCmd.Parameters.AddWithValue("@id", Guid.NewGuid().ToString());
                        smCmd.Parameters.AddWithValue("@pid", ing.IngredientProductId);
                        smCmd.Parameters.AddWithValue("@qty", -deductMilli);
                        smCmd.Parameters.AddWithValue("@refId", sale.Id);
                        smCmd.Parameters.AddWithValue("@cost", ing.IngredientCostPiasters);
                        smCmd.Parameters.AddWithValue("@note", string.Format("خصم خامات رسبي للصنف ({0}) - فاتورة #{1}", item.ProductName, sale.InvoiceNumber));
                        smCmd.Parameters.AddWithValue("@now", nowIso);
                        smCmd.ExecuteNonQuery();
                    }
                }
                depletedRecipe = true;
            }

            // Deduct linked ingredients for item modifiers if present
            if (item.Modifiers != null && item.Modifiers.Count > 0)
            {
                for (int m = 0; m < item.Modifiers.Count; m++)
                {
                    var mod = item.Modifiers[m];
                    if (mod == null || string.IsNullOrWhiteSpace(mod.OptionId)) continue;

                    string linkedIngId = null;
                    long linkedQtyMilli = 0;
                    long ingCost = 0;

                    using (var optCmd = new SQLiteCommand(@"
                        SELECT o.linked_ingredient_id, o.linked_qty_milli, COALESCE(p.cost_piasters, o.cost_piasters, 0) AS ing_cost
                        FROM modifier_options o
                        LEFT JOIN products p ON o.linked_ingredient_id = p.id
                        WHERE o.id = @oid LIMIT 1;", conn, trans))
                    {
                        optCmd.Parameters.AddWithValue("@oid", mod.OptionId);
                        using (var reader = optCmd.ExecuteReader())
                        {
                            if (reader.Read())
                            {
                                linkedIngId = reader["linked_ingredient_id"] != DBNull.Value ? reader["linked_ingredient_id"].ToString() : null;
                                linkedQtyMilli = reader["linked_qty_milli"] != DBNull.Value ? Convert.ToInt64(reader["linked_qty_milli"]) : 0;
                                ingCost = reader["ing_cost"] != DBNull.Value ? Convert.ToInt64(reader["ing_cost"]) : 0;
                            }
                        }
                    }

                    if (!string.IsNullOrWhiteSpace(linkedIngId) && linkedQtyMilli > 0)
                    {
                        long totalModIngMilli = (linkedQtyMilli * item.QuantityMilli) / 1000L;
                        if (totalModIngMilli > 0)
                        {
                            using (var uIng = new SQLiteCommand("UPDATE products SET stock_quantity_milli = stock_quantity_milli - @qty, updated_at = @now WHERE id = @pid;", conn, trans))
                            {
                                uIng.Parameters.AddWithValue("@qty", totalModIngMilli);
                                uIng.Parameters.AddWithValue("@now", nowIso);
                                uIng.Parameters.AddWithValue("@pid", linkedIngId);
                                uIng.ExecuteNonQuery();
                            }

                            using (var smCmd = new SQLiteCommand(@"
                                INSERT INTO stock_movements (
                                    id, product_id, movement_type, quantity_milli,
                                    reference_id, reference_type, unit_cost_piasters, note, batch_number, created_at
                                ) VALUES (
                                    @id, @pid, 'RECIPE_SALE_CONSUMPTION', @qty,
                                    @refId, 'SALE', @cost, @note, NULL, @now
                                );", conn, trans))
                            {
                                smCmd.Parameters.AddWithValue("@id", Guid.NewGuid().ToString());
                                smCmd.Parameters.AddWithValue("@pid", linkedIngId);
                                smCmd.Parameters.AddWithValue("@qty", -totalModIngMilli);
                                smCmd.Parameters.AddWithValue("@refId", sale.Id);
                                smCmd.Parameters.AddWithValue("@cost", ingCost);
                                smCmd.Parameters.AddWithValue("@note", string.Format("خصم خامة إضافة ({0}) - فاتورة #{1}", mod.OptionName, sale.InvoiceNumber));
                                smCmd.Parameters.AddWithValue("@now", nowIso);
                                smCmd.ExecuteNonQuery();
                            }
                        }
                    }
                }
            }

            return depletedRecipe;
        }

        /// <summary>
        /// استرجاع الخامات المخصومة بالرسبي عند إلغاء فاتورة مبيعات
        /// </summary>
        public static void ReverseRecipeConsumptionOnCancelAtomic(SQLiteConnection conn, SQLiteTransaction trans, string saleId, int invoiceNumber, string nowIso)
        {
            var movements = new List<Tuple<string, long, long>>();
            using (var cmd = new SQLiteCommand(@"
                SELECT product_id, ABS(quantity_milli) AS qty, unit_cost_piasters
                FROM stock_movements
                WHERE reference_id = @sid AND movement_type = 'RECIPE_SALE_CONSUMPTION';
            ", conn, trans))
            {
                cmd.Parameters.AddWithValue("@sid", saleId);
                using (var reader = cmd.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        movements.Add(new Tuple<string, long, long>(
                            reader["product_id"].ToString(),
                            Convert.ToInt64(reader["qty"]),
                            Convert.ToInt64(reader["unit_cost_piasters"])
                        ));
                    }
                }
            }

            for (int i = 0; i < movements.Count; i++)
            {
                var mv = movements[i];
                if (mv.Item2 <= 0) continue;

                using (var uCmd = new SQLiteCommand("UPDATE products SET stock_quantity_milli = stock_quantity_milli + @qty, updated_at = @now WHERE id = @pid;", conn, trans))
                {
                    uCmd.Parameters.AddWithValue("@qty", mv.Item2);
                    uCmd.Parameters.AddWithValue("@now", nowIso);
                    uCmd.Parameters.AddWithValue("@pid", mv.Item1);
                    uCmd.ExecuteNonQuery();
                }

                using (var smCmd = new SQLiteCommand(@"
                    INSERT INTO stock_movements (
                        id, product_id, movement_type, quantity_milli,
                        reference_id, reference_type, unit_cost_piasters, note, batch_number, created_at
                    ) VALUES (
                        @id, @pid, 'RECIPE_SALE_REVERSAL', @qty,
                        @refId, 'SALE_CANCEL', @cost, @note, NULL, @now
                    );", conn, trans))
                {
                    smCmd.Parameters.AddWithValue("@id", Guid.NewGuid().ToString());
                    smCmd.Parameters.AddWithValue("@pid", mv.Item1);
                    smCmd.Parameters.AddWithValue("@qty", mv.Item2);
                    smCmd.Parameters.AddWithValue("@refId", saleId);
                    smCmd.Parameters.AddWithValue("@cost", mv.Item3);
                    smCmd.Parameters.AddWithValue("@note", "عكس استهلاك خامات رسبي لإلغاء فاتورة #" + invoiceNumber);
                    smCmd.Parameters.AddWithValue("@now", nowIso);
                    smCmd.ExecuteNonQuery();
                }
            }
        }

        private static Recipe MapRecipe(SQLiteDataReader reader)
        {
            var r = new Recipe
            {
                Id = reader["id"].ToString(),
                ProductId = reader["product_id"].ToString(),
                Name = reader["name"].ToString(),
                YieldQtyMilli = reader["yield_qty_milli"] != DBNull.Value ? Convert.ToInt64(reader["yield_qty_milli"]) : 1000,
                DepletionMode = reader["depletion_mode"] != DBNull.Value ? reader["depletion_mode"].ToString() : "on_sale",
                Notes = reader["notes"] != DBNull.Value ? reader["notes"].ToString() : "",
                IsActive = reader["is_active"] != DBNull.Value && Convert.ToInt32(reader["is_active"]) == 1,
                CreatedAt = reader["created_at"].ToString(),
                UpdatedAt = reader["updated_at"].ToString(),
                Ingredients = new List<RecipeIngredient>()
            };
            try
            {
                r.ProductName = reader["product_name"] != DBNull.Value ? reader["product_name"].ToString() : r.Name;
                r.ProductPricePiasters = reader["product_price_piasters"] != DBNull.Value ? Convert.ToInt64(reader["product_price_piasters"]) : 0;
            }
            catch { }
            return r;
        }

        private static RecipeIngredient MapIngredient(SQLiteDataReader reader)
        {
            var ing = new RecipeIngredient
            {
                Id = reader["id"].ToString(),
                RecipeId = reader["recipe_id"].ToString(),
                IngredientProductId = reader["ingredient_product_id"].ToString(),
                QuantityMilli = reader["quantity_milli"] != DBNull.Value ? Convert.ToInt64(reader["quantity_milli"]) : 0,
                WastagePercent = reader["wastage_percent"] != DBNull.Value ? Convert.ToInt32(reader["wastage_percent"]) : 0,
                SortOrder = reader["sort_order"] != DBNull.Value ? Convert.ToInt32(reader["sort_order"]) : 0,
                CreatedAt = reader["created_at"].ToString()
            };
            try
            {
                ing.IngredientProductName = reader["ingredient_name"] != DBNull.Value ? reader["ingredient_name"].ToString() : "";
                ing.IngredientUnit = reader["ingredient_unit"] != DBNull.Value ? reader["ingredient_unit"].ToString() : "piece";
                ing.IngredientCostPiasters = reader["ingredient_cost_piasters"] != DBNull.Value ? Convert.ToInt64(reader["ingredient_cost_piasters"]) : 0;
                ing.IngredientStockMilli = reader["ingredient_stock_milli"] != DBNull.Value ? Convert.ToInt64(reader["ingredient_stock_milli"]) : 0;
                long effMilli = (ing.QuantityMilli * (100L + ing.WastagePercent)) / 100L;
                ing.LineCostPiasters = (ing.IngredientCostPiasters * effMilli) / 1000L;
            }
            catch { }
            return ing;
        }
    }
}
