from sqlalchemy import inspect, text

from .database import engine


def add_column_if_missing(
    table_name: str,
    column_name: str,
    column_definition: str,
):
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

    with engine.begin() as connection:
        connection.execute(
            text(
                f"""
                ALTER TABLE {table_name}
                ADD COLUMN {column_name}
                {column_definition}
                """
            )
        )

    print(
        f"[ADDED] {column_name}"
    )


def main():

    table_name = "orders"

    add_column_if_missing(
        table_name,
        "customer_name",
        "VARCHAR(100)",
    )

    add_column_if_missing(
        table_name,
        "customer_phone",
        "VARCHAR(20)",
    )

    add_column_if_missing(
        table_name,
        "customer_email",
        "VARCHAR(255)",
    )

    print(
        "Database migration completed."
    )


if __name__ == "__main__":
    main()