# Offline food-reference workflow and integration handoff

## Trust boundary

First-run stays empty. This is an optional, bounded Open Food Facts Egypt food
reference pilot, not a certified Egyptian supermarket master catalogue.
The 300-identity/five-group pilot threshold and 500 target are engineering
objectives, not a coverage promise. `manifest.json` reports actual counts.
Missing information is not filled from legacy data, product-name guesses,
translations, checksum repair, estimates or invented identifiers.

The pack has no price, cost, stock, tax, margin or supplier fields. A merchant
must scan the **original** GTIN, confirm the exact brand/variant/quantity/pack,
choose an existing active category, and enter real integer-piaster sale price
and cost. Zero cost needs separate explicit confirmation. Products open at
zero stock, with a base piece unit representing the **whole confirmed pack**,
factor 1; this is not an inferred inner-piece count. New products retain
`needs_review=1` for the shop's remaining operational configuration.

Every existing barcode match (primary, additional, unit, archived, normalized
GTIN-8/12/13/14 equivalence) is skipped. No reference action updates,
reactivates, attaches barcodes to, or reprices an existing product. No opening
stock movements are invented. The UI reviews one product at a time; the
authoritative protocol bounds a request at 50 selections.

## Acquisition and offline maintenance

No dependency installation is required; Node built-ins, curl and existing
frontend SheetJS are used. Only these explicit maintainer commands perform networking:

```sh
node tools/catalogue/cli.mjs acquire
node tools/catalogue/cli.mjs acquire-licences
```

It requests only public identity metadata from official OFF endpoints, uses
an identifying User-Agent, paginates at 100 records with an eight-second
minimum interval, retries with a 15-second backoff, and tries the official
world filtered export if the Egypt mirror fails. It bounds work at 50 pages.
Failed pages are recorded, not silently replaced or manufactured. A partial
acquisition can be resumed with the same command; a completed snapshot is not
overwritten by acquisition. Review a new dataset version separately before
replacing a shipped pack and updating its code pins.

During this delivery the preferred filtered CSV/bulk export
`https://eg.openfoodfacts.org/cgi/search.pl?action=process&download=on&fields=code,product_name,brands,quantity,categories_tags,countries_tags,last_modified_t`
returned HTTP 500, and larger world searches intermittently returned 503.
The official, filtered paginated JSON exports were used instead. No individual
product crawl, shop-data upload, image download or runtime internet lookup is
part of this workflow. The snapshot describes a retrieval **UTC window**, not
a single atomic OFF database version. Record `retrievedAt` identifies its
acquisition window start; individual source modification times are retained.

Offline commands from the repository root:

```sh
node tools/catalogue/cli.mjs audit-legacy
node tools/catalogue/cli.mjs quarantine-legacy
node tools/catalogue/cli.mjs seal-partial "Recorded bounded public-source blocker"
node tools/catalogue/cli.mjs freeze
node tools/catalogue/cli.mjs validate
node --test tools/catalogue/test/*.test.mjs
python3 tools/catalogue/test/check_host.py
cd frontend
node --experimental-strip-types --test test/catalogue_reference.test.js
npm run lint
npm test
npm run build
```

`audit-legacy` reports to stdout without changing originals.
`quarantine-legacy` refreshes only the catalogue inventory.
`seal-partial` seals an unsealed partial acquisition with an explicit blocker
reason; it is offline and must never be used to claim complete coverage.
`freeze` deterministically rebuilds the bounded derivative pack from its local
source snapshot. It intentionally changes derived artifacts and therefore
requires reviewing and updating the pinned manifest digest before shipping.
`validate` checks all manifest hashes and the actual production validator.
`check_host.py` compiles the project's real source list plus the four new
partials with C# 5, in Release/DEBUG definitions; it runs only provider-free
host checks and compiles the NUnit scenario. It does **not** substitute for
MSBuild, native Windows SQLite, or an installed application field test.

The snapshot, hashes, quarantine reasons, transformation sources, attribution
and full ODbL/DbCL licence notices ship under `frontend/public/catalogue/`.
ODbL adapted-database attribution/share-alike/access obligations must accompany
redistribution; see `ATTRIBUTION.md` and the licence notices. Merchant-entered
operational records are separate; that is not a blanket legal exemption for
future combined/public exports.

### Frozen delivery result (2026-11-02)

The bounded snapshot contains **1,000 actual Egypt-tagged source records**:
**108 eligible candidates**, **892 quarantined**. Coverage is beverages 29,
dairy 18, pantry 16, snacks 32, staples 13. The engineering target of 300
identities and 25 per group is **not met**. Both manifest and UI state this.

Repeated official country/world page 11+ requests returned 401/503 despite
retry/backoff. The filtered bulk export returned 500, and alternate public
completeness/category exports returned 503. Acquisition was stopped rather
than bypassing access restrictions or padding the dataset. Official licence
downloads succeeded. A later authorized, useful source snapshot is the
bounded remaining data-expansion task, not a reason to weaken validation.

Different legacy names assigned to the same normalized GTIN across the
preserved catalogue contexts are treated as ambiguous conflicts. Merely
appearing in a quarantined old artifact is not by itself a conflict or a
certificate: these independent candidates come only from the licensed OFF
snapshot and still require physical merchant confirmation. This avoids
discarding agreeing source identities while catching the documented
water/noodle/variant cross-catalogue assignments. No legacy monetary data is
promoted. Taxonomy group matching uses exact category tags, not a substring
such as `beverages` inside `plant-based-foods-and-beverages`.

Pinned dataset SHA-256:
`32e821903473e38dda59d4065aef312bea04e15ceac295fb8f607b8deda80dc3`.
Pinned manifest SHA-256:
`c7276a34e2047b3323dc825fff3e137f65aba0df1db29ae49b73b1edcb7f99f6`.

## Existing artifact containment

Original legacy JSON, catalogue arrays and workbooks remain **in place**.
`legacy-quarantine.json` inventories their SHA-256 digests and reasons.
Exact original file hashes are blocked from the generic Excel route; explicit
reference formats are redirected to review. A barcode/name overlap has at
most informational value: it is not proof of legacy origin, never blocks an
ordinary merchant import and never grants reference provenance.
Arbitrary edited/copied rows with stripped metadata cannot reliably be
identified by origin, and no full-origin-quarantine claim is made. Authorized
merchant imports and pinned reference promotion are separate workflows.

The native and browser template downloads contain only blank headers and
instructions, without example products, money, tax assumptions or formulas.
All three old exporters throw `LEGACY_CATALOGUE_DISABLED` before file access.
The public template-seed method and its IPC route fail explicitly before SQL.
The private historical seed implementation remains unreachable through its
public API; its arrays remain preserved quarantine evidence, not an authority.

Release `demo:load` IPC is explicitly blocked, while DEBUG training is
unchanged. The direct `DemoDataService.LoadDemoData` Release guard is an
**integration-owner handoff**, not an edit made by the catalogue worker.

## Exact central integration handoff (parent-owned files)

### Host compile items

Add these to `desktop/RafiqPOS.csproj`:

```xml
<Compile Include="Models\CatalogueReference.cs" />
<Compile Include="Services\CatalogueReferenceService.cs" />
<Compile Include="Repositories\ProductRepository.Catalogue.cs" />
<Compile Include="Bridge\IpcDispatcher.Catalogue.cs" />
```

Add to the existing test project:

```xml
<Compile Include="Scenarios\CatalogueImportSafetyTests.cs" />
```

No new schema, migration, DatabaseService singleton or dependency is required.
`CatalogueReferenceService` receives `DatabaseService.ProductRepo` and reads
only `AppDomain.CurrentDomain.BaseDirectory/dist/catalogue/`.
Its compiled `ManifestSha256` pin authenticates the manifest, which pins the
reference and containment artifacts. Browser browse uses the same manifest
pin in `frontend/src/types/catalogue.ts`.

### Native permission, dispatch and mutation gates

All three new permission-map entries reuse **`products.import`**:

```csharp
{ "catalogue:getReference", "products.import" },
{ "catalogue:preview", "products.import" },
{ "catalogue:apply", "products.import" },
```

After the existing central authentication/permission checks and inside the
existing database gate, insert these **before** `TryDispatchProducts`:

```csharp
if (TryDispatchCatalogue(request, out response)) return response;
if (TryRejectCatalogueMerchantImport(request, out response)) return response;
```

Also add `catalogue:apply` to **both** the database-corrupt write deny list
and `IsLicenseBlockedAction`'s catalogue-mutation list. Preview/browse are
read-only, not licence-blocked mutations. The partial independently enforces
the current actor and `products.import`; the generic guard runs only for
`products:importBatch` and returns false for legitimate merchant requests after
replacing `request.Payload` with the validated canonical object described below.

### Frontend wrapper and events

In the parent-owned `frontend/src/bridge/ipc.ts`, import:

```ts
import { handleCatalogueMock } from './catalogueMocks.ts';
```

At the start of the existing mock handler, route:

```ts
if (action.startsWith('catalogue:') || action === 'templates:seedProducts')
  return handleCatalogueMock(action, payload);
```

Browser reference browse reads only the two local bundled JSON assets and
verifies their hashes. Browser preview/apply deliberately throw
`CATALOGUE_NATIVE_HOST_REQUIRED`, never claim SQLite writes or ownership
checks succeeded. Keep DEBUG browser training otherwise intact.
Change the existing `templates:apply` mock's `productsCount` to **0 regardless
of `seedInitialProducts`** and remove the now-unreachable successful legacy
`templates:seedProducts` mock case. Preserve mock first-run completion state.

In `getAutoTopicsForAction`, special-case successful `catalogue:apply` to
`['products', 'categories', 'dashboard']`. Browse and preview must emit **no**
data-change topics. The renderer already emits topics on successful invoke;
do not add a second duplicate emitter. The modal is already integrated into
`ExcelImportModal`, gated by existing `products.import`; no view/app edit is
needed. Categories are selected, not created, in this bounded delivery.

### Direct demo guard handoff

Before any writes in `DemoDataService.LoadDemoData`, parent should preserve
the existing DEBUG body and add this Release branch:

```csharp
#if !DEBUG
    return new LoadDemoDataResult {
        Success = false,
        Message = "DEMO_DISABLED_IN_RELEASE: بيانات التدريب متاحة في إصدار Debug فقط."
    };
#else
    // Existing method body unchanged.
#endif
```

Run the required targeted GitNexus impact before that parent edit and preserve
all DEBUG training tests. The Release IPC guard is already present in the
catalogue-owned `IpcDispatcher.Templates.cs`.

### Packaging, verification and shared context

Vite copies the entire public catalogue into `frontend/dist/catalogue/`.
After final integration, parent must build and copy the **complete** `dist`
tree to both desktop output directories using the existing packaging flow;
do not ship a new host with an old or missing catalogue pack. Never copy a
shop database as part of this deployment.

Update the parent-owned project context with the new catalogue paths,
offline/network command separation, pinned local pack, add-only policy and
the Windows provider/field validation limitation.

Windows gates after wiring: Release and Debug MSBuild, registered
`CatalogueImportSafetyTests`, denied IPC without `products.import`,
corrupt-database/licence mutation guards, archived primary/additional/unit
collision checks, injected audit failure rollback, concurrent same-attempt
replay, restart replay, tampered/missing pack rejection, generic merchant
import, empty first-run, and installed offline UI at both target resolutions.
Do not treat the browser mock or Mono compilation as those gates.

## Validation record for this handoff

- Catalogue tooling: 8/8 tests passed; offline pack validation passed.
- All 17 inventoried legacy originals matched their preserved hashes.
- Offline refreeze reproduced the manifest byte hash; shipped transformation
  copies matched the maintainer sources.
- Production-host provider-free checks: 55 assertions passed, including
  native blank workbook generation, fixed-pack loading/hash rejection and
  generic-import containment. Real host source compiled under C# 5 with both
  Release and DEBUG definitions, with existing unrelated warnings.
- New NUnit scenario compiled against the real host source assembly; **not
  executed** on a Windows SQLite provider.
- Final frontend lint passed without catalogue warnings; full suite:
  **675 passed, zero failed/skipped**. An earlier production build passed.
  The final production build was blocked by a concurrent, non-catalogue
  `PosView.tsx:1442` TS2345 (`ReceiptNotice.saleId` may be undefined).
  Catalogue ownership did not change that file.
- The old native template failed the blank-template regression assertion.
  The original blanket identity-pair rejection test was superseded by the
  round-one correction below: identity overlap is not origin evidence.

No Windows installed-app/provider/hardware test, commit, push or deployment
is represented by these checks.

## Round-one review correction (2026-11-03): frozen integration contract

Two reproduced medium findings were corrected without changing the 108-record
pack, its transformations, either code pin, or any of the 17 original artifacts:

1. An independently created merchant workbook with barcode `90162602`, name
   `ريد بول مشروب طاقة 250 ml`, sale price 79.25 and cost 63.11 was incorrectly
   rejected by the identity-pair blacklist, although its hash was not
   quarantined and it had no reference markers. That blacklist was removed in
   both the parser guard and native guard. Exact-artifact and explicit-reference
   negative tests remain; the actual parser now accepts this positive case
   without changing the merchant's prices or inventing stock.
2. The native guard previously cast payloads to `JObject`, accepted null after
   a failed cast, and inspected case-sensitive `items` while the downstream DTO
   deserializer accepted other casing. String-wrapped JSON, `Items`, and
   top-level/nested case aliases could therefore evade marker inspection.

### Canonical generic-import boundary

`CatalogueReferenceService.ValidateMerchantImport(object rawPayload)` now
returns the validated **`BatchImportRequest`**. It:

- Requires an actual `JObject`, a nonempty `items` array and object rows.
  JSON strings/JValues containing object text are rejected, not reparsed.
- Derives allowed exact field names from the existing batch-import DTO
  `JsonProperty` contracts, rather than maintaining a second row-field schema.
  Noncanonical casing, case aliases and unsupported fields reject explicitly.
- Checks reference markers case-insensitively **before** DTO conversion, and
  checks the optional canonical `sourceFileSha256` against the pinned legacy
  inventory. No barcode/name blacklist or source-origin inference is used.
- Consumes the already-checked optional file hash and converts the remaining
  validated object into the actual DTO. No format/provenance marker is
  silently discarded before checking.

`TryRejectCatalogueMerchantImport` forwards only that typed representation:

```csharp
BatchImportRequest canonical =
    new CatalogueReferenceService(DatabaseService.ProductRepo)
        .ValidateMerchantImport(request.Payload);
request.Payload = JObject.FromObject(canonical);
return false;
```

Keep the existing central ordering:

```csharp
if (TryDispatchCatalogue(request, out response)) return response;
if (TryRejectCatalogueMerchantImport(request, out response)) return response;
if (TryDispatchProducts(request, out response)) return response;
```

The current product handler already reads `request.Payload.ToString()` at
dispatch time, so it receives the validated DTO serialization. **No central
file edit, new compile item, permission key or migration is required for this
round.** Do not cache/reparse the original payload ahead of this guard or
discard reference metadata before calling it. Shape/casing/DTO errors return
`INVALID_PAYLOAD`; known artifacts/reference formats remain explicit review
rejections. This gate does not replace existing authorization or import
financial/inventory rules.

### Below-cost check: verified behavior, not an asserted equivalence

`ProductService.SaveProduct` requires `confirmBelowCost` when sale price is
below cost and otherwise raises `BelowCostPriceException`.
`ProductService.ImportBatch` does not call that method. The reference workflow
also uses its dedicated insert-only path, not `SaveProduct`: it requires
`PricesConfirmed` for the real merchant-entered values and `ConfirmApply`
after preview, and records the selections and amounts transactionally.
Editing a selection invalidates the preview and resets the final apply
confirmation, so changed amounts require a new preview and explicit apply.

Round-one review identified that the reference modal lacked its own
below-cost-specific warning/confirmation. The tightly coupled Task 17-1
completion below closes that distinction; generic `PricesConfirmed` is not
treated as loss approval.

### Round-one reproduction and verification

Before the fix, the new actual-parser positive failed with
`LEGACY_CATALOGUE_DISABLED`; production IPC-guard tests had **14 failures and
5 passes**, including accepted string/case bypasses and the blocked legitimate
identity. After the fix, the focused parser/import tests passed **15/15** and
all **19 production IPC-guard cases passed**. The host checks invoke the real
private guard via reflection with an invalid, unopened database connection;
they exercise local metadata and DTO forwarding, **not SQLite/provider writes**.
The existing 55 provider-free assertions and C# 5 Release/DEBUG source
compilation also passed; the NUnit scenario compiled but was not executed.

Final round-one frontend lint and the separately run production build passed.
The full frontend test run reported **701 passed, 1 failed, 0 skipped**:
`go_live_step3b_regressions.test.js:78`, “e-pay transactions and terminal
fundings carry a key”, still expected the source pattern
`idempotencyKey: txAttemptRef.current.current()`. That test and the e-pay
implementation are outside catalogue ownership and were not edited.

## Frozen Task 17-1 completion (2026-11-03)

Each operational selection now has `BelowCostConfirmed` in C# and
`belowCostConfirmed` on the wire/UI, defaulting to **false**. The optional
wire field defaults to false when omitted and, if supplied, must be a JSON
boolean. It is not a field in the source-data pack.

When the merchant sale price is below cost:

- The existing modal displays an explicit Arabic loss warning and a separate,
  initially unchecked loss-approval checkbox.
- Client validation and the authoritative native selection validator both
  require that specific approval. `PricesConfirmed` and the final apply
  confirmation do not substitute for it.
- Both native preview and apply reject unconfirmed loss pricing before any
  database connection is opened by the service. They reuse the existing
  `BelowCostPriceException` and `BELOW_COST_WARNING` bridge response/details.
- Confirmed pricing is retained exactly; no price/cost adjustment is inferred.

The modal uses the tested `editCatalogueSelection` production helper. Changing
either price clears the loss approval and generic price confirmation, clears
the preview and final apply confirmation, and the existing handler renews the
attempt ID. A patch cannot change a price and retain/force the old approval.
Checking the loss checkbox itself also requires a fresh preview and final
apply confirmation.

Selections are already included in the canonical request/preview fingerprint
and transactional audit receipt, so the new flag is included in both without
changing the repository's financial write logic. Tests verify fingerprint
changes. The new NUnit scenario verifies stale-price preview rejection and
the committed flag/amounts in the audit receipt **when executed on Windows**;
here it was compiled, not run.

### Integration and validation

Ship the existing catalogue model/service/bridge partial and frontend
types/modal together. No new central wiring, compile items, permission keys,
dependency or schema migration is required for this completion. Outstanding
pre-change previews must be refreshed; audit history is not rewritten.
Rebuild the frontend after the parent-owned type-check blocker is resolved;
do not package the older `dist` output with the new host validator.

The production regression initially failed on both client and native
validators. After completion:

- Catalogue frontend tests: **9 passed**.
- Canonical merchant guard cases: **19 passed**, unchanged.
- Provider-free production-host assertions: **63 passed**, including native
  preview/apply rejection before database access, explicit approval, omitted
  flag default and request fingerprint binding.
- Catalogue tooling: **8 passed**; offline pack validation passed.
- C# 5 Release/DEBUG source compilation and the NUnit scenario compilation
  passed when the actual, parent-owned `Models/RequestAdmission.cs` was
  explicitly included. The standard project-list helper was initially
  blocked because that concurrent model was not yet registered. No project
  file was edited and no stub substituted.
- Frontend lint passed. The full current suite had **709 passed, 1 failed,
  0 skipped**, retaining the unrelated e-pay source-pattern failure noted
  above. Build was blocked by the concurrent
  `financialAttempt.ts:167` TS18047 (possibly-null `idempotencyKey`), outside
  catalogue ownership.

No Windows SQLite/provider execution is claimed. No network request was made.
The 108-candidate pack, both pins and all 17 inventoried originals are
unchanged; no refreeze was performed. Manifest SHA-256 remains
`c7276a34e2047b3323dc825fff3e137f65aba0df1db29ae49b73b1edcb7f99f6`.
