"""
Multi-file cart: quote + create order + read items.

New routes (the old /api/orders routes are untouched):
    GET  /api/cart/rates
    POST /api/cart/quote
    POST /api/cart/orders
    GET  /api/cart/orders/{order_number}?pickup_code=...

Payment still uses /api/payments/create and /verify (they read order.price).
"""

import logging
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from . import models
from .database import get_db
from .file_service import resolve_stored_file
from .security import codes_match, generate_pickup_code

log = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/api/cart", tags=["cart"])

# =========================================================
# PRICES  (whole rupees). Fixed rates matching screenshot:
# B&W: Rs 3/page, Coloured: Rs 10/page
# Delivery charge: Rs 15, Handling charge: Rs 5
# =========================================================

RATES = {
    "bw": 3,
    "color": 10,
}

ORIGINAL_RATES = {
    "bw": 6,
    "color": 19,
}

DELIVERY_CHARGE = 0
HANDLING_CHARGE = 0
MAX_ITEMS = 15
ORIENTATIONS = {"portrait", "landscape"}

# =========================================================
# REQUEST MODELS
# =========================================================

class CartItem(BaseModel):
    stored_filename: str = Field(min_length=1, max_length=100)
    original_filename: str = Field(min_length=1, max_length=255)
    copies: int = Field(default=1, ge=1, le=100)
    print_type: str
    orientation: str = "portrait"
    page_range: str = ""


class QuoteRequest(BaseModel):
    shop_slug: str = "demo-shop"
    items: list[CartItem] = Field(min_length=1, max_length=MAX_ITEMS)


class CartOrderCreate(QuoteRequest):
    customer_name: str = Field(min_length=2, max_length=100)
    customer_phone: str = Field(min_length=10, max_length=20)
    customer_email: str | None = Field(default=None, max_length=255)


# =========================================================
# CORE
# =========================================================

def _get_shop(db: Session, slug: str) -> models.Shop:
    import re
    from sqlalchemy import or_, func

    slug_clean = (slug or "").strip().lower()
    slug_hyphen = re.sub(r"[^a-z0-9]+", "-", slug_clean).strip("-")

    shop = (
        db.query(models.Shop)
        .filter(
            models.Shop.is_active.is_(True),
            or_(
                models.Shop.slug == slug_clean,
                models.Shop.slug == slug_hyphen,
                func.lower(models.Shop.name) == slug_clean,
            ),
        )
        .first()
    )



    if not shop:
        raise HTTPException(status_code=404, detail="No print shop found. Please register a shop first.")
    return shop


def _build_quote(shop: models.Shop, items: list[CartItem]) -> dict:
    """Validates every file on the server and prices the whole cart using shop custom rates."""

    shop_bw = float(getattr(shop, "bw_rate", 3.0) or 3.0)
    shop_color = float(getattr(shop, "color_rate", 10.0) or 10.0)
    shop_handling = float(getattr(shop, "handling_charge", 0.0) or 0.0)

    shop_rates = {
        "bw": shop_bw,
        "color": shop_color,
    }
    shop_orig_rates = {
        "bw": round(shop_bw * 2.0, 2),
        "color": round(shop_color * 1.9, 2),
    }

    seen = set()
    lines = []
    pages_by_type = {"bw": 0, "color": 0}

    for item in items:

        if item.print_type not in shop_rates:
            raise ValueError("This print type is not available.")
        if item.print_type == "bw" and not shop.supports_bw:
            raise ValueError("This shop does not offer black & white printing.")
        if item.print_type == "color" and not shop.supports_color:
            raise ValueError("This shop does not offer colour printing.")
        if item.orientation not in ORIENTATIONS:
            raise ValueError("Invalid orientation.")
        if item.stored_filename in seen:
            raise ValueError("The same file was added twice.")
        seen.add(item.stored_filename)

        try:
            upload = resolve_stored_file(item.stored_filename)
        except Exception:
            raise ValueError(
                f"{item.original_filename}: file expired, please upload it again."
            )

        total_doc_pages = int(upload["pages"])
        page_range_clean = (item.page_range or "").strip()
        if page_range_clean:
            from .pricing import parse_page_range
            try:
                selected_indices = parse_page_range(page_range_clean, total_doc_pages)
                pages = len(selected_indices)
            except ValueError as ve:
                raise ValueError(f"{item.original_filename}: {ve}")
        else:
            pages = total_doc_pages

        printed = pages * item.copies
        pages_by_type[item.print_type] += printed

        line_price = round(printed * shop_rates[item.print_type], 2)
        line_orig_price = round(printed * shop_orig_rates[item.print_type], 2)

        lines.append({
            "item": item,
            "upload": upload,
            "pages": pages,
            "total_doc_pages": total_doc_pages,
            "printed_pages": printed,
            "price": line_price,
            "original_price": line_orig_price,
        })

    items_total = round(sum(line["price"] for line in lines), 2)
    original_total = round(sum(line["original_price"] for line in lines), 2)
    discount = max(round(original_total - items_total, 2), 0)
    grand_total = round(items_total + DELIVERY_CHARGE + shop_handling, 2)

    return {
        "lines": lines,
        "pages_by_type": pages_by_type,
        "items_total": items_total,
        "original_total": original_total,
        "item_total": items_total,
        "bulk_discount": discount,
        "discount": discount,
        "delivery_charge": DELIVERY_CHARGE,
        "handling_charge": shop_handling,
        "convenience_fee": shop_handling,
        "total": grand_total,
    }


def _public_quote(quote: dict) -> dict:
    return {
        "items": [
            {
                "stored_filename": line["item"].stored_filename,
                "original_filename": line["item"].original_filename,
                "pages": line["pages"],
                "total_doc_pages": line.get("total_doc_pages", line["pages"]),
                "page_range": line["item"].page_range or "",
                "copies": line["item"].copies,
                "print_type": line["item"].print_type,
                "orientation": line["item"].orientation,
                "printed_pages": line["printed_pages"],
                "price": line["price"],
                "original_price": line["original_price"],
            }
            for line in quote["lines"]
        ],
        "total_pages": sum(quote["pages_by_type"].values()),
        "items_total": quote["items_total"],
        "original_total": quote["original_total"],
        "discount": quote["discount"],
        "bulk_discount": quote["discount"],
        "delivery_charge": quote["delivery_charge"],
        "handling_charge": quote["handling_charge"],
        "convenience_fee": quote["handling_charge"],
        "total": quote["total"],
        "currency": "INR",
    }


# =========================================================
# ROUTES
# =========================================================

@router.get("/rates")
def rates(shop_slug: str | None = None, db: Session = Depends(get_db)):
    if shop_slug:
        try:
            shop = _get_shop(db, shop_slug)
            bw = float(getattr(shop, "bw_rate", 3.0) or 3.0)
            color = float(getattr(shop, "color_rate", 10.0) or 10.0)
            handling = float(getattr(shop, "handling_charge", 0.0) or 0.0)
            return {
                "success": True,
                "bw_per_page": bw,
                "color_per_page": color,
                "original_bw_per_page": round(bw * 2.0, 2),
                "original_color_per_page": round(color * 1.9, 2),
                "delivery_charge": DELIVERY_CHARGE,
                "handling_charge": handling,
                "max_items": MAX_ITEMS,
            }
        except Exception:
            pass
    return {
        "success": True,
        "bw_per_page": RATES["bw"],
        "color_per_page": RATES["color"],
        "original_bw_per_page": ORIGINAL_RATES["bw"],
        "original_color_per_page": ORIGINAL_RATES["color"],
        "delivery_charge": DELIVERY_CHARGE,
        "handling_charge": HANDLING_CHARGE,
        "max_items": MAX_ITEMS,
    }


@router.post("/quote")
def quote(request: QuoteRequest, db: Session = Depends(get_db)):
    shop = _get_shop(db, request.shop_slug)
    try:
        result = _build_quote(shop, request.items)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    return {"success": True, "quote": _public_quote(result)}


@router.post("/orders")
def create_cart_order(data: CartOrderCreate, db: Session = Depends(get_db)):

    shop = _get_shop(db, data.shop_slug)

    if not getattr(shop, "is_open", True):
        msg = getattr(shop, "status_message", None) or "This store is temporarily closed."
        back_at = getattr(shop, "back_at", None)
        if back_at:
            msg += f" (Expected back at {back_at})"
        raise HTTPException(
            status_code=400,
            detail=f"Store is currently closed: {msg}",
        )

    try:
        result = _build_quote(shop, data.items)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))

    lines = result["lines"]
    first = lines[0]
    first_name = first["item"].original_filename
    title = first_name if len(lines) == 1 else f"{first_name} (+{len(lines) - 1} more)"
    total_pages = sum(line["pages"] for line in lines)
    total_printed = sum(line["printed_pages"] for line in lines)

    try:
        order = models.Order(
            shop_id=shop.id,
            pickup_code=generate_pickup_code(),
            order_number=f"TMP-{uuid4().hex[:20]}",
            customer_name=data.customer_name.strip(),
            customer_phone=data.customer_phone.strip(),
            customer_email=data.customer_email,
            # first file, so the old dashboard / queue code keeps working
            original_filename=title[:255],
            stored_filename=first["upload"]["stored_filename"],
            file_path=first["upload"]["file_path"],
            file_type=first["upload"]["file_type"],
            original_pages=total_pages,
            selected_pages=total_pages,
            page_range=(first["item"].page_range or "").strip(),
            copies=first["item"].copies,
            total_printed_pages=total_printed,
            collate="yes",
            print_type=first["item"].print_type,
            paper_size="A4",
            orientation=first["item"].orientation,
            duplex="simplex",
            pages_per_sheet=1,
            scale_mode="fit",
            quality="normal",
            price=float(result["total"]),
            currency="INR",
            payment_status="PENDING",
            order_status="CREATED",
        )
        db.add(order)
        db.flush()
        order.order_number = f"PS-{10000 + order.id}"

        for position, line in enumerate(lines):
            item = line["item"]
            db.add(models.OrderItem(
                order_id=order.id,
                position=position,
                original_filename=item.original_filename,
                stored_filename=line["upload"]["stored_filename"],
                file_path=line["upload"]["file_path"],
                file_type=line["upload"]["file_type"],
                original_pages=line["total_doc_pages"],
                selected_pages=line["pages"],
                page_range=(item.page_range or "").strip(),
                copies=item.copies,
                print_type=item.print_type,
                orientation=item.orientation,
                paper_size="A4",
                collate="yes",
                duplex="simplex",
                pages_per_sheet=1,
                scale_mode="fit",
                quality="normal",
                total_printed_pages=line["printed_pages"],
                price=float(line["price"]),
                item_status="PENDING",
            ))

        db.commit()
        db.refresh(order)

    except Exception:
        db.rollback()
        log.exception("Cart order creation failed")
        raise HTTPException(
            status_code=500,
            detail="Could not create your order. Please try again.",
        )

    return {
        "success": True,
        "order": {
            "id": order.id,
            "order_number": order.order_number,
            "pickup_code": order.pickup_code,
            "shop_name": shop.name,
            "price": order.price,
            "currency": order.currency,
            "payment_status": order.payment_status,
            "order_status": order.order_status,
            "created_at": order.created_at,
        },
        "quote": _public_quote(result),
    }


@router.get("/orders/{order_number}")
def get_cart_order(
    order_number: str,
    pickup_code: str,
    db: Session = Depends(get_db),
):
    order = (
        db.query(models.Order)
        .filter(models.Order.order_number == order_number)
        .first()
    )
    if not order or not codes_match(order.pickup_code, pickup_code):
        raise HTTPException(status_code=404, detail="Order not found.")

    return {
        "success": True,
        "items": [
            {
                "original_filename": i.original_filename,
                "pages": i.original_pages,
                "copies": i.copies,
                "print_type": i.print_type,
                "orientation": i.orientation,
                "price": i.price,
                "item_status": i.item_status,
            }
            for i in order.items
        ],
    }
