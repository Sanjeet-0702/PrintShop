import React from "react";
import TrackOrderModal from "./TrackOrderModal";
import "../styles.css";

export default function TrackOrderPage({ apiUrl }) {
  const params = new URLSearchParams(window.location.search);
  const initialOrder = (params.get("order") || "").toUpperCase();
  const initialCode = (params.get("code") || "").toUpperCase();

  const handleReturnHome = () => {
    window.location.href = "/";
  };

  return (
    <div className="ps-root">
      {/* 1. MODERN PRINTSHOP HEADER */}
      <header className="ps-header">
        <div className="ps-header-inner">
          <a href="/" className="ps-brand-wrap" style={{ textDecoration: "none" }}>
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
              </div>
              <span className="ps-shop-tag">Live Order Tracking</span>
            </div>
          </a>

          <div className="ps-header-actions">
            <a href="/" className="ps-header-btn ps-track-btn" style={{ textDecoration: "none" }}>
              ← New Print Order
            </a>
            <a href="?shop-admin=1&tab=login" className="ps-header-link">
              Shop Login
            </a>
            <a href="?shop-admin=1&tab=register" className="ps-header-btn ps-signup-btn">
              Sign Up
            </a>
          </div>
        </div>
      </header>

      {/* 2. MAIN TRACK ORDER WORKSPACE */}
      <main
        className="ps-main-container"
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-start",
          paddingTop: "40px",
          paddingBottom: "60px",
          minHeight: "calc(100vh - 120px)",
          boxSizing: "border-box",
        }}
      >
        <TrackOrderModal
          apiUrl={apiUrl}
          initialOrderNumber={initialOrder}
          initialPickupCode={initialCode}
          onClose={handleReturnHome}
          isPage={true}
        />
      </main>
    </div>
  );
}
