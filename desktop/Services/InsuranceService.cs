using System;
using System.Collections.Generic;
using System.IO;
using ClosedXML.Excel;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class InsuranceService
    {
        private readonly InsuranceRepository _insuranceRepo;
        private readonly ExpenseService _expenseService;
        private readonly AuditLogRepository _auditRepo;

        private static readonly XLColor ForestDark = XLColor.FromArgb(0, 55, 45);
        private static readonly XLColor EmeraldGreen = XLColor.FromArgb(0, 109, 65);
        private static readonly XLColor SoftMint = XLColor.FromArgb(232, 245, 233);
        private static readonly XLColor BorderGray = XLColor.FromArgb(209, 218, 211);
        private static readonly XLColor ZebraLight = XLColor.FromArgb(246, 250, 247);

        public InsuranceService(InsuranceRepository insuranceRepo, AuditLogRepository auditRepo = null)
            : this(insuranceRepo, null, auditRepo)
        {
        }

        public InsuranceService(InsuranceRepository insuranceRepo, ExpenseService expenseService, AuditLogRepository auditRepo = null)
        {
            _insuranceRepo = insuranceRepo;
            _expenseService = expenseService;
            _auditRepo = auditRepo;
        }

        #region Companies
        public List<InsuranceCompany> GetAllCompanies(bool includeInactive = false)
        {
            return _insuranceRepo.GetCompanies(!includeInactive);
        }

        public InsuranceCompany GetCompanyById(string id)
        {
            return _insuranceRepo.GetCompanyById(id);
        }

        public InsuranceCompany SaveCompany(InsuranceCompany company)
        {
            return _insuranceRepo.SaveCompany(company);
        }

        public void DeleteCompany(string id)
        {
            var comp = _insuranceRepo.GetCompanyById(id);
            if (comp != null)
            {
                comp.IsActive = false;
                _insuranceRepo.SaveCompany(comp);
            }
        }
        #endregion

        #region Contracts
        public List<InsuranceContract> GetAllContracts(string companyId = null, bool includeInactive = false)
        {
            return _insuranceRepo.GetContracts(companyId, !includeInactive);
        }

        public InsuranceContract GetContractById(string id)
        {
            return _insuranceRepo.GetContractById(id);
        }

        public InsuranceContract SaveContract(InsuranceContract contract)
        {
            return _insuranceRepo.SaveContract(contract);
        }

        public void DeleteContract(string id)
        {
            var cnt = _insuranceRepo.GetContractById(id);
            if (cnt != null)
            {
                cnt.IsActive = false;
                _insuranceRepo.SaveContract(cnt);
            }
        }
        #endregion

        #region Members
        public List<InsuranceMember> GetMembers(string contractId = null, string search = null)
        {
            return _insuranceRepo.GetMembers(contractId, search);
        }

        public InsuranceMember GetMemberByCardNumber(string cardNumber, string contractId = null)
        {
            return _insuranceRepo.GetMemberByNo(cardNumber);
        }

        public InsuranceMember SaveMember(InsuranceMember member)
        {
            return _insuranceRepo.SaveMember(member);
        }
        #endregion

        #region Claims & Split Engine
        public InsuranceCalculationResult CalculateSplit(string contractId, List<SaleItem> items)
        {
            return _insuranceRepo.CalculateSplit(contractId, items);
        }

        public List<InsuranceClaimLine> GetPendingClaims(string companyId = null, string contractId = null)
        {
            return _insuranceRepo.GetPendingClaimLines(companyId);
        }

        public List<InsuranceClaimBatch> GetBatches(string companyId = null)
        {
            return _insuranceRepo.GetClaimBatches(companyId);
        }

        public InsuranceClaimBatch GetBatchById(string batchId)
        {
            return _insuranceRepo.GetBatchById(batchId);
        }

        public InsuranceClaimBatch CreateBatch(string companyId, string batchNumber, string periodMonth, string notes = null, List<string> claimLineIds = null, string createdBy = null)
        {
            var batch = _insuranceRepo.CreateClaimBatch(companyId, periodMonth, claimLineIds, createdBy, notes);
            if (batch != null && !string.IsNullOrEmpty(batchNumber))
            {
                batch.BatchNumber = batchNumber;
            }

            if (_auditRepo != null && batch != null)
            {
                _auditRepo.Log(new AuditLog
                {
                    UserId = createdBy ?? "cashier",
                    Action = "INSURANCE_CLAIM_BATCH_CREATED",
                    EntityType = "INSURANCE_BATCH",
                    EntityId = batch.Id,
                    DetailsJson = string.Format("{{\"batchNumber\":\"{0}\",\"companyId\":\"{1}\",\"totalPiasters\":{2},\"claimsCount\":{3}}}",
                        batch.BatchNumber, batch.CompanyId, batch.TotalAmountPiasters, batch.TotalClaimsCount)
                });
            }
            return batch;
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
            var batch = _insuranceRepo.SettleBatch(
                batchId,
                settledAmountPiasters,
                rejectedAmountPiasters,
                rejectionReason,
                settlementDeductionTarget,
                settledBy,
                notes
            );

            if (_auditRepo != null && batch != null)
            {
                _auditRepo.Log(new AuditLog
                {
                    UserId = settledBy ?? "admin",
                    Action = "INSURANCE_CLAIM_BATCH_SETTLED",
                    EntityType = "INSURANCE_BATCH",
                    EntityId = batch.Id,
                    DetailsJson = string.Format("{{\"batchNumber\":\"{0}\",\"status\":\"{1}\",\"settledPiasters\":{2},\"rejectedPiasters\":{3},\"deductionTarget\":\"{4}\"}}",
                        batch.BatchNumber, batch.Status, settledAmountPiasters, rejectedAmountPiasters, settlementDeductionTarget ?? "")
                });
            }
            return batch;
        }
        #endregion

        #region Excel Export (Tasks 189-6 & 189-8)
        public string ExportBatchToExcel(string batchId, string targetFilePath = null)
        {
            byte[] bytes = ExportBatchToExcelBytes(batchId);
            if (string.IsNullOrEmpty(targetFilePath))
            {
                string dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "RafiqPOS", "exports");
                if (!Directory.Exists(dir))
                {
                    Directory.CreateDirectory(dir);
                }
                targetFilePath = Path.Combine(dir, string.Format("Insurance_Claim_{0}_{1}.xlsx", batchId, DateTime.UtcNow.ToString("yyyyMMdd_HHmmss")));
            }
            File.WriteAllBytes(targetFilePath, bytes);
            return targetFilePath;
        }

        public byte[] ExportBatchToExcelBytes(string batchId)
        {
            var batch = _insuranceRepo.GetBatchById(batchId);
            if (batch == null) throw new InvalidOperationException("دفعة المطالبة غير موجودة.");

            var lines = batch.Lines ?? _insuranceRepo.GetClaimLinesByBatch(batchId);

            using (var wb = new XLWorkbook())
            {
                var ws = wb.Worksheets.Add("مطالبة التأمين");
                ws.RightToLeft = true;
                ws.ShowGridLines = true;

                // 1. Header Banner
                ws.Range("A1:K1").Merge();
                var title = ws.Cell("A1");
                title.Value = "رفيق POS - مطالبة تأمين طبي رسمية للشركات المتعاقدة";
                title.Style.Font.Bold = true;
                title.Style.Font.FontSize = 14;
                title.Style.Font.FontColor = XLColor.White;
                title.Style.Fill.BackgroundColor = ForestDark;
                title.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                title.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
                ws.Row(1).Height = 35;

                // 2. Metadata Block
                ws.Cell("A2").Value = "شركة التأمين:";
                ws.Cell("B2").Value = batch.CompanyName;
                ws.Cell("D2").Value = "رقم الدفعة:";
                ws.Cell("E2").Value = batch.BatchNumber;
                ws.Cell("G2").Value = "فترة المطالبة:";
                ws.Cell("H2").Value = batch.Period;

                ws.Cell("A3").Value = "عدد الفواتير:";
                ws.Cell("B3").Value = batch.TotalClaimsCount;
                ws.Cell("D3").Value = "إجمالي المطالبة (ج.م):";
                ws.Cell("E3").Value = batch.TotalAmountPiasters / 100.0;
                ws.Cell("G3").Value = "حالة الدفعة:";
                ws.Cell("H3").Value = batch.Status;

                var metaRange = ws.Range("A2:H3");
                metaRange.Style.Font.Bold = true;
                metaRange.Style.Font.FontSize = 10;
                metaRange.Style.Fill.BackgroundColor = SoftMint;
                metaRange.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
                metaRange.Style.Border.OutsideBorderColor = BorderGray;

                // 3. Table Column Headers
                string[] headers = new string[]
                {
                    "م",
                    "رقم الفاتورة",
                    "تاريخ العملية",
                    "اسم العقد / الفئة",
                    "اسم المريض",
                    "رقم الكارنيه / العضوية",
                    "رقم الموافقة الطبية",
                    "إجمالي الفاتورة (ج.م)",
                    "المبلغ المغطى (ج.م)",
                    "تحمل المريض (ج.م)",
                    "مطالبة الشركة (ج.م)"
                };

                int startRow = 5;
                for (int col = 0; col < headers.Length; col++)
                {
                    var cell = ws.Cell(startRow, col + 1);
                    cell.Value = headers[col];
                    cell.Style.Font.Bold = true;
                    cell.Style.Font.FontSize = 11;
                    cell.Style.Font.FontColor = XLColor.White;
                    cell.Style.Fill.BackgroundColor = EmeraldGreen;
                    cell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                    cell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
                }
                ws.Row(startRow).Height = 26;

                // 4. Data Rows
                int currentRow = startRow + 1;
                long sumTotal = 0;
                long sumCovered = 0;
                long sumPatient = 0;
                long sumCompany = 0;

                for (int i = 0; i < lines.Count; i++)
                {
                    var line = lines[i];
                    ws.Cell(currentRow, 1).Value = i + 1;
                    ws.Cell(currentRow, 2).Value = "#" + line.InvoiceNumber;
                    ws.Cell(currentRow, 3).Value = line.CreatedAt;
                    ws.Cell(currentRow, 4).Value = line.ContractName;
                    ws.Cell(currentRow, 5).Value = line.PatientName;
                    ws.Cell(currentRow, 6).Value = line.MemberNo;
                    ws.Cell(currentRow, 7).Value = line.ApprovalNo ?? "-";

                    double totPounds = line.TotalInvoicePiasters / 100.0;
                    double covPounds = line.CoveredPiasters / 100.0;
                    double patPounds = line.PatientPiasters / 100.0;
                    double compPounds = line.CompanyPiasters / 100.0;

                    ws.Cell(currentRow, 8).Value = totPounds;
                    ws.Cell(currentRow, 9).Value = covPounds;
                    ws.Cell(currentRow, 10).Value = patPounds;
                    ws.Cell(currentRow, 11).Value = compPounds;

                    sumTotal += line.TotalInvoicePiasters;
                    sumCovered += line.CoveredPiasters;
                    sumPatient += line.PatientPiasters;
                    sumCompany += line.CompanyPiasters;

                    var rowRange = ws.Range(currentRow, 1, currentRow, 11);
                    rowRange.Style.Font.FontSize = 10;
                    rowRange.Style.Border.BottomBorder = XLBorderStyleValues.Thin;
                    rowRange.Style.Border.BottomBorderColor = BorderGray;
                    if (i % 2 == 1)
                    {
                        rowRange.Style.Fill.BackgroundColor = ZebraLight;
                    }

                    ws.Range(currentRow, 8, currentRow, 11).Style.NumberFormat.Format = "#,##0.00";
                    currentRow++;
                }

                // 5. Total Summary Row
                ws.Cell(currentRow, 1).Value = "الإجمالي العام";
                ws.Range(currentRow, 1, currentRow, 7).Merge();
                var totalLabel = ws.Cell(currentRow, 1);
                totalLabel.Style.Font.Bold = true;
                totalLabel.Style.Font.FontSize = 11;
                totalLabel.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

                ws.Cell(currentRow, 8).Value = sumTotal / 100.0;
                ws.Cell(currentRow, 9).Value = sumCovered / 100.0;
                ws.Cell(currentRow, 10).Value = sumPatient / 100.0;
                ws.Cell(currentRow, 11).Value = sumCompany / 100.0;

                var totalRowRange = ws.Range(currentRow, 1, currentRow, 11);
                totalRowRange.Style.Font.Bold = true;
                totalRowRange.Style.Font.FontSize = 11;
                totalRowRange.Style.Fill.BackgroundColor = SoftMint;
                totalRowRange.Style.Border.TopBorder = XLBorderStyleValues.Medium;
                totalRowRange.Style.Border.BottomBorder = XLBorderStyleValues.Double;
                ws.Range(currentRow, 8, currentRow, 11).Style.NumberFormat.Format = "#,##0.00";
                ws.Row(currentRow).Height = 25;

                ws.Columns().AdjustToContents(15, 45);

                using (var ms = new MemoryStream())
                {
                    wb.SaveAs(ms);
                    return ms.ToArray();
                }
            }
        }
        #endregion
    }
}
