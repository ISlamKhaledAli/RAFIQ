// Harness-only: Windows Job Object tracker (kernel32) is replaced by a no-op; Program.Main calls Initialize() first.
namespace RafiqPOS.Common
{
    public static class ChildProcessTracker
    {
        public static void Initialize() { }
    }
}
