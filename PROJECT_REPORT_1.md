# J. C. BOSE UNIVERSITY OF SCIENCE & TECHNOLOGY, YMCA, FARIDABAD
## DEPARTMENT OF COMPUTER SCIENCE & ENGINEERING
### Progress Report for B.Tech. Capstone Project
**1st Progress Report (October 2026)**

---

### **Student & Project Details**
- **Name of Student**: `[Student Name / Your Name]`
- **Roll No.**: `[Your University Roll No.]`
- **Name and Roll No of team member**: `[Team Member Name & Roll No. / Individual Project]`
- **Name of Mentor**: `[Mentor / Guide Name]`
- **Title of Project**: **Automated Web-Based Print Shop Management and Direct Spooling System (PrintShop)**

---

### **1. Progress Summary**
The primary objective during Phase 1 (up to October 2026) was to analyze the operational bottlenecks in traditional campus and commercial photocopy/print centers, formulate comprehensive Software Requirement Specifications (SRS), architect the system, design the relational database schema, and implement the core backend services and user-facing frontend prototype.

Traditional print centers suffer from chronic inefficiencies including long physical queues, unsanitary and time-consuming file transfers via USB pen-drives or personal WhatsApp/email messages, high error rates in print configuration (e.g., orientation, duplex, color vs. black-and-white), and manual calculations of complex tiered pricing.

To resolve these challenges, the system is designed as a high-performance, decoupled three-tier application utilizing a **FastAPI** asynchronous REST backend, a **React (Vite)** customer portal, and an **SQLAlchemy** relational ORM with SQLite/PostgreSQL. During this period, the end-to-end foundational pipeline was constructed:
1. Customers can upload documents (PDF/Office documents up to 50MB) through an intuitive web interface.
2. The browser renders client-side previews with page-by-page inspection using PDF.js.
3. An automated dynamic pricing engine calculates real-time print charges based on page range parsing (single pages, comma-separated lists, and hyphenated intervals), multi-tier volume discounts, duplex modes, and paper sizing.
4. The database schema was modeled and migrated to support multi-tenant shops, customer orders, multi-file carts, and configurable shop rates.

---

### **2. Tasks Completed**
1. **Problem Formulation & Requirement Engineering**:
   - Conducted a field survey of campus printing counters and established functional requirements (contactless file transfer, real-time pricing, multi-shop support, order tracking) and non-functional requirements (high upload throughput, document confidentiality, sub-second pricing calculation).
   - Authored the Software Requirements Specification (SRS) document and user persona workflows.

2. **System Architecture & Technology Stack Selection**:
   - Architected a modular, service-oriented architecture separating the customer web interface, shopkeeper management portal, RESTful API layer, and asynchronous printing daemon.
   - Selected modern technologies: Python 3.11+, FastAPI (high-concurrency async ASGI), Pydantic v2 (strict payload validation), React 18 with Vite (rapid client-side bundling), and PDF.js.

3. **Database Schema Modeling & Relational Design**:
   - Designed normalized relational models (`backend/app/models.py`) with primary/foreign keys, indices, and cascade rules:
     - `Shop`: Multi-tenant configuration, operational hours, location, printer mappings, and custom rate tables.
     - `Order`: Customer metadata, Razorpay payment reference, pickup code, and order-level status flags.
     - `OrderItem`: Granular tracking for individual files within a single customer order (file path, selected pages, copies, color/BW, duplex mode).
     - `ShopSlipConfig`: Custom receipt and cover sheet formatting.
   - Implemented automated database migration scripts (`backend/migrate_shops.py`, `backend/migrate_step4.py`).

4. **FastAPI Backend Core & File Ingestion Engine**:
   - Configured FastAPI application with CORS middleware, asynchronous dependency injection (`get_db`), and environment configuration via `Pydantic BaseSettings`.
   - Developed `file_service.py` to securely handle multipart file streams, enforce file size limits (50 MB), sanitize filenames, prevent path traversal attacks, and organize uploads into hashed storage directories.

5. **Dynamic Tiered Pricing Algorithm**:
   - Engineered mathematical pricing engine (`backend/app/pricing.py`) implementing tiered rates (e.g., Tier 1: 1–10 pages, Tier 2: 11–20 pages, Tier 3: 21+ pages).
   - Created robust page range tokenizer capable of parsing complex customer inputs (e.g., `"1-5, 8, 12-16"`) and validating against actual document page limits.

6. **Frontend Document Upload & PDF Inspection Portal**:
   - Built responsive customer UI using React and Vite (`frontend/src/main.jsx`).
   - Integrated `pdfjs-dist` worker to generate responsive thumbnails and full-page previews, allowing users to verify document layouts, margins, and page counts prior to submission.

---

### **3. Tasks in Progress**
1. **Decoupled Asynchronous Print Queue Worker**:
   - Developing background worker thread (`print_queue.py`) with First-Come-First-Served (FCFS) job scheduling, thread-safe database locking, and state transition management (`QUEUED` $\rightarrow$ `PRINTING` $\rightarrow$ `PRINTED` / `FAILED`).
2. **Multi-Tenant Shopkeeper Portal & Dashboard**:
   - Designing the administrative interface for shopkeepers to monitor live incoming print jobs, manage store open/closed states, configure local printer hardware, and view metrics.
3. **Hardware Spooling Integration via SumatraPDF**:
   - Prototyping physical Windows Spooler integration and command-line silent execution with SumatraPDF and PyMuPDF (`fitz`) for automatic page imposition and duplex handling.
4. **Payment Gateway Integration (Razorpay)**:
   - Setting up Razorpay test API keys, order creation endpoints, and client-side modal checkout triggers.

---

**Date**: 20th October 2026  
**Signature of Student**: ___________________________  

---

### **Report of the Mentor**
*(To be filled by mentor)*

…………………………………………………………………………………………………………………………………………………………………………………………  
…………………………………………………………………………………………………………………………………………………………………………………………  
…………………………………………………………………………………………………………………………………………………………………………………………  

**Assessment**: [ Satisfactory / Good / Excellent ]  
**Signature of Mentor**: ___________________________  
