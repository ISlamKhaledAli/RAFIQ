using System;
using System.Collections.Generic;
using System.Data.SQLite;
using RafiqPOS.Models;
using RafiqPOS.Common;

namespace RafiqPOS.Repositories
{
    public class ProductVariantRepository
    {
        private readonly string _connectionString;

        public ProductVariantRepository(string connectionString)
        {
            _connectionString = connectionString;
        }

        public ParentProductWithVariants CreateMatrix(CreateVariantMatrixRequest request)
        {
            if (request == null) throw new ArgumentNullException("request");
            if (string.IsNullOrWhiteSpace(request.ParentName)) throw new ArgumentException("اسم المنتج الأب مطلوب");
            if (request.MatrixCells == null || request.MatrixCells.Count == 0) throw new ArgumentException("يجب تحديد تركيبة واحدة على الأقل");

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        string now = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ");

                        // 1. Ensure or Create Parent Product
                        string parentId = request.ParentProductId;
                        if (string.IsNullOrWhiteSpace(parentId))
                        {
                            parentId = Guid.NewGuid().ToString("N");
                            string parentSql = @"
                                INSERT INTO products (
                                    id, name, normalized_name, category_id,
                                    price_piasters, cost_piasters, stock_quantity_milli, min_stock_quantity_milli,
                                    unit, is_active, has_variants, created_at, updated_at
                                ) VALUES (
                                    @id, @name, @normalized_name, @category_id,
                                    @price_piasters, @cost_piasters, 0, @min_stock,
                                    'piece', 1, 1, @created_at, @updated_at
                                );
                            ";
                            using (var cmd = new SQLiteCommand(parentSql, conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@id", parentId);
                                cmd.Parameters.AddWithValue("@name", request.ParentName.Trim());
                                cmd.Parameters.AddWithValue("@normalized_name", ArabicTextNormalizer.Normalize(request.ParentName));
                                cmd.Parameters.AddWithValue("@category_id", (object)request.CategoryId ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@price_piasters", request.DefaultPricePiasters);
                                cmd.Parameters.AddWithValue("@cost_piasters", request.DefaultCostPiasters);
                                cmd.Parameters.AddWithValue("@min_stock", request.DefaultMinStockQuantityMilli > 0 ? request.DefaultMinStockQuantityMilli : 5000);
                                cmd.Parameters.AddWithValue("@created_at", now);
                                cmd.Parameters.AddWithValue("@updated_at", now);
                                cmd.ExecuteNonQuery();
                            }
                        }
                        else
                        {
                            // Update existing product to be marked as parent with variants
                            string updateParentSql = @"
                                UPDATE products
                                SET has_variants = 1, updated_at = @updated_at
                                WHERE id = @id;
                            ";
                            using (var cmd = new SQLiteCommand(updateParentSql, conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@id", parentId);
                                cmd.Parameters.AddWithValue("@updated_at", now);
                                cmd.ExecuteNonQuery();
                            }
                        }

                        var createdVariants = new List<ProductVariant>();
                        long totalParentStockMilli = 0;

                        // 2. Insert or update each enabled matrix cell
                        foreach (var cell in request.MatrixCells)
                        {
                            if (!cell.IsEnabled) continue;

                            string variantBarcode = cell.Barcode;
                            if (string.IsNullOrWhiteSpace(variantBarcode))
                            {
                                variantBarcode = GenerateUniqueVariantBarcode(conn, trans);
                            }
                            else
                            {
                                variantBarcode = variantBarcode.Trim();
                            }

                            string variantProdId = Guid.NewGuid().ToString("N");
                            string variantRelationId = Guid.NewGuid().ToString("N");
                            string variantName = string.Format("{0} - {1} - {2}", request.ParentName.Trim(), cell.Color ?? "", cell.Size ?? "").Trim();

                            long price = cell.PricePiasters > 0 ? cell.PricePiasters : request.DefaultPricePiasters;
                            long cost = cell.CostPiasters > 0 ? cell.CostPiasters : request.DefaultCostPiasters;
                            long minStock = cell.MinStockQuantityMilli > 0 ? cell.MinStockQuantityMilli : request.DefaultMinStockQuantityMilli;
                            long stock = cell.StockQuantityMilli;

                            totalParentStockMilli += stock;

                            // Insert into products table as sellable item with parent_id
                            string insertProdSql = @"
                                INSERT INTO products (
                                    id, barcode, name, normalized_name, category_id,
                                    price_piasters, cost_piasters, stock_quantity_milli, min_stock_quantity_milli,
                                    unit, is_active, parent_id, variant_size, variant_color, variant_sku,
                                    created_at, updated_at
                                ) VALUES (
                                    @id, @barcode, @name, @normalized_name, @category_id,
                                    @price_piasters, @cost_piasters, @stock, @min_stock,
                                    'piece', 1, @parent_id, @size, @color, @sku,
                                    @created_at, @updated_at
                                );
                            ";
                            using (var cmd = new SQLiteCommand(insertProdSql, conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@id", variantProdId);
                                cmd.Parameters.AddWithValue("@barcode", variantBarcode);
                                cmd.Parameters.AddWithValue("@name", variantName);
                                cmd.Parameters.AddWithValue("@normalized_name", ArabicTextNormalizer.Normalize(variantName));
                                cmd.Parameters.AddWithValue("@category_id", (object)request.CategoryId ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@price_piasters", price);
                                cmd.Parameters.AddWithValue("@cost_piasters", cost);
                                cmd.Parameters.AddWithValue("@stock", stock);
                                cmd.Parameters.AddWithValue("@min_stock", minStock > 0 ? minStock : 5000);
                                cmd.Parameters.AddWithValue("@parent_id", parentId);
                                cmd.Parameters.AddWithValue("@size", (object)cell.Size ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@color", (object)cell.Color ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@sku", (object)cell.Sku ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@created_at", now);
                                cmd.Parameters.AddWithValue("@updated_at", now);
                                cmd.ExecuteNonQuery();
                            }

                            // Insert into product_variants normalization table
                            string insertVariantSql = @"
                                INSERT INTO product_variants (
                                    id, parent_product_id, variant_product_id,
                                    size, color, sku, barcode,
                                    price_piasters, cost_piasters, stock_quantity_milli, min_stock_quantity_milli,
                                    created_at, updated_at
                                ) VALUES (
                                    @id, @parent_id, @variant_prod_id,
                                    @size, @color, @sku, @barcode,
                                    @price, @cost, @stock, @min_stock,
                                    @created_at, @updated_at
                                );
                            ";
                            using (var cmd = new SQLiteCommand(insertVariantSql, conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@id", variantRelationId);
                                cmd.Parameters.AddWithValue("@parent_id", parentId);
                                cmd.Parameters.AddWithValue("@variant_prod_id", variantProdId);
                                cmd.Parameters.AddWithValue("@size", (object)cell.Size ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@color", (object)cell.Color ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@sku", (object)cell.Sku ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@barcode", variantBarcode);
                                cmd.Parameters.AddWithValue("@price", price);
                                cmd.Parameters.AddWithValue("@cost", cost);
                                cmd.Parameters.AddWithValue("@stock", stock);
                                cmd.Parameters.AddWithValue("@min_stock", minStock > 0 ? minStock : 5000);
                                cmd.Parameters.AddWithValue("@created_at", now);
                                cmd.Parameters.AddWithValue("@updated_at", now);
                                cmd.ExecuteNonQuery();
                            }

                            // Insert initial stock movement if stock > 0
                            if (stock > 0)
                            {
                                string smSql = @"
                                    INSERT INTO stock_movements (
                                        id, product_id, movement_type, quantity_milli,
                                        reference_id, reference_type, unit_cost_piasters,
                                        note, created_at
                                    ) VALUES (
                                        @id, @product_id, 'IN', @qty,
                                        @ref_id, 'OPENING_BALANCE', @unit_cost,
                                        'رصيد افتتاحي لتركيبة المنتج', @created_at
                                    );
                                ";
                                using (var cmd = new SQLiteCommand(smSql, conn, trans))
                                {
                                    cmd.Parameters.AddWithValue("@id", Guid.NewGuid().ToString("N"));
                                    cmd.Parameters.AddWithValue("@product_id", variantProdId);
                                    cmd.Parameters.AddWithValue("@qty", stock);
                                    cmd.Parameters.AddWithValue("@ref_id", variantRelationId);
                                    cmd.Parameters.AddWithValue("@unit_cost", cost);
                                    cmd.Parameters.AddWithValue("@created_at", now);
                                    cmd.ExecuteNonQuery();
                                }
                            }

                            createdVariants.Add(new ProductVariant
                            {
                                Id = variantRelationId,
                                ParentProductId = parentId,
                                VariantProductId = variantProdId,
                                Size = cell.Size,
                                Color = cell.Color,
                                Sku = cell.Sku,
                                Barcode = variantBarcode,
                                PricePiasters = price,
                                CostPiasters = cost,
                                StockQuantityMilli = stock,
                                MinStockQuantityMilli = minStock,
                                CreatedAt = now,
                                UpdatedAt = now
                            });
                        }

                        // 3. Update parent product stock to reflect total
                        string updateStockSql = "UPDATE products SET stock_quantity_milli = @total WHERE id = @id;";
                        using (var cmd = new SQLiteCommand(updateStockSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@total", totalParentStockMilli);
                            cmd.Parameters.AddWithValue("@id", parentId);
                            cmd.ExecuteNonQuery();
                        }

                        trans.Commit();

                        ParentProductWithVariants result = new ParentProductWithVariants();
                        result.ParentProduct = new Product
                        {
                            Id = parentId,
                            Name = request.ParentName,
                            HasVariants = true,
                            StockQuantityMilli = totalParentStockMilli
                        };
                        result.Variants = createdVariants;
                        result.TotalStockMilli = totalParentStockMilli;
                        result.TotalVariantsCount = createdVariants.Count;
                        return result;
                    }
                    catch
                    {
                        trans.Rollback();
                        throw;
                    }
                }
            }
        }

        public List<ProductVariant> GetVariantsByParentId(string parentId)
        {
            var list = new List<ProductVariant>();
            if (string.IsNullOrWhiteSpace(parentId)) return list;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT pv.*, p.stock_quantity_milli as current_stock, p.price_piasters as current_price, p.cost_piasters as current_cost
                    FROM product_variants pv
                    INNER JOIN products p ON pv.variant_product_id = p.id
                    WHERE pv.parent_product_id = @pid AND p.is_active = 1
                    ORDER BY pv.color ASC, pv.size ASC;
                ";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@pid", parentId);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            list.Add(new ProductVariant
                            {
                                Id = reader["id"].ToString(),
                                ParentProductId = reader["parent_product_id"].ToString(),
                                VariantProductId = reader["variant_product_id"].ToString(),
                                Size = reader["size"] != DBNull.Value ? reader["size"].ToString() : "",
                                Color = reader["color"] != DBNull.Value ? reader["color"].ToString() : "",
                                Sku = reader["sku"] != DBNull.Value ? reader["sku"].ToString() : "",
                                Barcode = reader["barcode"] != DBNull.Value ? reader["barcode"].ToString() : "",
                                PricePiasters = Convert.ToInt64(reader["current_price"]),
                                CostPiasters = Convert.ToInt64(reader["current_cost"]),
                                StockQuantityMilli = Convert.ToInt64(reader["current_stock"]),
                                MinStockQuantityMilli = Convert.ToInt64(reader["min_stock_quantity_milli"]),
                                CreatedAt = reader["created_at"].ToString(),
                                UpdatedAt = reader["updated_at"].ToString()
                            });
                        }
                    }
                }
            }
            return list;
        }

        public ParentProductWithVariants GetParentWithVariants(string parentId)
        {
            var variants = GetVariantsByParentId(parentId);
            Product parent = null;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "SELECT * FROM products WHERE id = @id LIMIT 1;";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", parentId);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            parent = new Product
                            {
                                Id = reader["id"].ToString(),
                                Name = reader["name"].ToString(),
                                Barcode = reader["barcode"] != DBNull.Value ? reader["barcode"].ToString() : "",
                                HasVariants = true,
                                StockQuantityMilli = Convert.ToInt64(reader["stock_quantity_milli"]),
                                PricePiasters = Convert.ToInt64(reader["price_piasters"]),
                                CostPiasters = Convert.ToInt64(reader["cost_piasters"])
                            };
                        }
                    }
                }
            }

            long totalStock = 0;
            foreach (var v in variants)
            {
                totalStock += v.StockQuantityMilli;
            }

            ParentProductWithVariants result = new ParentProductWithVariants();
            result.ParentProduct = parent;
            result.Variants = variants;
            result.TotalStockMilli = totalStock;
            result.TotalVariantsCount = variants.Count;
            return result;
        }

        public List<ParentProductWithVariants> GetVariantMatrixReport()
        {
            var list = new List<ParentProductWithVariants>();

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string parentSql = @"
                    SELECT * FROM products
                    WHERE has_variants = 1 AND is_active = 1
                    ORDER BY name ASC;
                ";

                var parents = new List<Product>();
                using (var cmd = new SQLiteCommand(parentSql, conn))
                using (var reader = cmd.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        parents.Add(new Product
                        {
                            Id = reader["id"].ToString(),
                            Name = reader["name"].ToString(),
                            PricePiasters = Convert.ToInt64(reader["price_piasters"]),
                            CostPiasters = Convert.ToInt64(reader["cost_piasters"]),
                            StockQuantityMilli = Convert.ToInt64(reader["stock_quantity_milli"])
                        });
                    }
                }

                foreach (var parent in parents)
                {
                    var variants = GetVariantsByParentId(parent.Id);
                    long totalStock = 0;
                    foreach (var v in variants)
                    {
                        totalStock += v.StockQuantityMilli;
                    }

                    list.Add(new ParentProductWithVariants
                    {
                        ParentProduct = parent,
                        Variants = variants,
                        TotalStockMilli = totalStock,
                        TotalVariantsCount = variants.Count
                    });
                }
            }

            return list;
        }

        private static string GenerateUniqueVariantBarcode(SQLiteConnection conn, SQLiteTransaction trans)
        {
            var rnd = new Random();
            for (int i = 0; i < 50; i++)
            {
                // Prefix 214 for variants (conforming to supermarket internal barcode formats)
                string candidate = "214" + rnd.Next(100000000, 999999999).ToString();
                string checkSql = "SELECT COUNT(*) FROM products WHERE barcode = @b;";
                using (var cmd = new SQLiteCommand(checkSql, conn, trans))
                {
                    cmd.Parameters.AddWithValue("@b", candidate);
                    long count = Convert.ToInt64(cmd.ExecuteScalar());
                    if (count == 0)
                    {
                        return candidate;
                    }
                }
            }
            return "214" + DateTime.UtcNow.Ticks.ToString().Substring(8, 9);
        }
    }
}

