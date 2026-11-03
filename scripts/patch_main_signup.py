with open("frontend/src/main.jsx", "r", encoding="utf-8") as f:
    text = f.read()

old_header_actions = """          <div className="ps-header-actions">
            <a href="?track=1" className="ps-header-btn ps-track-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <span>Track Order</span>
            </a>
            <a href="?shop-admin=1" className="ps-header-link">
              Shop Login
            </a>
          </div>"""

new_header_actions = """          <div className="ps-header-actions">
            <a href="?track=1" className="ps-header-btn ps-track-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <span>Track Order</span>
            </a>
            <a href="?shop-admin=1&tab=login" className="ps-header-link">
              Shop Login
            </a>
            <a href="?shop-admin=1&tab=register" className="ps-header-btn ps-signup-btn">
              Sign Up
            </a>
          </div>"""

if old_header_actions in text:
    text = text.replace(old_header_actions, new_header_actions)
    print("Updated header actions with Sign Up button")
else:
    print("Could not find old_header_actions")

old_footer_links = """          <div className="ps-footer-links">
            <a href="?track=1">Track Order</a>
            <a href="?shop-admin=1">Shop Dashboard</a>
            <span>Auto-Delete File Security</span>
          </div>"""

new_footer_links = """          <div className="ps-footer-links">
            <a href="?track=1">Track Order</a>
            <a href="?shop-admin=1&tab=login">Shop Login</a>
            <a href="?shop-admin=1&tab=register">Register Shop</a>
            <span>Auto-Delete File Security</span>
          </div>"""

if old_footer_links in text:
    text = text.replace(old_footer_links, new_footer_links)
    print("Updated footer links with Register Shop")
else:
    print("Could not find old_footer_links")

with open("frontend/src/main.jsx", "w", encoding="utf-8") as f:
    f.write(text)
print("Saved frontend/src/main.jsx")

