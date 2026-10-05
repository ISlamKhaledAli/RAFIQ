using System;
using System.Collections.Generic;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Bridge
{
    public partial class IpcDispatcher
    {
        private static bool TryDispatchExcel(BridgeRequest request, out BridgeResponse response)
        {
            response = null;
            switch (request.Action)
            {
                case "excel:getTemplate":
                    string tplBase64 = DatabaseService.Excel.GenerateProductTemplateBase64();
                    response = BridgeResponse.Ok(request.Id, new
                    {
                        success = true,
                        fileName = "قالب_استيراد_المنتجات_رفيق_POS.xlsx",
                        base64 = tplBase64
                    });
                    return true;

                case "excel:exportProducts":
                    var prodsToExport = DatabaseService.ProductRepo.GetAllForExport();
                    var cats = DatabaseService.CategoryRepo.GetAll(true);
                    var catDict = new Dictionary<string, string>();
                    if (cats != null)
                    {
                        foreach (var c in cats)
                        {
                            if (!string.IsNullOrEmpty(c.Id)) catDict[c.Id] = c.Name;
                        }
                    }
                    string expBase64 = DatabaseService.Excel.ExportProductsBase64(prodsToExport, catDict);
                    string exportFileName = string.Format("كتالوج_أصناف_رفيق_{0}.xlsx", DateTime.Now.ToString("yyyyMMdd_HHmm"));
                    response = BridgeResponse.Ok(request.Id, new
                    {
                        success = true,
                        fileName = exportFileName,
                        base64 = expBase64,
                        count = prodsToExport.Count
                    });
                    return true;

                case "excel:exportCustomers":
                    var custsToExport = DatabaseService.CustomerRepo.GetAll(50000);
                    string expCustBase64 = DatabaseService.Excel.ExportCustomersBase64(custsToExport);

                    string custExportFileName = string.Format("سجل_عملاء_رفيق_{0}.xlsx", DateTime.Now.ToString("yyyyMMdd_HHmm"));
                    response = BridgeResponse.Ok(request.Id, new
                    {
                        success = true,
                        fileName = custExportFileName,
                        base64 = expCustBase64,
                        count = custsToExport.Count
                    });
                    return true;

                case "excel:getCustomerTemplate":
                    string custTplBase64 = DatabaseService.Excel.GenerateCustomerTemplateBase64();
                    response = BridgeResponse.Ok(request.Id, new
                    {
                        success = true,
                        fileName = "قالب_استيراد_العملاء_رفيق_POS.xlsx",
                        base64 = custTplBase64
                    });
                    return true;

                case "excel:previewCustomerImport":
                    string pBase64 = "";
                    JObject prevCustObj = request.Payload as JObject;
                    if (prevCustObj != null && prevCustObj["base64"] != null) pBase64 = prevCustObj["base64"].ToString();
                    else if (request.Payload != null) pBase64 = request.Payload.ToString().Trim('"', ' ');
                    var previewResult = DatabaseService.Excel.ParseCustomerImportBase64(pBase64, DatabaseService.CustomerRepo);
                    response = BridgeResponse.Ok(request.Id, previewResult);
                    return true;

                case "excel:importCustomers":
                    if (request.Payload == null)
                    {
                        response = BridgeResponse.Fail(request.Id, "INVALID_PAYLOAD", "بيانات الاستيراد فارغة");
                        return true;
                    }
                    List<CustomerImportRow> rowsToImport = null;
                    JObject impCustObj = request.Payload as JObject;
                    if (impCustObj != null && impCustObj["rows"] != null)
                    {
                        rowsToImport = impCustObj["rows"].ToObject<List<CustomerImportRow>>();
                    }
                    else
                    {
                        rowsToImport = JsonConvert.DeserializeObject<List<CustomerImportRow>>(request.Payload.ToString());
                    }
                    var custImportResult = DatabaseService.Customers.BatchImportCustomers(rowsToImport);
                    response = BridgeResponse.Ok(request.Id, custImportResult);
                    return true;

                case "excel:exportFullStore":
                    string targetDir = null;
                    if (request.Payload != null)
                    {
                        var pObj = request.Payload as JObject;
                        if (pObj != null && pObj["targetFolder"] != null)
                        {
                            targetDir = pObj["targetFolder"].ToString();
                        }
                        else if (request.Payload is string)
                        {
                            targetDir = request.Payload.ToString();
                        }
                    }
                    var fullStoreExportResult = DatabaseService.Excel.ExportFullStoreData(targetDir);
                    response = BridgeResponse.Ok(request.Id, fullStoreExportResult);
                    return true;

                case "excel:browseExportFolder":
                    string chosenFolder = null;
                    var browseExportThread = new System.Threading.Thread(delegate()
                    {
                        using (var fbd = new System.Windows.Forms.FolderBrowserDialog())
                        {
                            fbd.Description = "اختر المجلد أو الفلاشة لحفظ ملفات التصدير الشاملة";
                            if (fbd.ShowDialog() == System.Windows.Forms.DialogResult.OK)
                            {
                                chosenFolder = fbd.SelectedPath;
                            }
                        }
                    });
                    browseExportThread.SetApartmentState(System.Threading.ApartmentState.STA);
                    browseExportThread.Start();
                    browseExportThread.Join();
                    response = BridgeResponse.Ok(request.Id, new { selectedFolder = chosenFolder, cancelled = string.IsNullOrEmpty(chosenFolder) });
                    return true;

                case "excel:openExportFolder":
                    string openDir = null;
                    if (request.Payload != null)
                    {
                        var pObj = request.Payload as JObject;
                        if (pObj != null && pObj["folderPath"] != null)
                        {
                            openDir = pObj["folderPath"].ToString();
                        }
                        else if (request.Payload is string)
                        {
                            openDir = request.Payload.ToString();
                        }
                    }
                    if (!string.IsNullOrEmpty(openDir) && System.IO.Directory.Exists(openDir))
                    {
                        System.Diagnostics.Process.Start("explorer.exe", openDir);
                        response = BridgeResponse.Ok(request.Id, new { success = true });
                    }
                    else
                    {
                        response = BridgeResponse.Fail(request.Id, "FOLDER_NOT_FOUND", "المجلد المحدد غير موجود");
                    }
                    return true;

                case "excel:runExportTests":
                    var testRes = FullStoreExportTestRunner.RunAllTests();
                    response = BridgeResponse.Ok(request.Id, testRes);
                    return true;

                default:
                    return false;
            }
        }
    }
}
