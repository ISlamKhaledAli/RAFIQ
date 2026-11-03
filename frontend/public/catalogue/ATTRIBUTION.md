# Open Food Facts Egypt food-reference pilot

Source: [Open Food Facts](https://world.openfoodfacts.org), © Open Food Facts contributors.
Database licensed under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/);
individual contents under [DbCL 1.0](https://opendatacommons.org/licenses/dbcl/1-0/).
Full licence notices accompany this pack in `licenses/`. No images, retailer
descriptions, prices, costs, stock, tax, translations or inferred pack factors are included.

This is a derivative reference database, distributed in machine-readable form,
with its acquisition metadata and transformation source. Preserve attribution,
licences and the offer/access to the derivative database when redistributing.
Publicly using or distributing an adapted database can trigger ODbL share-alike
and access obligations; consult the included licence, not a blanket exemption
for combined exports. Merchant prices, costs and transactions are separate
merchant-entered operational records, not Open Food Facts assertions.

Community records may be wrong or stale. Egypt membership means an OFF country
tag, not GS1 certification or guaranteed availability. The merchant must scan
the physical barcode, verify the exact brand/variant/quantity/pack and enter
real sale price and cost before creating a zero-stock product. Multipacks and
ambiguous quantities are excluded, never estimated. Conflicting/ambiguous
legacy name assignments for the same normalized GTIN are quarantined without
selecting a winner; mere overlap is not identity certification or a conflict.

`source/` holds bounded official filtered responses (only the requested identity
metadata), retrieval time, source URLs and hashes. `manifest.json` pins the files.
`quarantine.json` retains rejected source candidates with reasons; the separate
`legacy-quarantine.json` inventories old local artifacts **preserved in place**.
No online requests occur during browse, validation, preview, apply or checkout.
