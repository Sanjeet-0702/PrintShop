"""
Print queue worker (multi-file version).

A background thread that takes paid orders from the queue, one at a time,
first come first served:

    QUEUED -> PRINTING -> PRINTED        (or FAILED)

An order can hold several files (order_items). Each file has its own status:
    PENDING -> PRINTING -> PRINTED       (or FAILED)

Only files that are not PRINTED yet are printed, so a retry after a failure
or a server restart never prints finished files twice.
Old orders without items are printed the old way (one file on the order).

IMPORTANT: run the server with ONE process only (no --workers 2).
"""

import logging
import threading
import time
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy.orm import Session

from . import models
from . import windows_printer
from .database import engine
from .file_service import UPLOAD_DIR, _STORED_NAME
from .notifications import notify


log = logging.getLogger("uvicorn.error")

POLL_SECONDS = 2
CLEANUP_EVERY_SECONDS = 600
MIN_SIMULATED_SECONDS = 3
MAX_SIMULATED_SECONDS = 20

_stop_event = threading.Event()
_thread: threading.Thread | None = None


@dataclass
class WorkerConfig:
    print_mode: str = "simulate"
    delete_file_after_print: bool = True
    seconds_per_page: float = 0.5
    printer_name: str = ""
    sumatra_path: str = ""
    file_retention_hours: int = 24


def _safe_notify(db, order, event) -> None:
    """A failed email must never break printing or payment."""
    try:
        notify(db, order, event)
    except Exception:
        log.exception("Notification %s failed for %s", event, order.order_number)


# =========================================================
# START / STOP
# =========================================================

def start_worker(config: WorkerConfig) -> None:

    global _thread

    if _thread and _thread.is_alive():
        return

    _stop_event.clear()

    if config.print_mode == "windows":
        windows_printer.check_setup(
            config.sumatra_path,
            config.printer_name,
        )

    _thread = threading.Thread(
        target=_run,
        args=(config,),
        name="print-queue-worker",
        daemon=True,
    )

    _thread.start()

    log.info("Print queue started (mode: %s)", config.print_mode)


def stop_worker() -> None:

    _stop_event.set()

    if _thread and _thread.is_alive():
        _thread.join(timeout=5)


# =========================================================
# WORKER LOOP
# =========================================================

def _run(config: WorkerConfig) -> None:

    try:
        _recover_interrupted_jobs()
    except Exception:
        log.exception("Print queue: could not check interrupted jobs")

    last_cleanup = 0.0

    while not _stop_event.is_set():

        if time.time() - last_cleanup >= CLEANUP_EVERY_SECONDS:

            last_cleanup = time.time()

            try:
                cleanup_old_files(config.file_retention_hours)
            except Exception:
                log.exception("Print queue: file cleanup failed")

        try:
            did_work = _process_next_order(config)
        except Exception:
            log.exception("Print queue error")
            did_work = False

        if not did_work:
            _stop_event.wait(POLL_SECONDS)


def _recover_interrupted_jobs() -> None:
    """
    If the server stopped while an order was PRINTING, put that order
    (and the file that was printing) back in the queue.
    """

    with Session(engine) as db:

        stuck_orders = (
            db.query(models.Order)
            .filter(models.Order.order_status == "PRINTING")
            .all()
        )

        for order in stuck_orders:
            order.order_status = "QUEUED"

        stuck_items = (
            db.query(models.OrderItem)
            .filter(models.OrderItem.item_status == "PRINTING")
            .all()
        )

        for item in stuck_items:
            item.item_status = "PENDING"

        if stuck_orders or stuck_items:
            db.commit()

            log.info(
                "Print queue: %s interrupted order(s) put back in the queue",
                len(stuck_orders),
            )


def _process_next_order(config: WorkerConfig) -> bool:
    """
    Print the oldest paid order in the queue.
    Returns True if an order was handled, False if the queue is empty.
    """

    with Session(engine) as db:

        order = (
            db.query(models.Order)
            .filter(
                models.Order.order_status == "QUEUED",
                models.Order.payment_status == "PAID",
            )
            .order_by(models.Order.id.asc())
            .first()
        )

        if not order:
            return False

        order_number = order.order_number

        order.order_status = "PRINTING"
        db.commit()

        _safe_notify(db, order, "PRINTING")

        # ---------------------------------------------
        # Old order (no items): the old single-file way
        # ---------------------------------------------
        if not order.items:
            return _process_legacy_order(db, order, config)

        # ---------------------------------------------
        # New order: print each file that is not PRINTED
        # ---------------------------------------------
        failures = []

        for item in list(order.items):

            if item.item_status == "PRINTED":
                continue

            item.item_status = "PRINTING"
            item.failure_reason = None
            db.commit()

            try:
                finished = _print_job(item, config)

            except Exception as error:

                reason = str(error).strip() or error.__class__.__name__

                log.error(
                    "Print queue: %s file %s failed: %s",
                    order_number,
                    item.original_filename,
                    reason,
                )

                item.item_status = "FAILED"
                item.failure_reason = reason[:300]
                db.commit()

                failures.append(f"{item.original_filename}: {reason}")
                continue

            if not finished:
                # Server is shutting down. This file stays PRINTING and goes
                # back to PENDING on the next start.
                return True

            item.item_status = "PRINTED"
            db.commit()

            if config.delete_file_after_print:
                _delete_uploaded_file(item.file_path)

        if failures:

            order.order_status = "FAILED"
            order.failure_reason = "; ".join(failures)[:300]
            db.commit()

            _safe_notify(db, order, "FAILED")

            return True

        order.order_status = "PRINTED"
        order.failure_reason = None
        db.commit()

        log.info("Print queue: %s printed", order_number)

        _safe_notify(db, order, "PRINTED")

        return True


def _process_legacy_order(db, order, config: WorkerConfig) -> bool:

    order_number = order.order_number

    try:
        finished = _print_job(order, config)

    except Exception as error:

        reason = str(error).strip() or error.__class__.__name__

        log.error("Print queue: %s failed: %s", order_number, reason)

        order.order_status = "FAILED"
        order.failure_reason = reason[:300]
        db.commit()

        _safe_notify(db, order, "FAILED")

        return True

    if not finished:
        return True

    order.order_status = "PRINTED"
    order.failure_reason = None
    db.commit()

    log.info("Print queue: %s printed", order_number)

    _safe_notify(db, order, "PRINTED")

    if config.delete_file_after_print:
        _delete_uploaded_file(order.file_path)

    return True


# =========================================================
# PRINTING ONE FILE (an OrderItem, or an old Order)
# =========================================================

def _print_job(job, config: WorkerConfig) -> bool:
    """
    Send one file to the printer.
    Returns True when finished, False if the server was asked to stop.
    """

    if not Path(job.file_path).is_file():
        raise FileNotFoundError("The uploaded file is missing.")

    if config.print_mode == "simulate":

        seconds = job.total_printed_pages * config.seconds_per_page

        seconds = max(
            MIN_SIMULATED_SECONDS,
            min(seconds, MAX_SIMULATED_SECONDS),
        )

        log.info(
            "[simulate] printing %s: %s page(s), %s, %s",
            job.order_number,
            job.total_printed_pages,
            job.print_type,
            job.orientation,
        )

        return not _stop_event.wait(seconds)

    if config.print_mode == "windows":

        target_printer = config.printer_name
        try:
            from .database import SessionLocal
            with SessionLocal() as db_session:
                shop_id = getattr(job, "shop_id", None) or (getattr(job, "order", None) and getattr(job.order, "shop_id", None))
                shop_rec = db_session.query(models.Shop).filter(models.Shop.id == shop_id).first() if shop_id else None
                if shop_rec:
                    order_print_type = getattr(job, "print_type", "bw").lower()
                    if order_print_type == "color":
                        target_printer = shop_rec.color_printer_name or shop_rec.bw_printer_name or config.printer_name
                    else:
                        target_printer = shop_rec.bw_printer_name or shop_rec.color_printer_name or config.printer_name
        except Exception as e:
            log.warning("Could not resolve shop printer: %s", e)

        windows_printer.print_order(
            job,
            sumatra_path=config.sumatra_path,
            printer_name=target_printer,
        )

        return True

    raise ValueError(f"Unknown print mode: {config.print_mode}")


# =========================================================
# FILE CLEAN-UP
# =========================================================

def _delete_uploaded_file(file_path: str) -> None:
    """Only files inside the uploads folder can be deleted."""

    try:

        path = Path(file_path)

        if path.resolve().parent == UPLOAD_DIR.resolve():
            path.unlink(missing_ok=True)

    except OSError as error:

        log.warning(
            "Print queue: could not delete uploaded file: %s",
            error,
        )


def cleanup_old_files(retention_hours: int) -> int:
    """
    Delete customer files older than the retention time, except files
    of orders that are paid and not finished (QUEUED, PRINTING, FAILED).
    """

    if retention_hours <= 0 or not UPLOAD_DIR.is_dir():
        return 0

    active = ["QUEUED", "PRINTING", "FAILED"]

    with Session(engine) as db:

        in_use = {
            row[0]
            for row in db.query(models.Order.stored_filename)
            .filter(models.Order.order_status.in_(active))
            .all()
        }

        in_use |= {
            row[0]
            for row in db.query(models.OrderItem.stored_filename)
            .join(models.Order, models.Order.id == models.OrderItem.order_id)
            .filter(
                models.Order.order_status.in_(active),
                models.OrderItem.item_status != "PRINTED",
            )
            .all()
        }

    cutoff = time.time() - retention_hours * 3600

    removed = 0

    for path in UPLOAD_DIR.iterdir():

        try:

            if (
                path.is_file()
                and _STORED_NAME.fullmatch(path.name)
                and path.name not in in_use
                and path.stat().st_mtime < cutoff
            ):

                path.unlink()

                removed += 1

        except OSError as error:

            log.warning(
                "Print queue: could not remove old file %s: %s",
                path.name,
                error,
            )

    if removed:
        log.info("Print queue: removed %s old file(s)", removed)

    return removed