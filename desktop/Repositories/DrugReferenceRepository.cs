using System;
using System.Collections.Generic;
using System.Data.SQLite;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Repositories
{
    public class DrugReferenceRepository
    {
        private readonly string _connectionString;
        private readonly AuditLogRepository _auditRepo;

        public DrugReferenceRepository(string connectionString, AuditLogRepository auditRepo = null)
        {
            _connectionString = connectionString;
            _auditRepo = auditRepo ?? new AuditLogRepository(connectionString);
        }

        public DrugReference GetByBarcode(string barcode)
        {
            if (string.IsNullOrWhiteSpace(barcode)) return null;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "SELECT * FROM drug_reference WHERE barcode = @barcode LIMIT 1;";
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@barcode", barcode.Trim());
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            return MapReaderToDrugReference(reader);
                        }
                    }
                }
            }
            return null;
        }

        public List<DrugReference> Search(string query, int limit = 50)
        {
            var list = new List<DrugReference>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql;
                if (string.IsNullOrWhiteSpace(query))
                {
                    sql = "SELECT * FROM drug_reference ORDER BY trade_name ASC LIMIT @limit;";
                }
                else
                {
                    sql = @"
                        SELECT * FROM drug_reference 
                        WHERE barcode LIKE @q 
                           OR trade_name LIKE @q 
                           OR scientific_name LIKE @q 
                           OR manufacturer LIKE @q
                        ORDER BY trade_name ASC 
                        LIMIT @limit;
                    ";
                }

                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    if (!string.IsNullOrWhiteSpace(query))
                    {
                        cmd.Parameters.AddWithValue("@q", "%" + query.Trim() + "%");
                    }
                    cmd.Parameters.AddWithValue("@limit", limit > 0 ? limit : 50);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            list.Add(MapReaderToDrugReference(reader));
                        }
                    }
                }
            }
            return list;
        }

        public int GetTotalCount()
        {
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("SELECT COUNT(*) FROM drug_reference;", conn))
                {
                    object o = cmd.ExecuteScalar();
                    return o != null && o != DBNull.Value ? Convert.ToInt32(o) : 0;
                }
            }
        }

        public void Save(DrugReference item, string userId = null)
        {
            if (item == null) throw new ArgumentNullException("item");
            if (string.IsNullOrWhiteSpace(item.Barcode)) throw new ArgumentException("الباركود مطلوب لدليل الأدوية.");
            if (string.IsNullOrWhiteSpace(item.TradeName)) throw new ArgumentException("اسم الصنف مطلوب.");

            string now = DateTime.UtcNow.ToString("o");
            if (string.IsNullOrWhiteSpace(item.Id)) item.Id = "dref_" + Guid.NewGuid().ToString("N");
            if (string.IsNullOrWhiteSpace(item.ImportedAt)) item.ImportedAt = now;
            item.CreatedAt = string.IsNullOrWhiteSpace(item.CreatedAt) ? now : item.CreatedAt;
            item.UpdatedAt = now;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    INSERT INTO drug_reference (
                        id, barcode, trade_name, scientific_name, form, strength,
                        manufacturer, pack_desc, public_price_piasters, source,
                        therapeutic_class, category, storage_location, is_refrigerated,
                        route, pregnancy_category, is_antibiotic, rx_status, flavor_form, pieces_per_pack,
                        imported_at, created_at, updated_at
                    ) VALUES (
                        @id, @barcode, @tradeName, @scientificName, @form, @strength,
                        @manufacturer, @packDesc, @publicPricePiasters, @source,
                        @therapeuticClass, @category, @storageLocation, @isRefrigerated,
                        @route, @pregnancyCategory, @isAntibiotic, @rxStatus, @flavorForm, @piecesPerPack,
                        @importedAt, @createdAt, @updatedAt
                    )
                    ON CONFLICT(barcode) DO UPDATE SET
                        trade_name = excluded.trade_name,
                        scientific_name = excluded.scientific_name,
                        form = excluded.form,
                        strength = excluded.strength,
                        manufacturer = excluded.manufacturer,
                        pack_desc = excluded.pack_desc,
                        public_price_piasters = excluded.public_price_piasters,
                        source = excluded.source,
                        therapeutic_class = excluded.therapeutic_class,
                        category = excluded.category,
                        storage_location = excluded.storage_location,
                        is_refrigerated = excluded.is_refrigerated,
                        route = excluded.route,
                        pregnancy_category = excluded.pregnancy_category,
                        is_antibiotic = excluded.is_antibiotic,
                        rx_status = excluded.rx_status,
                        flavor_form = excluded.flavor_form,
                        pieces_per_pack = excluded.pieces_per_pack,
                        updated_at = excluded.updated_at;
                ";

                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", item.Id);
                    cmd.Parameters.AddWithValue("@barcode", item.Barcode.Trim());
                    cmd.Parameters.AddWithValue("@tradeName", item.TradeName.Trim());
                    cmd.Parameters.AddWithValue("@scientificName", (object)item.ScientificName ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@form", (object)item.Form ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@strength", (object)item.Strength ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@manufacturer", (object)item.Manufacturer ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@packDesc", (object)item.PackDesc ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@publicPricePiasters", (object)item.PublicPricePiasters ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@source", (object)item.Source ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@therapeuticClass", (object)item.TherapeuticClass ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@category", (object)item.Category ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@storageLocation", (object)item.StorageLocation ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@isRefrigerated", item.IsRefrigerated ? 1 : 0);
                    cmd.Parameters.AddWithValue("@route", (object)item.Route ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@pregnancyCategory", (object)item.PregnancyCategory ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@isAntibiotic", item.IsAntibiotic ? 1 : 0);
                    cmd.Parameters.AddWithValue("@rxStatus", (object)item.RxStatus ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@flavorForm", (object)item.FlavorForm ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@piecesPerPack", (object)item.PiecesPerPack ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@importedAt", item.ImportedAt);
                    cmd.Parameters.AddWithValue("@createdAt", item.CreatedAt);
                    cmd.Parameters.AddWithValue("@updatedAt", item.UpdatedAt);
                    cmd.ExecuteNonQuery();
                }
            }
        }

        public int BulkInsertOrUpdate(List<DrugReference> items, string source, string userId = null)
        {
            if (items == null || items.Count == 0) return 0;

            string now = DateTime.UtcNow.ToString("o");
            int affected = 0;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        string sql = @"
                            INSERT INTO drug_reference (
                                id, barcode, trade_name, scientific_name, form, strength,
                                manufacturer, pack_desc, public_price_piasters, source,
                                therapeutic_class, category, storage_location, is_refrigerated,
                                route, pregnancy_category, is_antibiotic, rx_status, flavor_form, pieces_per_pack,
                                imported_at, created_at, updated_at
                            ) VALUES (
                                @id, @barcode, @tradeName, @scientificName, @form, @strength,
                                @manufacturer, @packDesc, @publicPricePiasters, @source,
                                @therapeuticClass, @category, @storageLocation, @isRefrigerated,
                                @route, @pregnancyCategory, @isAntibiotic, @rxStatus, @flavorForm, @piecesPerPack,
                                @importedAt, @createdAt, @updatedAt
                            )
                            ON CONFLICT(barcode) DO UPDATE SET
                                trade_name = excluded.trade_name,
                                scientific_name = excluded.scientific_name,
                                form = excluded.form,
                                strength = excluded.strength,
                                manufacturer = excluded.manufacturer,
                                pack_desc = excluded.pack_desc,
                                public_price_piasters = excluded.public_price_piasters,
                                source = excluded.source,
                                therapeutic_class = excluded.therapeutic_class,
                                category = excluded.category,
                                storage_location = excluded.storage_location,
                                is_refrigerated = excluded.is_refrigerated,
                                route = excluded.route,
                                pregnancy_category = excluded.pregnancy_category,
                                is_antibiotic = excluded.is_antibiotic,
                                rx_status = excluded.rx_status,
                                flavor_form = excluded.flavor_form,
                                pieces_per_pack = excluded.pieces_per_pack,
                                updated_at = excluded.updated_at;
                        ";

                        using (var cmd = new SQLiteCommand(sql, conn, trans))
                        {
                            var pId = cmd.Parameters.Add("@id", System.Data.DbType.String);
                            var pBarcode = cmd.Parameters.Add("@barcode", System.Data.DbType.String);
                            var pTrade = cmd.Parameters.Add("@tradeName", System.Data.DbType.String);
                            var pSci = cmd.Parameters.Add("@scientificName", System.Data.DbType.String);
                            var pForm = cmd.Parameters.Add("@form", System.Data.DbType.String);
                            var pStr = cmd.Parameters.Add("@strength", System.Data.DbType.String);
                            var pMfg = cmd.Parameters.Add("@manufacturer", System.Data.DbType.String);
                            var pPack = cmd.Parameters.Add("@packDesc", System.Data.DbType.String);
                            var pPrice = cmd.Parameters.Add("@publicPricePiasters", System.Data.DbType.Int64);
                            var pSource = cmd.Parameters.Add("@source", System.Data.DbType.String);
                            var pTherapeutic = cmd.Parameters.Add("@therapeuticClass", System.Data.DbType.String);
                            var pCategory = cmd.Parameters.Add("@category", System.Data.DbType.String);
                            var pStorageLoc = cmd.Parameters.Add("@storageLocation", System.Data.DbType.String);
                            var pRefrig = cmd.Parameters.Add("@isRefrigerated", System.Data.DbType.Int32);
                            var pRoute = cmd.Parameters.Add("@route", System.Data.DbType.String);
                            var pPreg = cmd.Parameters.Add("@pregnancyCategory", System.Data.DbType.String);
                            var pAnti = cmd.Parameters.Add("@isAntibiotic", System.Data.DbType.Int32);
                            var pRx = cmd.Parameters.Add("@rxStatus", System.Data.DbType.String);
                            var pFlv = cmd.Parameters.Add("@flavorForm", System.Data.DbType.String);
                            var pPcs = cmd.Parameters.Add("@piecesPerPack", System.Data.DbType.Int32);
                            var pImp = cmd.Parameters.Add("@importedAt", System.Data.DbType.String);
                            var pCreat = cmd.Parameters.Add("@createdAt", System.Data.DbType.String);
                            var pUpd = cmd.Parameters.Add("@updatedAt", System.Data.DbType.String);

                            for (int i = 0; i < items.Count; i++)
                            {
                                var itm = items[i];
                                if (itm == null || string.IsNullOrWhiteSpace(itm.Barcode) || string.IsNullOrWhiteSpace(itm.TradeName))
                                    continue;

                                pId.Value = string.IsNullOrWhiteSpace(itm.Id) ? "dref_" + Guid.NewGuid().ToString("N") : itm.Id;
                                pBarcode.Value = itm.Barcode.Trim();
                                pTrade.Value = itm.TradeName.Trim();
                                pSci.Value = (object)itm.ScientificName ?? DBNull.Value;
                                pForm.Value = (object)itm.Form ?? DBNull.Value;
                                pStr.Value = (object)itm.Strength ?? DBNull.Value;
                                pMfg.Value = (object)itm.Manufacturer ?? DBNull.Value;
                                pPack.Value = (object)itm.PackDesc ?? DBNull.Value;
                                pPrice.Value = (object)itm.PublicPricePiasters ?? DBNull.Value;
                                pSource.Value = (object)(source ?? itm.Source) ?? "Excel Import";
                                pTherapeutic.Value = (object)itm.TherapeuticClass ?? DBNull.Value;
                                pCategory.Value = (object)itm.Category ?? DBNull.Value;
                                pStorageLoc.Value = (object)itm.StorageLocation ?? DBNull.Value;
                                pRefrig.Value = itm.IsRefrigerated ? 1 : 0;
                                pRoute.Value = (object)itm.Route ?? DBNull.Value;
                                pPreg.Value = (object)itm.PregnancyCategory ?? DBNull.Value;
                                pAnti.Value = itm.IsAntibiotic ? 1 : 0;
                                pRx.Value = (object)itm.RxStatus ?? DBNull.Value;
                                pFlv.Value = (object)itm.FlavorForm ?? DBNull.Value;
                                pPcs.Value = (object)itm.PiecesPerPack ?? DBNull.Value;
                                pImp.Value = string.IsNullOrWhiteSpace(itm.ImportedAt) ? now : itm.ImportedAt;
                                pCreat.Value = string.IsNullOrWhiteSpace(itm.CreatedAt) ? now : itm.CreatedAt;
                                pUpd.Value = now;

                                cmd.ExecuteNonQuery();
                                affected++;
                            }
                        }

                        _auditRepo.Log(conn, trans, new AuditLog
                        {
                            Id = "aud_" + Guid.NewGuid().ToString("N"),
                            UserId = string.IsNullOrWhiteSpace(userId) ? "usr_admin_default" : userId,
                            Action = "DRUG_REFERENCE_IMPORT",
                            EntityType = "drug_reference",
                            EntityId = "bulk",
                            DetailsJson = Newtonsoft.Json.JsonConvert.SerializeObject(new { importedCount = affected, source = source }),
                            CreatedAt = now
                        });

                        trans.Commit();
                    }
                    catch
                    {
                        trans.Rollback();
                        throw;
                    }
                }
            }

            return affected;
        }

        public void ClearAll(string userId = null)
        {
            string now = DateTime.UtcNow.ToString("o");
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        using (var cmd = new SQLiteCommand("DELETE FROM drug_reference;", conn, trans))
                        {
                            cmd.ExecuteNonQuery();
                        }

                        _auditRepo.Log(conn, trans, new AuditLog
                        {
                            Id = "aud_" + Guid.NewGuid().ToString("N"),
                            UserId = string.IsNullOrWhiteSpace(userId) ? "usr_admin_default" : userId,
                            Action = "DRUG_REFERENCE_CLEAR",
                            EntityType = "drug_reference",
                            EntityId = "all",
                            DetailsJson = "{\"action\":\"clear_all_drug_reference\"}",
                            CreatedAt = now
                        });

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

        public List<ExpiryReturnableBatch> GetExpiryReturnableBatches(string supplierId = null, int? customWindowDays = null)
        {
            var list = new List<ExpiryReturnableBatch>();
            DateTime today = DateTime.UtcNow.Date;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT 
                        b.id AS batch_id,
                        b.product_id,
                        p.name AS product_name,
                        p.barcode,
                        p.unit,
                        b.batch_number,
                        b.expiry_date,
                        b.quantity_milli,
                        b.cost_price_piasters,
                        COALESCE(b.supplier_id, p.preferred_supplier_id) AS resolved_supplier_id,
                        s.name AS supplier_name,
                        s.expiry_return_window_days,
                        s.expiry_return_credit_bps
                    FROM product_batches b
                    JOIN products p ON b.product_id = p.id
                    LEFT JOIN suppliers s ON COALESCE(b.supplier_id, p.preferred_supplier_id) = s.id
                    WHERE b.quantity_milli > 0
                      AND b.status = 'ACTIVE'
                      AND b.expiry_date IS NOT NULL
                      AND b.expiry_date != ''
                ";

                if (!string.IsNullOrWhiteSpace(supplierId))
                {
                    sql += " AND COALESCE(b.supplier_id, p.preferred_supplier_id) = @supplierId";
                }

                sql += " ORDER BY b.expiry_date ASC;";

                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    if (!string.IsNullOrWhiteSpace(supplierId))
                    {
                        cmd.Parameters.AddWithValue("@supplierId", supplierId.Trim());
                    }

                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            string expStr = reader["expiry_date"].ToString();
                            DateTime expDate;
                            if (!DateTime.TryParse(expStr, out expDate))
                                continue;

                            int windowDays = 90; // Default 90 days if not configured on supplier
                            if (customWindowDays.HasValue && customWindowDays.Value > 0)
                            {
                                windowDays = customWindowDays.Value;
                            }
                            else if (reader["expiry_return_window_days"] != DBNull.Value)
                            {
                                int sw = Convert.ToInt32(reader["expiry_return_window_days"]);
                                if (sw > 0) windowDays = sw;
                            }

                            int creditBps = 10000; // Default 100%
                            if (reader["expiry_return_credit_bps"] != DBNull.Value)
                            {
                                creditBps = Convert.ToInt32(reader["expiry_return_credit_bps"]);
                            }

                            int daysUntilExpiry = (int)(expDate.Date - today).TotalDays;

                            // Returnable if within window (e.g. daysUntilExpiry <= windowDays)
                            if (daysUntilExpiry <= windowDays)
                            {
                                long qtyMilli = Convert.ToInt64(reader["quantity_milli"]);
                                long unitCost = Convert.ToInt64(reader["cost_price_piasters"]);
                                long totalCost = (long)Math.Round((double)qtyMilli * (double)unitCost / 1000.0);
                                long estCredit = (long)Math.Round((double)totalCost * (double)creditBps / 10000.0);

                                list.Add(new ExpiryReturnableBatch
                                {
                                    BatchId = reader["batch_id"].ToString(),
                                    ProductId = reader["product_id"].ToString(),
                                    ProductName = reader["product_name"].ToString(),
                                    Barcode = reader["barcode"] != DBNull.Value ? reader["barcode"].ToString() : null,
                                    Unit = reader["unit"] != DBNull.Value ? reader["unit"].ToString() : "قطعة",
                                    BatchNumber = reader["batch_number"].ToString(),
                                    ExpiryDate = expStr,
                                    DaysUntilExpiry = daysUntilExpiry,
                                    QuantityMilli = qtyMilli,
                                    UnitCostPiasters = unitCost,
                                    TotalCostPiasters = totalCost,
                                    SupplierId = reader["resolved_supplier_id"] != DBNull.Value ? reader["resolved_supplier_id"].ToString() : null,
                                    SupplierName = reader["supplier_name"] != DBNull.Value ? reader["supplier_name"].ToString() : "مورد عام",
                                    WindowDays = windowDays,
                                    CreditBps = creditBps,
                                    EstimatedCreditPiasters = estCredit
                                });
                            }
                        }
                    }
                }
            }

            return list;
        }

        public List<ExpiryReturnableBatch> GetExpiredBatches()
        {
            var list = new List<ExpiryReturnableBatch>();
            DateTime today = DateTime.UtcNow.Date;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT 
                        b.id AS batch_id,
                        b.product_id,
                        p.name AS product_name,
                        p.barcode,
                        p.unit,
                        b.batch_number,
                        b.expiry_date,
                        b.quantity_milli,
                        b.cost_price_piasters,
                        COALESCE(b.supplier_id, p.preferred_supplier_id) AS resolved_supplier_id,
                        s.name AS supplier_name
                    FROM product_batches b
                    JOIN products p ON b.product_id = p.id
                    LEFT JOIN suppliers s ON COALESCE(b.supplier_id, p.preferred_supplier_id) = s.id
                    WHERE b.quantity_milli > 0
                      AND b.expiry_date IS NOT NULL
                      AND b.expiry_date != ''
                    ORDER BY b.expiry_date ASC;
                ";

                using (var cmd = new SQLiteCommand(sql, conn))
                using (var reader = cmd.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        string expStr = reader["expiry_date"].ToString();
                        DateTime expDate;
                        if (!DateTime.TryParse(expStr, out expDate))
                            continue;

                        if (expDate.Date < today)
                        {
                            long qtyMilli = Convert.ToInt64(reader["quantity_milli"]);
                            long unitCost = Convert.ToInt64(reader["cost_price_piasters"]);
                            long totalCost = (long)Math.Round((double)qtyMilli * (double)unitCost / 1000.0);
                            int daysPast = (int)(today - expDate.Date).TotalDays;

                            list.Add(new ExpiryReturnableBatch
                            {
                                BatchId = reader["batch_id"].ToString(),
                                ProductId = reader["product_id"].ToString(),
                                ProductName = reader["product_name"].ToString(),
                                Barcode = reader["barcode"] != DBNull.Value ? reader["barcode"].ToString() : null,
                                Unit = reader["unit"] != DBNull.Value ? reader["unit"].ToString() : "قطعة",
                                BatchNumber = reader["batch_number"].ToString(),
                                ExpiryDate = expStr,
                                DaysUntilExpiry = -daysPast,
                                QuantityMilli = qtyMilli,
                                UnitCostPiasters = unitCost,
                                TotalCostPiasters = totalCost,
                                SupplierId = reader["resolved_supplier_id"] != DBNull.Value ? reader["resolved_supplier_id"].ToString() : null,
                                SupplierName = reader["supplier_name"] != DBNull.Value ? reader["supplier_name"].ToString() : "غير محدد",
                                WindowDays = 0,
                                CreditBps = 0,
                                EstimatedCreditPiasters = 0
                            });
                        }
                    }
                }
            }

            return list;
        }

        public ExpiredWriteOffCertificate WriteOffExpiredBatches(
            List<ExpiredWriteOffItemRequest> items,
            string committeeMembers,
            string generalNotes,
            string userId)
        {
            if (items == null || items.Count == 0)
                throw new ArgumentException("يجب اختيار بند واحد على الأقل لإجراء الإعدام.");

            string now = DateTime.UtcNow.ToString("o");
            string todayStr = DateTime.Now.ToString("yyyy-MM-dd");
            string writeOffNo = "WO-" + DateTime.Now.ToString("yyyyMMdd") + "-" + Guid.NewGuid().ToString("N").Substring(0, 6).ToUpperInvariant();

            var certificate = new ExpiredWriteOffCertificate
            {
                CertificateNumber = writeOffNo,
                Date = todayStr,
                CommitteeMembers = committeeMembers ?? "لجنة الجرد والتفتيش الصيدلي",
                GeneralNotes = generalNotes,
                TotalItemsCount = 0,
                TotalCostPiasters = 0,
                Items = new List<ExpiredWriteOff>()
            };

            lock (SaleService.FinancialWriteLock)
            {
                using (var conn = new SQLiteConnection(_connectionString))
                {
                    conn.Open();
                    using (var trans = conn.BeginTransaction())
                    {
                        try
                        {
                            for (int i = 0; i < items.Count; i++)
                            {
                                var reqItem = items[i];
                                if (reqItem == null || string.IsNullOrWhiteSpace(reqItem.BatchId)) continue;
                                if (reqItem.QuantityMilli <= 0) continue;

                                // 1. Get batch
                                string batchId = reqItem.BatchId;
                                string prodId = null;
                                string prodName = null;
                                string batchNum = null;
                                string expDate = null;
                                long availQty = 0;
                                long costPrice = 0;

                                string bSql = @"
                                    SELECT b.product_id, b.batch_number, b.expiry_date, b.quantity_milli, b.cost_price_piasters, p.name AS product_name
                                    FROM product_batches b
                                    JOIN products p ON b.product_id = p.id
                                    WHERE b.id = @bid
                                    LIMIT 1;
                                ";
                                using (var bCmd = new SQLiteCommand(bSql, conn, trans))
                                {
                                    bCmd.Parameters.AddWithValue("@bid", batchId);
                                    using (var r = bCmd.ExecuteReader())
                                    {
                                        if (r.Read())
                                        {
                                            prodId = r["product_id"].ToString();
                                            prodName = r["product_name"].ToString();
                                            batchNum = r["batch_number"].ToString();
                                            expDate = r["expiry_date"] != DBNull.Value ? r["expiry_date"].ToString() : null;
                                            availQty = Convert.ToInt64(r["quantity_milli"]);
                                            costPrice = Convert.ToInt64(r["cost_price_piasters"]);
                                        }
                                        else
                                        {
                                            throw new InvalidOperationException("التشغيلة المحددة غير موجودة: " + batchId);
                                        }
                                    }
                                }

                                long writeOffQty = reqItem.QuantityMilli;
                                if (writeOffQty > availQty)
                                {
                                    throw new InvalidOperationException(string.Format("كمية الإعدام المطلوبة ({0:N2}) أكبر من رصيد التشغيلة المتاح ({1:N2}) للصنف '{2}'.",
                                        writeOffQty / 1000.0, availQty / 1000.0, prodName));
                                }

                                long remainingQty = availQty - writeOffQty;
                                string newStatus = remainingQty > 0 ? "ACTIVE" : "DEPLETED";
                                long lineTotalCost = (long)Math.Round((double)writeOffQty * (double)costPrice / 1000.0);

                                // 2. Update batch
                                string updBatchSql = @"
                                    UPDATE product_batches
                                    SET quantity_milli = @remQty,
                                        status = @st,
                                        updated_at = @now
                                    WHERE id = @bid;
                                ";
                                using (var updCmd = new SQLiteCommand(updBatchSql, conn, trans))
                                {
                                    updCmd.Parameters.AddWithValue("@remQty", remainingQty);
                                    updCmd.Parameters.AddWithValue("@st", newStatus);
                                    updCmd.Parameters.AddWithValue("@now", now);
                                    updCmd.Parameters.AddWithValue("@bid", batchId);
                                    updCmd.ExecuteNonQuery();
                                }

                                // 3. Update product total stock
                                string updProdSql = @"
                                    UPDATE products
                                    SET stock_quantity_milli = stock_quantity_milli - @qty,
                                        updated_at = @now
                                    WHERE id = @pid;

                                    UPDATE product_variants
                                    SET stock_quantity_milli = stock_quantity_milli - @qty,
                                        updated_at = @now
                                    WHERE variant_product_id = @pid;
                                ";
                                using (var updProdCmd = new SQLiteCommand(updProdSql, conn, trans))
                                {
                                    updProdCmd.Parameters.AddWithValue("@qty", writeOffQty);
                                    updProdCmd.Parameters.AddWithValue("@now", now);
                                    updProdCmd.Parameters.AddWithValue("@pid", prodId);
                                    updProdCmd.ExecuteNonQuery();
                                }

                                // 4. Insert into stock_movements
                                string smSql = @"
                                    INSERT INTO stock_movements (
                                        id, product_id, movement_type, quantity_milli, reference_id, reference_type,
                                        unit_cost_piasters, note, batch_number, batch_id, expiry_date, created_at
                                    ) VALUES (
                                        @id, @pid, 'EXPIRED_WRITE_OFF', @qty, @refId, 'EXPIRED_WRITE_OFF',
                                        @cost, @note, @bnum, @bid, @expDate, @now
                                    );
                                ";
                                using (var smCmd = new SQLiteCommand(smSql, conn, trans))
                                {
                                    smCmd.Parameters.AddWithValue("@id", Guid.NewGuid().ToString());
                                    smCmd.Parameters.AddWithValue("@pid", prodId);
                                    smCmd.Parameters.AddWithValue("@qty", -writeOffQty);
                                    smCmd.Parameters.AddWithValue("@refId", writeOffNo);
                                    smCmd.Parameters.AddWithValue("@cost", costPrice);
                                    smCmd.Parameters.AddWithValue("@note", "محضر إعدام أدوية منتهية الصلاحية رقم [" + writeOffNo + "]: " + (reqItem.Reason ?? "صلاحية منتهية"));
                                    smCmd.Parameters.AddWithValue("@bnum", batchNum);
                                    smCmd.Parameters.AddWithValue("@bid", batchId);
                                    smCmd.Parameters.AddWithValue("@expDate", (object)expDate ?? DBNull.Value);
                                    smCmd.Parameters.AddWithValue("@now", now);
                                    smCmd.ExecuteNonQuery();
                                }

                                // 5. Insert into expired_write_offs record
                                string recId = "ewo_" + Guid.NewGuid().ToString("N");
                                string ewoSql = @"
                                    INSERT INTO expired_write_offs (
                                        id, write_off_number, batch_id, product_id, batch_number,
                                        quantity_milli, unit_cost_piasters, total_cost_piasters,
                                        reason, committee_members, notes, created_by, created_at
                                    ) VALUES (
                                        @id, @woNum, @bid, @pid, @bnum,
                                        @qty, @unitCost, @totCost,
                                        @reason, @committee, @notes, @createdBy, @now
                                    );
                                ";
                                using (var ewoCmd = new SQLiteCommand(ewoSql, conn, trans))
                                {
                                    ewoCmd.Parameters.AddWithValue("@id", recId);
                                    ewoCmd.Parameters.AddWithValue("@woNum", writeOffNo);
                                    ewoCmd.Parameters.AddWithValue("@bid", batchId);
                                    ewoCmd.Parameters.AddWithValue("@pid", prodId);
                                    ewoCmd.Parameters.AddWithValue("@bnum", batchNum);
                                    ewoCmd.Parameters.AddWithValue("@qty", writeOffQty);
                                    ewoCmd.Parameters.AddWithValue("@unitCost", costPrice);
                                    ewoCmd.Parameters.AddWithValue("@totCost", lineTotalCost);
                                    ewoCmd.Parameters.AddWithValue("@reason", reqItem.Reason ?? "انتهاء تاريخ الصلاحية");
                                    ewoCmd.Parameters.AddWithValue("@committee", (object)committeeMembers ?? DBNull.Value);
                                    ewoCmd.Parameters.AddWithValue("@notes", (object)generalNotes ?? DBNull.Value);
                                    ewoCmd.Parameters.AddWithValue("@createdBy", string.IsNullOrWhiteSpace(userId) ? "usr_admin_default" : userId);
                                    ewoCmd.Parameters.AddWithValue("@now", now);
                                    ewoCmd.ExecuteNonQuery();
                                }

                                certificate.Items.Add(new ExpiredWriteOff
                                {
                                    Id = recId,
                                    WriteOffNumber = writeOffNo,
                                    BatchId = batchId,
                                    ProductId = prodId,
                                    ProductName = prodName,
                                    BatchNumber = batchNum,
                                    QuantityMilli = writeOffQty,
                                    UnitCostPiasters = costPrice,
                                    TotalCostPiasters = lineTotalCost,
                                    Reason = reqItem.Reason ?? "انتهاء تاريخ الصلاحية",
                                    CommitteeMembers = committeeMembers,
                                    Notes = generalNotes,
                                    CreatedBy = userId,
                                    CreatedAt = now
                                });

                                certificate.TotalItemsCount++;
                                certificate.TotalCostPiasters += lineTotalCost;
                            }

                            _auditRepo.Log(conn, trans, new AuditLog
                            {
                                Id = "aud_" + Guid.NewGuid().ToString("N"),
                                UserId = string.IsNullOrWhiteSpace(userId) ? "usr_admin_default" : userId,
                                Action = "EXPIRED_WRITE_OFF",
                                EntityType = "expired_write_offs",
                                EntityId = writeOffNo,
                                DetailsJson = Newtonsoft.Json.JsonConvert.SerializeObject(new
                                {
                                    writeOffNumber = writeOffNo,
                                    itemsCount = certificate.TotalItemsCount,
                                    totalCostPiasters = certificate.TotalCostPiasters
                                }),
                                CreatedAt = now
                            });

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

            return certificate;
        }

        public List<ExpiredWriteOff> GetExpiredWriteOffs(string fromDate = null, string toDate = null)
        {
            var list = new List<ExpiredWriteOff>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT e.*, p.name AS product_name
                    FROM expired_write_offs e
                    JOIN products p ON e.product_id = p.id
                    WHERE 1=1
                ";

                if (!string.IsNullOrWhiteSpace(fromDate))
                {
                    sql += " AND e.created_at >= @from";
                }
                if (!string.IsNullOrWhiteSpace(toDate))
                {
                    sql += " AND e.created_at <= @to";
                }

                sql += " ORDER BY e.created_at DESC;";

                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    if (!string.IsNullOrWhiteSpace(fromDate))
                    {
                        cmd.Parameters.AddWithValue("@from", fromDate.Trim() + " 00:00:00");
                    }
                    if (!string.IsNullOrWhiteSpace(toDate))
                    {
                        cmd.Parameters.AddWithValue("@to", toDate.Trim() + " 23:59:59");
                    }

                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            list.Add(new ExpiredWriteOff
                            {
                                Id = reader["id"].ToString(),
                                WriteOffNumber = reader["write_off_number"].ToString(),
                                BatchId = reader["batch_id"] != DBNull.Value ? reader["batch_id"].ToString() : null,
                                ProductId = reader["product_id"].ToString(),
                                ProductName = reader["product_name"].ToString(),
                                BatchNumber = reader["batch_number"] != DBNull.Value ? reader["batch_number"].ToString() : null,
                                QuantityMilli = Convert.ToInt64(reader["quantity_milli"]),
                                UnitCostPiasters = Convert.ToInt64(reader["unit_cost_piasters"]),
                                TotalCostPiasters = Convert.ToInt64(reader["total_cost_piasters"]),
                                Reason = reader["reason"].ToString(),
                                CommitteeMembers = reader["committee_members"] != DBNull.Value ? reader["committee_members"].ToString() : null,
                                Notes = reader["notes"] != DBNull.Value ? reader["notes"].ToString() : null,
                                CreatedBy = reader["created_by"].ToString(),
                                CreatedAt = reader["created_at"].ToString()
                            });
                        }
                    }
                }
            }
            return list;
        }

        private static bool HasColumn(SQLiteDataReader reader, string columnName)
        {
            for (int i = 0; i < reader.FieldCount; i++)
            {
                if (reader.GetName(i).Equals(columnName, StringComparison.OrdinalIgnoreCase))
                    return true;
            }
            return false;
        }

        private static DrugReference MapReaderToDrugReference(SQLiteDataReader reader)
        {
            return new DrugReference
            {
                Id = reader["id"].ToString(),
                Barcode = reader["barcode"].ToString(),
                TradeName = reader["trade_name"].ToString(),
                ScientificName = reader["scientific_name"] != DBNull.Value ? reader["scientific_name"].ToString() : null,
                Form = reader["form"] != DBNull.Value ? reader["form"].ToString() : null,
                Strength = reader["strength"] != DBNull.Value ? reader["strength"].ToString() : null,
                Manufacturer = reader["manufacturer"] != DBNull.Value ? reader["manufacturer"].ToString() : null,
                PackDesc = reader["pack_desc"] != DBNull.Value ? reader["pack_desc"].ToString() : null,
                PublicPricePiasters = reader["public_price_piasters"] != DBNull.Value ? (long?)Convert.ToInt64(reader["public_price_piasters"]) : null,
                Source = reader["source"] != DBNull.Value ? reader["source"].ToString() : null,
                TherapeuticClass = HasColumn(reader, "therapeutic_class") && reader["therapeutic_class"] != DBNull.Value ? reader["therapeutic_class"].ToString() : null,
                Category = HasColumn(reader, "category") && reader["category"] != DBNull.Value ? reader["category"].ToString() : null,
                StorageLocation = HasColumn(reader, "storage_location") && reader["storage_location"] != DBNull.Value ? reader["storage_location"].ToString() : null,
                IsRefrigerated = HasColumn(reader, "is_refrigerated") && reader["is_refrigerated"] != DBNull.Value && Convert.ToInt32(reader["is_refrigerated"]) == 1,
                Route = HasColumn(reader, "route") && reader["route"] != DBNull.Value ? reader["route"].ToString() : null,
                PregnancyCategory = HasColumn(reader, "pregnancy_category") && reader["pregnancy_category"] != DBNull.Value ? reader["pregnancy_category"].ToString() : null,
                IsAntibiotic = HasColumn(reader, "is_antibiotic") && reader["is_antibiotic"] != DBNull.Value && Convert.ToInt32(reader["is_antibiotic"]) == 1,
                RxStatus = HasColumn(reader, "rx_status") && reader["rx_status"] != DBNull.Value ? reader["rx_status"].ToString() : null,
                FlavorForm = HasColumn(reader, "flavor_form") && reader["flavor_form"] != DBNull.Value ? reader["flavor_form"].ToString() : null,
                PiecesPerPack = HasColumn(reader, "pieces_per_pack") && reader["pieces_per_pack"] != DBNull.Value ? (int?)Convert.ToInt32(reader["pieces_per_pack"]) : null,
                ImportedAt = reader["imported_at"].ToString(),
                CreatedAt = reader["created_at"].ToString(),
                UpdatedAt = reader["updated_at"] != DBNull.Value ? reader["updated_at"].ToString() : null
            };
        }
    }
}
