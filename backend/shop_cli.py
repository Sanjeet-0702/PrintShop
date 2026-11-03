"""
Manage shops from the command line. Run it from the backend folder
with your virtual environment active:

    python shop_cli.py list
    python shop_cli.py password demo-shop        (set / change the dashboard password)
    python shop_cli.py create                    (add a new shop)
    python shop_cli.py services demo-shop        (change black&white / colour / photo)
"""

import argparse
import getpass
import re
import sys

from sqlalchemy.orm import Session

from app.database import Base, engine
from app import models
from app.security import hash_password


Base.metadata.create_all(bind=engine)


def ask_password(label="Password"):

    while True:

        first = getpass.getpass(f"{label} (at least 8 characters): ")

        if len(first) < 8:
            print("Too short. Try again.")
            continue

        if first != getpass.getpass("Type it again: "):
            print("They did not match. Try again.")
            continue

        return first


def ask_yes_no(question, default):

    hint = "Y/n" if default else "y/N"

    answer = input(f"{question} [{hint}]: ").strip().lower()

    if not answer:
        return default

    return answer.startswith("y")


def find_shop(db, slug):

    shop = db.query(models.Shop).filter(models.Shop.slug == slug).first()

    if not shop:
        sys.exit(f"No shop with the link name '{slug}'. Try: python shop_cli.py list")

    return shop


def cmd_list(db, _args):

    shops = db.query(models.Shop).order_by(models.Shop.id).all()

    if not shops:
        print("No shops yet. Add one with: python shop_cli.py create")
        return

    for shop in shops:

        services = [
            name
            for name, on in (
                ("black&white", shop.supports_bw),
                ("colour", shop.supports_color),
                ("photo", shop.supports_photo),
            )
            if on
        ]

        print(
            f"{shop.slug:25} {shop.name:28} "
            f"{', '.join(services) or 'no services':26} "
            f"{'password set' if shop.password_hash else 'NO PASSWORD'}"
            f"{'' if shop.is_active else '  (inactive)'}"
        )


def cmd_password(db, args):

    shop = find_shop(db, args.slug)

    shop.password_hash = hash_password(ask_password())

    db.commit()

    print(f"Password saved for {shop.name}.")


def cmd_create(db, _args):

    name = input("Shop name: ").strip()

    if len(name) < 2:
        sys.exit("The shop needs a name.")

    suggestion = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")

    slug = input(f"Link name [{suggestion}]: ").strip().lower() or suggestion

    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,58}", slug):
        sys.exit("The link name can only use a-z, 0-9 and '-'.")

    if db.query(models.Shop).filter(models.Shop.slug == slug).first():
        sys.exit("A shop with that link name already exists.")

    shop = models.Shop(
        name=name,
        slug=slug,
        supports_bw=ask_yes_no("Does the shop print black & white?", True),
        supports_color=ask_yes_no("Does the shop print in colour?", False),
        supports_photo=False,
        is_active=True,
        password_hash=hash_password(ask_password()),
    )

    db.add(shop)
    db.commit()

    print(f"Shop created. Customer link:  http://localhost:5173/?shop={slug}")
    print(f"Shop dashboard:               http://localhost:5173/?shop-admin={slug}")


def cmd_services(db, args):

    shop = find_shop(db, args.slug)

    shop.supports_bw = ask_yes_no(
        "Does the shop print black & white?", bool(shop.supports_bw)
    )

    shop.supports_color = ask_yes_no(
        "Does the shop print in colour?", bool(shop.supports_color)
    )

    if not shop.supports_bw and not shop.supports_color:
        sys.exit("A shop must offer at least one service. Nothing was changed.")

    db.commit()

    print("Saved.")


def main():

    parser = argparse.ArgumentParser(description="Manage PrintShop shops")

    commands = parser.add_subparsers(dest="command", required=True)

    commands.add_parser("list")

    for name in ("password", "services"):
        commands.add_parser(name).add_argument("slug")

    commands.add_parser("create")

    args = parser.parse_args()

    handlers = {
        "list": cmd_list,
        "password": cmd_password,
        "create": cmd_create,
        "services": cmd_services,
    }

    with Session(engine) as db:
        handlers[args.command](db, args)


if __name__ == "__main__":
    main()