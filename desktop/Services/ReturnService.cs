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

        public ReturnService(ReturnRepository returnRepo, SaleRepository saleRepo)
        {
            _returnRepo = returnRepo;
            _saleRepo = saleRepo;
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

            // 1. If return is without invoice, require Supervisor PIN
            if (returnObj.IsWithoutInvoice || string.IsNullOrEmpty(returnObj.SaleId))
            {
                if (DatabaseService.Security != null)
                {
                    var pinStatus = DatabaseService.Security.GetStatus();
                    if (pinStatus.IsEnabled)
                    {
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
                    // If returning an unpaid credit sale, cash cannot be disbursed from drawer;
                    // it must be routed to 'credit' to reduce customer debt.
                    long netCashPaidOnOrig = 0;
                    if (origSale.Payments != null && origSale.Payments.Count > 0)
                    {
                        long cashSum = 0;
                        for (int p = 0; p < origSale.Payments.Count; p++)
                        {
                            var pm = origSale.Payments[p];
                            if (pm != null && string.Equals(pm.Method, "cash", StringComparison.OrdinalIgnoreCase))
                            {
                                cashSum += pm.AmountPiasters;
                            }
                        }
                        netCashPaidOnOrig = Math.Max(0, cashSum - origSale.ChangePiasters);
                    }
                    else if (string.Equals(origSale.PaymentMethod, "cash", StringComparison.OrdinalIgnoreCase))
                    {
                        netCashPaidOnOrig = Math.Max(0, origSale.PaidPiasters - origSale.ChangePiasters);
                    }
                    else if (string.Equals(origSale.PaymentMethod, "credit", StringComparison.OrdinalIgnoreCase))
                    {
                        netCashPaidOnOrig = Math.Max(0, origSale.PaidPiasters);
                    }

                    long pastCashRefunds = 0;
                    for (int r = 0; r < pastReturns.Count; r++)
                    {
                        if (string.Equals(pastReturns[r].RefundMethod, "cash", StringComparison.OrdinalIgnoreCase))
                        {
                            pastCashRefunds += pastReturns[r].TotalPiasters;
                        }
                    }

                    long allowableCashRefund = Math.Max(0, netCashPaidOnOrig - pastCashRefunds);
                    long currentReturnTotal = 0;
                    for (int ri = 0; ri < returnObj.Items.Count; ri++)
                    {
                        currentReturnTotal += returnObj.Items[ri].TotalPiasters;
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
