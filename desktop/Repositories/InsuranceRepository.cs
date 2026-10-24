using System;
using System.Collections.Generic;
using System.Data.SQLite;
using RafiqPOS.Models;

namespace RafiqPOS.Repositories
{
    public class InsuranceRepository
    {
        private readonly string _connectionString;

        public InsuranceRepository(string connectionString)
        {
            _connectionString = connectionString;
        }

        #region Companies

        public List<InsuranceCompany> GetCompanies(bool activeOnly = false)
        {
            var list = new List<InsuranceCompany>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT 
                        c.id, c.name, c.phone, c.email, c.tax_number, c.address, c.notes, c.is_active, c.created_at, c.updated_at,
                        (SELECT COUNT(*) FROM insurance_contracts k WHERE k.company_id = c.id AND k.is_active = 1) AS contracts_count,
                        (SELECT COUNT(*) FROM insurance_claim_lines l WHERE l.company_id = c.id AND l.status = 'pending') AS pending_claims_count,
                        (SELECT COALESCE(SUM(l.company_piasters), 0) FROM insurance_claim_lines l WHERE l.company_id = c.id AND l.status = 'pending') AS pending_claims_piasters
                    FROM insurance_companies c
                    " + (activeOnly ? "WHERE c.is_active = 1 " : "") + @"
                    ORDER BY c.name ASC;";

                using (var cmd = new SQLiteCommand(sql, conn))
                using (var reader = cmd.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        list.Add(ReadCompany(reader));
                    }
                }
            }
            return list;
        }

        public InsuranceCompany GetCompanyById(string id)
        {
            if (string.IsNullOrEmpty(id)) return null;
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT 
                        c.id, c.name, c.phone, c.email, c.tax_number, c.address, c.notes, c.is_active, c.created_at, c.updated_at,
                        (SELECT COUNT(*) FROM insurance_contracts k WHERE k.company_id = c.id AND k.is_active = 1) AS contracts_count,
                        (SELECT COUNT(*) FROM insurance_claim_lines l WHERE l.company_id = c.id AND l.status = 'pending') AS pending_claims_count,
                        (SELECT COALESCE(SUM(l.company_piasters), 0) FROM insurance_claim_lines l WHERE l.company_id = c.id AND l.status = 'pending') AS pending_claims_piasters
                    FROM insurance_companies c
                    WHERE c.id = @id
                    LIMIT 1;";

                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", id);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            return ReadCompany(reader);
                        }
                    }
                }
            }
            return null;
        }

        public InsuranceCompany SaveCompany(InsuranceCompany company)
        {
            if (company == null) throw new ArgumentNullException("company");
            if (string.IsNullOrWhiteSpace(company.Name))
            {
                throw new ArgumentException("اسم شركة التأمين مطلوب.");
            }

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string now = DateTime.UtcNow.ToString("o");

                bool exists = false;
                if (!string.IsNullOrEmpty(company.Id))
                {
                    using (var chk = new SQLiteCommand("SELECT 1 FROM insurance_companies WHERE id = @id LIMIT 1;", conn))
                    {
                        chk.Parameters.AddWithValue("@id", company.Id);
                        exists = chk.ExecuteScalar() != null;
                    }
                }

                if (!exists)
                {
                    if (string.IsNullOrEmpty(company.Id))
                    {
                        company.Id = "comp_" + Guid.NewGuid().ToString("N");
                    }
                    if (string.IsNullOrEmpty(company.CreatedAt)) company.CreatedAt = now;
                    company.UpdatedAt = now;

                    string insertSql = @"
                        INSERT INTO insurance_companies (id, name, phone, email, tax_number, address, notes, is_active, created_at, updated_at)
                        VALUES (@id, @name, @phone, @email, @tax, @address, @notes, @active, @created_at, @updated_at);";

                    using (var cmd = new SQLiteCommand(insertSql, conn))
                    {
                        cmd.Parameters.AddWithValue("@id", company.Id);
                        cmd.Parameters.AddWithValue("@name", company.Name.Trim());
                        cmd.Parameters.AddWithValue("@phone", (object)company.Phone ?? DBNull.Value);
                        cmd.Parameters.AddWithValue("@email", (object)company.Email ?? DBNull.Value);
                        cmd.Parameters.AddWithValue("@tax", (object)company.TaxNumber ?? DBNull.Value);
                        cmd.Parameters.AddWithValue("@address", (object)company.Address ?? DBNull.Value);
                        cmd.Parameters.AddWithValue("@notes", (object)company.Notes ?? DBNull.Value);
                        cmd.Parameters.AddWithValue("@active", company.IsActive ? 1 : 0);
                        cmd.Parameters.AddWithValue("@created_at", company.CreatedAt);
                        cmd.Parameters.AddWithValue("@updated_at", company.UpdatedAt);
                        cmd.ExecuteNonQuery();
                    }
                }
                else
                {
                    company.UpdatedAt = now;
                    string updateSql = @"
                        UPDATE insurance_companies
                        SET name = @name, phone = @phone, email = @email, tax_number = @tax, address = @address, notes = @notes, is_active = @active, updated_at = @updated_at
                        WHERE id = @id;";

                    using (var cmd = new SQLiteCommand(updateSql, conn))
                    {
                        cmd.Parameters.AddWithValue("@id", company.Id);
                        cmd.Parameters.AddWithValue("@name", company.Name.Trim());
                        cmd.Parameters.AddWithValue("@phone", (object)company.Phone ?? DBNull.Value);
                        cmd.Parameters.AddWithValue("@email", (object)company.Email ?? DBNull.Value);
                        cmd.Parameters.AddWithValue("@tax", (object)company.TaxNumber ?? DBNull.Value);
                        cmd.Parameters.AddWithValue("@address", (object)company.Address ?? DBNull.Value);
                        cmd.Parameters.AddWithValue("@notes", (object)company.Notes ?? DBNull.Value);
                        cmd.Parameters.AddWithValue("@active", company.IsActive ? 1 : 0);
                        cmd.Parameters.AddWithValue("@updated_at", company.UpdatedAt);
                        cmd.ExecuteNonQuery();
                    }
                }
            }
            return GetCompanyById(company.Id);
        }

        public void DeleteCompany(string id)
        {
            if (string.IsNullOrEmpty(id)) return;
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("UPDATE insurance_companies SET is_active = 0, updated_at = @now WHERE id = @id;", conn))
                {
                    cmd.Parameters.AddWithValue("@id", id);
                    cmd.Parameters.AddWithValue("@now", DateTime.UtcNow.ToString("o"));
                    cmd.ExecuteNonQuery();
                }
            }
        }

        private static InsuranceCompany ReadCompany(SQLiteDataReader reader)
        {
            return new InsuranceCompany
            {
                Id = reader["id"].ToString(),
                Name = reader["name"].ToString(),
                Phone = reader["phone"] != DBNull.Value ? reader["phone"].ToString() : null,
                Email = reader["email"] != DBNull.Value ? reader["email"].ToString() : null,
                TaxNumber = reader["tax_number"] != DBNull.Value ? reader["tax_number"].ToString() : null,
                Address = reader["address"] != DBNull.Value ? reader["address"].ToString() : null,
                Notes = reader["notes"] != DBNull.Value ? reader["notes"].ToString() : null,
                IsActive = Convert.ToInt32(reader["is_active"]) == 1,
                CreatedAt = reader["created_at"].ToString(),
                UpdatedAt = reader["updated_at"] != DBNull.Value ? reader["updated_at"].ToString() : null,
                ContractsCount = Convert.ToInt32(reader["contracts_count"]),
                PendingClaimsCount = Convert.ToInt32(reader["pending_claims_count"]),
                PendingClaimsPiasters = Convert.ToInt64(reader["pending_claims_piasters"])
            };
        }

        #endregion

        #region Contracts & Exclusions

        public List<InsuranceContract> GetContracts(string companyId = null, bool activeOnly = false)
        {
            var list = new List<InsuranceContract>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT 
                        k.id, k.company_id, c.name AS company_name, k.name, k.patient_share_bps,
                        k.cap_per_invoice_piasters, k.cap_per_month_piasters, k.valid_from, k.valid_to,
                        k.excludes_cosmetics, k.notes, k.is_active, k.created_at, k.updated_at
                    FROM insurance_contracts k
                    INNER JOIN insurance_companies c ON c.id = k.company_id
                    WHERE 1=1 "
                    + (!string.IsNullOrEmpty(companyId) ? "AND k.company_id = @comp " : "")
                    + (activeOnly ? "AND k.is_active = 1 AND c.is_active = 1 " : "")
                    + "ORDER BY c.name ASC, k.name ASC;";

                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    if (!string.IsNullOrEmpty(companyId))
                    {
                        cmd.Parameters.AddWithValue("@comp", companyId);
                    }
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            var contract = ReadContract(reader);
                            list.Add(contract);
                        }
                    }
                }

                // Load exclusions for each contract
                foreach (var contract in list)
                {
                    contract.Exclusions = GetExclusionsInternal(conn, contract.Id);
                }
            }
            return list;
        }

        public InsuranceContract GetContractById(string id)
        {
            if (string.IsNullOrEmpty(id)) return null;
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT 
                        k.id, k.company_id, c.name AS company_name, k.name, k.patient_share_bps,
                        k.cap_per_invoice_piasters, k.cap_per_month_piasters, k.valid_from, k.valid_to,
                        k.excludes_cosmetics, k.notes, k.is_active, k.created_at, k.updated_at
                    FROM insurance_contracts k
                    INNER JOIN insurance_companies c ON c.id = k.company_id
                    WHERE k.id = @id
                    LIMIT 1;";

                InsuranceContract contract = null;
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@id", id);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            contract = ReadContract(reader);
                        }
                    }
                }

                if (contract != null)
                {
                    contract.Exclusions = GetExclusionsInternal(conn, contract.Id);
                }
                return contract;
            }
        }

        public InsuranceContract SaveContract(InsuranceContract contract, List<InsuranceExclusion> exclusions = null)
        {
            if (contract == null) throw new ArgumentNullException("contract");
            if (exclusions == null && contract.Exclusions != null)
            {
                exclusions = contract.Exclusions;
            }
            if (string.IsNullOrWhiteSpace(contract.Name)) throw new ArgumentException("اسم العقد التأميني مطلوب.");
            if (string.IsNullOrWhiteSpace(contract.CompanyId)) throw new ArgumentException("اختيار شركة التأمين مطلوب.");
            if (contract.PatientShareBps < 0 || contract.PatientShareBps > 10000)
            {
                throw new ArgumentException("نسبة تحمل المريض يجب أن تكون بين 0% و 100%.");
            }

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        string now = DateTime.UtcNow.ToString("o");

                        bool exists = false;
                        if (!string.IsNullOrEmpty(contract.Id))
                        {
                            using (var chk = new SQLiteCommand("SELECT 1 FROM insurance_contracts WHERE id = @id LIMIT 1;", conn, trans))
                            {
                                chk.Parameters.AddWithValue("@id", contract.Id);
                                exists = chk.ExecuteScalar() != null;
                            }
                        }

                        if (!exists)
                        {
                            if (string.IsNullOrEmpty(contract.Id))
                            {
                                contract.Id = "cntr_" + Guid.NewGuid().ToString("N");
                            }
                            if (string.IsNullOrEmpty(contract.CreatedAt)) contract.CreatedAt = now;
                            contract.UpdatedAt = now;

                            string insertSql = @"
                                INSERT INTO insurance_contracts (
                                    id, company_id, name, patient_share_bps, cap_per_invoice_piasters, cap_per_month_piasters,
                                    valid_from, valid_to, excludes_cosmetics, notes, is_active, created_at, updated_at
                                ) VALUES (
                                    @id, @company_id, @name, @bps, @cap_inv, @cap_mon,
                                    @from, @to, @ex_cosmetics, @notes, @active, @created_at, @updated_at
                                );";

                            using (var cmd = new SQLiteCommand(insertSql, conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@id", contract.Id);
                                cmd.Parameters.AddWithValue("@company_id", contract.CompanyId);
                                cmd.Parameters.AddWithValue("@name", contract.Name.Trim());
                                cmd.Parameters.AddWithValue("@bps", contract.PatientShareBps);
                                cmd.Parameters.AddWithValue("@cap_inv", contract.CapPerInvoicePiasters.HasValue ? (object)contract.CapPerInvoicePiasters.Value : DBNull.Value);
                                cmd.Parameters.AddWithValue("@cap_mon", contract.CapPerMonthPiasters.HasValue ? (object)contract.CapPerMonthPiasters.Value : DBNull.Value);
                                cmd.Parameters.AddWithValue("@from", (object)contract.ValidFrom ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@to", (object)contract.ValidTo ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@ex_cosmetics", contract.ExcludesCosmetics ? 1 : 0);
                                cmd.Parameters.AddWithValue("@notes", (object)contract.Notes ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@active", contract.IsActive ? 1 : 0);
                                cmd.Parameters.AddWithValue("@created_at", contract.CreatedAt);
                                cmd.Parameters.AddWithValue("@updated_at", contract.UpdatedAt);
                                cmd.ExecuteNonQuery();
                            }
                        }
                        else
                        {
                            contract.UpdatedAt = now;
                            string updateSql = @"
                                UPDATE insurance_contracts
                                SET company_id = @company_id, name = @name, patient_share_bps = @bps,
                                    cap_per_invoice_piasters = @cap_inv, cap_per_month_piasters = @cap_mon,
                                    valid_from = @from, valid_to = @to, excludes_cosmetics = @ex_cosmetics,
                                    notes = @notes, is_active = @active, updated_at = @updated_at
                                WHERE id = @id;";

                            using (var cmd = new SQLiteCommand(updateSql, conn, trans))
                            {
                                cmd.Parameters.AddWithValue("@id", contract.Id);
                                cmd.Parameters.AddWithValue("@company_id", contract.CompanyId);
                                cmd.Parameters.AddWithValue("@name", contract.Name.Trim());
                                cmd.Parameters.AddWithValue("@bps", contract.PatientShareBps);
                                cmd.Parameters.AddWithValue("@cap_inv", contract.CapPerInvoicePiasters.HasValue ? (object)contract.CapPerInvoicePiasters.Value : DBNull.Value);
                                cmd.Parameters.AddWithValue("@cap_mon", contract.CapPerMonthPiasters.HasValue ? (object)contract.CapPerMonthPiasters.Value : DBNull.Value);
                                cmd.Parameters.AddWithValue("@from", (object)contract.ValidFrom ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@to", (object)contract.ValidTo ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@ex_cosmetics", contract.ExcludesCosmetics ? 1 : 0);
                                cmd.Parameters.AddWithValue("@notes", (object)contract.Notes ?? DBNull.Value);
                                cmd.Parameters.AddWithValue("@active", contract.IsActive ? 1 : 0);
                                cmd.Parameters.AddWithValue("@updated_at", contract.UpdatedAt);
                                cmd.ExecuteNonQuery();
                            }
                        }

                        // Save exclusions: delete old and insert updated
                        using (var delCmd = new SQLiteCommand("DELETE FROM insurance_exclusions WHERE contract_id = @cid;", conn, trans))
                        {
                            delCmd.Parameters.AddWithValue("@cid", contract.Id);
                            delCmd.ExecuteNonQuery();
                        }

                        if (exclusions != null && exclusions.Count > 0)
                        {
                            foreach (var ex in exclusions)
                            {
                                if (string.IsNullOrEmpty(ex.ProductId) && string.IsNullOrEmpty(ex.CategoryId)) continue;

                                string exSql = @"
                                    INSERT INTO insurance_exclusions (id, contract_id, category_id, product_id, created_at)
                                    VALUES (@id, @cid, @cat_id, @prod_id, @created);";

                                using (var exCmd = new SQLiteCommand(exSql, conn, trans))
                                {
                                    exCmd.Parameters.AddWithValue("@id", "excl_" + Guid.NewGuid().ToString("N"));
                                    exCmd.Parameters.AddWithValue("@cid", contract.Id);
                                    exCmd.Parameters.AddWithValue("@cat_id", (object)ex.CategoryId ?? DBNull.Value);
                                    exCmd.Parameters.AddWithValue("@prod_id", (object)ex.ProductId ?? DBNull.Value);
                                    exCmd.Parameters.AddWithValue("@created", now);
                                    exCmd.ExecuteNonQuery();
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
            return GetContractById(contract.Id);
        }

        public void DeleteContract(string id)
        {
            if (string.IsNullOrEmpty(id)) return;
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var cmd = new SQLiteCommand("UPDATE insurance_contracts SET is_active = 0, updated_at = @now WHERE id = @id;", conn))
                {
                    cmd.Parameters.AddWithValue("@id", id);
                    cmd.Parameters.AddWithValue("@now", DateTime.UtcNow.ToString("o"));
                    cmd.ExecuteNonQuery();
                }
            }
        }

        public List<InsuranceExclusion> GetExclusions(string contractId)
        {
            if (string.IsNullOrEmpty(contractId)) return new List<InsuranceExclusion>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                return GetExclusionsInternal(conn, contractId);
            }
        }

        private static List<InsuranceExclusion> GetExclusionsInternal(SQLiteConnection conn, string contractId)
        {
            var list = new List<InsuranceExclusion>();
            string sql = @"
                SELECT 
                    e.id, e.contract_id, e.category_id, cat.name AS category_name,
                    e.product_id, p.name AS product_name, e.created_at
                FROM insurance_exclusions e
                LEFT JOIN categories cat ON cat.id = e.category_id
                LEFT JOIN products p ON p.id = e.product_id
                WHERE e.contract_id = @cid;";

            using (var cmd = new SQLiteCommand(sql, conn))
            {
                cmd.Parameters.AddWithValue("@cid", contractId);
                using (var reader = cmd.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        list.Add(new InsuranceExclusion
                        {
                            Id = reader["id"].ToString(),
                            ContractId = reader["contract_id"].ToString(),
                            CategoryId = reader["category_id"] != DBNull.Value ? reader["category_id"].ToString() : null,
                            CategoryName = reader["category_name"] != DBNull.Value ? reader["category_name"].ToString() : null,
                            ProductId = reader["product_id"] != DBNull.Value ? reader["product_id"].ToString() : null,
                            ProductName = reader["product_name"] != DBNull.Value ? reader["product_name"].ToString() : null,
                            CreatedAt = reader["created_at"].ToString()
                        });
                    }
                }
            }
            return list;
        }

        private static InsuranceContract ReadContract(SQLiteDataReader reader)
        {
            return new InsuranceContract
            {
                Id = reader["id"].ToString(),
                CompanyId = reader["company_id"].ToString(),
                CompanyName = reader["company_name"] != DBNull.Value ? reader["company_name"].ToString() : "",
                Name = reader["name"].ToString(),
                PatientShareBps = Convert.ToInt32(reader["patient_share_bps"]),
                CapPerInvoicePiasters = reader["cap_per_invoice_piasters"] != DBNull.Value ? (long?)Convert.ToInt64(reader["cap_per_invoice_piasters"]) : null,
                CapPerMonthPiasters = reader["cap_per_month_piasters"] != DBNull.Value ? (long?)Convert.ToInt64(reader["cap_per_month_piasters"]) : null,
                ValidFrom = reader["valid_from"] != DBNull.Value ? reader["valid_from"].ToString() : null,
                ValidTo = reader["valid_to"] != DBNull.Value ? reader["valid_to"].ToString() : null,
                ExcludesCosmetics = Convert.ToInt32(reader["excludes_cosmetics"]) == 1,
                Notes = reader["notes"] != DBNull.Value ? reader["notes"].ToString() : null,
                IsActive = Convert.ToInt32(reader["is_active"]) == 1,
                CreatedAt = reader["created_at"].ToString(),
                UpdatedAt = reader["updated_at"] != DBNull.Value ? reader["updated_at"].ToString() : null
            };
        }

        #endregion

        #region Members

        public List<InsuranceMember> GetMembers(string contractId = null, string query = null)
        {
            var list = new List<InsuranceMember>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT 
                        m.id, m.contract_id, k.name AS contract_name, k.company_id, c.name AS company_name,
                        m.customer_id, m.member_name, m.member_no, m.national_id, m.phone, m.valid_to,
                        m.is_active, m.created_at, m.updated_at
                    FROM insurance_members m
                    INNER JOIN insurance_contracts k ON k.id = m.contract_id
                    INNER JOIN insurance_companies c ON c.id = k.company_id
                    WHERE m.is_active = 1 "
                    + (!string.IsNullOrEmpty(contractId) ? "AND m.contract_id = @cid " : "")
                    + (!string.IsNullOrEmpty(query) ? "AND (m.member_name LIKE @q OR m.member_no LIKE @q OR m.phone LIKE @q) " : "")
                    + "ORDER BY m.member_name ASC LIMIT 100;";

                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    if (!string.IsNullOrEmpty(contractId)) cmd.Parameters.AddWithValue("@cid", contractId);
                    if (!string.IsNullOrEmpty(query)) cmd.Parameters.AddWithValue("@q", "%" + query.Trim() + "%");

                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            list.Add(ReadMember(reader));
                        }
                    }
                }
            }
            return list;
        }

        public InsuranceMember GetMemberByNo(string memberNo)
        {
            if (string.IsNullOrWhiteSpace(memberNo)) return null;
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT 
                        m.id, m.contract_id, k.name AS contract_name, k.company_id, c.name AS company_name,
                        m.customer_id, m.member_name, m.member_no, m.national_id, m.phone, m.valid_to,
                        m.is_active, m.created_at, m.updated_at
                    FROM insurance_members m
                    INNER JOIN insurance_contracts k ON k.id = m.contract_id
                    INNER JOIN insurance_companies c ON c.id = k.company_id
                    WHERE m.member_no = @no AND m.is_active = 1
                    LIMIT 1;";

                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@no", memberNo.Trim());
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            return ReadMember(reader);
                        }
                    }
                }
            }
            return null;
        }

        public InsuranceMember SaveMember(InsuranceMember member)
        {
            if (member == null) throw new ArgumentNullException("member");
            if (string.IsNullOrWhiteSpace(member.MemberName)) throw new ArgumentException("اسم المشترك / المريض مطلوب.");
            if (string.IsNullOrWhiteSpace(member.MemberNo)) throw new ArgumentException("رقم الكارنيه / العضوية مطلوب.");
            if (string.IsNullOrWhiteSpace(member.ContractId)) throw new ArgumentException("اختيار العقد التأميني مطلوب.");

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string now = DateTime.UtcNow.ToString("o");

                bool exists = false;
                if (!string.IsNullOrEmpty(member.Id))
                {
                    using (var chk = new SQLiteCommand("SELECT 1 FROM insurance_members WHERE id = @id LIMIT 1;", conn))
                    {
                        chk.Parameters.AddWithValue("@id", member.Id);
                        exists = chk.ExecuteScalar() != null;
                    }
                }

                if (!exists)
                {
                    if (string.IsNullOrEmpty(member.Id))
                    {
                        member.Id = "mem_" + Guid.NewGuid().ToString("N");
                    }
                    if (string.IsNullOrEmpty(member.CreatedAt)) member.CreatedAt = now;
                    member.UpdatedAt = now;

                    string insertSql = @"
                        INSERT INTO insurance_members (
                            id, contract_id, customer_id, member_name, member_no, national_id, phone, valid_to, is_active, created_at, updated_at
                        ) VALUES (
                            @id, @cid, @cust_id, @name, @no, @nat_id, @phone, @valid_to, @active, @created_at, @updated_at
                        );";

                    using (var cmd = new SQLiteCommand(insertSql, conn))
                    {
                        cmd.Parameters.AddWithValue("@id", member.Id);
                        cmd.Parameters.AddWithValue("@cid", member.ContractId);
                        cmd.Parameters.AddWithValue("@cust_id", (object)member.CustomerId ?? DBNull.Value);
                        cmd.Parameters.AddWithValue("@name", member.MemberName.Trim());
                        cmd.Parameters.AddWithValue("@no", member.MemberNo.Trim());
                        cmd.Parameters.AddWithValue("@nat_id", (object)member.NationalId ?? DBNull.Value);
                        cmd.Parameters.AddWithValue("@phone", (object)member.Phone ?? DBNull.Value);
                        cmd.Parameters.AddWithValue("@valid_to", (object)member.ValidTo ?? DBNull.Value);
                        cmd.Parameters.AddWithValue("@active", member.IsActive ? 1 : 0);
                        cmd.Parameters.AddWithValue("@created_at", member.CreatedAt);
                        cmd.Parameters.AddWithValue("@updated_at", member.UpdatedAt);
                        cmd.ExecuteNonQuery();
                    }
                }
                else
                {
                    member.UpdatedAt = now;
                    string updateSql = @"
                        UPDATE insurance_members
                        SET contract_id = @cid, customer_id = @cust_id, member_name = @name, member_no = @no,
                            national_id = @nat_id, phone = @phone, valid_to = @valid_to, is_active = @active, updated_at = @updated_at
                        WHERE id = @id;";

                    using (var cmd = new SQLiteCommand(updateSql, conn))
                    {
                        cmd.Parameters.AddWithValue("@id", member.Id);
                        cmd.Parameters.AddWithValue("@cid", member.ContractId);
                        cmd.Parameters.AddWithValue("@cust_id", (object)member.CustomerId ?? DBNull.Value);
                        cmd.Parameters.AddWithValue("@name", member.MemberName.Trim());
                        cmd.Parameters.AddWithValue("@no", member.MemberNo.Trim());
                        cmd.Parameters.AddWithValue("@nat_id", (object)member.NationalId ?? DBNull.Value);
                        cmd.Parameters.AddWithValue("@phone", (object)member.Phone ?? DBNull.Value);
                        cmd.Parameters.AddWithValue("@valid_to", (object)member.ValidTo ?? DBNull.Value);
                        cmd.Parameters.AddWithValue("@active", member.IsActive ? 1 : 0);
                        cmd.Parameters.AddWithValue("@updated_at", member.UpdatedAt);
                        cmd.ExecuteNonQuery();
                    }
                }
            }
            return GetMemberByNo(member.MemberNo);
        }

        private static InsuranceMember ReadMember(SQLiteDataReader reader)
        {
            return new InsuranceMember
            {
                Id = reader["id"].ToString(),
                ContractId = reader["contract_id"].ToString(),
                ContractName = reader["contract_name"] != DBNull.Value ? reader["contract_name"].ToString() : "",
                CompanyId = reader["company_id"] != DBNull.Value ? reader["company_id"].ToString() : "",
                CompanyName = reader["company_name"] != DBNull.Value ? reader["company_name"].ToString() : "",
                CustomerId = reader["customer_id"] != DBNull.Value ? reader["customer_id"].ToString() : null,
                MemberName = reader["member_name"].ToString(),
                MemberNo = reader["member_no"].ToString(),
                NationalId = reader["national_id"] != DBNull.Value ? reader["national_id"].ToString() : null,
                Phone = reader["phone"] != DBNull.Value ? reader["phone"].ToString() : null,
                ValidTo = reader["valid_to"] != DBNull.Value ? reader["valid_to"].ToString() : null,
                IsActive = Convert.ToInt32(reader["is_active"]) == 1,
                CreatedAt = reader["created_at"].ToString(),
                UpdatedAt = reader["updated_at"] != DBNull.Value ? reader["updated_at"].ToString() : null
            };
        }

        #endregion

        #region Financial Calculation (Co-pay Split Engine - Tasks 189-3 & 189-8)

        /// <summary>
        /// Precision Financial Calculation of Co-payment Split using Pure Integer Arithmetic.
        /// 1. Excluded items -> 100% patient share.
        /// 2. Covered items -> patientShare = (covered * bps + 5000) / 10000.
        /// 3. Company share on covered = covered - patientShare.
        /// 4. Apply Cap per invoice -> excess shifted to patient.
        /// Invariant: PatientShare + CompanyShare == TotalInvoice always!
        /// </summary>
        public InsuranceCalculationResult CalculateSplit(string contractId, List<SaleItem> items)
        {
            var res = new InsuranceCalculationResult();
            if (string.IsNullOrEmpty(contractId) || items == null || items.Count == 0)
            {
                return res;
            }

            var contract = GetContractById(contractId);
            if (contract == null || !contract.IsActive)
            {
                throw new InvalidOperationException("عقد التأمين المحدد غير صالح أو غير مفعّل.");
            }

            res.ContractId = contract.Id;
            res.ContractName = contract.Name;
            res.CompanyId = contract.CompanyId;
            res.PatientShareBps = contract.PatientShareBps;

            // Load product details for items to check cosmetics and exclusions
            var excludedProductIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var excludedCategoryIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            if (contract.Exclusions != null)
            {
                for (int i = 0; i < contract.Exclusions.Count; i++)
                {
                    var ex = contract.Exclusions[i];
                    if (!string.IsNullOrEmpty(ex.ProductId)) excludedProductIds.Add(ex.ProductId);
                    if (!string.IsNullOrEmpty(ex.CategoryId)) excludedCategoryIds.Add(ex.CategoryId);
                }
            }

            long totalInvoice = 0;
            long coveredTotal = 0;
            long excludedTotal = 0;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();

                for (int i = 0; i < items.Count; i++)
                {
                    var it = items[i];
                    if (it == null) continue;

                    long lineTotal = it.TotalPiasters;
                    if (lineTotal <= 0)
                    {
                        lineTotal = (it.UnitPricePiasters * it.QuantityMilli) / 1000L - it.DiscountPiasters;
                        if (lineTotal < 0) lineTotal = 0;
                    }
                    totalInvoice += lineTotal;

                    // Query product category & cosmetic flag
                    string prodCatId = null;
                    string prodCatName = null;
                    bool isCosmetic = false;

                    using (var cmd = new SQLiteCommand("SELECT category_id FROM products WHERE id = @pid LIMIT 1;", conn))
                    {
                        cmd.Parameters.AddWithValue("@pid", it.ProductId);
                        object catObj = cmd.ExecuteScalar();
                        if (catObj != null && catObj != DBNull.Value) prodCatId = catObj.ToString();
                    }

                    if (!string.IsNullOrEmpty(prodCatId))
                    {
                        using (var cmd = new SQLiteCommand("SELECT name FROM categories WHERE id = @cid LIMIT 1;", conn))
                        {
                            cmd.Parameters.AddWithValue("@cid", prodCatId);
                            object nameObj = cmd.ExecuteScalar();
                            if (nameObj != null && nameObj != DBNull.Value)
                            {
                                prodCatName = nameObj.ToString();
                                if (prodCatName.Contains("تجميل") || prodCatName.ToLowerInvariant().Contains("cosmetic"))
                                {
                                    isCosmetic = true;
                                }
                            }
                        }
                    }

                    bool isExcluded = false;
                    string reason = null;

                    if (contract.ExcludesCosmetics && isCosmetic)
                    {
                        isExcluded = true;
                        reason = "مستحضرات تجميل غير مغطاة بالعقد";
                    }
                    else if (!string.IsNullOrEmpty(it.ProductId) && excludedProductIds.Contains(it.ProductId))
                    {
                        isExcluded = true;
                        reason = "الصنف مستثنى صراحة من تغطية العقد";
                    }
                    else if (!string.IsNullOrEmpty(prodCatId) && excludedCategoryIds.Contains(prodCatId))
                    {
                        isExcluded = true;
                        reason = "تصنيف الصنف مستثنى من تغطية العقد";
                    }

                    var itemCov = new InsuranceItemCoverage
                    {
                        ProductId = it.ProductId,
                        ProductName = it.ProductName,
                        LineTotalPiasters = lineTotal,
                        IsCovered = !isExcluded,
                        ExclusionReason = reason
                    };

                    if (isExcluded)
                    {
                        excludedTotal += lineTotal;
                        itemCov.PatientPiasters = lineTotal;
                        itemCov.CompanyPiasters = 0;
                    }
                    else
                    {
                        coveredTotal += lineTotal;
                        // Calculate provisional patient share per line (for display breakdown)
                        long linePatientShare = (lineTotal * contract.PatientShareBps + 5000L) / 10000L;
                        itemCov.PatientPiasters = linePatientShare;
                        itemCov.CompanyPiasters = lineTotal - linePatientShare;
                    }

                    res.ItemCoverages.Add(itemCov);
                }
            }

            res.TotalInvoicePiasters = totalInvoice;
            res.CoveredPiasters = coveredTotal;
            res.ExcludedPiasters = excludedTotal;

            // Global co-pay calculation on covered portion with exact integer round-half-up
            long patientShareOnCovered = (coveredTotal * contract.PatientShareBps + 5000L) / 10000L;
            long companyShare = coveredTotal - patientShareOnCovered;
            long patientShare = excludedTotal + patientShareOnCovered;

            // Cap check
            if (contract.CapPerInvoicePiasters.HasValue && contract.CapPerInvoicePiasters.Value > 0)
            {
                long cap = contract.CapPerInvoicePiasters.Value;
                if (companyShare > cap)
                {
                    long excess = companyShare - cap;
                    companyShare = cap;
                    patientShare += excess;
                    res.CapApplied = true;
                    res.CapExcessPiasters = excess;
                }
            }

            res.PatientPiasters = patientShare;
            res.CompanyPiasters = companyShare;

            return res;
        }

        #endregion

        #region Claims & Batches (Tasks 189-6 & 189-7)

        public void InsertClaimLine(InsuranceClaimLine line, SQLiteConnection conn, SQLiteTransaction trans)
        {
            if (line == null) throw new ArgumentNullException("line");
            if (string.IsNullOrEmpty(line.Id)) line.Id = "clm_" + Guid.NewGuid().ToString("N");
            if (string.IsNullOrEmpty(line.CreatedAt)) line.CreatedAt = DateTime.UtcNow.ToString("o");

            string sql = @"
                INSERT INTO insurance_claim_lines (
                    id, sale_id, contract_id, company_id, member_id, member_no, patient_name, approval_no,
                    total_invoice_piasters, covered_piasters, patient_piasters, company_piasters,
                    status, claim_batch_id, settled_at, rejection_reason, created_at, updated_at
                ) VALUES (
                    @id, @sale_id, @cntr_id, @comp_id, @mem_id, @mem_no, @pat_name, @appr_no,
                    @tot_inv, @cov, @pat_amt, @comp_amt,
                    @status, @batch_id, @settled, @rej_reason, @created_at, @updated_at
                );";

            using (var cmd = new SQLiteCommand(sql, conn, trans))
            {
                cmd.Parameters.AddWithValue("@id", line.Id);
                cmd.Parameters.AddWithValue("@sale_id", line.SaleId);
                cmd.Parameters.AddWithValue("@cntr_id", line.ContractId);
                cmd.Parameters.AddWithValue("@comp_id", line.CompanyId);
                cmd.Parameters.AddWithValue("@mem_id", (object)line.MemberId ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@mem_no", line.MemberNo ?? "");
                cmd.Parameters.AddWithValue("@pat_name", line.PatientName ?? "");
                cmd.Parameters.AddWithValue("@appr_no", (object)line.ApprovalNo ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@tot_inv", line.TotalInvoicePiasters);
                cmd.Parameters.AddWithValue("@cov", line.CoveredPiasters);
                cmd.Parameters.AddWithValue("@pat_amt", line.PatientPiasters);
                cmd.Parameters.AddWithValue("@comp_amt", line.CompanyPiasters);
                cmd.Parameters.AddWithValue("@status", line.Status ?? "pending");
                cmd.Parameters.AddWithValue("@batch_id", (object)line.ClaimBatchId ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@settled", (object)line.SettledAt ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@rej_reason", (object)line.RejectionReason ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@created_at", line.CreatedAt);
                cmd.Parameters.AddWithValue("@updated_at", (object)line.UpdatedAt ?? DBNull.Value);
                cmd.ExecuteNonQuery();
            }
        }

        public List<InsuranceClaimLine> GetPendingClaimLines(string companyId = null)
        {
            var list = new List<InsuranceClaimLine>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT 
                        l.id, l.sale_id, s.invoice_number, l.contract_id, k.name AS contract_name,
                        l.company_id, c.name AS company_name, l.member_id, l.member_no, l.patient_name,
                        l.approval_no, l.total_invoice_piasters, l.covered_piasters, l.patient_piasters,
                        l.company_piasters, l.status, l.claim_batch_id, NULL AS claim_batch_number,
                        l.settled_at, l.rejection_reason, l.created_at, l.updated_at
                    FROM insurance_claim_lines l
                    INNER JOIN sales s ON s.id = l.sale_id
                    INNER JOIN insurance_contracts k ON k.id = l.contract_id
                    INNER JOIN insurance_companies c ON c.id = l.company_id
                    WHERE l.status = 'pending' "
                    + (!string.IsNullOrEmpty(companyId) ? "AND l.company_id = @comp " : "")
                    + "ORDER BY l.created_at ASC;";

                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    if (!string.IsNullOrEmpty(companyId)) cmd.Parameters.AddWithValue("@comp", companyId);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            list.Add(ReadClaimLine(reader));
                        }
                    }
                }
            }
            return list;
        }

        public List<InsuranceClaimLine> GetClaimLinesByBatch(string batchId)
        {
            var list = new List<InsuranceClaimLine>();
            if (string.IsNullOrEmpty(batchId)) return list;

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT 
                        l.id, l.sale_id, s.invoice_number, l.contract_id, k.name AS contract_name,
                        l.company_id, c.name AS company_name, l.member_id, l.member_no, l.patient_name,
                        l.approval_no, l.total_invoice_piasters, l.covered_piasters, l.patient_piasters,
                        l.company_piasters, l.status, l.claim_batch_id, b.batch_number AS claim_batch_number,
                        l.settled_at, l.rejection_reason, l.created_at, l.updated_at
                    FROM insurance_claim_lines l
                    INNER JOIN sales s ON s.id = l.sale_id
                    INNER JOIN insurance_contracts k ON k.id = l.contract_id
                    INNER JOIN insurance_companies c ON c.id = l.company_id
                    LEFT JOIN insurance_claim_batches b ON b.id = l.claim_batch_id
                    WHERE l.claim_batch_id = @bid
                    ORDER BY l.created_at ASC;";

                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@bid", batchId);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            list.Add(ReadClaimLine(reader));
                        }
                    }
                }
            }
            return list;
        }

        public List<InsuranceClaimBatch> GetBatches(string companyId = null, string status = null)
        {
            var list = new List<InsuranceClaimBatch>();
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT 
                        b.id, b.batch_number, b.company_id, c.name AS company_name, b.period,
                        b.total_claims_count, b.total_amount_piasters, b.status, b.submitted_at,
                        b.settled_at, b.settled_amount_piasters, b.rejected_amount_piasters,
                        b.rejection_reason, b.settlement_notes, b.settlement_deduction_target,
                        b.notes, b.created_by, b.created_at, b.updated_at
                    FROM insurance_claim_batches b
                    INNER JOIN insurance_companies c ON c.id = b.company_id
                    WHERE 1=1 "
                    + (!string.IsNullOrEmpty(companyId) ? "AND b.company_id = @comp " : "")
                    + (!string.IsNullOrEmpty(status) ? "AND b.status = @stat " : "")
                    + "ORDER BY b.created_at DESC;";

                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    if (!string.IsNullOrEmpty(companyId)) cmd.Parameters.AddWithValue("@comp", companyId);
                    if (!string.IsNullOrEmpty(status)) cmd.Parameters.AddWithValue("@stat", status);

                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            list.Add(ReadBatch(reader));
                        }
                    }
                }
            }
            return list;
        }

        public List<InsuranceClaimBatch> GetClaimBatches(string companyId = null)
        {
            return GetBatches(companyId);
        }

        public InsuranceClaimBatch GetBatchById(string batchId)
        {
            if (string.IsNullOrEmpty(batchId)) return null;
            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                string sql = @"
                    SELECT 
                        b.id, b.batch_number, b.company_id, c.name AS company_name, b.period,
                        b.total_claims_count, b.total_amount_piasters, b.status, b.submitted_at,
                        b.settled_at, b.settled_amount_piasters, b.rejected_amount_piasters,
                        b.rejection_reason, b.settlement_notes, b.settlement_deduction_target,
                        b.notes, b.created_by, b.created_at, b.updated_at
                    FROM insurance_claim_batches b
                    INNER JOIN insurance_companies c ON c.id = b.company_id
                    WHERE b.id = @bid
                    LIMIT 1;";

                InsuranceClaimBatch batch = null;
                using (var cmd = new SQLiteCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@bid", batchId);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            batch = ReadBatch(reader);
                        }
                    }
                }

                if (batch != null)
                {
                    batch.Lines = GetClaimLinesByBatch(batch.Id);
                }
                return batch;
            }
        }

        public InsuranceClaimBatch CreateClaimBatch(string companyId, string period, List<string> claimLineIds, string createdBy, string notes = null)
        {
            if (string.IsNullOrEmpty(companyId)) throw new ArgumentException("معرف شركة التأمين مطلوب.");
            if (string.IsNullOrEmpty(period)) throw new ArgumentException("فترة المطالبة مطلوبة (مثال: 2026-10).");
            if (claimLineIds == null || claimLineIds.Count == 0) throw new ArgumentException("يجب اختيار بند مطالبة واحد على الأقل لإصدار الدفعة.");

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        string batchId = "btch_" + Guid.NewGuid().ToString("N");
                        string batchNo = "CLM-" + DateTime.UtcNow.ToString("yyyyMM") + "-" + (DateTime.UtcNow.Ticks % 10000).ToString("0000");
                        string now = DateTime.UtcNow.ToString("o");

                        long totalPiasters = 0;
                        int validCount = 0;

                        for (int i = 0; i < claimLineIds.Count; i++)
                        {
                            string lid = claimLineIds[i];
                            long lineCompanyAmt = 0;

                            using (var checkCmd = new SQLiteCommand(@"
                                SELECT company_piasters FROM insurance_claim_lines
                                WHERE id = @lid AND company_id = @cid AND status = 'pending' LIMIT 1;", conn, trans))
                            {
                                checkCmd.Parameters.AddWithValue("@lid", lid);
                                checkCmd.Parameters.AddWithValue("@cid", companyId);
                                object res = checkCmd.ExecuteScalar();
                                if (res != null && res != DBNull.Value)
                                {
                                    lineCompanyAmt = Convert.ToInt64(res);
                                    validCount++;
                                    totalPiasters += lineCompanyAmt;

                                    // Update line to batched
                                    using (var updCmd = new SQLiteCommand(@"
                                        UPDATE insurance_claim_lines 
                                        SET status = 'batched', claim_batch_id = @bid, updated_at = @now
                                        WHERE id = @lid;", conn, trans))
                                    {
                                        updCmd.Parameters.AddWithValue("@bid", batchId);
                                        updCmd.Parameters.AddWithValue("@now", now);
                                        updCmd.Parameters.AddWithValue("@lid", lid);
                                        updCmd.ExecuteNonQuery();
                                    }
                                }
                            }
                        }

                        if (validCount == 0)
                        {
                            throw new InvalidOperationException("لم يتم العثور على أي بنود مطالبات معلقة صالحة للشركة المحددة.");
                        }

                        string batchSql = @"
                            INSERT INTO insurance_claim_batches (
                                id, batch_number, company_id, period, total_claims_count, total_amount_piasters,
                                status, submitted_at, notes, created_by, created_at, updated_at
                            ) VALUES (
                                @id, @no, @cid, @period, @cnt, @amt,
                                'submitted', @now, @notes, @by, @now, @now
                            );";

                        using (var bCmd = new SQLiteCommand(batchSql, conn, trans))
                        {
                            bCmd.Parameters.AddWithValue("@id", batchId);
                            bCmd.Parameters.AddWithValue("@no", batchNo);
                            bCmd.Parameters.AddWithValue("@cid", companyId);
                            bCmd.Parameters.AddWithValue("@period", period.Trim());
                            bCmd.Parameters.AddWithValue("@cnt", validCount);
                            bCmd.Parameters.AddWithValue("@amt", totalPiasters);
                            bCmd.Parameters.AddWithValue("@now", now);
                            bCmd.Parameters.AddWithValue("@notes", (object)notes ?? DBNull.Value);
                            bCmd.Parameters.AddWithValue("@by", createdBy ?? "cashier");
                            bCmd.ExecuteNonQuery();
                        }

                        trans.Commit();
                        return GetBatchById(batchId);
                    }
                    catch
                    {
                        trans.Rollback();
                        throw;
                    }
                }
            }
        }

        public InsuranceClaimBatch SettleBatch(
            string batchId,
            long settledAmountPiasters,
            long rejectedAmountPiasters,
            string rejectionReason,
            string settlementDeductionTarget,
            string settledBy,
            string notes = null)
        {
            if (string.IsNullOrEmpty(batchId)) throw new ArgumentException("معرف دفعة المطالبة مطلوب.");
            if (settledAmountPiasters < 0 || rejectedAmountPiasters < 0)
            {
                throw new ArgumentException("المبالغ المسددة والمرفوضة لا يمكن أن تكون سالبة.");
            }

            using (var conn = new SQLiteConnection(_connectionString))
            {
                conn.Open();
                using (var trans = conn.BeginTransaction())
                {
                    try
                    {
                        var batch = GetBatchById(batchId);
                        if (batch == null) throw new InvalidOperationException("دفعة المطالبة غير موجودة.");

                        long totalBatch = batch.TotalAmountPiasters;
                        if (settledAmountPiasters + rejectedAmountPiasters != totalBatch)
                        {
                            throw new InvalidOperationException(string.Format("مجموع المسدد ({0} قرش) والمرفوض ({1} قرش) لا يساوي إجمالي الدفعة ({2} قرش).", settledAmountPiasters, rejectedAmountPiasters, totalBatch));
                        }

                        string now = DateTime.UtcNow.ToString("o");
                        string newStatus = (rejectedAmountPiasters == 0) ? "settled" : (settledAmountPiasters > 0 ? "partially_settled" : "rejected");

                        string updBatchSql = @"
                            UPDATE insurance_claim_batches
                            SET status = @stat, settled_at = @now, settled_amount_piasters = @settled,
                                rejected_amount_piasters = @rej_amt, rejection_reason = @rej_reason,
                                settlement_notes = @notes, settlement_deduction_target = @target, updated_at = @now
                            WHERE id = @id;";

                        using (var cmd = new SQLiteCommand(updBatchSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@stat", newStatus);
                            cmd.Parameters.AddWithValue("@now", now);
                            cmd.Parameters.AddWithValue("@settled", settledAmountPiasters);
                            cmd.Parameters.AddWithValue("@rej_amt", rejectedAmountPiasters);
                            cmd.Parameters.AddWithValue("@rej_reason", (object)rejectionReason ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@notes", (object)notes ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@target", (object)settlementDeductionTarget ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@id", batchId);
                            cmd.ExecuteNonQuery();
                        }

                        // Update lines status
                        string lineStatus = (newStatus == "settled") ? "paid" : (newStatus == "rejected" ? "rejected" : "paid");
                        using (var lineCmd = new SQLiteCommand(@"
                            UPDATE insurance_claim_lines 
                            SET status = @lstat, settled_at = @now, rejection_reason = @rej_reason, updated_at = @now
                            WHERE claim_batch_id = @bid;", conn, trans))
                        {
                            lineCmd.Parameters.AddWithValue("@lstat", lineStatus);
                            lineCmd.Parameters.AddWithValue("@now", now);
                            lineCmd.Parameters.AddWithValue("@rej_reason", (object)rejectionReason ?? DBNull.Value);
                            lineCmd.Parameters.AddWithValue("@bid", batchId);
                            lineCmd.ExecuteNonQuery();
                        }

                        // If there is rejection and deduction target is expense: record expense contra-entry
                        if (rejectedAmountPiasters > 0 && string.Equals(settlementDeductionTarget, "expense", StringComparison.OrdinalIgnoreCase))
                        {
                            string expId = "exp_" + Guid.NewGuid().ToString("N");
                            string bDate = DateTime.UtcNow.ToString("yyyy-MM-dd");
                            string expSql = @"
                                INSERT INTO expenses (
                                    id, expense_number, amount_piasters, category, notes, source, created_by, business_date, created_at, is_cancelled
                                ) VALUES (
                                    @id, 
                                    COALESCE((SELECT MAX(expense_number) FROM expenses), 0) + 1,
                                    @amt, 
                                    'insurance_rejection', 
                                    @notes, 
                                    'safe', 
                                    @by, 
                                    @bdate, 
                                    @created_at, 
                                    0
                                );";

                            using (var expCmd = new SQLiteCommand(expSql, conn, trans))
                            {
                                expCmd.Parameters.AddWithValue("@id", expId);
                                expCmd.Parameters.AddWithValue("@amt", rejectedAmountPiasters);
                                expCmd.Parameters.AddWithValue("@notes", string.Format("فروق رفض طبي لدفعة المطالبة {0}: {1}", batch.BatchNumber, rejectionReason ?? "تسوية بدون ملاحظات"));
                                expCmd.Parameters.AddWithValue("@by", settledBy ?? "system");
                                expCmd.Parameters.AddWithValue("@bdate", bDate);
                                expCmd.Parameters.AddWithValue("@created_at", now);
                                expCmd.ExecuteNonQuery();
                            }
                        }

                        trans.Commit();
                        return GetBatchById(batchId);
                    }
                    catch
                    {
                        trans.Rollback();
                        throw;
                    }
                }
            }
        }

        private static InsuranceClaimLine ReadClaimLine(SQLiteDataReader reader)
        {
            return new InsuranceClaimLine
            {
                Id = reader["id"].ToString(),
                SaleId = reader["sale_id"].ToString(),
                InvoiceNumber = Convert.ToInt32(reader["invoice_number"]),
                ContractId = reader["contract_id"].ToString(),
                ContractName = reader["contract_name"] != DBNull.Value ? reader["contract_name"].ToString() : "",
                CompanyId = reader["company_id"].ToString(),
                CompanyName = reader["company_name"] != DBNull.Value ? reader["company_name"].ToString() : "",
                MemberId = reader["member_id"] != DBNull.Value ? reader["member_id"].ToString() : null,
                MemberNo = reader["member_no"] != DBNull.Value ? reader["member_no"].ToString() : "",
                PatientName = reader["patient_name"] != DBNull.Value ? reader["patient_name"].ToString() : "",
                ApprovalNo = reader["approval_no"] != DBNull.Value ? reader["approval_no"].ToString() : null,
                TotalInvoicePiasters = Convert.ToInt64(reader["total_invoice_piasters"]),
                CoveredPiasters = Convert.ToInt64(reader["covered_piasters"]),
                PatientPiasters = Convert.ToInt64(reader["patient_piasters"]),
                CompanyPiasters = Convert.ToInt64(reader["company_piasters"]),
                Status = reader["status"].ToString(),
                ClaimBatchId = reader["claim_batch_id"] != DBNull.Value ? reader["claim_batch_id"].ToString() : null,
                ClaimBatchNumber = reader["claim_batch_number"] != DBNull.Value ? reader["claim_batch_number"].ToString() : null,
                SettledAt = reader["settled_at"] != DBNull.Value ? reader["settled_at"].ToString() : null,
                RejectionReason = reader["rejection_reason"] != DBNull.Value ? reader["rejection_reason"].ToString() : null,
                CreatedAt = reader["created_at"].ToString(),
                UpdatedAt = reader["updated_at"] != DBNull.Value ? reader["updated_at"].ToString() : null
            };
        }

        private static InsuranceClaimBatch ReadBatch(SQLiteDataReader reader)
        {
            return new InsuranceClaimBatch
            {
                Id = reader["id"].ToString(),
                BatchNumber = reader["batch_number"].ToString(),
                CompanyId = reader["company_id"].ToString(),
                CompanyName = reader["company_name"] != DBNull.Value ? reader["company_name"].ToString() : "",
                Period = reader["period"].ToString(),
                TotalClaimsCount = Convert.ToInt32(reader["total_claims_count"]),
                TotalAmountPiasters = Convert.ToInt64(reader["total_amount_piasters"]),
                Status = reader["status"].ToString(),
                SubmittedAt = reader["submitted_at"] != DBNull.Value ? reader["submitted_at"].ToString() : null,
                SettledAt = reader["settled_at"] != DBNull.Value ? reader["settled_at"].ToString() : null,
                SettledAmountPiasters = Convert.ToInt64(reader["settled_amount_piasters"]),
                RejectedAmountPiasters = Convert.ToInt64(reader["rejected_amount_piasters"]),
                RejectionReason = reader["rejection_reason"] != DBNull.Value ? reader["rejection_reason"].ToString() : null,
                SettlementNotes = reader["settlement_notes"] != DBNull.Value ? reader["settlement_notes"].ToString() : null,
                SettlementDeductionTarget = reader["settlement_deduction_target"] != DBNull.Value ? reader["settlement_deduction_target"].ToString() : null,
                Notes = reader["notes"] != DBNull.Value ? reader["notes"].ToString() : null,
                CreatedBy = reader["created_by"] != DBNull.Value ? reader["created_by"].ToString() : "",
                CreatedAt = reader["created_at"].ToString(),
                UpdatedAt = reader["updated_at"] != DBNull.Value ? reader["updated_at"].ToString() : null
            };
        }

        #endregion
    }
}
