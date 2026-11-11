using System;
using System.Collections.Generic;
using System.Data;
using System.Globalization;

namespace RafiqPOS.Data
{
    // Re-implementation of the System.Data.SQLite 1.0.118 value rules (parameter binding, declared-type mapping, DateTime text).
    internal static class SQLiteValueConverter
    {
        // Old default DateTime texts (ISO8601): local/unspecified drops the zone, UTC keeps the "Z" suffix.
        private const string LocalDateFormat = "yyyy-MM-dd HH:mm:ss.FFFFFFF";
        private const string UtcDateFormat = "yyyy-MM-dd HH:mm:ss.FFFFFFFK";

        private static readonly string[] ParseFormats = new string[]
        {
            "THHmmssK", "THHmmK", "HH:mm:ss.FFFFFFFK", "HH:mm:ssK", "HH:mmK", "yyyy-MM-dd HH:mm:ss.FFFFFFFK", "yyyy-MM-dd HH:mm:ssK", "yyyy-MM-dd HH:mmK", "yyyy-MM-ddTHH:mm:ss.FFFFFFFK", "yyyy-MM-ddTHH:mmK",
            "yyyy-MM-ddTHH:mm:ssK", "yyyyMMddHHmmssK", "yyyyMMddHHmmK", "yyyyMMddTHHmmssFFFFFFFK", "THHmmss", "THHmm", "HH:mm:ss.FFFFFFF", "HH:mm:ss", "HH:mm", "yyyy-MM-dd HH:mm:ss.FFFFFFF",
            "yyyy-MM-dd HH:mm:ss", "yyyy-MM-dd HH:mm", "yyyy-MM-ddTHH:mm:ss.FFFFFFF", "yyyy-MM-ddTHH:mm", "yyyy-MM-ddTHH:mm:ss", "yyyyMMddHHmmss", "yyyyMMddHHmm", "yyyyMMddTHHmmssFFFFFFF", "yyyy-MM-dd", "yyyyMMdd",
            "yy-MM-dd"
        };

        // TypeCode -> DbType as in the old library (index = (int)TypeCode).
        private static readonly DbType[] TypeCodeToDbType = new DbType[]
        {
            DbType.Object, DbType.Binary, DbType.Object, DbType.Boolean, DbType.SByte, DbType.SByte, DbType.Byte, DbType.Int16,
            DbType.UInt16, DbType.Int32, DbType.UInt32, DbType.Int64, DbType.UInt64, DbType.Single, DbType.Double, DbType.Decimal,
            DbType.DateTime, DbType.Object, DbType.String
        };

        private static readonly Dictionary<string, DbType> DeclaredTypes = BuildDeclaredTypes();

        private static Dictionary<string, DbType> BuildDeclaredTypes()
        {
            Dictionary<string, DbType> map = new Dictionary<string, DbType>(StringComparer.OrdinalIgnoreCase);
            Add(map, DbType.Int64, "BIGINT", "COUNTER", "IDENTITY", "INT64", "INTEGER", "INTEGER64", "LONG");
            Add(map, DbType.UInt64, "BIGUINT", "UINT64", "ULONG", "UNSIGNEDINTEGER", "UNSIGNEDINTEGER64");
            Add(map, DbType.Binary, "BINARY", "BLOB", "GENERAL", "IMAGE", "OLEOBJECT", "RAW", "VARBINARY");
            Add(map, DbType.Boolean, "BIT", "BOOL", "BOOLEAN", "LOGICAL", "YESNO");
            Add(map, DbType.AnsiStringFixedLength, "CHAR");
            Add(map, DbType.String, "CLOB", "LONGCHAR", "LONGTEXT", "LONGVARCHAR", "MEMO", "NOTE", "NTEXT", "NVARCHAR", "STRING", "TEXT");
            Add(map, DbType.Decimal, "CURRENCY", "DECIMAL", "DECIMALTEXT", "MONEY", "NUMBER", "NUMERIC", "NUMERICTEXT");
            Add(map, DbType.DateTime, "DATE", "DATETIME", "SMALLDATE", "TIME", "TIMESTAMP");
            Add(map, DbType.Double, "DOUBLE", "FLOAT", "REAL");
            Add(map, DbType.Guid, "GUID", "UNIQUEIDENTIFIER");
            Add(map, DbType.Int32, "INT", "INT32", "INTEGER32", "MEDIUMINT");
            Add(map, DbType.SByte, "INT8", "INTEGER8", "TINYSINT");
            Add(map, DbType.Int16, "INT16", "INTEGER16", "SMALLINT");
            Add(map, DbType.UInt32, "MEDIUMUINT", "UINT", "UINT32", "UNSIGNEDINTEGER32");
            Add(map, DbType.StringFixedLength, "NCHAR");
            Add(map, DbType.Single, "SINGLE");
            Add(map, DbType.UInt16, "SMALLUINT", "UINT16", "UNSIGNEDINTEGER16");
            Add(map, DbType.Byte, "TINYINT", "UINT8", "UNSIGNEDINTEGER8");
            Add(map, DbType.AnsiString, "VARCHAR", "VARCHAR2");
            return map;
        }

        private static void Add(Dictionary<string, DbType> map, DbType type, params string[] names)
        {
            for (int i = 0; i < names.Length; i++) map[names[i]] = type;
        }

        // Declared column type name -> DbType; unknown names (and expressions) map to Object = "use the stored value".
        internal static DbType DeclaredTypeToDbType(string typeName)
        {
            if (typeName == null) return DbType.Object;
            DbType found;
            if (DeclaredTypes.TryGetValue(typeName, out found)) return found;
            int paren = typeName.IndexOf('(');
            if (paren > 0 && DeclaredTypes.TryGetValue(typeName.Substring(0, paren).TrimEnd(), out found)) return found;
            return DbType.Object;
        }

        internal static DbType TypeToDbType(Type type)
        {
            TypeCode code = Type.GetTypeCode(type);
            if (code == TypeCode.Object)
            {
                if (type == typeof(byte[])) return DbType.Binary;
                if (type == typeof(Guid)) return DbType.Guid;
                return DbType.String;
            }
            return TypeCodeToDbType[(int)code];
        }

        // What the old reader treated as the natural storage family of a declared type.
        internal enum Family
        {
            Object,
            Int64,
            Double,
            Text,
            Blob,
            DateTime
        }

        internal static Family FamilyOf(DbType type)
        {
            switch (type)
            {
                case DbType.Object:
                    return Family.Object;
                case DbType.Binary:
                case DbType.Guid:
                    return Family.Blob;
                case DbType.Boolean:
                case DbType.SByte:
                case DbType.Byte:
                case DbType.Int16:
                case DbType.UInt16:
                case DbType.Int32:
                case DbType.UInt32:
                case DbType.Int64:
                case DbType.UInt64:
                    return Family.Int64;
                case DbType.Currency:
                case DbType.Decimal:
                case DbType.Double:
                case DbType.Single:
                case DbType.VarNumeric:
                    return Family.Double;
                case DbType.Date:
                case DbType.DateTime:
                case DbType.Time:
                case DbType.DateTime2:
                    return Family.DateTime;
                default:
                    return Family.Text;
            }
        }

        internal static string FormatDateTime(DateTime value, DateTimeKind connectionKind)
        {
            if (value.Kind != DateTimeKind.Unspecified)
            {
                return value.ToString(value.Kind == DateTimeKind.Utc ? UtcDateFormat : LocalDateFormat, CultureInfo.InvariantCulture);
            }
            return DateTime.SpecifyKind(value, connectionKind).ToString(connectionKind != DateTimeKind.Utc ? LocalDateFormat : UtcDateFormat, CultureInfo.InvariantCulture);
        }

        internal static DateTime ParseDateTime(string text, DateTimeKind connectionKind)
        {
            DateTimeStyles styles = connectionKind == DateTimeKind.Utc ? DateTimeStyles.AdjustToUniversal : DateTimeStyles.None;
            return DateTime.SpecifyKind(DateTime.ParseExact(text, ParseFormats, DateTimeFormatInfo.InvariantInfo, styles), connectionKind);
        }

        internal static string ToStringWithProvider(object value, IFormatProvider provider)
        {
            if (value == null) return null;
            string text = value as string;
            if (text != null) return text;
            IConvertible convertible = value as IConvertible;
            if (convertible != null) return convertible.ToString(provider);
            return value.ToString();
        }

        // Old ToBoolean(object, provider, viaFramework: true) for parameter values.
        internal static bool ToBoolean(object value, IFormatProvider provider)
        {
            if (value == null) return false;
            switch (Type.GetTypeCode(value.GetType()))
            {
                case TypeCode.Empty:
                case TypeCode.DBNull:
                    return false;
                case TypeCode.Boolean:
                    return (bool)value;
                case TypeCode.Char:
                    return (char)value != '\0';
                case TypeCode.SByte:
                    return (sbyte)value != 0;
                case TypeCode.Byte:
                    return (byte)value != 0;
                case TypeCode.Int16:
                    return (short)value != 0;
                case TypeCode.UInt16:
                    return (ushort)value != 0;
                case TypeCode.Int32:
                    return (int)value != 0;
                case TypeCode.UInt32:
                    return (uint)value != 0;
                case TypeCode.Int64:
                    return (long)value != 0L;
                case TypeCode.UInt64:
                    return (ulong)value != 0UL;
                case TypeCode.Single:
                    return (float)value != 0f;
                case TypeCode.Double:
                    return (double)value != 0.0;
                case TypeCode.Decimal:
                    return (decimal)value != 0m;
                case TypeCode.String:
                    return Convert.ToBoolean(value, provider);
                default:
                    throw new SQLiteException(string.Format(CultureInfo.CurrentCulture, "Cannot convert type {0} to boolean", Type.GetTypeCode(value.GetType())));
            }
        }

        // Old string -> bool used when reading a BOOLEAN column stored as text.
        internal static bool TextToBoolean(string source)
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

        // Converts a parameter value to the object handed to Microsoft.Data.Sqlite so SQLite stores exactly what the old library stored:
        // long (INTEGER), double (REAL), string (TEXT), byte[] (BLOB) or DBNull.
        internal static object ToProviderValue(SQLiteParameter parameter, SQLiteConnectionOptions options)
        {
            object value = parameter.Value;
            DbType dbType = parameter.DbType;
            if (value != null && dbType == DbType.Object) dbType = TypeToDbType(value.GetType());
            if (value == null || Convert.IsDBNull(value)) return DBNull.Value;

            CultureInfo provider = CultureInfo.CurrentCulture;
            switch (dbType)
            {
                case DbType.Date:
                case DbType.DateTime:
                case DbType.Time:
                    {
                        string text = value as string;
                        DateTime date = text != null ? ParseDateTime(text, options.DateTimeKind) : Convert.ToDateTime(value, provider);
                        return FormatDateTime(date, options.DateTimeKind);
                    }
                case DbType.Boolean:
                    return ToBoolean(value, provider) ? 1L : 0L;
                case DbType.SByte:
                    return (long)Convert.ToSByte(value, provider);
                case DbType.Int16:
                    return (long)Convert.ToInt16(value, provider);
                case DbType.Int32:
                    return (long)Convert.ToInt32(value, provider);
                case DbType.Int64:
                    return Convert.ToInt64(value, provider);
                case DbType.Byte:
                    return (long)Convert.ToByte(value, provider);
                case DbType.UInt16:
                    return (long)Convert.ToUInt16(value, provider);
                case DbType.UInt32:
                    return (long)Convert.ToUInt32(value, provider);
                case DbType.UInt64:
                    return unchecked((long)Convert.ToUInt64(value, provider));
                case DbType.Currency:
                case DbType.Double:
                case DbType.Single:
                    return Convert.ToDouble(value, provider);
                case DbType.Binary:
                    return (byte[])value;
                case DbType.Guid:
                    if (options.BinaryGuid) return ((Guid)value).ToByteArray();
                    return ToStringWithProvider(value, provider);
                case DbType.Decimal:
                    return ToStringWithProvider(Convert.ToDecimal(value, provider), provider);
                default:
                    return ToStringWithProvider(value, provider);
            }
        }
    }
}
