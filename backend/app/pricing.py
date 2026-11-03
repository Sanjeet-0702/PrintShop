from decimal import Decimal


def calculate_tiered_price(
    pages: int,
    copies: int,
    rate_1_10: Decimal,
    rate_11_20: Decimal,
    rate_21_plus: Decimal,
) -> Decimal:
    """
    Calculate tiered printing price.

    Example:
    15 pages:
      first 10  -> rate_1_10
      next 5    -> rate_11_20
    """

    if pages < 1:
        raise ValueError("Pages must be at least 1")

    if copies < 1:
        raise ValueError("Copies must be at least 1")

    total_pages = pages * copies

    first_tier = min(total_pages, 10)
    second_tier = min(max(total_pages - 10, 0), 10)
    third_tier = max(total_pages - 20, 0)

    total = (
        Decimal(first_tier) * rate_1_10
        + Decimal(second_tier) * rate_11_20
        + Decimal(third_tier) * rate_21_plus
    )

    return total.quantize(Decimal("0.01"))


def calculate_bw_price(pages: int, copies: int) -> Decimal:
    return calculate_tiered_price(
        pages=pages,
        copies=copies,
        rate_1_10=Decimal("3.00"),
        rate_11_20=Decimal("2.50"),
        rate_21_plus=Decimal("2.00"),
    )


def calculate_color_price(pages: int, copies: int) -> Decimal:
    return calculate_tiered_price(
        pages=pages,
        copies=copies,
        rate_1_10=Decimal("10.00"),
        rate_11_20=Decimal("9.00"),
        rate_21_plus=Decimal("8.00"),
    )


def calculate_photo_price(photo_size: str, quantity: int) -> Decimal:
    rates = {
        "4x6": Decimal("10.00"),
        "5x7": Decimal("15.00"),
    }

    if photo_size not in rates:
        raise ValueError("Unsupported photo size")

    if quantity < 1:
        raise ValueError("Photo quantity must be at least 1")

    return (rates[photo_size] * Decimal(quantity)).quantize(
        Decimal("0.01")
    )
from typing import List


def parse_page_range(page_range: str, total_pages: int) -> List[int]:
    """
    Parse page ranges such as:

    1-3,5,8-10

    Returns zero-based page indexes internally.
    """

    if total_pages < 1:
        raise ValueError("Document must contain at least one page.")

    if not page_range.strip():
        return list(range(total_pages))

    selected = set()

    parts = page_range.split(",")

    for part in parts:
        part = part.strip()

        if not part:
            continue

        if "-" in part:
            pieces = part.split("-")

            if len(pieces) != 2:
                raise ValueError(
                    f"Invalid page range: {part}"
                )

            start = int(pieces[0].strip())
            end = int(pieces[1].strip())

            if start < 1 or end < 1:
                raise ValueError(
                    "Page numbers must start from 1."
                )

            if start > end:
                raise ValueError(
                    f"Invalid range: {part}"
                )

            if end > total_pages:
                raise ValueError(
                    f"Page {end} does not exist. "
                    f"Document has {total_pages} pages."
                )

            for page in range(start, end + 1):
                selected.add(page - 1)

        else:
            page = int(part)

            if page < 1 or page > total_pages:
                raise ValueError(
                    f"Page {page} does not exist."
                )

            selected.add(page - 1)

    if not selected:
        raise ValueError("No pages selected.")

    return sorted(selected)