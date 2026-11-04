import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactDOM from "react-dom/client";

import FileThumbnail from "./components/FileThumbnail";
import OrderStatus from "./components/OrderStatus";
import TrackOrderPage from "./components/TrackOrderPage";
import TrackOrderModal from "./components/TrackOrderModal";
import ConfirmedOrderView from "./components/ConfirmedOrderView";
import ShopDashboard from "./components/ShopDashboard";
import ShopkeeperPortal from "./components/ShopkeeperPortal";

import "./styles.css";

const API_URL = "http://localhost:8000";

// Shop slug from URL: e.g. http://localhost:5173/?shop=campus-xerox
const SHOP_SLUG =
  new URLSearchParams(window.location.search).get("shop") || "";

// Rates
const RATES = {
  bw: 3,
  color: 10,
};

const ORIGINAL_RATES = {
  bw: 6,
  color: 19,
};

const MAX_FILES = 15;
const MAX_FILE_SIZE_MB = 50;

// Validates page range string against document total pages
const validatePageRange = (totalPages, rangeStr, mode) => {
  const docPages = Math.max(1, Number(totalPages) || 1);
  if (mode !== "custom" || !rangeStr || !rangeStr.trim()) {
    return { valid: true, error: "", count: docPages };
  }

  const trimmedStr = rangeStr.trim();
  const parts = trimmedStr.split(",");
  const selected = new Set();

  for (const part of parts) {
    const p = part.trim();
    if (!p) continue;

    if (p.includes("-")) {
      const pieces = p.split("-");
      if (pieces.length !== 2) {
        return { valid: false, error: `Invalid format "${p}". Use e.g. 1-2`, count: 0 };
      }
      const start = parseInt(pieces[0].trim(), 10);
      const end = parseInt(pieces[1].trim(), 10);

      if (isNaN(start) || isNaN(end)) {
        return { valid: false, error: `Invalid numbers in range "${p}"`, count: 0 };
      }
      if (start < 1) {
        return { valid: false, error: "Page numbers must start from 1", count: 0 };
      }
      if (start > end) {
        return { valid: false, error: `Start page (${start}) cannot be greater than end page (${end})`, count: 0 };
      }
      if (end > docPages) {
        return { valid: false, error: `Page ${end} does not exist (File only has ${docPages} pages)`, count: 0 };
      }
      for (let i = start; i <= end; i++) {
        selected.add(i);
      }
    } else {
      const pageNum = parseInt(p, 10);
      if (isNaN(pageNum)) {
        return { valid: false, error: `"${p}" is not a valid page number`, count: 0 };
      }
      if (pageNum < 1) {
        return { valid: false, error: "Page numbers must start from 1", count: 0 };
      }
      if (pageNum > docPages) {
        return { valid: false, error: `Page ${pageNum} does not exist (File only has ${docPages} pages)`, count: 0 };
      }
      selected.add(pageNum);
    }
  }

  if (selected.size === 0) {
    return { valid: false, error: "Please enter at least one valid page number", count: 0 };
  }

  return { valid: true, error: "", count: selected.size };
};

// Helper to calculate how many pages will actually be printed based on page_range
const getSelectedPageCount = (totalPages, rangeStr, mode) => {
  const res = validatePageRange(totalPages, rangeStr, mode);
  return res.valid ? res.count : (Number(totalPages) || 1);
};

function App() {
  // =====================================================
  // STATE: SHOP INFO
  // =====================================================
  const [shop, setShop] = useState(null);
  const [shopError, setShopError] = useState("");
  const [showTrackModal, setShowTrackModal] = useState(false);

  useEffect(() => {
    if (!SHOP_SLUG) {
      setShop(null);
      setShopError("");
      return;
    }
    let cancelled = false;
    const loadShop = async () => {
      try {
        const response = await fetch(
          `${API_URL}/api/shops/${encodeURIComponent(SHOP_SLUG)}`
        );
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.detail || "Shop not found");
        }
        if (!cancelled) {
          setShop(data.shop);
          setShopError("");
        }
      } catch (err) {
        if (!cancelled) {
          setShop(null);
          setShopError(err.message || "Could not load shop");
        }
      }
    };
    loadShop();
    const interval = setInterval(loadShop, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // =====================================================
  // STATE: UPLOADED FILES & CART
  // =====================================================
  const [files, setFiles] = useState([]);
  const [activeFileId, setActiveFileId] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage("");
    }, 4000);
  };

  const fileInputRef = useRef(null);
  const addFilesInputRef = useRef(null);

  // Active file being configured
  const activeFile = useMemo(() => {
    if (!files.length) return null;
    return files.find((f) => f.id === activeFileId) || files[0];
  }, [files, activeFileId]);

  // Keep activeFileId valid
  useEffect(() => {
    if (files.length > 0) {
      if (!activeFileId || !files.some((f) => f.id === activeFileId)) {
        setActiveFileId(files[0].id);
      }
    } else {
      setActiveFileId(null);
    }
  }, [files, activeFileId]);

  // =====================================================
  // UPLOAD HANDLER (Max 15 files, Max 50 MB per file)
  // =====================================================
  const handleFilesSelected = async (selectedFileList) => {
    if (!selectedFileList || selectedFileList.length === 0) return;

    const incoming = Array.from(selectedFileList);
    const availableSlots = MAX_FILES - files.length;

    if (availableSlots <= 0) {
      showToast(`Maximum ${MAX_FILES} files allowed.`);
      return;
    }

    let filesToProcess = incoming;
    if (incoming.length > availableSlots) {
      showToast(`Only ${availableSlots} more file(s) could be added. Maximum is ${MAX_FILES}.`);
      filesToProcess = incoming.slice(0, availableSlots);
    }

    const validFiles = [];
    for (const f of filesToProcess) {
      const sizeMB = f.size / (1024 * 1024);
      if (sizeMB > MAX_FILE_SIZE_MB) {
        showToast(`"${f.name}" exceeds ${MAX_FILE_SIZE_MB} MB limit.`);
      } else {
        validFiles.push(f);
      }
    }

    if (validFiles.length === 0) return;

    const newFileEntries = validFiles.map((f) => {
      const id = `f_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const isImg = f.type.startsWith("image/") || /\.(jpg|jpeg|png)$/i.test(f.name);
      return {
        id,
        file: f,
        stored_filename: "",
        original_filename: f.name,
        file_type: isImg ? "image" : "pdf",
        pages: 1,
        copies: 1,
        print_type: "bw", // Default to B&W
        orientation: "portrait",
        page_selection_mode: "all",
        page_range: "",
        uploading: true,
        error: null,
      };
    });

    setFiles((prev) => [...prev, ...newFileEntries]);
    if (!activeFileId && newFileEntries.length > 0) {
      setActiveFileId(newFileEntries[0].id);
    }

    // Upload each file to /api/upload
    for (const entry of newFileEntries) {
      const formData = new FormData();
      formData.append("file", entry.file);

      try {
        const response = await fetch(`${API_URL}/api/upload`, {
          method: "POST",
          body: formData,
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.detail || "Upload failed");
        }

        setFiles((prev) =>
          prev.map((item) =>
            item.id === entry.id
              ? {
                ...item,
                stored_filename: data.file.stored_filename,
                original_filename: data.file.original_filename || entry.original_filename,
                file_type: data.file.file_type || entry.file_type,
                pages: Number(data.file.pages) || 1,
                uploading: false,
              }
              : item
          )
        );
      } catch (err) {
        setFiles((prev) =>
          prev.map((item) =>
            item.id === entry.id
              ? {
                ...item,
                uploading: false,
                error: err.message || "Upload failed",
              }
              : item
          )
        );
        showToast(`Failed to upload ${entry.original_filename}: ${err.message}`);
      }
    }
  };

  const handleRemoveFile = (id, event) => {
    if (event) event.stopPropagation();
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleCopiesChange = (delta) => {
    if (!activeFile) return;
    const newCopies = Math.max(1, Math.min(100, activeFile.copies + delta));
    setFiles((prev) =>
      prev.map((f) => (f.id === activeFile.id ? { ...f, copies: newCopies } : f))
    );
  };

  const handleColorChange = (type) => {
    if (!activeFile) return;
    setFiles((prev) =>
      prev.map((f) => (f.id === activeFile.id ? { ...f, print_type: type } : f))
    );
  };

  const handleOrientationChange = (orientation) => {
    if (!activeFile) return;
    setFiles((prev) =>
      prev.map((f) => (f.id === activeFile.id ? { ...f, orientation } : f))
    );
  };

  const handlePageModeChange = (mode) => {
    if (!activeFile) return;
    setFiles((prev) =>
      prev.map((f) =>
        f.id === activeFile.id
          ? {
              ...f,
              page_selection_mode: mode,
              page_range: mode === "custom" && !f.page_range ? `${f.pages}` : f.page_range,
            }
          : f
      )
    );
  };

  const handlePageRangeChange = (rangeVal) => {
    if (!activeFile) return;
    setFiles((prev) =>
      prev.map((f) =>
        f.id === activeFile.id
          ? { ...f, page_range: rangeVal, page_selection_mode: "custom" }
          : f
      )
    );
  };

  // =====================================================
  // PRICING CALCULATIONS (Counter Pickup: NO Delivery Fees!)
  // =====================================================
  const fileCalculations = useMemo(() => {
    const bwRate = Number(shop?.bw_rate) || RATES.bw;
    const colorRate = Number(shop?.color_rate) || RATES.color;
    const origBwRate = Math.round(bwRate * 2);
    const origColorRate = Math.round(colorRate * 1.9);

    return files.map((f) => {
      const rate = f.print_type === "color" ? colorRate : bwRate;
      const origRate = f.print_type === "color" ? origColorRate : origBwRate;
      const totalDocPages = Number(f.pages) || 1;
      const rangeValidation = validatePageRange(totalDocPages, f.page_range, f.page_selection_mode);
      const effectivePages = rangeValidation.valid ? rangeValidation.count : totalDocPages;
      const printedPages = effectivePages * (Number(f.copies) || 1);
      const price = printedPages * rate;
      const originalPrice = printedPages * origRate;
      return {
        ...f,
        totalDocPages,
        effectivePages,
        rangeValidation,
        rate,
        origRate,
        printedPages,
        price,
        originalPrice,
      };
    });
  }, [files, shop]);

  const hasInvalidPageRange = useMemo(() => {
    return fileCalculations.some((f) => f.rangeValidation && !f.rangeValidation.valid);
  }, [fileCalculations]);

  const totalPrintedPages = useMemo(() => {
    return fileCalculations.reduce((sum, f) => sum + f.printedPages, 0);
  }, [fileCalculations]);

  const itemsTotal = useMemo(() => {
    return fileCalculations.reduce((sum, f) => sum + f.price, 0);
  }, [fileCalculations]);

  const originalTotal = useMemo(() => {
    return fileCalculations.reduce((sum, f) => sum + f.originalPrice, 0);
  }, [fileCalculations]);

  const totalSaved = Math.max(0, originalTotal - itemsTotal);
  // Total is strictly the print items total — NO delivery fees for store pickup!
  const grandTotal = itemsTotal;

  const activeFileIndex = useMemo(() => {
    if (!activeFile) return 0;
    const idx = files.findIndex((f) => f.id === activeFile.id);
    return idx >= 0 ? idx : 0;
  }, [files, activeFile]);

  // =====================================================
  // CHECKOUT & ORDER PLACEMENT
  // =====================================================
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("online");
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [placedOrder, setPlacedOrder] = useState(null);

  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    setOrderError("");

    if (shop && shop.is_open === false) {
      setOrderError(shop.status_message || "Store is currently away / closed and not accepting new orders.");
      return;
    }

    if (!customerName.trim() || customerName.trim().length < 2) {
      setOrderError("Please enter your name (minimum 2 characters).");
      return;
    }
    const cleanPhone = customerPhone.replace(/\D/g, "");
    if (cleanPhone.length < 10) {
      setOrderError("Please enter a valid 10-digit mobile number.");
      return;
    }

    const unuploaded = files.some((f) => f.uploading || !f.stored_filename);
    if (unuploaded) {
      setOrderError("Please wait for all files to finish uploading.");
      return;
    }

    const invalidFile = fileCalculations.find((f) => f.rangeValidation && !f.rangeValidation.valid);
    if (invalidFile) {
      setOrderError(`Please fix invalid page range on ${invalidFile.original_filename}: ${invalidFile.rangeValidation.error}`);
      return;
    }

    setOrderSubmitting(true);

    try {
      const orderPayload = {
        shop_slug: SHOP_SLUG,
        customer_name: customerName.trim(),
        customer_phone: cleanPhone,
        customer_email: customerEmail.trim() || null,
        items: files.map((f) => ({
          stored_filename: f.stored_filename,
          original_filename: f.original_filename,
          copies: f.copies,
          print_type: f.print_type,
          orientation: f.orientation,
          page_range: f.page_selection_mode === "custom" ? (f.page_range || "").trim() : "",
        })),
      };

      const response = await fetch(`${API_URL}/api/cart/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderPayload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Could not place order");
      }

      const createdOrder = data.order;

      // Online payment via Razorpay
      if (paymentMethod === "online") {
        if (!window.Razorpay) {
          throw new Error("Payment gateway is loading. Please check your internet connection or reload the page.");
        }

        let payData;
        try {
          const payResponse = await fetch(
            `${API_URL}/api/payments/create?order_number=${encodeURIComponent(
              createdOrder.order_number
            )}&pickup_code=${encodeURIComponent(createdOrder.pickup_code)}`,
            { method: "POST" }
          );

          payData = await payResponse.json();

          if (!payResponse.ok || !payData.razorpay_order_id) {
            throw new Error(payData.detail || "Could not initiate payment. Please try again.");
          }
        } catch (initErr) {
          throw new Error(initErr.message || "Failed to initialize payment gateway.");
        }

        const rzp = new window.Razorpay({
          key: payData.key_id,
          amount: payData.amount,
          currency: payData.currency,
          name: "PrintShop",
          description: `Order ${createdOrder.order_number}`,
          order_id: payData.razorpay_order_id,
          prefill: {
            name: customerName,
            contact: cleanPhone,
            email: customerEmail,
          },
          theme: { color: "#2563eb" },
          handler: async (resp) => {
            setOrderSubmitting(true);
            try {
              const verifyRes = await fetch(`${API_URL}/api/payments/verify`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  order_number: createdOrder.order_number,
                  pickup_code: createdOrder.pickup_code,
                  razorpay_payment_id: resp.razorpay_payment_id,
                  razorpay_order_id: resp.razorpay_order_id,
                  razorpay_signature: resp.razorpay_signature,
                }),
              });

              const verifyData = await verifyRes.json();
              if (!verifyRes.ok || !verifyData.success) {
                throw new Error(verifyData.detail || verifyData.message || "Payment verification failed.");
              }

              // ONLY when payment verification succeeds:
              createdOrder.payment_status = "PAID";
              createdOrder.order_status = "QUEUED";
              setPlacedOrder(createdOrder);
              setShowCheckoutModal(false);
              setOrderError("");
            } catch (verifyErr) {
              setOrderError(`Payment verification failed: ${verifyErr.message}. If your account was debited, please show your payment proof at the counter.`);
            } finally {
              setOrderSubmitting(false);
            }
          },
          modal: {
            ondismiss: () => {
              setOrderSubmitting(false);
              setOrderError("⚠️ Payment was cancelled or not completed. Your order has NOT been placed. Please complete payment to place your order.");
            },
          },
        });

        rzp.on("payment.failed", (response) => {
          setOrderSubmitting(false);
          const reason = response?.error?.description || response?.error?.reason || "Transaction was declined.";
          setOrderError(`❌ Payment failed: ${reason}. Your order has NOT been placed.`);
        });

        rzp.open();
        setOrderSubmitting(false);
        return;
      }

      // Fallback for non-online payment methods
      setPlacedOrder(createdOrder);
      setShowCheckoutModal(false);
    } catch (err) {
      setOrderError(err.message || "Failed to create order. Please try again.");
    } finally {
      setOrderSubmitting(false);
    }
  };

  const copyPickupCode = () => {
    if (placedOrder?.pickup_code) {
      navigator.clipboard.writeText(placedOrder.pickup_code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    }
  };

  const resetOrder = () => {
    setFiles([]);
    setActiveFileId(null);
    setPlacedOrder(null);
    setCustomerName("");
    setCustomerPhone("");
    setCustomerEmail("");
  };

  return (
    <div className="ps-root">
      {/* ===================================================
          1. PROFESSIONAL HEADER: Name on Top-Left
      =================================================== */}
      <header className="ps-header">
        <div className="ps-header-inner">
          <div className="ps-brand-wrap" onClick={resetOrder} role="button" tabIndex={0}>
            <div className="ps-logo-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
            </div>
            <div className="ps-brand-text">
              <div className="ps-brand-title-row">
                <span className="ps-brand-name">Print<span className="ps-brand-highlight">Shop</span></span>
                {shop && (
                  shop.is_open !== false ? (
                    <span className="ps-customer-live-pill open" title="Store is open and accepting print orders">
                      <span className="ps-pulse-dot" /> Live • Open
                    </span>
                  ) : (
                    <span className="ps-customer-live-pill closed" title={shop.status_message || "Store is closed"}>
                      <span className="ps-closed-dot" /> Away / Closed
                    </span>
                  )
                )}
              </div>
              <span className="ps-shop-tag">
                {shop ? `📍 ${shop.name} • Store Pickup` : "📍 In-Store Self-Service Printing"}
              </span>
            </div>
          </div>

          <div className="ps-header-actions">
            <button type="button" onClick={() => setShowTrackModal(true)} className="ps-header-btn ps-track-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <span>Track Order</span>
            </button>
            <a href="?shop-admin=1&tab=login" className="ps-header-link">
              Shop Login
            </a>
            <a href="?shop-admin=1&tab=register" className="ps-header-btn ps-signup-btn">
              Sign Up
            </a>
          </div>
        </div>
      </header>

      {/* Global Toast */}
      {toastMessage && <div className="ps-toast">{toastMessage}</div>}

      {/* ===================================================
          2. MAIN CUSTOMER AREA
      =================================================== */}
      <main className="ps-main-container">

        {/* Notice if shop in URL does not exist */}
        {SHOP_SLUG && shopError && (
          <div className="ps-customer-alert-closed">
            <div className="ps-customer-alert-icon">⚠️</div>
            <div className="ps-customer-alert-info">
              <strong>Print Store Not Found</strong>
              <p>No registered print store found for <code>?shop={SHOP_SLUG}</code>. Please check the counter link or register a new shop.</p>
            </div>
            <div className="ps-customer-alert-badge">
              <a href="?shop-admin=1&tab=register" style={{ color: "inherit", textDecoration: "underline", fontWeight: 700 }}>
                Register Store
              </a>
            </div>
          </div>
        )}

        {/* Closed / Away Warning Strip (Customer Side) */}
        {shop && shop.is_open === false && (
          <div className="ps-customer-alert-closed">
            <div className="ps-customer-alert-icon">⏸️</div>
            <div className="ps-customer-alert-info">
              <strong>Store is Currently AWAY / CLOSED</strong>
              <p>
                {shop.status_message || "Online customer orders are paused temporarily. We will be back soon!"}
                {shop.back_at && <span> (Expected back at: <strong>{shop.back_at}</strong>)</span>}
              </p>
            </div>
            <div className="ps-customer-alert-badge">
              ⏸️ Orders Paused
            </div>
          </div>
        )}

        {placedOrder ? (
          <ConfirmedOrderView
            apiUrl={API_URL}
            order={placedOrder}
            shop={shop}
            onReset={resetOrder}
          />
        ) : (
          /* ===================================================
             STATE B: UPLOAD & CONFIGURATION WORKSPACE
          =================================================== */
          <div className="ps-workspace">
            {/* HERO TITLE & SUBTITLE */}
            <div className="ps-hero-header">
              <h1 className="ps-hero-title">Print Documents in Minutes</h1>
              <p className="ps-hero-sub">
                Upload your files, customize print preferences, and collect directly from the shop counter.
              </p>
            </div>

            {files.length === 0 ? (
              /* DROPZONE (WHEN EMPTY) */
              <div className="ps-upload-hero-card">
                <div
                  className={`ps-dropzone ${isDragging ? "dragging" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                      handleFilesSelected(e.dataTransfer.files);
                    }
                  }}
                  onClick={() => fileInputRef.current && fileInputRef.current.click()}
                >
                  <div className="ps-dropzone-icon">
                    <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="12" y1="18" x2="12" y2="12" />
                      <line x1="9" y1="15" x2="12" y2="12" />
                      <line x1="15" y1="15" x2="12" y2="12" />
                    </svg>
                  </div>

                  <h3 className="ps-dropzone-title">Upload your documents</h3>
                  <p className="ps-dropzone-sub">
                    Drag and drop your files here, or click to browse
                  </p>

                  <button
                    type="button"
                    className="ps-upload-cta-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current && fileInputRef.current.click();
                    }}
                  >
                    Select Files
                  </button>

                  <div className="ps-dropzone-features">
                    <span className="ps-feat-pill">📄 PDF, DOCX, JPG, PNG</span>
                    <span className="ps-feat-pill">⚡ Up to 50 MB / file</span>
                    <span className="ps-feat-pill">🔒 Auto-deleted after printing</span>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.png,.jpg,.jpeg,image/png,image/jpeg,application/pdf"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        handleFilesSelected(e.target.files);
                        e.target.value = "";
                      }
                    }}
                  />
                </div>
              </div>
            ) : (
              /* CONFIGURE UPLOADED FILES */
              <div className="ps-configure-grid">
                {/* LEFT/TOP: FILES CAROUSEL & ACTIVE CONFIG */}
                <div className="ps-config-main-col">
                  {/* File Carousel / List */}
                  <div className="ps-files-carousel-wrap">
                    <div className="ps-carousel-header">
                      <span className="ps-carousel-title">
                        Uploaded Documents ({files.length} of {MAX_FILES})
                      </span>
                      {files.length < MAX_FILES && (
                        <button
                          type="button"
                          className="ps-add-file-btn"
                          onClick={() => addFilesInputRef.current && addFilesInputRef.current.click()}
                        >
                          + Add More Files
                        </button>
                      )}
                    </div>

                    <div className="ps-files-track">
                      {files.map((item, idx) => {
                        const isSelected = item.id === (activeFile && activeFile.id);
                        return (
                          <div
                            key={item.id}
                            className={`ps-file-card ${isSelected ? "selected" : ""}`}
                            onClick={() => setActiveFileId(item.id)}
                          >
                            <button
                              type="button"
                              className="ps-file-remove-btn"
                              title="Remove file"
                              onClick={(e) => handleRemoveFile(item.id, e)}
                            >
                              ✕
                            </button>

                            <div className="ps-file-thumb-frame">
                              {item.uploading ? (
                                <div className="ps-thumb-loading">
                                  <div className="ps-spinner" />
                                  <span>Uploading...</span>
                                </div>
                              ) : item.error ? (
                                <div className="ps-thumb-error">Failed</div>
                              ) : (
                                <FileThumbnail
                                  file={item.file}
                                  fileType={item.file_type}
                                  storedFilename={item.stored_filename}
                                  apiUrl={API_URL}
                                  width={110}
                                  height={140}
                                />
                              )}
                            </div>

                            <div className="ps-file-meta">
                              <span className="ps-file-idx">File {idx + 1}</span>
                              <span className="ps-file-name" title={item.original_filename}>
                                {item.original_filename}
                              </span>
                              <span className="ps-file-pages">
                                {item.page_selection_mode === "custom" && item.page_range
                                  ? `Printing ${getSelectedPageCount(item.pages, item.page_range, "custom")} of ${item.pages} pgs`
                                  : `${item.pages} ${item.pages === 1 ? "page" : "pages"}`}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <input
                      ref={addFilesInputRef}
                      type="file"
                      multiple
                      accept=".pdf,.png,.jpg,.jpeg,image/png,image/jpeg,application/pdf"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        if (e.target.files && e.target.files.length > 0) {
                          handleFilesSelected(e.target.files);
                          e.target.value = "";
                        }
                      }}
                    />
                  </div>

                  {/* ACTIVE FILE SETTINGS */}
                  {activeFile && (
                    <div className="ps-settings-card">
                      <div className="ps-settings-header">
                        <div>
                          <h3 className="ps-settings-title">
                            Print Settings: File {activeFileIndex + 1}
                          </h3>
                          <p className="ps-settings-sub">
                            {activeFile.original_filename} • {activeFile.pages} {activeFile.pages === 1 ? "page total" : "pages total"}
                            {activeFile.page_selection_mode === "custom" && (
                              <span className="ps-selected-pages-badge">
                                • Selected: {getSelectedPageCount(activeFile.pages, activeFile.page_range, "custom")} {getSelectedPageCount(activeFile.pages, activeFile.page_range, "custom") === 1 ? "page" : "pages"} (Pg {activeFile.page_range || `1-${activeFile.pages}`})
                              </span>
                            )}
                          </p>
                        </div>
                      </div>

                      {/* COPIES STEPPER */}
                      <div className="ps-setting-row">
                        <div className="ps-setting-label-col">
                          <span className="ps-setting-title">Number of Copies</span>
                          <span className="ps-setting-desc">How many complete sets to print</span>
                        </div>
                        <div className="ps-stepper">
                          <button
                            type="button"
                            className="ps-stepper-btn"
                            onClick={() => handleCopiesChange(-1)}
                            disabled={activeFile.copies <= 1}
                          >
                            −
                          </button>
                          <span className="ps-stepper-val">{activeFile.copies}</span>
                          <button
                            type="button"
                            className="ps-stepper-btn"
                            onClick={() => handleCopiesChange(1)}
                            disabled={activeFile.copies >= 100}
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* PRINT COLOR */}
                      <div className="ps-setting-row">
                        <div className="ps-setting-label-col">
                          <span className="ps-setting-title">Print Color Mode</span>
                          <span className="ps-setting-desc">Choose black & white or vibrant colour</span>
                        </div>
                        <div className="ps-choice-group">
                          <button
                            type="button"
                            className={`ps-choice-chip ${activeFile.print_type === "bw" ? "active" : ""}`}
                            onClick={() => handleColorChange("bw")}
                          >
                            <div className="ps-chip-icon bw-dot" />
                            <div className="ps-chip-text">
                              <strong>Black & White</strong>
                              <span>₹{Number(shop?.bw_rate) || RATES.bw}/page</span>
                            </div>
                          </button>

                          <button
                            type="button"
                            className={`ps-choice-chip ${activeFile.print_type === "color" ? "active" : ""}`}
                            onClick={() => handleColorChange("color")}
                          >
                            <div className="ps-chip-icon color-dot" />
                            <div className="ps-chip-text">
                              <strong>Vibrant Colour</strong>
                              <span>₹{Number(shop?.color_rate) || RATES.color}/page</span>
                            </div>
                          </button>
                        </div>
                      </div>

                      {/* PAGES TO PRINT (RANGE SELECTOR) */}
                      {activeFile.pages > 1 && (
                        <div className="ps-setting-row" style={{ alignItems: "flex-start" }}>
                          <div className="ps-setting-label-col">
                            <span className="ps-setting-title">Pages to Print</span>
                            <span className="ps-setting-desc">
                              {activeFile.page_selection_mode === "custom"
                                ? `Printing ${getSelectedPageCount(activeFile.pages, activeFile.page_range, "custom")} of ${activeFile.pages} pages`
                                : `All ${activeFile.pages} pages (1 - ${activeFile.pages})`}
                            </span>
                          </div>

                          <div className="ps-pages-selector-container">
                            <div className="ps-choice-group">
                              <button
                                type="button"
                                className={`ps-choice-chip ${(!activeFile.page_selection_mode || activeFile.page_selection_mode === "all") ? "active" : ""}`}
                                onClick={() => handlePageModeChange("all")}
                              >
                                <span style={{ fontSize: "1.1rem" }}>📄</span>
                                <div className="ps-chip-text">
                                  <strong>All Pages</strong>
                                  <span>1 - {activeFile.pages}</span>
                                </div>
                              </button>

                              <button
                                type="button"
                                className={`ps-choice-chip ${activeFile.page_selection_mode === "custom" ? "active" : ""}`}
                                onClick={() => handlePageModeChange("custom")}
                              >
                                <span style={{ fontSize: "1.1rem" }}>🔢</span>
                                <div className="ps-chip-text">
                                  <strong>Custom Range</strong>
                                  <span>Select pages</span>
                                </div>
                              </button>
                            </div>

                            {activeFile.page_selection_mode === "custom" && (() => {
                              const validation = validatePageRange(activeFile.pages, activeFile.page_range, "custom");
                              const isInvalid = !validation.valid;

                              return (
                                <div className={`ps-custom-pages-box ${isInvalid ? "has-error" : ""}`}>
                                  <div className="ps-custom-input-row">
                                    <input
                                      type="text"
                                      className={`ps-page-range-input ${isInvalid ? "input-error" : ""}`}
                                      value={activeFile.page_range || ""}
                                      onChange={(e) => handlePageRangeChange(e.target.value)}
                                      placeholder={`e.g. 3 or 1-2 (Max: ${activeFile.pages})`}
                                      autoFocus
                                    />
                                    {isInvalid ? (
                                      <span className="ps-page-count-badge error" title={validation.error}>
                                        ⚠️ Invalid
                                      </span>
                                    ) : (
                                      <span className="ps-page-count-badge success">
                                        ✓ {validation.count} {validation.count === 1 ? "page" : "pages"}
                                      </span>
                                    )}
                                  </div>

                                  {isInvalid && (
                                    <div className="ps-page-range-error-msg">
                                      <span>⚠️</span> <span>{validation.error}</span>
                                    </div>
                                  )}

                                  <div className="ps-quick-page-chips">
                                    <span className="ps-quick-label">Quick select:</span>
                                    {activeFile.pages > 1 && (
                                      <>
                                        <button
                                          type="button"
                                          className="ps-quick-chip"
                                          onClick={() => handlePageRangeChange("1")}
                                        >
                                          Page 1 only
                                        </button>
                                        <button
                                          type="button"
                                          className="ps-quick-chip"
                                          onClick={() => handlePageRangeChange(`${activeFile.pages}`)}
                                        >
                                          Page {activeFile.pages} only
                                        </button>
                                      </>
                                    )}
                                    {activeFile.pages > 2 && (
                                      <button
                                        type="button"
                                        className="ps-quick-chip"
                                        onClick={() => handlePageRangeChange(`1-${activeFile.pages}`)}
                                      >
                                        All (1-{activeFile.pages})
                                      </button>
                                    )}
                                  </div>

                                  <p className="ps-page-hint">
                                    💡 Type single page (e.g. <code>3</code>) or range (e.g. <code>1-2</code>). Allowed: <strong>1 to {activeFile.pages}</strong>.
                                  </p>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      )}

                      {/* ORIENTATION */}
                      <div className="ps-setting-row">
                        <div className="ps-setting-label-col">
                          <span className="ps-setting-title">Orientation</span>
                          <span className="ps-setting-desc">Standard paper layout</span>
                        </div>
                        <div className="ps-choice-group">
                          <button
                            type="button"
                            className={`ps-choice-chip ${activeFile.orientation === "portrait" ? "active" : ""}`}
                            onClick={() => handleOrientationChange("portrait")}
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="5" y="3" width="14" height="18" rx="2" />
                              <line x1="9" y1="7" x2="15" y2="7" />
                            </svg>
                            <div className="ps-chip-text">
                              <strong>Portrait</strong>
                              <span>Vertical</span>
                            </div>
                          </button>

                          <button
                            type="button"
                            className={`ps-choice-chip ${activeFile.orientation === "landscape" ? "active" : ""}`}
                            onClick={() => handleOrientationChange("landscape")}
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="3" y="5" width="18" height="14" rx="2" />
                              <line x1="7" y1="9" x2="13" y2="9" />
                            </svg>
                            <div className="ps-chip-text">
                              <strong>Landscape</strong>
                              <span>Horizontal</span>
                            </div>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* RIGHT: ORDER SUMMARY & PROCEED CARD */}
                <div className="ps-summary-col">
                  <div className="ps-summary-card">
                    <h3 className="ps-summary-card-title">Order Summary</h3>

                    <div className="ps-summary-list">
                      {fileCalculations.map((item, idx) => (
                        <div key={item.id} className="ps-summary-item">
                          <div className="ps-item-text">
                            <span className="ps-item-name">File {idx + 1}: {item.original_filename}</span>
                            <span className="ps-item-specs">
                              {item.page_selection_mode === "custom" && item.page_range
                                ? `Pg ${item.page_range} (${item.effectivePages} ${item.effectivePages === 1 ? "page" : "pages"})`
                                : `${item.effectivePages} ${item.effectivePages === 1 ? "page" : "pages"}`
                              } × {item.copies} {item.copies > 1 ? "copies" : "copy"} ({item.print_type === "color" ? "Colour" : "B&W"})
                            </span>
                          </div>
                          <span className="ps-item-price">₹{item.price}</span>
                        </div>
                      ))}
                    </div>

                    <div className="ps-summary-divider" />

                    <div className="ps-bill-line">
                      <span>Total Printed Pages</span>
                      <strong>{totalPrintedPages} pages</strong>
                    </div>

                    <div className="ps-bill-line">
                      <span>Print Cost</span>
                      <strong>₹{itemsTotal}</strong>
                    </div>

                    <div className="ps-bill-line ps-free-pickup">
                      <span>Store Counter Pickup</span>
                      <span className="ps-free-badge">FREE</span>
                    </div>

                    {totalSaved > 0 && (
                      <div className="ps-savings-banner">
                        🎉 You save ₹{totalSaved} on this order!
                      </div>
                    )}

                    <div className="ps-summary-divider" />

                    <div className="ps-grand-total-row">
                      <div>
                        <span className="ps-grand-total-label">Total Payable</span>
                        <small className="ps-pickup-note">Pay online & collect at store counter</small>
                      </div>
                      <span className="ps-grand-total-val">₹{grandTotal}</span>
                    </div>

                    <button
                      type="button"
                      className={`ps-checkout-btn ${hasInvalidPageRange || shop?.is_open === false ? "disabled" : ""}`}
                      style={
                        shop?.is_open === false
                          ? { opacity: 0.75, cursor: "not-allowed", background: "#ea580c" }
                          : hasInvalidPageRange
                          ? { opacity: 0.6, cursor: "not-allowed", background: "#94a3b8" }
                          : {}
                      }
                      onClick={() => {
                        if (!SHOP_SLUG || !shop) {
                          showToast("Please open your print shop's link (e.g. ?shop=store-name) or scan their counter QR code to place an order.");
                          return;
                        }
                        if (shop && shop.is_open === false) {
                          showToast(`⏸️ Store is currently closed: ${shop.status_message || "Orders paused"}`);
                          return;
                        }
                        if (hasInvalidPageRange) {
                          const invalidFile = fileCalculations.find((f) => f.rangeValidation && !f.rangeValidation.valid);
                          if (invalidFile) {
                            showToast(`⚠️ ${invalidFile.rangeValidation.error}`);
                            setActiveFileId(invalidFile.id);
                          }
                          return;
                        }
                        setShowCheckoutModal(true);
                      }}
                    >
                      {shop?.is_open === false
                        ? "⏸️ Store is Currently Closed"
                        : hasInvalidPageRange
                        ? "Fix Invalid Page Range"
                        : "Proceed to Place Order"}
                    </button>
                    {shop?.is_open === false ? (
                      <p style={{ color: "#c2410c", fontSize: "0.82rem", textAlign: "center", margin: "8px 0 0", fontWeight: "600" }}>
                        ⏸️ {shop.status_message || "Store is closed. Online orders paused."}
                      </p>
                    ) : hasInvalidPageRange && (
                      <p style={{ color: "#ef4444", fontSize: "0.8rem", textAlign: "center", margin: "6px 0 0", fontWeight: "600" }}>
                        ⚠️ Please correct the invalid page range to proceed.
                      </p>
                    )}

                    <div className="ps-guarantee-note">
                      <span>🔒 Files deleted permanently after printing</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===================================================
            3. INFORMATIONAL & MARKETING SECTIONS (AS IN SCREENSHOTS)
            (Always visible on scroll!)
        =================================================== */}
        <div className="ps-info-sections">
          {/* SECTION 1: WHY CHOOSE PRINTSHOP? (Screenshot 1) */}
          <section className="ps-section">
            <h2 className="ps-section-title">Why try PrintShop?</h2>
            <div className="ps-cards-grid-4">
              {/* Card 1: Ready in minutes */}
              <div className="ps-feature-card">
                <div className="ps-feat-icon-box">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                    <path d="M2 12h2" />
                    <path d="M4 7h1" />
                  </svg>
                </div>
                <h3 className="ps-feat-title">Ready in minutes</h3>
                <p className="ps-feat-desc">
                  Order ahead and pick up directly at the shop counter without waiting in line.
                </p>
              </div>

              {/* Card 2: Safe and secure */}
              <div className="ps-feature-card">
                <div className="ps-feat-icon-box">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <polyline points="9 12 11 14 15 10" />
                  </svg>
                </div>
                <h3 className="ps-feat-title">Safe and secure</h3>
                <p className="ps-feat-desc">
                  We delete your files once printed. Your privacy is guaranteed.
                </p>
              </div>

              {/* Card 3: Affordable Printing */}
              <div className="ps-feature-card">
                <div className="ps-feat-icon-box">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <polyline points="19 12 12 19 5 12" />
                  </svg>
                </div>
                <h3 className="ps-feat-title">Affordable Printing</h3>
                <p className="ps-feat-desc">
                  Transparent per-page rates with instant price quotes and zero hidden charges.
                </p>
              </div>

              {/* Card 4: No minimum order */}
              <div className="ps-feature-card">
                <div className="ps-feat-icon-box">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="6" width="20" height="12" rx="2" />
                    <circle cx="12" cy="12" r="2" />
                    <path d="M6 12h.01M18 12h.01" />
                  </svg>
                </div>
                <h3 className="ps-feat-title">No minimum order</h3>
                <p className="ps-feat-desc">
                  Order as many pages as few as you want.
                </p>
              </div>
            </div>
          </section>

          {/* SECTION 2: HOW PRINTSHOP WORKS (Screenshot 3) */}
          <section className="ps-section">
            <h2 className="ps-section-title">How PrintShop works</h2>
            <p className="ps-section-sub">
              Let PrintShop take care of your everyday printing needs
            </p>
            <div className="ps-cards-grid-4">
              {/* Step 1 */}
              <div className="ps-step-card">
                <div className="ps-step-icon-box">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 6 2 18 2 18 9" />
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                    <rect x="6" y="14" width="12" height="8" />
                  </svg>
                </div>
                <h3 className="ps-step-title">Visit PrintShop</h3>
                <p className="ps-step-desc">
                  Open the shop link or scan counter QR at the store
                </p>
              </div>

              {/* Step 2 */}
              <div className="ps-step-card">
                <div className="ps-step-icon-box">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>
                <h3 className="ps-step-title">Upload file(s)</h3>
                <p className="ps-step-desc">
                  Upload a file or multiple files to take prints
                </p>
              </div>

              {/* Step 3 */}
              <div className="ps-step-card">
                <div className="ps-step-icon-box">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="4" y1="21" x2="4" y2="14" />
                    <line x1="4" y1="10" x2="4" y2="3" />
                    <line x1="12" y1="21" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12" y2="3" />
                    <line x1="20" y1="21" x2="20" y2="16" />
                    <line x1="20" y1="12" x2="20" y2="3" />
                    <line x1="1" y1="14" x2="7" y2="14" />
                    <line x1="9" y1="8" x2="15" y2="8" />
                    <line x1="17" y1="16" x2="23" y2="16" />
                  </svg>
                </div>
                <h3 className="ps-step-title">Customise print</h3>
                <p className="ps-step-desc">
                  Choose print settings as per your requirement
                </p>
              </div>

              {/* Step 4 */}
              <div className="ps-step-card">
                <div className="ps-step-icon-box">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="9" cy="21" r="1" />
                    <circle cx="20" cy="21" r="1" />
                    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                  </svg>
                </div>
                <h3 className="ps-step-title">Collect at Counter</h3>
                <p className="ps-step-desc">
                  Receive your Pickup Code and collect your order
                </p>
              </div>
            </div>
          </section>

          {/* SECTION 3: CUSTOMISATION OPTIONS (Screenshot 2) */}
          <section className="ps-section">
            <h2 className="ps-section-title">Customisation options</h2>
            <div className="ps-cards-grid-4">
              {/* Option 1 */}
              <div className="ps-option-card">
                <div className="ps-opt-icon-box">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4338ca" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 6 2 18 2 18 9" />
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                    <rect x="6" y="14" width="12" height="8" />
                  </svg>
                </div>
                <h3 className="ps-opt-title">Upload any file type</h3>
                <p className="ps-opt-desc">
                  Print PDF, JPG, PNG, JPEG, and many more
                </p>
              </div>

              {/* Option 2 */}
              <div className="ps-option-card">
                <div className="ps-opt-icon-box">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4338ca" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="8" r="5" />
                    <circle cx="8" cy="14" r="5" />
                    <circle cx="16" cy="14" r="5" />
                  </svg>
                </div>
                <h3 className="ps-opt-title">Black & White / Colour</h3>
                <p className="ps-opt-desc">
                  Save cost with black & white or pick the coloured option
                </p>
              </div>

              {/* Option 3 */}
              <div className="ps-option-card">
                <div className="ps-opt-icon-box">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4338ca" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                </div>
                <h3 className="ps-opt-title">Paper format size</h3>
                <p className="ps-opt-desc">
                  We work with high-quality A4 printing paper of 75/80 GSM
                </p>
              </div>

              {/* Option 4 */}
              <div className="ps-option-card">
                <div className="ps-opt-icon-box">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4338ca" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="7" width="14" height="14" rx="2" />
                    <path d="M8 3h12a2 2 0 0 1 2 2v12" />
                  </svg>
                </div>
                <h3 className="ps-opt-title">Orientation</h3>
                <p className="ps-opt-desc">
                  Choose landscape or portrait as per your need
                </p>
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* ===================================================
          4. PROFESSIONAL FOOTER
      =================================================== */}
      <footer className="ps-footer">
        <div className="ps-footer-inner">
          <div className="ps-footer-brand">
            <span className="ps-brand-name">Print<span className="ps-brand-highlight">Shop</span></span>
            <p className="ps-footer-tag">
              Smart in-store self-service printing platform.
            </p>
          </div>
          <div className="ps-footer-links">
            <a href="?track=1" onClick={(e) => { e.preventDefault(); setShowTrackModal(true); }}>Track Order</a>
            <a href="?shop-admin=1&tab=login">Shop Login</a>
            <a href="?shop-admin=1&tab=register">Register Shop</a>
            <span>Auto-Delete File Security</span>
          </div>
        </div>
        <div className="ps-footer-bottom">
          <p>© {new Date().getFullYear()} PrintShop. All rights reserved. Documents are permanently erased after printing.</p>
        </div>
      </footer>

      {/* ===================================================
          CHECKOUT MODAL
      =================================================== */}
      {showCheckoutModal && (
        <div className="ps-modal-backdrop" onClick={() => setShowCheckoutModal(false)}>
          <div className="ps-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="ps-modal-header">
              <h3>Customer & Pickup Details</h3>
              <button
                type="button"
                className="ps-modal-close"
                onClick={() => setShowCheckoutModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handlePlaceOrder} className="ps-modal-form">
              {orderError && <div className="ps-form-error">{orderError}</div>}

              <label className="ps-form-field">
                <span>Full Name *</span>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rahul Sharma"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              </label>

              <label className="ps-form-field">
                <span>Mobile Number *</span>
                <input
                  type="tel"
                  required
                  placeholder="10-digit mobile number"
                  maxLength={10}
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                />
                <small className="ps-field-hint">Used to verify your pickup at the store</small>
              </label>

              <label className="ps-form-field">
                <span>Email (optional)</span>
                <input
                  type="email"
                  placeholder="For digital order receipt"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                />
              </label>

              <div className="ps-payment-method-section">
                <span className="ps-field-title">Payment Method</span>
                <div className="ps-online-pay-badge">
                  <span className="ps-pay-secure-icon">🔒</span>
                  <div className="ps-online-pay-info">
                    <strong>Online Payment (UPI, QR, Cards)</strong>
                    <small>Instant UPI (GPay, PhonePe, Paytm), Cards & NetBanking</small>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={orderSubmitting}
                className="ps-submit-order-btn"
              >
                {orderSubmitting ? "Processing Payment..." : `Pay & Confirm Order • ₹${grandTotal}`}
              </button>
            </form>
          </div>
        </div>
      )}
    
      {showTrackModal && (
        <TrackOrderModal
          apiUrl={API_URL}
          onClose={() => setShowTrackModal(false)}
        />
      )}
    </div>
  );
}

// =====================================================
// ROOT RENDERER
// =====================================================
const pageParams = new URLSearchParams(window.location.search);
const isTrackPage = pageParams.get("track") !== null;
const isShopAdminPage = pageParams.get("shop-admin") !== null;

const hasShopSlug = Boolean(SHOP_SLUG && SHOP_SLUG.trim());

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isShopAdminPage ? (
      <ShopDashboard apiUrl={API_URL} />
    ) : isTrackPage ? (
      <TrackOrderPage apiUrl={API_URL} />
    ) : hasShopSlug ? (
      <App />
    ) : (
      <ShopkeeperPortal apiUrl={API_URL} />
    )}
  </React.StrictMode>
);
