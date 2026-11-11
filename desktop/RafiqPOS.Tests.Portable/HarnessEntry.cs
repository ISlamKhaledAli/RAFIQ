using System;
using System.IO;
using System.Reflection;

namespace RafiqPOS.Tests.Portable
{
    /// <summary>
    /// Entry point of the portable assembly. Under "dotnet test" it is never used; the self-test wrapper (SelfTestRunnersTest) starts a child
    /// process "dotnet RafiqPOS.Tests.Portable.dll --selftest-dir &lt;work dir&gt; --run-xyz-tests" which runs the real host Main (desktop/Program.cs)
    /// with the base directory redirected to a private work folder, exactly like CI runs each suite from a clean copy of bin/Debug.
    /// </summary>
    public static class HarnessEntry
    {
        public static int Main(string[] args)
        {
            if (args.Length < 3 || args[0] != "--selftest-dir")
            {
                Console.Error.WriteLine("usage: RafiqPOS.Tests.Portable --selftest-dir <dir> --run-<suite>-tests [args]");
                return 64;
            }
            // Same switch as the NUnit side (RafiqPOS.Tests.TestMode): the in-app suites run encrypted unless RAFIQ_TEST_PLAIN=1
            if (Environment.GetEnvironmentVariable("RAFIQ_TEST_PLAIN") == "1") RafiqPOS.Data.DatabaseKeyProvider.DisableDefaultEncryption();
            string workDir = args[1];
            Directory.CreateDirectory(workDir);
            AppDomain.CurrentDomain.SetData("APP_CONTEXT_BASE_DIRECTORY", workDir + Path.DirectorySeparatorChar);

            string[] hostArgs = new string[args.Length - 2];
            Array.Copy(args, 2, hostArgs, 0, hostArgs.Length);

            MethodInfo main = typeof(RafiqPOS.MainForm).Assembly.GetType("RafiqPOS.Program").GetMethod("Main", BindingFlags.NonPublic | BindingFlags.Static);
            main.Invoke(null, new object[] { hostArgs });
            // Program.Main returns without Environment.Exit only for unknown flags
            return 3;
        }
    }
}
