import "../styles.css";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const TOKEN_KEY = "printshop_shop_token";

const STATUS_COLOR = {
  QUEUED: "#d97706",
  PRINTING: "#2563eb",
  PRINTED: "#7c3aed",
  READY: "#16a34a",
  FAILED: "#dc2626",
  COLLECTED: "#64748b",
};

const STATUS_BG = {
  QUEUED: "#fef3c7",
  PRINTING: "#eff6ff",
  PRINTED: "#f5f3ff",
  READY: "#f0fdf4",
  FAILED: "#fef2f2",
  COLLECTED: "#f1f5f9",
};

const STATUS_LABEL = {
  QUEUED: "In queue",
  PRINTING: "Printing now",
  PRINTED: "Printed (Check pages)",
  READY: "Ready for pickup",
  FAILED: "Printing failed",
  COLLECTED: "Handed over",
};

const DUPLEX_LABEL = {
  simplex: "Single-sided",
  long_edge: "Double-sided (long edge)",
  short_edge: "Double-sided (short edge)",
};

function readSavedToken() {
  try {
    return window.sessionStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

function saveToken(token) {
  try {
    if (token) {
      window.sessionStorage.setItem(TOKEN_KEY, token);
    } else {
      window.sessionStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // Storage blocked: session only
  }
}

function formatCardDate(rawDate) {
  if (!rawDate) return "";
  let str = String(rawDate).replace(" ", "T");
  if (!str.endsWith("Z") && !str.includes("+")) {
    str += "Z";
  }
  const d = new Date(str);
  if (isNaN(d.getTime())) return String(rawDate);

  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  const timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  if (isToday) {
    return `Today, ${timeStr}`;
  }
  if (isYesterday) {
    return `Yesterday, ${timeStr}`;
  }
  const dateStr = d.toLocaleDateString([], { day: "2-digit", month: "short" });
  return `${dateStr}, ${timeStr}`;
}

function getOrderDate(order) {
  return order.created_at || order.createdAt || order.timestamp || null;
}

export default function ShopDashboard({ apiUrl }) {
  const params = new URLSearchParams(window.location.search);
  const rawParam = params.get("shop-admin") || params.get("shop") || "";
  const lastShop = (() => {
    try {
      return window.sessionStorage.getItem("printshop_last_shop") || "";
    } catch {
      return "";
    }
  })();
  const initialSlug = (!rawParam || rawParam === "1" || rawParam === "true") ? (lastShop || "") : rawParam;

  // Auth State
  const tabParam = params.get("tab") || "";
  const initialAuthTab = (tabParam === "register" || params.get("signup") !== null || params.get("register") !== null) ? "register" : "login";
  const [authTab, setAuthTab] = useState(initialAuthTab); // "login" | "register"
  const [slug, setSlug] = useState(initialSlug);
  const [token, setToken] = useState(readSavedToken());
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  // Registration State
  const [regName, setRegName] = useState("");
  const [regSlug, setRegSlug] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regSupportsBw, setRegSupportsBw] = useState(true);
  const [regSupportsColor, setRegSupportsColor] = useState(true);
  const [regError, setRegError] = useState("");
  const [registering, setRegistering] = useState(false);

  // Dashboard Data State
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFolder, setActiveFolder] = useState("all_active");
  const [dateFilter, setDateFilter] = useState("all"); // "all" | "today" | "yesterday" | "week"  // "all_active" | "QUEUED" | "PRINTING" | "READY" | "ACTION" | "COLLECTED"

  // Action states for orders
  const [codes, setCodes] = useState({});
  const [busy, setBusy] = useState("");
  const [rowMessage, setRowMessage] = useState({});
  const [showQr, setShowQr] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Store Availability & Status State
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [statusIsOpen, setStatusIsOpen] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusBackAt, setStatusBackAt] = useState("");
  const [savingStatus, setSavingStatus] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState("");

  // Delete Store State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingShop, setDeletingShop] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteError, setDeleteError] = useState("");

  // Printer Setup State
  const [showPrinterModal, setShowPrinterModal] = useState(false);
  const [detectedPrinters, setDetectedPrinters] = useState([]);
  const [bwPrinter, setBwPrinter] = useState("");
  const [colorPrinter, setColorPrinter] = useState("");
  const [autoPrint, setAutoPrint] = useState(true);
  const [loadingPrinters, setLoadingPrinters] = useState(false);
  const [savingPrinters, setSavingPrinters] = useState(false);
  const [printerFeedback, setPrinterFeedback] = useState("");
  const [testingPrinter, setTestingPrinter] = useState("");

  // Pricing Configuration State
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [pricingBw, setPricingBw] = useState(3.0);
  const [pricingColor, setPricingColor] = useState(10.0);
  const [pricingHandling, setPricingHandling] = useState(5.0);
  const [loadingPricing, setLoadingPricing] = useState(false);
  const [savingPricing, setSavingPricing] = useState(false);
  const [pricingFeedback, setPricingFeedback] = useState("");

  // Order Slip & Advertisement State
  const [showSlipModal, setShowSlipModal] = useState(false);
  const [slipConfig, setSlipConfig] = useState({
    tagline: "",
    promo_title: "",
    promo_body: "",
    contact_phone: "",
    contact_email: "",
    counter_address: "",
    offers_badge: "",
    show_qr_code: true,
    qr_custom_link: "",
    layout_style: "standard",
    logo_url: "",
    has_logo: false,
  });
  const [loadingSlip, setLoadingSlip] = useState(false);
  const [savingSlip, setSavingSlip] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [slipFeedback, setSlipFeedback] = useState("");
  const [previewingPdf, setPreviewingPdf] = useState(false);

  const tokenRef = useRef(token);
  tokenRef.current = token;

  const logout = useCallback(() => {
    saveToken("");
    tokenRef.current = "";
    setToken("");
    setData(null);
  }, []);

  // Store Status Actions
  const applyPreset = (presetType) => {
    const now = new Date();
    if (presetType === "lunch") {
      setStatusIsOpen(false);
      setStatusMessage("Taking lunch break. Back soon!");
      const returnTime = new Date(now.getTime() + 30 * 60000);
      setStatusBackAt(returnTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    } else if (presetType === "tea") {
      setStatusIsOpen(false);
      setStatusMessage("Stepped out for a short 15-minute break.");
      const returnTime = new Date(now.getTime() + 15 * 60000);
      setStatusBackAt(returnTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    } else if (presetType === "busy") {
      setStatusIsOpen(false);
      setStatusMessage("Handling counter rush. Online queue resumes shortly!");
      const returnTime = new Date(now.getTime() + 10 * 60000);
      setStatusBackAt(returnTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    } else if (presetType === "closed") {
      setStatusIsOpen(false);
      setStatusMessage("Store is closed for today. See you tomorrow morning!");
      setStatusBackAt("Tomorrow 9:00 AM");
    } else if (presetType === "open") {
      setStatusIsOpen(true);
      setStatusMessage("");
      setStatusBackAt("");
    }
  };

  const handleSaveStatus = async (e) => {
    if (e) e.preventDefault();
    setSavingStatus(true);
    setStatusFeedback("");
    try {
      const response = await fetch(`${apiUrl}/api/shop-admin/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenRef.current}`,
        },
        body: JSON.stringify({
          is_open: statusIsOpen,
          status_message: statusMessage.trim() || null,
          back_at: statusBackAt.trim() || null,
        }),
      });
      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.detail || "Could not update status");
      }
      setData((prev) => ({
        ...prev,
        shop: {
          ...(prev?.shop || {}),
          is_open: statusIsOpen,
          status_message: statusMessage.trim() || null,
          back_at: statusBackAt.trim() || null,
        },
      }));
      setStatusFeedback("✓ Store status updated successfully!");
      setTimeout(() => {
        setShowStatusModal(false);
        setStatusFeedback("");
      }, 1000);
    } catch (err) {
      setStatusFeedback(`Error: ${err.message}`);
    } finally {
      setSavingStatus(false);
    }
  };

  const handleQuickReopen = async () => {
    try {
      const response = await fetch(`${apiUrl}/api/shop-admin/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenRef.current}`,
        },
        body: JSON.stringify({
          is_open: true,
          status_message: null,
          back_at: null,
        }),
      });
      if (response.ok) {
        setData((prev) => ({
          ...prev,
          shop: {
            ...(prev?.shop || {}),
            is_open: true,
            status_message: null,
            back_at: null,
          },
        }));
        load();
      }
    } catch (_) {}
  };

  // Auto-generate slug when registration name changes
  const handleRegNameChange = (e) => {
    const val = e.target.value;
    setRegName(val);
    const suggested = val.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    setRegSlug(suggested);
  };

  // ---------------------------------------------------- load orders
  const load = useCallback(async () => {
    if (!tokenRef.current) return;

    try {
      const response = await fetch(`${apiUrl}/api/shop-admin/orders`, {
        headers: { Authorization: `Bearer ${tokenRef.current}` },
      });

      if (response.status === 401) {
        logout();
        setLoginError("Your session ended. Please log in again.");
        return;
      }

      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.detail || "Could not load orders");
      }

      setData(body);
      if (body.shop?.bw_rate !== undefined) setPricingBw(body.shop.bw_rate);
      if (body.shop?.color_rate !== undefined) setPricingColor(body.shop.color_rate);
      if (body.shop?.handling_charge !== undefined) setPricingHandling(body.shop.handling_charge);
      setError("");
    } catch (err) {
      setError(err.message || "Could not load orders");
    }
  }, [apiUrl, logout]);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const t = p.get("tab");
    if (t === "register" || p.get("signup") !== null || p.get("register") !== null) {
      setAuthTab("register");
    } else if (t === "login") {
      setAuthTab("login");
    }
  }, []);

  useEffect(() => {
    if (!token) return undefined;
    load();
    const timer = setInterval(load, 3500);
    return () => clearInterval(timer);
  }, [token, load]);

  // Auto-refresh printer devices when modal is open
  useEffect(() => {
    if (!showPrinterModal) return undefined;
    loadPrinters();
    const timer = setInterval(() => {
      fetch(`${apiUrl}/api/shop-admin/printers`, {
        headers: { Authorization: `Bearer ${tokenRef.current}` },
      })
        .then((r) => r.json())
        .then((body) => {
          if (body && Array.isArray(body.printers)) {
            setDetectedPrinters(body.printers);
          }
        })
        .catch(() => {});
    }, 2000);
    return () => clearInterval(timer);
  }, [showPrinterModal, apiUrl]);

  // ------------------------------------------------------------- printer setup
  const loadPrinters = async (force = false) => {
    setLoadingPrinters(true);
    setPrinterFeedback("");
    try {
      const url = `${apiUrl}/api/shop-admin/printers${force ? "?force=true" : ""}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${tokenRef.current}` },
      });
      const body = await res.json().catch(() => ({ detail: "Failed to reach server. Check backend is running." }));
      if (!res.ok) throw new Error(body.detail || "Could not detect printers");
      setDetectedPrinters(body.printers || []);
      setBwPrinter(body.bw_printer_name || "");
      setColorPrinter(body.color_printer_name || "");
      setAutoPrint(body.auto_print_enabled !== false);
    } catch (err) {
      setPrinterFeedback(`Error: ${err.message}`);
    } finally {
      setLoadingPrinters(false);
    }
  };

  const handleSavePrinters = async (e) => {
    e?.preventDefault();
    setSavingPrinters(true);
    setPrinterFeedback("");
    try {
      const res = await fetch(`${apiUrl}/api/shop-admin/printers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenRef.current}`,
        },
        body: JSON.stringify({
          bw_printer_name: bwPrinter,
          color_printer_name: colorPrinter,
          auto_print_enabled: autoPrint,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || "Failed to save printer settings");
      setPrinterFeedback("✓ Printer settings updated successfully!");
      setTimeout(() => {
        setShowPrinterModal(false);
        setPrinterFeedback("");
      }, 1200);
    } catch (err) {
      setPrinterFeedback(`Error: ${err.message}`);
    } finally {
      setSavingPrinters(false);
    }
  };

  const handleTestPrint = async (targetPrinter, testType) => {
    if (!targetPrinter) {
      setPrinterFeedback("Please select a printer first to test.");
      return;
    }
    const targetInfo = (detectedPrinters || []).find((p) => (p.name || "").toLowerCase() === targetPrinter.toLowerCase());
    if (targetInfo && !targetInfo.is_online) {
      setPrinterFeedback(`Error: Printer '${targetPrinter}' is disconnected from your laptop. Please plug in the USB cable and turn the printer ON.`);
      return;
    }
    setTestingPrinter(testType);
    setPrinterFeedback(`Sending test page to '${targetPrinter}'...`);
    try {
      const res = await fetch(`${apiUrl}/api/shop-admin/printers/test`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenRef.current}`,
        },
        body: JSON.stringify({
          printer_name: targetPrinter,
          test_type: testType,
        }),
      });
      const body = await res.json().catch(() => ({ detail: "Failed to reach server. Check backend is running." }));
      if (!res.ok) throw new Error(body.detail || "Test print failed");
      setPrinterFeedback(`✓ Test page sent to '${targetPrinter}'!`);
    } catch (err) {
      setPrinterFeedback(`Error: ${err.message}`);
    } finally {
      setTestingPrinter("");
    }
  };

  // ------------------------------------------------------------- order slip & ad config
  const resolveLogoUrl = (url) => {
    if (!url) return "";
    if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("blob:") || url.startsWith("data:")) {
      return url;
    }
    const base = apiUrl ? apiUrl.replace(/\/+$/, "") : "";
    const path = url.startsWith("/") ? url : `/${url}`;
    return `${base}${path}`;
  };

  const loadSlipConfig = async () => {
    setLoadingSlip(true);
    setSlipFeedback("");
    try {
      const res = await fetch(`${apiUrl}/api/shop-admin/slip-config`, {
        headers: { Authorization: `Bearer ${tokenRef.current}` },
      });
      const body = await res.json();
      if (res.ok && body.config) {
        setSlipConfig(body.config);
      }
    } catch (e) {
      console.error("Could not load slip config:", e);
    } finally {
      setLoadingSlip(false);
    }
  };

  const handleSaveSlipConfig = async (e) => {
    e?.preventDefault();
    setSavingSlip(true);
    setSlipFeedback("");
    try {
      const res = await fetch(`${apiUrl}/api/shop-admin/slip-config`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenRef.current}`,
        },
        body: JSON.stringify(slipConfig),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || "Failed to save settings");
      setSlipFeedback("✓ Advertisement & Order Slip saved successfully!");
      if (body.config) setSlipConfig(body.config);
      setTimeout(() => setSlipFeedback(""), 4000);
    } catch (err) {
      setSlipFeedback(`⚠️ Error: ${err.message}`);
    } finally {
      setSavingSlip(false);
    }
  };

  const handleLogoUpload = async (file) => {
    if (!file) return;
    setUploadingLogo(true);
    setSlipFeedback("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${apiUrl}/api/shop-admin/slip-config/upload-logo`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tokenRef.current}` },
        body: formData,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || "Failed to upload logo");
      setSlipConfig((prev) => ({
        ...prev,
        logo_url: body.logo_url,
        has_logo: true,
      }));
      setSlipFeedback("✓ Logo uploaded successfully!");
    } catch (err) {
      setSlipFeedback(`⚠️ Upload failed: ${err.message}`);
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleDeleteLogo = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/shop-admin/slip-config/logo`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${tokenRef.current}` },
      });
      if (res.ok) {
        setSlipConfig((prev) => ({ ...prev, logo_url: "", has_logo: false }));
        setSlipFeedback("✓ Logo removed.");
      }
    } catch (err) {
      setSlipFeedback(`⚠️ Could not remove logo: ${err.message}`);
    }
  };

  const handleOpenPdfPreview = async () => {
    setPreviewingPdf(true);
    try {
      const res = await fetch(`${apiUrl}/api/shop-admin/slip-preview`, {
        headers: { Authorization: `Bearer ${tokenRef.current}` },
      });
      if (!res.ok) throw new Error("Could not generate preview PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (err) {
      alert(`Preview failed: ${err.message}`);
    } finally {
      setPreviewingPdf(false);
    }
  };

  // ------------------------------------------------------------- custom pricing
  const loadPricing = async () => {
    setLoadingPricing(true);
    setPricingFeedback("");
    try {
      const res = await fetch(`${apiUrl}/api/shop-admin/pricing`, {
        headers: { Authorization: `Bearer ${tokenRef.current}` },
      });
      const body = await res.json();
      if (res.ok) {
        setPricingBw(Number(body.bw_rate) || 3.0);
        setPricingColor(Number(body.color_rate) || 10.0);
        setPricingHandling(Number(body.handling_charge) || 0.0);
      }
    } catch (e) {
      console.error("Could not load pricing:", e);
    } finally {
      setLoadingPricing(false);
    }
  };

  const handleSavePricing = async (e) => {
    e?.preventDefault();
    setSavingPricing(true);
    setPricingFeedback("");
    try {
      const res = await fetch(`${apiUrl}/api/shop-admin/pricing`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenRef.current}`,
        },
        body: JSON.stringify({
          bw_rate: parseFloat(pricingBw),
          color_rate: parseFloat(pricingColor),
          handling_charge: parseFloat(pricingHandling),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || "Failed to update pricing");
      setPricingFeedback("✓ Print pricing updated successfully!");
      setData((prev) => prev ? {
        ...prev,
        shop: {
          ...prev.shop,
          bw_rate: parseFloat(pricingBw),
          color_rate: parseFloat(pricingColor),
          handling_charge: parseFloat(pricingHandling),
        }
      } : prev);
      setTimeout(() => {
        setShowPricingModal(false);
        setPricingFeedback("");
      }, 1200);
    } catch (err) {
      setPricingFeedback(`⚠️ Error: ${err.message}`);
    } finally {
      setSavingPricing(false);
    }
  };

  // ------------------------------------------------------------- delete store
  const handleDeleteShop = async (e) => {
    e?.preventDefault();
    setDeletingShop(true);
    setDeleteError("");

    try {
      const response = await fetch(`${apiUrl}/api/shop-admin/delete-shop`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenRef.current}`,
        },
        body: JSON.stringify({
          confirm_slug: data?.shop?.slug || slug,
        }),
      });

      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.detail || "Failed to delete shop");
      }

      logout();
      setShowDeleteModal(false);
      setDeleteConfirmText("");
      setLoginError("Shop was successfully deleted from PrintShop.");
      window.history.replaceState({}, "", "?shop-admin=1");
    } catch (err) {
      setDeleteError(err.message || "Failed to delete shop");
    } finally {
      setDeletingShop(false);
    }
  };

  // ------------------------------------------------------------- login
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoggingIn(true);
    setLoginError("");

    const targetSlug = slug.trim() || "demo-shop";

    try {
      const response = await fetch(`${apiUrl}/api/shop-admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shop_slug: targetSlug, password }),
      });

      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.detail || "Login failed");
      }

      saveToken(body.token);
      setToken(body.token);
      tokenRef.current = body.token;
      setSlug(body.shop?.slug || targetSlug);
      setPassword("");
      try {
        window.sessionStorage.setItem("printshop_last_shop", body.shop?.slug || targetSlug);
        window.history.replaceState({}, "", `?shop-admin=${encodeURIComponent(body.shop?.slug || targetSlug)}`);
      } catch (_) {}
    } catch (err) {
      setLoginError(err.message || "Login failed");
    } finally {
      setLoggingIn(false);
    }
  };

  // ------------------------------------------------------------- register
  const handleRegister = async (e) => {
    e.preventDefault();
    setRegistering(true);
    setRegError("");

    if (!regName.trim() || regName.trim().length < 2) {
      setRegError("Please enter a valid shop name (at least 2 characters).");
      setRegistering(false);
      return;
    }

    if (regPassword.length < 4) {
      setRegError("Password must be at least 4 characters long.");
      setRegistering(false);
      return;
    }

    try {
      const response = await fetch(`${apiUrl}/api/shop-admin/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: regName.trim(),
          slug: regSlug.trim() || undefined,
          password: regPassword,
          supports_bw: regSupportsBw,
          supports_color: regSupportsColor,
        }),
      });

      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.detail || "Registration failed");
      }

      saveToken(body.token);
      setToken(body.token);
      tokenRef.current = body.token;
      setSlug(body.shop.slug);
      setRegPassword("");
      try {
        window.sessionStorage.setItem("printshop_last_shop", body.shop.slug);
        window.history.replaceState({}, "", `?shop-admin=${encodeURIComponent(body.shop.slug)}`);
      } catch (_) {}

    } catch (err) {
      setRegError(err.message || "Registration failed");
    } finally {
      setRegistering(false);
    }
  };

  // ----------------------------------------------------------- order actions
  const act = async (orderNumber, action, payload) => {
    setBusy(orderNumber);
    setRowMessage((prev) => ({ ...prev, [orderNumber]: "" }));

    try {
      const response = await fetch(
        `${apiUrl}/api/shop-admin/orders/${encodeURIComponent(orderNumber)}/${action}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${tokenRef.current}`,
          },
          body: payload ? JSON.stringify(payload) : undefined,
        }
      );

      const body = await response.json();

      if (response.status === 401) {
        logout();
        return;
      }

      if (!response.ok) {
        throw new Error(body.detail || "Action failed");
      }

      if (action === "handover") {
        setCodes((prev) => ({ ...prev, [orderNumber]: "" }));
      }

      load();
    } catch (err) {
      setRowMessage((prev) => ({
        ...prev,
        [orderNumber]: err.message || "Action failed",
      }));
    } finally {
      setBusy("");
    }
  };

  const copyCustomerLink = () => {
    const activeSlug = data?.shop?.slug || data?.shop_slug || slug;
    const link = `${window.location.origin}/?shop=${encodeURIComponent(activeSlug)}`;
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  // =========================================================================
  // VIEW: AUTHENTICATION SCREEN (LOGIN & REGISTER)
  // =========================================================================
  const orders = data?.orders || [];
  const collectedOrders = data?.collected || [];

  // Combine orders
  const allOrders = useMemo(() => {
    const map = new Map();
    [...orders, ...collectedOrders].forEach((o) => {
      map.set(o.order_number, o);
    });
    return Array.from(map.values()).sort((a, b) => {
      const dateA = new Date(getOrderDate(a) || 0).getTime();
      const dateB = new Date(getOrderDate(b) || 0).getTime();
      return dateB - dateA;
    });
  }, [orders, collectedOrders]);

  const matchesDate = (order, filter) => {
    if (filter === "all") return true;
    const raw = getOrderDate(order);
    if (!raw) return true;
    let str = String(raw).replace(" ", "T");
    if (!str.endsWith("Z") && !str.includes("+")) str += "Z";
    const d = new Date(str);
    if (isNaN(d.getTime())) return true;

    const now = new Date();
    if (filter === "today") {
      return d.toDateString() === now.toDateString();
    }
    if (filter === "yesterday") {
      const yesterday = new Date();
      yesterday.setDate(now.getDate() - 1);
      return d.toDateString() === yesterday.toDateString();
    }
    if (filter === "week") {
      const weekAgo = new Date();
      weekAgo.setDate(now.getDate() - 7);
      weekAgo.setHours(0, 0, 0, 0);
      return d >= weekAgo;
    }
    return true;
  };

  // Orders filtered by the active date range
  const dateFilteredOrders = useMemo(() => {
    return allOrders.filter((o) => matchesDate(o, dateFilter));
  }, [allOrders, dateFilter]);

  const dateFilteredActive = useMemo(() => {
    return orders.filter((o) => matchesDate(o, dateFilter));
  }, [orders, dateFilter]);

  const dateFilteredCollected = useMemo(() => {
    return collectedOrders.filter((o) => matchesDate(o, dateFilter));
  }, [collectedOrders, dateFilter]);

  // Counts by category within the selected date range
  const queuedCount = dateFilteredActive.filter((o) => o.order_status === "QUEUED").length;
  const printingCount = dateFilteredActive.filter((o) => o.order_status === "PRINTING").length;
  const printedCount = dateFilteredActive.filter((o) => o.order_status === "PRINTED").length;
  const readyCount = dateFilteredActive.filter((o) => o.order_status === "READY").length;
  const failedCount = dateFilteredActive.filter((o) => o.order_status === "FAILED").length;
  const collectedCount = dateFilteredCollected.length;
  const activeTotal = dateFilteredActive.length;

  // Filter orders according to active folder tab, date filter & search query
  const displayedOrders = useMemo(() => {
    let list = dateFilteredOrders;

    // Filter by Folder Tab
    if (activeFolder === "all_active") {
      list = dateFilteredActive;
    } else if (activeFolder === "QUEUED") {
      list = dateFilteredActive.filter((o) => o.order_status === "QUEUED");
    } else if (activeFolder === "PRINTING") {
      list = dateFilteredActive.filter((o) => o.order_status === "PRINTING");
    } else if (activeFolder === "READY") {
      list = dateFilteredActive.filter((o) => o.order_status === "READY");
    } else if (activeFolder === "ACTION") {
      list = dateFilteredActive.filter((o) => ["PRINTED", "FAILED"].includes(o.order_status));
    } else if (activeFolder === "COLLECTED") {
      list = dateFilteredCollected;
    }

    // Filter by Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((o) => o.order_number.toLowerCase().includes(q));
    }

    return list;
  }, [dateFilteredOrders, dateFilteredActive, dateFilteredCollected, activeFolder, searchQuery]);

  // Dynamic KPI Metrics (based on selected date filter)
  const dateFilteredRevenue = useMemo(() => {
    return dateFilteredOrders.reduce((sum, o) => sum + (Number(o.price) || 0), 0);
  }, [dateFilteredOrders]);

  const dateFilteredPages = useMemo(() => {
    return dateFilteredOrders.reduce(
      (sum, o) => sum + (Number(o.total_printed_pages) || Number(o.pages) || 0),
      0
    );
  }, [dateFilteredOrders]);

  const dateLabel = {
    all: "TOTAL",
    today: "TODAY'S",
    yesterday: "YESTERDAY'S",
    week: "LAST 7 DAYS",
  }[dateFilter] || "TOTAL";


  if (!token) {
    return (
      <div className="ps-admin-auth-wrap">
        <div className="ps-admin-auth-card">
          {/* Header */}
          <div className="ps-admin-auth-header">
            <div className="ps-admin-logo">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
            </div>
            <h1 className="ps-admin-title">PrintShop Store Portal</h1>
            <p className="ps-admin-sub">Manage your print shop, live print queue, and counter pickups</p>
          </div>

          {/* Tab Selector: Sign In vs Register */}
          <div className="ps-admin-tabs">
            <button
              type="button"
              className={`ps-admin-tab ${authTab === "login" ? "active" : ""}`}
              onClick={() => { setAuthTab("login"); setLoginError(""); }}
            >
              Shop Sign In
            </button>
            <button
              type="button"
              className={`ps-admin-tab ${authTab === "register" ? "active" : ""}`}
              onClick={() => { setAuthTab("register"); setRegError(""); }}
            >
              + Register New Shop
            </button>
          </div>

          {/* TAB 1: SIGN IN */}
          {authTab === "login" && (
            <form onSubmit={handleLogin} className="ps-admin-form">
              {loginError && <div className="ps-form-error">{loginError}</div>}

              <label className="ps-form-field">
                <span>Shop Name or Store Link</span>
                <input
                  type="text"
                  required
                  placeholder="e.g. YMCA ZEROX or ymca-zerox"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                />
                <small className="ps-field-hint">Enter your store name or the link name you chose during registration</small>
              </label>

              <label className="ps-form-field">
                <span>Shopkeeper Password</span>
                <input
                  type="password"
                  required
                  autoFocus
                  placeholder="Enter shop password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>

              <button
                type="submit"
                disabled={loggingIn || !password}
                className="ps-submit-order-btn"
              >
                {loggingIn ? "Signing In..." : "Sign In to Dashboard"}
              </button>

              <div className="ps-auth-footer-note">
                Need to create a new print shop?{" "}
                <button
                  type="button"
                  className="ps-link-btn"
                  onClick={() => { setAuthTab("register"); setRegError(""); }}
                >
                  Register your shop here
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: REGISTER NEW SHOP */}
          {authTab === "register" && (
            <form onSubmit={handleRegister} className="ps-admin-form">
              {regError && <div className="ps-form-error">{regError}</div>}

              <label className="ps-form-field">
                <span>Shop Name *</span>
                <input
                  type="text"
                  required
                  placeholder="e.g. Campus Xerox & Prints"
                  value={regName}
                  onChange={handleRegNameChange}
                />
              </label>

              <label className="ps-form-field">
                <span>Store Link / Slug *</span>
                <input
                  type="text"
                  required
                  placeholder="e.g. campus-xerox"
                  value={regSlug}
                  onChange={(e) => setRegSlug(e.target.value.trim().toLowerCase())}
                />
                <small className="ps-field-hint">Customers will order at: ?shop={regSlug || "your-shop"}</small>
              </label>

              <label className="ps-form-field">
                <span>Choose Dashboard Password *</span>
                <input
                  type="password"
                  required
                  placeholder="Minimum 4 characters"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                />
              </label>

              <div className="ps-services-checkboxes">
                <span className="ps-field-title">Printing Services Offered</span>
                <div className="ps-checkbox-group">
                  <label className="ps-checkbox-label">
                    <input
                      type="checkbox"
                      checked={regSupportsBw}
                      onChange={(e) => setRegSupportsBw(e.target.checked)}
                    />
                    <span>Black &amp; White Printing</span>
                  </label>
                  <label className="ps-checkbox-label">
                    <input
                      type="checkbox"
                      checked={regSupportsColor}
                      onChange={(e) => setRegSupportsColor(e.target.checked)}
                    />
                    <span>Colour Printing</span>
                  </label>
                </div>
              </div>

              <button
                type="submit"
                disabled={registering}
                className="ps-submit-order-btn"
              >
                {registering ? "Creating Your Shop..." : "Create Shop & Open Dashboard"}
              </button>

              <div className="ps-auth-footer-note">
                Already registered?{" "}
                <button
                  type="button"
                  className="ps-link-btn"
                  onClick={() => { setAuthTab("login"); setLoginError(""); }}
                >
                  Sign in here
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW: DASHBOARD WORKSPACE
  // =========================================================================
  return (
    <div className="ps-dashboard-root">
      {/* 1. TOPBAR */}
      <header className="ps-dashboard-topbar">
        <div className="ps-dash-topbar-inner">
          <div className="ps-dash-brand">
            <div className="ps-dash-logo">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
            </div>
            <div>
              <div className="ps-dash-shop-title">
                {data?.shop?.name || data?.shop_name || slug}
                <button
                  type="button"
                  className={`ps-dash-status-badge ${data?.shop?.is_open !== false ? "open" : "closed"}`}
                  onClick={() => {
                    setStatusIsOpen(data?.shop?.is_open !== false);
                    setStatusMessage(data?.shop?.status_message || "");
                    setStatusBackAt(data?.shop?.back_at || "");
                    setShowStatusModal(true);
                  }}
                  title="Click to toggle store availability or set break/lunch notice"
                >
                  {data?.shop?.is_open !== false ? (
                    <>
                      <span className="ps-pulse-dot" />
                      <span>Live • Open</span>
                      <span className="ps-badge-edit-hint">Change ⚙️</span>
                    </>
                  ) : (
                    <>
                      <span className="ps-closed-dot" />
                      <span>Away / Closed</span>
                      <span className="ps-badge-edit-hint">Change ⚙️</span>
                    </>
                  )}
                </button>
              </div>
              <div className="ps-dash-link-row">
                <button type="button" className="ps-dash-copy-btn" onClick={copyCustomerLink} title="Copy your customer ordering link to clipboard">
                  {copiedLink ? "✓ Copied!" : "📋 Copy Link"}
                </button>
                <a
                  href={`/?shop=${encodeURIComponent(data?.shop?.slug || data?.shop_slug || slug)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="ps-dash-visit-btn"
                  title="Open this shop's customer ordering page in a new tab"
                >
                  Open Store ↗
                </a>
                <button
                  type="button"
                  className="ps-dash-rates-btn"
                  onClick={() => {
                    setShowPricingModal(true);
                    loadPricing();
                  }}
                  title="Click to customize your print rates"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "4px 10px",
                    background: "#f8fafc",
                    borderRadius: 6,
                    fontSize: "0.82rem",
                    color: "#334155",
                    cursor: "pointer",
                    border: "1px solid #cbd5e1",
                    marginLeft: 4,
                  }}
                >
                  Rates: <strong>B&W ₹{data?.shop?.bw_rate !== undefined ? data.shop.bw_rate : pricingBw}</strong> · <strong>Colour ₹{data?.shop?.color_rate !== undefined ? data.shop.color_rate : pricingColor}</strong> ✏️
                </button>
              </div>
            </div>
          </div>

          <div className="ps-dash-top-actions">
            <button
              type="button"
              className="ps-dash-pricing-btn"
              onClick={() => {
                setShowPricingModal(true);
                loadPricing();
              }}
              title="Set your store's per-page printing charges"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                borderRadius: 8,
                background: "#fef3c7",
                color: "#92400e",
                border: "1px solid #fde68a",
                fontWeight: 600,
                fontSize: "0.85rem",
                cursor: "pointer",
              }}
            >
              💰 Set Prices
            </button>
            <button
              type="button"
              className={`ps-dash-availability-btn ${data?.shop?.is_open === false ? "is-closed" : "is-open"}`}
              onClick={() => {
                setStatusIsOpen(data?.shop?.is_open !== false);
                setStatusMessage(data?.shop?.status_message || "");
                setStatusBackAt(data?.shop?.back_at || "");
                setShowStatusModal(true);
              }}
              title="Change your store's live availability status"
            >
              {data?.shop?.is_open === false ? "⏸️ Store is Away" : "🟢 Store is Open"}
            </button>
            <button
              type="button"
              className="ps-dash-printer-btn"
              onClick={() => {
                setShowPrinterModal(true);
                loadPrinters();
              }}
              title="Configure B&W and Color printers connected to this PC (USB or Wi-Fi)"
            >
              🖨️ Printer Setup
            </button>
            <button
              type="button"
              className="ps-dash-slip-btn"
              onClick={() => {
                setShowSlipModal(true);
                loadSlipConfig();
              }}
              title="Customize your Order Slip Receipt & Shop Advertisement"
            >
              🧾 Order Slip & Ads
            </button>
            <button
              type="button"
              className="ps-dash-qr-btn"
              onClick={() => setShowQr(true)}
            >
              📱 Counter QR Code
            </button>
            <button
              type="button"
              className="ps-dash-delete-btn"
              onClick={() => {
                setDeleteConfirmText("");
                setDeleteError("");
                setShowDeleteModal(true);
              }}
              title="Permanently delete this registered shop"
            >
              🗑️ Delete Store
            </button>
            <button
              type="button"
              className="ps-dash-logout-btn"
              onClick={logout}
            >
              Log Out
            </button>
          </div>
        </div>
      </header>

      {/* 2. MAIN DASHBOARD CONTAINER */}
      <main className="ps-dash-main">
        {/* Closed / Away Warning Strip */}
        {data?.shop?.is_open === false && (
          <div className="ps-dash-alert-closed">
            <div className="ps-alert-closed-icon">⏸️</div>
            <div className="ps-alert-closed-info">
              <strong>Your Store is Currently AWAY / CLOSED</strong>
              <p>
                {data?.shop?.status_message || "Online customer orders are paused."}
                {data?.shop?.back_at && <span> (Expected back at: <strong>{data?.shop?.back_at}</strong>)</span>}
              </p>
            </div>
            <button
              type="button"
              className="ps-reopen-btn"
              onClick={handleQuickReopen}
            >
              🟢 Re-Open Store Now
            </button>
          </div>
        )}

        {/* KPI Summary Cards */}
        <div className="ps-kpi-grid">
          <div className="ps-kpi-card">
            <span className="ps-kpi-label">Active Orders</span>
            <div className="ps-kpi-value text-blue">{activeTotal}</div>
            <span className="ps-kpi-sub">{queuedCount} queued • {printingCount} printing</span>
          </div>

          <div className="ps-kpi-card">
            <span className="ps-kpi-label">Ready for Pickup</span>
            <div className="ps-kpi-value text-green">{readyCount}</div>
            <span className="ps-kpi-sub">Waiting for customer code</span>
          </div>

          <div className="ps-kpi-card">
            <span className="ps-kpi-label">{dateLabel} PRINTED PAGES</span>
            <div className="ps-kpi-value text-slate">{dateFilteredPages}</div>
            <span className="ps-kpi-sub">Total pages processed</span>
          </div>

          <div className="ps-kpi-card">
            <span className="ps-kpi-label">{dateLabel} REVENUE</span>
            <div className="ps-kpi-value text-emerald">₹{dateFilteredRevenue.toFixed(2)}</div>
            <span className="ps-kpi-sub">
              {dateFilteredOrders.length} {dateFilteredOrders.length === 1 ? "order" : "orders"} paid
            </span>
          </div>
        </div>

        {/* 3. ORDER FOLDERS & TOOLBAR */}
        <div className="ps-orders-folder-card">
          <div className="ps-folder-header">
            {/* Top Toolbar Row: Search + Date Filters */}
            <div className="ps-dash-toolbar-top">
              {/* Search Input */}
              <div className="ps-dash-search-box">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  placeholder="Search order # (e.g. PS-10025)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button type="button" className="ps-clear-search-btn" onClick={() => setSearchQuery("")}>
                    ✕
                  </button>
                )}
              </div>

              {/* Date Filter Buttons */}
              <div className="ps-date-filter-group">
                <span className="ps-date-filter-label">📅 DATE:</span>
                <button
                  type="button"
                  className={`ps-date-pill ${dateFilter === "all" ? "active" : ""}`}
                  onClick={() => setDateFilter("all")}
                >
                  All Dates
                </button>
                <button
                  type="button"
                  className={`ps-date-pill ${dateFilter === "today" ? "active" : ""}`}
                  onClick={() => setDateFilter("today")}
                >
                  Today
                </button>
                <button
                  type="button"
                  className={`ps-date-pill ${dateFilter === "yesterday" ? "active" : ""}`}
                  onClick={() => setDateFilter("yesterday")}
                >
                  Yesterday
                </button>
                <button
                  type="button"
                  className={`ps-date-pill ${dateFilter === "week" ? "active" : ""}`}
                  onClick={() => setDateFilter("week")}
                >
                  Last 7 Days
                </button>
              </div>
            </div>

            {/* Folder Tabs */}
            <div className="ps-folder-tabs">
              <button
                type="button"
                className={`ps-folder-tab ${activeFolder === "all_active" ? "active" : ""}`}
                onClick={() => setActiveFolder("all_active")}
              >
                All Active <span className="ps-tab-count">{activeTotal}</span>
              </button>

              <button
                type="button"
                className={`ps-folder-tab ${activeFolder === "READY" ? "active" : ""}`}
                onClick={() => setActiveFolder("READY")}
              >
                Ready for Pickup <span className="ps-tab-count green">{readyCount}</span>
              </button>

              <button
                type="button"
                className={`ps-folder-tab ${activeFolder === "QUEUED" ? "active" : ""}`}
                onClick={() => setActiveFolder("QUEUED")}
              >
                In Queue <span className="ps-tab-count amber">{queuedCount}</span>
              </button>

              <button
                type="button"
                className={`ps-folder-tab ${activeFolder === "PRINTING" ? "active" : ""}`}
                onClick={() => setActiveFolder("PRINTING")}
              >
                Printing <span className="ps-tab-count blue">{printingCount}</span>
              </button>

              <button
                type="button"
                className={`ps-folder-tab ${activeFolder === "ACTION" ? "active" : ""}`}
                onClick={() => setActiveFolder("ACTION")}
              >
                Action Needed <span className="ps-tab-count purple">{printedCount + failedCount}</span>
              </button>

              <button
                type="button"
                className={`ps-folder-tab ${activeFolder === "COLLECTED" ? "active" : ""}`}
                onClick={() => setActiveFolder("COLLECTED")}
              >
                Handed Over <span className="ps-tab-count">{collectedCount}</span>
              </button>
            </div>
          </div>

          {/* 4. SCROLLABLE GRID CONTAINER (Handles 10 to 1000 orders cleanly!) */}
          <div className="ps-orders-grid-scroll-wrap">
            {displayedOrders.length === 0 ? (
              <div className="ps-orders-empty-state">
                <div className="ps-empty-icon">📭</div>
                <h3 className="ps-empty-title">No orders in this folder</h3>
                <p className="ps-empty-sub">
                  {searchQuery
                    ? `No orders matching "${searchQuery}".`
                    : "Orders in this status will automatically appear here."}
                </p>
              </div>
            ) : (
              <div className="ps-orders-grid">
                {displayedOrders.map((order) => {
                  const status = order.order_status;
                  const isBusy = busy === order.order_number;
                  const rowMsg = rowMessage[order.order_number];

                  return (
                    <div key={order.order_number} className="ps-order-grid-card">
                      {/* Top Row: Order # and Status Pill */}
                      <div className="ps-card-top-row">
                        <strong className="ps-order-num">{order.order_number}</strong>
                        <span
                          className="ps-order-status-badge"
                          style={{
                            color: STATUS_COLOR[status] || "#475569",
                            background: STATUS_BG[status] || "#f1f5f9",
                          }}
                        >
                          {status === "PRINTING" && <span className="ps-pulse-dot" />}
                          {STATUS_LABEL[status] || status}
                        </span>
                      </div>

                      {/* Order Date & Time Row */}
                      <div className="ps-card-time-row">
                        <span className="ps-card-time-icon">🕒</span>
                        <span className="ps-card-time-text">{formatCardDate(order.created_at)}</span>
                        {status === "COLLECTED" && order.collected_at && (
                          <span className="ps-card-collected-time">• Handed over: {formatCardDate(order.collected_at)}</span>
                        )}
                        {status === "READY" && order.ready_at && (
                          <span className="ps-card-ready-time">• Ready: {formatCardDate(order.ready_at)}</span>
                        )}
                      </div>

                      {/* Document Details */}
                      <div className="ps-order-spec-block">
                        <div className="ps-spec-line">
                          <span className={`ps-type-tag ${order.print_type === "color" ? "color" : "bw"}`}>
                            {order.print_type === "color" ? "Colour" : "Black & White"}
                          </span>
                          <span className="ps-spec-text">
                            {order.paper_size || "A4"} • {DUPLEX_LABEL[order.duplex] || "Single-sided"}
                          </span>
                        </div>

                        <div className="ps-spec-count">
                          {order.selected_pages} pgs × {order.copies} {order.copies === 1 ? "copy" : "copies"} ={" "}
                          <strong>{order.total_printed_pages} total pages</strong>
                        </div>

                        <div className="ps-order-card-price">
                          ₹{Number(order.price).toFixed(2)}
                        </div>
                      </div>

                      {/* Error or Message banner */}
                      {status === "FAILED" && order.failure_reason && (
                        <div className="ps-order-card-error">
                          {order.failure_reason}
                        </div>
                      )}

                      {rowMsg && (
                        <div className="ps-order-card-error">
                          {rowMsg}
                        </div>
                      )}

                      {/* Action Controls for this Order */}
                      <div className="ps-order-action-footer">
                        {status === "PRINTED" && (
                          <button
                            type="button"
                            className="ps-btn-verify-ready"
                            disabled={isBusy}
                            onClick={() => act(order.order_number, "ready")}
                          >
                            {isBusy ? "Updating..." : "✓ Verified, Ready for Pickup"}
                          </button>
                        )}

                        {status === "READY" && (
                          <div className="ps-handover-box">
                            <span className="ps-handover-label">Enter Customer Pickup Code:</span>
                            <div className="ps-handover-input-row">
                              <input
                                type="text"
                                maxLength={8}
                                placeholder="Code"
                                value={codes[order.order_number] || ""}
                                onChange={(e) =>
                                  setCodes((prev) => ({
                                    ...prev,
                                    [order.order_number]: e.target.value.toUpperCase(),
                                  }))
                                }
                              />
                              <button
                                type="button"
                                className="ps-btn-handover"
                                disabled={isBusy || !(codes[order.order_number] || "").trim()}
                                onClick={() =>
                                  act(order.order_number, "handover", {
                                    pickup_code: codes[order.order_number] || "",
                                  })
                                }
                              >
                                {isBusy ? "Verifying..." : "Hand Over"}
                              </button>
                            </div>
                          </div>
                        )}

                        {status === "FAILED" && (
                          <button
                            type="button"
                            className="ps-btn-retry"
                            disabled={isBusy}
                            onClick={() => act(order.order_number, "retry")}
                          >
                            {isBusy ? "Retrying..." : "🔄 Retry Print"}
                          </button>
                        )}

                        {status === "QUEUED" && (
                          <span className="ps-waiting-note">⚡ Waiting for printer...</span>
                        )}

                        {status === "PRINTING" && (
                          <span className="ps-waiting-note blue">🖨️ Printing in progress...</span>
                        )}

                        {status === "COLLECTED" && (
                          <span className="ps-collected-tag">✓ Completed &amp; Collected</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* 8. PRINTER CONFIGURATION MODAL */}
      {showPrinterModal && (
        <div className="ps-modal-backdrop" onClick={() => !savingPrinters && setShowPrinterModal(false)}>
          <div className="ps-modal-card ps-printer-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ps-modal-header">
              <div className="ps-status-modal-title">
                <div className="ps-status-modal-icon" style={{ background: "#eff6ff", color: "#2563eb" }}>🖨️</div>
                <div>
                  <h3 style={{ margin: 0 }}>Printer Setup & Routing</h3>
                  <p className="ps-status-modal-sub" style={{ margin: "4px 0 0" }}>
                    Configure which connected USB or Wi-Fi printer prints Black & White vs. Color documents.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="ps-modal-close"
                disabled={savingPrinters}
                onClick={() => setShowPrinterModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSavePrinters} className="ps-printer-modal-body">
              {printerFeedback && (
                <div className={`ps-status-feedback-msg ${printerFeedback.startsWith("✓") ? "success" : "error"}`}>
                  {printerFeedback}
                </div>
              )}

              {/* Pendrive-style filter: Only show real, physically connected & online hardware printers */}
              {(() => {
                const realPrinters = (detectedPrinters || []).filter(
                  (p) =>
                    p.is_online &&
                    !p.connection_type?.toLowerCase().includes("virtual") &&
                    p.badge_color !== "slate" &&
                    p.badge_color !== "red" &&
                    !["pdf", "onenote", "xps", "fax", "writer"].some((v) =>
                      (p.name || "").toLowerCase().includes(v)
                    )
                );
                const selectedBw = realPrinters.find((p) => p.name === bwPrinter);
                const isBwOnline = selectedBw ? Boolean(selectedBw.is_online) : (bwPrinter ? false : true);
                const selectedColor = realPrinters.find((p) => p.name === colorPrinter);
                const isColorOnline = selectedColor ? Boolean(selectedColor.is_online) : (colorPrinter ? false : true);

                return (
                  <>
                    {/* Detected Printers Section */}
                    <div className="ps-printer-section">
                      <div className="ps-printer-section-header">
                        <strong>Connected Devices Detected ({realPrinters.length})</strong>
                        <button
                          type="button"
                          className="ps-printer-refresh-btn"
                          disabled={loadingPrinters}
                          onClick={() => loadPrinters(true)}
                        >
                          {loadingPrinters ? "Scanning..." : "🔄 Refresh Devices"}
                        </button>
                      </div>

                      {loadingPrinters && realPrinters.length === 0 ? (
                        <div className="ps-printer-loading">
                          <div className="ps-spinner" />
                          <span>Detecting connected USB and Wi-Fi printers...</span>
                        </div>
                      ) : realPrinters.length === 0 ? (
                        <div className="ps-printer-empty">
                          <span>🔌 No physical printers connected. Please connect your USB cable or connect via Wi-Fi.</span>
                        </div>
                      ) : (
                        <div className="ps-printer-list">
                          {realPrinters.map((p, idx) => (
                            <div key={idx} className="ps-printer-device-card green">
                              <div className="ps-printer-device-info">
                                <div className="ps-printer-device-title-row">
                                  <span className="ps-printer-device-name">🖨️ {p.name}</span>
                                  <span className="ps-printer-status-pill green">
                                    <span className="ps-printer-pulse-dot green" />
                                    {p.status_text || "Connected & Ready"}
                                  </span>
                                </div>
                                <span className="ps-printer-device-port">Port: {p.port || "Standard"} • {p.connection_type}</span>
                              </div>
                              <span className={`ps-printer-conn-tag ${p.connection_type.toLowerCase().includes("usb") ? "usb" : "wifi"}`}>
                                {p.connection_type.includes("USB") ? "🔌 USB" : "📶 Wi-Fi"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Assignment Form */}
                    <div className="ps-printer-config-grid">
                      {/* B&W Printer */}
                      <div className="ps-printer-field-card">
                        <div className="ps-printer-field-header">
                          <div>
                            <span className="ps-printer-field-title">⚫ Black & White (B&W) Printer</span>
                            <p className="ps-printer-field-desc">Used for standard documents, Xerox, and mono print jobs</p>
                          </div>
                        </div>
                        <div className="ps-printer-field-inputs">
                          <select
                            className="ps-input"
                            value={bwPrinter}
                            onChange={(e) => setBwPrinter(e.target.value)}
                          >
                            {detectedPrinters.length === 0 ? (
                              <option value="">-- No Physical Printers Installed --</option>
                            ) : (
                              <>
                                <option value="">-- Auto-Detect Default Windows Printer --</option>
                                {detectedPrinters.map((p, i) => (
                                  <option key={i} value={p.name}>
                                    {p.is_online ? "🟢" : "🔴"} {p.name} ({p.connection_type}) • {p.is_online ? "Ready" : "Disconnected"}
                                  </option>
                                ))}
                              </>
                            )}
                          </select>
                          <button
                            type="button"
                            className="ps-btn-test-print"
                            disabled={!bwPrinter || testingPrinter === "bw" || realPrinters.length === 0 || !isBwOnline}
                            onClick={() => handleTestPrint(bwPrinter, "bw")}
                            title={realPrinters.length === 0 ? "No printer connected" : !bwPrinter ? "Select a printer first" : "Send test print"}
                          >
                            {testingPrinter === "bw" ? "Printing..." : "Test B&W 🖨️"}
                          </button>
                        </div>
                        {bwPrinter && !isBwOnline && (
                          <p className="ps-printer-warning-hint">
                            ⚠️ Selected printer is currently disconnected. Connect USB cable to test.
                          </p>
                        )}
                      </div>

                      {/* Color Printer */}
                      <div className="ps-printer-field-card">
                        <div className="ps-printer-field-header">
                          <div>
                            <span className="ps-printer-field-title">🎨 Color & Photo Printer</span>
                            <p className="ps-printer-field-desc">Used for colour brochures, presentations, and photo paper</p>
                          </div>
                        </div>
                        <div className="ps-printer-field-inputs">
                          <select
                            className="ps-input"
                            value={colorPrinter}
                            onChange={(e) => setColorPrinter(e.target.value)}
                          >
                            {detectedPrinters.length === 0 ? (
                              <option value="">-- No Physical Printers Installed --</option>
                            ) : (
                              <>
                                <option value="">-- Same as B&W / Default Printer --</option>
                                {detectedPrinters.map((p, i) => (
                                  <option key={i} value={p.name}>
                                    {p.is_online ? "🟢" : "🔴"} {p.name} ({p.connection_type}) • {p.is_online ? "Ready" : "Disconnected"}
                                  </option>
                                ))}
                              </>
                            )}
                          </select>
                          <button
                            type="button"
                            className="ps-btn-test-print"
                            disabled={!colorPrinter || testingPrinter === "color" || realPrinters.length === 0 || !isColorOnline}
                            onClick={() => handleTestPrint(colorPrinter, "color")}
                            title={realPrinters.length === 0 ? "No printer connected" : !colorPrinter ? "Select a printer first" : "Send test print"}
                          >
                            {testingPrinter === "color" ? "Printing..." : "Test Color 🎨"}
                          </button>
                        </div>
                        {colorPrinter && !isColorOnline && (
                          <p className="ps-printer-warning-hint">
                            ⚠️ Selected printer is currently disconnected. Connect USB cable to test.
                          </p>
                        )}
                      </div>
                    </div>
                  </>
                );
              })()}

              {/* Auto Print Toggle */}
              <div className="ps-printer-toggle-box">
                <label className="ps-printer-toggle-label">
                  <input
                    type="checkbox"
                    checked={autoPrint}
                    onChange={(e) => setAutoPrint(e.target.checked)}
                    className="ps-printer-checkbox"
                  />
                  <div>
                    <strong>⚡ Automatic Silent Printing</strong>
                    <p style={{ margin: "2px 0 0", fontSize: "0.82rem", color: "var(--text-muted)" }}>
                      Automatically send new orders directly to the designated printer when customer payment is verified.
                    </p>
                  </div>
                </label>
              </div>

              <div className="ps-modal-actions" style={{ padding: "16px 24px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  className="ps-btn-secondary"
                  disabled={savingPrinters}
                  onClick={() => setShowPrinterModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="ps-btn-primary"
                  disabled={savingPrinters}
                >
                  {savingPrinters ? "Saving Setup..." : "Save Printer Setup"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6.5 ORDER SLIP & ADVERTISEMENT CUSTOMIZER MODAL */}
      {showSlipModal && (
        <div className="ps-modal-backdrop" onClick={() => !savingSlip && setShowSlipModal(false)}>
          <div className="ps-modal-card ps-slip-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ps-modal-header">
              <div className="ps-status-modal-title">
                <div className="ps-status-modal-icon" style={{ background: "#e0e7ff", color: "#4338ca" }}>🧾</div>
                <div>
                  <h3 style={{ margin: 0 }}>Order Slip & Shop Advertisement</h3>
                  <p className="ps-status-modal-sub" style={{ margin: "4px 0 0" }}>
                    Configure what prints on the front slip of customer documents. Auto-generated customer info is protected.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="ps-modal-close"
                disabled={savingSlip}
                onClick={() => setShowSlipModal(false)}
              >
                ✕
              </button>
            </div>

            {slipFeedback && (
              <div className={`ps-slip-feedback-strip ${slipFeedback.startsWith("✓") ? "success" : "warning"}`}>
                {slipFeedback}
              </div>
            )}

            <div className="ps-slip-modal-layout">
              {/* Left Column: Form Controls */}
              <form className="ps-slip-form-col" onSubmit={handleSaveSlipConfig}>
                <div className="ps-slip-section-card">
                  <div className="ps-slip-card-head">
                    <div className="ps-slip-card-head-title">
                      <span className="ps-slip-card-icon">🖼️</span>
                      <div>
                        <h4 className="ps-slip-section-title">Shop Logo or Advertisement Banner</h4>
                        <p className="ps-slip-section-desc">Appears in the header and receipt banner of every customer print job.</p>
                      </div>
                    </div>
                  </div>
                  
                  {slipConfig.has_logo && slipConfig.logo_url ? (
                    <div className="ps-slip-logo-preview-box">
                      <div className="ps-slip-logo-thumb-wrap">
                        <img
                          src={resolveLogoUrl(slipConfig.logo_url)}
                          alt="Shop Logo"
                          className="ps-slip-logo-img"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                            const fallback = e.currentTarget.parentElement?.querySelector(".ps-slip-logo-fallback");
                            if (fallback) fallback.style.display = "flex";
                          }}
                        />
                        <div className="ps-slip-logo-fallback" style={{ display: "none" }}>
                          <span>🖼️ Logo Uploaded</span>
                        </div>
                      </div>
                      <div className="ps-slip-logo-meta">
                        <span className="ps-slip-logo-badge">Active Logo</span>
                        <span className="ps-slip-logo-hint">Will print cleanly on slips & receipts</span>
                      </div>
                      <div className="ps-slip-logo-actions">
                        <input
                          type="file"
                          id="slip-logo-replace-input"
                          accept="image/png, image/jpeg, image/jpg, image/webp"
                          style={{ display: "none" }}
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              handleLogoUpload(e.target.files[0]);
                            }
                          }}
                        />
                        <label htmlFor="slip-logo-replace-input" className="ps-slip-btn-sm-secondary">
                          {uploadingLogo ? "Uploading..." : "Change Logo"}
                        </label>
                        <button
                          type="button"
                          className="ps-slip-logo-remove-btn"
                          onClick={handleDeleteLogo}
                          title="Remove this logo"
                        >
                          ✕ Remove
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="ps-slip-logo-upload-dropzone">
                      <input
                        type="file"
                        id="slip-logo-input"
                        accept="image/png, image/jpeg, image/jpg, image/webp"
                        style={{ display: "none" }}
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            handleLogoUpload(e.target.files[0]);
                          }
                        }}
                      />
                      <label htmlFor="slip-logo-input" className="ps-slip-upload-label">
                        <div className="ps-slip-upload-icon">📁</div>
                        <div className="ps-slip-upload-text">
                          <span className="ps-slip-upload-main">
                            {uploadingLogo ? "Uploading..." : "Click to Upload Shop Logo"}
                          </span>
                          <span className="ps-slip-upload-sub">Supports PNG, JPG, or WEBP (transparent background recommended, max 5MB)</span>
                        </div>
                      </label>
                    </div>
                  )}
                </div>

                <div className="ps-slip-section-card">
                  <div className="ps-slip-card-head">
                    <div className="ps-slip-card-head-title">
                      <span className="ps-slip-card-icon">📢</span>
                      <div>
                        <h4 className="ps-slip-section-title">Shop Branding & Tagline</h4>
                        <p className="ps-slip-section-desc">Displayed at the top of your slip for store identity and recognition.</p>
                      </div>
                    </div>
                  </div>

                  <div className="ps-slip-form-fields">
                    <div className="ps-form-group">
                      <label className="ps-label">
                        <span>Shop Subtitle / Tagline</span>
                        <span className="ps-label-hint">Header Subtitle</span>
                      </label>
                      <input
                        type="text"
                        className="ps-input"
                        placeholder="e.g. In-Store Pickup • Digital Print & Xerox Counter"
                        value={slipConfig.tagline || ""}
                        onChange={(e) => setSlipConfig({ ...slipConfig, tagline: e.target.value })}
                        maxLength={120}
                      />
                      <span className="ps-field-helper">Prints directly below your shop name in the header banner.</span>
                    </div>

                    <div className="ps-form-group">
                      <label className="ps-label">
                        <span>Special Offer / Discount Highlight Badge</span>
                        <span className="ps-label-badge-optional">Optional</span>
                      </label>
                      <input
                        type="text"
                        className="ps-input"
                        placeholder="e.g. Special Student Discount: Flat 10% Off on Thesis Binding!"
                        value={slipConfig.offers_badge || ""}
                        onChange={(e) => setSlipConfig({ ...slipConfig, offers_badge: e.target.value })}
                        maxLength={120}
                      />
                      <span className="ps-field-helper">Printed in a high-visibility highlighted banner on the order slip.</span>
                    </div>
                  </div>
                </div>

                <div className="ps-slip-section-card">
                  <div className="ps-slip-card-head">
                    <div className="ps-slip-card-head-title">
                      <span className="ps-slip-card-icon">⭐</span>
                      <div>
                        <h4 className="ps-slip-section-title">Services & Promotional Message</h4>
                        <p className="ps-slip-section-desc">Promote your other counter services to customers.</p>
                      </div>
                    </div>
                  </div>

                  <div className="ps-slip-form-fields">
                    <div className="ps-form-group">
                      <label className="ps-label">
                        <span>Promotional Section Headline</span>
                      </label>
                      <input
                        type="text"
                        className="ps-input"
                        placeholder="e.g. SPECIAL SERVICES & EXCLUSIVE OFFERS"
                        value={slipConfig.promo_title || ""}
                        onChange={(e) => setSlipConfig({ ...slipConfig, promo_title: e.target.value })}
                        maxLength={120}
                      />
                    </div>

                    <div className="ps-form-group">
                      <label className="ps-label">
                        <span>Services & Offers List</span>
                        <span className="ps-label-hint">One item per line</span>
                      </label>
                      <textarea
                        className="ps-textarea"
                        rows={4}
                        placeholder="• High-Speed Bulk Xerox & Color Prints&#10;• Hardcover Project & Thesis Spiral Binding&#10;• Instant Passport Size Photos (6 copies in 5 mins)&#10;• Lamination, ID Cards & Framing"
                        value={slipConfig.promo_body || ""}
                        onChange={(e) => setSlipConfig({ ...slipConfig, promo_body: e.target.value })}
                      />
                      <span className="ps-field-helper">Each line will print as a clean bullet item on customer slips.</span>
                    </div>
                  </div>
                </div>

                <div className="ps-slip-section-card">
                  <div className="ps-slip-card-head">
                    <div className="ps-slip-card-head-title">
                      <span className="ps-slip-card-icon">📞</span>
                      <div>
                        <h4 className="ps-slip-section-title">Counter Contact & Location</h4>
                        <p className="ps-slip-section-desc">Make it effortless for customers to find your counter and call you.</p>
                      </div>
                    </div>
                  </div>

                  <div className="ps-slip-form-fields">
                    <div className="ps-slip-grid-2col">
                      <div className="ps-form-group">
                        <label className="ps-label">
                          <span>Counter Phone / WhatsApp</span>
                        </label>
                        <input
                          type="text"
                          className="ps-input"
                          placeholder="e.g. +91 98765 43210"
                          value={slipConfig.contact_phone || ""}
                          onChange={(e) => setSlipConfig({ ...slipConfig, contact_phone: e.target.value })}
                          maxLength={50}
                        />
                      </div>
                      <div className="ps-form-group">
                        <label className="ps-label">
                          <span>Counter Email</span>
                          <span className="ps-label-badge-optional">Optional</span>
                        </label>
                        <input
                          type="email"
                          className="ps-input"
                          placeholder="e.g. balajiprint@example.com"
                          value={slipConfig.contact_email || ""}
                          onChange={(e) => setSlipConfig({ ...slipConfig, contact_email: e.target.value })}
                          maxLength={100}
                        />
                      </div>
                    </div>

                    <div className="ps-form-group">
                      <label className="ps-label">
                        <span>Counter Landmark / Floor Location</span>
                      </label>
                      <input
                        type="text"
                        className="ps-input"
                        placeholder="e.g. Shop #4, Ground Floor, Near Student Center"
                        value={slipConfig.counter_address || ""}
                        onChange={(e) => setSlipConfig({ ...slipConfig, counter_address: e.target.value })}
                        maxLength={255}
                      />
                      <span className="ps-field-helper">Helps walk-in customers locate your physical counter quickly.</span>
                    </div>

                    <div
                      className={`ps-slip-qr-toggle-card ${slipConfig.show_qr_code ? "checked" : ""}`}
                      onClick={() => setSlipConfig({ ...slipConfig, show_qr_code: !slipConfig.show_qr_code })}
                    >
                      <div className="ps-slip-qr-checkbox-wrap">
                        <input
                          type="checkbox"
                          id="slip-qr-check"
                          checked={slipConfig.show_qr_code}
                          onChange={(e) => setSlipConfig({ ...slipConfig, show_qr_code: e.target.checked })}
                          onClick={(e) => e.stopPropagation()}
                          className="ps-slip-checkbox"
                        />
                      </div>
                      <div className="ps-slip-qr-toggle-body">
                        <div className="ps-slip-qr-toggle-title">
                          <span>📱 Include Counter QR Code on Slip</span>
                          <span className={`ps-slip-badge-status ${slipConfig.show_qr_code ? "active" : ""}`}>
                            {slipConfig.show_qr_code ? "Enabled" : "Disabled"}
                          </span>
                        </div>
                        <p className="ps-slip-qr-toggle-sub">
                          Prints your shop's online ordering QR code on every slip so customers can easily scan & re-order.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="ps-slip-form-actions">
                  <button
                    type="button"
                    className="ps-btn-slip-cancel"
                    disabled={savingSlip}
                    onClick={() => setShowSlipModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="ps-btn-slip-save"
                    disabled={savingSlip}
                  >
                    {savingSlip ? "Saving Changes..." : "💾 Save Advertisement Settings"}
                  </button>
                </div>
              </form>

              {/* Right Column: Live Visual Preview */}
              <div className="ps-slip-preview-col">
                <div className="ps-slip-preview-header">
                  <div>
                    <span className="ps-preview-title">Live Order Slip Preview</span>
                    <span className="ps-preview-sub">Simulated customer order on A4 paper</span>
                  </div>
                  <button
                    type="button"
                    className="ps-btn-open-pdf"
                    onClick={handleOpenPdfPreview}
                    disabled={previewingPdf}
                    title="Generate and view exact printable PDF in new tab"
                  >
                    {previewingPdf ? "Generating..." : "📄 View PDF Slip ↗"}
                  </button>
                </div>

                {/* Simulated Slip Card */}
                <div className="ps-live-slip-sheet">
                  {/* Outer double border emulation */}
                  <div className="ps-live-slip-inner">
                    {/* Header */}
                    <div className="ps-live-slip-header">
                      <div className="ps-live-slip-brand">
                        {slipConfig.has_logo && slipConfig.logo_url && (
                          <img
                            src={resolveLogoUrl(slipConfig.logo_url)}
                            alt="Logo"
                            className="ps-live-slip-thumb-logo"
                            onError={(e) => { e.currentTarget.style.display = "none"; }}
                          />
                        )}
                        <div>
                          <strong className="ps-live-shop-name">{data?.shop?.name || slug}</strong>
                          <div className="ps-live-shop-tagline">{slipConfig.tagline || "Store Pickup • Digital Print & Xerox Counter"}</div>
                        </div>
                      </div>
                      <div className="ps-live-slip-badge">
                        <strong className="ps-live-order-badge">ORDER #PS-10001</strong>
                        <div className="ps-live-order-time">Today, {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                    </div>

                    {/* Customer Info Card (Protected) */}
                    <div className="ps-live-cust-card">
                      <div className="ps-live-cust-card-title">
                        <span>🔒 CUSTOMER & ORDER SPECIFICATIONS</span>
                        <span className="ps-live-paid-tag">✓ PAID ONLINE</span>
                      </div>
                      <div className="ps-live-cust-grid">
                        <div>
                          <div>Customer: <strong>Sanjeet Kumar</strong></div>
                          <div>Mobile: <strong>+91-XXXXXX8436</strong></div>
                          <div>Pickup Code: <strong>YZ3257</strong></div>
                        </div>
                        <div>
                          <div>Document: <strong>Project_Report.pdf</strong></div>
                          <div>Settings: <strong>1 Copy • B&W • Single-sided</strong></div>
                          <div>Total Paid: <strong>₹15.00</strong></div>
                        </div>
                      </div>
                    </div>

                    {/* Perforation Line */}
                    <div className="ps-live-perforation">
                      <span>- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -</span>
                    </div>

                    {/* Advertisement Section */}
                    <div className="ps-live-ad-section">
                      <h4 className="ps-live-ad-title">{slipConfig.promo_title || "SPECIAL SERVICES & EXCLUSIVE OFFERS"}</h4>

                      {slipConfig.offers_badge && (
                        <div className="ps-live-offers-banner">
                          ⚡ {slipConfig.offers_badge}
                        </div>
                      )}

                      <div className="ps-live-services-list">
                        {(slipConfig.promo_body || "• High-Speed Bulk Xerox & Color Prints\n• Hardcover Project & Thesis Spiral Binding\n• Instant Passport Photos & Lamination")
                          .split("\n")
                          .filter(Boolean)
                          .map((line, i) => (
                            <div key={i} className="ps-live-service-line">{line}</div>
                          ))}
                      </div>

                      <div className="ps-live-footer-row">
                        <div className="ps-live-contact-box">
                          <strong className="ps-live-contact-title">STORE CONTACT & PICKUP LOCATION:</strong>
                          <div>📞 Phone / WhatsApp: <strong>{slipConfig.contact_phone || "+91 98765 43210"}</strong></div>
                          <div>📍 Counter: <strong>{slipConfig.counter_address || "Ground Floor Counter"}</strong></div>
                          {slipConfig.contact_email && <div>✉️ Email: {slipConfig.contact_email}</div>}
                        </div>

                        {slipConfig.show_qr_code && (
                          <div className="ps-live-qr-box">
                            <img
                              src={`${apiUrl}/api/shops/${encodeURIComponent(data?.shop?.slug || data?.shop_slug || slug)}/qr.png`}
                              alt="Counter QR"
                              className="ps-live-qr-img"
                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                            <span>Scan to Re-order!</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Receipt Footer */}
                    <div className="ps-live-slip-footer">
                      Thank you for choosing {data?.shop?.name || slug}! • Keep this slip with your order.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 💰 CUSTOM PRINT PRICING MODAL */}
      {showPricingModal && (
        <div className="ps-modal-backdrop" onClick={() => !savingPricing && setShowPricingModal(false)}>
          <div className="ps-modal-card ps-pricing-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520, borderRadius: 16 }}>
            <div className="ps-modal-header" style={{ borderBottom: "1px solid #e2e8f0", padding: "16px 20px" }}>
              <div className="ps-status-modal-title" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "#fef3c7", color: "#b45309", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.3rem" }}>💰</div>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700, color: "#0f172a" }}>Print Pricing & Rates</h3>
                  <p style={{ margin: "3px 0 0", color: "#64748b", fontSize: "0.83rem" }}>
                    Configure your shop's per-page printing rates. Customers will be billed automatically.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="ps-modal-close"
                disabled={savingPricing}
                onClick={() => setShowPricingModal(false)}
                style={{ background: "none", border: "none", fontSize: "1.2rem", cursor: "pointer", color: "#64748b" }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSavePricing} style={{ padding: "20px" }}>
              {pricingFeedback && (
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: 8,
                    marginBottom: 16,
                    fontSize: "0.88rem",
                    fontWeight: 600,
                    background: pricingFeedback.startsWith("✓") ? "#ecfdf5" : "#fef2f2",
                    color: pricingFeedback.startsWith("✓") ? "#065f46" : "#b91c1c",
                    border: `1px solid ${pricingFeedback.startsWith("✓") ? "#a7f3d0" : "#fecaca"}`,
                  }}
                >
                  {pricingFeedback}
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {/* B&W Price Input */}
                <div style={{ background: "#f8fafc", padding: "14px 16px", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <label style={{ fontWeight: 700, color: "#1e293b", fontSize: "0.93rem", display: "flex", alignItems: "center", gap: 6 }}>
                      <span>⚫</span> Black & White (B&W) Rate
                    </label>
                    <span style={{ fontSize: "0.78rem", color: "#64748b", fontWeight: 500 }}>per single page</span>
                  </div>
                  <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                    <span style={{ position: "absolute", left: 14, fontWeight: 700, color: "#64748b", fontSize: "1.1rem" }}>₹</span>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      max="100"
                      value={pricingBw}
                      onChange={(e) => setPricingBw(e.target.value)}
                      required
                      style={{
                        width: "100%",
                        padding: "10px 12px 10px 34px",
                        fontSize: "1.15rem",
                        fontWeight: 700,
                        border: "1.5px solid #cbd5e1",
                        borderRadius: 8,
                        background: "#fff",
                        color: "#0f172a",
                      }}
                    />
                  </div>
                  <p style={{ margin: "6px 0 0", fontSize: "0.78rem", color: "#64748b" }}>
                    Standard xerox & documents. Example: 10 pages = ₹{(Number(pricingBw || 0) * 10).toFixed(2)}
                  </p>
                </div>

                {/* Color Price Input */}
                <div style={{ background: "#f8fafc", padding: "14px 16px", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <label style={{ fontWeight: 700, color: "#1e293b", fontSize: "0.93rem", display: "flex", alignItems: "center", gap: 6 }}>
                      <span>🎨</span> Colour Print Rate
                    </label>
                    <span style={{ fontSize: "0.78rem", color: "#64748b", fontWeight: 500 }}>per single page</span>
                  </div>
                  <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                    <span style={{ position: "absolute", left: 14, fontWeight: 700, color: "#64748b", fontSize: "1.1rem" }}>₹</span>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      max="200"
                      value={pricingColor}
                      onChange={(e) => setPricingColor(e.target.value)}
                      required
                      style={{
                        width: "100%",
                        padding: "10px 12px 10px 34px",
                        fontSize: "1.15rem",
                        fontWeight: 700,
                        border: "1.5px solid #cbd5e1",
                        borderRadius: 8,
                        background: "#fff",
                        color: "#0f172a",
                      }}
                    />
                  </div>
                  <p style={{ margin: "6px 0 0", fontSize: "0.78rem", color: "#64748b" }}>
                    Colour presentations & photo paper. Example: 5 pages = ₹{(Number(pricingColor || 0) * 5).toFixed(2)}
                  </p>
                </div>

                {/* Counter Handling Fee */}
                <div style={{ background: "#f8fafc", padding: "14px 16px", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <label style={{ fontWeight: 700, color: "#1e293b", fontSize: "0.93rem", display: "flex", alignItems: "center", gap: 6 }}>
                      <span>📦</span> Counter Handling Fee
                    </label>
                    <span style={{ fontSize: "0.78rem", color: "#64748b", fontWeight: 500 }}>per order (optional)</span>
                  </div>
                  <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                    <span style={{ position: "absolute", left: 14, fontWeight: 700, color: "#64748b", fontSize: "1.1rem" }}>₹</span>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      max="50"
                      value={pricingHandling}
                      onChange={(e) => setPricingHandling(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "10px 12px 10px 34px",
                        fontSize: "1.15rem",
                        fontWeight: 700,
                        border: "1.5px solid #cbd5e1",
                        borderRadius: 8,
                        background: "#fff",
                        color: "#0f172a",
                      }}
                    />
                  </div>
                  <p style={{ margin: "6px 0 0", fontSize: "0.78rem", color: "#64748b" }}>
                    Flat packaging or order processing fee added to final total. Set 0 for free.
                  </p>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22 }}>
                <button
                  type="button"
                  disabled={savingPricing}
                  onClick={() => setShowPricingModal(false)}
                  style={{
                    padding: "9px 18px",
                    borderRadius: 8,
                    border: "1px solid #cbd5e1",
                    background: "#fff",
                    color: "#334155",
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: "0.9rem",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingPricing}
                  style={{
                    padding: "9px 24px",
                    borderRadius: 8,
                    background: "#2563eb",
                    color: "#fff",
                    border: "none",
                    cursor: "pointer",
                    fontWeight: 700,
                    fontSize: "0.9rem",
                    boxShadow: "0 2px 4px rgba(37,99,235,0.2)",
                  }}
                >
                  {savingPricing ? "Saving..." : "Save Prices ✓"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. DELETE STORE CONFIRMATION MODAL */}
      {showDeleteModal && (
        <div className="ps-modal-backdrop" onClick={() => !deletingShop && setShowDeleteModal(false)}>
          <div className="ps-modal-card ps-delete-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ps-modal-header danger">
              <div className="ps-status-modal-title">
                <div className="ps-status-modal-icon danger" style={{ background: "#fee2e2", color: "#dc2626" }}>⚠️</div>
                <div>
                  <h3 style={{ color: "#dc2626", margin: 0 }}>Delete Registered Shop</h3>
                  <p className="ps-status-modal-sub" style={{ margin: "4px 0 0" }}>
                    Permanently delete <strong>{data?.shop?.name || slug}</strong> from PrintShop.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="ps-modal-close"
                disabled={deletingShop}
                onClick={() => setShowDeleteModal(false)}
              >
                ✕
              </button>
            </div>

            <div className="ps-delete-modal-body">
              <div className="ps-delete-warning-box">
                <p style={{ margin: 0 }}>
                  <strong>Warning:</strong> This action cannot be undone. All incoming print orders,
                  order history, and customer links for this store will be permanently erased.
                </p>
              </div>

              {deleteError && (
                <div className="ps-status-feedback-msg error">
                  {deleteError}
                </div>
              )}

              <p className="ps-delete-instruction" style={{ margin: 0 }}>
                To confirm deletion, please type the store link name: <strong style={{ userSelect: "all", background: "#f1f5f9", padding: "2px 6px", borderRadius: "4px" }}>{data?.shop?.slug || slug}</strong>
              </p>

              <input
                type="text"
                className="ps-input"
                placeholder={data?.shop?.slug || slug}
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                disabled={deletingShop}
                style={{ width: "100%", padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: "6px" }}
              />
            </div>

            <div className="ps-modal-actions" style={{ padding: "16px 24px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                className="ps-btn-secondary"
                disabled={deletingShop}
                onClick={() => setShowDeleteModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ps-btn-danger"
                disabled={deletingShop || deleteConfirmText.trim().toLowerCase() !== (data?.shop?.slug || slug).toLowerCase()}
                onClick={handleDeleteShop}
              >
                {deletingShop ? "Deleting Store..." : "Permanently Delete Store"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. STORE AVAILABILITY & NOTICE MODAL */}
      {showStatusModal && (
        <div className="ps-modal-backdrop" onClick={() => setShowStatusModal(false)}>
          <div className="ps-modal-card ps-status-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ps-modal-header">
              <div className="ps-status-modal-title">
                <div className="ps-status-modal-icon">🏪</div>
                <div>
                  <h3>Store Availability & Customer Notice</h3>
                  <p className="ps-status-modal-sub">
                    Controls whether customers can place orders and shows them your availability.
                  </p>
                </div>
              </div>
              <button type="button" className="ps-modal-close" onClick={() => setShowStatusModal(false)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveStatus} className="ps-status-form">
              {statusFeedback && (
                <div className={`ps-status-feedback-msg ${statusFeedback.startsWith("✓") ? "success" : "error"}`}>
                  {statusFeedback}
                </div>
              )}

              {/* STATUS TOGGLE */}
              <div className="ps-status-toggle-group">
                <label className="ps-status-label">Store State</label>
                <div className="ps-status-radio-options">
                  <button
                    type="button"
                    className={`ps-status-radio-card ${statusIsOpen ? "selected" : ""}`}
                    onClick={() => {
                      setStatusIsOpen(true);
                      setStatusMessage("");
                      setStatusBackAt("");
                    }}
                  >
                    <div className="ps-radio-indicator">
                      <div className="ps-pulse-dot" />
                    </div>
                    <div className="ps-radio-details">
                      <strong>Open & Accepting Orders</strong>
                      <span>Store is live. Customers can upload and place orders.</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    className={`ps-status-radio-card ${!statusIsOpen ? "selected away" : ""}`}
                    onClick={() => {
                      setStatusIsOpen(false);
                      if (!statusMessage) {
                        setStatusMessage("Stepped out temporarily, back soon!");
                      }
                    }}
                  >
                    <div className="ps-radio-indicator">
                      <div className="ps-closed-dot" />
                    </div>
                    <div className="ps-radio-details">
                      <strong>Temporarily Away / Closed</strong>
                      <span>Orders paused. Customers see your notice & back time.</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* QUICK PRESETS */}
              <div className="ps-presets-wrap">
                <label className="ps-status-label">Quick 1-Click Presets</label>
                <div className="ps-preset-pills">
                  <button
                    type="button"
                    className="ps-preset-pill"
                    onClick={() => applyPreset("lunch")}
                  >
                    🍱 Lunch Break (30 min)
                  </button>
                  <button
                    type="button"
                    className="ps-preset-pill"
                    onClick={() => applyPreset("tea")}
                  >
                    ☕ Quick Break (15 min)
                  </button>
                  <button
                    type="button"
                    className="ps-preset-pill"
                    onClick={() => applyPreset("busy")}
                  >
                    🏃 Counter Rush (10 min)
                  </button>
                  <button
                    type="button"
                    className="ps-preset-pill"
                    onClick={() => applyPreset("closed")}
                  >
                    🌙 Closed for Today
                  </button>
                  <button
                    type="button"
                    className="ps-preset-pill open-preset"
                    onClick={() => applyPreset("open")}
                  >
                    🟢 Re-Open Now
                  </button>
                </div>
              </div>

              {/* CUSTOM NOTICE INPUT */}
              <div className="ps-status-input-block">
                <label className="ps-form-field">
                  <span>Notice Shown to Customers</span>
                  <input
                    type="text"
                    placeholder="e.g. Taking lunch break, back soon! Or: Power backup charging..."
                    value={statusMessage}
                    onChange={(e) => setStatusMessage(e.target.value)}
                    disabled={statusIsOpen}
                  />
                  <small className="ps-field-hint">
                    {statusIsOpen ? "Active when store is set to away/closed." : "This text will appear in a prominent banner on the customer page."}
                  </small>
                </label>
              </div>

              {/* EXPECTED BACK TIME INPUT */}
              <div className="ps-status-input-block">
                <label className="ps-form-field">
                  <span>Expected Return Time (Optional)</span>
                  <input
                    type="text"
                    placeholder="e.g. 2:30 PM, or in 20 minutes"
                    value={statusBackAt}
                    onChange={(e) => setStatusBackAt(e.target.value)}
                    disabled={statusIsOpen}
                  />
                  <small className="ps-field-hint">
                    Customers will know exactly when you'll be back to resume printing.
                  </small>
                </label>
              </div>

              {/* ACTIONS */}
              <div className="ps-status-modal-actions">
                <button
                  type="button"
                  className="ps-btn-secondary"
                  onClick={() => setShowStatusModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="ps-btn-primary"
                  disabled={savingStatus}
                >
                  {savingStatus ? "Saving..." : "Save Store Status"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. COUNTER QR CODE MODAL */}
      {showQr && (
        <div className="ps-modal-backdrop" onClick={() => setShowQr(false)}>
          <div className="ps-modal-card ps-qr-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ps-modal-header">
              <h3>Shop Counter QR Code</h3>
              <button type="button" className="ps-modal-close" onClick={() => setShowQr(false)}>
                ✕
              </button>
            </div>
            <div className="ps-qr-content">
              <img
                src={`${apiUrl}/api/shops/${encodeURIComponent(slug)}/qr.png`}
                alt="Shop QR code"
                className="ps-qr-image"
              />
              <p className="ps-qr-link">{`${window.location.origin}/?shop=${slug}`}</p>
              <p className="ps-qr-instruction">
                Print or place this QR code at your shop counter so walk-in customers can scan and upload files instantly.
              </p>
              <button
                type="button"
                className="ps-btn-primary"
                style={{ width: "100%", marginTop: "14px" }}
                onClick={() => window.print()}
              >
                Print QR Code Poster
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
