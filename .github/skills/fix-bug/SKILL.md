---
name: fix-bug
description: Fix a bug, failing test, or production incident at its root cause with the agent team - reproduce with a failing test, diagnose, fix, verify, review. Use for any defect report, error, regression, or failing check.
argument-hint: Describe the bug - expected vs actual behaviour, error output, steps to reproduce
---

# Fix a bug

You are coordinating. Delegate with self-contained briefs and require the "## Report" block.

1. **Context.** Read `.github/instructions/project-context.instructions.md`. Collect the
   expected vs actual behaviour, error output, environment, and recent changes. If an incident is
   ongoing in a real environment, first advise the user on mitigation (rollback, feature flag)
   before the full fix.
2. **Reproduce — QA Engineer.** Write the smallest automated test that fails for the reported
   reason; capture the exact failing output. If it cannot be reproduced, decide with the user
   what information is missing before going further.
3. **Root cause and fix — Senior Implementation Engineer.** Brief: the failing test and output.
   Trace the execution path, state the verified root cause (not a guess), make the smallest safe
   fix, and keep the reproduction as a regression test. Check for the same defect pattern
   elsewhere and report it.
4. **Review — Principal Code Reviewer** on the fix and its blast radius (and **Security Engineer**
   if the bug has security impact).
5. **Close.** Re-run the regression test and the full suite yourself. Report: root cause, fix,
   proof (test before/after), similar risks found, and follow-ups.

Never weaken or delete a test to make it pass. Do not change several things at once and assume the
last change fixed it.
