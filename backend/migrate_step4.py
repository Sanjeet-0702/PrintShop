"""
Run from the backend folder:
    python migrate_step4.py

Adds what the shop dashboard, notifications and feedback need:
  - shops.password_hash
  - orders.failure_reason, ready_at, collected_at, rating, feedback
  - the notifications table
  - the order_items table for multi-document orders

Safe to run more than once.
"""

import sqlite3

conn = sqlite3.connect("printshop.db")
cur = conn.cursor()


def columns(table):
    return [row[1] for row in cur.execute(f"PRAGMA table_info({table})")]


def add_column(table, name, definition):
    if name not in columns(table):
        cur.execute(f"ALTER TABLE {table} ADD COLUMN {name} {definition}")
        print(f"  added {table}.{name}")


add_column("shops", "password_hash", "VARCHAR(255)")

add_column("orders", "failure_reason", "TEXT")
add_column("orders", "ready_at", "DATETIME")
add_column("orders", "collected_at", "DATETIME")
add_column("orders", "rating", "INTEGER")
add_column("orders", "feedback", "TEXT")

cur.execute(
    """
    CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY,
        order_id INTEGER NOT NULL,
        event VARCHAR(30) NOT NULL,
        channel VARCHAR(30) NOT NULL DEFAULT 'inapp',
        message TEXT NOT NULL,
        created_at DATETIME NOT NULL,
        FOREIGN KEY(order_id) REFERENCES orders (id)
    )
    """
)

cur.execute(
    "CREATE INDEX IF NOT EXISTS ix_notifications_order_id "
    "ON notifications (order_id)"
)

cur.execute(
    """
    CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY,
        order_id INTEGER NOT NULL,
        original_filename VARCHAR(255) NOT NULL,
        stored_filename VARCHAR(255) NOT NULL,
        file_path TEXT NOT NULL,
        file_type VARCHAR(20) NOT NULL,
        original_pages INTEGER NOT NULL,
        selected_pages INTEGER NOT NULL,
        page_range TEXT NOT NULL DEFAULT '',
        copies INTEGER NOT NULL,
        total_printed_pages INTEGER NOT NULL,
        print_type VARCHAR(20) NOT NULL,
        paper_size VARCHAR(30) NOT NULL DEFAULT 'A4',
        orientation VARCHAR(30) NOT NULL DEFAULT 'auto',
        duplex VARCHAR(30) NOT NULL DEFAULT 'simplex',
        pages_per_sheet INTEGER NOT NULL DEFAULT 1,
        scale_mode VARCHAR(30) NOT NULL DEFAULT 'fit',
        quality VARCHAR(30) NOT NULL DEFAULT 'normal',
        price FLOAT NOT NULL,
        FOREIGN KEY(order_id) REFERENCES orders (id)
    )
    """
)

cur.execute(
    "CREATE INDEX IF NOT EXISTS ix_order_items_order_id "
    "ON order_items (order_id)"
)

conn.commit()
conn.close()

print("Migration done.")
print("Next: set a password for your shop with")
print("  python shop_cli.py password demo-shop")