<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **RAFIQ** (27990 symbols, 80753 relationships, 980 execution flows).

> Index stale? Run `node .gitnexus/run.cjs analyze --index-only` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? Bootstrap with `npx`, `bunx`, or `pnpm dlx` — e.g. `bunx gitnexus@latest analyze` (npm 11 npx crash; #1939).

## Always Do

- **MUST run impact before editing.** Use `impact({target: "symbolName", direction: "upstream"})` or `node .gitnexus/run.cjs impact "symbolName" --direction upstream --repo .`; report callers, processes, and risk. Never substitute grep for graph analysis.
- **MUST analyze graph changes before committing.** Use `detect_changes({scope: "all"})` (MCP) or `node .gitnexus/run.cjs detect-changes --scope all --repo .` (CLI fallback). `partial: true` or `truncated: true` is not a clean check — a zero means unseen, not unaffected; re-run it. For regression review: `detect_changes({scope: "compare", base_ref: "main"})` or `node .gitnexus/run.cjs detect-changes --scope compare --base-ref "main" --repo .`.
- MUST warn on HIGH/CRITICAL `risk` pre-edit; never use `riskSharedAxes` to waive a HIGH/CRITICAL `risk` warning. Compare File/symbol: MCP File omits axes; Graph-RAG expands File.
- **MUST treat `risk: UNKNOWN` as unresolved, not as low.** An empty caller set is not evidence the symbol is unused — it can also mean the callers are not resolvable by the index (plain-object property access, dynamic dispatch, cross-language calls). `impact` pairs `UNKNOWN` with a `riskNote` saying so. Confirm with a text search before treating the symbol as safe to change or delete; do not proceed on the strength of a zero.
- **MUST use `query({search_query: "concept"})` for concepts/flows, `context({name: "symbolName"})` for a named symbol, or `impact` for blast radius, on read-only callers, dependencies, imports, or execution flow.** Graph first; text search only for empty/`UNKNOWN`/literals.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method before MCP/CLI impact analysis.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis, and never read `UNKNOWN` as an all-clear — it means the walk could not answer, which is the one verdict that requires confirming by other means.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit before MCP/CLI graph change analysis.

## Resources

| Resource | Use for |
| --- | --- |
| `gitnexus://repo/RAFIQ/context` | Codebase overview, check index freshness |
| `gitnexus://repo/RAFIQ/clusters` | All functional areas |
| `gitnexus://repo/RAFIQ/processes` | All execution flows |
| `gitnexus://repo/RAFIQ/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
| --- | --- |
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus-cli/SKILL.md` |
| Work in the Services area (1362 symbols) | `.claude/skills/gitnexus-area-services/SKILL.md` |
| Work in the Components area (1240 symbols) | `.claude/skills/gitnexus-area-components/SKILL.md` |
| Work in the Scenarios area (1158 symbols) | `.claude/skills/gitnexus-area-scenarios/SKILL.md` |
| Work in the Repositories area (439 symbols) | `.claude/skills/gitnexus-area-repositories/SKILL.md` |
| Work in the Views area (186 symbols) | `.claude/skills/gitnexus-area-views/SKILL.md` |
| Work in the Test area (100 symbols) | `.claude/skills/gitnexus-area-test/SKILL.md` |
| Work in the Admin area (96 symbols) | `.claude/skills/gitnexus-area-admin/SKILL.md` |
| Work in the Bridge area (88 symbols) | `.claude/skills/gitnexus-area-bridge/SKILL.md` |
| Work in the Database area (87 symbols) | `.claude/skills/gitnexus-area-database/SKILL.md` |
| Work in the Handlers area (87 symbols) | `.claude/skills/gitnexus-area-handlers/SKILL.md` |
| Work in the E2e area (70 symbols) | `.claude/skills/gitnexus-area-e2e/SKILL.md` |
| Work in the Purchases area (60 symbols) | `.claude/skills/gitnexus-area-purchases/SKILL.md` |
| Work in the Settings area (56 symbols) | `.claude/skills/gitnexus-area-settings/SKILL.md` |
| Work in the Desktop area (56 symbols) | `.claude/skills/gitnexus-area-desktop/SKILL.md` |
| Work in the Pages area (48 symbols) | `.claude/skills/gitnexus-area-pages/SKILL.md` |
| Work in the Root area (37 symbols) | `.claude/skills/gitnexus-area-root/SKILL.md` |
| Work in the Models area (34 symbols) | `.claude/skills/gitnexus-area-models/SKILL.md` |
| Work in the Pos area (34 symbols) | `.claude/skills/gitnexus-area-pos/SKILL.md` |
| Work in the Tests area (27 symbols) | `.claude/skills/gitnexus-area-tests/SKILL.md` |
| Work in the Context area (24 symbols) | `.claude/skills/gitnexus-area-context/SKILL.md` |

<!-- gitnexus:end -->
