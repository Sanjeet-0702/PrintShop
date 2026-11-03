import re

with open("backend/app/shop_admin.py", "r", encoding="utf-8") as f:
    content = f.read()

# Define the replacement for printer detection
new_detection_code = '''def _get_hardware_present_device_ids() -> set[str]:
    """
    Direct Windows Configuration Manager (cfgmgr32.dll) query to retrieve
    all hardware devices currently physically plugged into this PC.
    Runs in 1-2 milliseconds, pure C API, zero external processes, immune to RPC deadlocks.
    """
    if os.name != "nt":
        return set()
    try:
        import ctypes
        from ctypes import wintypes

        cfgmgr32 = ctypes.windll.cfgmgr32
        CM_GETIDLIST_FILTER_PRESENT = 0x00000100

        pulLen = wintypes.ULONG()
        res = cfgmgr32.CM_Get_Device_ID_List_SizeW(ctypes.byref(pulLen), None, CM_GETIDLIST_FILTER_PRESENT)
        if res != 0 or pulLen.value <= 1:
            return set()

        buf = ctypes.create_unicode_buffer(pulLen.value)
        res = cfgmgr32.CM_Get_Device_ID_ListW(None, buf, pulLen.value, CM_GETIDLIST_FILTER_PRESENT)
        if res != 0:
            return set()

        raw_str = "".join(buf[:pulLen.value])
        return {s.strip().upper() for s in raw_str.split("\\x00") if s.strip()}
    except Exception as e:
        log.warning("Hardware presence query failed: %s", e)
        return set()


def get_system_printers(force: bool = False) -> list[dict]:
    """
    Detects all real physical printers installed on this Windows PC and verifies
    genuine hardware connectivity (Plug-and-Play presence).
    - If a USB printer is physically unplugged or turned off, it is flagged as Disconnected.
    - Software/virtual printers (PDF, XPS, Fax, OneNote) are strictly filtered out.
    """
    import re
    now = time.time()
    if not force and (now - _printer_cache["cached_at"] < 1.5):
        return _printer_cache["printers"]

    installed_printers = []

    # 1. Read Installed Printers directly from Windows Registry (Instant & Spooler-Deadlock Safe)
    if os.name == "nt":
        try:
            import winreg
            key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SYSTEM\\CurrentControlSet\\Control\\Print\\Printers")
            count = winreg.QueryInfoKey(key)[0]
            for i in range(count):
                pname = winreg.EnumKey(key, i)
                sub = winreg.OpenKey(key, pname)
                try:
                    port, _ = winreg.QueryValueEx(sub, "Port")
                except Exception:
                    port = ""
                try:
                    driver, _ = winreg.QueryValueEx(sub, "Printer Driver")
                except Exception:
                    driver = ""
                installed_printers.append({
                    "name": pname.strip(),
                    "port": (port or "").strip(),
                    "driver": (driver or "").strip(),
                })
        except Exception as e:
            log.warning("Registry printer query error: %s", e)

    # 2. If registry returned empty (or non-Windows), fallback to WinSpool local enum
    if not installed_printers and os.name == "nt":
        try:
            import ctypes
            from ctypes import wintypes

            class PRINTER_INFO_4(ctypes.Structure):
                _fields_ = [
                    ("pPrinterName", wintypes.LPWSTR),
                    ("pServerName", wintypes.LPWSTR),
                    ("Attributes", wintypes.DWORD),
                ]

            winspool = ctypes.WinDLL("winspool.drv")
            needed = wintypes.DWORD()
            returned = wintypes.DWORD()
            # PRINTER_ENUM_LOCAL = 2
            winspool.EnumPrintersW(2, None, 4, None, 0, ctypes.byref(needed), ctypes.byref(returned))
            if needed.value > 0:
                buf = ctypes.create_string_buffer(needed.value)
                if winspool.EnumPrintersW(2, None, 4, buf, needed.value, ctypes.byref(needed), ctypes.byref(returned)):
                    p_infos = ctypes.cast(buf, ctypes.POINTER(PRINTER_INFO_4))
                    for i in range(returned.value):
                        p = p_infos[i]
                        pname = (p.pPrinterName or "").strip()
                        if pname:
                            installed_printers.append({"name": pname, "port": "", "driver": ""})
        except Exception as e:
            log.warning("WinSpool fallback error: %s", e)

    # 3. Retrieve currently physically connected hardware devices
    present_device_ids = _get_hardware_present_device_ids()
    has_any_usb_printer = any("USBPRINT" in did for did in present_device_ids)

    results = []
    for p in installed_printers:
        name = p["name"]
        if not name:
            continue
        name_lower = name.lower()
        port = p.get("port", "")
        port_lower = port.lower()
        driver = p.get("driver", "")
        driver_lower = driver.lower()

        # Strictly exclude virtual / software printers
        is_virtual = (
            port_lower in ("nul:", "portprompt:", "")
            or any(v in name_lower for v in ("pdf", "onenote", "xps", "fax", "writer"))
            or any(v in driver_lower for v in ("pdf", "onenote", "xps", "fax", "writer"))
        )
        if is_virtual:
            continue

        port_upper = port.upper()
        is_usb = port_upper.startswith("USB")
        is_network = any(port_upper.startswith(x) for x in ("IP_", "WSD-", "HTTP")) or bool(re.match(r"^\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}", port))

        if is_usb:
            conn_type = "USB Cable"
            is_online = False
            if has_any_usb_printer:
                tokens = [t for t in re.split(r"[^A-Za-z0-9]+", name.upper()) if len(t) > 2]
                for did in present_device_ids:
                    if "USBPRINT" in did and any(t in did for t in tokens):
                        is_online = True
                        break
                if not is_online and len([x for x in installed_printers if x.get("port", "").upper().startswith("USB")]) == 1:
                    is_online = True

            status_text = "Connected & Ready" if is_online else "Disconnected / Cable Unplugged"
            badge_color = "green" if is_online else "red"

        elif is_network:
            conn_type = "Wi-Fi / Network"
            is_online = False
            status_text = "Offline / Unreachable"
            badge_color = "red"
        else:
            conn_type = "Direct Port"
            is_online = False
            status_text = "Disconnected"
            badge_color = "red"

        results.append({
            "name": name,
            "port": port,
            "driver": driver,
            "connection_type": conn_type,
            "is_online": is_online,
            "status_text": status_text,
            "badge_color": badge_color,
        })

    _printer_cache["printers"] = results
    _printer_cache["cached_at"] = now
    return results'''

# Regex replace from `def _get_connected_printers_native` down to before `class PrinterConfigRequest`
pattern = r"def _get_connected_printers_native\(\) -> list\[dict\] \| None:.*?return _printer_cache\[\"printers\"\] or \[\]\n"
if re.search(pattern, content, re.DOTALL):
    content = re.sub(pattern, lambda m: new_detection_code + "\n", content, flags=re.DOTALL)
    print("Replaced printer detection functions successfully")
else:
    print("Could not match pattern for printer detection")

# Also update test_shop_printer
test_old = '''    # 1. VERIFY PRINTER IS PHYSICALLY CONNECTED & READY
    installed_printers = get_system_printers(force=True)
    matched = next((p for p in installed_printers if p["name"].lower() == printer_name.lower()), None)
    if not matched:
        raise HTTPException(
            status_code=400,
            detail=f"Printer '{printer_name}' is not connected or turned off. Please plug in the USB/Wi-Fi cable and click Refresh Devices."
        )'''

test_new = '''    # 1. VERIFY PRINTER IS PHYSICALLY CONNECTED & READY
    installed_printers = get_system_printers(force=True)
    matched = next((p for p in installed_printers if p["name"].lower() == printer_name.lower()), None)
    if not matched or not matched.get("is_online"):
        raise HTTPException(
            status_code=400,
            detail=f"Printer '{printer_name}' is not connected to your laptop. Please plug in the USB cable and turn the printer ON, then click Refresh Devices."
        )'''

if test_old in content:
    content = content.replace(test_old, test_new)
    print("Updated test_shop_printer connectivity check")

# Update SumatraPDF command in test_shop_printer
cmd_old = '''        # Print via SumatraPDF
        cmd = [sumatra_path, "-print-to", printer_name, "-silent", test_pdf_path]
        subprocess.run(cmd, check=True, timeout=20)'''

cmd_new = '''        # Print via SumatraPDF
        cmd = [sumatra_path, "-silent", "-exit-when-done", "-print-to", printer_name, test_pdf_path]
        subprocess.run(cmd, check=True, timeout=25)'''

if cmd_old in content:
    content = content.replace(cmd_old, cmd_new)
    print("Updated test_shop_printer SumatraPDF cmd")

# Catch timeout specifically
timeout_old = '''    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"SumatraPDF exited with code {e.returncode}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Print test failed: {str(e)}")'''

timeout_new = '''    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=500, detail=f"Print test timed out. Please check that '{printer_name}' is turned ON, has paper loaded, and has no pending paper jam.")
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"SumatraPDF exited with code {e.returncode}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Print test failed: {str(e)}")'''

if timeout_old in content:
    content = content.replace(timeout_old, timeout_new)
    print("Updated test_shop_printer exception handling")

with open("backend/app/shop_admin.py", "w", encoding="utf-8") as f:
    f.write(content)
print("Saved backend/app/shop_admin.py")
