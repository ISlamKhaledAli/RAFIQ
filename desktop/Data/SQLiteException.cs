using System;
using System.Data.Common;
using System.Globalization;
using Microsoft.Data.Sqlite;

namespace RafiqPOS.Data
{
    // Same shape as the former System.Data.SQLite exception: ResultCode is the primary SQLite result code.
    public sealed class SQLiteException : DbException
    {
        private const string MdsPrefix = "SQLite Error ";

        private readonly SQLiteErrorCode _errorCode;
        private readonly int _extendedErrorCode;

        public SQLiteErrorCode ResultCode
        {
            get { return _errorCode; }
        }

        // Extended result code reported by SQLite (equals the primary code when SQLite gave no extended detail).
        public int ExtendedResultCode
        {
            get { return _extendedErrorCode; }
        }

        public override int ErrorCode
        {
            get { return (int)_errorCode; }
        }

        public SQLiteException(SQLiteErrorCode errorCode, string message)
            : base(StockMessage(errorCode, message))
        {
            _errorCode = errorCode;
            _extendedErrorCode = (int)errorCode;
        }

        public SQLiteException(string message)
            : this(SQLiteErrorCode.Unknown, message)
        {
        }

        public SQLiteException()
        {
            _errorCode = SQLiteErrorCode.Unknown;
            _extendedErrorCode = (int)SQLiteErrorCode.Unknown;
        }

        public SQLiteException(string message, Exception innerException)
            : base(message, innerException)
        {
            _errorCode = SQLiteErrorCode.Unknown;
            _extendedErrorCode = (int)SQLiteErrorCode.Unknown;
        }

        private SQLiteException(SQLiteErrorCode errorCode, int extendedErrorCode, string message, Exception inner)
            : base(message, inner)
        {
            _errorCode = errorCode;
            _extendedErrorCode = extendedErrorCode;
        }

        internal static SQLiteException FromProvider(SqliteException ex)
        {
            int primary = ex.SqliteErrorCode & 0xFF;
            int extended = ex.SqliteExtendedErrorCode;
            if (extended == 0) extended = ex.SqliteErrorCode;
            SQLiteErrorCode code = (SQLiteErrorCode)primary;
            return new SQLiteException(code, extended, StockMessage(code, ExtractProviderMessage(ex.Message)), ex);
        }

        // Runs an action and converts provider exceptions to SQLiteException.
        internal static void Wrap(Action action)
        {
            try
            {
                action();
            }
            catch (SqliteException ex)
            {
                throw FromProvider(ex);
            }
        }

        internal static T Wrap<T>(Func<T> func)
        {
            try
            {
                return func();
            }
            catch (SqliteException ex)
            {
                throw FromProvider(ex);
            }
        }

        // Microsoft.Data.Sqlite formats: SQLite Error 19: 'UNIQUE constraint failed: t.c'.
        private static string ExtractProviderMessage(string message)
        {
            if (message == null) return string.Empty;
            int colon = message.IndexOf(": '", StringComparison.Ordinal);
            if (message.StartsWith(MdsPrefix, StringComparison.Ordinal) && colon > 0 && message.EndsWith("'.", StringComparison.Ordinal))
            {
                return message.Substring(colon + 3, message.Length - colon - 5);
            }
            return message;
        }

        // Old library message layout: <generic result text> + new line + <sqlite3_errmsg text>.
        private static string StockMessage(SQLiteErrorCode code, string message)
        {
            return string.Format(CultureInfo.CurrentCulture, "{0}{1}{2}", ErrorString(code), Environment.NewLine, message).Trim();
        }

        private static string ErrorString(SQLiteErrorCode code)
        {
            try
            {
                SQLiteNative.EnsureInitialized();
                string text = SQLitePCL.raw.sqlite3_errstr((int)code).utf8_to_string();
                return text ?? string.Empty;
            }
            catch (Exception)
            {
                return string.Empty;
            }
        }

        public override string ToString()
        {
            return string.Format(CultureInfo.CurrentCulture, "code = {0} ({1}), message = {2}", _errorCode, (int)_errorCode, base.ToString());
        }
    }
}
