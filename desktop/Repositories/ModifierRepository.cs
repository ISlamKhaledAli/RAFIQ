using System;
using System.Collections.Generic;
using System.Data.SQLite;
using RafiqPOS.Models;

namespace RafiqPOS.Repositories
{
    public class ModifierRepository
    {
        private readonly string _connectionString;

        public ModifierRepository(string connectionString)
        {
            _connectionString = connectionString;
        }

        public List<ModifierGroup> GetAllGroups(bool includeInactive = false)
        {
            var groups = new List<ModifierGroup>();
            var groupMap = new Dictionary<string, ModifierGroup>();

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sqlGroups = @"
                    SELECT * FROM modifier_groups
                    WHERE (@inc = 1 OR is_active = 1)
                    ORDER BY display_order ASC, name ASC;
                ";
                using (var cmd = new SQLiteCommand(sqlGroups, conn))
                {
                    cmd.Parameters.AddWithValue("@inc", includeInactive ? 1 : 0);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            var g = MapGroup(reader);
                            groups.Add(g);
                            groupMap[g.Id] = g;
                        }
                    }
                }

                if (groups.Count > 0)
                {
                    string sqlOpts = @"
                        SELECT o.*, p.name AS ingredient_name
                        FROM modifier_options o
                        LEFT JOIN products p ON o.linked_ingredient_id = p.id
                        WHERE (@inc = 1 OR o.is_active = 1)
                        ORDER BY o.display_order ASC, o.name ASC;
                    ";
                    using (var cmd = new SQLiteCommand(sqlOpts, conn))
                    {
                        cmd.Parameters.AddWithValue("@inc", includeInactive ? 1 : 0);
                        using (var reader = cmd.ExecuteReader())
                        {
                            while (reader.Read())
                            {
                                var opt = MapOption(reader);
                                ModifierGroup parent;
                                if (groupMap.TryGetValue(opt.GroupId, out parent))
                                {
                                    parent.Options.Add(opt);
                                }
                            }
                        }
                    }
                }
            }

            return groups;
        }

        public List<ModifierGroup> GetGroupsForProduct(string productId)
        {
            var result = new List<ModifierGroup>();
            if (string.IsNullOrWhiteSpace(productId)) return result;

            var groupMap = new Dictionary<string, ModifierGroup>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT g.*
                    FROM product_modifier_groups pmg
                    JOIN modifier_groups g ON pmg.group_id = g.id
                    WHERE pmg.product_id = @pid AND g.is_active = 1
                    ORDER BY pmg.display_order ASC, g.display_order ASC;
                ";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@pid", productId);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            var g = MapGroup(reader);
                            result.Add(g);
                            groupMap[g.Id] = g;
                        }
                    }
                }

                if (result.Count > 0)
                {
                    string sqlOpts = @"
                        SELECT o.*, p.name AS ingredient_name
                        FROM modifier_options o
                        LEFT JOIN products p ON o.linked_ingredient_id = p.id
                        WHERE o.is_active = 1
                        ORDER BY o.display_order ASC, o.name ASC;
                    ";
                    using (var cmd = new SQLiteCommand(sqlOpts, conn))
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            var opt = MapOption(reader);
                            ModifierGroup parent;
                            if (groupMap.TryGetValue(opt.GroupId, out parent))
                            {
                                parent.Options.Add(opt);
                            }
                        }
                    }
                }
            }

            return result;
        }

        public ModifierOption GetOptionById(string optionId)
        {
            if (string.IsNullOrWhiteSpace(optionId)) return null;
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT o.*, p.name AS ingredient_name
                    FROM modifier_options o
                    LEFT JOIN products p ON o.linked_ingredient_id = p.id
                    WHERE o.id = @id
                    LIMIT 1;
                ";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", optionId);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            return MapOption(reader);
                        }
                    }
                }
            }
            return null;
        }

        public ModifierGroup SaveGroup(ModifierGroup group)
        {
            if (group == null) throw new ArgumentNullException("group");
            if (string.IsNullOrWhiteSpace(group.Name)) throw new InvalidOperationException("اسم مجموعة الإضافات مطلوب");

            string nowIso = DateTime.UtcNow.ToString("o");
            if (string.IsNullOrWhiteSpace(group.Id))
            {
                group.Id = "mgrp_" + Guid.NewGuid().ToString("N").Substring(0, 12);
                group.CreatedAt = nowIso;
            }
            if (string.IsNullOrWhiteSpace(group.SelectionType))
            {
                group.SelectionType = "multiple";
            }
            if (group.MaxSelections <= 0)
            {
                group.MaxSelections = group.SelectionType == "single" ? 1 : 5;
            }
            group.UpdatedAt = nowIso;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        string sql = @"
                            INSERT INTO modifier_groups (
                                id, name, selection_type, is_required, min_selections, max_selections,
                                display_order, is_active, created_at, updated_at
                            ) VALUES (
                                @id, @name, @selType, @req, @minSel, @maxSel,
                                @order, @active, @createdAt, @updatedAt
                            )
                            ON CONFLICT(id) DO UPDATE SET
                                name = excluded.name,
                                selection_type = excluded.selection_type,
                                is_required = excluded.is_required,
                                min_selections = excluded.min_selections,
                                max_selections = excluded.max_selections,
                                display_order = excluded.display_order,
                                is_active = excluded.is_active,
                                updated_at = excluded.updated_at;
                        ";
                        using (var cmd = new SQLiteCommand(sql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@id", group.Id);
                            cmd.Parameters.AddWithValue("@name", group.Name.Trim());
                            cmd.Parameters.AddWithValue("@selType", group.SelectionType);
                            cmd.Parameters.AddWithValue("@req", group.IsRequired ? 1 : 0);
                            cmd.Parameters.AddWithValue("@minSel", Math.Max(0, group.MinSelections));
                            cmd.Parameters.AddWithValue("@maxSel", Math.Max(1, group.MaxSelections));
                            cmd.Parameters.AddWithValue("@order", group.DisplayOrder);
                            cmd.Parameters.AddWithValue("@active", group.IsActive ? 1 : 0);
                            cmd.Parameters.AddWithValue("@createdAt", group.CreatedAt ?? nowIso);
                            cmd.Parameters.AddWithValue("@updatedAt", nowIso);
                            cmd.ExecuteNonQuery();
                        }

                        if (group.Options != null)
                        {
                            for (int i = 0; i < group.Options.Count; i++)
                            {
                                var opt = group.Options[i];
                                if (opt == null || string.IsNullOrWhiteSpace(opt.Name)) continue;
                                opt.GroupId = group.Id;
                                SaveOptionInternal(conn, trans, opt, nowIso);
                            }
                        }

                        trans.Commit();
                    }
                    catch
                    {
                        trans.Rollback();
                        throw;
                    }
                }
            }

            var all = GetAllGroups(true);
            for (int i = 0; i < all.Count; i++)
            {
                if (all[i].Id == group.Id) return all[i];
            }
            return group;
        }

        public bool DeleteGroup(string groupId)
        {
            if (string.IsNullOrWhiteSpace(groupId)) return false;
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        using (var cmd1 = new SQLiteCommand("DELETE FROM product_modifier_groups WHERE group_id = @id;", conn, trans))
                        {
                            cmd1.Parameters.AddWithValue("@id", groupId);
                            cmd1.ExecuteNonQuery();
                        }
                        using (var cmd2 = new SQLiteCommand("DELETE FROM modifier_options WHERE group_id = @id;", conn, trans))
                        {
                            cmd2.Parameters.AddWithValue("@id", groupId);
                            cmd2.ExecuteNonQuery();
                        }
                        int rows;
                        using (var cmd3 = new SQLiteCommand("DELETE FROM modifier_groups WHERE id = @id;", conn, trans))
                        {
                            cmd3.Parameters.AddWithValue("@id", groupId);
                            rows = cmd3.ExecuteNonQuery();
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

        public ModifierOption SaveOption(ModifierOption option)
        {
            if (option == null) throw new ArgumentNullException("option");
            if (string.IsNullOrWhiteSpace(option.GroupId)) throw new InvalidOperationException("يجب تحديد مجموعة الإضافات");
            if (string.IsNullOrWhiteSpace(option.Name)) throw new InvalidOperationException("اسم الإضافة مطلوب");
            if (option.ExtraPricePiasters < 0) throw new InvalidOperationException("سعر الإضافة لا يمكن أن يكون سالباً");

            string nowIso = DateTime.UtcNow.ToString("o");
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        SaveOptionInternal(conn, trans, option, nowIso);
                        trans.Commit();
                    }
                    catch
                    {
                        trans.Rollback();
                        throw;
                    }
                }
            }
            return GetOptionById(option.Id) ?? option;
        }

        private static void SaveOptionInternal(SQLiteConnection conn, SQLiteTransaction trans, ModifierOption option, string nowIso)
        {
            if (string.IsNullOrWhiteSpace(option.Id))
            {
                option.Id = "mopt_" + Guid.NewGuid().ToString("N").Substring(0, 12);
                option.CreatedAt = nowIso;
            }
            string sql = @"
                INSERT INTO modifier_options (
                    id, group_id, name, extra_price_piasters, cost_piasters,
                    linked_ingredient_id, linked_qty_milli, is_default,
                    display_order, is_active, created_at
                ) VALUES (
                    @id, @groupId, @name, @price, @cost,
                    @ingId, @ingQty, @isDef,
                    @order, @active, @createdAt
                )
                ON CONFLICT(id) DO UPDATE SET
                    group_id = excluded.group_id,
                    name = excluded.name,
                    extra_price_piasters = excluded.extra_price_piasters,
                    cost_piasters = excluded.cost_piasters,
                    linked_ingredient_id = excluded.linked_ingredient_id,
                    linked_qty_milli = excluded.linked_qty_milli,
                    is_default = excluded.is_default,
                    display_order = excluded.display_order,
                    is_active = excluded.is_active;
            ";
            using (var cmd = new SQLiteCommand(sql, conn, trans))
            {
                cmd.Parameters.AddWithValue("@id", option.Id);
                cmd.Parameters.AddWithValue("@groupId", option.GroupId);
                cmd.Parameters.AddWithValue("@name", option.Name.Trim());
                cmd.Parameters.AddWithValue("@price", Math.Max(0L, option.ExtraPricePiasters));
                cmd.Parameters.AddWithValue("@cost", Math.Max(0L, option.CostPiasters));
                cmd.Parameters.AddWithValue("@ingId", string.IsNullOrWhiteSpace(option.LinkedIngredientId) ? (object)DBNull.Value : option.LinkedIngredientId);
                cmd.Parameters.AddWithValue("@ingQty", Math.Max(0L, option.LinkedQtyMilli));
                cmd.Parameters.AddWithValue("@isDef", option.IsDefault ? 1 : 0);
                cmd.Parameters.AddWithValue("@order", option.DisplayOrder);
                cmd.Parameters.AddWithValue("@active", option.IsActive ? 1 : 0);
                cmd.Parameters.AddWithValue("@createdAt", option.CreatedAt ?? nowIso);
                cmd.ExecuteNonQuery();
            }
        }

        public bool DeleteOption(string optionId)
        {
            if (string.IsNullOrWhiteSpace(optionId)) return false;
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("DELETE FROM modifier_options WHERE id = @id;", conn))
                {
                    cmd.Parameters.AddWithValue("@id", optionId);
                    return cmd.ExecuteNonQuery() > 0;
                }
            }
        }

        public void LinkProductGroups(string productId, List<string> groupIds)
        {
            if (string.IsNullOrWhiteSpace(productId)) throw new ArgumentNullException("productId");
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        using (var delCmd = new SQLiteCommand("DELETE FROM product_modifier_groups WHERE product_id = @pid;", conn, trans))
                        {
                            delCmd.Parameters.AddWithValue("@pid", productId);
                            delCmd.ExecuteNonQuery();
                        }

                        if (groupIds != null)
                        {
                            for (int i = 0; i < groupIds.Count; i++)
                            {
                                string gid = groupIds[i];
                                if (string.IsNullOrWhiteSpace(gid)) continue;
                                using (var insCmd = new SQLiteCommand(@"
                                    INSERT OR IGNORE INTO product_modifier_groups (product_id, group_id, display_order)
                                    VALUES (@pid, @gid, @ord);
                                ", conn, trans))
                                {
                                    insCmd.Parameters.AddWithValue("@pid", productId);
                                    insCmd.Parameters.AddWithValue("@gid", gid);
                                    insCmd.Parameters.AddWithValue("@ord", i);
                                    insCmd.ExecuteNonQuery();
                                }
                            }
                        }

                        trans.Commit();
                    }
                    catch
                    {
                        trans.Rollback();
                        throw;
                    }
                }
            }
        }

        private static ModifierGroup MapGroup(SQLiteDataReader reader)
        {
            return new ModifierGroup
            {
                Id = reader["id"].ToString(),
                Name = reader["name"].ToString(),
                SelectionType = reader["selection_type"] != DBNull.Value ? reader["selection_type"].ToString() : "multiple",
                IsRequired = reader["is_required"] != DBNull.Value && Convert.ToInt32(reader["is_required"]) == 1,
                MinSelections = reader["min_selections"] != DBNull.Value ? Convert.ToInt32(reader["min_selections"]) : 0,
                MaxSelections = reader["max_selections"] != DBNull.Value ? Convert.ToInt32(reader["max_selections"]) : 5,
                DisplayOrder = reader["display_order"] != DBNull.Value ? Convert.ToInt32(reader["display_order"]) : 0,
                IsActive = reader["is_active"] != DBNull.Value && Convert.ToInt32(reader["is_active"]) == 1,
                CreatedAt = reader["created_at"].ToString(),
                UpdatedAt = reader["updated_at"].ToString(),
                Options = new List<ModifierOption>()
            };
        }

        private static ModifierOption MapOption(SQLiteDataReader reader)
        {
            var opt = new ModifierOption
            {
                Id = reader["id"].ToString(),
                GroupId = reader["group_id"].ToString(),
                Name = reader["name"].ToString(),
                ExtraPricePiasters = reader["extra_price_piasters"] != DBNull.Value ? Convert.ToInt64(reader["extra_price_piasters"]) : 0,
                CostPiasters = reader["cost_piasters"] != DBNull.Value ? Convert.ToInt64(reader["cost_piasters"]) : 0,
                LinkedIngredientId = reader["linked_ingredient_id"] != DBNull.Value ? reader["linked_ingredient_id"].ToString() : null,
                LinkedQtyMilli = reader["linked_qty_milli"] != DBNull.Value ? Convert.ToInt64(reader["linked_qty_milli"]) : 0,
                IsDefault = reader["is_default"] != DBNull.Value && Convert.ToInt32(reader["is_default"]) == 1,
                DisplayOrder = reader["display_order"] != DBNull.Value ? Convert.ToInt32(reader["display_order"]) : 0,
                IsActive = reader["is_active"] != DBNull.Value && Convert.ToInt32(reader["is_active"]) == 1,
                CreatedAt = reader["created_at"].ToString()
            };
            try
            {
                opt.LinkedIngredientName = reader["ingredient_name"] != DBNull.Value ? reader["ingredient_name"].ToString() : null;
            }
            catch { }
            return opt;
        }
    }
}
