"""Executes SQL returned by the compiled production ReturnProfitSql method.

Only disposable files and in-memory SQLite are used. This is portable SQL
evidence, not Windows System.Data.SQLite service/provider certification.
"""
import argparse
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[3]
PROBE = Path(__file__).with_name("CoreMoneySqlProbe.cs")


class ActualReturnProfitSqlTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not shutil.which("mcs") or not shutil.which("mono"):
            raise RuntimeError("Mono mcs and runtime are required; do not silently skip SQL verification.")
        cls.temp = tempfile.TemporaryDirectory(prefix="rafiq-return-profit-")
        cls.addClassCleanup(cls.temp.cleanup)
        executable = str(Path(cls.temp.name) / "CoreMoneySqlProbe.exe")
        subprocess.run(["mcs", "-langversion:5", "-out:" + executable,
                        str(ROOT / "desktop/Services/ReturnProfitSql.cs"), str(PROBE)], check=True)
        cls.sql = {}
        for mode in ("original", "catalog"):
            cls.sql[mode] = subprocess.check_output(["mono", executable, mode], text=True)

    def result(self, recipe=False, damaged=False, movement=None, catalog=False):
        with sqlite3.connect(":memory:") as db:
            db.executescript("""
                CREATE TABLE returns(id TEXT PRIMARY KEY);
                CREATE TABLE products(id TEXT PRIMARY KEY, cost_piasters INTEGER, tax_rate_percent INTEGER);
                CREATE TABLE sale_items(id TEXT PRIMARY KEY, quantity_milli INTEGER,
                    unit_cost_piasters INTEGER, tax_piasters INTEGER, stock_deducted INTEGER);
                CREATE TABLE return_items(return_id TEXT, sale_item_id TEXT, product_id TEXT,
                    quantity_milli INTEGER, total_piasters INTEGER, is_damaged INTEGER);
                CREATE TABLE stock_movements(reference_id TEXT, reference_type TEXT, product_id TEXT,
                    movement_type TEXT, quantity_milli INTEGER);
                INSERT INTO returns VALUES ('refund');
                INSERT INTO products VALUES ('product', 300, 0);
            """)
            db.execute("INSERT INTO sale_items VALUES ('line',1000,300,0,?)", (0 if recipe else 1,))
            db.execute("INSERT INTO return_items VALUES ('refund','line','product',1000,1000,?)",
                       (1 if damaged else 0,))
            if movement:
                db.execute("INSERT INTO stock_movements VALUES (?,?,?,?,?)", movement)
            returned_profit, returned_tax = db.execute(
                self.sql["catalog" if catalog else "original"], {"returnId": "refund"}).fetchone()
            self.assertEqual(0, returned_tax)
            return 700 - returned_profit

    def test_FIN12_recipe_consumption_remains_loss_without_restored_stock(self):
        for catalog in (False, True):
            with self.subTest(catalog=catalog):
                self.assertEqual(-300, self.result(recipe=True, catalog=catalog))

    def test_FIN12_undamaged_flag_alone_never_recovers_cost(self):
        for catalog in (False, True):
            with self.subTest(catalog=catalog):
                self.assertEqual(-300, self.result(catalog=catalog))

    def test_FIN12_actual_physical_return_recovers_cost(self):
        for catalog in (False, True):
            with self.subTest(catalog=catalog):
                self.assertEqual(0, self.result(
                    movement=("refund", "RETURN", "product", "REFUND", 1000), catalog=catalog))

    def test_FIN12_damaged_return_preserves_inventory_loss(self):
        self.assertEqual(-300, self.result(damaged=True,
            movement=("refund", "RETURN", "product", "DAMAGED_RETURN", 1000)))

    def test_FIN12_unrelated_or_zero_movements_cannot_prove_restoration(self):
        for movement in (("other", "RETURN", "product", "REFUND", 1000),
                         ("refund", "RETURN", "other-product", "REFUND", 1000),
                         ("refund", "RETURN", "product", "REFUND", 0)):
            with self.subTest(movement=movement):
                self.assertEqual(-300, self.result(movement=movement))

    def test_FIN12_recipe_line_never_recovers_other_line_inventory(self):
        self.assertEqual(-300, self.result(recipe=True,
            movement=("refund", "RETURN", "product", "REFUND", 1000)))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-root", type=Path, default=ROOT)
    options, remaining = parser.parse_known_args()
    ROOT = options.source_root.resolve()
    print("Compiled production SQL source: " + str(ROOT), flush=True)
    unittest.main(argv=[sys.argv[0]] + remaining, verbosity=2)
