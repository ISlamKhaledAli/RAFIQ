using System;
using System.Collections.Generic;
using RafiqPOS.Common;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class ReturnService
    {
        private readonly ReturnRepository _returnRepo;
        private readonly SaleRepository _saleRepo;
        private readonly DailyClosingService _dailyClosingService;

        public ReturnService(ReturnRepository returnRepo, SaleRepository saleRepo, DailyClosingService dailyClosingService = null)
        {
            _returnRepo = returnRepo;
            _saleRepo = saleRepo;
            _dailyClosingService = dailyClosingService;
        }

        public Return ProcessReturn(Return returnObj, string supervisorPin = null)
        {
            // Serialize with sales/cancellations so the remaining-quantity check stays valid until commit (Audit F-17)
            lock (SaleService.FinancialWriteLock)
            {
                return ProcessReturnCore(returnObj, supervisorPin);
            }
        }

        private Return ProcessReturnCore(Return returnObj, string supervisorPin)
        {
            if (returnObj == null) throw new ArgumentNullException("returnObj");
            if (returnObj.Items == null || returnObj.Items.Count == 0)
            {
                throw new InvalidOperationException("لا يمكن حفظ مرتجع بدون أصناف");
            }

            // Server-side validation of returned quantities and prices (Audit F-10)
            for (int vIdx = 0; vIdx < returnObj.Items.Count; vIdx++)
            {
                var vItem = returnObj.Items[vIdx];
                if (vItem == null || string.IsNullOrWhiteSpace(vItem.ProductId))
                {
                    throw new InvalidOperationException(string.Format("البند رقم {0} في المرتجع غير صالح.", vIdx + 1));
                }
                if (vItem.QuantityMilli <= 0)
                {
                    throw new InvalidOperationException(string.Format("كمية المرتجع للصنف '{0}' يجب أن تكون أكبر من الصفر.", vItem.ProductName ?? vItem.ProductId));
                }
                if (vItem.QuantityMilli > SaleService.MAX_QUANTITY_MILLI)
                {
                    throw new InvalidOperationException(string.Format("كمية المرتجع للصنف '{0}' تتجاوز الحد الأقصى المسموح به للنظام.", vItem.ProductName ?? vItem.ProductId));
                }
                if (vItem.UnitPricePiasters < 0)
                {
                    throw new InvalidOperationException(string.Format("سعر المرتجع للصنف '{0}' لا يمكن أن يكون سالباً.", vItem.ProductName ?? vItem.ProductId));
                }
                if (vItem.UnitPricePiasters > SaleService.MAX_PRICE_PIASTERS)
                {
                    throw new InvalidOperationException(string.Format("سعر المرتجع للصنف '{0}' يتجاوز الحد الأقصى المسموح به للنظام.", vItem.ProductName ?? vItem.ProductId));
                }
            }

            // Validation: Credit refunds must be attached to a specific registered customer
            if (string.Equals(returnObj.RefundMethod, "credit", StringComparison.OrdinalIgnoreCase))
            {
                if (string.IsNullOrWhiteSpace(returnObj.CustomerId))
                {
                    throw new InvalidOperationException("لا يمكن اختيار الاسترداد كرصيد آجل (credit) بدون تحديد عميل مسجل في النظام.");
                }
                if (string.Equals(returnObj.CustomerId, "cust_general_cash", StringComparison.OrdinalIgnoreCase))
                {
                    throw new InvalidOperationException("لا يمكن استرداد المرتجع كرصيد آجل للعميل النقدي العام. يجب اختيار عميل مسجل بالاسم أو صرف المرتجع نقداً.");
                }
            }

            // Story 131 / Task 188-5: Controlled Drug Return Guard & Approval
            if (DatabaseService.ControlledDrugRepo != null)
            {
                var controlledIds = DatabaseService.ControlledDrugRepo.GetControlledProductIds();
                bool hasControlledItem = false;
                for (int ci = 0; ci < returnObj.Items.Count; ci++)
                {
                    if (returnObj.Items[ci] != null && controlledIds.Contains(returnObj.Items[ci].ProductId))
                    {
                        hasControlledItem = true;
                        break;
                    }
                }

                if (hasControlledItem)
                {
                    if (string.IsNullOrWhiteSpace(returnObj.Reason))
                    {
                        throw new InvalidOperationException("سبب الاسترجاع إلزامي لمرتجع أدوية الجدول والرقابة.");
                    }

                    if (string.IsNullOrEmpty(supervisorPin))
                    {
                        throw new UnauthorizedAccessException("استرجاع أدوية الجدول والمهدئات يتطلب موافقة واعتماد الصيدلي المسؤول بالرمز السري (PIN).");
                    }

                    if (DatabaseService.Security != null)
                    {
                        var pinCheck = DatabaseService.Security.VerifySupervisorPin(supervisorPin, "PHARMA_CONTROLLED_RETURN");
                        if (pinCheck == null || !pinCheck.Success)
                        {
                            string msg = (pinCheck != null && !string.IsNullOrEmpty(pinCheck.Message))
                                ? pinCheck.Message
                                : "الرمز السري للصيدلي المسؤول غير صحيح أو غير مصرح له باعتماد مرتجع أدوية الجدول.";
                            throw new UnauthorizedAccessException(msg);
                        }
                    }
                }
            }

            // 1. If return is without invoice, require permission and supervisor PIN (F-10)
            if (returnObj.IsWithoutInvoice || string.IsNullOrEmpty(returnObj.SaleId))
            {
                if (DatabaseService.Security != null)
                {
                    if (!DatabaseService.Security.HasPermission("returns.without_invoice"))
                    {
                        throw new UnauthorizedAccessException("ليس لديك صلاحية تسجيل مرتجع بدون فاتورة (returns.without_invoice).");
                    }

                    if (string.IsNullOrEmpty(supervisorPin))
                    {
                        throw new UnauthorizedAccessException("المرتجع بدون فاتورة أصلية يتطلب إدخال الرقم السري للمشرف.");
                    }
                    var pinCheck = DatabaseService.Security.VerifySupervisorPin(supervisorPin, "RETURN_WITHOUT_INVOICE");
                    if (!pinCheck.Success)
                    {
                        throw new UnauthorizedAccessException("الرقم السري للمشرف غير صحيح: " + (pinCheck.Message ?? ""));
                    }
                }
            }
            else
            {
                // 2. Validate against original sale
                var origSale = _saleRepo.GetSaleById(returnObj.SaleId);
                if (origSale == null)
                {
                    throw new InvalidOperationException(string.Format("الفاتورة الأصلية رقم المعرف '{0}' غير موجودة.", returnObj.SaleId));
                }

                if (string.Equals(origSale.Status, "cancelled", StringComparison.OrdinalIgnoreCase))
                {
                    throw new InvalidOperationException("لا يمكن عمل مرتجع على فاتورة ملغاة بالفعل.");
                }

                if (origSale.Items != null)
                {
                    returnObj.InvoiceNumber = origSale.InvoiceNumber;
                    if (string.IsNullOrEmpty(returnObj.CustomerId))
                    {
                        returnObj.CustomerId = origSale.CustomerId;
                        returnObj.CustomerName = origSale.CustomerName;
                    }

                    // Get past returns for this sale to compute remaining returned quantities
                    var pastReturns = _returnRepo.GetReturnsForSale(returnObj.SaleId);
                    var returnedQtyBySaleItem = new Dictionary<string, long>();
                    var returnedQtyByProductUnit = new Dictionary<string, long>();

                    for (int r = 0; r < pastReturns.Count; r++)
                    {
                        var pastRet = pastReturns[r];
                        if (pastRet.Items != null)
                        {
                            for (int i = 0; i < pastRet.Items.Count; i++)
                            {
                                var pItem = pastRet.Items[i];
                                if (!string.IsNullOrEmpty(pItem.SaleItemId))
                                {
                                    if (!returnedQtyBySaleItem.ContainsKey(pItem.SaleItemId))
                                    {
                                        returnedQtyBySaleItem[pItem.SaleItemId] = 0;
                                    }
                                    returnedQtyBySaleItem[pItem.SaleItemId] += pItem.QuantityMilli;
                                }

                                string unitKey = (pItem.ProductId ?? "") + "_" + (pItem.Unit ?? "");
                                if (!returnedQtyByProductUnit.ContainsKey(unitKey))
                                {
                                    returnedQtyByProductUnit[unitKey] = 0;
                                }
                                returnedQtyByProductUnit[unitKey] += pItem.QuantityMilli;
                            }
                        }
                    }

                    // Check quantities and enforce net unit prices
                    var requestedInThisReturn = new Dictionary<string, long>();
                    var refundedTotalSoFar = new Dictionary<string, long>();
                    var refundedTotalBySaleItem = new Dictionary<string, long>();
                    for (int r = 0; r < pastReturns.Count; r++)
                    {
                        if (pastReturns[r].Items == null) continue;
                        for (int pi = 0; pi < pastReturns[r].Items.Count; pi++)
                        {
                            var pastItem = pastReturns[r].Items[pi];
                            if (string.IsNullOrEmpty(pastItem.SaleItemId)) continue;
                            refundedTotalBySaleItem[pastItem.SaleItemId] = (refundedTotalBySaleItem.ContainsKey(pastItem.SaleItemId) ? refundedTotalBySaleItem[pastItem.SaleItemId] : 0) + pastItem.TotalPiasters;
                        }
                    }
                    for (int i = 0; i < returnObj.Items.Count; i++)
                    {
                        var it = returnObj.Items[i];

                        // Find item in original sale: match by SaleItemId first, then by ProductId + Unit, then by ProductId
                        SaleItem origItem = null;
                        if (!string.IsNullOrEmpty(it.SaleItemId))
                        {
                            for (int j = 0; j < origSale.Items.Count; j++)
                            {
                                if (origSale.Items[j].Id == it.SaleItemId)
                                {
                                    origItem = origSale.Items[j];
                                    break;
                                }
                            }
                        }

                        if (origItem == null && !string.IsNullOrEmpty(it.Unit))
                        {
                            for (int j = 0; j < origSale.Items.Count; j++)
                            {
                                if (origSale.Items[j].ProductId == it.ProductId && string.Equals(origSale.Items[j].Unit, it.Unit, StringComparison.OrdinalIgnoreCase))
                                {
                                    origItem = origSale.Items[j];
                                    break;
                                }
                            }
                        }

                        if (origItem == null)
                        {
                            for (int j = 0; j < origSale.Items.Count; j++)
                            {
                                if (origSale.Items[j].ProductId == it.ProductId)
                                {
                                    origItem = origSale.Items[j];
                                    break;
                                }
                            }
                        }

                        if (origItem == null)
                        {
                            throw new InvalidOperationException(string.Format("الصنف '{0}' غير موجود في الفاتورة الأصلية #{1}.", it.ProductName, origSale.InvoiceNumber));
                        }

                        long alreadyReturned = 0;
                        if (!string.IsNullOrEmpty(origItem.Id) && returnedQtyBySaleItem.ContainsKey(origItem.Id))
                        {
                            alreadyReturned = returnedQtyBySaleItem[origItem.Id];
                        }
                        else
                        {
                            string unitKey = (it.ProductId ?? "") + "_" + (it.Unit ?? origItem.Unit ?? "");
                            if (returnedQtyByProductUnit.ContainsKey(unitKey))
                            {
                                alreadyReturned = returnedQtyByProductUnit[unitKey];
                            }
                        }

                        long maxAllowable = origItem.QuantityMilli - alreadyReturned;
                        string origKey = !string.IsNullOrEmpty(origItem.Id) ? origItem.Id : ((origItem.ProductId ?? "") + "_" + (origItem.Unit ?? ""));
                        long requestedSoFar = requestedInThisReturn.ContainsKey(origKey) ? requestedInThisReturn[origKey] : 0;
                        // Repeated lines for the same sale item inside one request must be summed (Audit F-07)
                        if (requestedSoFar + it.QuantityMilli > maxAllowable)
                        {
                            throw new InvalidOperationException(string.Format(
                                "الكمية المرتجعة للصنف '{0}' ({1:0.###}) أكبر من الكمية المتبقية المتاحة للإرجاع ({2:0.###}).",
                                it.ProductName, (requestedSoFar + it.QuantityMilli) / 1000.0, Math.Max(0, maxAllowable) / 1000.0
                            ));
                        }
                        requestedInThisReturn[origKey] = requestedSoFar + it.QuantityMilli;

                        // Calculate effective net unit price after discounts (TEST-7)
                        long effectiveUnitPrice = origItem.UnitPricePiasters;
                        if (origItem.QuantityMilli > 0 && origItem.TotalPiasters > 0)
                        {
                            decimal effPrice = ((decimal)origItem.TotalPiasters * 1000m) / (decimal)origItem.QuantityMilli;
                            effectiveUnitPrice = (long)Math.Round(effPrice, 0, MidpointRounding.AwayFromZero);
                        }

                        if (it.UnitPricePiasters <= 0 || it.UnitPricePiasters > effectiveUnitPrice)
                        {
                            it.UnitPricePiasters = effectiveUnitPrice;
                        }
                        // Refund proportionally to the original net line total; the line that exhausts the sold
                        // quantity receives the exact remainder so cumulative refunds equal what was paid (Audit F-19)
                        long proportionalTotal = (origItem.QuantityMilli > 0)
                            ? (long)Math.Round(((decimal)origItem.TotalPiasters * it.QuantityMilli) / (decimal)origItem.QuantityMilli, 0, MidpointRounding.AwayFromZero)
                            : 0;
                        long refundedBefore = refundedTotalSoFar.ContainsKey(origKey) ? refundedTotalSoFar[origKey] : 0;
                        if (!string.IsNullOrEmpty(origItem.Id) && refundedTotalBySaleItem.ContainsKey(origItem.Id))
                        {
                            refundedBefore += refundedTotalBySaleItem[origItem.Id];
                        }
                        if (alreadyReturned + requestedInThisReturn[origKey] == origItem.QuantityMilli)
                        {
                            proportionalTotal = Math.Max(0, origItem.TotalPiasters - refundedBefore);
                        }
                        long priceBasedTotal = Money.FromPiasters(it.UnitPricePiasters).MultiplyByMilliUnits(it.QuantityMilli).Piasters;
                        it.TotalPiasters = (it.UnitPricePiasters == effectiveUnitPrice) ? proportionalTotal : Math.Min(priceBasedTotal, proportionalTotal);
                        refundedTotalSoFar[origKey] = (refundedTotalSoFar.ContainsKey(origKey) ? refundedTotalSoFar[origKey] : 0) + it.TotalPiasters;

                        if (it.ConversionFactor <= 0)
                        {
                            it.ConversionFactor = origItem.ConversionFactor > 0 ? origItem.ConversionFactor : 1;
                        }
                        if (string.IsNullOrEmpty(it.Unit))
                        {
                            it.Unit = origItem.Unit;
                        }
                        if (string.IsNullOrEmpty(it.SaleItemId))
                        {
                            it.SaleItemId = origItem.Id;
                        }
                    }

                    // Enforce financial ceiling for refunds on credit sales (Senior QA Invariant)
                    // If returning an unpaid credit sale, cash or digital money cannot be disbursed;
                    // it must be routed to 'credit' to reduce customer debt.
                    long netCashPaidOnOrig = 0;
                    long netCardPaidOnOrig = 0;
                    long netInstapayPaidOnOrig = 0;
                    long netWalletPaidOnOrig = 0;

                    if (origSale.Payments != null && origSale.Payments.Count > 0)
                    {
                        long cashSum = 0;
                        for (int p = 0; p < origSale.Payments.Count; p++)
                        {
                            var pm = origSale.Payments[p];
                            if (pm != null)
                            {
                                if (string.Equals(pm.Method, "cash", StringComparison.OrdinalIgnoreCase))
                                {
                                    cashSum += pm.AmountPiasters;
                                }
                                else if (string.Equals(pm.Method, "card", StringComparison.OrdinalIgnoreCase))
                                {
                                    netCardPaidOnOrig += pm.AmountPiasters;
                                }
                                else if (string.Equals(pm.Method, "instapay", StringComparison.OrdinalIgnoreCase))
                                {
                                    netInstapayPaidOnOrig += pm.AmountPiasters;
                                }
                                else if (string.Equals(pm.Method, "vodafone_cash", StringComparison.OrdinalIgnoreCase) ||
                                         string.Equals(pm.Method, "wallet", StringComparison.OrdinalIgnoreCase))
                                {
                                    netWalletPaidOnOrig += pm.AmountPiasters;
                                }
                            }
                        }
                        netCashPaidOnOrig = Math.Max(0, cashSum - origSale.ChangePiasters);
                    }
                    else if (string.Equals(origSale.PaymentMethod, "cash", StringComparison.OrdinalIgnoreCase))
                    {
                        netCashPaidOnOrig = Math.Max(0, origSale.PaidPiasters - origSale.ChangePiasters);
                    }
                    else if (string.Equals(origSale.PaymentMethod, "card", StringComparison.OrdinalIgnoreCase))
                    {
                        netCardPaidOnOrig = Math.Max(0, origSale.PaidPiasters);
                    }
                    else if (string.Equals(origSale.PaymentMethod, "credit", StringComparison.OrdinalIgnoreCase))
                    {
                        // F-14: Credit sales can be refunded in cash up to the cash actually paid (down payment + cash debt settlements)
                        long allocatedDebtCash = _saleRepo != null ? _saleRepo.GetAllocatedDebtCashPiasters(origSale.Id) : 0;
                        netCashPaidOnOrig = Math.Max(0, origSale.PaidPiasters + allocatedDebtCash);
                    }
                    else if (string.Equals(origSale.PaymentMethod, "instapay", StringComparison.OrdinalIgnoreCase))
                    {
                        netInstapayPaidOnOrig = Math.Max(0, origSale.PaidPiasters - origSale.ServiceFeePiasters);
                    }
                    else if (string.Equals(origSale.PaymentMethod, "vodafone_cash", StringComparison.OrdinalIgnoreCase) ||
                             string.Equals(origSale.PaymentMethod, "wallet", StringComparison.OrdinalIgnoreCase))
                    {
                        netWalletPaidOnOrig = Math.Max(0, origSale.PaidPiasters - origSale.ServiceFeePiasters);
                    }

                    long pastCashRefunds = 0;
                    long pastCardRefunds = 0;
                    long pastInstapayRefunds = 0;
                    long pastWalletRefunds = 0;
                    long pastTotalRefunds = 0;

                    for (int r = 0; r < pastReturns.Count; r++)
                    {
                        pastTotalRefunds += pastReturns[r].TotalPiasters;
                        if (string.Equals(pastReturns[r].RefundMethod, "cash", StringComparison.OrdinalIgnoreCase))
                        {
                            pastCashRefunds += pastReturns[r].TotalPiasters;
                        }
                        else if (string.Equals(pastReturns[r].RefundMethod, "card", StringComparison.OrdinalIgnoreCase))
                        {
                            pastCardRefunds += pastReturns[r].TotalPiasters;
                        }
                        else if (string.Equals(pastReturns[r].RefundMethod, "instapay", StringComparison.OrdinalIgnoreCase))
                        {
                            pastInstapayRefunds += pastReturns[r].TotalPiasters;
                        }
                        else if (string.Equals(pastReturns[r].RefundMethod, "vodafone_cash", StringComparison.OrdinalIgnoreCase) ||
                                 string.Equals(pastReturns[r].RefundMethod, "wallet", StringComparison.OrdinalIgnoreCase))
                        {
                            pastWalletRefunds += pastReturns[r].TotalPiasters;
                        }
                    }

                    long allowableCashRefund = Math.Max(0, netCashPaidOnOrig - pastCashRefunds);
                    long allowableCardRefund = Math.Max(0, netCardPaidOnOrig - pastCardRefunds);
                    long allowableInstapayRefund = Math.Max(0, netInstapayPaidOnOrig - pastInstapayRefunds);
                    long allowableWalletRefund = Math.Max(0, netWalletPaidOnOrig - pastWalletRefunds);

                    long currentReturnTotal = 0;
                    for (int ri = 0; ri < returnObj.Items.Count; ri++)
                    {
                        currentReturnTotal += returnObj.Items[ri].TotalPiasters;
                    }

                    if (pastTotalRefunds + currentReturnTotal > origSale.TotalPiasters)
                    {
                        throw new InvalidOperationException(string.Format(
                            "إجمالي المرتجعات ({0:N2} ج.م) يتجاوز القيمة الإجمالية للفاتورة الأصلية ({1:N2} ج.م).",
                            (pastTotalRefunds + currentReturnTotal) / 100.0, origSale.TotalPiasters / 100.0));
                    }

                    // Whitelist validation (F-13)
                    string refundMethod = (returnObj.RefundMethod ?? "").ToLowerInvariant();
                    if (refundMethod != "cash" && refundMethod != "card" && refundMethod != "instapay" && refundMethod != "wallet" && refundMethod != "vodafone_cash" && refundMethod != "credit" && refundMethod != "customer_balance")
                    {
                        throw new InvalidOperationException(string.Format(
                            "طريقة استرداد المرتجع غير صالحة: '{0}'. الطرق المسموح بها هي: نقدي (cash)، بطاقة (card)، إنستاباي (instapay)، محفظة (wallet)، رصيد آجل (credit).",
                            returnObj.RefundMethod));
                    }

                    if (string.Equals(returnObj.RefundMethod, "cash", StringComparison.OrdinalIgnoreCase))
                    {
                        if (netCashPaidOnOrig <= 0)
                        {
                            throw new InvalidOperationException("لا يمكن صرف مرتجع نقدي من الدرج لفاتورة بيع لم يُسدد منها مبالغ نقدية. يجب اختيار استرداد كرصيد آجل (credit).");
                        }
                        else if (currentReturnTotal > allowableCashRefund)
                        {
                            throw new InvalidOperationException(string.Format(
                                "لا يمكن صرف مرتجع نقدي من الدرج بمبلغ ({0:N2} ج.م) يتجاوز النقد المسدد فعلياً في الفاتورة الأصلية ({1:N2} ج.م). يجب اختيار الاسترداد كرصيد آجل (credit) لخصم القيمة من حساب العميل.",
                                currentReturnTotal / 100.0, allowableCashRefund / 100.0));
                        }
                    }
                    else if (string.Equals(returnObj.RefundMethod, "card", StringComparison.OrdinalIgnoreCase))
                    {
                        if (netCardPaidOnOrig <= 0)
                        {
                            throw new InvalidOperationException("لا يمكن استرداد المرتجع عبر البطاقة (card) لفاتورة بيع لم يُسدد منها بالبطاقة.");
                        }
                        else if (currentReturnTotal > allowableCardRefund)
                        {
                            throw new InvalidOperationException(string.Format(
                                "لا يمكن صرف مرتجع عبر البطاقة بمبلغ ({0:N2} ج.م) يتجاوز المسدد فعلياً بالبطاقة في الفاتورة الأصلية ({1:N2} ج.م).",
                                currentReturnTotal / 100.0, allowableCardRefund / 100.0));
                        }
                    }
                    else if (string.Equals(returnObj.RefundMethod, "instapay", StringComparison.OrdinalIgnoreCase))
                    {
                        if (netInstapayPaidOnOrig <= 0)
                        {
                            throw new InvalidOperationException("لا يمكن صرف مرتجع عبر إنستاباي لفاتورة بيع لم يُسدد منها عبر إنستاباي. يجب اختيار استرداد كرصيد آجل (credit).");
                        }
                        else if (currentReturnTotal > allowableInstapayRefund)
                        {
                            throw new InvalidOperationException(string.Format(
                                "لا يمكن صرف مرتجع عبر إنستاباي بمبلغ ({0:N2} ج.م) يتجاوز المسدد فعلياً عبر إنستاباي في الفاتورة الأصلية ({1:N2} ج.م).",
                                currentReturnTotal / 100.0, allowableInstapayRefund / 100.0));
                        }
                    }
                    else if (string.Equals(returnObj.RefundMethod, "vodafone_cash", StringComparison.OrdinalIgnoreCase) ||
                             string.Equals(returnObj.RefundMethod, "wallet", StringComparison.OrdinalIgnoreCase))
                    {
                        if (netWalletPaidOnOrig <= 0)
                        {
                            throw new InvalidOperationException("لا يمكن صرف مرتجع عبر المحفظة الإلكترونية لفاتورة بيع لم يُسدد منها عبر المحفظة. يجب اختيار استرداد كرصيد آجل (credit).");
                        }
                        else if (currentReturnTotal > allowableWalletRefund)
                        {
                            throw new InvalidOperationException(string.Format(
                                "لا يمكن صرف مرتجع عبر المحفظة الإلكترونية بمبلغ ({0:N2} ج.م) يتجاوز المسدد فعلياً عبر المحفظة في الفاتورة الأصلية ({1:N2} ج.م).",
                                currentReturnTotal / 100.0, allowableWalletRefund / 100.0));
                        }
                    }
                }
            }

            // Closed Day Validation & Post-Closing Freeze
            var closingSvc = _dailyClosingService ?? DatabaseService.DailyClosing;
            if (closingSvc != null)
            {
                string currentBDate = closingSvc.GetCurrentBusinessDate();
                if (closingSvc.IsDayClosed(currentBDate))
                {
                    throw new InvalidOperationException(string.Format("لا يمكن تسجيل أي عملية مرتجع لتاريخ عمل تم إقفاله وتشميعه مسبقاً ({0}).", currentBDate));
                }
            }

            // Invariant: Cash refunds disburse physical money from drawer; check drawer cash sufficiency
            if (string.Equals(returnObj.RefundMethod, "cash", StringComparison.OrdinalIgnoreCase))
            {
                long totalCashToRefund = 0;
                for (int rItemIdx = 0; rItemIdx < returnObj.Items.Count; rItemIdx++)
                {
                    totalCashToRefund += returnObj.Items[rItemIdx].TotalPiasters;
                }

                if (closingSvc != null)
                {
                    string currentBDate = closingSvc.GetCurrentBusinessDate();

                    var liveBal = closingSvc.GetLiveDrawerBalance(currentBDate);
                    if (liveBal != null && liveBal.AvailableCashPiasters < totalCashToRefund)
                    {
                        throw new InvalidOperationException(string.Format(
                            "رصيد نقدية الدرج المتاح حالياً ({0:N2} ج.م) غير كافٍ لصرف قيمة المرتجع نقداً ({1:N2} ج.م). يرجى استرداد القيمة كرصيد آجل (credit) في حساب العميل أو توريد نقدية للدرج أولاً.",
                            liveBal.AvailableCashPiasters / 100.0, totalCashToRefund / 100.0));
                    }
                }
            }

            return _returnRepo.CreateReturnAtomic(returnObj);
        }

        public List<Return> GetRecentReturns(int limit = 50)
        {
            return _returnRepo.GetRecentReturns(limit);
        }

        public Return GetReturnById(string id)
        {
            return _returnRepo.GetReturnById(id);
        }

        public List<Return> GetReturnsForSale(string saleId)
        {
            return _returnRepo.GetReturnsForSale(saleId);
        }
    }
}
