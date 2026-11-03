"""
Messages sent to the customer (never to the shop).

Every message is saved in the database, so it appears on the customer's
order page. If email settings are configured and the customer gave an
email address, the same message is also sent by email.

SMS / WhatsApp can be added later in send_message().
"""

import logging
import smtplib
import threading
from email.message import EmailMessage

from sqlalchemy.orm import Session

from . import models


log = logging.getLogger("uvicorn.error")


# =========================================================
# SETTINGS (filled in by main.py at start-up)
# =========================================================

_config = {
    "frontend_url": "http://localhost:5173",
    "smtp_host": "",
    "smtp_port": 587,
    "smtp_user": "",
    "smtp_password": "",
    "smtp_from": "",
}


def configure(**values) -> None:
    _config.update(values)


# =========================================================
# MESSAGE TEXT
# =========================================================

def _tracking_link(order: models.Order) -> str:
    return (
        f"{_config['frontend_url']}/?track=1"
        f"&order={order.order_number}&code={order.pickup_code}"
    )


def build_message(order: models.Order, event: str) -> str | None:
    """
    The text the customer receives for each stage.
    Returns None for events that need no message.
    """

    number = order.order_number

    if event == "QUEUED":
        return (
            f"Your order {number} is accepted and in the print queue. "
            f"Your pickup code is {order.pickup_code}. "
            f"Keep it safe, you need it to collect your prints."
        )

    if event == "PRINTING":
        return f"Your order {number} is printing now."

    if event == "PRINTED":
        return (
            f"Your order {number} has been printed. "
            f"The shop is checking that everything is ready."
        )

    if event == "READY":
        return (
            f"Your order {number} is ready for collection. "
            f"Show your pickup code {order.pickup_code} at the shop."
        )

    if event == "COLLECTED":
        return (
            f"Thank you for visiting! Your order {number} was handed over. "
            f"We would love your feedback: {_tracking_link(order)}"
        )

    if event == "FAILED":
        return (
            f"We could not print your order {number}. "
            f"The shop will look into it. Your money is safe, "
            f"please check with the shop."
        )

    return None


# =========================================================
# SENDING
# =========================================================

def notify(db: Session, order: models.Order, event: str) -> None:
    """
    Save the message for this stage and send it.
    Never raises: a notification problem must not break printing.
    """

    try:

        text = build_message(order, event)

        if not text:
            return

        use_email = bool(
            _config["smtp_host"]
            and _config["smtp_from"]
            and order.customer_email
        )

        db.add(
            models.Notification(
                order_id=order.id,
                event=event,
                channel="inapp+email" if use_email else "inapp",
                message=text,
            )
        )

        db.commit()

        log.info("Notification for %s: %s", order.order_number, event)

        if use_email:

            # Send in the background so a slow mail server never delays us.
            threading.Thread(
                target=_send_email,
                args=(
                    order.customer_email,
                    f"PrintShop order {order.order_number}",
                    text,
                ),
                daemon=True,
            ).start()

    except Exception:

        db.rollback()

        log.exception("Could not send notification (%s)", event)


def _send_email(to_address: str, subject: str, body: str) -> None:

    try:

        message = EmailMessage()
        message["From"] = _config["smtp_from"]
        message["To"] = to_address
        message["Subject"] = subject
        message.set_content(body)

        with smtplib.SMTP(
            _config["smtp_host"],
            int(_config["smtp_port"]),
            timeout=15,
        ) as server:

            server.starttls()

            if _config["smtp_user"]:
                server.login(
                    _config["smtp_user"],
                    _config["smtp_password"],
                )

            server.send_message(message)

    except Exception as error:

        log.warning("Email could not be sent: %s", error)


def messages_for_order(db: Session, order: models.Order) -> list[dict]:
    """
    The messages shown on the customer's order page, oldest first.
    """

    rows = (
        db.query(models.Notification)
        .filter(models.Notification.order_id == order.id)
        .order_by(models.Notification.id.asc())
        .all()
    )

    return [
        {
            "event": row.event,
            "message": row.message,
            "created_at": row.created_at,
        }
        for row in rows
    ]