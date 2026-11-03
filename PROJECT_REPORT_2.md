# J. C. BOSE UNIVERSITY OF SCIENCE & TECHNOLOGY, YMCA, FARIDABAD
## DEPARTMENT OF COMPUTER SCIENCE & ENGINEERING
### Progress Report for B.Tech. Capstone Project
**2nd Progress Report (November 2026)**

---

### **Student & Project Details**
- **Name of Student**: `[Student Name / Your Name]`
- **Roll No.**: `[Your University Roll No.]`
- **Name and Roll No of team member**: `[Team Member Name & Roll No. / Individual Project]`
- **Name of Mentor**: `[Mentor / Guide Name]`
- **Title of Project**: **Automated Web-Based Print Shop Management and Direct Spooling System (PrintShop)**

---

### **1. Progress Summary**
Phase 2 (November 2026) represented the core technical integration, hardware automation, payment verification, and multi-tenant management phase of the Capstone Project. Building upon the foundational backend and frontend prototypes created in Phase 1, all major modules have been fully implemented, integrated, and verified against functional requirements.

Key engineering milestones achieved in this period include:
1. **Autonomous Print Queue Worker**: A dedicated background daemon (`print_queue.py`) running in a thread-safe execution environment that continuously dequeues verified, paid orders, dispatches files sequentially, and isolates failure states at the individual file item level to prevent duplicate printing on restarts.
2. **Direct Windows Hardware Spooling & Document Imposition**: Engineered a high-precision document composition pipeline using **PyMuPDF (`fitz`)** and **SumatraPDF**. The engine dynamically parses customer specifications, extracts target page ranges, performs N-up layout imposition (combining 2, 4, 6, 9, or 16 pages per physical sheet), inserts parity blank pages for odd-length double-sided prints to avoid document crossover, generates an automated cover slip with a verification QR code, and triggers silent printing directly to Windows printer queues.
3. **Cryptographically Secure Payment Processing**: Fully integrated **Razorpay Payment Gateway**, supporting order generation and rigorous server-side verification using HMAC-SHA256 signature algorithms.
4. **Comprehensive Shopkeeper & Tracking Portals**: Developed an operational control dashboard for shop owners to manage active queues, toggle shop availability, configure per-shop pricing, and verify customer pickup codes upon job collection.
5. **Data Privacy & Lifecycle Cleanup**: Implemented automated post-print document destruction and 24-hour retention cleanup policies to ensure customer confidentiality.

---

### **2. Tasks Completed**
1. **Autonomous Background Queue & Worker Daemon (`backend/app/print_queue.py`)**:
   - Implemented an asynchronous background worker utilizing Python `threading.Thread` with a polling interval of 2 seconds.
   - Built state transition engine: `PENDING` $\rightarrow$ `QUEUED` $\rightarrow$ `PRINTING` $\rightarrow$ `PRINTED` (or `FAILED`), featuring item-level fault isolation. If one file in a multi-file order fails, previously printed files are never duplicated during retry.
   - Added graceful thread shutdown handling via `threading.Event` to ensure clean worker termination during server lifecycle events.

2. **Advanced Document Imposition & Windows Spooler Engine (`backend/app/windows_printer.py`)**:
   - Integrated **PyMuPDF (`fitz`)** to dynamically construct a "print-ready" PDF on-the-fly before sending it to the printer driver.
   - Implemented N-up layout consolidation (2, 4, 6, 9, 16 pages per sheet) with mathematically calculated scaling, translation matrices, and orientation flipping.
   - Implemented duplex parity compensation: automatically injects a trailing blank page into odd-length documents when double-sided printing is enabled, preventing consecutive copies from sharing physical sheets.
   - Automated Cover Slip & QR Code Generation: Built an automated cover sheet generator containing customer name, order number, pickup code, page options, and an encrypted QR code for instant pickup scanning.
   - Silent Hardware Dispatch: Integrated command-line SumatraPDF execution with silent flags (`-print-to <printer_name> -silent -print-settings "<duplex>,<paper>"`), bypassing user prompt dialogs.

3. **Secure Financial Transaction Pipeline (Razorpay Integration)**:
   - Configured Razorpay SDK within `backend/app/main.py` to initiate server-side orders with precise currency amounts in paise.
   - Implemented backend webhook/callback verification computing HMAC-SHA256 hashes (`razorpay_order_id + "|" + razorpay_payment_id` against `secret_key`), preventing client-side price manipulation or spoofed payment submissions.

4. **Multi-Tenant Shopkeeper Portal & Dashboard (`ShopDashboard.jsx` & `ShopkeeperPortal.jsx`)**:
   - Built a comprehensive shop administration UI allowing shopkeepers to:
     - Monitor active, printing, completed, and failed orders in real time.
     - Toggle store status (Open / Closed / "Back at 2:00 PM") with custom broadcast messages.
     - Route jobs dynamically to specific hardware (e.g., dedicated B/W laser printer vs. heavy-duty Color printer).
     - Trigger manual re-prints, view detailed print logs, and configure per-shop base rates and handling charges.

5. **Customer Live Order Tracking & Pickup Code Security**:
   - Developed `TrackOrderPage.jsx` and `OrderStatus.jsx` providing a real-time visual progress stepper (Order Placed $\rightarrow$ Payment Verified $\rightarrow$ In Print Queue $\rightarrow$ Printing $\rightarrow$ Ready for Pickup).
   - Generated secure 6-character alphanumeric pickup verification codes (`security.py`), requiring customer presentation at the counter before orders are marked as delivered.

6. **Privacy-Preserving Document Shredding & Retention Policy**:
   - Implemented an automated background maintenance routine (`cleanup_unprinted_files`):
     - Automatically purges customer PDF files from the server immediately following successful printing (configurable via `delete_file_after_print`).
     - Hard-deletes unprinted or abandoned uploads after a strict 24-hour expiration window.

7. **System Integration, Fault-Tolerance & Stress Testing**:
   - Conducted rigorous end-to-end integration tests (`scripts/test_printers.py`, `scripts/check_db.py`).
   - Validated system stability under network disconnects, simulated paper jams, printer offline errors, and high-concurrency multi-file upload batches.

---

### **3. Tasks in Progress**
1. **Final Project Dissertation & Technical Documentation**:
   - Drafting the formal B.Tech. Capstone Project thesis, encompassing architectural diagrams, UML sequence diagrams, ER diagrams, data flow diagrams (DFD Levels 0, 1, and 2), and complete API documentation via OpenAPI/Swagger.
2. **Campus Kiosk Pilot Deployment & User Acceptance Testing (UAT)**:
   - Deploying the application in a controlled campus print shop environment to measure end-to-end latency reduction (comparing traditional walk-in times against automated web-spooled orders).
3. **Production Containerization & Windows Service Wrapping**:
   - Packaging the backend worker as an auto-restarting Windows Background Service (via NSSM / Win32Service) and standardizing Docker containers for cloud hosting.

---

**Date**: 25th November 2026  
**Signature of Student**: ___________________________  

---

### **Report of the Mentor**
*(To be filled by mentor)*

…………………………………………………………………………………………………………………………………………………………………………………………  
…………………………………………………………………………………………………………………………………………………………………………………………  
…………………………………………………………………………………………………………………………………………………………………………………………  

**Assessment**: [ Satisfactory / Good / Excellent ]  
**Signature of Mentor**: ___________________________  
