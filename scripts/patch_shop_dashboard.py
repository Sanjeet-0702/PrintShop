with open("frontend/src/components/ShopDashboard.jsx", "r", encoding="utf-8") as f:
    text = f.read()

# 1. Update initialAuthTab to support ?tab=register and ?tab=login
old_auth_init = """  // Auth State
  const [authTab, setAuthTab] = useState("login"); // "login" | "register"
  const [slug, setSlug] = useState(initialSlug);"""

new_auth_init = """  // Auth State
  const tabParam = params.get("tab") || "";
  const initialAuthTab = (tabParam === "register" || params.get("signup") !== null || params.get("register") !== null) ? "register" : "login";
  const [authTab, setAuthTab] = useState(initialAuthTab); // "login" | "register"
  const [slug, setSlug] = useState(initialSlug);"""

if old_auth_init in text:
    text = text.replace(old_auth_init, new_auth_init)
    print("Updated initialAuthTab")
else:
    print("Could not find old_auth_init")

# 2. Add useEffect to respond to url tab changes
old_use_effect = """  useEffect(() => {
    if (!token) return undefined;
    load();"""

new_use_effect = """  useEffect(() => {
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
    load();"""

if old_use_effect in text:
    text = text.replace(old_use_effect, new_use_effect)
    print("Added URL tab watcher")
else:
    print("Could not find old_use_effect")

# 3. Update handleTestPrint to check is_online
old_test_print = """  const handleTestPrint = async (targetPrinter, testType) => {
    if (!targetPrinter) {
      setPrinterFeedback("Please select a printer first to test.");
      return;
    }
    setTestingPrinter(testType);"""

new_test_print = """  const handleTestPrint = async (targetPrinter, testType) => {
    if (!targetPrinter) {
      setPrinterFeedback("Please select a printer first to test.");
      return;
    }
    const targetInfo = (detectedPrinters || []).find((p) => (p.name || "").toLowerCase() === targetPrinter.toLowerCase());
    if (targetInfo && !targetInfo.is_online) {
      setPrinterFeedback(`Error: Printer '${targetPrinter}' is disconnected from your laptop. Please plug in the USB cable and turn the printer ON.`);
      return;
    }
    setTestingPrinter(testType);"""

if old_test_print in text:
    text = text.replace(old_test_print, new_test_print)
    print("Updated handleTestPrint online pre-check")
else:
    print("Could not find old_test_print")

# 4. Update dropdowns to list all detected printers with green/red status
old_bw_dropdown = """                          <select
                            className="ps-input"
                            value={bwPrinter}
                            onChange={(e) => setBwPrinter(e.target.value)}
                          >
                            {realPrinters.length === 0 ? (
                              <option value="">-- No Connected Printers Found --</option>
                            ) : (
                              <>
                                <option value="">-- Auto-Detect Default Windows Printer --</option>
                                {realPrinters.map((p, i) => (
                                  <option key={i} value={p.name}>
                                    🟢 {p.name} ({p.connection_type}) • Ready
                                  </option>
                                ))}
                              </>
                            )}
                          </select>"""

new_bw_dropdown = """                          <select
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
                          </select>"""

if old_bw_dropdown in text:
    text = text.replace(old_bw_dropdown, new_bw_dropdown)
    print("Updated bw dropdown options")
else:
    print("Could not find old_bw_dropdown")

old_color_dropdown = """                          <select
                            className="ps-input"
                            value={colorPrinter}
                            onChange={(e) => setColorPrinter(e.target.value)}
                          >
                            {realPrinters.length === 0 ? (
                              <option value="">-- No Connected Printers Found --</option>
                            ) : (
                              <>
                                <option value="">-- Same as B&W / Default Printer --</option>
                                {realPrinters.map((p, i) => (
                                  <option key={i} value={p.name}>
                                    🟢 {p.name} ({p.connection_type}) • Ready
                                  </option>
                                ))}
                              </>
                            )}
                          </select>"""

new_color_dropdown = """                          <select
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
                          </select>"""

if old_color_dropdown in text:
    text = text.replace(old_color_dropdown, new_color_dropdown)
    print("Updated color dropdown options")
else:
    print("Could not find old_color_dropdown")

with open("frontend/src/components/ShopDashboard.jsx", "w", encoding="utf-8") as f:
    f.write(text)
print("Saved ShopDashboard.jsx")

