using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;

namespace RafiqPOS.Data
{
    // Parsed form of the legacy System.Data.SQLite connection string (the keywords the application uses plus a few neighbours).
    internal sealed class SQLiteConnectionOptions
    {
        internal const int DefaultCommandTimeoutSeconds = 30;

        internal string DataSource;
        internal bool IsMemory;
        internal bool ReadOnly;
        internal bool FailIfMissing;
        internal bool Pooling;
        internal bool EncryptionNone;
        // "Encryption=Product": always the program key, even when the process default hook is switched off (test mode, plain fallback)
        internal bool EncryptionProduct;
        internal bool BinaryGuid = true;
        internal bool SetDefaults = true;
        internal int BusyTimeout;
        internal int CommandTimeoutSeconds = DefaultCommandTimeoutSeconds;
        internal DateTimeKind DateTimeKind = DateTimeKind.Unspecified;
        internal List<string> Pragmas = new List<string>();

        internal static SQLiteConnectionOptions Parse(string connectionString)
        {
            if (connectionString == null) throw new ArgumentNullException("connectionString");

            Dictionary<string, string> map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (string rawPart in Split(connectionString))
            {
                string part = rawPart.Trim();
                if (part.Length == 0) continue;
                int eq = part.IndexOf('=');
                if (eq < 0)
                {
                    throw new ArgumentException(string.Format(CultureInfo.CurrentCulture,
                        "Invalid ConnectionString format for part \"{0}\", no equal sign found", part));
                }
                map[Unwrap(part.Substring(0, eq).Trim())] = Unwrap(part.Substring(eq + 1).Trim());
            }

            SQLiteConnectionOptions o = new SQLiteConnectionOptions();

            if (map.ContainsKey("Password") || map.ContainsKey("HexPassword") || map.ContainsKey("TextPassword") || map.ContainsKey("TextHexPassword"))
            {
                throw new NotSupportedException("Password keywords are not supported; encryption keys are applied by the connection key hook.");
            }

            string value;
            if (map.TryGetValue("Encryption", out value))
            {
                if (string.Equals(value, "None", StringComparison.OrdinalIgnoreCase)) o.EncryptionNone = true;
                else if (string.Equals(value, "Product", StringComparison.OrdinalIgnoreCase)) o.EncryptionProduct = true;
                else if (!string.Equals(value, "Default", StringComparison.OrdinalIgnoreCase)) throw new NotSupportedException("Encryption must be Default, Product or None");
            }
            if (map.TryGetValue("Version", out value) && ToInt(value) != 3)
            {
                throw new NotSupportedException("Only SQLite Version 3 is supported at this time");
            }

            if (map.TryGetValue("DateTimeFormat", out value) && !string.Equals(value, "ISO8601", StringComparison.OrdinalIgnoreCase))
            {
                throw new NotSupportedException("Only DateTimeFormat=ISO8601 is supported");
            }
            if (map.TryGetValue("DateTimeKind", out value))
            {
                o.DateTimeKind = (DateTimeKind)Enum.Parse(typeof(DateTimeKind), value, true);
            }

            string source;
            if (!map.TryGetValue("Data Source", out source) || string.IsNullOrEmpty(source))
            {
                throw new ArgumentException("Data Source cannot be empty.  Use :memory: to open an in-memory database");
            }
            if (string.Compare(source, ":memory:", StringComparison.OrdinalIgnoreCase) == 0)
            {
                o.IsMemory = true;
                o.DataSource = ":memory:";
            }
            else
            {
                bool toFullPath = !map.TryGetValue("ToFullPath", out value) || ToBool(value);
                o.DataSource = ExpandFileName(source, toFullPath);
            }

            o.Pooling = map.TryGetValue("Pooling", out value) && ToBool(value);
            o.ReadOnly = map.TryGetValue("Read Only", out value) && ToBool(value);
            o.FailIfMissing = map.TryGetValue("FailIfMissing", out value) && ToBool(value);
            if (map.TryGetValue("BinaryGUID", out value)) o.BinaryGuid = ToBool(value);
            if (map.TryGetValue("SetDefaults", out value)) o.SetDefaults = ToBool(value);
            if (map.TryGetValue("BusyTimeout", out value)) o.BusyTimeout = ToInt(value);
            // The provider keeps retrying a busy statement until the command timeout: tie it to BusyTimeout so BusyTimeout=5000 fails
            // after about 5 s and 500 after about 1 s (not the provider's 30 s default). An explicit "Default Timeout" still wins.
            o.CommandTimeoutSeconds = Math.Max(1, (int)Math.Ceiling(o.BusyTimeout / 1000.0));
            if (map.TryGetValue("Default Timeout", out value)) o.CommandTimeoutSeconds = ToInt(value);

            if (o.SetDefaults) o.BuildPragmas(map);
            return o;
        }

        // Same keywords, order and conditions as the old library (it ran these PRAGMAs right after open).
        private void BuildPragmas(Dictionary<string, string> map)
        {
            string value;
            if (BusyTimeout != 0)
            {
                Pragmas.Add(string.Format(CultureInfo.InvariantCulture, "PRAGMA busy_timeout={0}", BusyTimeout));
            }
            if (!IsMemory && map.TryGetValue("Page Size", out value))
            {
                int pageSize = ToInt(value);
                if (pageSize != 4096) Pragmas.Add(string.Format(CultureInfo.InvariantCulture, "PRAGMA page_size={0}", pageSize));
            }
            if (map.TryGetValue("Max Page Count", out value))
            {
                int maxPages = ToInt(value);
                if (maxPages != 0) Pragmas.Add(string.Format(CultureInfo.InvariantCulture, "PRAGMA max_page_count={0}", maxPages));
            }
            if (map.TryGetValue("Legacy Format", out value) && ToBool(value))
            {
                Pragmas.Add("PRAGMA legacy_file_format=ON");
            }
            if (map.TryGetValue("Synchronous", out value) && !string.Equals(value, "Default", StringComparison.OrdinalIgnoreCase))
            {
                Pragmas.Add("PRAGMA synchronous=" + Word(value, "Synchronous"));
            }
            if (map.TryGetValue("Cache Size", out value))
            {
                int cacheSize = ToInt(value);
                if (cacheSize != -2000) Pragmas.Add(string.Format(CultureInfo.InvariantCulture, "PRAGMA cache_size={0}", cacheSize));
            }
            if (map.TryGetValue("Journal Mode", out value) && !string.Equals(value, "Default", StringComparison.OrdinalIgnoreCase))
            {
                Pragmas.Add("PRAGMA journal_mode=" + Word(value, "Journal Mode"));
            }
            if (map.TryGetValue("Foreign Keys", out value) && ToBool(value))
            {
                Pragmas.Add("PRAGMA foreign_keys=ON");
            }
            if (map.TryGetValue("Recursive Triggers", out value) && ToBool(value))
            {
                Pragmas.Add("PRAGMA recursive_triggers=ON");
            }
        }

        // Pragma values come from the connection string: only plain words are allowed.
        private static string Word(string value, string keyword)
        {
            if (string.IsNullOrEmpty(value)) throw new ArgumentException("Empty value for " + keyword);
            for (int i = 0; i < value.Length; i++)
            {
                char c = value[i];
                if (!(c >= 'a' && c <= 'z') && !(c >= 'A' && c <= 'Z') && !(c >= '0' && c <= '9') && c != '_')
                {
                    throw new ArgumentException("Invalid value for " + keyword);
                }
            }
            return value;
        }

        private static int ToInt(string value)
        {
            return Convert.ToInt32(value, CultureInfo.InvariantCulture);
        }

        // Accepts the same spellings as the old parser: true/false (any prefix), y/yes/n/no/on/off/1/0.
        private static bool ToBool(string source)
        {
            if (source == null) throw new ArgumentNullException("source");
            if (string.Compare(source, 0, bool.TrueString, 0, source.Length, StringComparison.OrdinalIgnoreCase) == 0) return true;
            if (string.Compare(source, 0, bool.FalseString, 0, source.Length, StringComparison.OrdinalIgnoreCase) == 0) return false;
            switch (source.ToLowerInvariant())
            {
                case "y":
                case "yes":
                case "on":
                case "1":
                    return true;
                case "n":
                case "no":
                case "off":
                case "0":
                    return false;
                default:
                    throw new ArgumentException("source");
            }
        }

        private static string ExpandFileName(string sourceFile, bool toFullPath)
        {
            const string macro = "|DataDirectory|";
            if (sourceFile.StartsWith(macro, StringComparison.OrdinalIgnoreCase))
            {
                string dataDirectory = AppDomain.CurrentDomain.GetData("DataDirectory") as string;
                if (string.IsNullOrEmpty(dataDirectory)) dataDirectory = AppDomain.CurrentDomain.BaseDirectory;
                if (sourceFile.Length > macro.Length && (sourceFile[macro.Length] == Path.DirectorySeparatorChar || sourceFile[macro.Length] == Path.AltDirectorySeparatorChar))
                {
                    sourceFile = sourceFile.Remove(macro.Length, 1);
                }
                sourceFile = Path.Combine(dataDirectory, sourceFile.Substring(macro.Length));
            }
            return toFullPath ? Path.GetFullPath(sourceFile) : sourceFile;
        }

        // Splits on ';' outside single or double quotes.
        private static List<string> Split(string text)
        {
            List<string> parts = new List<string>();
            StringBuilder current = new StringBuilder();
            char quote = '\0';
            for (int i = 0; i < text.Length; i++)
            {
                char c = text[i];
                if (quote != '\0')
                {
                    if (c == quote) quote = '\0';
                    current.Append(c);
                }
                else if (c == '"' || c == '\'')
                {
                    quote = c;
                    current.Append(c);
                }
                else if (c == ';')
                {
                    parts.Add(current.ToString());
                    current.Length = 0;
                }
                else
                {
                    current.Append(c);
                }
            }
            if (quote != '\0') throw new ArgumentException("Invalid ConnectionString format, cannot parse: unbalanced quote");
            parts.Add(current.ToString());
            return parts;
        }

        private static string Unwrap(string value)
        {
            if (value.Length >= 2 && (value[0] == '"' || value[0] == '\'') && value[value.Length - 1] == value[0])
            {
                return value.Substring(1, value.Length - 2);
            }
            return value;
        }
    }
}
