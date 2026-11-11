using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Text.RegularExpressions;
using NUnit.Framework;
using RafiqPOS.Bridge;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// كل أمر له case في IpcDispatcher*.cs يجب أن يكون مسجلاً في ACTION_PERMISSIONS أو PUBLIC_ACTIONS،
    /// وإلا ترفضه بوابة الصلاحيات (default-deny) للجميع ويصبح ميتاً.
    /// </summary>
    [TestFixture]
    public class S97_CommandRegistryCompletenessTest
    {
        // Real exceptions: none. Anything listed here must carry a comment explaining why it is handled without a registry entry.
        private static readonly HashSet<string> UnregisteredByDesign = new HashSet<string>(StringComparer.Ordinal);

        private static string FindBridgeFolder()
        {
            string dir = AppDomain.CurrentDomain.BaseDirectory;
            for (int i = 0; i < 8 && !string.IsNullOrEmpty(dir); i++)
            {
                string candidate = Path.Combine(dir, "Bridge");
                if (File.Exists(Path.Combine(candidate, "IpcDispatcher.cs"))) return candidate;
                candidate = Path.Combine(Path.Combine(dir, "desktop"), "Bridge");
                if (File.Exists(Path.Combine(candidate, "IpcDispatcher.cs"))) return candidate;
                dir = Path.GetDirectoryName(dir);
            }
            return null;
        }

        private static HashSet<string> RegisteredActions()
        {
            var registered = new HashSet<string>(StringComparer.Ordinal);

            FieldInfo permissions = typeof(IpcDispatcher).GetField("ACTION_PERMISSIONS", BindingFlags.NonPublic | BindingFlags.Static);
            Assert.IsNotNull(permissions, "ACTION_PERMISSIONS");
            foreach (KeyValuePair<string, string> entry in (Dictionary<string, string>)permissions.GetValue(null))
            {
                registered.Add(entry.Key);
            }

            FieldInfo publicActions = typeof(IpcDispatcher).GetField("PUBLIC_ACTIONS", BindingFlags.NonPublic | BindingFlags.Static);
            Assert.IsNotNull(publicActions, "PUBLIC_ACTIONS");
            foreach (string action in (HashSet<string>)publicActions.GetValue(null))
            {
                registered.Add(action);
            }
            return registered;
        }

        [Test]
        public void EveryDispatcherCaseLabel_IsRegisteredForAuthorization()
        {
            string bridge = FindBridgeFolder();
            if (bridge == null) Assert.Ignore("مجلد Bridge غير متاح بجانب مخرجات الاختبار");

            HashSet<string> registered = RegisteredActions();
            var labels = new SortedSet<string>(StringComparer.Ordinal);
            Regex caseLabel = new Regex("case \"([A-Za-z0-9_]+[:.][A-Za-z0-9_]+)\":");
            string[] files = Directory.GetFiles(bridge, "IpcDispatcher*.cs");
            Assert.Greater(files.Length, 10, "ملفات المرسل");
            for (int f = 0; f < files.Length; f++)
            {
                foreach (Match m in caseLabel.Matches(File.ReadAllText(files[f])))
                {
                    labels.Add(m.Groups[1].Value);
                }
            }
            Assert.Greater(labels.Count, 400, "عدد الأوامر المقروءة");

            var missing = new List<string>();
            foreach (string label in labels)
            {
                if (!registered.Contains(label) && !UnregisteredByDesign.Contains(label)) missing.Add(label);
            }
            Assert.IsEmpty(missing, "أوامر بلا تسجيل في ACTION_PERMISSIONS/PUBLIC_ACTIONS: " + string.Join(", ", missing.ToArray()));
        }

        [Test]
        public void AutoCloseShifts_UsesTheDailyClosingPermission()
        {
            FieldInfo permissions = typeof(IpcDispatcher).GetField("ACTION_PERMISSIONS", BindingFlags.NonPublic | BindingFlags.Static);
            var table = (Dictionary<string, string>)permissions.GetValue(null);
            Assert.AreEqual("reports.daily_closing", table["closing:autoCloseShifts"]);
            Assert.AreEqual(table["closing:save"], table["closing:autoCloseShifts"]);
        }
    }
}
