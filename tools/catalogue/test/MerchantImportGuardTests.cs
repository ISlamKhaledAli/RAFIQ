using System;
using System.IO;
using System.Reflection;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using RafiqPOS.Bridge;
using RafiqPOS.Models;
using RafiqPOS.Repositories;
using RafiqPOS.Services;

public static class MerchantImportGuardTests
{
    private static int passed;
    private static int failed;

    private static void Check(bool success, string message)
    {
        if (!success) throw new Exception(message);
    }

    private static void Test(string name, Action test)
    {
        try { test(); passed++; Console.WriteLine("PASS merchant guard: " + name); }
        catch (Exception ex) { failed++; Console.WriteLine("FAIL merchant guard: " + name + " — " + ex.Message); }
    }

    private static BridgeRequest Request(object payload)
    {
        return new BridgeRequest { Id = Guid.NewGuid().ToString(), Action = "products:importBatch", Payload = payload };
    }

    private static bool Gate(BridgeRequest request, out BridgeResponse response)
    {
        MethodInfo method = typeof(IpcDispatcher).GetMethod("TryRejectCatalogueMerchantImport", BindingFlags.Static | BindingFlags.NonPublic);
        object[] arguments = { request, null };
        bool rejected = (bool)method.Invoke(null, arguments);
        response = arguments[1] as BridgeResponse;
        return rejected;
    }

    private static void Rejected(object payload)
    {
        BridgeResponse response;
        Check(Gate(Request(payload), out response), "Guard accepted a forbidden/ambiguous payload");
        Check(response != null && !response.Success && response.Error != null, "Rejection must be explicit");
    }

    public static void Main()
    {
        PropertyInfo property = typeof(DatabaseService).GetProperty("ProductRepo", BindingFlags.Public | BindingFlags.Static);
        object original = property.GetValue(null, null);
        MethodInfo setter = property.GetSetMethod(true);
        setter.Invoke(null, new object[] { new ProductRepository("not-a-database") });
        try
        {
            Test("JSON string wrapper", delegate { Rejected("{\"items\":[{\"recordId\":\"off:123\"}]}"); });
            Test("JValue JSON string wrapper", delegate { Rejected(new JValue("{\"items\":[{\"recordId\":\"off:123\"}]}")); });
            Test("null payload", delegate { Rejected(null); });
            Test("array payload", delegate { Rejected(new JArray()); });
            Test("uppercase Items", delegate { Rejected(JObject.Parse("{'Items':[{'recordId':'off:123'}]}")); });
            Test("top-level case alias collision", delegate { Rejected(JObject.Parse("{'items':[{'name':'Merchant'}],'Items':[{'RecordId':'off:123'}]}")); });
            Test("nested case alias collision", delegate { Rejected(JObject.Parse("{'items':[{'name':'Merchant','Name':'Other'}]}")); });
            Test("nested uppercase reference marker", delegate { Rejected(JObject.Parse("{'items':[{'RecordId':'off:123','name':'Merchant'}]}")); });
            Test("nested uppercase merchant field", delegate { Rejected(JObject.Parse("{'items':[{'Name':'Merchant','barcode':'sku'}]}")); });
            Test("root explicit reference marker", delegate { Rejected(JObject.Parse("{'datasetSha256':'abc','items':[{'name':'Merchant'}]}")); });
            Test("nested explicit reference packet", delegate { Rejected(JObject.Parse("{'items':[{'name':'Merchant','recordId':'off:123','gtin14Key':'00000000000123','provenance':{'source':'openfoodfacts'}}]}")); });
            Test("uppercase provenance", delegate { Rejected(JObject.Parse("{'items':[{'name':'Merchant','Provenance':{'source':'openfoodfacts'}}]}")); });
            Test("string-wrapped items", delegate { Rejected(JObject.Parse("{'items':'[{\"recordId\":\"off:123\"}]'}")); });
            Test("malformed nested row", delegate { Rejected(JObject.Parse("{'items':['{\"name\":\"Merchant\"}']}")); });
            Test("unknown nested fields are not stripped silently", delegate { Rejected(JObject.Parse("{'items':[{'name':'Merchant','metadata':{'recordId':'off:123'}}]}")); });

            string directory = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "dist", "catalogue");
            JObject inventory = JObject.Parse(File.ReadAllText(Path.Combine(directory, "legacy-quarantine.json")));
            string knownHash = (string)inventory["artifacts"][0]["sha256"];
            Test("exact quarantined artifact digest", delegate {
                Rejected(JObject.Parse("{'items':[{'name':'Merchant'}],'sourceFileSha256':'" + knownHash + "'}"));
            });
            Test("uppercase artifact digest alias", delegate {
                Rejected(JObject.Parse("{'items':[{'name':'Merchant'}],'SourceFileSha256':'" + knownHash + "'}"));
            });
            Test("identity overlap with real merchant prices is allowed and forwards the same typed values", delegate {
                BridgeRequest request = Request(JObject.Parse(@"{'items':[{'name':'ريد بول مشروب طاقة 250 ml',
                    'barcode':'90162602','pricePiasters':7925,'costPiasters':6311}],'duplicateStrategy':'skip'}"));
                BridgeResponse response;
                Check(!Gate(request, out response) && response == null, "Ordinary merchant identity overlap was blocked");
                Check(request.Payload is JObject, "Downstream must receive an object, not a string");
                var typed = JsonConvert.DeserializeObject<BatchImportRequest>(request.Payload.ToString());
                Check(typed.Items.Count == 1 && typed.Items[0].Barcode == "90162602", "Downstream rows differ");
                Check(typed.Items[0].PricePiasters == 7925 && typed.Items[0].CostPiasters == 6311, "Merchant money was changed");
                Check(typed.Items[0].StockQuantityMilli == null, "Missing stock must stay absent");
            });
            Test("unrecognized file digest is not treated as proof of legacy origin", delegate {
                BridgeResponse response;
                BridgeRequest request = Request(JObject.Parse("{'items':[{'name':'Merchant','barcode':'0036000291452'}],'sourceFileSha256':'"
                    + new string('a', 64) + "'}"));
                Check(!Gate(request, out response), "Unknown digest was blocked");
                var canonical = request.Payload as JObject;
                Check(canonical != null && canonical["sourceFileSha256"] == null &&
                    canonical["duplicateStrategy"] != null, "Forwarded contract must be the validated DTO serialization");
                var typed = JsonConvert.DeserializeObject<BatchImportRequest>(canonical.ToString());
                Check(typed.Items[0].Barcode == "0036000291452", "Canonical forwarding lost leading zeros");
            });
        }
        finally { setter.Invoke(null, new object[] { original }); }
        Console.WriteLine("Merchant guard: " + passed + " passed, " + failed + " failed; production IPC guard, no SQLite/provider execution.");
        if (failed != 0) Environment.Exit(1);
    }
}
