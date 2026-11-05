---
name: review-project
description: Production-readiness audit of an existing project or change with the agent team - correctness, security, architecture, tests, operations - consolidated into one prioritized report with a fix plan. Use for "review this repo", "is this production ready", PR/change reviews, or due diligence.
argument-hint: What to review (whole repo, a module, a change summary) and any focus areas
---

# Review a project

You are coordinating. All reviewers are read-only and may run in parallel.

1. **Context.** Read or create `.github/instructions/project-context.instructions.md`
   (`project-discovery`). Define the scope and the bar (prototype, internal, production).
2. **Parallel reviews** (self-contained briefs with scope, context, and the "## Report" block):
   - **Principal Code Reviewer** — correctness, regressions, data integrity, concurrency, error
     handling, tests, performance.
   - **Security Engineer** — threat model and vulnerabilities, secrets, dependencies, config.
   - **Software Architect** — structure and boundaries, maintainability, scalability fit,
     operational readiness (config, migrations, health checks, observability, CI/CD), and the
     biggest design risks.
   - Optional **QA Engineer** — test strategy gaps and flaky/weak tests.
3. **Consolidate.** De-duplicate overlapping findings, keep the highest justified severity, and
   separate confirmed defects from concerns. Re-run the test suite yourself.
4. **Report to the user**:
   - Verdict against the chosen bar, in one paragraph.
   - Findings table: severity, area, file/lines, issue, impact, fix.
   - What is solid (verified).
   - A fix plan grouped into "must fix now", "before production", and "later", each step tagged with
     the agent that should do it.
5. **Offer** to execute the fix plan (Tech Lead / `ship-feature` / `fix-bug`) and an SDE Mentor
   explanation of the findings.
