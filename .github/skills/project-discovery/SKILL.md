---
name: project-discovery
description: Create or refresh .github/instructions/project-context.instructions.md by inspecting the repository (business, stack, layout, commands, rules, quirks). Use when adopting this agent kit in a new repository, when the context file is missing or describes another project, or after major structural changes.
argument-hint: Optional notes about the project (business goal, owner preferences)
---

# Project discovery

Goal: a short, verified, project-specific context file that every agent reads first.
Target file: `.github/instructions/project-context.instructions.md`.

## Steps
1. If the target file exists, read it and note what may be stale. Never discard user-written
   business facts or preferences; carry them over unless proven wrong.
2. Inspect the repository (delegate to the **Explore** or **Software Architect** subagent for large
   repos, read-only):
   - README/docs, product or planning documents (convert binary docs to text if possible).
   - Dependency manifests and lockfiles → languages, frameworks, versions, package manager.
   - Directory layout → apps, modules/services, boundaries.
   - Build, run, test, lint, format, type-check, migration commands (from scripts, Makefiles,
     task runners, CI files). Run the cheap ones to verify they work; mark unverified ones.
   - Configuration and environment variables (names only, never values), secrets handling.
   - Databases and migrations; external services and integrations.
   - Tests: frameworks, layout, how test data is isolated.
   - CI/CD, containers, deployment targets. VCS state (is it a git repo?).
   - Environment quirks (paths with spaces, tool version mismatches).
3. Ask the user (once, batched) only for what the code cannot tell you: business goal, users,
   key rules, constraints, preferences. Give a recommended default for each question.
4. Write the file using the template below. Facts only; label assumptions explicitly. Keep it
   under ~120 lines; link to READMEs for detail rather than duplicating them.
5. Report what you found, what you could not verify, and suggested next steps (e.g. missing tests,
   no CI, no VCS).

## Template
```markdown
---
description: Verified facts about THIS repository (stack, layout, commands, rules). Project-specific; regenerate with the project-discovery skill when copying the agent kit to another project.
applyTo: '**'
---

# Project Context — <name>

## Business
## Status
## Stack
## Layout
## Architecture rules
## Commands
## Tests
## Environment quirks
## User preferences
```
