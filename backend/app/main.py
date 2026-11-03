import hmac
import logging
import math
import secrets
from contextlib import asynccontextmanager
from uuid import uuid4

import razorpay

from fastapi import (
    Depends,
    FastAPI,
    File,
    HTTPException,
    UploadFile,
    Response,
)

from fastapi.concurrency import run_in_threadpool

from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from pydantic import BaseModel, Field

from pydantic_settings import (
    BaseSettings,
    SettingsConfigDict,
)

from sqlalchemy.orm import Session

from .database import (
    Base,
    engine,
    get_db,
)

from .file_service import (
    resolve_stored_file,
    save_uploaded_file,
)

from . import models

from .pricing import (
    calculate_bw_price,
    calculate_color_price,
    calculate_photo_price,
    parse_page_range,
)

from . import cart
from . import notifications
from . import shop_admin

from .notifications import (
    messages_for_order,
    notify,
)

from .print_queue import (
    WorkerConfig,
    start_worker,
    stop_worker,
)

from .security import (
    codes_match,
    generate_pickup_code,
)


# =========================================================
# SETTINGS
# =========================================================

class Settings(BaseSettings):

    app_name: str = "PrintShop Automation"

    frontend_url: str = (
        "http://localhost:5173"
    )

    razorpay_key_id: str = ""

    razorpay_key_secret: str = ""

    # Printing
    # "simulate" = pretend to print (no printer needed)
    # "windows"  = real printing, added in the next step
    print_mode: str = "simulate"

    # Delete the customer's file from the server after it is printed
    delete_file_after_print: bool = True

    # How long a simulated print takes per page (seconds)
    simulated_seconds_per_page: float = 0.5

    # Windows printing (PRINT_MODE=windows)
    # Full path to SumatraPDF.exe, e.g. C:/Tools/SumatraPDF.exe
    sumatra_path: str = ""

    # Exact printer name from Windows. Empty = the default printer.
    printer_name: str = ""

    # Customer files that were never printed are deleted after this long
    file_retention_hours: int = 24

    # Signs the shop dashboard login. Set a long random value in .env,
    # otherwise logins stop working every time the server restarts.
    secret_key: str = ""

    # Optional: email customers their order updates
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()


# =========================================================
# LIMITS AND ALLOWED VALUES
# =========================================================

MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB

# Print types a customer can order right now.
# (photo printing is not available in orders yet)
ORDERABLE_PRINT_TYPES = {"bw", "color"}

ALLOWED_OPTIONS = {
    "paper_size": {"A4", "A5", "A3", "Letter", "Legal"},
    "orientation": {"auto", "portrait", "landscape"},
    "duplex": {"simplex", "long_edge", "short_edge"},
    "scale_mode": {"fit", "actual", "shrink"},
    "quality": {"draft", "normal", "high", "photo"},
}

ALLOWED_PAGES_PER_SHEET = {1, 2, 4, 6, 9, 16}


# =========================================================
# RAZORPAY CLIENT
# =========================================================

razorpay_client = razorpay.Client(
    auth=(
        settings.razorpay_key_id,
        settings.razorpay_key_secret,
    )
)


# =========================================================
# FASTAPI APP
# =========================================================

@asynccontextmanager
async def lifespan(app: FastAPI):

    # Start the print queue worker when the server starts.
    start_worker(
        WorkerConfig(
            print_mode=settings.print_mode,
            delete_file_after_print=settings.delete_file_after_print,
            seconds_per_page=settings.simulated_seconds_per_page,
            printer_name=settings.printer_name,
            sumatra_path=settings.sumatra_path,
            file_retention_hours=settings.file_retention_hours,
        )
    )

    yield

    stop_worker()


app = FastAPI(
    title=settings.app_name,
    lifespan=lifespan,
)


# =========================================================
# SHOP DASHBOARD + NOTIFICATIONS
# =========================================================

if not settings.secret_key:

    settings.secret_key = secrets.token_urlsafe(48)

    logging.getLogger("uvicorn.error").warning(
        "SECRET_KEY is not set in .env. Shop logins will stop working "
        "every time the server restarts. Add a long random SECRET_KEY."
    )

shop_admin.configure(
    secret_key=settings.secret_key,
    frontend_url=settings.frontend_url,
    sumatra_path=settings.sumatra_path,
)

notifications.configure(
    frontend_url=settings.frontend_url,
    smtp_host=settings.smtp_host,
    smtp_port=settings.smtp_port,
    smtp_user=settings.smtp_user,
    smtp_password=settings.smtp_password,
    smtp_from=settings.smtp_from,
)

app.include_router(shop_admin.router)

# Multi-file cart: /api/cart/rates, /api/cart/quote, /api/cart/orders
app.include_router(cart.router)

from pathlib import Path
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
STATIC_DIR.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")



# =========================================================
# DATABASE
# =========================================================

Base.metadata.create_all(
    bind=engine
)


# =========================================================
# CORS
# =========================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        settings.frontend_url,
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def debug_global_exception_handler(request, exc):
    import traceback
    tb = traceback.format_exc()
    print("GLOBAL EXCEPTION CAUGHT:", tb, flush=True)
    return Response(
        content=f"SERVER EXCEPTION: {exc}\n\n{tb}",
        status_code=500,
        media_type="text/plain",
    )


# =========================================================
# REQUEST MODELS
# =========================================================

class PriceRequest(BaseModel):

    pages: int = Field(
        gt=0
    )

    page_range: str = ""

    copies: int = Field(
        gt=0,
        le=100
    )

    print_type: str

    paper_size: str = "A4"

    orientation: str = "auto"

    duplex: str = "simplex"

    pages_per_sheet: int = Field(
        default=1,
        gt=0
    )

    scale_mode: str = "fit"

    quality: str = "normal"

    photo_size: str | None = None

    photo_quantity: int | None = None


class OrderCreate(BaseModel):
    """
    What the browser is allowed to tell us about an order.

    NOT accepted from the browser any more: price, page counts,
    file path, file type. The server works those out itself.
    """

    # Shop
    shop_slug: str = "demo-shop"

    # Customer (kept private, never shown to the shop)
    customer_name: str = Field(
        min_length=2,
        max_length=100,
    )

    customer_phone: str = Field(
        min_length=10,
        max_length=20,
    )

    customer_email: str | None = Field(
        default=None,
        max_length=255,
    )

    # Document (only the stored name; the server finds the file)
    stored_filename: str = Field(
        min_length=1,
        max_length=100,
    )

    original_filename: str = Field(
        min_length=1,
        max_length=255,
    )

    page_range: str = Field(
        default="",
        max_length=200,
    )

    # Copies
    copies: int = Field(
        gt=0,
        le=100
    )

    collate: bool = True

    # Printing
    print_type: str

    paper_size: str = "A4"

    orientation: str = "auto"

    duplex: str = "simplex"

    pages_per_sheet: int = Field(
        default=1,
        gt=0
    )

    scale_mode: str = "fit"

    quality: str = "normal"


class PaymentVerifyRequest(BaseModel):

    order_number: str

    razorpay_payment_id: str

    razorpay_order_id: str

    razorpay_signature: str


# =========================================================
# HELPERS
# =========================================================

def pages_per_minute(print_type: str) -> int:
    """
    Temporary printer speed, used for time estimates.
    """

    return 20 if print_type == "bw" else 10


def estimate_wait(
    db: Session,
    order: models.Order,
) -> dict:
    """
    How many orders are ahead of this one in its shop's queue, and
    roughly how long until it starts printing.
    (First come first served for now.)
    """

    if order.order_status not in ("PAID", "QUEUED"):

        return {
            "queue_ahead": 0,
            "estimated_wait_minutes": 0,
        }

    ahead = (
        db.query(models.Order)
        .filter(
            models.Order.shop_id == order.shop_id,
            models.Order.order_status.in_(
                ["QUEUED", "PRINTING"]
            ),
            models.Order.id < order.id,
        )
        .all()
    )

    # Orders with several files: add up the time of each file.
    minutes = 0

    for other in ahead:

        if other.items:

            minutes += sum(
                item.total_printed_pages
                / pages_per_minute(item.print_type)
                for item in other.items
                if item.item_status != "PRINTED"
            )

        else:

            minutes += (
                other.total_printed_pages
                / pages_per_minute(other.print_type)
            )

    return {
        "queue_ahead": len(ahead),
        "estimated_wait_minutes": math.ceil(minutes),
    }


def build_quote(
    *,
    print_type: str,
    pages: int,
    page_range: str,
    copies: int,
    photo_size: str | None = None,
    photo_quantity: int | None = None,
) -> dict:
    """
    One place that works out pages, price and time.
    Used by BOTH the price preview and order creation, so the
    price a customer pays always comes from the server.
    Raises ValueError for any invalid input.
    """

    selected_pages_list = parse_page_range(
        page_range,
        pages,
    )

    selected_page_count = len(
        selected_pages_list
    )

    if print_type == "bw":

        price = calculate_bw_price(
            pages=selected_page_count,
            copies=copies,
        )

    elif print_type == "color":

        price = calculate_color_price(
            pages=selected_page_count,
            copies=copies,
        )

    elif print_type == "photo":

        if not photo_size:
            raise ValueError(
                "Photo size is required."
            )

        quantity = (
            photo_quantity
            if photo_quantity
            else selected_page_count * copies
        )

        price = calculate_photo_price(
            photo_size=photo_size,
            quantity=quantity,
        )

    else:

        raise ValueError(
            "Invalid print type."
        )

    total_printed_pages = (
        selected_page_count * copies
    )

    # Temporary printer speed (pages per minute)
    ppm = pages_per_minute(print_type)

    estimated_minutes = max(
        1,
        round(total_printed_pages / ppm),
    )

    return {
        "selected_pages": selected_page_count,
        "total_printed_pages": total_printed_pages,
        "price": float(price),
        "estimated_minutes": estimated_minutes,
    }


def validate_print_options(
    order_data: OrderCreate,
    shop: models.Shop,
) -> None:
    """
    Check the print settings against the allowed values
    and against what this shop actually offers.
    """

    if order_data.print_type not in ORDERABLE_PRINT_TYPES:
        raise ValueError(
            "This print type is not available."
        )

    if (
        order_data.print_type == "bw"
        and not shop.supports_bw
    ):
        raise ValueError(
            "This shop does not offer black & white printing."
        )

    if (
        order_data.print_type == "color"
        and not shop.supports_color
    ):
        raise ValueError(
            "This shop does not offer colour printing."
        )

    for field, allowed in ALLOWED_OPTIONS.items():

        if getattr(order_data, field) not in allowed:
            raise ValueError(
                f"Invalid value for {field}."
            )

    if (
        order_data.pages_per_sheet
        not in ALLOWED_PAGES_PER_SHEET
    ):
        raise ValueError(
            "Invalid pages per sheet."
        )


# =========================================================
# ROOT / HEALTH
# =========================================================

@app.get("/")
def root():

    return {
        "message":
            "PrintShop backend is running"
    }


@app.get("/api/health")
def health():

    return {
        "status": "ok"
    }


# =========================================================
# SHOP (public information only)
# =========================================================

@app.get("/api/shops")
def get_all_shops(
    lat: float | None = None,
    lng: float | None = None,
    max_distance_km: float = 4.0,
    db: Session = Depends(get_db),
):
    import math

    def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        r = 6371.0
        dlat = math.radians(lat2 - lat1)
        dlon = math.radians(lon2 - lon1)
        a = (
            math.sin(dlat / 2) ** 2
            + math.cos(math.radians(lat1))
            * math.cos(math.radians(lat2))
            * math.sin(dlon / 2) ** 2
        )
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        return r * c

    shops = (
        db.query(models.Shop)
        .filter(models.Shop.is_active.is_(True))
        .order_by(models.Shop.id.asc())
        .all()
    )

    results = []
    for s in shops:
        distance_km = None
        if lat is not None and lng is not None and s.latitude is not None and s.longitude is not None:
            distance_km = round(haversine_km(lat, lng, float(s.latitude), float(s.longitude)), 2)

        results.append({
            "id": s.id,
            "name": s.name,
            "slug": s.slug,
            "address": getattr(s, "address", None),
            "city": getattr(s, "city", None),
            "latitude": s.latitude,
            "longitude": s.longitude,
            "distance_km": distance_km,
            "is_within_range": (distance_km <= max_distance_km) if distance_km is not None else None,
            "supports_bw": bool(s.supports_bw),
            "supports_color": bool(s.supports_color),
            "supports_photo": bool(s.supports_photo),
            "is_open": bool(getattr(s, "is_open", True)),
            "status_message": getattr(s, "status_message", None),
            "back_at": getattr(s, "back_at", None),
            "bw_rate": float(getattr(s, "bw_rate", 3.0) or 3.0),
            "color_rate": float(getattr(s, "color_rate", 10.0) or 10.0),
            "handling_charge": float(getattr(s, "handling_charge", 5.0) or 5.0),
        })

    if lat is not None and lng is not None:
        results.sort(key=lambda x: (x["distance_km"] if x["distance_km"] is not None else 999999))

    return {
        "success": True,
        "max_distance_km": max_distance_km,
        "user_coords": {"lat": lat, "lng": lng} if (lat is not None and lng is not None) else None,
        "shops": results,
    }


@app.get("/api/shops/{slug}")
def get_shop(
    slug: str,
    db: Session = Depends(get_db),
):
    import re
    from sqlalchemy import or_, func

    slug_clean = (slug or "").strip().lower()
    slug_hyphen = re.sub(r"[^a-z0-9]+", "-", slug_clean).strip("-")

    if slug_clean in ("", "default"):
        raise HTTPException(
            status_code=404,
            detail="No shop selected. Please choose a nearby print shop.",
        )

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
        raise HTTPException(
            status_code=404,
            detail=f"Print shop '{slug}' not found. Please choose an active shop.",
        )

    return {
        "success": True,
        "shop": {
            "id": shop.id,
            "name": shop.name,
            "slug": shop.slug,
            "address": getattr(shop, "address", None),
            "city": getattr(shop, "city", None),
            "latitude": shop.latitude,
            "longitude": shop.longitude,
            "supports_bw": bool(shop.supports_bw),
            "supports_color": bool(shop.supports_color),
            "supports_photo": bool(shop.supports_photo),
            "is_open": bool(getattr(shop, "is_open", True)),
            "status_message": getattr(shop, "status_message", None),
            "back_at": getattr(shop, "back_at", None),
            "bw_rate": float(getattr(shop, "bw_rate", 3.0) or 3.0),
            "color_rate": float(getattr(shop, "color_rate", 10.0) or 10.0),
            "handling_charge": float(getattr(shop, "handling_charge", 5.0) or 5.0),
        },
    }

# =========================================================
# CALCULATE PRICE (preview for the customer)
# =========================================================

@app.post(
    "/api/calculate-price"
)
def calculate_price(
    request: PriceRequest
):

    try:

        quote = build_quote(
            print_type=request.print_type,
            pages=request.pages,
            page_range=request.page_range,
            copies=request.copies,
            photo_size=request.photo_size,
            photo_quantity=request.photo_quantity,
        )

        return {

            "success": True,

            "original_pages":
                request.pages,

            "selected_pages":
                quote["selected_pages"],

            "copies":
                request.copies,

            "total_printed_pages":
                quote["total_printed_pages"],

            "price":
                quote["price"],

            "currency":
                "INR",

            "estimated_minutes":
                quote["estimated_minutes"],
        }

    except ValueError as error:

        raise HTTPException(
            status_code=400,
            detail=str(error),
        )


# =========================================================
# FILE UPLOAD
# =========================================================

@app.post(
    "/api/upload"
)
async def upload_document(
    file: UploadFile = File(...)
):

    try:

        file_bytes = (
            await file.read()
        )

        if not file_bytes:

            raise ValueError(
                "Uploaded file is empty."
            )

        if len(file_bytes) > MAX_UPLOAD_BYTES:

            raise ValueError(
                "File is too large. Maximum size is 50 MB."
            )

        # Saving and counting pages is slow, so it runs in a
        # background thread and does not block other customers.
        result = await run_in_threadpool(
            save_uploaded_file,
            file_bytes=file_bytes,
            original_filename=file.filename or "unknown",
        )

        # Never tell the browser where the file lives on the server.
        result.pop("file_path", None)

        return {

            "success": True,

            "message":
                "File uploaded successfully",

            "file":
                result,
        }

    except ValueError as error:

        raise HTTPException(
            status_code=400,
            detail=str(error),
        )

    except Exception:

        logging.getLogger("uvicorn.error").exception(
            "Upload failed"
        )

        raise HTTPException(
            status_code=500,
            detail="Upload failed. Please try again.",
        )


# =========================================================
# DOCUMENT PREVIEW ENDPOINTS
# =========================================================

@app.get("/api/files/{stored_filename}/preview")
def get_document_preview(stored_filename: str, page: int = 1, dpi: int = 150):
    """
    Renders and streams a high-resolution PNG preview of an uploaded document page.
    """
    try:
        from .file_service import render_page_preview
        img_bytes, media_type = render_page_preview(
            stored_filename=stored_filename,
            page_number=page,
            dpi=dpi,
        )
        return Response(
            content=img_bytes,
            media_type=media_type,
            headers={"Cache-Control": "public, max-age=3600"},
        )
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error))
    except Exception as err:
        logging.getLogger("uvicorn.error").exception("Failed to render preview")
        raise HTTPException(status_code=500, detail="Could not generate preview")


@app.get("/api/files/{stored_filename}/view")
def view_document_raw(stored_filename: str):
    """
    Streams the raw PDF or image file for browser embedding or preview.
    """
    from fastapi.responses import FileResponse
    try:
        info = resolve_stored_file(stored_filename)
        path = Path(info["file_path"])
        media_type = "application/pdf" if info["file_type"] == "pdf" else "image/png"
        return FileResponse(path, media_type=media_type)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error))


# =========================================================
# CREATE PRINTSHOP ORDER
# =========================================================

@app.post(
    "/api/orders"
)
def create_order(
    order_data: OrderCreate,
    db: Session = Depends(get_db),
):

    # -----------------------------------------------------
    # Find the shop
    # -----------------------------------------------------

    import re
    from sqlalchemy import or_, func
    req_slug = (order_data.shop_slug or "").strip().lower()
    req_hyphen = re.sub(r"[^a-z0-9]+", "-", req_slug).strip("-")

    shop = (
        db.query(models.Shop)
        .filter(
            models.Shop.is_active.is_(True),
            or_(
                models.Shop.slug == req_slug,
                models.Shop.slug == req_hyphen,
                func.lower(models.Shop.name) == req_slug,
            ),
        )
        .first()
    )
    if not shop:
        shop = db.query(models.Shop).filter(models.Shop.is_active.is_(True)).order_by(models.Shop.id.asc()).first()

    if not shop:
        raise HTTPException(
            status_code=404,
            detail="Shop not found.",
        )

    # -----------------------------------------------------
    # Validate everything on the server
    # -----------------------------------------------------

    try:

        validate_print_options(
            order_data,
            shop,
        )

        upload = resolve_stored_file(
            order_data.stored_filename
        )

        quote = build_quote(
            print_type=order_data.print_type,
            pages=upload["pages"],
            page_range=order_data.page_range,
            copies=order_data.copies,
        )

    except ValueError as error:

        raise HTTPException(
            status_code=400,
            detail=str(error),
        )

    # -----------------------------------------------------
    # Save the order
    # -----------------------------------------------------

    try:

        order = models.Order(

            # Shop and pickup
            shop_id=
                shop.id,

            pickup_code=
                generate_pickup_code(),

            # Temporary number, replaced below
            order_number=
                f"TMP-{uuid4().hex[:20]}",

            # Customer
            customer_name=
                order_data.customer_name.strip(),

            customer_phone=
                order_data.customer_phone.strip(),

            customer_email=
                order_data.customer_email,

            # Document (from the server, not the browser)
            original_filename=
                order_data.original_filename,

            stored_filename=
                upload["stored_filename"],

            file_path=
                upload["file_path"],

            file_type=
                upload["file_type"],

            original_pages=
                upload["pages"],

            selected_pages=
                quote["selected_pages"],

            page_range=
                order_data.page_range,

            # Copies
            copies=
                order_data.copies,

            total_printed_pages=
                quote["total_printed_pages"],

            collate=(
                "yes"
                if order_data.collate
                else "no"
            ),

            # Printing
            print_type=
                order_data.print_type,

            paper_size=
                order_data.paper_size,

            orientation=
                order_data.orientation,

            duplex=
                order_data.duplex,

            pages_per_sheet=
                order_data.pages_per_sheet,

            scale_mode=
                order_data.scale_mode,

            quality=
                order_data.quality,

            # Price (calculated by the server)
            price=
                quote["price"],

            currency=
                "INR",

            # Initial status
            payment_status=
                "PENDING",

            order_status=
                "CREATED",
        )

        db.add(order)

        # Get the database id without finishing the transaction,
        # then build the real order number from it. This cannot
        # produce the same number twice.
        db.flush()

        order.order_number = (
            f"PS-{10000 + order.id}"
        )

        db.commit()

        db.refresh(order)

        return {

            "success": True,

            "message":
                "Order created successfully",

            "order": {

                "id":
                    order.id,

                "order_number":
                    order.order_number,

                "pickup_code":
                    order.pickup_code,

                "shop_name":
                    shop.name,

                "price":
                    order.price,

                "currency":
                    order.currency,

                "payment_status":
                    order.payment_status,

                "order_status":
                    order.order_status,

                "created_at":
                    order.created_at,
            },
        }

    except Exception as error:

        db.rollback()

        raise HTTPException(
            status_code=500,
            detail=(
                "Order creation failed: "
                f"{error}"
            ),
        )


# =========================================================
# GET ORDER
# Needs the order number AND the pickup code.
# No name, phone, email, file path or payment ids are returned.
# =========================================================

@app.get(
    "/api/orders/{order_number}"
)
def get_order(
    order_number: str,
    pickup_code: str,
    db: Session = Depends(get_db),
):

    order = (
        db.query(models.Order)
        .filter(
            models.Order.order_number
            == order_number
        )
        .first()
    )

    # Same answer for "no such order" and "wrong code", so
    # nobody can discover which order numbers exist.
    if not order or not codes_match(
        order.pickup_code,
        pickup_code,
    ):

        raise HTTPException(
            status_code=404,
            detail="Order not found.",
        )

    shop = db.get(
        models.Shop,
        order.shop_id,
    )

    shop_name = shop.name if shop else None

    return {

        "success": True,

        "order": {

            "order_number":
                order.order_number,

            "original_filename":
                order.original_filename,

            "original_pages":
                order.original_pages,

            "selected_pages":
                order.selected_pages,

            "page_range":
                order.page_range,

            "copies":
                order.copies,

            "total_printed_pages":
                order.total_printed_pages,

            "collate":
                order.collate,

            "print_type":
                order.print_type,

            "paper_size":
                order.paper_size,

            "orientation":
                order.orientation,

            "duplex":
                order.duplex,

            "pages_per_sheet":
                order.pages_per_sheet,

            "scale_mode":
                order.scale_mode,

            "quality":
                order.quality,

            "price":
                order.price,

            "currency":
                order.currency,

            "payment_status":
                order.payment_status,

            "order_status":
                order.order_status,

            "created_at":
                order.created_at,

            "updated_at":
                order.updated_at,

            # Queue position and waiting time
            **estimate_wait(db, order),

            # The shop's name (not who the customer is)
            "shop_name":
                shop_name,

            # Customer feedback
            "rating":
                order.rating,

            # Messages sent to the customer
            "messages":
                messages_for_order(db, order),
        },
    }


# =========================================================
# FEEDBACK (customer, after collecting)
# =========================================================

class FeedbackRequest(BaseModel):

    rating: int = Field(ge=1, le=5)

    comment: str | None = Field(
        default=None,
        max_length=500,
    )


@app.post(
    "/api/orders/{order_number}/feedback"
)
def submit_feedback(
    order_number: str,
    pickup_code: str,
    data: FeedbackRequest,
    db: Session = Depends(get_db),
):

    order = (
        db.query(models.Order)
        .filter(
            models.Order.order_number
            == order_number
        )
        .first()
    )

    if not order or not codes_match(
        order.pickup_code,
        pickup_code,
    ):

        raise HTTPException(
            status_code=404,
            detail="Order not found.",
        )

    if order.order_status != "COLLECTED":

        raise HTTPException(
            status_code=400,
            detail="You can give feedback after collecting your order.",
        )

    if order.rating is not None:

        raise HTTPException(
            status_code=400,
            detail="Feedback was already sent. Thank you!",
        )

    order.rating = data.rating

    order.feedback = (
        data.comment.strip() if data.comment else None
    )

    db.commit()

    return {
        "success": True,
        "message": "Thank you for your feedback!",
    }


# =========================================================
# CREATE RAZORPAY ORDER
# =========================================================

@app.post(
    "/api/payments/create"
)
def create_razorpay_order(
    order_number: str,
    pickup_code: str,
    db: Session = Depends(get_db),
):

    # -----------------------------------------------------
    # Find PrintShop order (needs the pickup code too)
    # -----------------------------------------------------

    order = (
        db.query(models.Order)
        .filter(
            models.Order.order_number
            == order_number
        )
        .first()
    )

    if not order or not codes_match(
        order.pickup_code,
        pickup_code,
    ):

        raise HTTPException(
            status_code=404,
            detail=
                "PrintShop order not found.",
        )

    # -----------------------------------------------------
    # Already paid
    # -----------------------------------------------------

    if order.payment_status == "PAID":

        raise HTTPException(
            status_code=400,
            detail=
                "Order is already paid.",
        )

    # -----------------------------------------------------
    # Check credentials
    # -----------------------------------------------------

    if not settings.razorpay_key_id:

        raise HTTPException(
            status_code=500,
            detail=
                "Razorpay Key ID is not configured.",
        )

    if not settings.razorpay_key_secret:

        raise HTTPException(
            status_code=500,
            detail=
                "Razorpay Key Secret is not configured.",
        )

    try:

        # INR -> paise
        amount_paise = int(
            round(
                order.price * 100
            )
        )

        if amount_paise <= 0:

            raise ValueError(
                "Order amount must be greater than zero."
            )

        razorpay_order = (
            razorpay_client.order.create(
                data={
                    "amount":
                        amount_paise,

                    "currency":
                        "INR",

                    "receipt":
                        order.order_number,

                    "notes": {
                        "printshop_order":
                            order.order_number
                    },
                }
            )
        )

        order.razorpay_order_id = (
            razorpay_order["id"]
        )

        db.commit()

        db.refresh(order)

        return {

            "success": True,

            "order_number":
                order.order_number,

            "razorpay_order_id":
                razorpay_order["id"],

            "amount":
                amount_paise,

            "currency":
                "INR",

            "key_id":
                settings.razorpay_key_id,
        }

    except ValueError as error:

        db.rollback()

        raise HTTPException(
            status_code=400,
            detail=str(error),
        )

    except Exception as error:

        db.rollback()

        raise HTTPException(
            status_code=500,
            detail=(
                "Razorpay order creation failed: "
                f"{error}"
            ),
        )


# =========================================================
# VERIFY RAZORPAY PAYMENT
# (the Razorpay signature proves the payment is real)
# =========================================================

@app.post(
    "/api/payments/verify"
)
def verify_razorpay_payment(
    payment_data: PaymentVerifyRequest,
    db: Session = Depends(get_db),
):

    order = (
        db.query(models.Order)
        .filter(
            models.Order.order_number
            == payment_data.order_number
        )
        .first()
    )

    if not order:

        raise HTTPException(
            status_code=404,
            detail=
                "PrintShop order not found.",
        )

    if not order.razorpay_order_id:

        raise HTTPException(
            status_code=400,
            detail=
                "Razorpay order has not been created.",
        )

    if (
        order.razorpay_order_id
        != payment_data.razorpay_order_id
    ):

        raise HTTPException(
            status_code=400,
            detail=
                "Razorpay order ID mismatch.",
        )

    if order.payment_status == "PAID":

        return {

            "success": True,

            "message":
                "Payment already verified.",

            "order_number":
                order.order_number,

            "payment_status":
                order.payment_status,

            "order_status":
                order.order_status,
        }

    message = (
        f"{order.razorpay_order_id}"
        f"|{payment_data.razorpay_payment_id}"
    )

    expected_signature = hmac.new(

        settings
        .razorpay_key_secret
        .encode("utf-8"),

        message.encode("utf-8"),

        digestmod="sha256",
    ).hexdigest()

    if not hmac.compare_digest(
        expected_signature,
        payment_data.razorpay_signature,
    ):

        raise HTTPException(
            status_code=400,
            detail=
                "Payment signature verification failed.",
        )

    order.razorpay_payment_id = (
        payment_data.razorpay_payment_id
    )

    order.razorpay_signature = (
        payment_data.razorpay_signature
    )

    order.payment_status = "PAID"

    # The order now joins the print queue.
    order.order_status = "QUEUED"

    db.commit()

    db.refresh(order)

    # A failed email must never make a successful payment look failed.
    try:

        notify(db, order, "QUEUED")

    except Exception:

        logging.getLogger("uvicorn.error").exception(
            "notify failed"
        )

    return {

        "success": True,

        "message":
            "Payment verified successfully.",

        "order_number":
            order.order_number,

        "payment_status":
            order.payment_status,

        "order_status":
            order.order_status,
    }

# reload trigger
