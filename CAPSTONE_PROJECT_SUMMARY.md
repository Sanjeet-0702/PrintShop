# B.Tech. Capstone Project - Comprehensive Technical Overview
## Department of Computer Science & Engineering
### J.C. Bose University of Science & Technology, YMCA, Faridabad

---

### Project Title
**Automated Web-Based Print Shop Management and Direct Spooling System (PrintShop)**

### System Overview & Problem Statement
Campus printing infrastructure commonly suffers from severe operational bottlenecks:
- Physical congestion during exam and submission seasons.
- High virus/malware transmission risks caused by unvetted USB drives.
- Privacy compromises from sharing personal documents via messaging applications.
- Calculation errors in manual multi-tier pricing, double-sided counting, and color vs. black-and-white page counting.

**PrintShop** eliminates these issues by providing a cloud/web-connected kiosk and multi-tenant management platform. Students upload documents from any mobile or desktop browser, inspect rendered PDF pages client-side, customize print specifications, and pay online. The system then automatically imposes layouts (N-up, duplex padding), adds a cover sheet with a pickup QR code, and sends print jobs directly to physical Windows printers silently without manual shopkeeper intervention.

---

### System Architecture Diagram
```
+-------------------------------------------------------------+
|                      Client Layer                           |
|  +-----------------------+     +-------------------------+  |
|  | Customer Portal       |     | Shopkeeper Dashboard    |  |
|  | (React, Vite, PDF.js) |     | (Queue Monitor, Status) |  |
+-------------------------------------------------------------+
                               | REST API (HTTP / JSON)
+------------------------------v------------------------------+
|                     FastAPI Backend                         |
|  - CORS & Middleware Layer                                  |
|  - Multipart File Streaming & Hashing Engine                |
|  - Tiered Dynamic Pricing Calculator                        |
|  - Razorpay HMAC-SHA256 Payment Verification                |
|  - Security & 6-char Pickup Code Generator                  |
+-------------------------------------------------------------+
          |                               |
          v SQLAlchemy ORM                v Background Thread
+-----------------------+     +-------------------------------+
|   Database Layer      |     | Print Queue Spooler Worker    |
| - shops               |     | (print_queue.py)              |
| - orders              |     +-------------------------------+
| - order_items         |                 |
| - shop_slip_configs   |                 v PyMuPDF (fitz)
+-----------------------+     +-------------------------------+
                              | Document Imposition Engine    |
                              | - Page range subset selection |
                              | - N-up layout (2/4/6/9/16 up) |
                              | - Duplex parity blank padding |
                              | - Dynamic QR code cover slip  |
                              +-------------------------------+
                                          |
                                          v SumatraPDF CLI
                              +-------------------------------+
                              | Physical Windows Printers     |
                              | (Silent Spooling / Hardware)  |
                              +-------------------------------+
```

---

### Key Technical Modules

| Module Name | File Location | Key Functions & Responsibilities |
| :--- | :--- | :--- |
| **Data Models** | `backend/app/models.py` | Defines `Shop`, `Order`, `OrderItem`, and `ShopSlipConfig` relational tables with foreign keys, cascaded relationships, and SQLite/PostgreSQL support. |
| **REST API Server** | `backend/app/main.py` | FastAPI application exposing endpoints for shops, document uploading, order creation, pricing quotes, status tracking, and Razorpay payment callbacks. |
| **Pricing Engine** | `backend/app/pricing.py` | Tokenizes page range strings (e.g. `1-3, 5, 8-10`), applies volume discount tiers, calculates duplex rates, and adds shop-configurable handling fees. |
| **File Management** | `backend/app/file_service.py` | Enforces 50MB file size limits, verifies MIME types, assigns cryptographic UUIDs, and securely manages document storage. |
| **Print Spooler Worker** | `backend/app/print_queue.py` | Decoupled background worker daemon polling database every 2 seconds, managing FCFS execution, thread safety, and per-item fault tolerance. |
| **Windows Printer Engine** | `backend/app/windows_printer.py` | Uses PyMuPDF to assemble print-ready PDFs (N-up layouts, duplex compensation, cover sheets with QR codes) and invokes SumatraPDF silently. |
| **Security & Pickup Verification** | `backend/app/security.py` | Generates collision-resistant 6-character alphanumeric pickup tokens and verifies handover codes at shop counters. |
| **Shopkeeper Portal** | `frontend/src/components/ShopDashboard.jsx` | Real-time administrative dashboard for queue tracking, reprint requests, operational toggles (open/closed), and printer routing. |
| **Customer Tracking** | `frontend/src/components/TrackOrderPage.jsx` | Visual order lifecycle tracker displaying live status steps from queue submission to pickup readiness. |

---

### Progress Reports Quick Reference
1. **Report 1 (October 2026)**: Covers requirement analysis, system architecture, database modeling, file ingestion, PDF preview rendering, and dynamic pricing algorithms.
2. **Report 2 (November 2026)**: Covers background queue worker, hardware printer integration, SumatraPDF automation, PyMuPDF imposition & QR generation, Razorpay payment verification, shopkeeper portal, and privacy cleanup.

Both reports are formatted to the exact standards of the **Department of Computer Science & Engineering, J.C. Bose UST, YMCA, Faridabad**.
