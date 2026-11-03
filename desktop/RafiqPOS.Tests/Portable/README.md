# Wallet money counterexamples

These probes execute the real wallet/e-pay repositories, wallet IPC partial, business-day helper,
drawer calculator, DTOs and shared idempotency guard against disposable SQLite databases.
Only the provider names are adapted in memory from `System.Data.SQLite` to the Mono SQLite provider.
The authentication principal, financial lock holder, optional closing-service facade and audit sink
are bounded test fixtures, not the full desktop host. Audit-chain correctness, central dispatcher
authorization and native Windows SQLite are **not** certified by these probes.
The real immutable request-admission model and operation policy are compiled into the probes;
fixture admission loads a separate persisted-actor model rather than trusting mutable session roles.

No source or production database is rewritten. Test databases use WAL and foreign keys, are created
under a new temporary directory and are removed after the run. The same latest additive wallet
columns/indexes are present for both baseline and candidate, isolating the code regression.

From the repository root, with the project's pinned NuGet packages restored and Mono installed:

```sh
mcs -langversion:5 -r:System.Core -r:Microsoft.CSharp \
  -out:/tmp/rafiq-wallet-money-probe.exe desktop/RafiqPOS.Tests/Portable/WalletMoneyProbe.cs
MONO_PATH="$PWD/desktop/packages/Newtonsoft.Json.13.0.3/lib/net45" \
  mono /tmp/rafiq-wallet-money-probe.exe "$PWD" "/absolute/path/to/prioritized-baseline"
```

The exit code is zero only when baseline counterexamples reproduce and every candidate probe passes.
`Portable/*.cs` is intentionally outside the NUnit `Scenarios/*.cs` compile glob: the driver compiles
the production sources in memory using strict C# 5. No desktop project compile item is needed.

The authoritative Windows gate remains the full NUnit suite, including S40/S41 and
`S44_WalletBoundaryAndReplayTest` / `S50_DurableFinancialAttemptTest`, with the pinned
`System.Data.SQLite` provider. The probes now also exercise all four reconciliation/abandonment
partials, tombstones, original actor/fingerprint rejection, create-versus-abandon races,
read-only missing results and atomic audit-failure rollback.

The UI retry tests invoke the actual TypeScript submit handlers, transpiled with the already-installed
TypeScript package; they are not source-presence assertions:

```sh
cd frontend
node --experimental-strip-types --test test/wallet_attempt_contract.test.js
RAFIQ_WALLET_UI_SOURCE="/absolute/path/to/prioritized-baseline/frontend/src/views/wallets/WalletsView.tsx" \
  node --experimental-strip-types --test test/wallet_attempt_contract.test.js
```

The second command is expected to fail against the unfixed baseline.

## Durable FIN04 recovery

`frontend/src/utils/financialAttempt.ts` owns `rafiq_pos_pending_financial_v1`. Its only persisted
value is `{ schemaVersion: 1, actorId, action, payload, createdAt }`; payload fields are explicitly
allowlisted, immutable and credential-free. Missing/invalid replies and read-only `pending` results
never clear this journal. Closing or remounting a form cannot rotate a pending key. A pending
`rafiq_pos_pending_checkout_v1` blocks a new financial attempt.
New attempt keys use `financial_v1:<RFC3986-escaped actorId>:<unique attempt id>`. The server
enforces this public actor namespace even before a posting/barrier exists; it is not a credential.
Legacy committed keys can be reconciled using their strong stored fingerprint. Missing legacy
keys cannot be abandoned without ownership proof, and the UI will not blindly replay them.

The shared recovery hook/UI freezes all four forms, replays the original request, reconciles, or
requests durable abandonment. An abandoned attempt is released only after an exact server
acknowledgement; the backend barrier prevents late queued writes under that operation/key.

Partial IPC endpoints: `wallets:reconcileAttempt`, `wallets:abandonAttempt`,
`epay:reconcileAttempt`, `epay:abandonAttempt`. Request:
`{ operation: originalAction, actorId: originalActorId, payload: frozenOriginalPayload }`.
Response:
`{ status: 'pending'|'committed'|'abandoned', operation, idempotencyKey, actorId, requestFingerprint, data }`.
`committed` includes the complete persisted DTO; other statuses have null `data`.
The central dispatcher registers outer session gates; handlers additionally enforce exactly
`wallets.transact`, `wallets.fund`, `epay.transact` or `epay.fund` based on the original operation.
Abandonment is a write/license/feature-gated action. Reconciliation is read-only and remains available
when the corresponding feature is disabled. A pending financial journal also blocks new sale
creation and sale replay, including when its contents are malformed or belong to another actor.
Browser DEV-MOCK explicitly rejects these financial writes and recovery actions with
`DEV_MOCK_NATIVE_HOST_REQUIRED`; it cannot certify a native posting or durable abandonment.

Both repositories expose `ResolveAttempt(string operation, JObject payload, string actorId, bool abandon)`.
The shared guard uses only the approved migration-62 `financial_attempt_cancellations` fields and
never rewrites an existing financial row to abandon it.
All wallet/e-pay mutations accept their operation inside `FinancialWriteLock` through
`IdempotencyGuard.WithFinancialOperation`. During an IPC frame, actor/name/permission helpers use
only `ProductWritePolicy.CurrentOperation`; nested calls retain that accepted snapshot after a
logout or switch. Queued stale admissions reject before acceptance. Legacy live-principal reads
exist only when `CurrentAdmission == null`, never for anonymous IPC.
`S54_ImmutableWalletAuthorityTest` exercises these real host helpers without SQLite;
provider-adapted repository probes additionally assert attribution and no privilege upgrade.

```sh
cd frontend
node --experimental-strip-types --test test/wallet_attempt_contract.test.js test/financial_attempt_lifecycle.test.js
```
