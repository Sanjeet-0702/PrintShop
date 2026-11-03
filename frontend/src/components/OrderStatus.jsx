import React, { useEffect, useState } from "react";

// The stages a customer sees, in order.
const STEPS = [
  { key: "QUEUED", label: "In queue" },
  { key: "PRINTING", label: "Printing" },
  { key: "PRINTED", label: "Printed" },
  { key: "READY", label: "Ready for collection" },
  { key: "COLLECTED", label: "Collected" },
];

const MESSAGES = {
  PAID: "Payment received. Your order is joining the queue.",
  QUEUED: "Your order is in the queue.",
  PRINTING: "Your document is being printed now.",
  PRINTED: "Printed. The shop is checking your order.",
  READY: "Your order is ready. Show your pickup code at the shop.",
  COLLECTED: "Collected. Thank you for using PrintShop!",
  FAILED:
    "Printing failed. Your payment is safe. Please check with the shop and show your pickup code.",
};

// Stop checking once the order has reached one of these.
const FINISHED = ["COLLECTED", "FAILED"];

export default function OrderStatus({
  apiUrl,
  orderNumber,
  pickupCode,
}) {
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");

  // feedback form
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [feedbackError, setFeedbackError] = useState("");
  const [thanks, setThanks] = useState(false);

  const orderUrl = `${apiUrl}/api/orders/${encodeURIComponent(
    orderNumber
  )}`;

  const codeQuery = `pickup_code=${encodeURIComponent(pickupCode)}`;

  // Check the order status every few seconds.
  useEffect(() => {
    let cancelled = false;
    let timer = null;

    const load = async () => {
      try {
        const response = await fetch(`${orderUrl}?${codeQuery}`);

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.detail || "Could not load status");
        }

        if (cancelled) {
          return;
        }

        setOrder(data.order);
        setError("");

        // Stop checking once the order is finished.
        if (!FINISHED.includes(data.order.order_status)) {
          timer = setTimeout(load, 3000);
        }
      } catch (err) {
        if (cancelled) {
          return;
        }

        setError(err.message || "Could not load status");
        timer = setTimeout(load, 5000);
      }
    };

    load();

    return () => {
      cancelled = true;

      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [orderUrl, codeQuery]);

  const sendFeedback = async (event) => {
    event.preventDefault();

    if (rating < 1) {
      setFeedbackError("Please choose a star rating.");
      return;
    }

    setSending(true);
    setFeedbackError("");

    try {
      const response = await fetch(`${orderUrl}/feedback?${codeQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating,
          comment: comment.trim() || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Could not send feedback");
      }

      setThanks(true);
      setOrder((previous) => ({ ...previous, rating }));
    } catch (err) {
      setFeedbackError(err.message || "Could not send feedback");
    } finally {
      setSending(false);
    }
  };

  const status = order?.order_status;
  const failed = status === "FAILED";

  // PAID is shown as the first step.
  const currentIndex = STEPS.findIndex(
    (step) => step.key === (status === "PAID" ? "QUEUED" : status)
  );

  const waiting = status === "PAID" || status === "QUEUED";

  const trackingLink = `${window.location.origin}/?track=1&order=${encodeURIComponent(
    orderNumber
  )}&code=${encodeURIComponent(pickupCode)}`;

  const messages = order?.messages || [];

  return (
    <div
      style={{
        marginTop: "16px",
        padding: "16px",
        background: "#ffffff",
        border: "1px solid #dbeafe",
        borderRadius: "12px",
        textAlign: "left",
      }}
    >
      <div
        style={{
          fontWeight: 700,
          marginBottom: "10px",
          color: "#0f172a",
        }}
      >
        Order progress
        {order?.shop_name ? (
          <span style={{ fontWeight: 400, color: "#64748b" }}>
            {" "}
            · {order.shop_name}
          </span>
        ) : null}
      </div>

      {error && !order && (
        <div style={{ color: "#b91c1c", fontSize: "14px" }}>{error}</div>
      )}

      {order && (
        <>
          {/* Steps */}
          <div style={{ display: "grid", gap: "8px" }}>
            {STEPS.map((step, index) => {
              const done =
                !failed && currentIndex >= 0 && index < currentIndex;
              const active = !failed && index === currentIndex;

              return (
                <div
                  key={step.key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    color: done || active ? "#0f172a" : "#94a3b8",
                    fontWeight: active ? 700 : 400,
                  }}
                >
                  <span
                    style={{
                      width: "22px",
                      height: "22px",
                      borderRadius: "50%",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "13px",
                      color: "#ffffff",
                      background: done
                        ? "#16a34a"
                        : active
                        ? "#2563eb"
                        : "#cbd5e1",
                    }}
                  >
                    {done || (active && status === "COLLECTED") ? "✓" : index + 1}
                  </span>

                  {step.label}
                </div>
              );
            })}
          </div>

          {/* Message */}
          <div
            style={{
              marginTop: "12px",
              fontSize: "14px",
              color: failed ? "#b91c1c" : "#334155",
            }}
          >
            {MESSAGES[status] || "Checking your order..."}
          </div>

          {/* Ready: remind the customer what to show */}
          {status === "READY" && (
            <div
              style={{
                marginTop: "12px",
                padding: "12px",
                background: "#f0fdf4",
                border: "1px solid #86efac",
                borderRadius: "10px",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "13px", color: "#166534" }}>
                Show this code at the shop
              </div>

              <div
                style={{
                  fontSize: "28px",
                  fontWeight: 800,
                  letterSpacing: "6px",
                  color: "#166534",
                }}
              >
                {pickupCode}
              </div>
            </div>
          )}

          {/* Queue information */}
          {waiting && (
            <div
              style={{
                marginTop: "6px",
                fontSize: "13px",
                color: "#64748b",
              }}
            >
              Orders ahead of you: {order.queue_ahead ?? 0} · Estimated wait:
              {" ~"}
              {order.estimated_wait_minutes ?? 0} min
            </div>
          )}

          {/* Feedback, once the order was handed over */}
          {status === "COLLECTED" &&
            (order.rating || thanks ? (
              <div
                style={{
                  marginTop: "12px",
                  padding: "12px",
                  background: "#eff6ff",
                  borderRadius: "10px",
                  color: "#1e3a8a",
                  fontSize: "14px",
                }}
              >
                Thank you for your feedback
                {order.rating ? ` (${"★".repeat(order.rating)})` : ""}! See you
                again.
              </div>
            ) : (
              <form
                onSubmit={sendFeedback}
                style={{
                  marginTop: "12px",
                  padding: "12px",
                  background: "#f8fafc",
                  borderRadius: "10px",
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: "6px" }}>
                  How was your experience?
                </div>

                <div style={{ display: "flex", gap: "4px", marginBottom: "8px" }}>
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-label={`${value} star${value > 1 ? "s" : ""}`}
                      onClick={() => setRating(value)}
                      style={{
                        background: "none",
                        border: "none",
                        fontSize: "30px",
                        lineHeight: 1,
                        cursor: "pointer",
                        color: value <= rating ? "#f59e0b" : "#cbd5e1",
                      }}
                    >
                      ★
                    </button>
                  ))}
                </div>

                <textarea
                  placeholder="Anything we can improve? (optional)"
                  maxLength={500}
                  rows={2}
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "10px",
                    fontSize: "14px",
                    border: "1px solid #cbd5e1",
                    borderRadius: "8px",
                    fontFamily: "inherit",
                  }}
                />

                {feedbackError && (
                  <div style={{ color: "#b91c1c", fontSize: "13px", marginTop: "6px" }}>
                    {feedbackError}
                  </div>
                )}

                <button
                  type="submit"
                  className="continue-button"
                  disabled={sending}
                  style={{ marginTop: "8px" }}
                >
                  {sending ? "Sending..." : "Send feedback"}
                </button>
              </form>
            ))}

          {/* Messages the customer received */}
          {messages.length > 0 && (
            <div style={{ marginTop: "14px" }}>
              <div
                style={{
                  fontSize: "13px",
                  fontWeight: 700,
                  color: "#475569",
                  marginBottom: "6px",
                }}
              >
                Messages
              </div>

              <div style={{ display: "grid", gap: "6px" }}>
                {[...messages].reverse().map((item, index) => (
                  <div
                    key={`${item.event}-${index}`}
                    style={{
                      fontSize: "13px",
                      color: "#334155",
                      padding: "8px 10px",
                      background: "#f1f5f9",
                      borderRadius: "8px",
                    }}
                  >
                    {item.message}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
