using System;
using System.Collections.Generic;
using NUnit.Framework;
using RafiqPOS.Bridge;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// نصوص الإيصال متعددة الأسطر (ترحيب أول الوصل، التذييل، توقيع المطور):
    /// التطبيع والحدود (300 حرف، 4 أسطر) في SettingsService، ترحيل التوقيعات الافتراضية القديمة للتوقيع الجديد،
    /// وحماية توقيع المطور في بوابة settings:save (للروت فقط، وإعادة إرسال القيمة المخزنة كما هي ليست تعديلاً).
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S51_ReceiptTextSettingsTest : S44_UserHierarchyFixtureBase
    {
        private const string Signature = "developer_signature";
        private const string ExpectedDefaultSignature = "رفيق للأنظمة والحلول البرمجية\nللاستفسار وتجربة النظام\nم. إسلام خالد | 01097782965";
        private const string LegacySignatureOne = "نظام رفيق لإدارة المتاجر ونقاط البيع | تطوير: م. إسلام خالد";
        private const string LegacySignatureTwo = "نظام رفيق للأنظمة والحلول البرمجية | تطوير: م. إسلام خالد - 01097782965";
        private const string LegacySignatureThree = "نظام رفيق للأنظمة والحلول البرمجية\nللتواصل: م. إسلام خالد - 01097782965";
        private const string LegacySignatureFive = "للدعم الفني والاستفسارات\nم. إسلام خالد - 01097782965";
        private const string LegacySignatureFour = "رفيق للأنظمة والحلول البرمجية\nللدعم الفني والاستفسارات\nم. إسلام خالد - 01097782965\nشكرًا لثقتكم بنا";

        private static string Repeat(char c, int count)
        {
            return new string(c, count);
        }

        private SettingsService NewSettingsService()
        {
            return new SettingsService(SettingsRepo, AuditRepo);
        }

        // Seed a stored value directly in the repository (no service rule involved)
        private void StoreRaw(string key, string value)
        {
            SettingsRepo.Set(key, value);
        }

        private string Stored(string key)
        {
            return SettingsRepo.Get(key, null);
        }

        private BridgeResponse Save(object settings)
        {
            return Dispatch("settings:save", settings);
        }

        // ---------- NormalizeReceiptText (pure) ----------

        [Test]
        public void NormalizeReceiptText_TableOfInputs()
        {
            string[][] table = new string[][]
            {
                // input, expected
                new string[] { null, "" },
                new string[] { "", "" },
                new string[] { "   ", "" },
                new string[] { "\n\n\r\n", "" },
                new string[] { "a", "a" },
                new string[] { "a\r\nb", "a\nb" },
                new string[] { "a\rb", "a\nb" },
                new string[] { "a\r\n\r\nb", "a\n\nb" },
                new string[] { "  a  \n\t b \t", "a\nb" },
                new string[] { "\n\n  a\nb  \n\n", "a\nb" },
                new string[] { "a\n \n\t\nb", "a\n\nb" },
                new string[] { "a\n\n\n\n\n\nb", "a\n\nb" },
                new string[] { "a\r\n\r\n\r\n\r\n\r\n\r\nb", "a\n\nb" },
                new string[] { "a\n\nb\n\n\n\nc", "a\n\nb\n\nc" },
                new string[] { "نظام رفيق  \n  للتواصل: 0100", "نظام رفيق\nللتواصل: 0100" },
                // A typed backslash-n is text, not a line break: only real newlines are structure
                new string[] { "a\\nb", "a\\nb" }
            };

            for (int i = 0; i < table.Length; i++)
            {
                string actual = SettingsService.NormalizeReceiptText(table[i][0]);
                Assert.AreEqual(table[i][1], actual, "الحالة رقم " + i);
                Assert.AreEqual(actual, SettingsService.NormalizeReceiptText(actual), "التطبيع متكرر الأثر (idempotent) في الحالة " + i);
            }
        }

        [Test]
        public void NormalizeReceiptText_SixConsecutiveNewlines_BecomeExactlyOneBlankLine()
        {
            string result = SettingsService.NormalizeReceiptText("first\n\n\n\n\n\nsecond");
            Assert.AreEqual("first\n\nsecond", result);
            Assert.AreEqual(3, result.Split('\n').Length, "سطران وبينهما سطر فارغ واحد");
        }

        [Test]
        public void NormalizeReceiptText_NeverLeavesCarriageReturns()
        {
            string result = SettingsService.NormalizeReceiptText("a\r\nb\rc\nd");
            Assert.AreEqual(-1, result.IndexOf('\r'));
            Assert.AreEqual("a\nb\nc\nd", result);
        }

        // ---------- TryNormalizeReceiptText limits ----------

        [Test]
        public void Limits_AreThreeHundredCharsAndFourLines()
        {
            Assert.AreEqual(300, SettingsService.MaxReceiptTextChars);
            Assert.AreEqual(4, SettingsService.MaxReceiptTextLines);
        }

        [TestCase("receipt_header")]
        [TestCase("receipt_footer")]
        [TestCase("developer_signature")]
        public void LineLimit_FourLinesAccepted_FiveRejected(string key)
        {
            string normalized;
            string error;

            Assert.IsTrue(SettingsService.TryNormalizeReceiptText(key, "a\nb\nc\nd", out normalized, out error), key + " أربعة أسطر");
            Assert.IsNull(error);
            Assert.AreEqual("a\nb\nc\nd", normalized);

            Assert.IsFalse(SettingsService.TryNormalizeReceiptText(key, "a\nb\nc\nd\ne", out normalized, out error), key + " خمسة أسطر");
            Assert.IsFalse(string.IsNullOrEmpty(error));
            Assert.AreEqual("a\nb\nc\nd\ne", normalized, "لا يُقتطع شيء بصمت عند الرفض");
        }

        [Test]
        public void LineLimit_CountsOnlyAfterNormalisation()
        {
            string normalized;
            string error;

            // Edge blank lines and surrounding whitespace do not count
            Assert.IsTrue(SettingsService.TryNormalizeReceiptText("receipt_footer", "\n\n a \r\n b\nc \n d \n\n\n", out normalized, out error));
            Assert.AreEqual("a\nb\nc\nd", normalized);

            // A kept blank line between texts is a line: 5 here even though only 3 carry text
            Assert.IsFalse(SettingsService.TryNormalizeReceiptText("receipt_footer", "a\n\nb\n\nc", out normalized, out error));
            Assert.AreEqual("a\n\nb\n\nc", normalized);

            // ... and a single blank line fits in four
            Assert.IsTrue(SettingsService.TryNormalizeReceiptText("receipt_footer", "a\n\nb\nc", out normalized, out error));

            // Long runs of blank lines collapse first, so they cannot push a text over the limit by themselves
            Assert.IsTrue(SettingsService.TryNormalizeReceiptText("receipt_footer", "a\n\n\n\n\n\nb", out normalized, out error));
            Assert.AreEqual("a\n\nb", normalized);
        }

        [TestCase("receipt_header")]
        [TestCase("receipt_footer")]
        [TestCase("developer_signature")]
        public void CharLimit_ThreeHundredAccepted_ThreeHundredAndOneRejected(string key)
        {
            string normalized;
            string error;

            Assert.IsTrue(SettingsService.TryNormalizeReceiptText(key, Repeat('x', 300), out normalized, out error), key + " 300");
            Assert.IsNull(error);
            Assert.AreEqual(300, normalized.Length);

            Assert.IsFalse(SettingsService.TryNormalizeReceiptText(key, Repeat('x', 301), out normalized, out error), key + " 301");
            Assert.IsFalse(string.IsNullOrEmpty(error));
            Assert.AreEqual(301, normalized.Length, "القيمة المطبّعة كاملة غير مقتطعة");
        }

        [Test]
        public void CharLimit_IsMeasuredOnTheNormalisedText_NewlinesCountAndWhitespaceDoesNot()
        {
            string normalized;
            string error;

            // 149 + newline + 150 = 300
            Assert.IsTrue(SettingsService.TryNormalizeReceiptText("receipt_header", Repeat('a', 149) + "\n" + Repeat('b', 150), out normalized, out error));
            Assert.AreEqual(300, normalized.Length);
            // 149 + newline + 151 = 301
            Assert.IsFalse(SettingsService.TryNormalizeReceiptText("receipt_header", Repeat('a', 149) + "\n" + Repeat('b', 151), out normalized, out error));
            // Surrounding spaces and CRLF are removed before measuring
            Assert.IsTrue(SettingsService.TryNormalizeReceiptText("receipt_header", "   " + Repeat('x', 300) + "   \r\n", out normalized, out error));
            Assert.AreEqual(300, normalized.Length);
            // Arabic text counts per character like any other
            Assert.IsTrue(SettingsService.TryNormalizeReceiptText("receipt_footer", Repeat('ش', 300), out normalized, out error));
            Assert.IsFalse(SettingsService.TryNormalizeReceiptText("receipt_footer", Repeat('ش', 301), out normalized, out error));
        }

        [Test]
        public void EmptyAndBlank_AreAcceptedAsEmpty()
        {
            string normalized;
            string error;
            Assert.IsTrue(SettingsService.TryNormalizeReceiptText("receipt_header", null, out normalized, out error));
            Assert.AreEqual("", normalized);
            Assert.IsTrue(SettingsService.TryNormalizeReceiptText("receipt_footer", " \r\n \n ", out normalized, out error));
            Assert.AreEqual("", normalized);
            Assert.IsNull(error);
        }

        [Test]
        public void OtherKeys_AreNotSubjectToTheReceiptTextLimits_ButLabelIsOnlyForTheThreeKeys()
        {
            string normalized;
            string error;
            Assert.IsTrue(SettingsService.TryNormalizeReceiptText("store_name", Repeat('x', 500), out normalized, out error));
            Assert.IsNull(error);
            Assert.IsTrue(SettingsService.TryNormalizeReceiptText("store_address", "1\n2\n3\n4\n5\n6", out normalized, out error));

            Assert.IsNotNull(SettingsService.GetReceiptTextLabel("receipt_header"));
            Assert.IsNotNull(SettingsService.GetReceiptTextLabel("receipt_footer"));
            Assert.IsNotNull(SettingsService.GetReceiptTextLabel("developer_signature"));
            Assert.IsNull(SettingsService.GetReceiptTextLabel("store_name"));
            Assert.IsNull(SettingsService.GetReceiptTextLabel("store_address"));
            Assert.IsNull(SettingsService.GetReceiptTextLabel(null));
        }

        // ---------- default signature + legacy detection (pure) ----------

        [Test]
        public void DefaultSignature_IsTheThreeLineText_WithinLimits_AndHasNoEmoji()
        {
            Assert.AreEqual(ExpectedDefaultSignature, SettingsService.DefaultDeveloperSignature);
            Assert.AreEqual(3, SettingsService.DefaultDeveloperSignature.Split('\n').Length);
            Assert.LessOrEqual(SettingsService.DefaultDeveloperSignature.Split('\n').Length, SettingsService.MaxReceiptTextLines);
            Assert.AreEqual(-1, SettingsService.DefaultDeveloperSignature.IndexOf('\r'));
            for (int i = 0; i < SettingsService.DefaultDeveloperSignature.Length; i++)
            {
                Assert.IsFalse(char.IsSurrogate(SettingsService.DefaultDeveloperSignature[i]), "لا رموز تعبيرية في الإيصال المطبوع");
            }
            string normalized;
            string error;
            Assert.IsTrue(SettingsService.TryNormalizeReceiptText(Signature, SettingsService.DefaultDeveloperSignature, out normalized, out error));
            Assert.AreEqual(SettingsService.DefaultDeveloperSignature, normalized, "الافتراضي نفسه مطبّع وضمن الحدود");
        }

        [Test]
        public void LegacySignatureDetection_TableOfInputs()
        {
            Assert.IsTrue(SettingsService.IsLegacyOrBlankDeveloperSignature(null));
            Assert.IsTrue(SettingsService.IsLegacyOrBlankDeveloperSignature(""));
            Assert.IsTrue(SettingsService.IsLegacyOrBlankDeveloperSignature("  \n "));
            Assert.IsTrue(SettingsService.IsLegacyOrBlankDeveloperSignature(LegacySignatureOne));
            Assert.IsTrue(SettingsService.IsLegacyOrBlankDeveloperSignature(LegacySignatureTwo));
            Assert.IsTrue(SettingsService.IsLegacyOrBlankDeveloperSignature(LegacySignatureThree), "الافتراضي ذو السطرين القديم");
            Assert.IsTrue(SettingsService.IsLegacyOrBlankDeveloperSignature(LegacySignatureFour), "الافتراضي السابق ذو الأربعة أسطر");
            Assert.IsTrue(SettingsService.IsLegacyOrBlankDeveloperSignature(LegacySignatureFive), "الافتراضي السابق ذو السطرين");
            Assert.IsTrue(SettingsService.IsLegacyOrBlankDeveloperSignature("  " + LegacySignatureOne + " \r\n"), "الأطراف تُقص قبل المقارنة");

            Assert.IsFalse(SettingsService.IsLegacyOrBlankDeveloperSignature(ExpectedDefaultSignature), "الافتراضي الحالي ليس قديماً");
            Assert.IsFalse(SettingsService.IsLegacyOrBlankDeveloperSignature("صيدلية النور | برمجة شركة المستقبل"));
            Assert.IsFalse(SettingsService.IsLegacyOrBlankDeveloperSignature("نظام رفيق للأنظمة والحلول البرمجية"), "جزء من النص القديم ليس هو النص القديم");
            Assert.IsFalse(SettingsService.IsLegacyOrBlankDeveloperSignature(LegacySignatureTwo + " مخصص"), "نص قديم مع إضافة مخصصة يُحفظ");
            Assert.IsFalse(SettingsService.IsLegacyOrBlankDeveloperSignature("سطر أول\nسطر ثان"));
        }

        // ---------- migration of stored signatures ----------

        [Test]
        public void Migration_MissingSignature_BecomesTheNewDefault_AndIsPersisted()
        {
            Assert.IsNull(Stored(Signature), "شرط مسبق: لا توقيع مخزن");
            var all = NewSettingsService().GetAllSettings();

            Assert.AreEqual(ExpectedDefaultSignature, all[Signature]);
            Assert.AreEqual(ExpectedDefaultSignature, Stored(Signature));
        }

        [Test]
        public void Migration_AllLegacyDefaults_BecomeTheNewTwoLineDefault()
        {
            string[] legacy = new string[] { LegacySignatureOne, LegacySignatureTwo, LegacySignatureThree, LegacySignatureFour, LegacySignatureFive };
            for (int i = 0; i < legacy.Length; i++)
            {
                StoreRaw(Signature, legacy[i]);
                var all = NewSettingsService().GetAllSettings();

                Assert.AreEqual(ExpectedDefaultSignature, all[Signature], "المُرجَع للقديم رقم " + i);
                Assert.AreEqual(ExpectedDefaultSignature, Stored(Signature), "المخزن بعد ترحيل القديم رقم " + i);
            }
        }

        [Test]
        public void Migration_LegacyWithSurroundingWhitespace_AndBlankValues_AreMigrated()
        {
            string[] values = new string[] { "  " + LegacySignatureTwo + "  ", LegacySignatureOne + "\r\n", "  " + LegacySignatureThree + "\r\n", LegacySignatureFour + "\n", "", "   " };
            for (int i = 0; i < values.Length; i++)
            {
                StoreRaw(Signature, values[i]);
                NewSettingsService().GetAllSettings();
                Assert.AreEqual(ExpectedDefaultSignature, Stored(Signature), "القيمة رقم " + i);
            }
        }

        [Test]
        public void Migration_CustomisedSignatures_AreNeverTouched()
        {
            string[] custom = new string[]
            {
                "صيدلية النور - برمجة شركة المستقبل",
                "سطر أول\nسطر ثان",
                "سطر 1\nسطر 2\nسطر 3\nسطر 4",
                "نظام رفيق للأنظمة والحلول البرمجية",
                LegacySignatureTwo + " - نسخة خاصة"
            };
            for (int i = 0; i < custom.Length; i++)
            {
                StoreRaw(Signature, custom[i]);
                var all = NewSettingsService().GetAllSettings();

                Assert.AreEqual(custom[i], all[Signature], "المُرجَع للمخصص رقم " + i);
                Assert.AreEqual(custom[i], Stored(Signature), "المخزن للمخصص رقم " + i);
            }
        }

        [Test]
        public void Migration_IsIdempotent_AcrossRepeatedReadsAndServiceInstances()
        {
            StoreRaw(Signature, LegacySignatureOne);
            NewSettingsService().GetAllSettings();
            Assert.AreEqual(ExpectedDefaultSignature, Stored(Signature));

            NewSettingsService().GetAllSettings();
            var again = NewSettingsService().GetAllSettings();
            Assert.AreEqual(ExpectedDefaultSignature, again[Signature]);
            Assert.AreEqual(ExpectedDefaultSignature, Stored(Signature));
            Assert.AreEqual(1, Scalar("SELECT COUNT(*) FROM app_settings WHERE key = @k;", "@k", Signature), "صف واحد فقط");
        }

        // ---------- round trip keeps real newlines ----------

        [Test]
        public void ServiceRoundTrip_KeepsRealNewlines()
        {
            var service = NewSettingsService();
            service.SaveSettings(new Dictionary<string, string>
            {
                { "receipt_header", "سطر 1\nسطر 2" },
                { "receipt_footer", "شكراً\nتفضلوا مرة أخرى" },
                { Signature, "مطور\nهاتف" }
            });

            var all = NewSettingsService().GetAllSettings();
            Assert.AreEqual("سطر 1\nسطر 2", all["receipt_header"]);
            Assert.AreEqual("شكراً\nتفضلوا مرة أخرى", all["receipt_footer"]);
            Assert.AreEqual("مطور\nهاتف", all[Signature]);
            Assert.AreEqual("مطور\nهاتف", Stored(Signature));
            Assert.AreEqual(-1, all[Signature].IndexOf("\\n", StringComparison.Ordinal), "لا يوجد \\n نصي");
        }

        [Test]
        public void IpcRoundTrip_OwnerSavesWithCrlf_StoresLf_AndGetAllReturnsLf()
        {
            LoginAs(OwnerId);
            var res = Save(new Dictionary<string, string>
            {
                { "receipt_header", "  أهلاً بكم \r\n  في المتجر  " },
                { "receipt_footer", "\r\nشكراً\r\n\r\n\r\n\r\n\r\n\r\nتفضلوا\r\n" }
            });
            Assert.IsTrue(res.Success, Describe(res));

            Assert.AreEqual("أهلاً بكم\nفي المتجر", Stored("receipt_header"));
            Assert.AreEqual("شكراً\n\nتفضلوا", Stored("receipt_footer"), "ست أسطر جديدة متتالية تصبح سطراً فارغاً واحداً");

            var all = (Dictionary<string, string>)Dispatch("settings:getAll", null).Data;
            Assert.AreEqual("أهلاً بكم\nفي المتجر", all["receipt_header"]);
            Assert.AreEqual("شكراً\n\nتفضلوا", all["receipt_footer"]);
        }

        // ---------- IPC validation ----------

        [TestCase("receipt_header")]
        [TestCase("receipt_footer")]
        public void Ipc_Owner_FiveLinesRejected_FourAccepted_StoredValueUnchangedOnRejection(string key)
        {
            LoginAs(OwnerId);
            Assert.IsTrue(Save(new Dictionary<string, string> { { key, "a\nb\nc\nd" } }).Success, "أربعة أسطر");
            Assert.AreEqual("a\nb\nc\nd", Stored(key));

            var rejected = Save(new Dictionary<string, string> { { key, "1\n2\n3\n4\n5" } });
            Assert.IsFalse(rejected.Success);
            Assert.AreEqual("INVALID_INPUT", ErrorCode(rejected), Describe(rejected));
            Assert.AreEqual("a\nb\nc\nd", Stored(key), "القيمة السابقة سليمة");
        }

        [TestCase("receipt_header")]
        [TestCase("receipt_footer")]
        public void Ipc_Owner_CharLimit_ThreeHundredAcceptedThreeHundredAndOneRejected(string key)
        {
            LoginAs(OwnerId);
            Assert.IsTrue(Save(new Dictionary<string, string> { { key, Repeat('x', 300) } }).Success);
            Assert.AreEqual(300, Stored(key).Length);

            var rejected = Save(new Dictionary<string, string> { { key, Repeat('y', 301) } });
            Assert.IsFalse(rejected.Success);
            Assert.AreEqual("INVALID_INPUT", ErrorCode(rejected), Describe(rejected));
            Assert.AreEqual(Repeat('x', 300), Stored(key), "لا اقتطاع ولا كتابة جزئية");
        }

        [Test]
        public void Ipc_OneInvalidReceiptText_RejectsTheWholeBatch_NothingElseIsWritten()
        {
            StoreRaw("store_name", "اسم قديم");
            StoreRaw("receipt_footer", "تذييل قديم");
            string headerBefore = Stored("receipt_header");
            LoginAs(OwnerId);

            var res = Save(new Dictionary<string, string>
            {
                { "store_name", "اسم جديد" },
                { "receipt_header", "ok" },
                { "receipt_footer", "1\n2\n3\n4\n5" }
            });

            Assert.AreEqual("INVALID_INPUT", ErrorCode(res), Describe(res));
            Assert.AreEqual("اسم قديم", Stored("store_name"), "لا كتابة جزئية");
            Assert.AreEqual(headerBefore, Stored("receipt_header"), "العنوان لم يُكتب رغم صحته");
            Assert.AreEqual("تذييل قديم", Stored("receipt_footer"));
        }

        [Test]
        public void Ipc_UpdateBatch_AppliesTheSameValidationAndNormalisation()
        {
            LoginAs(OwnerId);
            var ok = Dispatch("settings:updateBatch", new { settings = new Dictionary<string, string> { { "receipt_header", " x \r\n y " } } });
            Assert.IsTrue(ok.Success, Describe(ok));
            Assert.AreEqual("x\ny", Stored("receipt_header"));

            var bad = Dispatch("settings:updateBatch", new { settings = new Dictionary<string, string> { { "receipt_header", Repeat('z', 301) } } });
            Assert.AreEqual("INVALID_INPUT", ErrorCode(bad), Describe(bad));
            Assert.AreEqual("x\ny", Stored("receipt_header"));
        }

        [Test]
        public void Ipc_Manager_SavesAndIsValidatedLikeTheOwner_ForHeaderAndFooter()
        {
            var manager = CreateManager("mgr_rt1", ManagerPin);
            string footerBefore = Stored("receipt_footer");
            LoginAs(manager.Id);

            var ok = Save(new Dictionary<string, string> { { "receipt_header", "  مرحباً \r\n بكم " } });
            Assert.IsTrue(ok.Success, Describe(ok));
            Assert.AreEqual("مرحباً\nبكم", Stored("receipt_header"));

            var bad = Save(new Dictionary<string, string> { { "receipt_footer", "1\n2\n3\n4\n5" } });
            Assert.AreEqual("INVALID_INPUT", ErrorCode(bad), Describe(bad));
            Assert.AreEqual(footerBefore, Stored("receipt_footer"), "الرفض لا يغيّر المخزن");
        }

        [Test]
        public void ReceiptShowCashier_DefaultsToOn_WhenTheKeyIsMissing()
        {
            Assert.IsNull(Stored("receipt_show_cashier"), "شرط مسبق: المفتاح غير مخزن");
            var all = NewSettingsService().GetAllSettings();
            Assert.AreEqual("1", all["receipt_show_cashier"]);

            StoreRaw("receipt_show_cashier", "0");
            Assert.AreEqual("0", NewSettingsService().GetAllSettings()["receipt_show_cashier"], "القيمة المخزنة لا تُستبدل بالافتراضي");
        }

        [Test]
        public void Ipc_OwnerAndManager_CanSaveReceiptShowCashier_OffAndBackOn()
        {
            var manager = CreateManager("mgr_cashier_line", ManagerPin);
            string[] sessions = new string[] { OwnerId, manager.Id };
            for (int s = 0; s < sessions.Length; s++)
            {
                LoginAs(sessions[s]);

                var off = Save(new Dictionary<string, string> { { "receipt_show_cashier", "0" } });
                Assert.IsTrue(off.Success, Describe(off));
                Assert.AreEqual("0", Stored("receipt_show_cashier"), "الجلسة رقم " + s);
                Assert.AreEqual("0", NewSettingsService().GetAllSettings()["receipt_show_cashier"]);

                var on = Save(new Dictionary<string, string> { { "receipt_show_cashier", "1" } });
                Assert.IsTrue(on.Success, Describe(on));
                Assert.AreEqual("1", Stored("receipt_show_cashier"), "الجلسة رقم " + s);
            }
        }

        // ---------- developer signature is root-only ----------

        [Test]
        public void Ipc_OwnerAndManager_ChangingTheSignature_IsForbidden_AndStoredValueIsUnchanged()
        {
            var manager = CreateManager("mgr_rt2", ManagerPin);
            StoreRaw(Signature, "توقيع المطور الأصلي\nسطر ثان");
            StoreRaw("store_name", "اسم قديم");

            string[] sessions = new string[] { OwnerId, manager.Id };
            for (int s = 0; s < sessions.Length; s++)
            {
                LoginAs(sessions[s]);
                var res = Save(new Dictionary<string, string> { { Signature, "توقيع مزيف" }, { "store_name", "اسم جديد" } });

                Assert.IsFalse(res.Success, sessions[s]);
                Assert.AreEqual("FORBIDDEN", ErrorCode(res), sessions[s] + ": " + Describe(res));
                Assert.AreEqual("توقيع المطور الأصلي\nسطر ثان", Stored(Signature), "التوقيع لم يتغير");
                Assert.AreEqual("اسم قديم", Stored("store_name"), "الطلب كله يُرفض ولا تُكتب مفاتيحه الأخرى");
            }
        }

        [Test]
        public void Ipc_OwnerAndManager_SignatureChangeIsForbidden_ThroughUpdateBatchToo()
        {
            var manager = CreateManager("mgr_rt3", ManagerPin);
            StoreRaw(Signature, "التوقيع الأصلي");

            string[] sessions = new string[] { OwnerId, manager.Id };
            for (int s = 0; s < sessions.Length; s++)
            {
                LoginAs(sessions[s]);
                var wrapped = Dispatch("settings:updateBatch", new { settings = new Dictionary<string, string> { { Signature, "مزيف" } } });
                Assert.AreEqual("FORBIDDEN", ErrorCode(wrapped), Describe(wrapped));
                var flat = Dispatch("settings:updateBatch", new Dictionary<string, string> { { Signature, "مزيف" } });
                Assert.AreEqual("FORBIDDEN", ErrorCode(flat), Describe(flat));
                Assert.AreEqual("التوقيع الأصلي", Stored(Signature));
            }
        }

        [Test]
        public void Ipc_RootOnlyKeyVariants_AreMatchedByTrimAndCaseInsensitively()
        {
            var manager = CreateManager("mgr_rt4", ManagerPin);
            StoreRaw(Signature, "التوقيع الأصلي");
            StoreRaw("developer_branding", "دعاية أصلية");
            StoreRaw("system_developer_signature", "توقيع نظام أصلي");

            string[] keys = new string[]
            {
                "developer_signature", "developer_branding", "system_developer_signature",
                " developer_signature ", "Developer_Signature", "DEVELOPER_BRANDING", "\tSystem_Developer_Signature\n"
            };
            string[] sessions = new string[] { OwnerId, manager.Id };
            for (int s = 0; s < sessions.Length; s++)
            {
                LoginAs(sessions[s]);
                for (int i = 0; i < keys.Length; i++)
                {
                    var res = Save(new Dictionary<string, string> { { keys[i], "قيمة مختلفة " + i } });
                    Assert.IsFalse(res.Success, "المفتاح [" + keys[i] + "] لـ " + sessions[s]);
                    Assert.AreEqual("FORBIDDEN", ErrorCode(res), "المفتاح [" + keys[i] + "]: " + Describe(res));
                }
            }

            Assert.AreEqual("التوقيع الأصلي", Stored(Signature));
            Assert.AreEqual("دعاية أصلية", Stored("developer_branding"));
            Assert.AreEqual("توقيع نظام أصلي", Stored("system_developer_signature"));
            Assert.AreEqual(0, Scalar("SELECT COUNT(*) FROM app_settings WHERE lower(trim(key)) = 'developer_signature' AND key <> 'developer_signature';"),
                "لم يُنشأ صف بمفتاح متنكر");
        }

        [Test]
        public void Ipc_ResendingTheStoredSignatureUnchanged_IsANoOpSuccess_AndOtherKeysStillSave()
        {
            var manager = CreateManager("mgr_rt5", ManagerPin);
            StoreRaw(Signature, "توقيع مخصص\nللتواصل: 0100");
            StoreRaw("store_name", "اسم قديم");

            string[] sessions = new string[] { OwnerId, manager.Id };
            for (int s = 0; s < sessions.Length; s++)
            {
                LoginAs(sessions[s]);
                var res = Save(new Dictionary<string, string> { { Signature, "توقيع مخصص\nللتواصل: 0100" }, { "store_name", "اسم " + s } });

                Assert.IsTrue(res.Success, sessions[s] + ": " + Describe(res));
                Assert.AreEqual("توقيع مخصص\nللتواصل: 0100", Stored(Signature), "التوقيع كما هو");
                Assert.AreEqual("اسم " + s, Stored("store_name"), "باقي المفاتيح حُفظت");
            }
        }

        [Test]
        public void Ipc_ManagerRoundTripOfTheWholeSettingsScreen_KeepsTheSignature()
        {
            // The settings screen reads everything, edits one field and posts the whole map back
            var manager = CreateManager("mgr_rt6", ManagerPin);
            LoginAs(manager.Id);
            var read = Dispatch("settings:getAll", null);
            Assert.IsTrue(read.Success, Describe(read));
            var all = new Dictionary<string, string>((Dictionary<string, string>)read.Data);
            Assert.AreEqual(ExpectedDefaultSignature, all[Signature], "القراءة الأولى تُرحّل للافتراضي الجديد");

            all["store_name"] = "اسم من الشاشة";
            var res = Save(all);

            Assert.IsTrue(res.Success, Describe(res));
            Assert.AreEqual("اسم من الشاشة", Stored("store_name"));
            Assert.AreEqual(ExpectedDefaultSignature, Stored(Signature));
        }

        [Test]
        public void Ipc_Root_CanWriteTheSignature_NormalisedAndValidated()
        {
            StoreRaw(Signature, "توقيع قديم مخصص");
            LoginAs(RootId);

            var ok = Save(new Dictionary<string, string> { { Signature, "  شركة الحلول \r\n\r\n\r\n\r\n  هاتف 0100  " } });
            Assert.IsTrue(ok.Success, Describe(ok));
            Assert.AreEqual("شركة الحلول\n\nهاتف 0100", Stored(Signature));

            var tooManyLines = Save(new Dictionary<string, string> { { Signature, "1\n2\n3\n4\n5" } });
            Assert.AreEqual("INVALID_INPUT", ErrorCode(tooManyLines), Describe(tooManyLines));
            var tooLong = Save(new Dictionary<string, string> { { Signature, Repeat('s', 301) } });
            Assert.AreEqual("INVALID_INPUT", ErrorCode(tooLong), Describe(tooLong));
            Assert.AreEqual("شركة الحلول\n\nهاتف 0100", Stored(Signature), "الرفض لا يغيّر المخزن");

            var exactly = Save(new Dictionary<string, string> { { Signature, Repeat('s', 300) } });
            Assert.IsTrue(exactly.Success, Describe(exactly));
            Assert.AreEqual(300, Stored(Signature).Length);
        }

        [Test]
        public void Ipc_Root_WritesOtherRootOnlyKeys_AndRootClearingTheSignatureRestoresTheDefault()
        {
            LoginAs(RootId);

            var branding = Save(new Dictionary<string, string> { { "developer_branding", "دعاية جديدة" } });
            Assert.IsTrue(branding.Success, Describe(branding));
            Assert.AreEqual("دعاية جديدة", Stored("developer_branding"));

            var clear = Save(new Dictionary<string, string> { { Signature, "" } });
            Assert.IsTrue(clear.Success, Describe(clear));
            var all = (Dictionary<string, string>)Dispatch("settings:getAll", null).Data;
            Assert.AreEqual(ExpectedDefaultSignature, all[Signature], "التوقيع الفارغ يُعاد للافتراضي عند القراءة التالية");
        }

        [Test]
        public void Ipc_RootSignatureSurvivesLaterOwnerSettingsSaves()
        {
            LoginAs(RootId);
            Assert.IsTrue(Save(new Dictionary<string, string> { { Signature, "توقيع المطور\nرقم 0100" } }).Success);

            LoginAs(OwnerId);
            var read = Dispatch("settings:getAll", null);
            var all = new Dictionary<string, string>((Dictionary<string, string>)read.Data);
            all["store_phone"] = "0123";
            var res = Save(all);

            Assert.IsTrue(res.Success, Describe(res));
            Assert.AreEqual("توقيع المطور\nرقم 0100", Stored(Signature));
            Assert.AreEqual("0123", Stored("store_phone"));
        }

        // ---------- developer_signature_visible / developer_signature_image (root only) ----------

        private const string Visible = "developer_signature_visible";
        private const string Image = "developer_signature_image";

        // Header-only PNG shape: signature + IHDR(width, height). The host validates from these bytes without decoding the image
        private static byte[] PngHeader(int width, int height)
        {
            byte[] b = new byte[33];
            byte[] sig = new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A };
            Array.Copy(sig, b, sig.Length);
            b[11] = 13;
            b[12] = 0x49; b[13] = 0x48; b[14] = 0x44; b[15] = 0x52;
            b[16] = (byte)(width >> 24); b[17] = (byte)(width >> 16); b[18] = (byte)(width >> 8); b[19] = (byte)width;
            b[20] = (byte)(height >> 24); b[21] = (byte)(height >> 16); b[22] = (byte)(height >> 8); b[23] = (byte)height;
            return b;
        }

        private static string PngUrl(int width, int height)
        {
            return SettingsService.SignatureImagePrefix + Convert.ToBase64String(PngHeader(width, height));
        }

        [Test]
        public void SignatureSettings_DefaultToVisibleAndBuiltInImage_WhenMissing()
        {
            Assert.IsNull(Stored(Visible), "شرط مسبق: المفتاح غير مخزن");
            Assert.IsNull(Stored(Image), "شرط مسبق: المفتاح غير مخزن");
            var all = NewSettingsService().GetAllSettings();
            Assert.AreEqual("1", all[Visible]);
            Assert.AreEqual("", all[Image]);
        }

        [Test]
        public void ValidateSignatureSetting_TableOfInputs()
        {
            string error;
            Assert.IsTrue(SettingsService.TryValidateSignatureSetting(Visible, "0", out error));
            Assert.IsTrue(SettingsService.TryValidateSignatureSetting(Visible, "1", out error));
            Assert.IsFalse(SettingsService.TryValidateSignatureSetting(Visible, "2", out error));
            Assert.IsFalse(string.IsNullOrEmpty(error));
            Assert.IsFalse(SettingsService.TryValidateSignatureSetting(Visible, "", out error));
            Assert.IsFalse(SettingsService.TryValidateSignatureSetting(Visible, "true", out error));

            Assert.IsTrue(SettingsService.TryValidateSignatureSetting(Image, "", out error));
            Assert.IsTrue(SettingsService.TryValidateSignatureSetting(Image, "none", out error));
            Assert.IsTrue(SettingsService.TryValidateSignatureSetting(Image, PngUrl(1, 1), out error), "PNG بحجم 1x1");
            Assert.IsTrue(SettingsService.TryValidateSignatureSetting(Image, PngUrl(SettingsService.MaxSignatureImageWidth, SettingsService.MaxSignatureImageHeight), out error), "الحد الأقصى للأبعاد");
            Assert.IsTrue(SettingsService.TryValidateSignatureSetting("store_name", "أي قيمة", out error), "المفاتيح الأخرى تمر");

            string pngBase64 = Convert.ToBase64String(PngHeader(100, 50));
            string[] rejected = new string[]
            {
                "data:image/jpeg;base64," + pngBase64,
                "data:image/png;base64," + pngBase64 + "!!",
                "data:image/png;base64," + pngBase64.Substring(0, pngBase64.Length - 1),
                "data:image/png;base64, " + pngBase64,
                "data:image/png;base64,",
                "data:image/png;base64," + Convert.ToBase64String(System.Text.Encoding.ASCII.GetBytes("GIF89a-not-a-png-image-at-all-1234")),
                PngUrl(SettingsService.MaxSignatureImageWidth + 1, 100),
                PngUrl(100, SettingsService.MaxSignatureImageHeight + 1),
                PngUrl(0, 10),
                "data:image/png;base64," + new string('A', SettingsService.MaxSignatureImageChars),
                "javascript:alert(1)",
                "http://example.com/a.png"
            };
            for (int i = 0; i < rejected.Length; i++)
            {
                Assert.IsFalse(SettingsService.TryValidateSignatureSetting(Image, rejected[i], out error), "القيمة المرفوضة رقم " + i);
                Assert.IsFalse(string.IsNullOrEmpty(error), "رسالة الخطأ رقم " + i);
                Assert.IsFalse(error.ToLowerInvariant().Contains("base64"), "الرسالة لا تكرر محتوى الصورة");
            }

            // Within the character cap but decoded size above 220,000 bytes
            byte[] big = new byte[221000];
            Array.Copy(PngHeader(100, 50), big, 33);
            string bigUrl = SettingsService.SignatureImagePrefix + Convert.ToBase64String(big);
            Assert.LessOrEqual(bigUrl.Length, SettingsService.MaxSignatureImageChars);
            Assert.IsFalse(SettingsService.TryValidateSignatureSetting(Image, bigUrl, out error), "حجم أكبر من 220,000 بايت");
        }

        [Test]
        public void Ipc_Root_CanSaveTheSignatureSwitches_AndGetAllReturnsThem()
        {
            LoginAs(RootId);
            string url = PngUrl(900, 138);

            var res = Save(new Dictionary<string, string> { { Visible, "0" }, { Image, url } });
            Assert.IsTrue(res.Success, Describe(res));
            Assert.AreEqual("0", Stored(Visible));
            Assert.AreEqual(url, Stored(Image));
            var all = (Dictionary<string, string>)Dispatch("settings:getAll", null).Data;
            Assert.AreEqual("0", all[Visible]);
            Assert.AreEqual(url, all[Image]);

            string[] images = new string[] { "none", "", PngUrl(1, 1) };
            for (int i = 0; i < images.Length; i++)
            {
                var again = Save(new Dictionary<string, string> { { Visible, "1" }, { Image, images[i] } });
                Assert.IsTrue(again.Success, "الصورة رقم " + i + ": " + Describe(again));
                Assert.AreEqual(images[i], Stored(Image));
                Assert.AreEqual("1", Stored(Visible));
            }
        }

        [Test]
        public void Ipc_Root_InvalidSignatureValues_AreRejectedWithValidationError_AndNothingIsWritten()
        {
            LoginAs(RootId);
            Assert.IsTrue(Save(new Dictionary<string, string> { { Visible, "1" }, { Image, "none" } }).Success);

            string pngBase64 = Convert.ToBase64String(PngHeader(100, 50));
            string[] badImages = new string[]
            {
                "data:image/jpeg;base64," + pngBase64,
                "data:image/png;base64," + pngBase64 + "!!",
                "data:image/png;base64," + Convert.ToBase64String(System.Text.Encoding.ASCII.GetBytes("GIF89a-not-a-png-image-at-all-1234")),
                PngUrl(SettingsService.MaxSignatureImageWidth + 1, 100),
                PngUrl(100, SettingsService.MaxSignatureImageHeight + 1),
                "data:image/png;base64," + new string('A', SettingsService.MaxSignatureImageChars)
            };
            for (int i = 0; i < badImages.Length; i++)
            {
                var res = Save(new Dictionary<string, string> { { Image, badImages[i] }, { "store_name", "اسم لا يُكتب " + i } });
                Assert.IsFalse(res.Success, "الصورة رقم " + i);
                Assert.AreEqual("VALIDATION_ERROR", ErrorCode(res), Describe(res));
                Assert.AreEqual("none", Stored(Image), "الرفض لا يغيّر المخزن");
                Assert.AreNotEqual("اسم لا يُكتب " + i, Stored("store_name"), "الدفعة كلها مرفوضة");
            }

            var badVisible = Save(new Dictionary<string, string> { { Visible, "2" } });
            Assert.AreEqual("VALIDATION_ERROR", ErrorCode(badVisible), Describe(badVisible));
            Assert.AreEqual("1", Stored(Visible));
        }

        [Test]
        public void Ipc_OwnerAndManager_ChangingTheSignatureSwitches_IsForbidden_AndStoredValuesAreUnchanged()
        {
            var manager = CreateManager("mgr_sig_switch", ManagerPin);
            string[] sessions = new string[] { OwnerId, manager.Id };
            for (int s = 0; s < sessions.Length; s++)
            {
                LoginAs(sessions[s]);

                var hide = Save(new Dictionary<string, string> { { Visible, "0" } });
                Assert.AreEqual("FORBIDDEN", ErrorCode(hide), sessions[s] + ": " + Describe(hide));
                var image = Save(new Dictionary<string, string> { { Image, "none" } });
                Assert.AreEqual("FORBIDDEN", ErrorCode(image), sessions[s] + ": " + Describe(image));
                var variant = Save(new Dictionary<string, string> { { " Developer_Signature_Image ", "none" } });
                Assert.AreEqual("FORBIDDEN", ErrorCode(variant), sessions[s] + ": " + Describe(variant));

                Assert.IsNull(Stored(Visible), "لم يُكتب شيء");
                Assert.IsNull(Stored(Image), "لم يُكتب شيء");
            }
        }

        [Test]
        public void Ipc_Owner_WholeScreenRoundTrip_ResendingTheDefaults_IsANoOp_AndAfterRootChangesTheStoredValuesSurvive()
        {
            LoginAs(OwnerId);
            var read = Dispatch("settings:getAll", null);
            var all = new Dictionary<string, string>((Dictionary<string, string>)read.Data);
            Assert.AreEqual("1", all[Visible]);
            Assert.AreEqual("", all[Image]);
            all["store_phone"] = "0155";
            var first = Save(all);
            Assert.IsTrue(first.Success, "إعادة إرسال القيم الافتراضية ليست تعديلاً: " + Describe(first));
            Assert.AreEqual("0155", Stored("store_phone"));

            LoginAs(RootId);
            string url = PngUrl(300, 60);
            Assert.IsTrue(Save(new Dictionary<string, string> { { Visible, "0" }, { Image, url } }).Success);

            LoginAs(OwnerId);
            var all2 = new Dictionary<string, string>((Dictionary<string, string>)Dispatch("settings:getAll", null).Data);
            Assert.AreEqual("0", all2[Visible], "القراءة متاحة للجميع");
            Assert.AreEqual(url, all2[Image], "القراءة متاحة للجميع");
            all2["store_phone"] = "0166";
            var second = Save(all2);
            Assert.IsTrue(second.Success, "إعادة إرسال القيم المخزنة كما هي: " + Describe(second));
            Assert.AreEqual("0166", Stored("store_phone"));
            Assert.AreEqual("0", Stored(Visible));
            Assert.AreEqual(url, Stored(Image));
        }

        // ---------- several signature images: JSON array value + per-invoice pick ----------

        // JSON array of strings built by hand: data URLs and "default" never contain quotes or backslashes
        private static string ArrayOf(params string[] items)
        {
            return "[\"" + string.Join("\",\"", items) + "\"]";
        }

        [Test]
        public void ParseSignatureImageItems_EveryForm()
        {
            List<string> items;
            string one = PngUrl(10, 10);

            Assert.IsTrue(SettingsService.TryParseSignatureImageItems("", out items));
            CollectionAssert.AreEqual(new string[] { "default" }, items);
            Assert.IsTrue(SettingsService.TryParseSignatureImageItems("none", out items));
            Assert.AreEqual(0, items.Count);
            Assert.IsTrue(SettingsService.TryParseSignatureImageItems(one, out items));
            CollectionAssert.AreEqual(new string[] { one }, items, "قيمة قديمة بصورة واحدة");
            Assert.IsTrue(SettingsService.TryParseSignatureImageItems(ArrayOf("default", one), out items));
            CollectionAssert.AreEqual(new string[] { "default", one }, items);

            Assert.IsFalse(SettingsService.TryParseSignatureImageItems("[not json]", out items));
            Assert.IsFalse(SettingsService.TryParseSignatureImageItems("[1,2]", out items), "عنصر غير نصي");
            Assert.IsFalse(SettingsService.TryParseSignatureImageItems("[\"default\",", out items));
            Assert.AreEqual(0, items.Count);
        }

        [Test]
        public void ValidateSignatureSetting_Arrays_TableOfInputs()
        {
            string error;
            string ok = PngUrl(100, 50);

            Assert.IsTrue(SettingsService.TryValidateSignatureSetting(Image, ArrayOf("default", ok), out error), error);
            Assert.IsTrue(SettingsService.TryValidateSignatureSetting(Image, ArrayOf(ok), out error), error);
            Assert.IsTrue(SettingsService.TryValidateSignatureSetting(Image, ArrayOf("default"), out error), error);
            string[] eight = new string[SettingsService.MaxSignatureImages];
            for (int i = 0; i < eight.Length; i++) eight[i] = ok;
            Assert.IsTrue(SettingsService.TryValidateSignatureSetting(Image, ArrayOf(eight), out error), "ثمانية عناصر: " + error);

            string[] nine = new string[SettingsService.MaxSignatureImages + 1];
            for (int i = 0; i < nine.Length; i++) nine[i] = ok;
            string[] rejected = new string[]
            {
                "[not json]",
                "[\"default\",",
                "[]",
                ArrayOf(nine),
                ArrayOf("default", "default"),
                "[1]",
                "[null]",
                "[{\"a\":1}]",
                ArrayOf("none"),
                ArrayOf(""),
                ArrayOf(ok, "data:image/jpeg;base64," + Convert.ToBase64String(PngHeader(1, 1))),
                ArrayOf(ok, PngUrl(SettingsService.MaxSignatureImageWidth + 1, 10)),
                ArrayOf(ok, SettingsService.SignatureImagePrefix + new string('A', 40) + "!"),
                "[\"default\"] x"
            };
            for (int i = 0; i < rejected.Length; i++)
            {
                Assert.IsFalse(SettingsService.TryValidateSignatureSetting(Image, rejected[i], out error), "المصفوفة المرفوضة رقم " + i);
                Assert.IsFalse(string.IsNullOrEmpty(error), "رسالة الخطأ رقم " + i);
                Assert.IsFalse(error.ToLowerInvariant().Contains("base64"), "الرسالة لا تكرر محتوى الصورة");
            }

            // Every element is valid (about 213,000 characters each) but the whole list is over 900,000 characters
            byte[] bigBytes = new byte[160000];
            Array.Copy(PngHeader(100, 50), bigBytes, 33);
            string big = SettingsService.SignatureImagePrefix + Convert.ToBase64String(bigBytes);
            Assert.IsTrue(SettingsService.TryValidateSignatureSetting(Image, big, out error), "العنصر وحده صالح: " + error);
            Assert.IsTrue(SettingsService.TryValidateSignatureSetting(Image, ArrayOf(big, big, big), out error), "ثلاثة عناصر تحت السقف: " + error);
            Assert.IsFalse(SettingsService.TryValidateSignatureSetting(Image, ArrayOf(big, big, big, big, big), out error), "المجموع فوق 900,000 حرف");
        }

        [Test]
        public void Ipc_Root_CanSaveAnImageArray_AndGetAllReturnsIt_AndTheStoredValueIsTheArray()
        {
            LoginAs(RootId);
            string array = ArrayOf("default", PngUrl(900, 138), PngUrl(300, 60));

            var res = Save(new Dictionary<string, string> { { Image, array } });
            Assert.IsTrue(res.Success, Describe(res));
            Assert.AreEqual(array, Stored(Image));
            var all = (Dictionary<string, string>)Dispatch("settings:getAll", null).Data;
            Assert.AreEqual(array, all[Image]);

            // The old single-image form and the short forms keep working
            string[] forms = new string[] { PngUrl(10, 10), "none", "", array };
            for (int i = 0; i < forms.Length; i++)
            {
                var again = Save(new Dictionary<string, string> { { Image, forms[i] } });
                Assert.IsTrue(again.Success, "الشكل رقم " + i + ": " + Describe(again));
                Assert.AreEqual(forms[i], Stored(Image));
            }
        }

        [Test]
        public void Ipc_Root_InvalidImageArrays_AreRejectedWithValidationError_AndNothingIsWritten()
        {
            LoginAs(RootId);
            Assert.IsTrue(Save(new Dictionary<string, string> { { Image, "none" } }).Success);

            string ok = PngUrl(100, 50);
            string[] nine = new string[SettingsService.MaxSignatureImages + 1];
            for (int i = 0; i < nine.Length; i++) nine[i] = ok;
            string[] bad = new string[]
            {
                "[not json]", "[]", "[1]", ArrayOf(nine), ArrayOf("default", "default"), ArrayOf(ok, "none"),
                ArrayOf(ok, PngUrl(SettingsService.MaxSignatureImageWidth + 1, 10))
            };
            for (int i = 0; i < bad.Length; i++)
            {
                var res = Save(new Dictionary<string, string> { { Image, bad[i] }, { "store_name", "اسم لا يُكتب " + i } });
                Assert.IsFalse(res.Success, "المصفوفة رقم " + i);
                Assert.AreEqual("VALIDATION_ERROR", ErrorCode(res), Describe(res));
                Assert.AreEqual("none", Stored(Image), "الرفض لا يغيّر المخزن");
                Assert.AreNotEqual("اسم لا يُكتب " + i, Stored("store_name"), "الدفعة كلها مرفوضة");
            }
        }

        [Test]
        public void Ipc_OwnerAndManager_ChangingTheImageArray_IsForbidden()
        {
            var manager = CreateManager("mgr_sig_array", ManagerPin);
            string[] sessions = new string[] { OwnerId, manager.Id };
            for (int s = 0; s < sessions.Length; s++)
            {
                LoginAs(sessions[s]);
                var res = Save(new Dictionary<string, string> { { Image, ArrayOf("default", PngUrl(10, 10)) } });
                Assert.AreEqual("FORBIDDEN", ErrorCode(res), sessions[s] + ": " + Describe(res));
                Assert.IsNull(Stored(Image), "لم يُكتب شيء");
            }
        }

        [Test]
        public void PickSignatureImageIndex_MatchesTheFrontendTable()
        {
            // The same rows are asserted in the frontend test (signature_image.test.js), computed by pickSignatureImageIndex in TypeScript
            string[] table = new string[]
            {
                "sale_internal_guid_123|1|0",
                "sale_internal_guid_123|2|1",
                "sale_internal_guid_123|3|1",
                "sale_internal_guid_123|5|4",
                "sale_internal_guid_123|8|1",
                "a|1|0",
                "a|2|0",
                "a|3|1",
                "a|5|0",
                "a|8|4",
                "abc|1|0",
                "abc|2|1",
                "abc|3|2",
                "abc|5|1",
                "abc|8|3",
                "sale-0001|1|0",
                "sale-0001|2|0",
                "sale-0001|3|0",
                "sale-0001|5|1",
                "sale-0001|8|6",
                "sale-0002|1|0",
                "sale-0002|2|1",
                "sale-0002|3|1",
                "sale-0002|5|2",
                "sale-0002|8|3",
                "sale-0003|1|0",
                "sale-0003|2|0",
                "sale-0003|3|2",
                "sale-0003|5|3",
                "sale-0003|8|0",
                "ret_9f2c|1|0",
                "ret_9f2c|2|1",
                "ret_9f2c|3|1",
                "ret_9f2c|5|3",
                "ret_9f2c|8|1",
                "الفاتورة|1|0",
                "الفاتورة|2|0",
                "الفاتورة|3|0",
                "الفاتورة|5|0",
                "الفاتورة|8|2",
                "4f9c2e7a-1b3d-4c8e-9a6f-0d5e7b1a2c3d|1|0",
                "4f9c2e7a-1b3d-4c8e-9a6f-0d5e7b1a2c3d|2|1",
                "4f9c2e7a-1b3d-4c8e-9a6f-0d5e7b1a2c3d|3|0",
                "4f9c2e7a-1b3d-4c8e-9a6f-0d5e7b1a2c3d|5|1",
                "4f9c2e7a-1b3d-4c8e-9a6f-0d5e7b1a2c3d|8|7",
                "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx|1|0",
                "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx|2|1",
                "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx|3|2",
                "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx|5|0",
                "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx|8|5"
            };
            for (int i = 0; i < table.Length; i++)
            {
                string[] parts = table[i].Split('|');
                Assert.AreEqual(3, parts.Length, table[i]);
                Assert.AreEqual(int.Parse(parts[2]), SettingsService.PickSignatureImageIndex(parts[0], int.Parse(parts[1])), table[i]);
            }
            Assert.AreEqual(0, SettingsService.PickSignatureImageIndex("", 5), "مفتاح فارغ");
            Assert.AreEqual(0, SettingsService.PickSignatureImageIndex(null, 5), "مفتاح null");
            Assert.AreEqual(-1, SettingsService.PickSignatureImageIndex("a", 0));
            Assert.AreEqual(-1, SettingsService.PickSignatureImageIndex("a", -3));
        }
    }
}
