using System;
using System.Collections.Generic;
using System.Reflection;
using NUnit.Framework;
using RafiqPOS.Bridge;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// بوابة الترخيص المنتهي: رفض افتراضي لأي إجراء يعدّل البيانات، مع قائمة سماح صريحة (قراءة، دخول وترخيص،
    /// نسخ وتصدير، إعادة طباعة مستندات قائمة، إغلاق الوردية والإغلاق اليومي).
    /// </summary>
    [TestFixture]
    public class S92_ExpiredLicenseGateTest
    {
        private static bool IsBlocked(string action)
        {
            MethodInfo method = typeof(IpcDispatcher).GetMethod("IsLicenseBlockedAction", BindingFlags.NonPublic | BindingFlags.Static);
            Assert.IsNotNull(method, "IsLicenseBlockedAction غير موجودة");
            return (bool)method.Invoke(null, new object[] { action });
        }

        private static Dictionary<string, string> ActionTable()
        {
            FieldInfo field = typeof(IpcDispatcher).GetField("ACTION_PERMISSIONS", BindingFlags.NonPublic | BindingFlags.Static);
            Assert.IsNotNull(field, "ACTION_PERMISSIONS غير موجود");
            return (Dictionary<string, string>)field.GetValue(null);
        }

        [Test]
        public void RealMutations_AreBlocked_IncludingTheOnesTheOldBlocklistMissed()
        {
            string[] mutations = new string[]
            {
                // The old list named inventory:adjust / inventory:transfer, which are not real commands
                "inventory:adjustStock", "inventory:recalculate", "inventory:recordPurchase",
                "sales:create", "sales:hold", "sales:cancel", "returns:create",
                "purchases:create", "purchases:createReturn", "expenses:create", "expenses:cancel",
                "customers:save", "customers:recordPayment", "suppliers:recordPayment",
                "products:save", "products:delete", "products:importBatch", "products:applyBulkPriceAdjustment",
                "batch:adjust", "batch:disposeExpired", "variants:createMatrix",
                "shifts:open", "shifts:cashIn", "drawer:cashIn",
                "wallets:processTransaction", "epay:createTransaction",
                "pharma:saveControlledDispense", "pharma:writeOffExpiredBatches", "prescriptions:save",
                "users:create", "users:updatePermissions", "settings:updateBatch", "features:set",
                "database:restore", "migration:restore", "system:factoryReset", "demo:load",
                "audit:resealChain", "license:runTests", "security:runTests",
                "tables:open", "recipes:produce", "delivery:settleRider", "insurance:settleBatch"
            };

            for (int i = 0; i < mutations.Length; i++)
            {
                Assert.IsTrue(IsBlocked(mutations[i]), mutations[i] + " يجب أن يُحظر عند انتهاء الترخيص");
            }
        }

        [Test]
        public void DotAliases_AreNormalizedAndBlocked()
        {
            Assert.IsTrue(IsBlocked("tables.save"));
            Assert.IsTrue(IsBlocked("recipes.produce"));
            Assert.IsFalse(IsBlocked("recipes.getAll"));
        }

        [Test]
        public void UnknownAndFutureActions_AreBlockedByDefault()
        {
            Assert.IsTrue(IsBlocked("brandNew:doSomething"));
            Assert.IsTrue(IsBlocked("brandNew.doSomething"));
            Assert.IsTrue(IsBlocked("noNamespaceAction"));
            Assert.IsTrue(IsBlocked(""));
            Assert.IsTrue(IsBlocked(null));
        }

        [Test]
        public void ReadOnlyAndRecoveryActions_StayAllowed()
        {
            string[] allowed = new string[]
            {
                "auth:login", "auth:loginRootChallenge", "auth:logout", "auth:getCurrentUser",
                "license:activate", "license:activateSupportCode", "license:getStatus", "license:checkExpiry", "license:verify",
                "reports:getTodaySummary", "sales:getRecent", "sales:getById", "products:search", "products:getAll",
                "customers:getAll", "inventory:getMovements", "audit:getLogs", "audit:verifyChain",
                "backup:create", "backup:getStatus", "migration:export", "excel:exportFullStore", "excel:exportProducts",
                "printer:printReceipt", "returns:printReceipt", "closing:print", "report:savePdf",
                "shifts:close", "closing:save", "shifts:getActive",
                "support:createBundle", "support:getSystemInfo", "system:getInfo", "system:ping",
                "security:resetWithRecovery", "security:setPin", "users:changePin",
                "window:minimize", "window:close"
            };

            for (int i = 0; i < allowed.Length; i++)
            {
                Assert.IsFalse(IsBlocked(allowed[i]), allowed[i] + " يجب أن يبقى مسموحاً أثناء انتهاء الترخيص");
            }
        }

        [Test]
        public void ReadVerbNames_ThatContainAMutatingWord_AreBlocked()
        {
            string[] blocked = new string[]
            {
                "x:getAndSave", "x:getOrCreate", "x:previewImport", "x:checkReset", "x:findAndDelete", "x:getRunReport",
                "x:verifyAndApply", "x:getIsOpen", "x:listAndClose", "x:searchAndAssign", "x:getAdjustStock", "x:checkPay",
                "x:getAndRestore", "x:calculateAndSettle", "x:getVoidReasons", "x:hasTransfer", "x:getFundTotals"
            };
            for (int i = 0; i < blocked.Length; i++)
            {
                Assert.IsTrue(IsBlocked(blocked[i]), blocked[i] + " اسمه يحوي كلمة تعديل");
            }
        }

        [Test]
        public void ReadVerbNames_WithHarmlessSimilarWords_StayAllowed()
        {
            // Settings is not Set, Payment is not Pay, Closing is not Close, Adjustment is not Adjust, Updates is not Update
            string[] allowed = new string[]
            {
                "x:getSettings", "x:getPaymentHistory", "x:getClosingHistory", "x:previewBulkPriceAdjustment", "x:getDeadStock",
                "x:getMandatoryFieldsSettings", "x:getUpdates", "x:getOpening", "x:listByProduct", "x:searchByIngredient"
            };
            for (int i = 0; i < allowed.Length; i++)
            {
                Assert.IsFalse(IsBlocked(allowed[i]), allowed[i] + " قراءة فقط");
            }
        }

        [Test]
        public void ReadOnlyQueries_WhoseNamesContainABannedWord_AreAllowedExplicitly()
        {
            Assert.IsFalse(IsBlocked("templates:isFirstRunNeeded"));
            Assert.IsFalse(IsBlocked("excel:previewCustomerImport"));
            Assert.IsFalse(IsBlocked("pharma:previewDrugReferenceImport"));
        }

        [Test]
        public void StoreCanStillCloseTheDay_CashOutAndPrintKitchenAndBillDocuments()
        {
            string[] allowed = new string[]
            {
                "shifts:cashOut", "drawer:cashOut", "security:setIdleTimeout",
                "printer:printKOT", "tables:printPreBill", "pharma:printDosageLabel", "printer:printDosageLabel"
            };
            for (int i = 0; i < allowed.Length; i++)
            {
                Assert.IsFalse(IsBlocked(allowed[i]), allowed[i] + " مسموح بقرار المالك");
            }

            // These stay blocked on purpose
            string[] blocked = new string[]
            {
                "customers:recordPayment", "database:restore", "migration:restore", "settings:updateBatch",
                "shifts:cashIn", "drawer:cashIn", "users:setPassword", "sales:create"
            };
            for (int i = 0; i < blocked.Length; i++)
            {
                Assert.IsTrue(IsBlocked(blocked[i]), blocked[i]);
            }
        }

        [Test]
        public void EveryReadVerbCommand_InTheCommandRegistry_StaysAllowed()
        {
            string[] readVerbs = new string[] { "get", "list", "search", "find", "calculate", "preview", "check", "verify" };
            Dictionary<string, string> table = ActionTable();
            Assert.Greater(table.Count, 300, "جدول الصلاحيات حُمّل");

            foreach (KeyValuePair<string, string> entry in table)
            {
                string action = entry.Key;
                if (action == "license:runTests") continue;
                int sep = action.IndexOfAny(new char[] { ':', '.' });
                string member = action.Substring(sep + 1);
                for (int v = 0; v < readVerbs.Length; v++)
                {
                    bool startsWithVerb = member.StartsWith(readVerbs[v], StringComparison.Ordinal)
                        && member.Length > readVerbs[v].Length && char.IsUpper(member[readVerbs[v].Length]);
                    if (startsWithVerb)
                    {
                        Assert.IsFalse(IsBlocked(action), action + " قراءة فقط ويجب أن يبقى مسموحاً");
                    }
                }
            }
        }

        [Test]
        public void EveryCommandWithAMutatingVerb_InTheCommandRegistry_IsBlockedUnlessExplicitlyAllowed()
        {
            string[] mutatingVerbs = new string[]
            {
                "save", "create", "delete", "update", "cancel", "adjust", "record", "import", "clear", "archive",
                "apply", "revert", "cashIn", "cashOut", "fund", "process", "assign", "merge", "split", "transfer",
                "settle", "produce", "convert", "write", "dispose", "rebase", "reorder", "link", "hold", "recall", "load", "seed"
            };
            // Allowed on purpose (see IpcDispatcher.LICENSE_EXPIRED_ALLOWED_ACTIONS and the always-allowed namespaces)
            HashSet<string> allowedExceptions = new HashSet<string>(StringComparer.Ordinal)
            {
                "backup:create", "audit:create", "auditLogs:create", "closing:save",
                "report:saveFile", "report:savePdf", "printer:saveReceiptImage", "support:createBundle",
                "shifts:cashOut", "drawer:cashOut"
            };

            Dictionary<string, string> table = ActionTable();
            foreach (KeyValuePair<string, string> entry in table)
            {
                string action = entry.Key;
                int sep = action.IndexOfAny(new char[] { ':', '.' });
                string ns = action.Substring(0, sep);
                string member = action.Substring(sep + 1);
                if (ns == "auth" || ns == "license" || ns == "window") continue;
                if (allowedExceptions.Contains(action)) continue;

                for (int v = 0; v < mutatingVerbs.Length; v++)
                {
                    if (member.StartsWith(mutatingVerbs[v], StringComparison.Ordinal))
                    {
                        Assert.IsTrue(IsBlocked(action), action + " يعدّل بيانات ويجب أن يُحظر");
                        break;
                    }
                }
            }
        }
    }
}
