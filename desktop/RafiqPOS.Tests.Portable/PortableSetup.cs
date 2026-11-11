using System;
using System.IO;
using NUnit.Framework;

// Harness-only setup.
[SetUpFixture]
public class PortableSetup
{
    [OneTimeSetUp]
    public void Init()
    {
        // The host resolves its data folders from AppDomain.CurrentDomain.BaseDirectory.
        Directory.SetCurrentDirectory(AppDomain.CurrentDomain.BaseDirectory);
    }
}
