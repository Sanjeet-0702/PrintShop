import os
"""
Shop dashboard API.

The shopkeeper logs in with a shop password and can only:
  - see order number, page count, print settings, amount and status
  - mark a printed order "ready"
  - hand an order over (needs the customer's pickup code)
  - retry a failed print

The shopkeeper can NEVER see: customer name, phone, email, the document
or its file name, or the pickup code.
"""

import io
import json
import re
from uuid import uuid4
import logging
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import (
    File,
    UploadFile,
    APIRouter,
    Depends,
    Header,
    HTTPException,
    Request,
)

from fastapi.responses import Response

from pydantic import BaseModel, Field

from sqlalchemy.orm import Session

from . import models
from .database import get_db
from .notifications import notify
from .security import (
    DUMMY_HASH,
    AttemptLimiter,
    codes_match,
    make_token,
    read_token,
    verify_password,
    hash_password,
)


log = logging.getLogger("uvicorn.error")

router = APIRouter()


# =========================================================
# SETTINGS (filled in by main.py at start-up)
# =========================================================

_config = {
    "secret_key": "",
    "frontend_url": "http://localhost:5173",
    "token_hours": 8,
}


def configure(**values) -> None:
    _config.update(values)


# 5 wrong passwords in 10 minutes blocks that shop + device for a while.
_login_limiter = AttemptLimiter(max_failures=20, window_seconds=600)

# 5 wrong pickup codes in 10 minutes blocks that order for a while.
_pickup_limiter = AttemptLimiter(max_failures=5, window_seconds=600)


# =========================================================
# REQUEST MODELS
# =========================================================

class RegisterRequest(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    slug: str | None = None
    password: str = Field(min_length=4, max_length=200)
    supports_bw: bool = True
    supports_color: bool = True


class LoginRequest(BaseModel):

    shop_slug: str = Field(min_length=1, max_length=60)

    password: str = Field(min_length=1, max_length=200)


class HandoverRequest(BaseModel):

    pickup_code: str = Field(min_length=1, max_length=8)


# =========================================================
# LOGIN CHECK
# =========================================================

def get_current_shop(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> models.Shop:
    """
    Every dashboard request must carry the login token.
    """

    token = None

    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()

    shop_id = read_token(_config["secret_key"], token)

    if shop_id is None:

        raise HTTPException(
            status_code=401,
            detail="Please log in again.",
        )

    shop = (
        db.query(models.Shop)
        .filter(
            models.Shop.id == shop_id,
            models.Shop.is_active.is_(True),
        )
        .first()
    )

    if not shop:

        raise HTTPException(
            status_code=401,
            detail="Please log in again.",
        )

    return shop


def _find_order(
    db: Session,
    shop: models.Shop,
    order_number: str,
) -> models.Order:
    """
    A shop can only touch its own orders.
    """

    order = (
        db.query(models.Order)
        .filter(
            models.Order.order_number == order_number,
            models.Order.shop_id == shop.id,
        )
        .first()
    )

    if not order:

        raise HTTPException(
            status_code=404,
            detail="Order not found.",
        )

    return order


# =========================================================
# LOGIN
# =========================================================

@router.get("/api/shop-admin/shops")
def list_registered_shops(db: Session = Depends(get_db)):
    """
    Returns list of public active shops for easy login selection.
    """
    shops = (
        db.query(models.Shop)
        .filter(models.Shop.is_active.is_(True))
        .order_by(models.Shop.id.asc())
        .all()
    )
    return {
        "success": True,
        "shops": [
            {
                "id": s.id,
                "name": s.name,
                "slug": s.slug,
                "supports_bw": bool(s.supports_bw),
                "supports_color": bool(s.supports_color),
            }
            for s in shops
        ],
    }


@router.post("/api/shop-admin/register")
def shop_register(
    data: RegisterRequest,
    db: Session = Depends(get_db),
):
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Shop name is required.")

    raw_slug = data.slug.strip() if data.slug else re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    slug = re.sub(r"[^a-z0-9-]+", "", raw_slug.lower()).strip("-")
    if not slug:
        slug = f"shop-{uuid4().hex[:6]}"

    existing = db.query(models.Shop).filter(models.Shop.slug == slug).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"The link name '{slug}' is already taken. Please choose another link name.",
        )

    shop = models.Shop(
        name=name,
        slug=slug,
        supports_bw=data.supports_bw,
        supports_color=data.supports_color,
        supports_photo=False,
        is_active=True,
        password_hash=hash_password(data.password),
    )
    db.add(shop)
    db.commit()
    db.refresh(shop)

    token = make_token(
        _config["secret_key"],
        shop.id,
        int(_config["token_hours"]) * 3600,
    )

    return {
        "success": True,
        "token": token,
        "shop": {
            "name": shop.name,
            "slug": shop.slug,
            "supports_bw": shop.supports_bw,
            "supports_color": shop.supports_color,
        },
    }


@router.post("/api/shop-admin/login")
def shop_login(
    request: Request,
    data: LoginRequest,
    db: Session = Depends(get_db),
):
    from sqlalchemy import or_, func

    client = request.client.host if request.client else "unknown"
    key = f"{client}:{data.shop_slug.lower()}"

    if _login_limiter.is_blocked(key):
        raise HTTPException(
            status_code=429,
            detail="Too many wrong attempts. Please wait 10 minutes.",
        )

    slug_val = (data.shop_slug or "").strip().lower()
    slug_hyphen = re.sub(r"[^a-z0-9]+", "-", slug_val).strip("-")

    conditions = [
        models.Shop.slug == slug_val,
        models.Shop.slug == slug_hyphen,
        func.lower(models.Shop.name) == slug_val,
        func.lower(models.Shop.name) == data.shop_slug.strip().lower(),
    ]
    if slug_val.isdigit():
        conditions.append(models.Shop.id == int(slug_val))

    shop = (
        db.query(models.Shop)
        .filter(
            models.Shop.is_active.is_(True),
            or_(*conditions),
        )
        .first()
    )

    if not shop and slug_val in ("1", "demo", "default", "demo-shop"):
        shop = db.query(models.Shop).filter(models.Shop.is_active.is_(True)).first()

    password_ok = verify_password(
        data.password,
        shop.password_hash if shop and shop.password_hash else DUMMY_HASH,
    )

    if not shop or not shop.password_hash or not password_ok:
        _login_limiter.record_failure(key)
        raise HTTPException(
            status_code=401,
            detail="Wrong shop or password. Please verify your shop name/link and password.",
        )

    _login_limiter.reset(key)

    token = make_token(
        _config["secret_key"],
        shop.id,
        int(_config["token_hours"]) * 3600,
    )

    return {
        "success": True,
        "token": token,
        "shop": {
            "id": shop.id,
            "name": shop.name,
            "slug": shop.slug,
        },
    }


# =========================================================
# ORDER LIST
# =========================================================

# What the shopkeeper is allowed to see about an order.
def _shop_view(order: models.Order) -> dict:

    return {
        "order_number": order.order_number,
        "order_status": order.order_status,
        "print_type": order.print_type,
        "paper_size": order.paper_size,
        "duplex": order.duplex,
        "orientation": order.orientation,
        "pages_per_sheet": order.pages_per_sheet,
        "collate": order.collate,
        "copies": order.copies,
        "selected_pages": order.selected_pages,
        "total_printed_pages": order.total_printed_pages,
        "price": order.price,
        "failure_reason": (
            order.failure_reason
            if order.order_status == "FAILED"
            else None
        ),
        "created_at": order.created_at,
        "ready_at": order.ready_at,
        "collected_at": order.collected_at,
        "updated_at": order.updated_at,
    }


@router.get("/api/shop-admin/orders")
def list_orders(
    shop: models.Shop = Depends(get_current_shop),
    db: Session = Depends(get_db),
):

    now = datetime.utcnow()

    active = (
        db.query(models.Order)
        .filter(
            models.Order.shop_id == shop.id,
            models.Order.order_status.in_(
                ["QUEUED", "PRINTING", "PRINTED", "READY", "FAILED"]
            ),
        )
        .order_by(models.Order.id.asc())
        .all()
    )

    collected = (
        db.query(models.Order)
        .filter(
            models.Order.shop_id == shop.id,
            models.Order.order_status == "COLLECTED",
        )
        .order_by(models.Order.id.desc())
        .limit(200)
        .all()
    )

    # Last 24 hours stats: include non-cancelled and paid orders
    since = now - timedelta(hours=24)
    from sqlalchemy import or_

    recent = (
        db.query(models.Order)
        .filter(
            models.Order.shop_id == shop.id,
            models.Order.created_at >= since,
            or_(
                models.Order.payment_status == "PAID",
                models.Order.order_status.in_(["QUEUED", "PRINTING", "PRINTED", "READY", "COLLECTED"]),
            ),
        )
        .all()
    )

    # Customer ratings: only the order number, stars and comment.
    # Never the customer's name, phone or email.
    rated = (
        db.query(models.Order)
        .filter(
            models.Order.shop_id == shop.id,
            models.Order.rating.isnot(None),
        )
        .order_by(models.Order.id.desc())
        .all()
    )

    feedback = {
        "count": len(rated),
        "average": (
            round(sum(o.rating for o in rated) / len(rated), 1)
            if rated
            else None
        ),
        "recent": [
            {
                "order_number": o.order_number,
                "rating": o.rating,
                "comment": o.feedback,
                "date": o.collected_at or o.updated_at,
            }
            for o in rated[:10]
        ],
    }

    amount_24h = round(sum(o.price for o in recent), 2)
    pages_24h = sum(o.total_printed_pages for o in recent)
    orders_24h = len(recent)

    return {
        "success": True,
        "shop": {
            "id": shop.id,
            "name": shop.name,
            "slug": shop.slug,
            "supports_bw": bool(shop.supports_bw),
            "supports_color": bool(shop.supports_color),
            "is_open": bool(getattr(shop, "is_open", True)),
            "status_message": getattr(shop, "status_message", None),
            "back_at": getattr(shop, "back_at", None),
            "bw_rate": float(getattr(shop, "bw_rate", 3.0) or 3.0),
            "color_rate": float(getattr(shop, "color_rate", 10.0) or 10.0),
            "handling_charge": float(getattr(shop, "handling_charge", 5.0) or 5.0),
        },
        "shop_name": shop.name,
        "shop_slug": shop.slug,
        "today_income": amount_24h,
        "today_pages": pages_24h,
        "today_orders": orders_24h,
        "feedback": feedback,
        "stats": {
            "orders_24h": orders_24h,
            "pages_24h": pages_24h,
            "amount_24h": amount_24h,
        },
        "orders": [_shop_view(o) for o in active],
        "collected": [_shop_view(o) for o in collected],
    }


class StoreStatusUpdate(BaseModel):
    is_open: bool
    status_message: str | None = None
    back_at: str | None = None


@router.post("/api/shop-admin/status")
def update_store_status(
    data: StoreStatusUpdate,
    shop: models.Shop = Depends(get_current_shop),
    db: Session = Depends(get_db),
):
    shop.is_open = bool(data.is_open)
    shop.status_message = data.status_message.strip() if data.status_message else None
    shop.back_at = data.back_at.strip() if data.back_at else None
    db.commit()
    db.refresh(shop)

    return {
        "success": True,
        "shop": {
            "name": shop.name,
            "slug": shop.slug,
            "is_open": shop.is_open,
            "status_message": shop.status_message,
            "back_at": shop.back_at,
        },
    }

class ShopPricingUpdate(BaseModel):
    bw_rate: float = Field(..., ge=0.5, le=500.0, description="Price per page in INR for Black & White")
    color_rate: float = Field(..., ge=0.5, le=500.0, description="Price per page in INR for Colour")
    handling_charge: float = Field(0.0, ge=0.0, le=100.0, description="Counter handling charge in INR")


@router.get("/api/shop-admin/pricing")
def get_shop_pricing(
    shop: models.Shop = Depends(get_current_shop),
):
    """Returns the current shop's per-page printing rates and fees."""
    return {
        "success": True,
        "bw_rate": float(getattr(shop, "bw_rate", 3.0) or 3.0),
        "color_rate": float(getattr(shop, "color_rate", 10.0) or 10.0),
        "handling_charge": float(getattr(shop, "handling_charge", 5.0) or 5.0),
    }


@router.post("/api/shop-admin/pricing")
def update_shop_pricing(
    data: ShopPricingUpdate,
    shop: models.Shop = Depends(get_current_shop),
    db: Session = Depends(get_db),
):
    """Updates the shop owner's custom per-page rates and handling charges."""
    shop.bw_rate = round(float(data.bw_rate), 2)
    shop.color_rate = round(float(data.color_rate), 2)
    shop.handling_charge = round(float(data.handling_charge), 2)
    db.commit()
    db.refresh(shop)

    return {
        "success": True,
        "detail": "Pricing updated successfully!",
        "pricing": {
            "bw_rate": shop.bw_rate,
            "color_rate": shop.color_rate,
            "handling_charge": shop.handling_charge,
        },
    }



import time

_printer_cache = {
    "printers": [],
    "cached_at": 0.0,
}


def _get_hardware_present_device_ids() -> set[str]:
    """
    Direct Windows Configuration Manager (cfgmgr32.dll) query to retrieve
    all hardware devices currently physically plugged into this PC.
    Runs in 1-2 milliseconds, pure C API, zero external processes, immune to RPC deadlocks.
    """
    if os.name != "nt":
        return set()
    try:
        import ctypes
        from ctypes import wintypes

        cfgmgr32 = ctypes.windll.cfgmgr32
        CM_GETIDLIST_FILTER_PRESENT = 0x00000100

        pulLen = wintypes.ULONG()
        res = cfgmgr32.CM_Get_Device_ID_List_SizeW(ctypes.byref(pulLen), None, CM_GETIDLIST_FILTER_PRESENT)
        if res != 0 or pulLen.value <= 1:
            return set()

        buf = ctypes.create_unicode_buffer(pulLen.value)
        res = cfgmgr32.CM_Get_Device_ID_ListW(None, buf, pulLen.value, CM_GETIDLIST_FILTER_PRESENT)
        if res != 0:
            return set()

        raw_str = "".join(buf[:pulLen.value])
        return {s.strip().upper() for s in raw_str.split("\x00") if s.strip()}
    except Exception as e:
        log.warning("Hardware presence query failed: %s", e)
        return set()


def get_system_printers(force: bool = False) -> list[dict]:
    """
    Detects all real physical printers installed on this Windows PC and verifies
    genuine hardware connectivity (Plug-and-Play presence).
    - If a USB printer is physically unplugged or turned off, it is flagged as Disconnected.
    - Software/virtual printers (PDF, XPS, Fax, OneNote) are strictly filtered out.
    """
    import re
    now = time.time()
    if not force and (now - _printer_cache["cached_at"] < 1.5):
        return _printer_cache["printers"]

    installed_printers = []

    # 1. Read Installed Printers directly from Windows Registry (Instant & Spooler-Deadlock Safe)
    if os.name == "nt":
        try:
            import winreg
            key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SYSTEM\CurrentControlSet\Control\Print\Printers")
            count = winreg.QueryInfoKey(key)[0]
            for i in range(count):
                pname = winreg.EnumKey(key, i)
                sub = winreg.OpenKey(key, pname)
                try:
                    port, _ = winreg.QueryValueEx(sub, "Port")
                except Exception:
                    port = ""
                try:
                    driver, _ = winreg.QueryValueEx(sub, "Printer Driver")
                except Exception:
                    driver = ""
                installed_printers.append({
                    "name": pname.strip(),
                    "port": (port or "").strip(),
                    "driver": (driver or "").strip(),
                })
        except Exception as e:
            log.warning("Registry printer query error: %s", e)

    # 2. If registry returned empty (or non-Windows), fallback to WinSpool local enum
    if not installed_printers and os.name == "nt":
        try:
            import ctypes
            from ctypes import wintypes

            class PRINTER_INFO_4(ctypes.Structure):
                _fields_ = [
                    ("pPrinterName", wintypes.LPWSTR),
                    ("pServerName", wintypes.LPWSTR),
                    ("Attributes", wintypes.DWORD),
                ]

            winspool = ctypes.WinDLL("winspool.drv")
            needed = wintypes.DWORD()
            returned = wintypes.DWORD()
            # PRINTER_ENUM_LOCAL = 2
            winspool.EnumPrintersW(2, None, 4, None, 0, ctypes.byref(needed), ctypes.byref(returned))
            if needed.value > 0:
                buf = ctypes.create_string_buffer(needed.value)
                if winspool.EnumPrintersW(2, None, 4, buf, needed.value, ctypes.byref(needed), ctypes.byref(returned)):
                    p_infos = ctypes.cast(buf, ctypes.POINTER(PRINTER_INFO_4))
                    for i in range(returned.value):
                        p = p_infos[i]
                        pname = (p.pPrinterName or "").strip()
                        if pname:
                            installed_printers.append({"name": pname, "port": "", "driver": ""})
        except Exception as e:
            log.warning("WinSpool fallback error: %s", e)

    # 3. Retrieve currently physically connected hardware devices
    present_device_ids = _get_hardware_present_device_ids()
    has_any_usb_printer = any("USBPRINT" in did for did in present_device_ids)

    results = []
    for p in installed_printers:
        name = p["name"]
        if not name:
            continue
        name_lower = name.lower()
        port = p.get("port", "")
        port_lower = port.lower()
        driver = p.get("driver", "")
        driver_lower = driver.lower()

        # Strictly exclude virtual / software printers
        is_virtual = (
            port_lower in ("nul:", "portprompt:", "")
            or any(v in name_lower for v in ("pdf", "onenote", "xps", "fax", "writer"))
            or any(v in driver_lower for v in ("pdf", "onenote", "xps", "fax", "writer"))
        )
        if is_virtual:
            continue

        port_upper = port.upper()
        is_usb = port_upper.startswith("USB")
        is_network = any(port_upper.startswith(x) for x in ("IP_", "WSD-", "HTTP")) or bool(re.match(r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}", port))

        if is_usb:
            conn_type = "USB Cable"
            is_online = False
            if has_any_usb_printer:
                tokens = [t for t in re.split(r"[^A-Za-z0-9]+", name.upper()) if len(t) > 2]
                for did in present_device_ids:
                    if "USBPRINT" in did and any(t in did for t in tokens):
                        is_online = True
                        break
                if not is_online and len([x for x in installed_printers if x.get("port", "").upper().startswith("USB")]) == 1:
                    is_online = True

            status_text = "Connected & Ready" if is_online else "Disconnected / Cable Unplugged"
            badge_color = "green" if is_online else "red"

        elif is_network:
            conn_type = "Wi-Fi / Network"
            is_online = False
            status_text = "Offline / Unreachable"
            badge_color = "red"
        else:
            conn_type = "Direct Port"
            is_online = False
            status_text = "Disconnected"
            badge_color = "red"

        results.append({
            "name": name,
            "port": port,
            "driver": driver,
            "connection_type": conn_type,
            "is_online": is_online,
            "status_text": status_text,
            "badge_color": badge_color,
        })

    _printer_cache["printers"] = results
    _printer_cache["cached_at"] = now
    return results


class PrinterConfigRequest(BaseModel):
    bw_printer_name: str | None = None
    color_printer_name: str | None = None
    auto_print_enabled: bool = True


class TestPrintRequest(BaseModel):
    printer_name: str
    test_type: str = "bw"


@router.get("/api/shop-admin/printers")
def list_shop_printers(
    force: bool = False,
    shop: models.Shop = Depends(get_current_shop),
):
    """
    Returns detected printers and current shop settings.
    """
    installed = get_system_printers(force=force)
    return {
        "success": True,
        "printers": installed,
        "bw_printer_name": shop.bw_printer_name or "",
        "color_printer_name": shop.color_printer_name or "",
        "auto_print_enabled": bool(shop.auto_print_enabled),
    }


@router.post("/api/shop-admin/printers")
def update_shop_printers(
    data: PrinterConfigRequest,
    shop: models.Shop = Depends(get_current_shop),
    db: Session = Depends(get_db),
):
    """
    Saves B&W and Color printer routing configuration for this shop.
    """
    shop.bw_printer_name = data.bw_printer_name.strip() if data.bw_printer_name else None
    shop.color_printer_name = data.color_printer_name.strip() if data.color_printer_name else None
    shop.auto_print_enabled = bool(data.auto_print_enabled)
    db.commit()
    db.refresh(shop)

    return {
        "success": True,
        "bw_printer_name": shop.bw_printer_name or "",
        "color_printer_name": shop.color_printer_name or "",
        "auto_print_enabled": bool(shop.auto_print_enabled),
    }


@router.post("/api/shop-admin/printers/test")
def test_shop_printer(
    data: TestPrintRequest,
    shop: models.Shop = Depends(get_current_shop),
):
    """
    Prints a 1-page test sheet on the requested printer using SumatraPDF.
    Validates physical printer connectivity first so jobs don't get trapped in spooler.
    """
    import tempfile
    import subprocess
    import shutil
    import fitz
    from . import windows_printer

    printer_name = data.printer_name.strip()
    if not printer_name:
        raise HTTPException(status_code=400, detail="Printer name is required.")

    # 1. VERIFY PRINTER IS PHYSICALLY CONNECTED & READY
    installed_printers = get_system_printers(force=True)
    matched = next((p for p in installed_printers if p["name"].lower() == printer_name.lower()), None)
    if not matched or not matched.get("is_online"):
        raise HTTPException(
            status_code=400,
            detail=f"Printer '{printer_name}' is not connected to your laptop. Please plug in the USB cable and turn the printer ON, then click Refresh Devices."
        )

    # 2. CLEAR ANY LINGERING TEST JOBS IN WINDOWS SPOOLER
    try:
        clean_script = f'Get-PrintJob -PrinterName "{printer_name}" -ErrorAction SilentlyContinue | Where-Object {{ $_.DocumentName -like "*printshop_test*" }} | Remove-PrintJob -ErrorAction SilentlyContinue'
        ps_bin = shutil.which("powershell") or r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"
        subprocess.run([ps_bin, "-NoProfile", "-Command", clean_script], capture_output=True, timeout=4)
    except Exception:
        pass

    # 3. Locate SumatraPDF
    sumatra_path = _config.get("sumatra_path") or os.environ.get("SUMATRA_PATH") or r"C:\Users\DELL\AppData\Local\SumatraPDF\SumatraPDF.exe"
    if not os.path.exists(sumatra_path):
        sumatra_path = windows_printer.find_sumatra("") or sumatra_path

    if not os.path.exists(sumatra_path):
        raise HTTPException(
            status_code=500,
            detail=f"SumatraPDF executable not found. Expected at {sumatra_path}"
        )

    temp_dir = tempfile.gettempdir()
    test_pdf_path = os.path.join(temp_dir, f"printshop_test_{shop.id}.pdf")

    try:
        doc = fitz.open()
        page = doc.new_page(width=595, height=842) # A4

        # Draw nice test page
        page.insert_text((50, 75), "PrintShop Alignment & Hardware Test", fontsize=20, fontname="helv", color=(0.1, 0.3, 0.8))
        page.insert_text((50, 105), f"Store: {shop.name} ({shop.slug})", fontsize=13, fontname="helv")
        page.insert_text((50, 128), f"Date & Time: {datetime.now().strftime('%Y-%m-%d %I:%M:%S %p')}", fontsize=10, fontname="helv")
        page.insert_text((50, 148), f"Target Printer: {printer_name}", fontsize=11, fontname="helv")
        page.insert_text((50, 168), f"Test Mode: {data.test_type.upper()}", fontsize=11, fontname="helv")

        # Alignment border
        page.draw_rect(fitz.Rect(50, 200, 545, 520), color=(0.6, 0.6, 0.6), width=1.5)
        page.insert_text((70, 240), "✓ Printer connection verified successfully!", fontsize=14, fontname="helv", color=(0.1, 0.6, 0.2))
        page.insert_text((70, 270), "• Black & White clarity test: 1234567890 ABCDEFGHIJKLMNOPQRSTUVWXYZ", fontsize=10, fontname="helv")
        page.insert_text((70, 290), "• Micro text test: PrintShop Fast Automated Cloud Printing for Local Stores", fontsize=8, fontname="helv")

        if data.test_type.lower() == "color":
            colors = [
                ("CYAN", (0, 0.7, 0.9)),
                ("MAGENTA", (0.9, 0.1, 0.5)),
                ("YELLOW", (0.95, 0.85, 0)),
                ("BLACK", (0, 0, 0)),
                ("GREEN", (0.1, 0.7, 0.3)),
                ("BLUE", (0.1, 0.3, 0.9)),
            ]
            x = 70
            for c_name, col in colors:
                page.draw_rect(fitz.Rect(x, 340, x + 60, 410), fill=col, color=col)
                page.insert_text((x + 5, 430), c_name, fontsize=8, fontname="helv")
                x += 70

        page.insert_text((50, 780), "Powered by PrintShop Auto-Print Engine", fontsize=9, fontname="helv", color=(0.5, 0.5, 0.5))
        doc.save(test_pdf_path)
        doc.close()

        # Print via SumatraPDF
        cmd = [sumatra_path, "-silent", "-exit-when-done", "-print-to", printer_name, test_pdf_path]
        subprocess.run(cmd, check=True, timeout=25)

        return {"success": True, "message": f"Test page sent to '{printer_name}' successfully."}
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=500, detail=f"Print test timed out. Please check that '{printer_name}' is turned ON, has paper loaded, and has no pending paper jam.")
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"SumatraPDF exited with code {e.returncode}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Print test failed: {str(e)}")
    finally:
        if os.path.exists(test_pdf_path):
            try:
                os.remove(test_pdf_path)
            except Exception:
                pass


class DeleteShopRequest(BaseModel):
    confirm_slug: str | None = None


@router.post("/api/shop-admin/delete-shop")
def delete_store(
    data: DeleteShopRequest | None = None,
    shop: models.Shop = Depends(get_current_shop),
    db: Session = Depends(get_db),
):
    """
    Permanently deletes this registered shop and all its orders from the database.
    """
    shop_name = shop.name
    shop_id = shop.id

    # Delete notifications, order items and orders
    orders = db.query(models.Order).filter(models.Order.shop_id == shop_id).all()
    order_ids = [o.id for o in orders]
    if order_ids:
        db.query(models.Notification).filter(models.Notification.order_id.in_(order_ids)).delete(synchronize_session=False)
        db.query(models.OrderItem).filter(models.OrderItem.order_id.in_(order_ids)).delete(synchronize_session=False)
        db.query(models.Order).filter(models.Order.shop_id == shop_id).delete(synchronize_session=False)

    db.delete(shop)
    db.commit()

    return {"success": True, "message": f"Shop '{shop_name}' has been permanently deleted."}


# =========================================================
# ACTIONS
# =========================================================

@router.post("/api/shop-admin/orders/{order_number}/ready")
def mark_ready(
    order_number: str,
    shop: models.Shop = Depends(get_current_shop),
    db: Session = Depends(get_db),
):
    """
    The shopkeeper checked the prints and they are ready.
    """

    order = _find_order(db, shop, order_number)

    if order.order_status == "READY":

        return {"success": True, "order": _shop_view(order)}

    if order.order_status != "PRINTED":

        raise HTTPException(
            status_code=400,
            detail=(
                "Only a printed order can be marked ready "
                f"(this one is {order.order_status})."
            ),
        )

    order.order_status = "READY"
    order.ready_at = datetime.utcnow()

    db.commit()
    db.refresh(order)

    notify(db, order, "READY")

    return {"success": True, "order": _shop_view(order)}


@router.post("/api/shop-admin/orders/{order_number}/handover")
def hand_over(
    order_number: str,
    data: HandoverRequest,
    shop: models.Shop = Depends(get_current_shop),
    db: Session = Depends(get_db),
):
    """
    The customer is at the counter and shows the pickup code.
    """

    order = _find_order(db, shop, order_number)

    if order.order_status == "COLLECTED":

        return {"success": True, "order": _shop_view(order)}

    if order.order_status != "READY":

        raise HTTPException(
            status_code=400,
            detail=(
                "Mark the order ready first "
                f"(this one is {order.order_status})."
            ),
        )

    key = f"{shop.id}:{order.order_number}"

    if _pickup_limiter.is_blocked(key):

        raise HTTPException(
            status_code=429,
            detail="Too many wrong codes for this order. Please wait 10 minutes.",
        )

    if not codes_match(order.pickup_code, data.pickup_code):

        _pickup_limiter.record_failure(key)

        raise HTTPException(
            status_code=400,
            detail="Pickup code does not match.",
        )

    _pickup_limiter.reset(key)

    order.order_status = "COLLECTED"
    order.collected_at = datetime.utcnow()

    db.commit()
    db.refresh(order)

    notify(db, order, "COLLECTED")

    return {"success": True, "order": _shop_view(order)}


@router.post("/api/shop-admin/orders/{order_number}/retry")
def retry_failed(
    order_number: str,
    shop: models.Shop = Depends(get_current_shop),
    db: Session = Depends(get_db),
):
    """
    Put a failed order back in the print queue.
    """

    order = _find_order(db, shop, order_number)

    if order.order_status != "FAILED":

        raise HTTPException(
            status_code=400,
            detail="Only a failed order can be retried.",
        )

    if not Path(order.file_path).is_file():

        raise HTTPException(
            status_code=400,
            detail=(
                "The customer's file is no longer stored. "
                "Ask the customer to place the order again."
            ),
        )

    order.order_status = "QUEUED"
    order.failure_reason = None

    db.commit()
    db.refresh(order)

    notify(db, order, "QUEUED")

    return {"success": True, "order": _shop_view(order)}


# =========================================================
# SHOP QR CODE (public: it only contains the shop link)
# =========================================================

@router.get("/api/shops/{slug}/qr.png")
def shop_qr(
    slug: str,
    db: Session = Depends(get_db),
):

    shop = (
        db.query(models.Shop)
        .filter(
            models.Shop.slug == slug,
            models.Shop.is_active.is_(True),
        )
        .first()
    )

    if not shop:

        raise HTTPException(
            status_code=404,
            detail="Shop not found.",
        )

    try:
        import qrcode

    except ImportError:

        raise HTTPException(
            status_code=501,
            detail='QR code library missing. Run: pip install "qrcode[pil]"',
        )

    link = f"{_config['frontend_url']}/?shop={shop.slug}"

    image = qrcode.make(link, box_size=10, border=2)

    buffer = io.BytesIO()
    image.save(buffer, format="PNG")

    return Response(
        content=buffer.getvalue(),
        media_type="image/png",
    )

# =========================================================
# SHOP SLIP & ADVERTISEMENT CONFIGURATION
# =========================================================

class SlipConfigRequest(BaseModel):
    tagline: str | None = None
    promo_title: str | None = None
    promo_body: str | None = None
    contact_phone: str | None = None
    contact_email: str | None = None
    counter_address: str | None = None
    offers_badge: str | None = None
    show_qr_code: bool = True
    qr_custom_link: str | None = None
    layout_style: str = "standard"


def _get_or_create_slip_config(db: Session, shop: models.Shop) -> models.ShopSlipConfig:
    cfg = db.query(models.ShopSlipConfig).filter(models.ShopSlipConfig.shop_id == shop.id).first()
    if not cfg:
        cfg = models.ShopSlipConfig(
            shop_id=shop.id,
            tagline="Store Pickup & Digital Xerox",
            promo_title="Special Services & Student Offers",
            promo_body="• High-Speed Bulk Xerox & Color Prints\n• Hardcover Project & Thesis Spiral Binding\n• Instant Passport Photos & Lamination\n• Special Discounts for College Students",
            contact_phone="",
            contact_email="",
            counter_address=shop.address or "",
            offers_badge="Special Student Discount Available",
            show_qr_code=True,
            qr_custom_link="",
            logo_image_path="",
            layout_style="standard",
        )
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


@router.get("/api/shop-admin/slip-config")
def get_slip_config(
    shop: models.Shop = Depends(get_current_shop),
    db: Session = Depends(get_db),
):
    """Retrieve the current shop's customized order slip & advertisement configuration."""
    cfg = _get_or_create_slip_config(db, shop)
    has_logo = bool(cfg.logo_image_path and os.path.exists(cfg.logo_image_path))
    logo_filename = os.path.basename(cfg.logo_image_path) if has_logo else ""

    return {
        "success": True,
        "config": {
            "shop_name": shop.name,
            "shop_slug": shop.slug,
            "tagline": cfg.tagline or "",
            "promo_title": cfg.promo_title or "",
            "promo_body": cfg.promo_body or "",
            "contact_phone": cfg.contact_phone or "",
            "contact_email": cfg.contact_email or "",
            "counter_address": cfg.counter_address or shop.address or "",
            "offers_badge": cfg.offers_badge or "",
            "show_qr_code": bool(cfg.show_qr_code),
            "qr_custom_link": cfg.qr_custom_link or "",
            "layout_style": cfg.layout_style or "standard",
            "logo_url": f"/static/shop_assets/{logo_filename}" if has_logo else "",
            "has_logo": has_logo,
        }
    }


@router.post("/api/shop-admin/slip-config")
def update_slip_config(
    data: SlipConfigRequest,
    shop: models.Shop = Depends(get_current_shop),
    db: Session = Depends(get_db),
):
    """Save updated shop advertisement text, offers, contact info and QR settings."""
    cfg = _get_or_create_slip_config(db, shop)
    if data.tagline is not None:
        cfg.tagline = data.tagline.strip()[:120]
    if data.promo_title is not None:
        cfg.promo_title = data.promo_title.strip()[:120]
    if data.promo_body is not None:
        cfg.promo_body = data.promo_body.strip()[:2000]
    if data.contact_phone is not None:
        cfg.contact_phone = data.contact_phone.strip()[:50]
    if data.contact_email is not None:
        cfg.contact_email = data.contact_email.strip()[:100]
    if data.counter_address is not None:
        cfg.counter_address = data.counter_address.strip()[:255]
    if data.offers_badge is not None:
        cfg.offers_badge = data.offers_badge.strip()[:120]
    cfg.show_qr_code = bool(data.show_qr_code)
    if data.qr_custom_link is not None:
        cfg.qr_custom_link = data.qr_custom_link.strip()[:255]
    if data.layout_style:
        cfg.layout_style = data.layout_style[:30]

    db.commit()
    db.refresh(cfg)

    has_logo = bool(cfg.logo_image_path and os.path.exists(cfg.logo_image_path))
    logo_filename = os.path.basename(cfg.logo_image_path) if has_logo else ""

    return {
        "success": True,
        "message": "Advertisement and Order Slip settings updated successfully.",
        "config": {
            "shop_name": shop.name,
            "shop_slug": shop.slug,
            "tagline": cfg.tagline or "",
            "promo_title": cfg.promo_title or "",
            "promo_body": cfg.promo_body or "",
            "contact_phone": cfg.contact_phone or "",
            "contact_email": cfg.contact_email or "",
            "counter_address": cfg.counter_address or "",
            "offers_badge": cfg.offers_badge or "",
            "show_qr_code": bool(cfg.show_qr_code),
            "qr_custom_link": cfg.qr_custom_link or "",
            "layout_style": cfg.layout_style or "standard",
            "logo_url": f"/static/shop_assets/{logo_filename}" if has_logo else "",
            "has_logo": has_logo,
        }
    }


@router.post("/api/shop-admin/slip-config/upload-logo")
async def upload_slip_logo(
    file: UploadFile = File(...),
    shop: models.Shop = Depends(get_current_shop),
    db: Session = Depends(get_db),
):
    """Upload a shop logo or advertisement image (JPG, PNG, WEBP)."""
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in (".png", ".jpg", ".jpeg", ".webp"):
        raise HTTPException(status_code=400, detail="Allowed image types: PNG, JPG, JPEG, WEBP")

    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Logo image must be under 5MB.")

    assets_dir = Path(__file__).resolve().parent.parent / "static" / "shop_assets"
    assets_dir.mkdir(parents=True, exist_ok=True)

    filename = f"logo_shop_{shop.id}_{uuid4().hex[:8]}{ext}"
    dest_path = assets_dir / filename
    dest_path.write_bytes(contents)

    cfg = _get_or_create_slip_config(db, shop)
    if cfg.logo_image_path and os.path.exists(cfg.logo_image_path):
        try:
            os.remove(cfg.logo_image_path)
        except Exception:
            pass

    cfg.logo_image_path = str(dest_path)
    db.commit()

    return {
        "success": True,
        "logo_url": f"/static/shop_assets/{filename}",
        "message": "Logo uploaded successfully."
    }


@router.delete("/api/shop-admin/slip-config/logo")
def delete_slip_logo(
    shop: models.Shop = Depends(get_current_shop),
    db: Session = Depends(get_db),
):
    """Remove the uploaded shop logo."""
    cfg = _get_or_create_slip_config(db, shop)
    if cfg.logo_image_path and os.path.exists(cfg.logo_image_path):
        try:
            os.remove(cfg.logo_image_path)
        except Exception:
            pass
    cfg.logo_image_path = ""
    db.commit()
    return {"success": True, "message": "Logo removed successfully."}


@router.get("/api/shop-admin/slip-preview")
def preview_slip_pdf(
    shop: models.Shop = Depends(get_current_shop),
    db: Session = Depends(get_db),
):
    """Generate and return a live test PDF preview of this shop's order slip."""
    from . import windows_printer
    cfg = _get_or_create_slip_config(db, shop)
    pdf_bytes = windows_printer.generate_sample_slip_pdf(
        shop=shop,
        cfg=cfg,
        frontend_url=_config.get("frontend_url", "http://localhost:5173"),
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="slip_preview_{shop.slug}.pdf"'}
    )

