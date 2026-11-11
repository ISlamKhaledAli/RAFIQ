using System;
using System.Data;
using System.Data.Common;

namespace RafiqPOS.Data
{
    // Parameter with the same DbType inference rules as System.Data.SQLite (type is fixed by the first non-null value).
    public sealed class SQLiteParameter : DbParameter
    {
        private const DbType UnknownDbType = (DbType)(-1);

        internal DbType _dbType;
        private DataRowVersion _rowVersion;
        private object _objValue;
        private string _sourceColumn;
        private string _parameterName;
        private int _dataSize;
        private bool _nullable;
        private bool _nullMapping;
        private string _typeName;

        // Parity quirk: the old parameterless constructor left the DbType at 0 (AnsiString), not "unknown".
        public SQLiteParameter()
            : this(null, DbType.AnsiString, 0, null, DataRowVersion.Current)
        {
        }

        public SQLiteParameter(string parameterName)
            : this(parameterName, UnknownDbType, 0, null, DataRowVersion.Current)
        {
        }

        public SQLiteParameter(string parameterName, object value)
            : this(parameterName, UnknownDbType, 0, null, DataRowVersion.Current)
        {
            Value = value;
        }

        public SQLiteParameter(string parameterName, DbType dbType)
            : this(parameterName, dbType, 0, null, DataRowVersion.Current)
        {
        }

        public SQLiteParameter(string parameterName, DbType dbType, string sourceColumn)
            : this(parameterName, dbType, 0, sourceColumn, DataRowVersion.Current)
        {
        }

        public SQLiteParameter(string parameterName, DbType dbType, int parameterSize)
            : this(parameterName, dbType, parameterSize, null, DataRowVersion.Current)
        {
        }

        public SQLiteParameter(string parameterName, DbType dbType, int parameterSize, string sourceColumn)
            : this(parameterName, dbType, parameterSize, sourceColumn, DataRowVersion.Current)
        {
        }

        public SQLiteParameter(DbType dbType)
            : this(null, dbType, 0, null, DataRowVersion.Current)
        {
        }

        public SQLiteParameter(DbType dbType, object value)
            : this(null, dbType, 0, null, DataRowVersion.Current)
        {
            Value = value;
        }

        public SQLiteParameter(string parameterName, DbType dbType, int parameterSize, string sourceColumn, DataRowVersion rowVersion)
        {
            _parameterName = parameterName;
            _dbType = dbType;
            _sourceColumn = sourceColumn;
            _rowVersion = rowVersion;
            _objValue = null;
            _dataSize = parameterSize;
            _nullable = true;
            _nullMapping = false;
        }

        public override bool IsNullable
        {
            get { return _nullable; }
            set { _nullable = value; }
        }

        public override DbType DbType
        {
            get
            {
                if (_dbType == UnknownDbType)
                {
                    if (_objValue != null && _objValue != DBNull.Value) return SQLiteValueConverter.TypeToDbType(_objValue.GetType());
                    return DbType.String;
                }
                return _dbType;
            }
            set { _dbType = value; }
        }

        public override ParameterDirection Direction
        {
            get { return ParameterDirection.Input; }
            set
            {
                if (value != ParameterDirection.Input) throw new NotSupportedException();
            }
        }

        public override string ParameterName
        {
            get { return _parameterName; }
            set { _parameterName = value; }
        }

        public override int Size
        {
            get { return _dataSize; }
            set { _dataSize = value; }
        }

        public override string SourceColumn
        {
            get { return _sourceColumn; }
            set { _sourceColumn = value; }
        }

        public override bool SourceColumnNullMapping
        {
            get { return _nullMapping; }
            set { _nullMapping = value; }
        }

        public override DataRowVersion SourceVersion
        {
            get { return _rowVersion; }
            set { _rowVersion = value; }
        }

        public override object Value
        {
            get { return _objValue; }
            set
            {
                _objValue = value;
                if (_dbType == UnknownDbType && _objValue != null && _objValue != DBNull.Value)
                {
                    _dbType = SQLiteValueConverter.TypeToDbType(_objValue.GetType());
                }
            }
        }

        public string TypeName
        {
            get { return _typeName; }
            set { _typeName = value; }
        }

        public override void ResetDbType()
        {
            _dbType = UnknownDbType;
        }
    }
}
