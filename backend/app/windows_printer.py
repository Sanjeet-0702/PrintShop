from datetime import datetime, timezone, timedelta
import io
import re
import qrcode
"""
Real printing on a Windows PC with SumatraPDF.

Instead of passing every option to the printer driver, we first build a
"print-ready" PDF ourselves:

  - only the pages the customer selected, in order
  - several pages per sheet (2, 4, 6, 9, 16) if requested
  - the right number of copies, collated or not
  - a blank page after odd-length copies when printing double-sided,
    so one customer's copy never shares a sheet with the next copy
  - an order cover sheet, so the shop can identify each printed order

SumatraPDF then prints that file silently with colour / duplex / paper.
The print-ready file is deleted straight after printing.
"""

import logging
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

import fitz  # PyMuPDF

from .pricing import parse_page_range


log = logging.getLogger("uvicorn.error")


# =========================================================
# PAPER
# =========================================================

# width x height in points (1 point = 1/72 inch), portrait.
PAPER_POINTS = {
    "A3": (842, 1191),
    "A4": (595, 842),
    "A5": (420, 595),
    "Letter": (612, 792),
    "Legal": (612, 1008),
}

# SumatraPDF's names for the paper sizes.
SUMATRA_PAPER = {
    "A3": "A3",
    "A4": "A4",
    "A5": "A5",
    "Letter": "letter",
    "Legal": "legal",
}

# pages per sheet -> (columns, rows, sheet is landscape?)
NUP_LAYOUT = {
    2: (2, 1, True),
    4: (2, 2, False),
    6: (3, 2, True),
    9: (3, 3, False),
    16: (4, 4, False),
}


# =========================================================
# BUILD THE PRINT-READY PDF
# =========================================================

def _open_source(file_path: str, file_type: str) -> "fitz.Document":

    if file_type == "image":

        image = fitz.open(file_path)

        pdf_bytes = image.convert_to_pdf()

        image.close()

        return fitz.open("pdf", pdf_bytes)

    return fitz.open(file_path)


def build_print_pdf(
    *,
    file_path: str,
    file_type: str,
    page_range: str,
    pages_per_sheet: int,
    copies: int,
    collate: bool,
    duplex: bool,
    paper_size: str,
    output_path: str,
) -> int:
    """
    Writes the print-ready PDF and returns how many sheet-sides it has.
    """

    source = _open_source(file_path, file_type)

    try:

        indexes = parse_page_range(page_range, source.page_count)

        # ---- the pages of ONE copy ----------------------------------
        one_copy = fitz.open()

        if pages_per_sheet == 1:

            for index in indexes:
                one_copy.insert_pdf(
                    source,
                    from_page=index,
                    to_page=index,
                )

        else:

            columns, rows, landscape = NUP_LAYOUT[pages_per_sheet]

            width, height = PAPER_POINTS.get(
                paper_size,
                PAPER_POINTS["A4"],
            )

            if landscape:
                width, height = height, width

            cell_w = width / columns
            cell_h = height / rows
            margin = 6

            per_sheet = columns * rows

            for start in range(0, len(indexes), per_sheet):

                sheet = one_copy.new_page(width=width, height=height)

                for slot, index in enumerate(
                    indexes[start:start + per_sheet]
                ):

                    row, column = divmod(slot, columns)

                    rect = fitz.Rect(
                        column * cell_w + margin,
                        row * cell_h + margin,
                        (column + 1) * cell_w - margin,
                        (row + 1) * cell_h - margin,
                    )

                    # Keeps each page's proportions.
                    sheet.show_pdf_page(rect, source, index)

        sheets = one_copy.page_count

        # ---- repeat for the copies ----------------------------------
        final = fitz.open()

        if collate or copies == 1:

            # 1,2,3  1,2,3  1,2,3
            for _ in range(copies):

                final.insert_pdf(one_copy)

                # Double-sided + odd page count: the next copy must not
                # start on the back of this copy's last sheet.
                if duplex and copies > 1 and sheets % 2 == 1:

                    last = one_copy[sheets - 1].rect

                    final.new_page(
                        width=last.width,
                        height=last.height,
                    )

        else:

            # 1,1,1  2,2,2  3,3,3
            for index in range(sheets):

                for _ in range(copies):

                    final.insert_pdf(
                        one_copy,
                        from_page=index,
                        to_page=index,
                    )

        total = final.page_count

        final.save(output_path)

        final.close()
        one_copy.close()

        return total

    finally:

        source.close()



def mask_customer_phone(phone: str | None) -> str:
    """Mask customer phone number leaving only the last 4 digits visible."""
    if not phone:
        return "N/A"
    clean = str(phone).strip()
    digits = re.findall(r"\d", clean)
    if len(digits) < 4:
        return clean
    last_four = "".join(digits[-4:])
    if clean.startswith("+91"):
        return f"+91-XXXXXX{last_four}"
    elif clean.startswith("+"):
        m = re.match(r"^(\+\d{1,3})", clean)
        prefix = m.group(1) if m else "+91"
        return f"{prefix}-XXXXXX{last_four}"
    else:
        return f"+91-XXXXXX{last_four}"



def format_order_datetime(dt: datetime | None) -> str:
    """
    Format order timestamp to local Indian Standard Time (IST).
    Orders saved in DB use datetime.utcnow(), so naive UTC is converted to local timezone.
    """
    from datetime import timezone, timedelta
    if not dt:
        return datetime.now().strftime("%d %b %Y, %I:%M %p")
    try:
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        local_dt = dt.astimezone()
        return local_dt.strftime("%d %b %Y, %I:%M %p")
    except Exception:
        return (dt + timedelta(hours=5, minutes=30)).strftime("%d %b %Y, %I:%M %p")


def draw_order_slip(
    page,
    width: float,
    height: float,
    shop_name: str,
    ord_num: str,
    order_date_str: str,
    customer_name: str,
    customer_phone: str,
    pickup_code: str,
    file_summary: str,
    specs_summary: str,
    price_str: str,
    cfg,
    shop_link: str,
):
    """Render the customer information and admin-customized shop advertisement on the slip."""
    margin = 36

    # 1. Outer Border
    page.draw_rect(fitz.Rect(margin, margin, width - margin, height - margin), color=(0.7, 0.75, 0.82), width=1)
    page.draw_rect(fitz.Rect(margin + 3, margin + 3, width - margin - 3, height - margin - 3), color=(0.88, 0.9, 0.94), width=0.5)

    # 2. Header Area
    header_h = 65
    page.draw_rect(fitz.Rect(margin + 4, margin + 4, width - margin - 4, margin + header_h), fill=(0.95, 0.97, 1.0), color=(0.82, 0.86, 0.92), width=0.5)

    # Logo if available
    logo_path = getattr(cfg, "logo_image_path", "") or ""
    text_x = margin + 16
    if logo_path and os.path.exists(logo_path):
        try:
            logo_rect = fitz.Rect(margin + 12, margin + 8, margin + 68, margin + 58)
            page.insert_image(logo_rect, filename=logo_path, keep_proportion=True)
            text_x = margin + 76
        except Exception:
            pass

    tagline = getattr(cfg, "tagline", "") or "Store Pickup - Digital Print & Xerox Counter"
    page.insert_text((text_x, margin + 28), shop_name[:38], fontsize=15, fontname="helv", color=(0.08, 0.22, 0.48))
    page.insert_text((text_x, margin + 46), tagline[:50], fontsize=8.5, fontname="helv", color=(0.35, 0.42, 0.5))

    # Order Badge (Right)
    right_x = width - margin - 150
    page.insert_text((right_x, margin + 28), f"ORDER #{ord_num}", fontsize=13, fontname="helv", color=(0.12, 0.4, 0.8))
    page.insert_text((right_x, margin + 46), order_date_str, fontsize=8.5, fontname="helv", color=(0.4, 0.45, 0.5))

    # 3. Customer Info Box
    box_top = margin + 75
    box_bot = box_top + 105
    page.draw_rect(fitz.Rect(margin + 12, box_top, width - margin - 12, box_bot), fill=(0.98, 0.99, 1.0), color=(0.8, 0.85, 0.92), width=0.8)

    # Title strip
    page.draw_rect(fitz.Rect(margin + 12, box_top, width - margin - 12, box_top + 20), fill=(0.9, 0.93, 0.98), color=(0.8, 0.85, 0.92), width=0.5)
    page.insert_text((margin + 20, box_top + 14), "CUSTOMER & ORDER SPECIFICATIONS", fontsize=8.5, fontname="helv", color=(0.1, 0.25, 0.55))
    page.insert_text((width - margin - 120, box_top + 14), "[ PAID ONLINE ]", fontsize=8.5, fontname="helv", color=(0.1, 0.55, 0.25))

    masked_phone = mask_customer_phone(customer_phone)
    page.insert_text((margin + 20, box_top + 38), f"Customer: {customer_name[:35]}", fontsize=9.5, fontname="helv", color=(0.1, 0.15, 0.2))
    page.insert_text((margin + 20, box_top + 56), f"Mobile: {masked_phone}", fontsize=9.5, fontname="helv", color=(0.1, 0.15, 0.2))
    page.insert_text((margin + 20, box_top + 74), f"Pickup Code: {pickup_code}", fontsize=9.5, fontname="helv", color=(0.1, 0.15, 0.2))

    mid_x = width / 2 + 10
    page.insert_text((mid_x, box_top + 38), f"Document: {file_summary[:38]}", fontsize=9.5, fontname="helv", color=(0.1, 0.15, 0.2))
    page.insert_text((mid_x, box_top + 56), f"Settings: {specs_summary[:38]}", fontsize=9.5, fontname="helv", color=(0.1, 0.15, 0.2))
    page.insert_text((mid_x, box_top + 74), f"Total Paid: ₹{price_str}", fontsize=9.5, fontname="helv", color=(0.08, 0.2, 0.45))

    # 4. Perforation Line
    perf_y = box_bot + 16
    page.draw_line(fitz.Point(margin + 16, perf_y), fitz.Point(width - margin - 16, perf_y), color=(0.7, 0.75, 0.82), dashes="[4 3] 0", width=0.8)

    # 5. Advertisement Section
    ad_top = perf_y + 16
    page.draw_rect(fitz.Rect(margin + 12, ad_top, width - margin - 12, height - margin - 45), fill=(0.995, 0.995, 1.0), color=(0.84, 0.87, 0.92), width=0.8)

    promo_title = getattr(cfg, "promo_title", "") or "SPECIAL SERVICES & EXCLUSIVE OFFERS"
    page.insert_text((margin + 24, ad_top + 28), promo_title[:45], fontsize=13.5, fontname="helv", color=(0.08, 0.2, 0.5))

    offers_badge = getattr(cfg, "offers_badge", "") or ""
    if offers_badge:
        page.draw_rect(fitz.Rect(margin + 24, ad_top + 40, width - margin - 24, ad_top + 64), fill=(1.0, 0.95, 0.9), color=(0.95, 0.75, 0.5), width=0.8)
        page.insert_text((margin + 34, ad_top + 56), f"* {offers_badge[:65]}", fontsize=9.5, fontname="helv", color=(0.75, 0.25, 0.05))

    promo_body = getattr(cfg, "promo_body", "") or (
        "- High-Speed Bulk Xerox & Fast Document Printing (B&W / Color)\n"
        "- Hardcover Project & Thesis Spiral Binding with Golden Foil Print\n"
        "- Instant Passport Size Photos (6 / 12 / 24 Copies in 5 mins)\n"
        "- High Quality Lamination, ID Card Printing & Certificate Framing\n"
        "- Resume, Assignment & Admit Card Printing directly from WhatsApp"
    )
    lines = [l.strip() for l in promo_body.split("\n") if l.strip()][:7]
    curr_y = ad_top + (85 if offers_badge else 55)
    for l in lines:
        page.insert_text((margin + 28, curr_y), l[:75], fontsize=9.5, fontname="helv", color=(0.15, 0.2, 0.28))
        curr_y += 19

    # Contact Info Box
    contact_y = max(curr_y + 12, height - margin - 150)
    c_phone = getattr(cfg, "contact_phone", "") or "+91 98765 43210"
    c_addr = getattr(cfg, "counter_address", "") or "Campus Ground Floor Market"
    c_email = getattr(cfg, "contact_email", "") or ""

    box_w = width / 2 + 50 if getattr(cfg, "show_qr_code", True) else width - margin - 40
    page.draw_rect(fitz.Rect(margin + 24, contact_y, box_w, contact_y + 80), fill=(0.96, 0.97, 0.99), color=(0.85, 0.88, 0.92), width=0.5)
    page.insert_text((margin + 32, contact_y + 18), "STORE CONTACT & COUNTER DETAILS:", fontsize=8.5, fontname="helv", color=(0.1, 0.3, 0.6))
    page.insert_text((margin + 32, contact_y + 36), f"Phone / WhatsApp: {c_phone[:35]}", fontsize=9, fontname="helv", color=(0.15, 0.2, 0.25))
    page.insert_text((margin + 32, contact_y + 53), f"Counter Location: {c_addr[:45]}", fontsize=9, fontname="helv", color=(0.15, 0.2, 0.25))
    if c_email:
        page.insert_text((margin + 32, contact_y + 70), f"Email: {c_email[:40]}", fontsize=8.5, fontname="helv", color=(0.3, 0.35, 0.4))

    # QR Code
    if getattr(cfg, "show_qr_code", True):
        try:
            qr_target = getattr(cfg, "qr_custom_link", "") or shop_link
            qr_img = qrcode.make(qr_target, box_size=6, border=1)
            qr_buf = io.BytesIO()
            qr_img.save(qr_buf, format="PNG")
            qr_bytes = qr_buf.getvalue()

            qr_rect = fitz.Rect(width - margin - 145, contact_y - 8, width - margin - 35, contact_y + 102)
            page.insert_image(qr_rect, stream=qr_bytes)
            page.insert_text((width - margin - 148, contact_y + 115), "Scan to order online!", fontsize=8.5, fontname="helv", color=(0.3, 0.35, 0.4))
        except Exception as e:
            log.warning("Could not render QR code on slip: %s", e)

    # 6. Footer
    page.insert_text((margin + 20, height - margin - 20), f"Thank you for choosing {shop_name[:30]}! - Keep this slip with your order.", fontsize=8.5, fontname="helv", color=(0.45, 0.5, 0.55))


def generate_sample_slip_pdf(shop, cfg, frontend_url="http://localhost:5173") -> bytes:
    """Generate a high-resolution preview of the order slip as PDF bytes."""
    doc = fitz.open()
    width, height = 595.3, 841.9 # A4
    page = doc.new_page(width=width, height=height)
    shop_name = shop.name if shop else "PrintShop Store"
    shop_link = f"{frontend_url}/?shop={shop.slug if shop else 'demo'}"
    draw_order_slip(
        page=page,
        width=width,
        height=height,
        shop_name=shop_name,
        ord_num="PS-10001",
        order_date_str=format_order_datetime(None),
        customer_name="Sanjeet Kumar",
        customer_phone="+91-9518408436",
        pickup_code="YZ3257",
        file_summary="Project_Report.pdf (5 pages)",
        specs_summary="1 Copy - Black & White - Single-sided",
        price_str="15.00",
        cfg=cfg,
        shop_link=shop_link,
    )
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


def _prepend_order_cover(pdf_path: str, order) -> None:
    """
    Add a customized order-identification cover & advertisement to the front of the print-ready PDF.
    Only printed on the first file of an order to avoid unnecessary paper waste.
    """
    # For multi-file orders, only prepend to the first file
    item_position = getattr(order, "position", 0)
    if item_position > 0:
        return

    covered_path = pdf_path + ".covered.pdf"
    source = fitz.open(pdf_path)
    combined = fitz.open()

    try:
        if source.page_count == 0:
            raise ValueError("The print-ready document has no pages.")

        first_page = source[0]
        width = first_page.rect.width
        height = first_page.rect.height

        cover = combined.new_page(width=width, height=height)

        # Resolve order, shop and slip configuration
        parent_order = getattr(order, "order", None) or order
        shop_id = getattr(parent_order, "shop_id", None) or getattr(order, "shop_id", None)
        ord_num = getattr(parent_order, "order_number", None) or getattr(order, "order_number", None) or f"PS-{getattr(order, 'id', 'JOB')}"
        c_name = getattr(parent_order, "customer_name", "") or "Customer"
        c_phone = getattr(parent_order, "customer_phone", "") or ""
        p_code = getattr(parent_order, "pickup_code", "") or "---"
        c_date = getattr(parent_order, "created_at", None)
        c_date_str = format_order_datetime(c_date)
        price_val = getattr(parent_order, "price", 0.0)
        price_str = f"{price_val:.2f}"

        # Specs
        copies = getattr(order, "copies", 1)
        ptype = getattr(order, "print_type", "bw").upper()
        duplex_val = getattr(order, "duplex", "simplex")
        duplex_label = "Single-sided" if duplex_val == "simplex" else "Double-sided"
        orig_fn = getattr(order, "original_filename", "Document")
        file_summary = f"{orig_fn} ({source.page_count} pgs)"
        specs_summary = f"{copies} Copy - {ptype} - {duplex_label}"

        # Fetch shop & config from DB
        shop_name = "PrintShop Store"
        shop_link = "http://localhost:5173"
        cfg = None

        if shop_id:
            try:
                from .database import SessionLocal
                from . import models
                with SessionLocal() as db_session:
                    s_rec = db_session.query(models.Shop).filter(models.Shop.id == shop_id).first()
                    if s_rec:
                        shop_name = s_rec.name
                        shop_link = f"http://localhost:5173/?shop={s_rec.slug}"
                        cfg = db_session.query(models.ShopSlipConfig).filter(models.ShopSlipConfig.shop_id == s_rec.id).first()
            except Exception as e:
                log.warning("Could not fetch shop slip config: %s", e)

        draw_order_slip(
            page=cover,
            width=width,
            height=height,
            shop_name=shop_name,
            ord_num=ord_num,
            order_date_str=c_date_str,
            customer_name=c_name,
            customer_phone=c_phone,
            pickup_code=p_code,
            file_summary=file_summary,
            specs_summary=specs_summary,
            price_str=price_str,
            cfg=cfg,
            shop_link=shop_link,
        )

        # With duplex printing, leave the reverse side of the cover blank
        # so the customer's document starts on a fresh sheet.
        if getattr(order, "duplex", "simplex") != "simplex":
            combined.new_page(width=width, height=height)

        combined.insert_pdf(source)
        combined.save(covered_path)

    finally:
        source.close()
        combined.close()

    try:
        os.replace(covered_path, pdf_path)
    finally:
        if os.path.exists(covered_path):
            os.remove(covered_path)


# =========================================================
# SUMATRAPDF SETTINGS
# =========================================================

def build_sumatra_settings(
    *,
    print_type: str,
    duplex: str,
    paper_size: str,
    orientation: str,
    scale_mode: str,
) -> str:
    """
    The comma separated list given to SumatraPDF's -print-settings.
    Copies are NOT in this list: they are already in the PDF.
    """

    settings = [
        "monochrome" if print_type == "bw" else "color",
    ]

    settings.append(
        {
            "simplex": "simplex",
            "long_edge": "duplexlong",
            "short_edge": "duplexshort",
        }.get(duplex, "simplex")
    )

    settings.append(
        "paper=" + SUMATRA_PAPER.get(paper_size, "A4")
    )

    if orientation in ("portrait", "landscape"):
        settings.append(orientation)

    settings.append(
        {
            "fit": "fit",
            "actual": "noscale",
            "shrink": "shrink",
        }.get(scale_mode, "fit")
    )

    return ",".join(settings)


def build_command(
    *,
    sumatra_path: str,
    printer_name: str,
    settings: str,
    pdf_path: str,
) -> list[str]:

    command = [sumatra_path, "-silent", "-exit-when-done"]

    if printer_name:
        command += ["-print-to", printer_name]
    else:
        command += ["-print-to-default"]

    command += [
        "-print-settings", settings,
        pdf_path,
    ]

    return command


# =========================================================
# PRINT ONE ORDER
# =========================================================

def find_sumatra(configured_path: str) -> str | None:
    """
    The SumatraPDF program: the path from .env, or one found on PATH.
    """

    if configured_path:

        if Path(configured_path).is_file():
            return configured_path

        return None

    return shutil.which("SumatraPDF") or shutil.which("SumatraPDF.exe")


def check_setup(sumatra_path: str, printer_name: str) -> None:
    """
    Tell the shopkeeper at start-up if something is missing.
    """

    found = find_sumatra(sumatra_path)

    if not found:

        log.warning(
            "PRINT_MODE=windows but SumatraPDF was not found. "
            "Set SUMATRA_PATH in .env to the full path of SumatraPDF.exe."
        )

    else:

        log.info("SumatraPDF: %s", found)

    log.info(
        "Printer: %s",
        printer_name or "(Windows default printer)",
    )


def print_order(
    order,
    *,
    sumatra_path: str,
    printer_name: str,
    timeout_seconds: int = 180,
) -> None:
    """
    Print one order. Raises an error with a short readable reason if
    anything goes wrong.
    """
    # Pre-check if target printer is online before sending to spooler
    try:
        from .shop_admin import get_system_printers
        printers = get_system_printers()
        target_p = next((p for p in printers if p["name"].lower() == (printer_name or "").lower()), None)
        if target_p and not target_p.get("is_online", True):
            raise RuntimeError(
                f"Printer '{printer_name}' is {target_p.get('status_text', 'disconnected / turned off')}. "
                "Please connect the printer cable or turn it ON."
            )
    except RuntimeError:
        raise
    except Exception as e:
        log.warning("Could not pre-check printer status: %s", e)

    program = find_sumatra(sumatra_path)

    if not program:

        raise RuntimeError(
            "SumatraPDF was not found. Set SUMATRA_PATH in .env."
        )

    work_dir = tempfile.mkdtemp(prefix="printshop_")

    pdf_path = os.path.join(work_dir, "job.pdf")

    try:

        build_print_pdf(
            file_path=order.file_path,
            file_type=order.file_type,
            page_range=order.page_range or "",
            pages_per_sheet=order.pages_per_sheet,
            copies=order.copies,
            collate=(order.collate == "yes"),
            duplex=(order.duplex != "simplex"),
            paper_size=order.paper_size,
            output_path=pdf_path,
        )

        _prepend_order_cover(pdf_path, order)

        command = build_command(
            sumatra_path=program,
            printer_name=printer_name,
            settings=build_sumatra_settings(
                print_type=order.print_type,
                duplex=order.duplex,
                paper_size=order.paper_size,
                orientation=order.orientation,
                scale_mode=order.scale_mode,
            ),
            pdf_path=pdf_path,
        )

        ord_num = getattr(order, "order_number", None) or (getattr(order, "order", None) and getattr(order.order, "order_number", None)) or "JOB"
        log.info("Printing %s: %s", ord_num, command[1:-1])

        options = {}

        if os.name == "nt":
            # No black console window flashing on the shop PC.
            options["creationflags"] = 0x08000000

        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            **options,
        )

        if result.returncode != 0:

            detail = (result.stderr or result.stdout or "").strip()

            raise RuntimeError(
                f"SumatraPDF stopped with code {result.returncode}. "
                f"{detail}"[:300]
            )

    except subprocess.TimeoutExpired:

        raise RuntimeError("The printer took too long to answer.")

    finally:

        # The print-ready copy of the customer's document.
        shutil.rmtree(work_dir, ignore_errors=True)