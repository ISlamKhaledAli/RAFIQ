import sqlite3, sys
sys.stdout.reconfigure(encoding='utf-8')
conn = sqlite3.connect(r'C:\ProgramData\RafiqPOS\data\rafiq_pos.db')
c = conn.cursor()
c.execute("SELECT * FROM payments")
print("Payments rows:", c.fetchall())
