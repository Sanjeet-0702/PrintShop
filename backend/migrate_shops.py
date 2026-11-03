"""
Run once from the backend folder:  python migrate_shops.py

- creates the shops table (if missing)
- adds shop_id and pickup_code to orders (if missing)
- creates one default demo shop and assigns old orders to it
Safe to run more than once.
"""

import sqlite3
from datetime import datetime

conn = sqlite3.connect("printshop.db")
cur = conn.cursor()

# 1) shops table
cur.execute(
    """
    CREATE TABLE IF NOT EXISTS shops (
        id INTEGER PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        slug VARCHAR(60) NOT NULL UNIQUE,
        supports_bw BOOLEAN NOT NULL DEFAULT 1,
        supports_color BOOLEAN NOT NULL DEFAULT 0,
        supports_photo BOOLEAN NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL
    )
    """
)
cur.execute("CREATE INDEX IF NOT EXISTS ix_shops_slug ON shops (slug)")

# 2) new columns on orders
existing = [row[1] for row in cur.execute("PRAGMA table_info(orders)")]

if "shop_id" not in existing:
    cur.execute("ALTER TABLE orders ADD COLUMN shop_id INTEGER")

if "pickup_code" not in existing:
    cur.execute("ALTER TABLE orders ADD COLUMN pickup_code VARCHAR(8)")

# 3) default demo shop (black & white + colour)
row = cur.execute(
    "SELECT id FROM shops WHERE slug = ?", ("demo-shop",)
).fetchone()

if row is None:
    cur.execute(
        """
        INSERT INTO shops
            (name, slug, supports_bw, supports_color,
             supports_photo, is_active, created_at)
        VALUES (?, ?, 1, 1, 0, 1, ?)
        """,
        ("Demo Print Shop", "demo-shop", str(datetime.utcnow())),
    )
    shop_id = cur.lastrowid
else:
    shop_id = row[0]

# 4) attach old orders to the demo shop
cur.execute("UPDATE orders SET shop_id = ? WHERE shop_id IS NULL", (shop_id,))

conn.commit()
conn.close()
print("Migration done. Default shop id =", shop_id)