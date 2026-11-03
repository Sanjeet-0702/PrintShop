import React, { useEffect, useState } from "react";

const STEPS = [
  { key: "QUEUED", label: "Queued" },
  { key: "PRINTING", label: "Printing" },
  { key: "PRINTED", label: "Printed" },
  { key: "READY", label: "Ready" },
  { key: "COLLECTED", label: "Collected" },
];

const STATUS_MESSAGES = {
  PAID: "Payment received. Your order is entering the print queue.",
  QUEUED: "Order is in the queue waiting for printing.",
  PRINTING: "Your document is currently being printed.",
  PRINTED: "Printed! Shopkeeper is checking and packing your prints.",
  READY: "Ready for collection! Please show your pickup code at the counter.",
  COLLECTED: "Handed over! Thank you for using PrintShop.",
  FAILED: "Printing could not be completed. Please check with the shop counter.",
};

const FINISHED = ["COLLECTED", "FAILED"];

export default function TrackOrderModal({
  apiUrl,
  initialOrderNumber = "",
  initialPickupCode = "",
  onClose,
  isPage = false,
}) {
  const [orderNumber, setOrderNumber] = useState(initialOrderNumber);
  const [pickupCode, setPickupCode] = useState(initialPickupCode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [order, setOrder] = useState(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // Auto-search if both initial params were provided
  useEffect(() => {
    if (initialOrderNumber && initialPickupCode) {
      fetchOrder(initialOrderNumber.trim(), initialPickupCode.trim());
    }
  }, [initialOrderNumber, initialPickupCode]);

  // Polling loop when order is active
  useEffect(() => {
    if (!order) return;
    if (FINISHED.includes(order.order_status)) return;

    const timer = setInterval(() => {
      fetchOrderSilent(order.order_number, order.pickup_code);
    }, 3500);

    return () => clearInterval(timer);
  }, [order?.order_status, order?.order_number, order?.pickup_code]);

  const fetchOrder = async (ordNum, code) => {
    if (!ordNum || !code) {
      setError("Please enter both Order Number and Pickup Code.");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `${apiUrl}/api/orders/${encodeURIComponent(ordNum)}?pickup_code=${encodeURIComponent(code)}`
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Order not found. Please verify details.");
      }
      setOrder({ ...data.order, pickup_code: code });
    } catch (err) {
      setError(err.message || "Could not find order. Please verify details.");
      setOrder(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrderSilent = async (ordNum, code) => {
    try {
      const response = await fetch(
        `${apiUrl}/api/orders/${encodeURIComponent(ordNum)}?pickup_code=${encodeURIComponent(code)}`
      );
      const data = await response.json();
      if (response.ok && data.order) {
        setOrder((prev) => ({ ...prev, ...data.order }));
      }
    } catch (_) {
      // Background poll failure ignored
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchOrder(orderNumber.trim(), pickupCode.trim());
  };

  const handleCopyCode = () => {
    if (!order?.pickup_code) return;
    navigator.clipboard?.writeText(order.pickup_code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const currentStatus = order?.order_status;
  const isFailed = currentStatus === "FAILED";
  const stepKey = currentStatus === "PAID" ? "QUEUED" : currentStatus;
  const currentIndex = STEPS.findIndex((s) => s.key === stepKey);

  const modalContent = (
    <div
      className={`ps-modal-card ps-track-modal-card ${isPage ? "ps-track-page-card" : ""}`}
      onClick={(e) => e.stopPropagation()}
      style={isPage ? { maxWidth: "560px", width: "100%", margin: "0 auto", boxShadow: "var(--shadow-lg)" } : undefined}
    >
      {/* MODAL HEADER */}
      <div className="ps-modal-header ps-track-modal-header">
        <div className="ps-track-title-wrap">
          <span className="ps-track-header-icon">🔍</span>
          <div>
            <h3>Track Print Order</h3>
            <p className="ps-track-header-sub">
              Live status and store pickup code
            </p>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            className="ps-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        )}
      </div>

      {/* MODAL BODY */}
      <div className="ps-track-modal-body">
          {!order ? (
            /* SEARCH FORM */
            <form onSubmit={handleSearchSubmit} className="ps-track-search-form">
              {error && <div className="ps-form-error">{error}</div>}

              <div className="ps-track-inputs-row">
                <label className="ps-form-field">
                  <span>Order Number</span>
                  <input
                    type="text"
                    required
                    placeholder="e.g. PS-10005"
                    value={orderNumber}
                    onChange={(e) => setOrderNumber(e.target.value.toUpperCase())}
                    className="ps-mono-input"
                  />
                </label>

                <label className="ps-form-field">
                  <span>Pickup Code</span>
                  <input
                    type="text"
                    required
                    maxLength={8}
                    placeholder="e.g. L9AVT8"
                    value={pickupCode}
                    onChange={(e) => setPickupCode(e.target.value.toUpperCase())}
                    className="ps-mono-input"
                  />
                </label>
              </div>

              <button
                type="submit"
                disabled={loading || !orderNumber.trim() || !pickupCode.trim()}
                className="ps-track-submit-btn"
              >
                {loading ? "Checking Status..." : "Track Order Status →"}
              </button>
            </form>
          ) : (
            /* COMPACT ORDER STATUS DASHBOARD */
            <div className="ps-track-status-content">
              {/* TOP SUMMARY ROW */}
              <div className="ps-track-summary-strip">
                <div className="ps-track-order-meta">
                  <span className="ps-track-order-num">{order.order_number}</span>
                  <span className="ps-track-shop-name">
                    📍 {order.shop_name || "Print Store"}
                  </span>
                </div>

                <div className="ps-track-code-box" onClick={handleCopyCode} title="Click to copy pickup code">
                  <span className="ps-track-code-label">PICKUP CODE</span>
                  <div className="ps-track-code-val">
                    <strong>{order.pickup_code}</strong>
                    <span className="ps-track-copy-icon">
                      {copiedCode ? "✓" : "📋"}
                    </span>
                  </div>
                </div>
              </div>

              {/* COMPACT HORIZONTAL STEPPER */}
              <div className="ps-compact-stepper">
                <div className="ps-stepper-track-bg" />
                <div
                  className="ps-stepper-track-fill"
                  style={{
                    width: `${Math.min(100, Math.max(0, (currentIndex / (STEPS.length - 1)) * 100))}%`,
                  }}
                />

                <div className="ps-stepper-nodes">
                  {STEPS.map((step, idx) => {
                    const isDone = !isFailed && currentIndex > idx;
                    const isActive = !isFailed && currentIndex === idx;

                    return (
                      <div
                        key={step.key}
                        className={`ps-step-node ${isDone ? "done" : ""} ${isActive ? "active" : ""}`}
                      >
                        <div className="ps-step-circle">
                          {isDone ? "✓" : isActive && currentStatus === "COLLECTED" ? "✓" : idx + 1}
                        </div>
                        <span className="ps-step-text">{step.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* LIVE STATUS BANNER */}
              <div className={`ps-track-status-banner ${currentStatus === "READY" ? "ready" : isFailed ? "failed" : "normal"}`}>
                <span className="ps-status-indicator-dot" />
                <div className="ps-status-msg-text">
                  <strong>
                    {currentStatus === "READY"
                      ? "🎉 Order is Ready for Collection!"
                      : currentStatus === "COLLECTED"
                      ? "✓ Order Handed Over"
                      : currentStatus === "PRINTING"
                      ? "🖨️ Printing in Progress..."
                      : isFailed
                      ? "⚠️ Print Error"
                      : "⏳ Order Queued"}
                  </strong>
                  <p>{STATUS_MESSAGES[currentStatus] || "Updating print status..."}</p>
                </div>
              </div>

              {/* ORDER KEY METRICS (COMPACT 1-SCREEN) */}
              <div className="ps-track-quick-grid">
                <div className="ps-quick-metric">
                  <span className="ps-metric-lbl">Total Pages</span>
                  <strong>{order.total_printed_pages || order.original_pages || 1} pages</strong>
                </div>
                <div className="ps-quick-metric">
                  <span className="ps-metric-lbl">Color Mode</span>
                  <strong>{order.print_type === "color" ? "Colour" : "Black & White"}</strong>
                </div>
                <div className="ps-quick-metric">
                  <span className="ps-metric-lbl">Amount</span>
                  <strong className="ps-price-tag">₹{Number(order.price || 0).toFixed(2)}</strong>
                </div>
                <div className="ps-quick-metric">
                  <span className="ps-metric-lbl">Payment</span>
                  <strong className={order.payment_status === "PAID" ? "text-green" : "text-amber"}>
                    {order.payment_status === "PAID" ? "✓ Paid Online" : "Payment Pending"}
                  </strong>
                </div>
              </div>

              {/* FOOTER ACTIONS */}
              <div className="ps-track-footer-actions">
                <button
                  type="button"
                  className="ps-btn-track-reset"
                  onClick={() => {
                    setOrder(null);
                    setOrderNumber("");
                    setPickupCode("");
                  }}
                >
                  Track Another Order
                </button>
                <button
                  type="button"
                  className="ps-btn-track-done"
                  onClick={onClose}
                >
                  {isPage ? "← New Print Order" : "Back to Workspace"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
  );

  if (isPage) {
    return modalContent;
  }

  return (
    <div className="ps-modal-backdrop" onClick={onClose}>
      {modalContent}
    </div>
  );
}

