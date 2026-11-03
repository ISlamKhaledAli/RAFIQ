// Provider-adapted production-source counterexamples; this does not certify Windows System.Data.SQLite.
using System;
using System.CodeDom.Compiler;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Microsoft.CSharp;

public static class WalletMoneyProbe
{
    public static int Main(string[] args)
    {
        if (args.Length != 2) throw new ArgumentException("Expected current repository root and original baseline root.");
        string root = Path.GetFullPath(args[0]);
        string baseline = Path.GetFullPath(args[1]);
        int before = Run(baseline, root, "BASELINE");
        int after = Run(root, root, "CANDIDATE");
        Console.WriteLine("Counterexamples: baseline failures={0}; candidate failures={1}", before, after);
        return before >= 6 && after == 0 ? 0 : 1;
    }

    private static int Run(string sourceRoot, string schemaRoot, string label)
    {
        string[] paths = {
            "desktop/Repositories/DigitalAccountRepository.cs", "desktop/Repositories/EpayRepository.cs",
            "desktop/Models/DigitalAccountModels.cs", "desktop/Models/EpayModels.cs", "desktop/Models/User.cs",
            "desktop/Models/AuditLog.cs", "desktop/Services/BusinessDayHelper.cs", "desktop/Services/DrawerCashCalculator.cs",
            "desktop/Common/IdempotencyGuard.cs", "desktop/Common/Money.cs",
            "desktop/Bridge/IpcDispatcher.Wallets.cs", "desktop/Bridge/IpcDispatcher.Epay.cs", "desktop/Bridge/BridgeModels.cs"
        };
        var sources = new List<string>();
        foreach (string path in paths)
            sources.Add(File.ReadAllText(Path.Combine(sourceRoot, path))
                .Replace("System.Data.SQLite", "Mono.Data.Sqlite").Replace("SQLite", "Sqlite"));
        foreach (string path in new[] { "desktop/Models/RequestAdmission.cs", "desktop/Services/ProductWritePolicy.cs",
            "desktop/Models/Product.cs", "desktop/Models/ProductUnit.cs", "desktop/Models/ProductVariant.cs",
            "desktop/Common/CompoundStockHelper.cs" })
            sources.Add(File.ReadAllText(Path.Combine(schemaRoot, path)));
        sources.Add(File.ReadAllText(Path.Combine(schemaRoot, "desktop/RafiqPOS.Tests/Portable/WalletMoneyProbeCases.cs")));
        using (var compiler = new CSharpCodeProvider())
        {
            var options = new CompilerParameters
            {
                GenerateInMemory = true, CompilerOptions = "-langversion:5" + (label == "BASELINE" ? " -define:BASELINE" : "")
            };
            foreach (string reference in new[] { "System.dll", "System.Core.dll", "System.Data.dll", "Mono.Data.Sqlite.dll",
                Path.Combine(schemaRoot, "desktop/packages/Newtonsoft.Json.13.0.3/lib/net45/Newtonsoft.Json.dll") })
                options.ReferencedAssemblies.Add(reference);
            CompilerResults result = compiler.CompileAssemblyFromSource(options, sources.ToArray());
            if (result.Errors.HasErrors)
                throw new InvalidOperationException(string.Join(Environment.NewLine, result.Errors.Cast<CompilerError>().Select(e => e.ToString())));
            return (int)result.CompiledAssembly.GetType("WalletMoneyProbeCases").GetMethod("Run").Invoke(null, new object[] { schemaRoot, label });
        }
    }
}
