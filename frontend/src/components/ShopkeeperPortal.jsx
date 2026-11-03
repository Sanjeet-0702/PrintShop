import React, { useState } from "react";
import TrackOrderModal from "./TrackOrderModal";

export default function ShopkeeperPortal({ apiUrl }) {
  const [showTrackModal, setShowTrackModal] = useState(false);

  return (
    <div className="ps-app-container">
      {/* ===================================================
          1. HEADER NAVIGATION
      =================================================== */}
      <header className="ps-header">
        <div className="ps-header-inner">
          <div className="ps-brand-wrap">
            <div className="ps-brand-icon">🖨️</div>
            <div className="ps-brand-text">
              <span className="ps-brand-name">
                Print<span className="ps-brand-highlight">Shop</span>
              </span>
              <span className="ps-brand-tagline">
                In-Store Self-Service Printing Platform
              </span>
            </div>
          </div>

          <div className="ps-header-actions">
            <button
              type="button"
              className="ps-header-link"
              onClick={() => setShowTrackModal(true)}
              title="Track existing print order status"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <span>Track Order</span>
            </button>

            <a
              href="?shop-admin=1&tab=login"
              className="ps-header-link"
              title="Sign in to your shop owner dashboard"
              style={{ fontWeight: 600 }}
            >
              Shop Login
            </a>

            <a
              href="?shop-admin=1&tab=register"
              className="ps-header-btn"
              title="Register a new print shop for free"
              style={{
                background: "#2563eb",
                color: "#ffffff",
                padding: "8px 16px",
                borderRadius: "8px",
                fontWeight: 700,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              Sign Up
            </a>
          </div>
        </div>
      </header>

      {/* ===================================================
          2. HERO SECTION
      =================================================== */}
      <main className="ps-main-layout" style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 20px" }}>
        <div style={{ textAlign: "center", maxWidth: 840, margin: "0 auto" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 14px",
              borderRadius: 20,
              background: "#eff6ff",
              color: "#1d4ed8",
              fontSize: "0.85rem",
              fontWeight: 700,
              marginBottom: 18,
              border: "1px solid #bfdbfe",
            }}
          >
            <span>🚀</span> Smart In-Store Self-Service Platform
          </div>

          <h1
            style={{
              fontSize: "2.8rem",
              fontWeight: 900,
              color: "#0f172a",
              lineHeight: 1.2,
              margin: "0 0 16px 0",
              letterSpacing: "-0.03em",
            }}
          >
            Turn Your Xerox Shop into a <br />
            <span style={{ color: "#2563eb" }}>Smart Self-Service Counter</span>
          </h1>

          <p
            style={{
              fontSize: "1.15rem",
              color: "#475569",
              lineHeight: 1.6,
              maxWidth: 720,
              margin: "0 auto 32px auto",
            }}
          >
            Customers scan your counter QR code on their phone, customize print settings, and pay instantly.
            Orders print automatically on your connected USB/Wi-Fi printer with zero counter rush.
          </p>

          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: 14,
              flexWrap: "wrap",
              marginBottom: 44,
            }}
          >
            <a
              href="?shop-admin=1&tab=login"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "14px 28px",
                background: "#2563eb",
                color: "#ffffff",
                borderRadius: 10,
                fontSize: "1.05rem",
                fontWeight: 700,
                textDecoration: "none",
                boxShadow: "0 4px 14px rgba(37,99,235,0.28)",
                transition: "all 0.2s ease",
              }}
            >
              <span>🏪</span> Open Shop Dashboard
            </a>

            <a
              href="?shop-admin=1&tab=register"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "14px 28px",
                background: "#ffffff",
                color: "#1e293b",
                borderRadius: 10,
                fontSize: "1.05rem",
                fontWeight: 700,
                textDecoration: "none",
                border: "1.5px solid #cbd5e1",
                boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
              }}
            >
              <span>✨</span> Register Store (Free)
            </a>
          </div>

          {/* ===================================================
              WALK-IN CUSTOMER GUIDANCE NOTICE
          =================================================== */}
          <div
            style={{
              background: "#f0fdf4",
              border: "1.5px solid #bbf7d0",
              borderRadius: 16,
              padding: "20px 24px",
              textAlign: "left",
              display: "flex",
              alignItems: "center",
              gap: 20,
              boxShadow: "0 4px 12px rgba(34,197,94,0.06)",
              marginBottom: 50,
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 12,
                background: "#dcfce7",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.8rem",
                flexShrink: 0,
              }}
            >
              📱
            </div>
            <div style={{ flex: 1 }}>
              <strong style={{ fontSize: "1.05rem", color: "#166534", display: "block", marginBottom: 3 }}>
                Are you a customer standing at a Xerox or Print Counter?
              </strong>
              <p style={{ margin: 0, fontSize: "0.92rem", color: "#15803d", lineHeight: 1.5 }}>
                To upload and print your documents, please <strong>scan the QR code placed on the counter</strong> with your phone camera. It will instantly connect you to that shop's live ordering page.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowTrackModal(true)}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                background: "#ffffff",
                border: "1px solid #86efac",
                color: "#166534",
                fontWeight: 700,
                fontSize: "0.85rem",
                cursor: "pointer",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              Track Order ↗
            </button>
          </div>
        </div>

        {/* ===================================================
            3. KEY PLATFORM FEATURES FOR SHOPKEEPERS
        =================================================== */}
        <div style={{ marginTop: 20 }}>
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <h2 style={{ fontSize: "1.85rem", fontWeight: 800, color: "#0f172a", margin: "0 0 8px 0" }}>
              Everything You Need to Automate Your Print Counter
            </h2>
            <p style={{ color: "#64748b", fontSize: "1rem", margin: 0 }}>
              Say goodbye to WhatsApp files, pendrive viruses, and endless counter queues.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))",
              gap: 20,
            }}
          >
            {/* Feature 1 */}
            <div
              style={{
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: 14,
                padding: "24px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
              }}
            >
              <div style={{ fontSize: "2rem", marginBottom: 12 }}>⚡</div>
              <h3 style={{ fontSize: "1.15rem", fontWeight: 700, color: "#0f172a", margin: "0 0 8px 0" }}>
                Automatic Silent Printing
              </h3>
              <p style={{ fontSize: "0.92rem", color: "#64748b", margin: 0, lineHeight: 1.5 }}>
                Connect your USB or Wi-Fi printers (HP, Canon, Epson). When a customer completes payment, their files print instantly without popups.
              </p>
            </div>

            {/* Feature 2 */}
            <div
              style={{
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: 14,
                padding: "24px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
              }}
            >
              <div style={{ fontSize: "2rem", marginBottom: 12 }}>📱</div>
              <h3 style={{ fontSize: "1.15rem", fontWeight: 700, color: "#0f172a", margin: "0 0 8px 0" }}>
                Printable Counter QR Code
              </h3>
              <p style={{ fontSize: "0.92rem", color: "#64748b", margin: 0, lineHeight: 1.5 }}>
                Download and print your custom counter QR poster directly from the dashboard. Paste it on your desk for effortless customer self-service.
              </p>
            </div>

            {/* Feature 3 */}
            <div
              style={{
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: 14,
                padding: "24px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
              }}
            >
              <div style={{ fontSize: "2rem", marginBottom: 12 }}>💰</div>
              <h3 style={{ fontSize: "1.15rem", fontWeight: 700, color: "#0f172a", margin: "0 0 8px 0" }}>
                100% Control Over Rates
              </h3>
              <p style={{ fontSize: "0.92rem", color: "#64748b", margin: 0, lineHeight: 1.5 }}>
                Set your store's own per-page Black & White, Colour, and handling charges. Changes reflect immediately on customer carts.
              </p>
            </div>

            {/* Feature 4 */}
            <div
              style={{
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: 14,
                padding: "24px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
              }}
            >
              <div style={{ fontSize: "2rem", marginBottom: 12 }}>🧾</div>
              <h3 style={{ fontSize: "1.15rem", fontWeight: 700, color: "#0f172a", margin: "0 0 8px 0" }}>
                Custom Slips & Shop Ads
              </h3>
              <p style={{ fontSize: "0.92rem", color: "#64748b", margin: 0, lineHeight: 1.5 }}>
                Print customer order slips featuring masked phone numbers, pickup codes, and monetize vacant space with your shop logo and offers.
              </p>
            </div>

            {/* Feature 5 */}
            <div
              style={{
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: 14,
                padding: "24px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
              }}
            >
              <div style={{ fontSize: "2rem", marginBottom: 12 }}>📊</div>
              <h3 style={{ fontSize: "1.15rem", fontWeight: 700, color: "#0f172a", margin: "0 0 8px 0" }}>
                Live Queue & Revenue Metrics
              </h3>
              <p style={{ fontSize: "0.92rem", color: "#64748b", margin: 0, lineHeight: 1.5 }}>
                Monitor active orders, ready-for-pickup queue, printed page counts, and total daily earnings in real-time.
              </p>
            </div>

            {/* Feature 6 */}
            <div
              style={{
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: 14,
                padding: "24px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
              }}
            >
              <div style={{ fontSize: "2rem", marginBottom: 12 }}>🔒</div>
              <h3 style={{ fontSize: "1.15rem", fontWeight: 700, color: "#0f172a", margin: "0 0 8px 0" }}>
                Auto-Delete File Privacy
              </h3>
              <p style={{ fontSize: "0.92rem", color: "#64748b", margin: 0, lineHeight: 1.5 }}>
                Customer documents are permanently deleted from your server the second they are printed. No disk clutter, complete privacy.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* ===================================================
          4. FOOTER
      =================================================== */}
      <footer className="ps-footer" style={{ marginTop: 60 }}>
        <div className="ps-footer-inner">
          <div className="ps-footer-brand">
            <span className="ps-brand-name">
              Print<span className="ps-brand-highlight">Shop</span>
            </span>
            <p className="ps-footer-tag">
              Smart in-store self-service printing platform for shop owners.
            </p>
          </div>
          <div className="ps-footer-links">
            <a href="?track=1" onClick={(e) => { e.preventDefault(); setShowTrackModal(true); }}>
              Track Order
            </a>
            <a href="?shop-admin=1&tab=login">Shop Login</a>
            <a href="?shop-admin=1&tab=register">Register Shop</a>
            <span>Hardware Silent Print Ready</span>
          </div>
        </div>
        <div className="ps-footer-bottom">
          <p>© {new Date().getFullYear()} PrintShop. All rights reserved. Documents are automatically erased after printing.</p>
        </div>
      </footer>

      {showTrackModal && (
        <TrackOrderModal
          apiUrl={apiUrl}
          onClose={() => setShowTrackModal(false)}
        />
      )}
    </div>
  );
}

