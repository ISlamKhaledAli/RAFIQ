using System;
using System.Data;
using System.Data.Common;
using System.Threading;

namespace RafiqPOS.Data
{
    // BEGIN IMMEDIATE (Serializable, the default) or BEGIN (ReadCommitted) with the old nesting rules: only the outermost transaction issues SQL.
    public sealed class SQLiteTransaction : DbTransaction
    {
        private SQLiteConnection _cnn;
        private readonly int _version;
        private readonly IsolationLevel _level;
        private bool _disposed;

        internal SQLiteTransaction(SQLiteConnection connection, bool deferredLock)
        {
            _cnn = connection;
            _version = connection._version;
            _level = deferredLock ? IsolationLevel.ReadCommitted : IsolationLevel.Serializable;
            Begin(deferredLock);
        }

        public override IsolationLevel IsolationLevel
        {
            get
            {
                CheckDisposed();
                return _level;
            }
        }

        public new SQLiteConnection Connection
        {
            get
            {
                CheckDisposed();
                return _cnn;
            }
        }

        protected override DbConnection DbConnection
        {
            get { return Connection; }
        }

        public override void Commit()
        {
            CheckDisposed();
            IsValid(true);
            if (_cnn._transactionLevel - 1 == 0)
            {
                _cnn.ExecuteInternal("COMMIT;");
            }
            _cnn._transactionLevel--;
            _cnn = null;
        }

        public override void Rollback()
        {
            CheckDisposed();
            IsValid(true);
            IssueRollback(true);
        }

        private void Begin(bool deferredLock)
        {
            if (_cnn._transactionLevel++ != 0) return;
            try
            {
                _cnn.ExecuteInternal(deferredLock ? "BEGIN;" : "BEGIN IMMEDIATE;");
            }
            catch (SQLiteException)
            {
                _cnn._transactionLevel--;
                _cnn = null;
                throw;
            }
        }

        private void IssueRollback(bool throwError)
        {
            SQLiteConnection connection = Interlocked.Exchange(ref _cnn, null);
            if (connection == null) return;
            try
            {
                connection.ExecuteInternal("ROLLBACK;");
            }
            catch (Exception)
            {
                if (throwError) throw;
            }
            connection._transactionLevel = 0;
        }

        // Also false once SQLite ended the transaction itself (for example a trigger RAISE(ROLLBACK)).
        private bool IsValid(bool throwError)
        {
            if (_cnn == null)
            {
                if (throwError) throw new ArgumentNullException("No connection associated with this transaction");
                return false;
            }
            if (_cnn._version != _version)
            {
                if (throwError) throw new SQLiteException("The connection was closed and re-opened, changes were already rolled back");
                return false;
            }
            if (_cnn.State != ConnectionState.Open)
            {
                if (throwError) throw new SQLiteException("Connection was closed");
                return false;
            }
            if (_cnn._transactionLevel == 0 || _cnn.IsAutoCommit())
            {
                _cnn._transactionLevel = 0;
                if (throwError) throw new SQLiteException("No transaction is active on this connection");
                return false;
            }
            return true;
        }

        private void CheckDisposed()
        {
            if (_disposed) throw new ObjectDisposedException(typeof(SQLiteTransaction).Name);
        }

        protected override void Dispose(bool disposing)
        {
            try
            {
                if (!_disposed && disposing && IsValid(false)) IssueRollback(false);
            }
            finally
            {
                base.Dispose(disposing);
                _disposed = true;
            }
        }
    }
}
