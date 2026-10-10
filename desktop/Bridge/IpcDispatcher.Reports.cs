using System;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Bridge
{
    public partial class IpcDispatcher
    {
        private static bool TryDispatchReports(BridgeRequest request, out BridgeResponse response)
        {
            response = null;
            switch (request.Action)
            {
                case "reports:getTodaySummary":
                    var summary = DatabaseService.Reports.GetTodaySummary();
                    response = BridgeResponse.Ok(request.Id, summary);
                    return true;

                case "reports:getPeriodSales":
                    string repPeriod = "today";
                    string fromDate = null;
                    string toDate = null;
                    JObject repObj = request.Payload as JObject;
                    if (repObj != null)
                    {
                        if (repObj["period"] != null) repPeriod = repObj["period"].ToString();
                        if (repObj["fromDate"] != null) fromDate = repObj["fromDate"].ToString();
                        if (repObj["toDate"] != null) toDate = repObj["toDate"].ToString();
                    }
                    var periodReport = DatabaseService.Reports.GetPeriodSalesReport(repPeriod, fromDate, toDate);
                    response = BridgeResponse.Ok(request.Id, periodReport);
                    return true;

                case "reports:getLowStock":
                    var lowStockItems = DatabaseService.Reports.GetLowStockReport();
                    response = BridgeResponse.Ok(request.Id, lowStockItems);
                    return true;

                case "reports:getDebtors":
                    var debtorsList = DatabaseService.Reports.GetDebtorsReport();
                    response = BridgeResponse.Ok(request.Id, debtorsList);
                    return true;

                case "reports:getDataQuality":
                    var dataQualityReport = DatabaseService.Reports.GetDataQualityReport();
                    response = BridgeResponse.Ok(request.Id, dataQualityReport);
                    return true;

                case "reports:runMilestone9Tests":
                    var m9TestResult = ReportsAndClosingTestRunner.RunAllTests();
                    response = BridgeResponse.Ok(request.Id, m9TestResult);
                    return true;

                case "reports:getInventoryLoss":
                    string lossPeriod = "today";
                    string lossFrom = null;
                    string lossTo = null;
                    JObject lossObj = request.Payload as JObject;
                    if (lossObj != null)
                    {
                        if (lossObj["period"] != null) lossPeriod = lossObj["period"].ToString();
                        if (lossObj["fromDate"] != null) lossFrom = lossObj["fromDate"].ToString();
                        if (lossObj["toDate"] != null) lossTo = lossObj["toDate"].ToString();
                    }
                    var lossReport = DatabaseService.Reports.GetInventoryLossReport(lossPeriod, lossFrom, lossTo);
                    response = BridgeResponse.Ok(request.Id, lossReport);
                    return true;

                case "reports:getClosingHistory":
                    string chPeriod = "month";
                    string chFrom = null;
                    string chTo = null;
                    JObject chObj = request.Payload as JObject;
                    if (chObj != null)
                    {
                        if (chObj["period"] != null) chPeriod = chObj["period"].ToString();
                        if (chObj["fromDate"] != null) chFrom = chObj["fromDate"].ToString();
                        if (chObj["toDate"] != null) chTo = chObj["toDate"].ToString();
                    }
                    var closings = DatabaseService.Reports.GetClosingHistory(chPeriod, chFrom, chTo);
                    response = BridgeResponse.Ok(request.Id, closings);
                    return true;

                case "reports:getCategoryPerformance":
                    string catPeriod = "month";
                    string catFrom = null;
                    string catTo = null;
                    JObject catObj = request.Payload as JObject;
                    if (catObj != null)
                    {
                        if (catObj["period"] != null) catPeriod = catObj["period"].ToString();
                        if (catObj["fromDate"] != null) catFrom = catObj["fromDate"].ToString();
                        if (catObj["toDate"] != null) catTo = catObj["toDate"].ToString();
                    }
                    var catPerf = DatabaseService.Reports.GetCategoryPerformance(catPeriod, catFrom, catTo);
                    response = BridgeResponse.Ok(request.Id, catPerf);
                    return true;

                case "reports:getItemProfitability":
                    string itemPeriod = "month";
                    int itemLimit = 20;
                    string itemDir = "desc";
                    JObject itemObj = request.Payload as JObject;
                    if (itemObj != null)
                    {
                        if (itemObj["period"] != null) itemPeriod = itemObj["period"].ToString();
                        if (itemObj["limit"] != null) int.TryParse(itemObj["limit"].ToString(), out itemLimit);
                        if (itemObj["direction"] != null) itemDir = itemObj["direction"].ToString();
                    }
                    var itemProf = DatabaseService.Reports.GetItemProfitability(itemPeriod, itemLimit, itemDir);
                    response = BridgeResponse.Ok(request.Id, itemProf);
                    return true;

                case "reports:getPeriodComparison":
                    string compPeriod = "week";
                    JObject compObj = request.Payload as JObject;
                    if (compObj != null && compObj["period"] != null)
                    {
                        compPeriod = compObj["period"].ToString();
                    }
                    var compReport = DatabaseService.Reports.GetPeriodComparison(compPeriod);
                    response = BridgeResponse.Ok(request.Id, compReport);
                    return true;

                case "reports:getInventoryOverview":
                    var invOverview = DatabaseService.Reports.GetInventoryOverview();
                    response = BridgeResponse.Ok(request.Id, invOverview);
                    return true;

                case "reports:getShrinkageAnalysis":
                    string shPeriod = "month";
                    string shFrom = null;
                    string shTo = null;
                    JObject shObj = request.Payload as JObject;
                    if (shObj != null)
                    {
                        if (shObj["period"] != null) shPeriod = shObj["period"].ToString();
                        if (shObj["fromDate"] != null) shFrom = shObj["fromDate"].ToString();
                        if (shObj["toDate"] != null) shTo = shObj["toDate"].ToString();
                    }
                    var shrinkage = DatabaseService.Reports.GetShrinkageAnalysis(shPeriod, shFrom, shTo);
                    response = BridgeResponse.Ok(request.Id, shrinkage);
                    return true;

                case "reports:getPurchaseAnalysis":
                    string purPeriod = "month";
                    string purFrom = null;
                    string purTo = null;
                    JObject purObj = request.Payload as JObject;
                    if (purObj != null)
                    {
                        if (purObj["period"] != null) purPeriod = purObj["period"].ToString();
                        if (purObj["fromDate"] != null) purFrom = purObj["fromDate"].ToString();
                        if (purObj["toDate"] != null) purTo = purObj["toDate"].ToString();
                    }
                    var purAnalysis = DatabaseService.Reports.GetPurchaseAnalysis(purPeriod, purFrom, purTo);
                    response = BridgeResponse.Ok(request.Id, purAnalysis);
                    return true;

                case "reports:getCreditOverview":
                    string crPeriod = "month";
                    string crFrom = null;
                    string crTo = null;
                    JObject crObj = request.Payload as JObject;
                    if (crObj != null)
                    {
                        if (crObj["period"] != null) crPeriod = crObj["period"].ToString();
                        if (crObj["fromDate"] != null) crFrom = crObj["fromDate"].ToString();
                        if (crObj["toDate"] != null) crTo = crObj["toDate"].ToString();
                    }
                    var creditOverview = DatabaseService.Reports.GetCreditOverview(crPeriod, crFrom, crTo);
                    response = BridgeResponse.Ok(request.Id, creditOverview);
                    return true;

                case "reports:getDebtAging":
                    var debtAging = DatabaseService.Reports.GetDebtAgingReport();
                    response = BridgeResponse.Ok(request.Id, debtAging);
                    return true;

                case "reports:getCustomerBehavior":
                    string cbPeriod = "month";
                    string cbFrom = null;
                    string cbTo = null;
                    JObject cbObj = request.Payload as JObject;
                    if (cbObj != null)
                    {
                        if (cbObj["period"] != null) cbPeriod = cbObj["period"].ToString();
                        if (cbObj["fromDate"] != null) cbFrom = cbObj["fromDate"].ToString();
                        if (cbObj["toDate"] != null) cbTo = cbObj["toDate"].ToString();
                    }
                    var custBehavior = DatabaseService.Reports.GetCustomerBehavior(cbPeriod, cbFrom, cbTo);
                    response = BridgeResponse.Ok(request.Id, custBehavior);
                    return true;

                case "reports:getPaymentHistory":
                    string payPeriod = "month";
                    string payFrom = null;
                    string payTo = null;
                    string payCustId = null;
                    JObject payObj = request.Payload as JObject;
                    if (payObj != null)
                    {
                        if (payObj["period"] != null) payPeriod = payObj["period"].ToString();
                        if (payObj["fromDate"] != null) payFrom = payObj["fromDate"].ToString();
                        if (payObj["toDate"] != null) payTo = payObj["toDate"].ToString();
                        if (payObj["customerId"] != null) payCustId = payObj["customerId"].ToString();
                    }
                    var payHistory = DatabaseService.Reports.GetPaymentHistory(payPeriod, payFrom, payTo, payCustId);
                    response = BridgeResponse.Ok(request.Id, payHistory);
                    return true;

                case "reports:getHourlyIntensity":
                    string hrPeriod = "today";
                    string hrFrom = null;
                    string hrTo = null;
                    JObject hrObj = request.Payload as JObject;
                    if (hrObj != null)
                    {
                        if (hrObj["period"] != null) hrPeriod = hrObj["period"].ToString();
                        if (hrObj["fromDate"] != null) hrFrom = hrObj["fromDate"].ToString();
                        if (hrObj["toDate"] != null) hrTo = hrObj["toDate"].ToString();
                    }
                    var hourlyIntensity = DatabaseService.Reports.GetHourlyIntensityReport(hrPeriod, hrFrom, hrTo);
                    response = BridgeResponse.Ok(request.Id, hourlyIntensity);
                    return true;

                case "reports:getDeadStock":
                    int deadThreshold = 30;
                    JObject deadObj = request.Payload as JObject;
                    if (deadObj != null && deadObj["daysThreshold"] != null)
                    {
                        deadThreshold = deadObj["daysThreshold"].Value<int>();
                    }
                    var deadStock = DatabaseService.Reports.GetDeadStockReport(deadThreshold);
                    response = BridgeResponse.Ok(request.Id, deadStock);
                    return true;

                case "reports:getCashierPerformance":
                    string cpPeriod = "today";
                    string cpFrom = null;
                    string cpTo = null;
                    JObject cpObj = request.Payload as JObject;
                    if (cpObj != null)
                    {
                        if (cpObj["period"] != null) cpPeriod = cpObj["period"].ToString();
                        if (cpObj["fromDate"] != null) cpFrom = cpObj["fromDate"].ToString();
                        if (cpObj["toDate"] != null) cpTo = cpObj["toDate"].ToString();
                    }
                    var cashierPerf = DatabaseService.Reports.GetCashierPerformanceReport(cpPeriod, cpFrom, cpTo);
                    response = BridgeResponse.Ok(request.Id, cashierPerf);
                    return true;

                case "closing:getPreview":
                    string bDate = null;
                    JObject prevObj = request.Payload as JObject;
                    if (prevObj != null && prevObj["businessDate"] != null)
                    {
                        bDate = prevObj["businessDate"].ToString();
                    }
                    var closingPreview = DatabaseService.DailyClosing.GetClosingPreview(bDate);
                    response = BridgeResponse.Ok(request.Id, closingPreview);
                    return true;

                case "closing:save":
                    JObject savePayload = request.Payload as JObject;
                    if (savePayload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات إقفال اليومية فارغة");
                        return true;
                    }
                    DailyClosingSaveRequest saveReq = savePayload.ToObject<DailyClosingSaveRequest>();
                    var savedClosing = DatabaseService.DailyClosing.SaveClosing(saveReq);
                    response = BridgeResponse.Ok(request.Id, savedClosing);
                    return true;

                case "closing:getHistory":
                    int histLimit = 30;
                    JObject histObj = request.Payload as JObject;
                    if (histObj != null && histObj["limit"] != null)
                    {
                        histLimit = histObj["limit"].Value<int>();
                    }
                    var closingHistory = DatabaseService.DailyClosing.GetHistory(histLimit);
                    response = BridgeResponse.Ok(request.Id, closingHistory);
                    return true;

                case "closing:getById":
                    string closingTargetId = null;
                    JObject idObj = request.Payload as JObject;
                    if (idObj != null && idObj["id"] != null)
                    {
                        closingTargetId = idObj["id"].ToString();
                    }
                    var singleClosing = DatabaseService.DailyClosing.GetById(closingTargetId);
                    response = BridgeResponse.Ok(request.Id, singleClosing);
                    return true;

                case "closing:checkPreviousDay":
                    var prevDayAlert = DatabaseService.DailyClosing.CheckPreviousDayClosed();
                    response = BridgeResponse.Ok(request.Id, prevDayAlert);
                    return true;

                case "closing:print":
                    string printPName = null;
                    DailyClosing closingToPrint = null;
                    JObject printObj = request.Payload as JObject;
                    if (printObj != null)
                    {
                        if (printObj["printerName"] != null) printPName = printObj["printerName"].ToString();
                        if (printObj["closing"] != null)
                        {
                            var cObj = printObj["closing"] as JObject;
                            if (cObj != null)
                            {
                                closingToPrint = cObj.ToObject<DailyClosing>();
                            }
                        }
                        else if (printObj["closingId"] != null)
                        {
                            closingToPrint = DatabaseService.DailyClosing.GetById(printObj["closingId"].ToString());
                        }
                    }
                    if (closingToPrint == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "NOT_FOUND", "سجل الإقفال المطلوب طباعته غير موجود");
                        return true;
                    }
                    var printRes = DatabaseService.Printer.PrintDailyClosingReport(closingToPrint, printPName);
                    response = BridgeResponse.Ok(request.Id, printRes);
                    return true;

                case "audit:list":
                case "audit:getLogs":
                    int auditLimit = 100;
                    string auditAction = null;
                    JObject auditObj = request.Payload as JObject;
                    if (auditObj != null)
                    {
                        if (auditObj["limit"] != null) auditLimit = auditObj["limit"].Value<int>();
                        if (auditObj["action"] != null) auditAction = auditObj["action"].ToString();
                    }
                    var logs = DatabaseService.Audit.GetLogs(auditLimit, auditAction);
                    response = BridgeResponse.Ok(request.Id, logs);
                    return true;

                case "auditLogs:create":
                case "audit:create":
                    if (request.Payload != null)
                    {
                        JObject cObj = request.Payload as JObject;
                        if (cObj != null)
                        {
                            string cAction = cObj["action"] != null ? cObj["action"].ToString() : "GENERAL_AUDIT";
                            string cType = cObj["entityType"] != null ? cObj["entityType"].ToString() : "system";
                            string cId = cObj["entityId"] != null ? cObj["entityId"].ToString() : "";
                            string cDetails = cObj["detailsJson"] != null ? cObj["detailsJson"].ToString() : "";
                            string cUser = SecurityService.CurrentUser != null ? SecurityService.CurrentUser.Username : "usr_admin_default";
                            DatabaseService.Audit.Log(cAction, cType, cId, cDetails, cUser);
                        }
                    }
                    response = BridgeResponse.Ok(request.Id, true);
                    return true;

                case "audit:verifyChain":
                    var chainCheck = DatabaseService.Audit.VerifyChainIntegrity();
                    response = BridgeResponse.Ok(request.Id, chainCheck);
                    return true;

                case "audit:resealChain":
                    int resealedCount = DatabaseService.Audit.ResealChain();
                    var newCheck = DatabaseService.Audit.VerifyChainIntegrity();
                    response = BridgeResponse.Ok(request.Id, new { resealedCount = resealedCount, verification = newCheck });
                    return true;

                case "expenses:create":
                    JObject expPayload = request.Payload as JObject;
                    if (expPayload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات المصروف فارغة");
                        return true;
                    }
                    CreateExpenseRequest expReq = expPayload.ToObject<CreateExpenseRequest>();
                    var createdExp = DatabaseService.Expenses.CreateExpense(expReq);
                    response = BridgeResponse.Ok(request.Id, createdExp);
                    return true;

                case "expenses:getToday":
                    string expDate = null;
                    JObject expDateObj = request.Payload as JObject;
                    if (expDateObj != null && expDateObj["businessDate"] != null)
                    {
                        expDate = expDateObj["businessDate"].ToString();
                    }
                    var todayExpenses = DatabaseService.Expenses.GetExpenses(expDate);
                    response = BridgeResponse.Ok(request.Id, todayExpenses);
                    return true;

                case "expenses:getRecent":
                    int expLimit = 50;
                    JObject expLimitObj = request.Payload as JObject;
                    if (expLimitObj != null && expLimitObj["limit"] != null)
                    {
                        expLimit = expLimitObj["limit"].Value<int>();
                    }
                    var recentExpenses = DatabaseService.Expenses.GetRecentExpenses(expLimit);
                    response = BridgeResponse.Ok(request.Id, recentExpenses);
                    return true;

                default:
                    return false;
            }
        }
    }
}
