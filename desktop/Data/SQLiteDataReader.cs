using System;
using System.Collections;
using System.Collections.Generic;
using System.Data;
using System.Data.Common;
using System.Globalization;
using System.Text;
using Microsoft.Data.Sqlite;

namespace RafiqPOS.Data
{
    // Wraps the Microsoft.Data.Sqlite reader and restores the System.Data.SQLite typing rules: values follow the declared column
    // type (INT -> Int32, INTEGER -> Int64, TEXT -> string, DATETIME -> DateTime, ...), expressions follow the stored value,
    // typed getters verify the stored type, GetOrdinal returns -1 for unknown names.
    public sealed class SQLiteDataReader : DbDataReader
    {
        private enum Storage
        {
            Null,
            Int64,
            Double,
            Text,
            Blob
        }

        private readonly SqliteDataReader _reader;
        private readonly SqliteCommand _providerCommand;
        private readonly SQLiteConnection _connection;
        private readonly bool _closeConnection;
        private bool _closed;

        // Per result set caches.
        private DbType?[] _declared;
        private Dictionary<string, int> _ordinals;

        internal SQLiteDataReader(SqliteDataReader reader, SqliteCommand providerCommand, SQLiteConnection connection, bool closeConnection)
        {
            _reader = reader;
            _providerCommand = providerCommand;
            _connection = connection;
            _closeConnection = closeConnection;
        }

        public override int Depth
        {
            get { return 0; }
        }

        public override int FieldCount
        {
            get
            {
                CheckClosed();
                return _reader.FieldCount;
            }
        }

        public override int VisibleFieldCount
        {
            get { return FieldCount; }
        }

        public override bool HasRows
        {
            get
            {
                CheckClosed();
                return _reader.HasRows;
            }
        }

        public override bool IsClosed
        {
            get { return _closed; }
        }

        public override int RecordsAffected
        {
            get { return _reader.RecordsAffected; }
        }

        public override object this[string name]
        {
            get
            {
                int ordinal = GetOrdinal(name);
                if (ordinal < 0) throw new IndexOutOfRangeException(name);
                return GetValue(ordinal);
            }
        }

        public override object this[int ordinal]
        {
            get { return GetValue(ordinal); }
        }

        public override bool Read()
        {
            CheckClosed();
            try
            {
                return _reader.Read();
            }
            catch (SqliteException ex)
            {
                throw SQLiteException.FromProvider(ex);
            }
        }

        public override bool NextResult()
        {
            CheckClosed();
            _declared = null;
            _ordinals = null;
            try
            {
                return _reader.NextResult();
            }
            catch (SqliteException ex)
            {
                throw SQLiteException.FromProvider(ex);
            }
        }

        public override void Close()
        {
            CloseCore();
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing) CloseCore();
            base.Dispose(disposing);
        }

        // Disposes the provider reader first so the remaining statements of a multi-statement text still run (errors there are swallowed, as before).
        private void CloseCore()
        {
            if (_closed) return;
            _closed = true;
            try
            {
                _reader.Dispose();
            }
            finally
            {
                _providerCommand.Dispose();
                if (_closeConnection && _connection != null) _connection.Close();
            }
        }

        public override IEnumerator GetEnumerator()
        {
            return new DbEnumerator(this);
        }

        public override string GetName(int ordinal)
        {
            CheckClosed();
            return _reader.GetName(ordinal);
        }

        // Unlike the provider, an unknown name returns -1 (callers test for it).
        public override int GetOrdinal(string name)
        {
            CheckClosed();
            if (_ordinals == null)
            {
                Dictionary<string, int> map = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
                int count = _reader.FieldCount;
                for (int i = 0; i < count; i++)
                {
                    string column = _reader.GetName(i);
                    if (!map.ContainsKey(column)) map.Add(column, i);
                }
                _ordinals = map;
            }
            int found;
            return _ordinals.TryGetValue(name, out found) ? found : -1;
        }

        public override string GetDataTypeName(int ordinal)
        {
            CheckClosed();
            return _reader.GetDataTypeName(ordinal);
        }

        public override Type GetFieldType(int ordinal)
        {
            CheckClosed();
            DbType declared = SQLiteValueConverter.DeclaredTypeToDbType(_reader.GetDataTypeName(ordinal));
            if (declared == DbType.Object) return _reader.GetFieldType(ordinal);
            switch (declared)
            {
                case DbType.Binary:
                    return typeof(byte[]);
                case DbType.Guid:
                    return typeof(Guid);
                case DbType.Boolean:
                    return typeof(bool);
                case DbType.SByte:
                    return typeof(sbyte);
                case DbType.Byte:
                    return typeof(byte);
                case DbType.Int16:
                    return typeof(short);
                case DbType.UInt16:
                    return typeof(ushort);
                case DbType.Int32:
                    return typeof(int);
                case DbType.UInt32:
                    return typeof(uint);
                case DbType.Int64:
                    return typeof(long);
                case DbType.UInt64:
                    return typeof(ulong);
                case DbType.Single:
                    return typeof(float);
                case DbType.Double:
                case DbType.VarNumeric:
                    return typeof(double);
                case DbType.Currency:
                case DbType.Decimal:
                    return typeof(decimal);
                case DbType.Date:
                case DbType.DateTime:
                case DbType.Time:
                case DbType.DateTime2:
                    return typeof(DateTime);
                default:
                    return typeof(string);
            }
        }

        public override bool IsDBNull(int ordinal)
        {
            CheckClosed();
            return _reader.IsDBNull(ordinal);
        }

        public override object GetValue(int ordinal)
        {
            CheckClosed();
            object raw = _reader.GetValue(ordinal);
            if (raw == null || raw is DBNull) return DBNull.Value;

            if (_declared == null) _declared = new DbType?[_reader.FieldCount];
            DbType? cached = _declared[ordinal];
            if (!cached.HasValue)
            {
                cached = SQLiteValueConverter.DeclaredTypeToDbType(_reader.GetDataTypeName(ordinal));
                _declared[ordinal] = cached;
            }
            DbType declared = cached.Value;
            if (!IsNaturalStorage(SQLiteValueConverter.FamilyOf(declared), raw))
            {
                // Stored value differs from the cached declared type (dirty data or an expression whose type varies per row): re-read it.
                declared = SQLiteValueConverter.DeclaredTypeToDbType(_reader.GetDataTypeName(ordinal));
            }
            return ConvertDeclared(ordinal, declared, raw);
        }

        public override int GetValues(object[] values)
        {
            if (values == null) throw new ArgumentNullException("values");
            int count = FieldCount;
            if (values.Length < count) count = values.Length;
            for (int i = 0; i < count; i++) values[i] = GetValue(i);
            return count;
        }

        public override string GetString(int ordinal)
        {
            VerifyType(ordinal, DbType.String);
            return _reader.GetString(ordinal);
        }

        public override bool GetBoolean(int ordinal)
        {
            VerifyType(ordinal, DbType.Boolean);
            return Convert.ToBoolean(GetValue(ordinal), CultureInfo.CurrentCulture);
        }

        public override byte GetByte(int ordinal)
        {
            VerifyType(ordinal, DbType.Byte);
            return (byte)((uint)StoredInt32(ordinal) & 0xFFu);
        }

        public override short GetInt16(int ordinal)
        {
            VerifyType(ordinal, DbType.Int16);
            return (short)(StoredInt32(ordinal) & 0xFFFF);
        }

        public override int GetInt32(int ordinal)
        {
            VerifyType(ordinal, DbType.Int32);
            return StoredInt32(ordinal);
        }

        public override long GetInt64(int ordinal)
        {
            VerifyType(ordinal, DbType.Int64);
            return _reader.GetInt64(ordinal);
        }

        public override float GetFloat(int ordinal)
        {
            VerifyType(ordinal, DbType.Single);
            return (float)_reader.GetDouble(ordinal);
        }

        public override double GetDouble(int ordinal)
        {
            VerifyType(ordinal, DbType.Double);
            return _reader.GetDouble(ordinal);
        }

        public override decimal GetDecimal(int ordinal)
        {
            VerifyType(ordinal, DbType.Decimal);
            return decimal.Parse(_reader.GetString(ordinal), NumberStyles.Float, CultureInfo.CurrentCulture);
        }

        public override DateTime GetDateTime(int ordinal)
        {
            VerifyType(ordinal, DbType.DateTime);
            return SQLiteValueConverter.ParseDateTime(_reader.GetString(ordinal), _connection.Options.DateTimeKind);
        }

        public override Guid GetGuid(int ordinal)
        {
            Storage storage = VerifyType(ordinal, DbType.Guid);
            if (storage == Storage.Blob)
            {
                byte[] bytes = (byte[])_reader.GetValue(ordinal);
                return new Guid(bytes);
            }
            return new Guid(_reader.GetString(ordinal));
        }

        public override long GetBytes(int ordinal, long dataOffset, byte[] buffer, int bufferOffset, int length)
        {
            VerifyType(ordinal, DbType.Binary);
            return _reader.GetBytes(ordinal, dataOffset, buffer, bufferOffset, length);
        }

        public override char GetChar(int ordinal)
        {
            throw new NotSupportedException();
        }

        public override long GetChars(int ordinal, long dataOffset, char[] buffer, int bufferOffset, int length)
        {
            throw new NotSupportedException();
        }

        // sqlite3_column_int semantics: no overflow check, text is coerced.
        private int StoredInt32(int ordinal)
        {
            return unchecked((int)_reader.GetInt64(ordinal));
        }

        private Storage StorageOf(int ordinal)
        {
            if (_reader.IsDBNull(ordinal)) return Storage.Null;
            Type type = _reader.GetFieldType(ordinal);
            if (type == typeof(long)) return Storage.Int64;
            if (type == typeof(double)) return Storage.Double;
            if (type == typeof(string)) return Storage.Text;
            return Storage.Blob;
        }

        // Old VerifyType: a typed getter only accepts the stored types listed here, otherwise InvalidCastException.
        private Storage VerifyType(int ordinal, DbType requested)
        {
            CheckClosed();
            Storage storage = StorageOf(ordinal);
            switch (storage)
            {
                case Storage.Int64:
                    switch (requested)
                    {
                        case DbType.Int64:
                        case DbType.Int32:
                        case DbType.Int16:
                        case DbType.Byte:
                        case DbType.SByte:
                        case DbType.Boolean:
                        case DbType.DateTime:
                        case DbType.Double:
                        case DbType.Single:
                        case DbType.Decimal:
                            return storage;
                    }
                    break;
                case Storage.Double:
                    switch (requested)
                    {
                        case DbType.Double:
                        case DbType.Single:
                        case DbType.Decimal:
                        case DbType.DateTime:
                            return storage;
                    }
                    break;
                case Storage.Text:
                    switch (requested)
                    {
                        case DbType.String:
                        case DbType.Guid:
                        case DbType.DateTime:
                        case DbType.Decimal:
                            return storage;
                    }
                    break;
                case Storage.Blob:
                    switch (requested)
                    {
                        case DbType.Guid:
                        case DbType.Binary:
                        case DbType.String:
                            return storage;
                    }
                    break;
            }
            throw new InvalidCastException();
        }

        private static bool IsNaturalStorage(SQLiteValueConverter.Family family, object raw)
        {
            switch (family)
            {
                case SQLiteValueConverter.Family.Object:
                    return true;
                case SQLiteValueConverter.Family.Int64:
                    return raw is long;
                case SQLiteValueConverter.Family.Double:
                    return raw is double;
                case SQLiteValueConverter.Family.Blob:
                    return raw is byte[];
                default:
                    return raw is string;
            }
        }

        // Old SQLite3.GetValue: the declared type decides the .NET type, the stored value is coerced the way SQLite does.
        private object ConvertDeclared(int ordinal, DbType declared, object raw)
        {
            SQLiteValueConverter.Family family = SQLiteValueConverter.FamilyOf(declared);
            switch (family)
            {
                case SQLiteValueConverter.Family.Object:
                    return raw;

                case SQLiteValueConverter.Family.Blob:
                    {
                        if (declared == DbType.Guid && raw is string) return new Guid((string)raw);
                        byte[] bytes = raw as byte[];
                        if (bytes == null) bytes = Encoding.UTF8.GetBytes(_reader.GetString(ordinal));
                        if (declared == DbType.Guid && bytes.Length == 16) return new Guid(bytes);
                        return bytes;
                    }

                case SQLiteValueConverter.Family.DateTime:
                    return SQLiteValueConverter.ParseDateTime(_reader.GetString(ordinal), _connection.Options.DateTimeKind);

                case SQLiteValueConverter.Family.Double:
                    {
                        double value = raw is double ? (double)raw : _reader.GetDouble(ordinal);
                        switch (declared)
                        {
                            case DbType.Single:
                                return Convert.ToSingle(value, CultureInfo.CurrentCulture);
                            case DbType.Decimal:
                            case DbType.Currency:
                                return Convert.ToDecimal(value, CultureInfo.CurrentCulture);
                            default:
                                return value;
                        }
                    }

                case SQLiteValueConverter.Family.Int64:
                    switch (declared)
                    {
                        case DbType.Boolean:
                            return StoredBoolean(raw);
                        case DbType.SByte:
                            return (sbyte)(StoredInt32(ordinal) & 0xFF);
                        case DbType.Byte:
                            return (byte)((uint)StoredInt32(ordinal) & 0xFFu);
                        case DbType.Int16:
                            return (short)(StoredInt32(ordinal) & 0xFFFF);
                        case DbType.UInt16:
                            return (ushort)((uint)StoredInt32(ordinal) & 0xFFFFu);
                        case DbType.Int32:
                            return StoredInt32(ordinal);
                        case DbType.UInt32:
                            return unchecked((uint)StoredInt32(ordinal));
                        case DbType.UInt64:
                            return unchecked((ulong)_reader.GetInt64(ordinal));
                        default:
                            return raw is long ? raw : (object)_reader.GetInt64(ordinal);
                    }

                default:
                    return raw is string ? raw : _reader.GetString(ordinal);
            }
        }

        private static bool StoredBoolean(object raw)
        {
            if (raw is long) return (long)raw != 0;
            if (raw is double) return (double)raw != 0.0;
            string text = raw as string;
            if (text != null) return SQLiteValueConverter.TextToBoolean(text);
            throw new SQLiteException("Cannot convert type Object to boolean");
        }

        private void CheckClosed()
        {
            if (_closed) throw new InvalidOperationException("DataReader has been closed");
        }
    }
}
