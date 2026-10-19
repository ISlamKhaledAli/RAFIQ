using System;
using System.Collections.Generic;
using System.Data.SQLite;
using RafiqPOS.Common;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class ShiftService
    {
        private readonly string _connectionString;
        private readonly ShiftRepository _shiftRepo;
        private readonly CounterRepository _counterRepo;
        private readonly AuditLogRepository _auditRepo;
        private readonly DailyClosingService _dailyClosingService;

        public ShiftService(
            string connectionString,
            ShiftRepository shiftRepo,
            CounterRepository counterRepo,
            AuditLogRepository auditRepo,
            DailyClosingService dailyClosingService)
        {
            _connectionString = connectionString;
            _shiftRepo = shiftRepo;
            _counterRepo = counterRepo;
            _auditRepo = auditRepo;
            _dailyClosingService = dailyClosingService;
        }

        public Shift GetActiveShift(string posRegisterId = null, string cashierId = null)
        {
            var shift = _shiftRepo.GetActiveShift(posRegisterId, cashierId);
            if (shift != null)
            {
                // Scenario 4: Power cut / abrupt shutdown recovery check
                string currentBDate = _dailyClosingService != null 
                    ? _dailyClosingService.GetCurrentBusinessDate() 
                    : DateTime.Now.ToString("yyyy-MM-dd");

                if (!string.Equals(shift.BusinessDate, currentBDate, StringComparison.OrdinalIgnoreCase))
                {
                    shift.IsDanglingFromPreviousDay = true;
                }
            }
            return shift;
        }

        public Shift OpenShift(OpenShiftRequest request)
        {
            if (request == null)
            {
                throw new ArgumentNullException("request", "بيانات فتح الوردية غير صحيحة");
            }

            if (request.OpeningFloatPiasters < 0)
            {
                throw new ArgumentException("قيمة العهدة الافتتاحية للدرج لا يمكن أن تكون سالبة", "OpeningFloatPiasters");
            }

            lock (SaleService.FinancialWriteLock)
            {
                string registerId = string.IsNullOrEmpty(request.PosRegisterId) ? "default_pos" : request.PosRegisterId.Trim();
                string cashierId = string.IsNullOrEmpty(request.CashierId) 
                    ? (SecurityService.CurrentUser != null ? SecurityService.CurrentUser.Id : "cashier_default")
                    : request.CashierId.Trim();

                string cashierName = string.IsNullOrEmpty(request.CashierName)
                    ? (SecurityService.CurrentUser != null ? (SecurityService.CurrentUser.DisplayName ?? SecurityService.CurrentUser.Username) : "الكاشير")
                    : request.CashierName.Trim();

                // Scenario 2: Concurrency Check (Prevent opening two shifts simultaneously)
                var existing = _shiftRepo.GetActiveShift(registerId, cashierId);
                if (existing != null)
                {
                    throw new InvalidOperationException(string.Format(
                        "توجد وردية عمل مفتوحة بالفعل لهذا الجهاز/الكاشير (رقم الوردية #{0} فُتحت في {1}). يجب إغلاقها أولاً قبل فتح وردية جديدة.",
                        existing.ShiftNumber, existing.OpenedAt));
                }

                string currentBDate = _dailyClosingService != null 
                    ? _dailyClosingService.GetCurrentBusinessDate() 
                    : DateTime.Now.ToString("yyyy-MM-dd");

                // Check if current day is already sealed
                if (_dailyClosingService != null && _dailyClosingService.IsDayClosed(currentBDate))
                {
                    throw new InvalidOperationException(string.Format("تم إقفال اليومية لتاريخ {0} مسبقاً. يرجى مراجعة إدارة النظام.", currentBDate));
                }

                var shift = new Shift
                {
                    Id = Guid.NewGuid().ToString(),
                    CashierId = cashierId,
                    CashierName = cashierName,
                    PosRegisterId = registerId,
                    BusinessDate = currentBDate,
                    OpenedAt = DateTime.UtcNow.ToString("o"),
                    Status = "open",
                    OpeningFloatPiasters = request.OpeningFloatPiasters,
                    ExpectedCashPiasters = request.OpeningFloatPiasters,
                    Notes = request.Notes,
                    CreatedAt = DateTime.UtcNow.ToString("o"),
                    UpdatedAt = DateTime.UtcNow.ToString("o")
                };

                using (var conn = new SQLiteConnection(_connectionString))
                {
                    conn.Open();
                    using (var trans = conn.BeginTransaction())
                    {
                        try
                        {
                            // Atomically assign sequential shift number
                            shift.ShiftNumber = (int)_counterRepo.GetNextCounterNumber(conn, trans, "shift_number");

                            _shiftRepo.Insert(shift, conn, trans);

                            _auditRepo.Log(
                                conn,
                                trans,
                                new AuditLog
                                {
                                    UserId = cashierId,
                                    Action = "SHIFT_OPEN",
                                    EntityType = "shift",
                                    EntityId = shift.Id,
                                    DetailsJson = string.Format(
                                        "{{\"shiftNumber\":{0},\"cashierId\":\"{1}\",\"cashierName\":\"{2}\",\"openingFloat\":{3}}}",
                                        shift.ShiftNumber, shift.CashierId, shift.CashierName, shift.OpeningFloatPiasters
                                    )
                                }
                            );

                            trans.Commit();
                            Logger.Info(string.Format("تم فتح الوردية بنجاح: رقم #{0} للكاشير {1} بعهدة {2} قرش", shift.ShiftNumber, shift.CashierName, shift.OpeningFloatPiasters));
                        }
                        catch (Exception ex)
                        {
                            trans.Rollback();
                            Logger.Error("فشل فتح الوردية", ex);
                            throw;
                        }
                    }
                }

                return shift;
            }
        }

        public Shift CloseShift(CloseShiftRequest request)
        {
            if (request == null)
            {
                throw new ArgumentNullException("request", "بيانات إغلاق الوردية غير صحيحة");
            }

            if (string.IsNullOrEmpty(request.ShiftId))
            {
                throw new ArgumentException("معرف الوردية مطلوب لإتمام الإغلاق", "ShiftId");
            }

            lock (SaleService.FinancialWriteLock)
            {
                var shift = _shiftRepo.GetById(request.ShiftId);
                if (shift == null)
                {
                    throw new InvalidOperationException("سجل الوردية غير موجود في قاعدة البيانات.");
                }

                if (!string.Equals(shift.Status, "open", StringComparison.OrdinalIgnoreCase))
                {
                    throw new InvalidOperationException("هذه الوردية مغلقة بالفعل ولا يمكن إعادة إغلاقها.");
                }

                // Calculate exact financial metrics
                var summary = _shiftRepo.CalculateShiftMetrics(shift);

                long actualCash = request.ActualCashPiasters;
                long expectedCash = summary.ExpectedCashPiasters;
                long difference = actualCash - expectedCash;

                shift.ClosedAt = DateTime.UtcNow.ToString("o");
                shift.Status = "closed";
                shift.CashSalesPiasters = summary.CashSalesPiasters;
                shift.CardSalesPiasters = summary.CardSalesPiasters;
                shift.InstapaySalesPiasters = summary.InstapaySalesPiasters;
                shift.VodafoneCashSalesPiasters = summary.VodafoneCashSalesPiasters;
                shift.CreditSalesPiasters = summary.CreditSalesPiasters;
                shift.ReturnsCashPiasters = summary.ReturnsCashPiasters;
                shift.DebtPaymentsCashPiasters = summary.DebtPaymentsCashPiasters;
                shift.ExpensesCashPiasters = summary.ExpensesCashPiasters;
                shift.CashInPiasters = summary.CashInPiasters;
                shift.CashOutPiasters = summary.CashOutPiasters;
                shift.EpayCashPiasters = summary.EpayCashPiasters;
                shift.WalletsCashPiasters = summary.WalletsCashPiasters;
                shift.PurchasesCashPiasters = summary.PurchasesCashPiasters;
                shift.SupplierPaymentsCashPiasters = summary.SupplierPaymentsCashPiasters;
                shift.ExpectedCashPiasters = expectedCash;
                shift.ActualCashPiasters = actualCash;
                shift.DifferencePiasters = difference;
                shift.InvoicesCount = summary.InvoicesCount;
                shift.Notes = request.Notes;
                shift.UpdatedAt = DateTime.UtcNow.ToString("o");

                using (var conn = new SQLiteConnection(_connectionString))
                {
                    conn.Open();
                    using (var trans = conn.BeginTransaction())
                    {
                        try
                        {
                            _shiftRepo.CloseShift(shift, conn, trans);

                            _auditRepo.Log(
                                conn,
                                trans,
                                new AuditLog
                                {
                                    UserId = request.CashierId ?? shift.CashierId,
                                    Action = "SHIFT_CLOSE",
                                    EntityType = "shift",
                                    EntityId = shift.Id,
                                    DetailsJson = string.Format(
                                        "{{\"shiftNumber\":{0},\"expectedCash\":{1},\"actualCash\":{2},\"diff\":{3},\"invoices\":{4}}}",
                                        shift.ShiftNumber, expectedCash, actualCash, difference, shift.InvoicesCount
                                    )
                                }
                            );

                            trans.Commit();
                            Logger.Info(string.Format("تم إغلاق الوردية #{0} بنجاح: المتوقع {1} قرش، الفعلي {2} قرش، الفرق {3} قرش",
                                shift.ShiftNumber, expectedCash, actualCash, difference));
                        }
                        catch (Exception ex)
                        {
                            trans.Rollback();
                            Logger.Error("فشل إغلاق الوردية", ex);
                            throw;
                        }
                    }
                }

                return shift;
            }
        }

        public ShiftSummary GetShiftSummary(string shiftId = null)
        {
            Shift shift = null;
            if (string.IsNullOrEmpty(shiftId))
            {
                shift = GetActiveShift();
            }
            else
            {
                shift = _shiftRepo.GetById(shiftId);
            }

            if (shift == null) return null;
            return _shiftRepo.CalculateShiftMetrics(shift);
        }

        public List<Shift> GetRecentShifts(int limit = 30)
        {
            return _shiftRepo.GetRecentShifts(limit);
        }

        public Shift GetById(string shiftId)
        {
            return _shiftRepo.GetById(shiftId);
        }
    }
}
