using System;
using System.Collections;
using System.Collections.Generic;
using System.Data;
using System.Data.Common;

namespace RafiqPOS.Data
{
    public sealed class SQLiteParameterCollection : DbParameterCollection
    {
        private readonly List<SQLiteParameter> _parameters = new List<SQLiteParameter>();

        internal SQLiteParameterCollection()
        {
        }

        public override bool IsSynchronized
        {
            get { return false; }
        }

        public override bool IsFixedSize
        {
            get { return false; }
        }

        public override bool IsReadOnly
        {
            get { return false; }
        }

        public override object SyncRoot
        {
            get { return ((IList)_parameters).SyncRoot; }
        }

        public override int Count
        {
            get { return _parameters.Count; }
        }

        public new SQLiteParameter this[string parameterName]
        {
            get { return (SQLiteParameter)GetParameter(parameterName); }
            set { SetParameter(parameterName, value); }
        }

        public new SQLiteParameter this[int index]
        {
            get { return (SQLiteParameter)GetParameter(index); }
            set { SetParameter(index, value); }
        }

        public override IEnumerator GetEnumerator()
        {
            return _parameters.GetEnumerator();
        }

        public SQLiteParameter Add(string parameterName, DbType parameterType, int parameterSize, string sourceColumn)
        {
            SQLiteParameter parameter = new SQLiteParameter(parameterName, parameterType, parameterSize, sourceColumn);
            Add(parameter);
            return parameter;
        }

        public SQLiteParameter Add(string parameterName, DbType parameterType, int parameterSize)
        {
            SQLiteParameter parameter = new SQLiteParameter(parameterName, parameterType, parameterSize);
            Add(parameter);
            return parameter;
        }

        public SQLiteParameter Add(string parameterName, DbType parameterType)
        {
            SQLiteParameter parameter = new SQLiteParameter(parameterName, parameterType);
            Add(parameter);
            return parameter;
        }

        public int Add(SQLiteParameter parameter)
        {
            if (parameter == null) throw new ArgumentNullException("parameter");
            _parameters.Add(parameter);
            return _parameters.Count - 1;
        }

        public override int Add(object value)
        {
            return Add((SQLiteParameter)value);
        }

        public SQLiteParameter AddWithValue(string parameterName, object value)
        {
            SQLiteParameter parameter = new SQLiteParameter(parameterName, value);
            Add(parameter);
            return parameter;
        }

        public void AddRange(SQLiteParameter[] values)
        {
            if (values == null) throw new ArgumentNullException("values");
            for (int i = 0; i < values.Length; i++) Add(values[i]);
        }

        public override void AddRange(Array values)
        {
            if (values == null) throw new ArgumentNullException("values");
            foreach (object value in values) Add((SQLiteParameter)value);
        }

        public override void Clear()
        {
            _parameters.Clear();
        }

        public override bool Contains(string parameterName)
        {
            return IndexOf(parameterName) != -1;
        }

        public override bool Contains(object value)
        {
            return _parameters.Contains((SQLiteParameter)value);
        }

        public override void CopyTo(Array array, int index)
        {
            ((ICollection)_parameters).CopyTo(array, index);
        }

        public override int IndexOf(string parameterName)
        {
            for (int i = 0; i < _parameters.Count; i++)
            {
                if (string.Compare(parameterName, _parameters[i].ParameterName, StringComparison.OrdinalIgnoreCase) == 0) return i;
            }
            return -1;
        }

        public override int IndexOf(object value)
        {
            return _parameters.IndexOf((SQLiteParameter)value);
        }

        public override void Insert(int index, object value)
        {
            _parameters.Insert(index, (SQLiteParameter)value);
        }

        public override void Remove(object value)
        {
            _parameters.Remove((SQLiteParameter)value);
        }

        public override void RemoveAt(string parameterName)
        {
            RemoveAt(IndexOf(parameterName));
        }

        public override void RemoveAt(int index)
        {
            _parameters.RemoveAt(index);
        }

        protected override DbParameter GetParameter(string parameterName)
        {
            return GetParameter(IndexOf(parameterName));
        }

        protected override DbParameter GetParameter(int index)
        {
            return _parameters[index];
        }

        protected override void SetParameter(string parameterName, DbParameter value)
        {
            SetParameter(IndexOf(parameterName), value);
        }

        protected override void SetParameter(int index, DbParameter value)
        {
            _parameters[index] = (SQLiteParameter)value;
        }

        // Copies the parameters to a provider command, converting each value to the form the old library would have bound.
        internal void CopyToProvider(Microsoft.Data.Sqlite.SqliteParameterCollection target, SQLiteConnectionOptions options)
        {
            for (int i = 0; i < _parameters.Count; i++)
            {
                SQLiteParameter source = _parameters[i];
                Microsoft.Data.Sqlite.SqliteParameter converted = new Microsoft.Data.Sqlite.SqliteParameter();
                converted.ParameterName = source.ParameterName;
                converted.Value = SQLiteValueConverter.ToProviderValue(source, options);
                target.Add(converted);
            }
        }
    }
}
