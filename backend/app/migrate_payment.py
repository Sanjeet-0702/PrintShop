from sqlalchemy import inspect
from sqlalchemy import text

from .database import engine


def add_column_if_missing(
    table_name: str,
    column_name: str,
    column_definition: str,
):
    """
    Add a column only if it doesn't already exist.
    """

    inspector = inspect(engine)

    existing_columns = {
        column["name"]
        for column in inspector.get_columns(
            table_name
        )
    }

    if column_name in existing_columns:
        print(
            f"[SKIP] {column_name} already exists"
        )
        return

    sql = f"""
        ALTER TABLE {table_name}
        ADD COLUMN {column_name}
        {column_definition}
    """

    with engine.begin() as connection:
        connection.execute(text(sql))

    print(
        f"[ADDED] {column_name}"
    )


def main():

    table_name = "orders"

    # Razorpay order ID
    add_column_if_missing(
        table_name,
        "razorpay_order_id",
        "VARCHAR(100)",
    )

    # Razorpay payment ID
    add_column_if_missing(
        table_name,
        "razorpay_payment_id",
        "VARCHAR(100)",
    )

    # Razorpay signature
    add_column_if_missing(
        table_name,
        "razorpay_signature",
        "VARCHAR(255)",
    )

    print(
        "\nPayment database migration completed."
    )


if __name__ == "__main__":
    main()