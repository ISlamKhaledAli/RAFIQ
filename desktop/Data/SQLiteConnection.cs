using System;
using System.Data;
using System.Data.Common;
using System.Globalization;
using System.IO;
using System.Text;
using System.Threading;
using Microsoft.Data.Sqlite;

namespace RafiqPOS.Data
{
    // Callback type kept for source compatibility with the former BackupDatabase signature (only a null callback is supported).
    public delegate bool SQLiteBackupCallback(SQLiteConnection source, string sourceName, SQLiteConnection destination, string destinationName, int pages, int remainingPages, int totalPages, bool retry);

    // Drop-in for System.Data.SQLite.SQLiteConnection on top of Microsoft.Data.Sqlite + SQLite3 Multiple Ciphers.
    public sealed class SQLiteConnection : DbConnection
    {
        // Single seam for encrypted databases: given the database file path (or ":memory:") return the raw 32-byte key
        // to apply with PRAGMA key right after open, or null for a plain database. The default hook keys every file
        // database with DatabaseKeyProvider's key. Per connection: "Encryption=None" in the connection string opens/creates
        // a plain file (legacy files, conversion source, tests), SetEncryptionKey() supplies a different explicit key.
        internal static Func<string, byte[]> ConnectionKeyHook = DatabaseKeyProvider.DefaultHook;

        private string _connectionString;
        private SQLiteConnectionOptions _options;
        private SqliteConnection _provider;
        private ConnectionState _state = ConnectionState.Closed;
        private string _dataSource = string.Empty;
        private bool _disposed;

        private byte[] _explicitKey;

        internal int _transactionLevel;
        internal int _version;

        public SQLiteConnection()
            : this(string.Empty)
        {
        }

        public SQLiteConnection(string connectionString)
        {
            SQLiteNative.EnsureInitialized();
            ConnectionString = connectionString;
        }

        public override string ConnectionString
        {
            get
            {
                CheckDisposed();
                return _connectionString;
            }
            set
            {
                CheckDisposed();
                if (_state != ConnectionState.Closed) throw new InvalidOperationException("Cannot change the connection string while the connection is open");
                // An empty string is allowed for the parameterless constructor; Open() validates.
                _options = string.IsNullOrEmpty(value) ? null : SQLiteConnectionOptions.Parse(value);
                _connectionString = value ?? string.Empty;
            }
        }

        // Opens this connection with the given raw 32-byte key instead of the hook's key (conversion, legacy backups, tests).
        public void SetEncryptionKey(byte[] key)
        {
            CheckDisposed();
            if (_state != ConnectionState.Closed) throw new InvalidOperationException("Cannot change the key while the connection is open");
            if (key != null && key.Length != 32) throw new ArgumentException("A raw database key must be exactly 32 bytes.");
            _explicitKey = key == null ? null : (byte[])key.Clone();
        }

        public override string Database
        {
            get { return "main"; }
        }

        public override string DataSource
        {
            get { return _dataSource; }
        }

        public override string ServerVersion
        {
            get
            {
                CheckDisposed();
                SQLiteNative.EnsureInitialized();
                return SQLitePCL.raw.sqlite3_libversion().utf8_to_string();
            }
        }

        public override ConnectionState State
        {
            get { return _state; }
        }

        public int DefaultTimeout
        {
            get { return _options != null ? _options.CommandTimeoutSeconds : SQLiteConnectionOptions.DefaultCommandTimeoutSeconds; }
        }

        public long LastInsertRowId
        {
            get
            {
                CheckOpen();
                return SQLitePCL.raw.sqlite3_last_insert_rowid(_provider.Handle);
            }
        }

        public int Changes
        {
            get
            {
                CheckOpen();
                return SQLitePCL.raw.sqlite3_changes(_provider.Handle);
            }
        }

        internal SQLiteConnectionOptions Options
        {
            get { return _options; }
        }

        internal SqliteConnection Provider
        {
            get { return _provider; }
        }

        public override void Open()
        {
            CheckDisposed();
            if (_state != ConnectionState.Closed) throw new InvalidOperationException("Connection already open");
            if (_options == null) throw new InvalidOperationException("The ConnectionString property has not been initialized.");

            SQLiteNative.EnsureInitialized();
            SqliteConnection provider = null;
            try
            {
                SqliteConnectionStringBuilder builder = new SqliteConnectionStringBuilder();
                builder.DataSource = _options.DataSource;
                builder.Pooling = _options.Pooling;
                builder.DefaultTimeout = _options.CommandTimeoutSeconds;
                if (_options.IsMemory) builder.Mode = SqliteOpenMode.Memory;
                else if (_options.ReadOnly) builder.Mode = SqliteOpenMode.ReadOnly;
                else if (_options.FailIfMissing) builder.Mode = SqliteOpenMode.ReadWrite;
                else builder.Mode = SqliteOpenMode.ReadWriteCreate;

                provider = new SqliteConnection(builder.ToString());
                provider.Open();
                _provider = provider;

                bool keyed = ApplyKey();
                ApplyEngineParity(provider, keyed);
                for (int i = 0; i < _options.Pragmas.Count; i++) ExecuteInternal(_options.Pragmas[i]);
            }
            catch (SqliteException ex)
            {
                _provider = null;
                DisposeProvider(provider);
                throw SQLiteException.FromProvider(ex);
            }
            catch (Exception)
            {
                _provider = null;
                DisposeProvider(provider);
                throw;
            }

            _dataSource = _options.IsMemory ? string.Empty : Path.GetFileNameWithoutExtension(_options.DataSource);
            _version++;
            _transactionLevel = 0;
            ChangeState(ConnectionState.Open);
        }

        public override void Close()
        {
            if (_state == ConnectionState.Closed) return;
            SqliteConnection provider = _provider;
            _provider = null;
            DisposeProvider(provider);
            _transactionLevel = 0;
            ChangeState(ConnectionState.Closed);
        }

        public override void ChangeDatabase(string databaseName)
        {
            throw new NotSupportedException();
        }

        public new SQLiteCommand CreateCommand()
        {
            CheckDisposed();
            return new SQLiteCommand(this);
        }

        protected override DbCommand CreateDbCommand()
        {
            return CreateCommand();
        }

        public new SQLiteTransaction BeginTransaction()
        {
            return BeginTransaction(IsolationLevel.Serializable);
        }

        public new SQLiteTransaction BeginTransaction(IsolationLevel isolationLevel)
        {
            CheckDisposed();
            return (SQLiteTransaction)BeginDbTransaction(isolationLevel);
        }

        // deferredLock=false is BEGIN IMMEDIATE (the old default), true is a plain BEGIN.
        public SQLiteTransaction BeginTransaction(bool deferredLock)
        {
            CheckDisposed();
            return (SQLiteTransaction)BeginDbTransaction(deferredLock ? IsolationLevel.ReadCommitted : IsolationLevel.Serializable);
        }

        protected override DbTransaction BeginDbTransaction(IsolationLevel isolationLevel)
        {
            if (_state != ConnectionState.Open) throw new InvalidOperationException();
            if (isolationLevel == IsolationLevel.Unspecified) isolationLevel = IsolationLevel.Serializable;
            if (isolationLevel != IsolationLevel.Serializable && isolationLevel != IsolationLevel.ReadCommitted)
            {
                throw new ArgumentException("isolationLevel");
            }
            return new SQLiteTransaction(this, isolationLevel != IsolationLevel.Serializable);
        }

        // Loads the native engine now; throws DatabaseEngineMissingException when it is missing or blocked
        public static void EnsureEngineLoaded()
        {
            SQLiteNative.EnsureInitialized();
        }

        // Longest a BackupDatabase call keeps retrying a busy/locked source or destination before it gives up
        internal static int BackupBusyDeadlineMilliseconds = 60000;

        public static void ClearAllPools()
        {
            SQLiteNative.EnsureInitialized();
            SqliteConnection.ClearAllPools();
        }

        // Same overload shape as the former library; the repository only ever calls it with pages = -1 and a null callback.
        public void BackupDatabase(SQLiteConnection destination, string destinationName, string sourceName, int pages, SQLiteBackupCallback callback, int retryMilliseconds)
        {
            CheckDisposed();
            if (_state != ConnectionState.Open) throw new InvalidOperationException("Source database is not open.");
            if (destination == null) throw new ArgumentNullException("destination");
            if (destination._state != ConnectionState.Open) throw new ArgumentException("Destination database is not open.", "destination");
            if (destinationName == null) throw new ArgumentNullException("destinationName");
            if (sourceName == null) throw new ArgumentNullException("sourceName");
            if (callback != null) throw new NotSupportedException("A backup progress callback is not supported.");
            if (pages == 0 || pages < -1) throw new NotSupportedException("Only pages = -1 (copy everything in one step) is supported.");

            SQLitePCL.sqlite3_backup backup = SQLitePCL.raw.sqlite3_backup_init(destination._provider.Handle, destinationName, _provider.Handle, sourceName);
            if (backup == null || backup.IsInvalid)
            {
                throw new SQLiteException((SQLiteErrorCode)SQLitePCL.raw.sqlite3_errcode(destination._provider.Handle), SQLitePCL.raw.sqlite3_errmsg(destination._provider.Handle).utf8_to_string());
            }
            try
            {
                // Old behaviour: while the source/destination is busy or locked keep retrying (sleeping retryMilliseconds between tries),
                // but never forever: after the deadline the call fails with Busy like an exhausted busy timeout.
                System.Diagnostics.Stopwatch deadline = System.Diagnostics.Stopwatch.StartNew();
                while (true)
                {
                    int rc = SQLitePCL.raw.sqlite3_backup_step(backup, pages);
                    if (rc == SQLitePCL.raw.SQLITE_DONE) break;
                    if (rc == SQLitePCL.raw.SQLITE_OK) continue;
                    if (rc == SQLitePCL.raw.SQLITE_BUSY || rc == SQLitePCL.raw.SQLITE_LOCKED)
                    {
                        if (deadline.ElapsedMilliseconds >= BackupBusyDeadlineMilliseconds)
                        {
                            throw new SQLiteException(SQLiteErrorCode.Busy, "database is locked");
                        }
                        Thread.Sleep(retryMilliseconds > 0 ? retryMilliseconds : 5);
                        continue;
                    }
                    throw new SQLiteException((SQLiteErrorCode)(rc & 0xFF), SQLitePCL.raw.sqlite3_errmsg(destination._provider.Handle).utf8_to_string());
                }
            }
            finally
            {
                backup.Dispose();
            }
        }

        // Executes one statement on this connection without an SQLiteCommand (PRAGMAs, BEGIN/COMMIT/ROLLBACK).
        internal void ExecuteInternal(string sql)
        {
            using (SqliteCommand command = _provider.CreateCommand())
            {
                command.CommandText = sql;
                command.CommandTimeout = DefaultTimeout;
                try
                {
                    command.ExecuteNonQuery();
                }
                catch (SqliteException ex)
                {
                    throw SQLiteException.FromProvider(ex);
                }
            }
        }

        // True when SQLite is not inside a transaction (also after SQLite rolled it back by itself).
        internal bool IsAutoCommit()
        {
            return SQLitePCL.raw.sqlite3_get_autocommit(_provider.Handle) != 0;
        }

        // The SQLite3 Multiple Ciphers build is compiled with different defaults than the engine inside System.Data.SQLite
        // (DEFAULT_FOREIGN_KEYS, DQS=0, SECURE_DELETE, TEMP_STORE=2). Restore the old defaults on every connection so plain
        // databases behave identically; keyword PRAGMAs from the connection string run afterwards and may override them.
        private void ApplyEngineParity(SqliteConnection provider, bool keyed)
        {
            int ignored;
            SQLitePCL.raw.sqlite3_db_config(provider.Handle, SQLitePCL.raw.SQLITE_DBCONFIG_DQS_DML, 1, out ignored);
            SQLitePCL.raw.sqlite3_db_config(provider.Handle, SQLitePCL.raw.SQLITE_DBCONFIG_DQS_DDL, 1, out ignored);
            ExecuteInternal("PRAGMA foreign_keys=OFF");
            ExecuteInternal("PRAGMA recursive_triggers=OFF");
            ExecuteInternal("PRAGMA secure_delete=OFF");
            // Old engine: TEMP_STORE=1 (temp tables and sort/index spill files on disk). A keyed connection must NOT spill decrypted
            // data into plain temp files, so it keeps the library default (memory) and names it explicitly; plain connections keep parity.
            ExecuteInternal(keyed ? "PRAGMA temp_store=MEMORY" : "PRAGMA temp_store=FILE");
        }

        // Returns true when the connection was keyed
        private bool ApplyKey()
        {
            if (_options.EncryptionNone) return false;

            byte[] key = null;
            bool wipeKey = false;
            if (_explicitKey != null)
            {
                key = (byte[])_explicitKey.Clone();
                wipeKey = true;
            }
            else if (_options.EncryptionProduct)
            {
                key = DatabaseKeyProvider.GetKey();
                wipeKey = true;
            }
            else
            {
                Func<string, byte[]> hook = ConnectionKeyHook;
                if (hook == null) return false;
                key = hook(_options.DataSource);
                if (key == null) return false;
                wipeKey = true;
            }

            StringBuilder pragma = null;
            try
            {
                if (key.Length != 32) throw new InvalidOperationException("A raw database key must be exactly 32 bytes.");

                // The cipher is always named explicitly so a different library default can never change how our files are read.
                ExecuteInternal("PRAGMA cipher = '" + DatabaseKeyProvider.CipherName + "'");
                pragma = new StringBuilder("PRAGMA key = \"x'");
                for (int i = 0; i < key.Length; i++) pragma.Append(key[i].ToString("x2", CultureInfo.InvariantCulture));
                pragma.Append("'\"");
                ExecuteInternal(pragma.ToString());
                return true;
            }
            finally
            {
                if (pragma != null)
                {
                    // best effort: the managed string made by ToString() cannot be wiped, the builder buffer can
                    pragma.Length = 0;
                    pragma.Capacity = 16;
                }
                if (wipeKey && key != null) Array.Clear(key, 0, key.Length);
            }
        }

        private void ChangeState(ConnectionState newState)
        {
            ConnectionState old = _state;
            _state = newState;
            if (old != newState) OnStateChange(new StateChangeEventArgs(old, newState));
        }

        private static void DisposeProvider(SqliteConnection provider)
        {
            if (provider != null) provider.Dispose();
        }

        private void CheckOpen()
        {
            CheckDisposed();
            if (_state != ConnectionState.Open) throw new InvalidOperationException("Database is not open");
        }

        private void CheckDisposed()
        {
            if (_disposed) throw new ObjectDisposedException(typeof(SQLiteConnection).Name);
        }

        protected override void Dispose(bool disposing)
        {
            if (!_disposed)
            {
                try
                {
                    if (disposing) Close();
                }
                finally
                {
                    if (_explicitKey != null) Array.Clear(_explicitKey, 0, _explicitKey.Length);
                    _explicitKey = null;
                    _disposed = true;
                    base.Dispose(disposing);
                }
            }
        }
    }
}
