"""
Order utilities:
- Daily resetting sequence numbers (ORD-001 .. ORD-999, ORD-1000+)
"""

from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from . import models

# Indian Standard Time (UTC+5:30) for local store operating day
IST = timezone(timedelta(hours=5, minutes=30))


def generate_daily_order_number(db: Session, shop_id: int) -> str:
    """
    Generate an order number that resets every 24 hours at midnight IST.
    Format:
      - 3 digits initially: ORD-001 to ORD-999
      - Automatically expands to 4 digits if needed: ORD-1000, ORD-1001, etc.
    """
    now_ist = datetime.now(IST)
    start_of_day_ist = now_ist.replace(hour=0, minute=0, second=0, microsecond=0)
    start_of_day_utc = start_of_day_ist.astimezone(timezone.utc).replace(tzinfo=None)

    # Count real orders created for this shop today
    today_count = (
        db.query(models.Order)
        .filter(
            models.Order.shop_id == shop_id,
            models.Order.created_at >= start_of_day_utc,
            ~models.Order.order_number.startswith("TMP-"),
        )
        .count()
    )

    seq = today_count + 1
    while True:
        candidate = f"ORD-{seq:03d}" if seq < 1000 else f"ORD-{seq}"
        exists = (
            db.query(models.Order.id)
            .filter(
                models.Order.shop_id == shop_id,
                models.Order.created_at >= start_of_day_utc,
                models.Order.order_number == candidate,
            )
            .first()
        )
        if not exists:
            return candidate
        seq += 1

