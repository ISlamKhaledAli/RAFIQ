using System;
using System.Data;
using System.Data.Common;
using Microsoft.Data.Sqlite;

namespace RafiqPOS.Data
{
    // Executes through a fresh Microsoft.Data.Sqlite command per call: all statements of the text run (scripts keep working),
    // parameters are converted with the old library's binding rules and provider errors surface as SQLiteException.
    public sealed class SQLiteCommand : DbCommand
    {
        private const string MissingParametersPrefix = "Must add values for the following parameters";

        private string _commandText;
        private SQLiteConnection _connection;
        private SQLiteTransaction _transaction;
        private readonly SQLiteParameterCollection _parameters = new SQLiteParameterCollection();
        private int _commandTimeout = SQLiteConnectionOptions.DefaultCommandTimeoutSeconds;
        private CommandType _commandType = CommandType.Text;
        private UpdateRowSource _updatedRowSource = UpdateRowSource.None;
        private bool _designTimeVisible = true;
        private bool _disposed;

        public SQLiteCommand()
            : this(null, null, null)
        {
        }

        public SQLiteCommand(string commandText)
            : this(commandText, null, null)
        {
        }

        public SQLiteCommand(string commandText, SQLiteConnection connection)
            : this(commandText, connection, null)
        {
        }

        public SQLiteCommand(SQLiteConnection connection)
            : this(null, connection, null)
        {
        }

        public SQLiteCommand(string commandText, SQLiteConnection connection, SQLiteTransaction transaction)
        {
            if (commandText != null) _commandText = commandText;
            if (connection != null) _commandTimeout = connection.DefaultTimeout;
            _connection = connection;
            _transaction = transaction;
        }

        public override string CommandText
        {
            get { return _commandText; }
            set
            {
                CheckDisposed();
                _commandText = value;
            }
        }

        public override int CommandTimeout
        {
            get { return _commandTimeout; }
            set
            {
                CheckDisposed();
                _commandTimeout = value;
            }
        }

        public override CommandType CommandType
        {
            get { return _commandType; }
            set { _commandType = value; }
        }

        public override UpdateRowSource UpdatedRowSource
        {
            get { return _updatedRowSource; }
            set { _updatedRowSource = value; }
        }

        public override bool DesignTimeVisible
        {
            get { return _designTimeVisible; }
            set { _designTimeVisible = value; }
        }

        public new SQLiteConnection Connection
        {
            get { return _connection; }
            set
            {
                CheckDisposed();
                _connection = value;
                if (value != null) _commandTimeout = value.DefaultTimeout;
            }
        }

        protected override DbConnection DbConnection
        {
            get { return _connection; }
            set { _connection = (SQLiteConnection)value; }
        }

        public new SQLiteTransaction Transaction
        {
            get { return _transaction; }
            set { _transaction = value; }
        }

        protected override DbTransaction DbTransaction
        {
            get { return _transaction; }
            set { _transaction = (SQLiteTransaction)value; }
        }

        public new SQLiteParameterCollection Parameters
        {
            get
            {
                CheckDisposed();
                return _parameters;
            }
        }

        protected override DbParameterCollection DbParameterCollection
        {
            get { return Parameters; }
        }

        public override void Cancel()
        {
        }

        public override void Prepare()
        {
        }

        public new SQLiteParameter CreateParameter()
        {
            CheckDisposed();
            return new SQLiteParameter();
        }

        protected override DbParameter CreateDbParameter()
        {
            return CreateParameter();
        }

        public override int ExecuteNonQuery()
        {
            CheckDisposed();
            SqliteCommand provider = CreateProviderCommand();
            try
            {
                // Execute every statement now (the provider would swallow errors of trailing statements on reader disposal).
                using (SqliteDataReader reader = provider.ExecuteReader())
                {
                    while (reader.NextResult())
                    {
                    }
                    return reader.RecordsAffected;
                }
            }
            catch (SqliteException ex)
            {
                throw SQLiteException.FromProvider(ex);
            }
            catch (InvalidOperationException ex)
            {
                throw MapInvalidOperation(ex);
            }
            finally
            {
                provider.Dispose();
            }
        }

        public override object ExecuteScalar()
        {
            CheckDisposed();
            using (SQLiteDataReader reader = ExecuteReader())
            {
                if (reader.Read() && reader.FieldCount > 0) return reader[0];
                return null;
            }
        }

        public new SQLiteDataReader ExecuteReader()
        {
            return ExecuteReader(CommandBehavior.Default);
        }

        public new SQLiteDataReader ExecuteReader(CommandBehavior behavior)
        {
            CheckDisposed();
            SqliteCommand provider = CreateProviderCommand();
            try
            {
                SqliteDataReader reader = provider.ExecuteReader();
                return new SQLiteDataReader(reader, provider, _connection, (behavior & CommandBehavior.CloseConnection) != 0);
            }
            catch (SqliteException ex)
            {
                provider.Dispose();
                throw SQLiteException.FromProvider(ex);
            }
            catch (InvalidOperationException ex)
            {
                provider.Dispose();
                throw MapInvalidOperation(ex);
            }
            catch (Exception)
            {
                provider.Dispose();
                throw;
            }
        }

        protected override DbDataReader ExecuteDbDataReader(CommandBehavior behavior)
        {
            return ExecuteReader(behavior);
        }

        private SqliteCommand CreateProviderCommand()
        {
            if (_connection == null) throw new InvalidOperationException("No connection associated with this command");
            if (_connection.State != ConnectionState.Open) throw new InvalidOperationException("Database is not open");

            SqliteCommand provider = _connection.Provider.CreateCommand();
            try
            {
                provider.CommandText = _commandText ?? string.Empty;
                provider.CommandTimeout = _commandTimeout;
                _parameters.CopyToProvider(provider.Parameters, _connection.Options);
            }
            catch (Exception)
            {
                provider.Dispose();
                throw;
            }
            return provider;
        }

        // The old library raised SQLiteException when a statement had parameters without a value.
        private static Exception MapInvalidOperation(InvalidOperationException ex)
        {
            if (ex.Message != null && ex.Message.StartsWith(MissingParametersPrefix, StringComparison.Ordinal))
            {
                return new SQLiteException("Insufficient parameters supplied to the command", ex);
            }
            return ex;
        }

        private void CheckDisposed()
        {
            if (_disposed) throw new ObjectDisposedException(typeof(SQLiteCommand).Name);
        }

        protected override void Dispose(bool disposing)
        {
            _disposed = true;
            base.Dispose(disposing);
        }
    }
}
