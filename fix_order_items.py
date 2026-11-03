"""
One-time fix: the old order_items table has different columns.
Run this with the server STOPPED, from the backend folder:
    python fix_order_items.py
"""
import sqlite3
import sys

DB = sys.argv[1] if len(sys.argv) > 1 else "printshop.db"

con = sqlite3.connect(DB)
cur = con.cursor()

cols = [r[1] for r in cur.execute("PRAGMA table_info(order_items)")]

if not cols:
    print("No order_items table found. Nothing to fix. Just start the server.")
    sys.exit(0)

rows = cur.execute("SELECT COUNT(*) FROM order_items").fetchone()[0]
print("Old order_items columns:", cols)
print("Old order_items rows   :", rows)

if "position" in cols and "item_status" in cols:
    print("The table already has the new columns. Nothing to fix.")
    sys.exit(0)

# Drop the old indexes (their names would clash with the new table)
for (name,) in cur.execute(
    "SELECT name FROM sqlite_master WHERE type='index' "
    "AND tbl_name='order_items' AND sql IS NOT NULL"
).fetchall():
    cur.execute(f'DROP INDEX IF EXISTS "{name}"')

if rows == 0:
    cur.execute("DROP TABLE order_items")
    print("Old table was empty, so it was removed.")
else:
    cur.execute("DROP TABLE IF EXISTS order_items_old")
    cur.execute("ALTER TABLE order_items RENAME TO order_items_old")
    print(f"Old table had {rows} row(s). Kept as order_items_old.")

con.commit()
con.close()
print("Done. Start the server; it will create the new order_items table.")
