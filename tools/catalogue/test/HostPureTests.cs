using System;
using System.Collections.Generic;
using System.IO;
using ClosedXML.Excel;
using Newtonsoft.Json.Linq;
using RafiqPOS.Models;
using RafiqPOS.Services;
using RafiqPOS.Repositories;

public static class HostPureTests
{
    private static int assertions;
    private static void Check(bool success, string message)
    {
        assertions++;
        if (!success) throw new Exception(message);
    }

    private static void Reject(Action action)
    {
        bool rejected = false;
        try { action(); } catch (InvalidOperationException) { rejected = true; }
        Check(rejected, "Expected rejection");
    }

    private static void RejectBelowCost(Action action)
    {
        bool rejected = false;
        try { action(); } catch (BelowCostPriceException) { rejected = true; }
        Check(rejected, "Expected the existing Task 17-1 below-cost warning");
    }

    public static void Main()
    {
        foreach (string code in new[] { "96385074", "036000291452", "0737628064502", "10012345000017" })
            Check(CatalogueReferenceService.GtinKey(code) != null, "GTIN length/checksum: " + code);
        foreach (string code in new[] { "96385075", "036000291453", "0737628064503", "10012345000018", "3.6e10", " 96385074" })
            Check(CatalogueReferenceService.GtinKey(code) == null, "Invalid GTIN: " + code);
        Check(CatalogueReferenceService.GtinKey("036000291452") == CatalogueReferenceService.GtinKey("0036000291452"), "UPC/EAN equivalence");
        var record = new CatalogueRecord { RecordId = "off:036000291452", Gtin = "036000291452", PackDescription = "250 g" };
        var selection = new CatalogueSelection { RecordId = record.RecordId, ConfirmedBarcode = record.Gtin,
            ConfirmedPack = "250 g", IdentityConfirmed = true, PricesConfirmed = true, CategoryId = "category",
            SalePricePiasters = 1234, CostPiasters = 0 };
        Reject(delegate { CatalogueReferenceService.ValidateSelection(selection, record); });
        selection.ZeroCostConfirmed = true;
        CatalogueReferenceService.ValidateSelection(selection, record);
        selection.CostPiasters = null;
        Reject(delegate { CatalogueReferenceService.ValidateSelection(selection, record); });
        selection.CostPiasters = 100;
        selection.ConfirmedBarcode = "0036000291452";
        Reject(delegate { CatalogueReferenceService.ValidateSelection(selection, record); });
        selection.ConfirmedBarcode = record.Gtin;
        selection.CostPiasters = 2000;
        bool lossRejected = false;
        try { CatalogueReferenceService.ValidateSelection(selection, record); }
        catch (BelowCostPriceException) { lossRejected = true; }
        Check(lossRejected, "Below-cost price needs its own Task 17-1 confirmation");
        Check(!selection.BelowCostConfirmed, "Loss confirmation defaults to false");
        var fingerprintRequest = new CatalogueRequest { DatasetSha256 = new string('a', 64),
            Selections = new List<CatalogueSelection> { selection } };
        string unconfirmedHash = CatalogueReferenceService.Fingerprint(fingerprintRequest, "actor");
        selection.BelowCostConfirmed = true;
        CatalogueReferenceService.ValidateSelection(selection, record);
        Check(CatalogueReferenceService.Fingerprint(fingerprintRequest, "actor") != unconfirmedHash, "Loss flag must affect the request/preview fingerprint");
        Check(selection.SalePricePiasters == 1234 && selection.CostPiasters == 2000, "Specific approval never changes merchant prices");
        selection.BelowCostConfirmed = false;
        selection.CostPiasters = 100;
        JObject payload = JObject.Parse(@"{'datasetSha256':'abc','selections':[{
            'recordId':'off:036000291452','confirmedBarcode':'036000291452','confirmedPack':'250 g',
            'identityConfirmed':true,'pricesConfirmed':true,'zeroCostConfirmed':false,
            'salePricePiasters':1234,'costPiasters':100,'categoryId':'category'}]}");
        CatalogueReferenceService.ValidateRequestTokens(payload);
        Check(!payload.ToObject<CatalogueRequest>().Selections[0].BelowCostConfirmed, "An omitted loss flag deserializes as false");
        payload["selections"][0]["belowCostConfirmed"] = "true";
        Reject(delegate { CatalogueReferenceService.ValidateRequestTokens(payload); });
        payload["selections"][0]["belowCostConfirmed"] = true;
        CatalogueReferenceService.ValidateRequestTokens(payload);
        payload["selections"][0]["salePricePiasters"] = 1.5;
        Reject(delegate { CatalogueReferenceService.ValidateRequestTokens(payload); });
        payload["selections"][0]["salePricePiasters"] = "1234";
        Reject(delegate { CatalogueReferenceService.ValidateRequestTokens(payload); });
        payload["selections"][0]["salePricePiasters"] = 1234;
        payload["selections"][0]["stock"] = 100;
        Reject(delegate { CatalogueReferenceService.ValidateRequestTokens(payload); });
        Check(CatalogueReferenceService.Canonical(JObject.Parse("{'b':1,'a':{'z':2,'y':3}}")) ==
            CatalogueReferenceService.Canonical(JObject.Parse("{'a':{'y':3,'z':2},'b':1}")), "Canonical order");
        Reject(delegate { new StoreTemplateService(null, null, null, null, null).SeedProductsForTemplate("supermarket"); });
        byte[] bytes = Convert.FromBase64String(new ExcelService().GenerateProductTemplateBase64());
        using (var workbook = new XLWorkbook(new MemoryStream(bytes)))
        {
            Check(workbook.Worksheets.Count == 2, "Native blank template sheet count");
            Check(workbook.Worksheet(1).LastRowUsed().RowNumber() == 1, "Native template headers only");
            foreach (var sheet in workbook.Worksheets)
            foreach (var cell in sheet.CellsUsed())
            {
                Check(!cell.HasFormula, "No native template formula");
                Check(cell.DataType == XLDataType.Text, "No native sample numeric values");
            }
        }
        string packPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "dist", "catalogue");
        if (File.Exists(Path.Combine(packPath, "manifest.json")))
        {
            var service = new CatalogueReferenceService(new ProductRepository("not-a-database"));
            JObject page = JObject.FromObject(service.GetReference(1, 10, "", ""));
            Check(((JArray)page["records"]).Count > 0 && ((JArray)page["records"]).Count <= 10, "Host local pagination");
            CatalogueRecord actualRecord = page["records"][0].ToObject<CatalogueRecord>();
            var unconfirmedLoss = new CatalogueRequest {
                DatasetSha256 = (string)page["manifest"]["datasetSha256"], ConfirmApply = true,
                AttemptId = Guid.NewGuid().ToString(), ExpectedPreviewHash = new string('a', 64),
                Selections = new List<CatalogueSelection> { new CatalogueSelection {
                    RecordId = actualRecord.RecordId, ConfirmedBarcode = actualRecord.Gtin,
                    ConfirmedPack = actualRecord.PackDescription, IdentityConfirmed = true, PricesConfirmed = true,
                    SalePricePiasters = 100, CostPiasters = 200, CategoryId = "unused-before-database"
                } }
            };
            RejectBelowCost(delegate { service.Preview(unconfirmedLoss, "actor"); });
            RejectBelowCost(delegate { service.Apply(unconfirmedLoss, "actor"); });
            Reject(delegate { service.GetReference(0, 10, "", ""); });
            JObject inventory = JObject.Parse(File.ReadAllText(Path.Combine(packPath, "legacy-quarantine.json")));
            var row = inventory["knownRows"][0];
            BatchImportRequest overlapping = service.ValidateMerchantImport(JObject.FromObject(new {
                items = new[] { new { barcode = (string)row["barcode"], name = (string)row["name"] } }
            }));
            Check(overlapping.Items.Count == 1 && overlapping.Items[0].Barcode == (string)row["barcode"], "Identity overlap is not origin evidence");
            Reject(delegate { service.ValidateMerchantImport(JObject.Parse("{'items':[{'recordId':'off:123','gtin14Key':'00000000000123'}]}")); });
            service.ValidateMerchantImport(JObject.Parse("{'items':[{'barcode':'merchant-sku','name':'Merchant item','pricePiasters':1234}]}"));
            string path = Path.Combine(packPath, "reference.json");
            byte[] original = File.ReadAllBytes(path);
            try
            {
                File.AppendAllText(path, " ");
                Reject(delegate { new CatalogueReferenceService(new ProductRepository("not-a-database")); });
            }
            finally { File.WriteAllBytes(path, original); }
            path = Path.Combine(packPath, "manifest.json");
            original = File.ReadAllBytes(path);
            try
            {
                File.AppendAllText(path, " ");
                Reject(delegate { new CatalogueReferenceService(new ProductRepository("not-a-database")); });
            }
            finally { File.WriteAllBytes(path, original); }
        }
        Console.WriteLine("Passed " + assertions + " production-host pure assertions (no SQLite/provider execution).");
    }
}
