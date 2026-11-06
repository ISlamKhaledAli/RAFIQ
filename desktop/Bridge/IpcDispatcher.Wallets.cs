using System;
using System.Collections.Generic;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using RafiqPOS.Models;
using RafiqPOS.Repositories;
using RafiqPOS.Services;

namespace RafiqPOS.Bridge
{
    public partial class IpcDispatcher
    {
        private static DigitalAccountRepository GetWalletsRepo()
        {
            if (DatabaseService.DigitalAccounts != null)
            {
                return DatabaseService.DigitalAccounts;
            }
            return new DigitalAccountRepository(DatabaseService.ConnectionString, DatabaseService.AuditRepo);
        }

        private static bool TryDispatchWallets(BridgeRequest request, out BridgeResponse response)
        {
            response = null;

            switch (request.Action)
            {
                case "wallets:getAccounts":
                    {
                        var repo = GetWalletsRepo();
                        bool includeInactive = false;
                        if (request.Payload != null)
                        {
                            var pObj = request.Payload as JObject;
                            if (pObj != null && pObj["includeInactive"] != null)
                            {
                                includeInactive = pObj["includeInactive"].Value<bool>();
                            }
                        }
                        var accounts = repo.GetAllAccounts(includeInactive);
                        response = BridgeResponse.Ok(request.Id, accounts);
                        return true;
                    }

                case "wallets:saveAccount":
                case "wallets:createAccount":
                case "wallets:updateAccount":
                    {
                        var repo = GetWalletsRepo();
                        if (request.Payload == null)
                        {
                            response = BridgeResponse.Fail(request.Id, "VALIDATION_ERROR", "بيانات الحساب أو المحفظة فارغة");
                            return true;
                        }

                        var account = JsonConvert.DeserializeObject<DigitalAccount>(request.Payload.ToString());
                        if (account == null || string.IsNullOrWhiteSpace(account.Name))
                        {
                            response = BridgeResponse.Fail(request.Id, "VALIDATION_ERROR", "اسم الحساب أو المحفظة مطلوب");
                            return true;
                        }

                        lock (SaleService.FinancialWriteLock)
                        {
                            var saved = repo.SaveAccount(account);
                            response = BridgeResponse.Ok(request.Id, saved);
                        }
                        return true;
                    }

                case "wallets:setDefaultAccount":
                    {
                        var repo = GetWalletsRepo();
                        string accountId = null;
                        var setPayload = request.Payload as JObject;
                        if (setPayload != null)
                        {
                            if (setPayload["id"] != null)
                            {
                                accountId = setPayload["id"].ToString();
                            }
                        }
                        else if (request.Payload != null)
                        {
                            accountId = request.Payload.ToString();
                        }

                        if (string.IsNullOrWhiteSpace(accountId))
                        {
                            response = BridgeResponse.Fail(request.Id, "VALIDATION_ERROR", "معرف الحساب مطلوب لتعيينه رئيسياً");
                            return true;
                        }

                        lock (SaleService.FinancialWriteLock)
                        {
                            var updated = repo.SetDefaultAccount(accountId);
                            response = BridgeResponse.Ok(request.Id, updated);
                        }
                        return true;
                    }

                case "wallets:deleteAccount":
                    {
                        var repo = GetWalletsRepo();
                        string accountId = null;
                        if (request.Payload != null)
                        {
                            var pObj = request.Payload as JObject;
                            if (pObj != null && pObj["id"] != null)
                            {
                                accountId = pObj["id"].ToString();
                            }
                            else
                            {
                                accountId = request.Payload.ToString();
                            }
                        }

                        if (string.IsNullOrEmpty(accountId))
                        {
                            response = BridgeResponse.Fail(request.Id, "VALIDATION_ERROR", "معرف الحساب مطلوب لحذفه");
                            return true;
                        }

                        lock (SaleService.FinancialWriteLock)
                        {
                            repo.DeleteAccount(accountId);
                            response = BridgeResponse.Ok(request.Id, new { success = true });
                        }
                        return true;
                    }

                case "wallets:adjustBalance":
                    {
                        var repo = GetWalletsRepo();
                        if (request.Payload == null)
                        {
                            response = BridgeResponse.Fail(request.Id, "VALIDATION_ERROR", "بيانات التسوية فارغة");
                            return true;
                        }

                        JObject payloadObj = request.Payload as JObject ?? JObject.Parse(request.Payload.ToString());
                        string accountId = payloadObj["accountId"] != null ? (string)payloadObj["accountId"] : null;
                        long newBalancePiasters = payloadObj["newBalancePiasters"] != null ? (long)payloadObj["newBalancePiasters"] : 0;
                        string reason = payloadObj["reason"] != null ? (string)payloadObj["reason"] : null;

                        if (string.IsNullOrWhiteSpace(accountId))
                        {
                            response = BridgeResponse.Fail(request.Id, "VALIDATION_ERROR", "معرف الحساب أو المحفظة مطلوب");
                            return true;
                        }
                        if (string.IsNullOrWhiteSpace(reason))
                        {
                            response = BridgeResponse.Fail(request.Id, "VALIDATION_ERROR", "سبب تسوية الرصيد إلزامي ولا يمكن تركه فارغاً");
                            return true;
                        }

                        var sessionUser = SecurityService.CurrentUser;
                        string userId = sessionUser != null ? sessionUser.Id : "admin";

                        lock (SaleService.FinancialWriteLock)
                        {
                            var updated = repo.AdjustBalance(accountId, newBalancePiasters, reason, userId);
                            response = BridgeResponse.Ok(request.Id, updated);
                        }
                        return true;
                    }

                case "wallets:fundAccount":
                    {
                        var repo = GetWalletsRepo();
                        if (request.Payload == null)
                        {
                            response = BridgeResponse.Fail(request.Id, "VALIDATION_ERROR", "بيانات التغذية فارغة");
                            return true;
                        }

                        var pObj = request.Payload as JObject;
                        if (pObj == null)
                        {
                            response = BridgeResponse.Fail(request.Id, "VALIDATION_ERROR", "بيانات التغذية غير صالحة");
                            return true;
                        }

                        string accountId = pObj["accountId"] != null ? pObj["accountId"].ToString() : null;
                        long amountPiasters = pObj["amountPiasters"] != null ? pObj["amountPiasters"].Value<long>() : 0;
                        string fundingSource = pObj["fundingSource"] != null ? pObj["fundingSource"].ToString() : "cash_drawer";
                        string notes = pObj["notes"] != null ? pObj["notes"].ToString() : null;

                        if (string.IsNullOrEmpty(accountId))
                        {
                            response = BridgeResponse.Fail(request.Id, "VALIDATION_ERROR", "يرجى تحديد الحساب المطلوب تغذيته");
                            return true;
                        }
                        if (amountPiasters <= 0)
                        {
                            response = BridgeResponse.Fail(request.Id, "VALIDATION_ERROR", "مبلغ التغذية يجب أن يكون أكبر من الصفر");
                            return true;
                        }

                        string createdBy = SecurityService.CurrentUser != null
                            ? (!string.IsNullOrEmpty(SecurityService.CurrentUser.DisplayName) ? SecurityService.CurrentUser.DisplayName : SecurityService.CurrentUser.Username)
                            : "الكاشير";

                        lock (SaleService.FinancialWriteLock)
                        {
                            var funding = repo.FundAccount(accountId, amountPiasters, fundingSource, notes, createdBy);
                            response = BridgeResponse.Ok(request.Id, funding);
                        }
                        return true;
                    }

                case "wallets:processTransaction":
                    {
                        var repo = GetWalletsRepo();
                        if (request.Payload == null)
                        {
                            response = BridgeResponse.Fail(request.Id, "VALIDATION_ERROR", "بيانات العملية فارغة");
                            return true;
                        }

                        var tx = JsonConvert.DeserializeObject<DigitalTransaction>(request.Payload.ToString());
                        if (tx == null)
                        {
                            response = BridgeResponse.Fail(request.Id, "VALIDATION_ERROR", "بيانات العملية غير صالحة");
                            return true;
                        }

                        if (string.IsNullOrEmpty(tx.AccountId))
                        {
                            response = BridgeResponse.Fail(request.Id, "VALIDATION_ERROR", "يرجى اختيار المحفظة أو حساب إنستاباي");
                            return true;
                        }
                        if (tx.AmountPiasters <= 0)
                        {
                            response = BridgeResponse.Fail(request.Id, "VALIDATION_ERROR", "يرجى تحديد مبلغ العملية");
                            return true;
                        }

                        if (SecurityService.CurrentUser != null)
                        {
                            tx.CashierName = !string.IsNullOrEmpty(SecurityService.CurrentUser.DisplayName)
                                ? SecurityService.CurrentUser.DisplayName
                                : SecurityService.CurrentUser.Username;
                        }

                        lock (SaleService.FinancialWriteLock)
                        {
                            var result = repo.ProcessTransaction(tx);
                            response = BridgeResponse.Ok(request.Id, result);
                        }
                        return true;
                    }

                case "wallets:cancelTransaction":
                    {
                        var repo = GetWalletsRepo();
                        if (request.Payload == null)
                        {
                            response = BridgeResponse.Fail(request.Id, "VALIDATION_ERROR", "بيانات الإلغاء فارغة");
                            return true;
                        }

                        JObject payloadObj = request.Payload as JObject ?? JObject.Parse(request.Payload.ToString());
                        string transactionId = payloadObj["transactionId"] != null ? (string)payloadObj["transactionId"] : null;
                        string reason = payloadObj["reason"] != null ? (string)payloadObj["reason"] : null;

                        if (string.IsNullOrWhiteSpace(transactionId))
                        {
                            response = BridgeResponse.Fail(request.Id, "VALIDATION_ERROR", "معرف المعاملة مطلوب لإلغائها");
                            return true;
                        }
                        if (string.IsNullOrWhiteSpace(reason))
                        {
                            response = BridgeResponse.Fail(request.Id, "VALIDATION_ERROR", "سبب الإلغاء إلزامي ولا يمكن تركه فارغاً");
                            return true;
                        }

                        string cancelledBy = SecurityService.CurrentUser != null
                            ? (!string.IsNullOrEmpty(SecurityService.CurrentUser.DisplayName) ? SecurityService.CurrentUser.DisplayName : SecurityService.CurrentUser.Username)
                            : "الكاشير";

                        lock (SaleService.FinancialWriteLock)
                        {
                            var result = repo.CancelTransaction(transactionId, reason, cancelledBy);
                            response = BridgeResponse.Ok(request.Id, result);
                        }
                        return true;
                    }

                case "wallets:getTransactions":
                    {
                        var repo = GetWalletsRepo();
                        int limit = 200;
                        string accountId = null;
                        string txType = null;

                        if (request.Payload != null)
                        {
                            var pObj = request.Payload as JObject;
                            if (pObj != null)
                            {
                                if (pObj["limit"] != null) limit = pObj["limit"].Value<int>();
                                if (pObj["accountId"] != null) accountId = pObj["accountId"].ToString();
                                if (pObj["txType"] != null) txType = pObj["txType"].ToString();
                            }
                        }

                        var list = repo.GetTransactions(limit, accountId, txType);
                        response = BridgeResponse.Ok(request.Id, list);
                        return true;
                    }

                case "wallets:getFundings":
                    {
                        var repo = GetWalletsRepo();
                        int limit = 100;
                        string accountId = null;

                        if (request.Payload != null)
                        {
                            var pObj = request.Payload as JObject;
                            if (pObj != null)
                            {
                                if (pObj["limit"] != null) limit = pObj["limit"].Value<int>();
                                if (pObj["accountId"] != null) accountId = pObj["accountId"].ToString();
                            }
                        }

                        var list = repo.GetFundings(limit, accountId);
                        response = BridgeResponse.Ok(request.Id, list);
                        return true;
                    }

                case "wallets:getAnalytics":
                    {
                        var repo = GetWalletsRepo();
                        var analytics = repo.GetAnalytics();
                        response = BridgeResponse.Ok(request.Id, analytics);
                        return true;
                    }

                case "wallets:printReceipt":
                case "printer:printWalletReceipt":
                    {
                        var repo = GetWalletsRepo();
                        DigitalTransaction tx = null;
                        string printerName = null;
                        string paperWidth = null;

                        JObject payloadObj = request.Payload as JObject;
                        if (payloadObj == null && request.Payload != null)
                        {
                            try
                            {
                                payloadObj = JObject.Parse(request.Payload.ToString());
                            }
                            catch { }
                        }

                        if (payloadObj != null)
                        {
                            if (payloadObj["printerName"] != null) printerName = payloadObj["printerName"].ToString();
                            if (payloadObj["paperWidth"] != null) paperWidth = payloadObj["paperWidth"].ToString();

                            string txId = null;
                            if (payloadObj["transactionId"] != null) txId = payloadObj["transactionId"].ToString();
                            else if (payloadObj["id"] != null) txId = payloadObj["id"].ToString();

                            if (!string.IsNullOrWhiteSpace(txId))
                            {
                                tx = repo.GetTransactionById(txId);
                            }

                            if (tx == null)
                            {
                                JToken txToken = payloadObj["transaction"] ?? payloadObj["tx"];
                                if (txToken != null && txToken.Type != JTokenType.Null)
                                {
                                    tx = txToken.ToObject<DigitalTransaction>();
                                }
                                else if (payloadObj["amountPiasters"] != null || payloadObj["accountName"] != null)
                                {
                                    tx = payloadObj.ToObject<DigitalTransaction>();
                                }
                            }
                        }

                        if (tx == null)
                        {
                            response = BridgeResponse.Fail(request.Id, "NOT_FOUND", "لم يتم العثور على بيانات إيصال المعاملة المطلوب طباعتها");
                            return true;
                        }

                        var printRes = DatabaseService.Printer.PrintDigitalTransactionReceipt(tx, printerName, paperWidth);
                        response = ToPrintResponse(request.Id, printRes);
                        return true;
                    }

                default:
                    return false;
            }
        }
    }
}
