using System;
using System.Collections.Generic;
using System.Data.SQLite;
using RafiqPOS.Common;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class CashDrawerService
    {
        private readonly string _connectionString;
        private readonly ShiftRepository _shiftRepo;
        private readonly ShiftService _shiftService;
        private readonly AuditLogRepository _auditRepo;

        public CashDrawerService(
            string connectionString,
            ShiftRepository shiftRepo,
            ShiftService shiftService,
            AuditLogRepository auditRepo)
        {
            _connectionString = connectionString;
            _shiftRepo = shiftRepo;
            _shiftService = shiftService;
            _auditRepo = auditRepo;
        }

        public CashDrawerTransaction RecordCashIn(CashMovementRequest request)
        {
            if (request == null)
            {
                throw new ArgumentNullException("request", "بيانات حركة الإيداع غير صحيحة");
            }

            if (request.AmountPiasters <= 0)
            {
                throw new ArgumentException("قيمة الإيداع يجب أن تكون أكبر من الصفر", "AmountPiasters");
            }

            lock (SaleService.FinancialWriteLock)
            {
                Shift activeShift = null;
                if (!string.IsNullOrEmpty(request.ShiftId))
                {
                    activeShift = _shiftRepo.GetById(request.ShiftId);
                    if (activeShift == null || !string.Equals(activeShift.Status, "open", StringComparison.OrdinalIgnoreCase))
                    {
                        throw new InvalidOperationException("الوردية المحددة مغلقة أو غير موجودة.");
                    }
                }
                else
                {
                    activeShift = _shiftService.GetActiveShift();
                    if (activeShift == null)
                    {
                        throw new InvalidOperationException("لا يمكن تسجيل حركة إيداع نثري قبل فتح وردية عمل رسمية.");
                    }
                }

                string userId = string.IsNullOrEmpty(request.PerformedById)
                    ? (SecurityService.CurrentUser != null ? SecurityService.CurrentUser.Id : activeShift.CashierId)
                    : request.PerformedById;

                string userName = string.IsNullOrEmpty(request.PerformedByName)
                    ? (SecurityService.CurrentUser != null ? (SecurityService.CurrentUser.DisplayName ?? SecurityService.CurrentUser.Username) : activeShift.CashierName)
                    : request.PerformedByName;

                var tx = new CashDrawerTransaction
                {
                    Id = "cdtx_" + Guid.NewGuid().ToString("N"),
                    ShiftId = activeShift.Id,
                    Type = "cash_in",
                    AmountPiasters = request.AmountPiasters,
                    Reason = string.IsNullOrEmpty(request.Reason) ? "تغذية نقدية للدرج" : request.Reason.Trim(),
                    PerformedById = userId,
                    PerformedByName = userName,
                    CreatedAt = DateTime.UtcNow.ToString("o")
                };

                using (var conn = new SQLiteConnection(_connectionString))
                {
                    conn.Open();
                    using (var trans = conn.BeginTransaction())
                    {
                        try
                        {
                            _shiftRepo.RecordDrawerTransaction(tx, conn, trans);

                            _auditRepo.Log(
                                conn,
                                trans,
                                new AuditLog
                                {
                                    UserId = userId,
                                    Action = "DRAWER_CASH_IN",
                                    EntityType = "cash_drawer_transaction",
                                    EntityId = tx.Id,
                                    DetailsJson = string.Format(
                                        "{{\"shiftId\":\"{0}\",\"amount\":{1},\"reason\":\"{2}\"}}",
                                        tx.ShiftId, tx.AmountPiasters, tx.Reason
                                    )
                                }
                            );

                            trans.Commit();
                            Logger.Info(string.Format("تم تسجيل إيداع نثري في الدرج: {0:N2} ج.م للوردية #{1} - السبب: {2}",
                                tx.AmountPiasters / 100.0, activeShift.ShiftNumber, tx.Reason));
                        }
                        catch (Exception ex)
                        {
                            trans.Rollback();
                            Logger.Error("فشل تسجيل حركة الإيداع في الدرج", ex);
                            throw;
                        }
                    }
                }

                return tx;
            }
        }

        public CashDrawerTransaction RecordCashOut(CashMovementRequest request)
        {
            if (request == null)
            {
                throw new ArgumentNullException("request", "بيانات حركة السحب غير صحيحة");
            }

            if (request.AmountPiasters <= 0)
            {
                throw new ArgumentException("قيمة السحب يجب أن تكون أكبر من الصفر", "AmountPiasters");
            }

            lock (SaleService.FinancialWriteLock)
            {
                Shift activeShift = null;
                if (!string.IsNullOrEmpty(request.ShiftId))
                {
                    activeShift = _shiftRepo.GetById(request.ShiftId);
                    if (activeShift == null || !string.Equals(activeShift.Status, "open", StringComparison.OrdinalIgnoreCase))
                    {
                        throw new InvalidOperationException("الوردية المحددة مغلقة أو غير موجودة.");
                    }
                }
                else
                {
                    activeShift = _shiftService.GetActiveShift();
                    if (activeShift == null)
                    {
                        throw new InvalidOperationException("لا يمكن تسجيل حركة سحب نثري قبل فتح وردية عمل رسمية.");
                    }
                }

                // Scenario 3: Verify available cash in drawer
                var currentSummary = _shiftRepo.CalculateShiftMetrics(activeShift);
                long availableCash = currentSummary != null ? currentSummary.ExpectedCashPiasters : 0;

                if (request.AmountPiasters > availableCash)
                {
                    throw new InvalidOperationException(string.Format(
                        "المبلغ المطلوب سحبه ({0:N2} ج.م) أكبر من النقدية المتوفرة حالياً في الدرج ({1:N2} ج.م).",
                        request.AmountPiasters / 100.0, availableCash / 100.0));
                }

                string userId = string.IsNullOrEmpty(request.PerformedById)
                    ? (SecurityService.CurrentUser != null ? SecurityService.CurrentUser.Id : activeShift.CashierId)
                    : request.PerformedById;

                string userName = string.IsNullOrEmpty(request.PerformedByName)
                    ? (SecurityService.CurrentUser != null ? (SecurityService.CurrentUser.DisplayName ?? SecurityService.CurrentUser.Username) : activeShift.CashierName)
                    : request.PerformedByName;

                var tx = new CashDrawerTransaction
                {
                    Id = "cdtx_" + Guid.NewGuid().ToString("N"),
                    ShiftId = activeShift.Id,
                    Type = "cash_out",
                    AmountPiasters = request.AmountPiasters,
                    Reason = string.IsNullOrEmpty(request.Reason) ? "سحب نثري من الدرج" : request.Reason.Trim(),
                    PerformedById = userId,
                    PerformedByName = userName,
                    CreatedAt = DateTime.UtcNow.ToString("o")
                };

                using (var conn = new SQLiteConnection(_connectionString))
                {
                    conn.Open();
                    using (var trans = conn.BeginTransaction())
                    {
                        try
                        {
                            _shiftRepo.RecordDrawerTransaction(tx, conn, trans);

                            _auditRepo.Log(
                                conn,
                                trans,
                                new AuditLog
                                {
                                    UserId = userId,
                                    Action = "DRAWER_CASH_OUT",
                                    EntityType = "cash_drawer_transaction",
                                    EntityId = tx.Id,
                                    DetailsJson = string.Format(
                                        "{{\"shiftId\":\"{0}\",\"amount\":{1},\"reason\":\"{2}\"}}",
                                        tx.ShiftId, tx.AmountPiasters, tx.Reason
                                    )
                                }
                            );

                            trans.Commit();
                            Logger.Info(string.Format("تم تسجيل سحب نثري من الدرج: {0:N2} ج.م للوردية #{1} - السبب: {2}",
                                tx.AmountPiasters / 100.0, activeShift.ShiftNumber, tx.Reason));
                        }
                        catch (Exception ex)
                        {
                            trans.Rollback();
                            Logger.Error("فشل تسجيل حركة السحب من الدرج", ex);
                            throw;
                        }
                    }
                }

                return tx;
            }
        }

        public List<CashDrawerTransaction> GetMovements(string shiftId)
        {
            if (string.IsNullOrEmpty(shiftId))
            {
                var active = _shiftService.GetActiveShift();
                if (active != null) shiftId = active.Id;
            }
            return _shiftRepo.GetDrawerTransactions(shiftId);
        }

        public ShiftSummary GetLiveDrawerBalance(string shiftId = null)
        {
            return _shiftService.GetShiftSummary(shiftId);
        }

        public bool OpenDrawerManual(string reason = null, string userId = null)
        {
            lock (SaleService.FinancialWriteLock)
            {
                var activeShift = _shiftService.GetActiveShift();
                string actorId = string.IsNullOrEmpty(userId)
                    ? (SecurityService.CurrentUser != null ? SecurityService.CurrentUser.Id : (activeShift != null ? activeShift.CashierId : "usr_admin_default"))
                    : userId;

                string actorName = SecurityService.CurrentUser != null
                    ? (SecurityService.CurrentUser.DisplayName ?? SecurityService.CurrentUser.Username)
                    : (activeShift != null ? activeShift.CashierName : "الكاشير");

                string effectiveReason = string.IsNullOrEmpty(reason) ? "فتح يدوي لدرج النقدية" : reason.Trim();
                string nowIso = DateTime.UtcNow.ToString("o");

                // Record critical audit log for manual drawer opening
                if (_auditRepo != null)
                {
                    _auditRepo.Log(new AuditLog
                    {
                        Id = "aud_" + Guid.NewGuid().ToString("N"),
                        UserId = actorId,
                        Action = "drawer_manual_open",
                        EntityType = "cash_drawer",
                        EntityId = activeShift != null ? activeShift.Id : "drawer",
                        DetailsJson = string.Format(
                            "{{\"reason\":\"{0}\",\"shiftId\":\"{1}\",\"cashierName\":\"{2}\",\"timestamp\":\"{3}\"}}",
                            effectiveReason.Replace("\"", "\\\""),
                            activeShift != null ? activeShift.Id : "",
                            actorName.Replace("\"", "\\\""),
                            nowIso
                        ),
                        CreatedAt = nowIso
                    });
                }

                Logger.Info(string.Format("تم تسجيل فتح يدوي لدرج النقدية بواسطة: {0} ({1}) - السبب: {2}", actorName, actorId, effectiveReason));

                // إرسال نبضة الهاردوير لفتح الدرج المادي عبر الطابعة المحددة
                try
                {
                    if (DatabaseService.Printer != null)
                    {
                        DatabaseService.Printer.KickDrawer();
                    }
                }
                catch (Exception exKick)
                {
                    Logger.Warn("فشل إرسال نبضة فتح درج النقدية المادي: " + exKick.Message);
                }

                return true;
            }
        }
    }
}
