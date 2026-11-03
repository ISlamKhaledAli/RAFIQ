"""Portable evidence, NOT a substitute for the Windows service/IPC NUnit gate.

Runs actual SQL extracted from repository methods and actual claim/batch DDL from
MigrationRunner.cs. All writes are confined to fresh in-memory SQLite databases.
Usage: python3 .../finance_sql_test.py --source-root <working-copy-or-baseline>
"""
import argparse
from pathlib import Path
import re
import sqlite3
import sys
import unittest


ROOT = Path(__file__).resolve().parents[3]


def source(relative):
    return (ROOT / relative).read_text(encoding="utf-8-sig")


def ddl(table):
    text = source("desktop/Database/MigrationRunner.cs")
    return re.search(
        r"CREATE TABLE IF NOT EXISTS " + re.escape(table) + r"\s*\(.*?\);",
        text, re.S
    ).group(0)


class ClaimBatchSqlTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.addCleanup(self.db.close)
        self.db.execute("PRAGMA foreign_keys=ON")
        # Upstream references only need identity for this narrowly scoped FK test.
        for table in ("sales", "insurance_companies", "insurance_contracts", "insurance_members"):
            self.db.execute("CREATE TABLE " + table + "(id TEXT PRIMARY KEY)")
            self.db.execute("INSERT INTO " + table + " VALUES('parent')")
        self.db.execute(ddl("insurance_claim_batches"))
        self.db.execute(ddl("insurance_claim_lines"))
        self.db.execute("""
            INSERT INTO insurance_claim_lines
            (id,sale_id,contract_id,company_id,member_no,patient_name,
             total_invoice_piasters,covered_piasters,patient_piasters,
             company_piasters,status,created_at)
            VALUES('claim','parent','parent','parent','member','Patient',
                   10000,10000,2000,8000,'pending','2026-11-02T00:00:00Z')
        """)
        self.db.commit()
        text = source("desktop/Repositories/InsuranceRepository.cs")
        method = text[text.index("public InsuranceClaimBatch CreateClaimBatch("):
                      text.index("public InsuranceClaimBatch SettleBatch(")]
        self.link = re.search(
            r"UPDATE insurance_claim_lines\s+SET status = 'batched'.*?;", method, re.S)
        self.parent = re.search(
            r"INSERT INTO insurance_claim_batches\s*\(.*?;", method, re.S)
        self.params = dict(id="batch", bid="batch", no="CLM-TEST", cid="parent",
                           period="2026-11", cnt=1, amt=8000, now="2026-11-02T00:00:00Z",
                           notes="test", by="test", lid="claim")

    def assert_linked(self):
        self.assertEqual(("batched", "batch"), self.db.execute(
            "SELECT status,claim_batch_id FROM insurance_claim_lines").fetchone())
        self.assertEqual([], self.db.execute("PRAGMA foreign_key_check").fetchall())

    def test_FIN08_actual_repository_write_order_respects_immediate_fk(self):
        # Preserve source order, not a hand-written reimplementation of the SQL.
        try:
            with self.db:
                for statement in sorted((self.link, self.parent), key=lambda match: match.start()):
                    self.db.execute(statement.group(0), self.params)
        except sqlite3.IntegrityError:
            self.assertEqual(("pending", None), self.db.execute(
                "SELECT status,claim_batch_id FROM insurance_claim_lines").fetchone())
            self.assertEqual(0, self.db.execute(
                "SELECT COUNT(*) FROM insurance_claim_batches").fetchone()[0])
            raise
        self.assert_linked()

    def test_FIN08_same_actual_sql_parent_first_control(self):
        with self.db:
            self.db.execute(self.parent.group(0), self.params)
            self.db.execute(self.link.group(0), self.params)
        self.assert_linked()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-root", type=Path, default=ROOT)
    options, remaining = parser.parse_known_args()
    ROOT = options.source_root.resolve()
    print("Actual SQL source root: " + str(ROOT), flush=True)
    unittest.main(argv=[sys.argv[0]] + remaining, verbosity=2)
