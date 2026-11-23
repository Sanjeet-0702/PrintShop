import React, { useEffect, useState } from "react";
import { CheckIcon } from "./Icons";

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
  COLLECTED: "Handed over. Thank you for using PrintShop!",
  FAILED: "Printing could not be completed. Please check with the shop counter.",
};

const FINISHED = ["COLLECTED", "FAILED"];

export default function ConfirmedOrderView({ apiUrl, order, shop, onReset }) {
  const [currentOrder, setCurrentOrder] = useState(order);
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    if (order) setCurrentOrder(order);
  }, [order]);

  // Background polling for live print status
  useEffect(() => {
    if (!currentOrder?.order_number || !currentOrder?.pickup_code) return;
    if (FINISHED.includes(currentOrder.order_status)) return;

    let cancelled = false;
    const fetchStatus = async () => {
      try {
        const res = await fetch(
          `${apiUrl}/api/orders/${encodeURIComponent(currentOrder.order_number)}?pickup_code=${encodeURIComponent(currentOrder.pickup_code)}`
        );
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && data.order) {
            setCurrentOrder((prev) => ({
              ...prev,
              ...data.order,
              pickup_code: data.order.pickup_code || prev?.pickup_code || order?.pickup_code,
            }));
          }
        }
      } catch (_) {
        // Ignore background polling network errors
      }
    };

    const interval = setInterval(fetchStatus, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [apiUrl, currentOrder?.order_number, currentOrder?.pickup_code, currentOrder?.order_status]);

  const pickupCode = currentOrder?.pickup_code || order?.pickup_code || "";

  const copyPickupCode = () => {
    if (pickupCode) {
      navigator.clipboard?.writeText(pickupCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const shareWhatsApp = () => {
    if (!pickupCode) return;
    const text = `PrintShop Order Details:\nOrder ID: ${currentOrder.order_number}\nPickup Code: ${pickupCode}\nShop: ${shopDisplayName}\nShow this 4-digit code at the counter to collect your prints!`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
  };

  const status = currentOrder?.order_status || "QUEUED";
  const isFailed = status === "FAILED";
  const stepKey = status === "PAID" ? "QUEUED" : status;
  const currentIndex = STEPS.findIndex((s) => s.key === stepKey);

  // Status pill label & styling
  const statusLabel =
    status === "COLLECTED"
      ? "Collected"
      : status === "READY"
      ? "Ready for Pickup"
      : status === "PRINTED"
      ? "Printed"
      : status === "PRINTING"
      ? "Printing..."
      : isFailed
      ? "Failed"
      : "In Queue";

  const pillClass =
    status === "COLLECTED" || status === "READY"
      ? "ready"
      : isFailed
      ? "failed"
      : "active";

  const dotColor =
    status === "COLLECTED" || status === "READY"
      ? "green"
      : isFailed
      ? "red"
      : "blue";

  const bannerClass =
    status === "COLLECTED" || status === "READY"
      ? "ready"
      : isFailed
      ? "failed"
      : "";

  const stepperProgress =
    currentIndex >= 0
      ? Math.min(100, Math.max(0, (currentIndex / (STEPS.length - 1)) * 100))
      : 0;

  const shopDisplayName =
    shop?.name || currentOrder?.shop_name || "Rahul Balaji Printing Service";

  return (
    <div className="ps-confirmed-wrap">
      {/* 1. SUCCESS HEADER */}
      <div className="ps-confirmed-header">
        <div className="ps-confirmed-badge">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h1 className="ps-confirmed-title">Order Placed Successfully!</h1>
        <p className="ps-confirmed-sub">
          Order ID: <strong>{currentOrder.order_number}</strong> · {shopDisplayName}
        </p>
      </div>

      {/* 2. COMPACT HERO PICKUP CODE CARD */}
      <div className="ps-confirmed-code-card">
        <div className="ps-code-card-left">
          <span className="ps-code-card-tag">SHOW THIS CODE AT THE SHOP COUNTER</span>
          <div className="ps-code-card-val-row">
            <span className="ps-code-card-val">{pickupCode || "----"}</span>
            <button
              type="button"
              className="ps-code-card-copy-btn"
              onClick={copyPickupCode}
              title="Copy pickup code"
            >
              {copiedCode ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  <span>Copy</span>
                </>
              )}
            </button>
            <button
              type="button"
              className="ps-code-card-wa-btn"
              onClick={shareWhatsApp}
              title="Share/Save Pickup Code to WhatsApp"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
              <span>Save to WhatsApp</span>
            </button>
          </div>
        </div>

        <div className="ps-code-card-right">
          <p>
            Show this code to the store executive to collect your freshly printed documents.
          </p>
        </div>
      </div>

      {/* 3. COHESIVE LIVE STATUS CARD */}
      <div className="ps-confirmed-status-card">
        <div className="ps-status-card-header">
          <div className="ps-status-card-title">
            <span className={`ps-status-dot-pulse ${dotColor}`} />
            <strong>Live Print Status</strong>
          </div>
          <span className={`ps-status-pill ${pillClass}`}>{statusLabel}</span>
        </div>

        {/* Stepper with connecting line and nodes */}
        <div className="ps-confirm-stepper">
          <div className="ps-confirm-stepper-bg" />
          <div
            className="ps-confirm-stepper-fill"
            style={{ width: `${stepperProgress}%` }}
          />

          <div className="ps-confirm-stepper-steps">
            {STEPS.map((step, idx) => {
              const isDone = !isFailed && currentIndex > idx;
              const isActive = !isFailed && currentIndex === idx;

              return (
                <div
                  key={step.key}
                  className={`ps-confirm-step ${isDone ? "done" : ""} ${isActive ? "active" : ""}`}
                >
                  <div className="ps-confirm-step-circle">
                    {isDone ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : isActive && status === "COLLECTED" ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      idx + 1
                    )}
                  </div>
                  <span className="ps-confirm-step-text">{step.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Live Status Message Banner */}
        <div className={`ps-status-msg-banner ${bannerClass}`}>
          {STATUS_MESSAGES[status] || "Updating print status..."}
        </div>
      </div>

      {/* 4. COMPACT METRICS GRID */}
      <div className="ps-confirmed-metrics-grid">
        <div className="ps-metric-item">
          <span className="ps-metric-item-lbl">Total Amount</span>
          <strong className="ps-metric-item-val ps-price">
            ₹{Number(currentOrder.price || 0).toFixed(2)}
          </strong>
        </div>

        <div className="ps-metric-item">
          <span className="ps-metric-item-lbl">Payment Status</span>
          <strong className="ps-metric-item-val text-green">
            {currentOrder.payment_status === "PAID" ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <CheckIcon size={11} strokeWidth={1.75} /> Paid Online
              </span>
            ) : (
              "Payment Pending"
            )}
          </strong>
        </div>

        <div className="ps-metric-item">
          <span className="ps-metric-item-lbl">Collection Type</span>
          <strong className="ps-metric-item-val">Store Pickup (Free)</strong>
        </div>

        <div className="ps-metric-item">
          <span className="ps-metric-item-lbl">Shop Store</span>
          <strong className="ps-metric-item-val ps-truncate" title={shopDisplayName}>
            {shopDisplayName}
          </strong>
        </div>
      </div>

      {/* 5. PRIMARY ACTION BUTTON */}
      <button
        type="button"
        className="ps-btn-confirmed-action"
        onClick={onReset}
      >
        + Print Another Document
      </button>
    </div>
  );
}

