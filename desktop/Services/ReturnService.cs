using System;
using System.Collections.Generic;
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
            if (returnObj == null) throw new ArgumentNullException("returnObj");
            if (returnObj.Items == null || returnObj.Items.Count == 0)
            {
                throw new InvalidOperationException("لا يمكن حفظ مرتجع بدون أصناف");
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
                        if (it.QuantityMilli > maxAllowable)
                        {
                            throw new InvalidOperationException(string.Format(
                                "الكمية المرتجعة للصنف '{0}' ({1:0.###}) أكبر من الكمية المتبقية المتاحة للإرجاع ({2:0.###}).",
                                it.ProductName, it.QuantityMilli / 1000.0, Math.Max(0, maxAllowable) / 1000.0
                            ));
                        }

                        // Calculate effective net unit price after discounts (TEST-7)
                        long effectiveUnitPrice = origItem.UnitPricePiasters;
                        if (origItem.QuantityMilli > 0 && origItem.TotalPiasters > 0)
                        {
                            effectiveUnitPrice = (origItem.TotalPiasters * 1000) / origItem.QuantityMilli;
                        }

                        if (it.UnitPricePiasters <= 0 || it.UnitPricePiasters > effectiveUnitPrice)
                        {
                            it.UnitPricePiasters = effectiveUnitPrice;
                        }
                        it.TotalPiasters = (it.UnitPricePiasters * it.QuantityMilli) / 1000;

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
