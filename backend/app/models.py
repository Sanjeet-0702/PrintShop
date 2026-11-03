from datetime import datetime

from sqlalchemy import Boolean
from sqlalchemy import Column
from sqlalchemy import DateTime
from sqlalchemy import Float
from sqlalchemy import ForeignKey
from sqlalchemy import Integer
from sqlalchemy import String
from sqlalchemy import Text
from sqlalchemy.orm import relationship

from .database import Base


class Shop(Base):
    __tablename__ = "shops"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    name = Column(
        String(100),
        nullable=False,
    )

    # used in the shop's link, e.g. /s/sharma-xerox
    slug = Column(
        String(60),
        unique=True,
        index=True,
        nullable=False,
    )

    # services this shop offers (the customer page shows only these)
    supports_bw = Column(
        Boolean,
        nullable=False,
        default=True,
    )

    supports_color = Column(
        Boolean,
        nullable=False,
        default=False,
    )

    supports_photo = Column(
        Boolean,
        nullable=False,
        default=False,
    )

    is_active = Column(
        Boolean,
        nullable=False,
        default=True,
    )

    is_open = Column(
        Boolean,
        nullable=False,
        default=True,
    )

    status_message = Column(
        String(255),
        nullable=True,
        default=None,
    )

    back_at = Column(
        String(50),
        nullable=True,
        default=None,
    )

    address = Column(
        String(255),
        nullable=True,
        default=None,
    )

    city = Column(
        String(100),
        nullable=True,
        default=None,
    )

    latitude = Column(
        Float,
        nullable=True,
        default=None,
    )

    longitude = Column(
        Float,
        nullable=True,
        default=None,
    )

    # shop dashboard login (never the plain password)
    password_hash = Column(
        String(255),
        nullable=True,
    )

    # Configured printers
    bw_printer_name = Column(
        String(255),
        nullable=True,
        default=None,
    )

    color_printer_name = Column(
        String(255),
        nullable=True,
        default=None,
    )

    auto_print_enabled = Column(
        Boolean,
        nullable=False,
        default=True,
    )

    # Pricing configuration (per page & counter fee)
    bw_rate = Column(
        Float,
        nullable=False,
        default=3.0,
    )

    color_rate = Column(
        Float,
        nullable=False,
        default=10.0,
    )

    handling_charge = Column(
        Float,
        nullable=False,
        default=5.0,
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )

    slip_config = relationship(
        "ShopSlipConfig",
        uselist=False,
        back_populates="shop",
        cascade="all, delete-orphan",
    )


class Order(Base):
    __tablename__ = "orders"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    # =====================================================
    # SHOP AND PICKUP
    # =====================================================

    # which shop will print this order
    shop_id = Column(
        Integer,
        ForeignKey("shops.id"),
        nullable=True,
        index=True,
    )

    # shown to the customer only; the shop confirms it at handover
    pickup_code = Column(
        String(8),
        nullable=True,
    )

    # =====================================================
    # CUSTOMER DETAILS
    # =====================================================

    customer_name = Column(
        String(100),
        nullable=True,
    )

    customer_phone = Column(
        String(20),
        nullable=True,
    )

    customer_email = Column(
        String(255),
        nullable=True,
    )

    # =====================================================
    # RAZORPAY PAYMENT DETAILS
    # =====================================================

    razorpay_order_id = Column(
        String(100),
        nullable=True,
        unique=True,
    )

    razorpay_payment_id = Column(
        String(100),
        nullable=True,
    )

    razorpay_signature = Column(
        String(255),
        nullable=True,
    )

    # =====================================================
    # PRINTSHOP ORDER
    # =====================================================

    order_number = Column(
        String(30),
        unique=True,
        index=True,
        nullable=False,
    )

    # =====================================================
    # DOCUMENT
    # For orders with several files, these columns hold the FIRST file
    # (so the shop dashboard and old code keep working).
    # Every file, with its own settings, is in order_items.
    # =====================================================

    original_filename = Column(
        String(255),
        nullable=False,
    )

    stored_filename = Column(
        String(255),
        nullable=False,
    )

    file_path = Column(
        Text,
        nullable=False,
    )

    file_type = Column(
        String(20),
        nullable=False,
    )

    original_pages = Column(
        Integer,
        nullable=False,
    )

    selected_pages = Column(
        Integer,
        nullable=False,
    )

    page_range = Column(
        Text,
        nullable=False,
        default="",
    )

    # =====================================================
    # COPIES
    # =====================================================

    copies = Column(
        Integer,
        nullable=False,
    )

    total_printed_pages = Column(
        Integer,
        nullable=False,
    )

    collate = Column(
        String(10),
        nullable=False,
        default="yes",
    )

    # =====================================================
    # PRINT SETTINGS
    # =====================================================

    print_type = Column(
        String(20),
        nullable=False,
    )

    paper_size = Column(
        String(30),
        nullable=False,
        default="A4",
    )

    orientation = Column(
        String(30),
        nullable=False,
        default="auto",
    )

    duplex = Column(
        String(30),
        nullable=False,
        default="simplex",
    )

    pages_per_sheet = Column(
        Integer,
        nullable=False,
        default=1,
    )

    scale_mode = Column(
        String(30),
        nullable=False,
        default="fit",
    )

    quality = Column(
        String(30),
        nullable=False,
        default="normal",
    )

    # =====================================================
    # PRICE (the whole order)
    # =====================================================

    price = Column(
        Float,
        nullable=False,
    )

    currency = Column(
        String(10),
        nullable=False,
        default="INR",
    )

    # =====================================================
    # STATUS
    # CREATED -> QUEUED (after payment) -> PRINTING -> PRINTED
    # -> READY (shop verified) -> COLLECTED (handed over)  or FAILED
    # =====================================================

    payment_status = Column(
        String(30),
        nullable=False,
        default="PENDING",
    )

    order_status = Column(
        String(30),
        nullable=False,
        default="CREATED",
    )

    # shown to the shopkeeper when a print fails
    failure_reason = Column(
        Text,
        nullable=True,
    )

    # =====================================================
    # HANDOVER AND FEEDBACK
    # =====================================================

    ready_at = Column(
        DateTime,
        nullable=True,
    )

    collected_at = Column(
        DateTime,
        nullable=True,
    )

    rating = Column(
        Integer,
        nullable=True,
    )

    feedback = Column(
        Text,
        nullable=True,
    )

    # =====================================================
    # TIMESTAMPS
    # =====================================================

    created_at = Column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )

    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    # =====================================================
    # FILES IN THIS ORDER (one row per file)
    # =====================================================

    items = relationship(
        "OrderItem",
        back_populates="order",
        order_by="OrderItem.position",
        cascade="all, delete-orphan",
    )


class OrderItem(Base):
    """
    One file in an order, with its own print settings and price.
    Old orders (made before the redesign) have no items.
    """

    __tablename__ = "order_items"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    order_id = Column(
        Integer,
        ForeignKey("orders.id"),
        nullable=False,
        index=True,
    )

    # File 1, File 2 ...
    position = Column(
        Integer,
        nullable=False,
        default=0,
    )

    # Document
    original_filename = Column(
        String(255),
        nullable=False,
    )

    stored_filename = Column(
        String(255),
        nullable=False,
    )

    file_path = Column(
        Text,
        nullable=False,
    )

    file_type = Column(
        String(20),
        nullable=False,
    )

    original_pages = Column(
        Integer,
        nullable=False,
    )

    selected_pages = Column(
        Integer,
        nullable=False,
    )

    page_range = Column(
        Text,
        nullable=False,
        default="",
    )

    # Settings chosen by the customer
    copies = Column(
        Integer,
        nullable=False,
        default=1,
    )

    print_type = Column(
        String(20),
        nullable=False,
    )

    orientation = Column(
        String(30),
        nullable=False,
        default="portrait",
    )

    # Fixed defaults (not shown in the new design)
    paper_size = Column(
        String(30),
        nullable=False,
        default="A4",
    )

    collate = Column(
        String(10),
        nullable=False,
        default="yes",
    )

    duplex = Column(
        String(30),
        nullable=False,
        default="simplex",
    )

    pages_per_sheet = Column(
        Integer,
        nullable=False,
        default=1,
    )

    scale_mode = Column(
        String(30),
        nullable=False,
        default="fit",
    )

    quality = Column(
        String(30),
        nullable=False,
        default="normal",
    )

    # Price at the normal rate, and print status of this file
    # PENDING -> PRINTING -> PRINTED  or FAILED
    total_printed_pages = Column(
        Integer,
        nullable=False,
    )

    price = Column(
        Float,
        nullable=False,
    )

    item_status = Column(
        String(30),
        nullable=False,
        default="PENDING",
    )

    failure_reason = Column(
        Text,
        nullable=True,
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )

    order = relationship(
        "Order",
        back_populates="items",
    )

    @property
    def order_number(self):
        # windows_printer.py prints this on the cover sheet
        return self.order.order_number if self.order else ""


class Notification(Base):
    """
    Every message sent to a customer (status updates, thank you).
    The shop never sees these.
    """

    __tablename__ = "notifications"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    order_id = Column(
        Integer,
        ForeignKey("orders.id"),
        nullable=False,
        index=True,
    )

    event = Column(
        String(30),
        nullable=False,
    )

    # "inapp" or "inapp+email"
    channel = Column(
        String(30),
        nullable=False,
        default="inapp",
    )

    message = Column(
        Text,
        nullable=False,
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )



class ShopSlipConfig(Base):

    __tablename__ = "shop_slip_configs"



    id = Column(

        Integer,

        primary_key=True,

        index=True,

    )



    shop_id = Column(

        Integer,

        ForeignKey("shops.id"),

        unique=True,

        index=True,

        nullable=False,

    )



    tagline = Column(

        String(120),

        nullable=True,

        default="Store Pickup & Digital Xerox",

    )



    promo_title = Column(

        String(120),

        nullable=True,

        default="Special Services & Student Offers",

    )



    promo_body = Column(

        Text,

        nullable=True,

        default="• High-Speed Bulk Xerox & Color Prints\n• Hardcover Project & Thesis Spiral Binding\n• Instant Passport Photos & Lamination\n• Special Discounts for College Students",

    )



    contact_phone = Column(

        String(50),

        nullable=True,

        default="",

    )



    contact_email = Column(

        String(100),

        nullable=True,

        default="",

    )



    counter_address = Column(

        String(255),

        nullable=True,

        default="",

    )



    offers_badge = Column(

        String(120),

        nullable=True,

        default="Special Student Discount Available",

    )



    show_qr_code = Column(

        Boolean,

        nullable=False,

        default=True,

    )



    qr_custom_link = Column(

        String(255),

        nullable=True,

        default="",

    )



    logo_image_path = Column(

        String(255),

        nullable=True,

        default="",

    )



    layout_style = Column(

        String(30),

        nullable=False,

        default="standard",

    )



    updated_at = Column(

        DateTime,

        default=datetime.utcnow,

        onupdate=datetime.utcnow,

        nullable=False,

    )



    shop = relationship(

        "Shop",

        back_populates="slip_config",

    )



