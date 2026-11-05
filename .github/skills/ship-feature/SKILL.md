---
name: ship-feature
description: Deliver a feature or behaviour change in an existing project end to end with the agent team - clarify, design, implement, test, review, secure, verify. Use for any non-trivial feature, enhancement, or refactor.
argument-hint: Describe the feature or change and any acceptance criteria you already know
---

# Ship a feature

You are coordinating. Delegate each step as a subagent with a self-contained brief and require
the "## Report" block. Only you talk to the user. Scale down for small changes and say which
steps you skipped and why.

1. **Context.** Read `.github/instructions/project-context.instructions.md` (run
   `project-discovery` first if missing or stale).
2. **Clarify — Product Analyst** (skip if requirements and acceptance criteria are already clear).
   Ask the user any open questions in one batch with recommendations.
3. **Design — Software Architect.** Plan with options, decisions needed, and ordered steps,
   including data-migration safety if persistence changes. Get the user's approval on decisions
   that change behaviour, contracts, data, security, or cost.
4. **Implement — Senior Implementation Engineer.** Brief: approved plan + acceptance criteria.
   Must add tests for every behaviour change and run the suite.
5. **Verify — QA Engineer.** Map acceptance criteria to tests, add missing negative/edge cases,
   run everything. If defects are found, send them back to step 4.
6. **Review — Principal Code Reviewer**, plus **Security Engineer** in parallel when the change
   touches auth, permissions, user input, data exposure, secrets, payments, file handling, or
   outbound requests.
7. **Fix loop.** Send confirmed High+ (review) and Medium+ (security) findings to Senior
   Implementation Engineer, then re-review only the fixes. Max 2 rounds; report what remains.
8. **Infra** (only if needed) — **DevOps Engineer** for CI, config, deployment changes.
9. **Close.** Re-run tests and checks yourself. Update docs and the project context file. Report
   outcome, agents' contributions, decisions, validation, risks. Offer an SDE Mentor walkthrough.
