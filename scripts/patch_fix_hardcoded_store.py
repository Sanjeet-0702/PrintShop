with open("frontend/src/main.jsx", "r", encoding="utf-8") as f:
    text = f.read()

# 1. Remove hardcoded fallback to rahul-balaji-printing-service
old_slug = '''// Shop slug from URL: http://localhost:5173/?shop=rahul-balaji-printing-service
const SHOP_SLUG =
  new URLSearchParams(window.location.search).get("shop") || "rahul-balaji-printing-service";'''

new_slug = '''// Shop slug from URL: e.g. http://localhost:5173/?shop=campus-xerox
const SHOP_SLUG =
  new URLSearchParams(window.location.search).get("shop") || "";'''

if old_slug in text:
    text = text.replace(old_slug, new_slug)
    print("Replaced hardcoded SHOP_SLUG with clean URL param check")
else:
    print("Could not find old_slug")

# 2. Update loadShop useEffect to handle empty SHOP_SLUG
old_load_shop = '''  useEffect(() => {
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
        }
      } catch (err) {
        if (!cancelled) {
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
  }, []);'''

new_load_shop = '''  useEffect(() => {
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
  }, []);'''

if old_load_shop in text:
    text = text.replace(old_load_shop, new_load_shop)
    print("Updated loadShop to handle empty SHOP_SLUG")
else:
    print("Could not find old_load_shop")

# 3. Update shop tag in header
old_tag = '''              <span className="ps-shop-tag">
                📍 {shop ? shop.name : "Local Print Store"} • Store Pickup
              </span>'''

new_tag = '''              <span className="ps-shop-tag">
                {shop ? `📍 ${shop.name} • Store Pickup` : "📍 In-Store Self-Service Printing"}
              </span>'''

if old_tag in text:
    text = text.replace(old_tag, new_tag)
    print("Updated header shop tag")
else:
    print("Could not find old_tag")

# 4. Add banners for !SHOP_SLUG and shopError
old_alert_area = '''        {/* Closed / Away Warning Strip (Customer Side) */}
        {shop && shop.is_open === false && ('''

new_alert_area = '''        {/* Notice if no shop parameter in URL */}
        {!SHOP_SLUG && (
          <div className="ps-no-shop-banner">
            <div className="ps-no-shop-icon">ℹ️</div>
            <div className="ps-no-shop-content">
              <strong>No Store Selected</strong>
              <p>
                To print documents at a specific shop, please use that store's link or scan their counter QR code (e.g. <code>?shop=store-name</code>). Are you a shop owner? Use <strong>Shop Login</strong> or <strong>Sign Up</strong> above to manage your shop.
              </p>
            </div>
          </div>
        )}

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
        {shop && shop.is_open === false && ('''

if old_alert_area in text:
    text = text.replace(old_alert_area, new_alert_area)
    print("Added no-shop and shop-error banners")
else:
    print("Could not find old_alert_area")

# 5. Prevent checkout if no shop is selected
old_checkout_click = '''                        if (shop && shop.is_open === false) {
                          showToast(`⏸️ Store is currently closed: ${shop.status_message || "Orders paused"}`);
                          return;
                        }'''

new_checkout_click = '''                        if (!SHOP_SLUG || !shop) {
                          showToast("Please open your print shop's link (e.g. ?shop=store-name) or scan their counter QR code to place an order.");
                          return;
                        }
                        if (shop && shop.is_open === false) {
                          showToast(`⏸️ Store is currently closed: ${shop.status_message || "Orders paused"}`);
                          return;
                        }'''

if old_checkout_click in text:
    text = text.replace(old_checkout_click, new_checkout_click)
    print("Added checkout guard when no shop is selected")
else:
    print("Could not find old_checkout_click")

with open("frontend/src/main.jsx", "w", encoding="utf-8") as f:
    f.write(text)
print("Saved frontend/src/main.jsx")

