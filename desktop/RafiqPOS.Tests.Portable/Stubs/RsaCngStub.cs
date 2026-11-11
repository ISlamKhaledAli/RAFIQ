// Harness-only: RSACng is a Windows CNG type (throws PlatformNotSupportedException on macOS/Linux). The host uses it for license
// signature verification; this stand-in (declared in the harness assembly, so it wins over the framework type) delegates to the
// portable RSA implementation, which produces and verifies the same RS256 signatures.
using System;

namespace System.Security.Cryptography
{
    public sealed class RSACng : RSA
    {
        private readonly RSA _inner;

        public RSACng()
        {
            _inner = RSA.Create();
        }

        public RSACng(int keySize)
        {
            _inner = RSA.Create(keySize);
        }

        public override int KeySize
        {
            get { return _inner.KeySize; }
            set { _inner.KeySize = value; }
        }

        public override KeySizes[] LegalKeySizes
        {
            get { return _inner.LegalKeySizes; }
        }

        public override RSAParameters ExportParameters(bool includePrivateParameters)
        {
            return _inner.ExportParameters(includePrivateParameters);
        }

        public override void ImportParameters(RSAParameters parameters)
        {
            _inner.ImportParameters(parameters);
        }

        public override byte[] SignHash(byte[] hash, HashAlgorithmName hashAlgorithm, RSASignaturePadding padding)
        {
            return _inner.SignHash(hash, hashAlgorithm, padding);
        }

        public override bool VerifyHash(byte[] hash, byte[] signature, HashAlgorithmName hashAlgorithm, RSASignaturePadding padding)
        {
            return _inner.VerifyHash(hash, signature, hashAlgorithm, padding);
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing) _inner.Dispose();
            base.Dispose(disposing);
        }
    }
}
