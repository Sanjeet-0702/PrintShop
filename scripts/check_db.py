import sqlite3

conn = sqlite3.connect("backend/printshop.db")
cur = conn.cursor()
cur.execute("SELECT id, order_number, order_status, failure_reason FROM orders")
rows = cur.fetchall()
for r in rows:
    print(r)

# If any order is stuck in PRINTING, set it to FAILED with reason so user can retry or see it cleanly
cur.execute("UPDATE orders SET order_status = 'FAILED', failure_reason = 'Printer was disconnected during printing' WHERE order_status = 'PRINTING'")
if cur.rowcount > 0:
    print(f"Updated {cur.rowcount} stuck PRINTING orders to FAILED")
    conn.commit()

conn.close()

