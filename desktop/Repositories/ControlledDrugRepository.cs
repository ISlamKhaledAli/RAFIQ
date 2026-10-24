using System;
using System.Collections.Generic;
using System.Data.SQLite;
using RafiqPOS.Models;

namespace RafiqPOS.Repositories
{
    /// <summary>
    /// مستودع قيود أدوية الجدول والرقابة الدوائية وسجل التفتيش الصيدلي (Story 131 / Feature #188)
    /// </summary>
    public class ControlledDrugRepository
    {
        private readonly string _connectionString;

        public ControlledDrugRepository(string connectionString)
        {
            _connectionString = connectionString;
        }

        public void InsertDispense(ControlledDrugDispense dispense, SQLiteConnection externalConn = null, SQLiteTransaction externalTrans = null)
        {
            if (dispense == null) throw new ArgumentNullException("dispense");

            if (string.IsNullOrEmpty(dispense.Id))
            {
                dispense.Id = Guid.NewGuid().ToString();
            }
            if (string.IsNullOrEmpty(dispense.CreatedAt))
            {
                dispense.CreatedAt = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss");
            }
            if (string.IsNullOrEmpty(dispense.EntryType))
            {
                dispense.EntryType = "dispense";
            }

            string sql = @"
                INSERT INTO controlled_dispenses (
                    id, sale_id, sale_item_id, product_id, batch_id, batch_number,
                    quantity_milli, patient_name, patient_national_id, patient_national_id_masked,
                    patient_phone, patient_address, doctor_name, doctor_license_no,
                    prescription_no, prescription_date, prescription_id, entry_type,
                    original_dispense_id, reason, dispensed_by, approved_by, notes, created_at
                ) VALUES (
                    @id, @saleId, @saleItemId, @productId, @batchId, @batchNumber,
                    @quantityMilli, @patientName, @patientNationalId, @patientNationalIdMasked,
                    @patientPhone, @patientAddress, @doctorName, @doctorLicenseNo,
                    @prescriptionNo, @prescriptionDate, @prescriptionId, @entryType,
                    @originalDispenseId, @reason, @dispensedBy, @approvedBy, @notes, @createdAt
                );";

            if (externalConn != null && externalTrans != null)
            {
                using (var cmd = new SQLiteCommand(sql, externalConn, externalTrans))
                {
                    BindDispenseParameters(cmd, dispense);
                    cmd.ExecuteNonQuery();
                }
            }
            else
            {
                using (var conn = new SQLiteConnection(_connectionString))
                {
                    conn.Open();
                    using (var trans = conn.BeginTransaction())
                    {
                        try
                        {
                            using (var cmd = new SQLiteCommand(sql, conn, trans))
                            {
                                BindDispenseParameters(cmd, dispense);
                                cmd.ExecuteNonQuery();
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
        }

        private static void BindDispenseParameters(SQLiteCommand cmd, ControlledDrugDispense d)
        {
            cmd.Parameters.AddWithValue("@id", d.Id);
            cmd.Parameters.AddWithValue("@saleId", (object)d.SaleId ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@saleItemId", (object)d.SaleItemId ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@productId", d.ProductId);
            cmd.Parameters.AddWithValue("@batchId", (object)d.BatchId ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@batchNumber", (object)d.BatchNumber ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@quantityMilli", d.QuantityMilli);
            cmd.Parameters.AddWithValue("@patientName", d.PatientName);
            cmd.Parameters.AddWithValue("@patientNationalId", (object)d.PatientNationalId ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@patientNationalIdMasked", (object)d.PatientNationalIdMasked ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@patientPhone", (object)d.PatientPhone ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@patientAddress", (object)d.PatientAddress ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@doctorName", d.DoctorName);
            cmd.Parameters.AddWithValue("@doctorLicenseNo", (object)d.DoctorLicenseNo ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@prescriptionNo", (object)d.PrescriptionNo ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@prescriptionDate", d.PrescriptionDate);
            cmd.Parameters.AddWithValue("@prescriptionId", (object)d.PrescriptionId ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@entryType", d.EntryType);
            cmd.Parameters.AddWithValue("@originalDispenseId", (object)d.OriginalDispenseId ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@reason", (object)d.Reason ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@dispensedBy", string.IsNullOrEmpty(d.DispensedBy) ? "usr_system" : d.DispensedBy);
            cmd.Parameters.AddWithValue("@approvedBy", (object)d.ApprovedBy ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@notes", (object)d.Notes ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@createdAt", d.CreatedAt);
        }

        public List<ControlledDrugDispense> GetDispenses(string productId = null, string dateFrom = null, string dateTo = null, string entryType = null, int limit = 200)
        {
            var list = new List<ControlledDrugDispense>();

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();

                string sql = @"
                    SELECT 
                        cd.*,
                        p.name AS product_name,
                        u1.display_name AS dispensed_by_name,
                        u2.display_name AS approved_by_name
                    FROM controlled_dispenses cd
                    JOIN products p ON cd.product_id = p.id
                    LEFT JOIN users u1 ON cd.dispensed_by = u1.id
                    LEFT JOIN users u2 ON cd.approved_by = u2.id
                    WHERE 1=1";

                if (!string.IsNullOrEmpty(productId)) sql += " AND cd.product_id = @pid";
                if (!string.IsNullOrEmpty(entryType)) sql += " AND cd.entry_type = @etype";
                if (!string.IsNullOrEmpty(dateFrom)) sql += " AND date(cd.created_at) >= date(@dateFrom)";
                if (!string.IsNullOrEmpty(dateTo)) sql += " AND date(cd.created_at) <= date(@dateTo)";

                sql += " ORDER BY cd.created_at DESC LIMIT @limit;";

                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    if (!string.IsNullOrEmpty(productId)) cmd.Parameters.AddWithValue("@pid", productId);
                    if (!string.IsNullOrEmpty(entryType)) cmd.Parameters.AddWithValue("@etype", entryType);
                    if (!string.IsNullOrEmpty(dateFrom)) cmd.Parameters.AddWithValue("@dateFrom", dateFrom);
                    if (!string.IsNullOrEmpty(dateTo)) cmd.Parameters.AddWithValue("@dateTo", dateTo);
                    cmd.Parameters.AddWithValue("@limit", limit > 0 ? limit : 200);

                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            list.Add(MapDispense(reader));
                        }
                    }
                }
            }

            return list;
        }

        public ControlledDrugDispense GetDispenseById(string id)
        {
            if (string.IsNullOrEmpty(id)) return null;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT 
                        cd.*,
                        p.name AS product_name,
                        u1.display_name AS dispensed_by_name,
                        u2.display_name AS approved_by_name
                    FROM controlled_dispenses cd
                    JOIN products p ON cd.product_id = p.id
                    LEFT JOIN users u1 ON cd.dispensed_by = u1.id
                    LEFT JOIN users u2 ON cd.approved_by = u2.id
                    WHERE cd.id = @id LIMIT 1;";

                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", id);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            return MapDispense(reader);
                        }
                    }
                }
            }

            return null;
        }

        public List<ControlledDrugDispense> GetBySaleId(string saleId)
        {
            var list = new List<ControlledDrugDispense>();
            if (string.IsNullOrEmpty(saleId)) return list;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT 
                        cd.*,
                        p.name AS product_name,
                        u1.display_name AS dispensed_by_name,
                        u2.display_name AS approved_by_name
                    FROM controlled_dispenses cd
                    JOIN products p ON cd.product_id = p.id
                    LEFT JOIN users u1 ON cd.dispensed_by = u1.id
                    LEFT JOIN users u2 ON cd.approved_by = u2.id
                    WHERE cd.sale_id = @sid
                    ORDER BY cd.created_at ASC;";

                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@sid", saleId);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            list.Add(MapDispense(reader));
                        }
                    }
                }
            }

            return list;
        }

        public HashSet<string> GetControlledProductIds()
        {
            var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = "SELECT product_id FROM product_pharma_info WHERE rx_status = 'controlled';";
                using (var cmd = new SQLiteCommand(sql, conn))
                using (var reader = cmd.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        set.Add(reader["product_id"].ToString());
                    }
                }
            }

            return set;
        }

        public bool IsProductControlled(string productId, SQLiteConnection externalConn = null, SQLiteTransaction externalTrans = null)
        {
            if (string.IsNullOrEmpty(productId)) return false;

            string sql = "SELECT COUNT(*) FROM product_pharma_info WHERE product_id = @pid AND rx_status = 'controlled';";

            if (externalConn != null && externalTrans != null)
            {
                using (var cmd = new SQLiteCommand(sql, externalConn, externalTrans))
                {
                    cmd.Parameters.AddWithValue("@pid", productId);
                    object val = cmd.ExecuteScalar();
                    return val != null && Convert.ToInt64(val) > 0;
                }
            }

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@pid", productId);
                    object val = cmd.ExecuteScalar();
                    return val != null && Convert.ToInt64(val) > 0;
                }
            }
        }

        /// <summary>
        /// تقرير دفتر التفتيش الصيدلي الرسمي A4 (Story 131 / Task 188-7)
        /// يحسب رصيد أول المدة والوارد من المشتريات والمنصرف والمرتجع والرصيد التراكمي
        /// </summary>
        public List<ControlledInspectionReportRow> GetInspectionRegister(string productId, string dateFrom, string dateTo)
        {
            var rows = new List<ControlledInspectionReportRow>();
            if (string.IsNullOrEmpty(productId)) return rows;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();

                // 1. حساب رصيد أول المدة (Opening Balance before dateFrom)
                long openingBalanceMilli = 0;

                // أ) الوارد قبل التاريخ
                string sqlPurchasesBefore = @"
                    SELECT COALESCE(SUM(pi.quantity_milli), 0)
                    FROM purchase_items pi
                    JOIN purchases p ON pi.purchase_id = p.id
                    WHERE pi.product_id = @pid AND p.status = 'COMPLETED'
                      AND date(p.created_at) < date(@dateFrom);";

                using (var cmd = new SQLiteCommand(sqlPurchasesBefore, conn))
                {
                    cmd.Parameters.AddWithValue("@pid", productId);
                    cmd.Parameters.AddWithValue("@dateFrom", !string.IsNullOrEmpty(dateFrom) ? dateFrom : "1970-01-01");
                    object res = cmd.ExecuteScalar();
                    if (res != null && res != DBNull.Value) openingBalanceMilli += Convert.ToInt64(res);
                }

                // ب) المنصرف قبل التاريخ
                string sqlDispensedBefore = @"
                    SELECT COALESCE(SUM(quantity_milli), 0)
                    FROM controlled_dispenses
                    WHERE product_id = @pid AND entry_type = 'dispense'
                      AND date(created_at) < date(@dateFrom);";

                using (var cmd = new SQLiteCommand(sqlDispensedBefore, conn))
                {
                    cmd.Parameters.AddWithValue("@pid", productId);
                    cmd.Parameters.AddWithValue("@dateFrom", !string.IsNullOrEmpty(dateFrom) ? dateFrom : "1970-01-01");
                    object res = cmd.ExecuteScalar();
                    if (res != null && res != DBNull.Value) openingBalanceMilli -= Convert.ToInt64(res);
                }

                // ج) المرتجع المعاكس قبل التاريخ
                string sqlReturnsBefore = @"
                    SELECT COALESCE(SUM(quantity_milli), 0)
                    FROM controlled_dispenses
                    WHERE product_id = @pid AND entry_type = 'return'
                      AND date(created_at) < date(@dateFrom);";

                using (var cmd = new SQLiteCommand(sqlReturnsBefore, conn))
                {
                    cmd.Parameters.AddWithValue("@pid", productId);
                    cmd.Parameters.AddWithValue("@dateFrom", !string.IsNullOrEmpty(dateFrom) ? dateFrom : "1970-01-01");
                    object res = cmd.ExecuteScalar();
                    if (res != null && res != DBNull.Value) openingBalanceMilli += Convert.ToInt64(res);
                }

                // سطر رصيد أول المدة
                rows.Add(new ControlledInspectionReportRow
                {
                    Date = !string.IsNullOrEmpty(dateFrom) ? dateFrom : DateTime.UtcNow.ToString("yyyy-MM-dd"),
                    TransactionType = "opening_balance",
                    TransactionTypeAr = "رصيد أول المدة",
                    DocumentRefNo = "-",
                    SupplierOrPatientName = "-",
                    RunningBalanceMilli = openingBalanceMilli,
                    Notes = "رصيد مرحل من الفترة السابقة"
                });

                // 2. جلب جميع الحركات داخل الفترة الزمنية
                // أ) مشتريات (وارد)
                string sqlPurchases = @"
                    SELECT 
                        p.created_at AS trans_date,
                        'inflow_purchase' AS trans_type,
                        'وارد (فاتورة شراء)' AS trans_type_ar,
                        COALESCE(p.invoice_number, p.id) AS doc_ref,
                        s.name AS party_name,
                        NULL AS patient_nat_id,
                        NULL AS doc_name,
                        NULL AS doc_lic,
                        NULL AS rx_no,
                        NULL AS rx_date,
                        pi.batch_number,
                        pi.quantity_milli AS inflow_qty,
                        0 AS outflow_qty,
                        p.created_by_user_id AS user_id,
                        NULL AS approved_by,
                        p.notes
                    FROM purchase_items pi
                    JOIN purchases p ON pi.purchase_id = p.id
                    LEFT JOIN suppliers s ON p.supplier_id = s.id
                    WHERE pi.product_id = @pid AND p.status = 'COMPLETED'";

                if (!string.IsNullOrEmpty(dateFrom)) sqlPurchases += " AND date(p.created_at) >= date(@dateFrom)";
                if (!string.IsNullOrEmpty(dateTo)) sqlPurchases += " AND date(p.created_at) <= date(@dateTo)";

                // ب) صرف ومرتجع من controlled_dispenses
                string sqlDispenses = @"
                    SELECT 
                        cd.created_at AS trans_date,
                        CASE cd.entry_type 
                            WHEN 'return' THEN 'contra_return' 
                            ELSE 'outflow_dispense' 
                        END AS trans_type,
                        CASE cd.entry_type 
                            WHEN 'return' THEN 'مرتجع معاكس للدفتر' 
                            ELSE 'منصرف بروشتة' 
                        END AS trans_type_ar,
                        COALESCE(s.invoice_number, cd.sale_id, cd.prescription_no, cd.id) AS doc_ref,
                        cd.patient_name AS party_name,
                        cd.patient_national_id_masked AS patient_nat_id,
                        cd.doctor_name AS doc_name,
                        cd.doctor_license_no AS doc_lic,
                        cd.prescription_no AS rx_no,
                        cd.prescription_date AS rx_date,
                        cd.batch_number,
                        CASE cd.entry_type WHEN 'return' THEN cd.quantity_milli ELSE 0 END AS inflow_qty,
                        CASE cd.entry_type WHEN 'dispense' THEN cd.quantity_milli ELSE 0 END AS outflow_qty,
                        cd.dispensed_by AS user_id,
                        cd.approved_by,
                        cd.reason AS notes
                    FROM controlled_dispenses cd
                    LEFT JOIN sales s ON cd.sale_id = s.id
                    WHERE cd.product_id = @pid";

                if (!string.IsNullOrEmpty(dateFrom)) sqlDispenses += " AND date(cd.created_at) >= date(@dateFrom)";
                if (!string.IsNullOrEmpty(dateTo)) sqlDispenses += " AND date(cd.created_at) <= date(@dateTo)";

                string unionSql = string.Format(@"
                    SELECT * FROM (
                        {0}
                        UNION ALL
                        {1}
                    ) ALL_TRANS
                    ORDER BY trans_date ASC;", sqlPurchases, sqlDispenses);

                using (var cmd = new SQLiteCommand(unionSql, conn))
                {
                    cmd.Parameters.AddWithValue("@pid", productId);
                    if (!string.IsNullOrEmpty(dateFrom)) cmd.Parameters.AddWithValue("@dateFrom", dateFrom);
                    if (!string.IsNullOrEmpty(dateTo)) cmd.Parameters.AddWithValue("@dateTo", dateTo);

                    using (var reader = cmd.ExecuteReader())
                    {
                        long runningBalance = openingBalanceMilli;

                        while (reader.Read())
                        {
                            long inflow = reader["inflow_qty"] != DBNull.Value ? Convert.ToInt64(reader["inflow_qty"]) : 0;
                            long outflow = reader["outflow_qty"] != DBNull.Value ? Convert.ToInt64(reader["outflow_qty"]) : 0;
                            runningBalance = runningBalance + inflow - outflow;

                            var row = new ControlledInspectionReportRow
                            {
                                Date = reader["trans_date"].ToString(),
                                TransactionType = reader["trans_type"].ToString(),
                                TransactionTypeAr = reader["trans_type_ar"].ToString(),
                                DocumentRefNo = reader["doc_ref"] != DBNull.Value ? reader["doc_ref"].ToString() : "-",
                                SupplierOrPatientName = reader["party_name"] != DBNull.Value ? reader["party_name"].ToString() : "-",
                                PatientNationalIdMasked = reader["patient_nat_id"] != DBNull.Value ? reader["patient_nat_id"].ToString() : null,
                                DoctorName = reader["doc_name"] != DBNull.Value ? reader["doc_name"].ToString() : null,
                                DoctorLicenseNo = reader["doc_lic"] != DBNull.Value ? reader["doc_lic"].ToString() : null,
                                PrescriptionNo = reader["rx_no"] != DBNull.Value ? reader["rx_no"].ToString() : null,
                                PrescriptionDate = reader["rx_date"] != DBNull.Value ? reader["rx_date"].ToString() : null,
                                BatchNumber = reader["batch_number"] != DBNull.Value ? reader["batch_number"].ToString() : null,
                                InflowQtyMilli = inflow,
                                OutflowQtyMilli = outflow,
                                RunningBalanceMilli = runningBalance,
                                DispensedBy = reader["user_id"] != DBNull.Value ? reader["user_id"].ToString() : null,
                                ApprovedBy = reader["approved_by"] != DBNull.Value ? reader["approved_by"].ToString() : null,
                                Notes = reader["notes"] != DBNull.Value ? reader["notes"].ToString() : null
                            };

                            rows.Add(row);
                        }
                    }
                }
            }

            return rows;
        }

        private static ControlledDrugDispense MapDispense(SQLiteDataReader r)
        {
            var d = new ControlledDrugDispense
            {
                Id = r["id"].ToString(),
                SaleId = r["sale_id"] != DBNull.Value ? r["sale_id"].ToString() : null,
                SaleItemId = r["sale_item_id"] != DBNull.Value ? r["sale_item_id"].ToString() : null,
                ProductId = r["product_id"].ToString(),
                BatchId = r["batch_id"] != DBNull.Value ? r["batch_id"].ToString() : null,
                BatchNumber = r["batch_number"] != DBNull.Value ? r["batch_number"].ToString() : null,
                QuantityMilli = Convert.ToInt64(r["quantity_milli"]),
                PatientName = r["patient_name"].ToString(),
                PatientNationalId = r["patient_national_id"] != DBNull.Value ? r["patient_national_id"].ToString() : null,
                PatientNationalIdMasked = r["patient_national_id_masked"] != DBNull.Value ? r["patient_national_id_masked"].ToString() : null,
                PatientPhone = r["patient_phone"] != DBNull.Value ? r["patient_phone"].ToString() : null,
                PatientAddress = r["patient_address"] != DBNull.Value ? r["patient_address"].ToString() : null,
                DoctorName = r["doctor_name"].ToString(),
                DoctorLicenseNo = r["doctor_license_no"] != DBNull.Value ? r["doctor_license_no"].ToString() : null,
                PrescriptionNo = r["prescription_no"] != DBNull.Value ? r["prescription_no"].ToString() : null,
                PrescriptionDate = r["prescription_date"].ToString(),
                PrescriptionId = r["prescription_id"] != DBNull.Value ? r["prescription_id"].ToString() : null,
                EntryType = r["entry_type"].ToString(),
                OriginalDispenseId = r["original_dispense_id"] != DBNull.Value ? r["original_dispense_id"].ToString() : null,
                Reason = r["reason"] != DBNull.Value ? r["reason"].ToString() : null,
                DispensedBy = r["dispensed_by"].ToString(),
                ApprovedBy = r["approved_by"] != DBNull.Value ? r["approved_by"].ToString() : null,
                Notes = r["notes"] != DBNull.Value ? r["notes"].ToString() : null,
                CreatedAt = r["created_at"].ToString()
            };

            try
            {
                if (r["product_name"] != DBNull.Value) d.ProductName = r["product_name"].ToString();
            }
            catch { }

            try
            {
                if (r["dispensed_by_name"] != DBNull.Value) d.DispensedByName = r["dispensed_by_name"].ToString();
            }
            catch { }

            try
            {
                if (r["approved_by_name"] != DBNull.Value) d.ApprovedByName = r["approved_by_name"].ToString();
            }
            catch { }

            return d;
        }
    }
}
