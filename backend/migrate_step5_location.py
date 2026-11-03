"""
Run from the backend folder:
    python migrate_step5_location.py

Adds geolocation and address fields to shops:
  - shops.address
  - shops.city
  - shops.latitude
  - shops.longitude

Sets up sample stores in Delhi and Mumbai to test proximity sorting
and the 3-4 km dark-store style coverage radius.
Safe to run more than once.
"""

import sqlite3
from datetime import datetime

conn = sqlite3.connect("printshop.db")
cur = conn.cursor()


def columns(table):
    return [row[1] for row in cur.execute(f"PRAGMA table_info({table})")]


def add_column(table, name, definition):
    if name not in columns(table):
        cur.execute(f"ALTER TABLE {table} ADD COLUMN {name} {definition}")
        print(f"  added {table}.{name}")


# 1) Add location columns
add_column("shops", "address", "VARCHAR(255)")
add_column("shops", "city", "VARCHAR(100)")
add_column("shops", "latitude", "FLOAT")
add_column("shops", "longitude", "FLOAT")

# 2) Update existing shops with coordinates & address
cur.execute(
    """
    UPDATE shops
    SET address = 'Shop 4, Station Road, Andheri West, Mumbai',
        city = 'Mumbai',
        latitude = 19.1197,
        longitude = 72.8464
    WHERE slug = 'bhatia-print-shop'
    """
)

cur.execute(
    """
    UPDATE shops
    SET address = 'YMCA Tourist Hostel, Jai Singh Road, Connaught Place, New Delhi',
        city = 'New Delhi',
        latitude = 28.6253,
        longitude = 77.2144
    WHERE slug = 'ymca-zerox'
    """
)

# 3) Insert nearby demo stores in Delhi to demonstrate 3-4km range logic
existing_slugs = [row[0] for row in cur.execute("SELECT slug FROM shops").fetchall()]

now_str = str(datetime.utcnow())

if "cp-express-print" not in existing_slugs:
    cur.execute(
        """
        INSERT INTO shops (
            name, slug, supports_bw, supports_color, supports_photo,
            is_active, is_open, address, city, latitude, longitude, created_at
        ) VALUES (
            'CP Express Print', 'cp-express-print', 1, 1, 0,
            1, 1, 'Shop 12, Janpath Mini Market, Connaught Place, New Delhi',
            'New Delhi', 28.6289, 77.2195, ?
        )
        """,
        (now_str,),
    )
    print("  added CP Express Print (Connaught Place, ~1.0 km from YMCA)")

if "karol-bagh-print-hub" not in existing_slugs:
    cur.execute(
        """
        INSERT INTO shops (
            name, slug, supports_bw, supports_color, supports_photo,
            is_active, is_open, address, city, latitude, longitude, created_at
        ) VALUES (
            'Karol Bagh Print Hub', 'karol-bagh-print-hub', 1, 1, 0,
            1, 1, 'Arya Samaj Road, Karol Bagh, New Delhi',
            'New Delhi', 28.6517, 77.1906, ?
        )
        """,
        (now_str,),
    )
    print("  added Karol Bagh Print Hub (Karol Bagh, ~4.8 km from YMCA - outside 4km radius)")

conn.commit()
conn.close()

print("Migration done. Location columns and demo shops configured.")

