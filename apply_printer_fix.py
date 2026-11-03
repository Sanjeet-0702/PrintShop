# Script to apply printer online status checks and spooler queue protection
import os

# 1. Update backend/app/shop_admin.py
with open("backend/app/shop_admin.py", "r", encoding="utf-8") as f:
    shop_admin_code = f.read()

# Replace get_system_printers
old_get_printers = '''def get_system_printers() -> list[dict]:
    """
    Detects all printers connected to this Windows machine via PowerShell Get-Printer.
    Accurately detects real-time hardware status:
      - Connected & Ready (Green)
      - Connected (Load Paper) (Amber)
      - Paper Jam / Cover Open (Amber)
      - Disconnected / Turned Off (Red)
      - Ready (Virtual / PDF) (Slate)
    """
    import subprocess
    import shutil
    import json
    try:
        ps_bin = shutil.which("powershell") or r"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"
        ps_script = """
Get-Printer | ForEach-Object {
    $p = $_
    $statusStr = $p.PrinterStatus.ToString()
    $statusInt = [int]$p.PrinterStatus

    $isVirtual = ($p.PortName -in @('nul:', 'PORTPROMPT:') -or $p.Name -like '*PDF*' -or $p.Name -like '*OneNote*')
    $isOffline = ($statusStr -like '*Offline*' -or ($statusInt -band 128) -ne 0)
    $isPaperOut = ($statusStr -like '*PaperOut*' -or ($statusInt -band 16) -ne 0)

    $state = 'online'
    $badgeText = 'Connected & Ready'
    $badgeColor = 'green'

    if ($isVirtual) {
        $state = 'online'
        $badgeText = 'Ready (Virtual)'
        $badgeColor = 'slate'
    } elseif ($isOffline) {
        $state = 'offline'
        $badgeText = 'Disconnected / Turned Off'
        $badgeColor = 'red'
    } elseif ($isPaperOut) {
        $state = 'online'
        $badgeText = 'Connected (Load Paper)'
        $badgeColor = 'amber'
    } elseif ($statusStr -like '*Jam*') {
        $state = 'warning'
        $badgeText = 'Paper Jam'
        $badgeColor = 'amber'
    } elseif ($statusStr -like '*Door*') {
        $state = 'warning'
        $badgeText = 'Door / Cover Open'
        $badgeColor = 'amber'
    }

    [PSCustomObject]@{
        Name = $p.Name
        PortName = $p.PortName
        DriverName = $p.DriverName
        StatusStr = $statusStr
        StatusInt = $statusInt
        IsOnline = ($state -ne 'offline')
        State = $state
        BadgeText = $badgeText
        BadgeColor = $badgeColor
    }
} | ConvertTo-Json
"""
        res = subprocess.run([ps_bin, "-NoProfile", "-Command", ps_script], capture_output=True, text=True, timeout=12)
        if res.returncode == 0 and res.stdout.strip():
            raw = json.loads(res.stdout.strip())
            if isinstance(raw, dict):
                raw = [raw]
            printers = []
            for p in raw:
                name = (p.get("Name") or "").strip()
                if not name:
                    continue
                port = (p.get("PortName") or "").strip()
                port_upper = port.upper()
                if p.get("BadgeColor") == "slate":
                    conn = "Virtual / PDF"
                elif port_upper.startswith("USB"):
                    conn = "USB Cable"
                elif port_upper.startswith("WSD") or port_upper.startswith("IP_") or "." in port:
                    conn = "Wi-Fi / Network"
                else:
                    conn = "Direct Port"

                is_online = bool(p.get("IsOnline", True))
                badge_text = p.get("BadgeText", "Connected & Ready")
                badge_color = p.get("BadgeColor", "green")

                printers.append({
                    "name": name,
                    "port": port,
                    "driver": p.get("DriverName", ""),
                    "connection_type": conn,
                    "is_online": is_online,
                    "status_text": badge_text,
                    "badge_color": badge_color,
                })
            if printers:
                return printers
    except Exception as e:
        log.warning("Printer detection failed: %s", e)

    fallback_name = "HP LaserJet Professional P1606dn"
    return [{
        "name": fallback_name,
        "port": "USB001",
        "driver": fallback_name,
        "connection_type": "USB Cable",
        "is_online": True,
        "status_text": "Connected & Ready",
        "badge_color": "green",
    }]'''

new_get_printers = '''def get_system_printers() -> list[dict]:
    """
    Detects all printers connected to this Windows machine via PowerShell Get-Printer
    combined with Plug-and-Play (PnP) hardware presence verification.
    Accurately detects real-time physical hardware status:
      - Connected & Ready (Green)
      - Connected (Load Paper) (Amber)
      - Paper Jam / Cover Open (Amber)
      - Disconnected / Turned Off (Red)
      - Ready (Virtual / PDF) (Slate)
    """
    import subprocess
    import shutil
    import json
    try:
        ps_bin = shutil.which("powershell") or r"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"
        ps_script = """
$pnpPrinters = Get-PnpDevice -Class "Printer" -ErrorAction SilentlyContinue
$usbDevices = Get-PnpDevice -Class "USB" -ErrorAction SilentlyContinue

Get-Printer | ForEach-Object {
    $p = $_
    $port = $p.PortName
    $statusStr = $p.PrinterStatus.ToString()
    $statusInt = [int]$p.PrinterStatus

    $isVirtual = ($port -in @('nul:', 'PORTPROMPT:') -or $p.Name -like '*PDF*' -or $p.Name -like '*OneNote*' -or $p.Name -like '*XPS*')

    # Find matching PnP hardware device (USB, network, or printer class)
    $match = $pnpPrinters | Where-Object { $_.FriendlyName -eq $p.Name } | Select-Object -First 1
    if (-not $match) {
        $match = $usbDevices | Where-Object { $_.FriendlyName -like ('*' + $p.Name + '*') -or $p.Name -like ('*' + $_.FriendlyName + '*') } | Select-Object -First 1
    }

    $pnpPresent = $null
    $pnpStatus = $null
    if ($match) {
        $pnpPresent = [bool]$match.Present
        $pnpStatus = $match.Status
    }

    $state = 'online'
    $badgeText = 'Connected & Ready'
    $badgeColor = 'green'

    if ($isVirtual) {
        $state = 'online'
        $badgeText = 'Ready (Virtual)'
        $badgeColor = 'slate'
    } elseif ($match -and (-not $pnpPresent -or $pnpStatus -ne 'OK')) {
        # Physically unplugged / disconnected USB or PnP printer
        $state = 'offline'
        $badgeText = 'Disconnected / Turned Off'
        $badgeColor = 'red'
    } elseif ($statusStr -like '*Offline*' -or ($statusInt -band 128) -ne 0) {
        $state = 'offline'
        $badgeText = 'Disconnected / Turned Off'
        $badgeColor = 'red'
    } elseif ($statusStr -like '*PaperOut*' -or ($statusInt -band 16) -ne 0) {
        $state = 'online'
        $badgeText = 'Connected (Load Paper)'
        $badgeColor = 'amber'
    } elseif ($statusStr -like '*Jam*') {
        $state = 'warning'
        $badgeText = 'Paper Jam'
        $badgeColor = 'amber'
    } elseif ($statusStr -like '*Door*') {
        $state = 'warning'
        $badgeText = 'Door / Cover Open'
        $badgeColor = 'amber'
    }

    [PSCustomObject]@{
        Name = $p.Name
        PortName = $port
        DriverName = $p.DriverName
        IsOnline = ($state -ne 'offline')
        State = $state
        BadgeText = $badgeText
        BadgeColor = $badgeColor
    }
} | ConvertTo-Json
"""
        res = subprocess.run([ps_bin, "-NoProfile", "-Command", ps_script], capture_output=True, text=True, timeout=12)
        if res.returncode == 0 and res.stdout.strip():
            raw = json.loads(res.stdout.strip())
            if isinstance(raw, dict):
                raw = [raw]
            printers = []
            for p in raw:
                name = (p.get("Name") or "").strip()
                if not name:
                    continue
                port = (p.get("PortName") or "").strip()
                port_upper = port.upper()
                if p.get("BadgeColor") == "slate":
                    conn = "Virtual / PDF"
                elif port_upper.startswith("USB"):
                    conn = "USB Cable"
                elif port_upper.startswith("WSD") or port_upper.startswith("IP_") or "." in port:
                    conn = "Wi-Fi / Network"
                else:
                    conn = "Direct Port"

                is_online = bool(p.get("IsOnline", True))
                badge_text = p.get("BadgeText", "Connected & Ready")
                badge_color = p.get("BadgeColor", "green")

                printers.append({
                    "name": name,
                    "port": port,
                    "driver": p.get("DriverName", ""),
                    "connection_type": conn,
                    "is_online": is_online,
                    "status_text": badge_text,
                    "badge_color": badge_color,
                })
            if printers:
                return printers
    except Exception as e:
        log.warning("Printer detection failed: %s", e)

    return []'''

# Update test_shop_printer
old_test_func = '''@router.post("/api/shop-admin/printers/test")
def test_shop_printer(
    data: TestPrintRequest,
    shop: models.Shop = Depends(get_current_shop),
):
    """
    Prints a 1-page test sheet on the requested printer using SumatraPDF.
    """
    import tempfile
    import subprocess
    import fitz
    from . import windows_printer

    printer_name = data.printer_name.strip()
    if not printer_name:
        raise HTTPException(status_code=400, detail="Printer name is required.")

    # Locate SumatraPDF
    sumatra_path = _config.get("sumatra_path") or os.environ.get("SUMATRA_PATH") or r"C:\\Users\\DELL\\AppData\\Local\\SumatraPDF\\SumatraPDF.exe"
    if not os.path.exists(sumatra_path):
        sumatra_path = windows_printer.find_sumatra("") or sumatra_path

    if not os.path.exists(sumatra_path):
        raise HTTPException(
            status_code=500,
            detail=f"SumatraPDF executable not found. Expected at {sumatra_path}"
        )'''

new_test_func = '''@router.post("/api/shop-admin/printers/test")
def test_shop_printer(
    data: TestPrintRequest,
    shop: models.Shop = Depends(get_current_shop),
):
    """
    Prints a 1-page test sheet on the requested printer using SumatraPDF.
    Validates physical printer connectivity first so jobs don't get trapped in spooler.
    """
    import tempfile
    import subprocess
    import shutil
    import fitz
    from . import windows_printer

    printer_name = data.printer_name.strip()
    if not printer_name:
        raise HTTPException(status_code=400, detail="Printer name is required.")

    # 1. VERIFY PRINTER IS PHYSICALLY CONNECTED & READY
    installed_printers = get_system_printers()
    matched = next((p for p in installed_printers if p["name"].lower() == printer_name.lower()), None)
    if matched and not matched.get("is_online", True):
        status_msg = matched.get("status_text", "Disconnected / Turned Off")
        raise HTTPException(
            status_code=400,
            detail=f"Printer '{printer_name}' is {status_msg}. Please connect the USB/Wi-Fi cable and turn the printer ON before test printing."
        )

    # 2. CLEAR ANY LINGERING TEST JOBS IN WINDOWS SPOOLER
    try:
        clean_script = f'Get-PrintJob -PrinterName "{printer_name}" -ErrorAction SilentlyContinue | Where-Object {{ $_.DocumentName -like "*printshop_test*" }} | Remove-PrintJob -ErrorAction SilentlyContinue'
        ps_bin = shutil.which("powershell") or r"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"
        subprocess.run([ps_bin, "-NoProfile", "-Command", clean_script], capture_output=True, timeout=4)
    except Exception:
        pass

    # 3. Locate SumatraPDF
    sumatra_path = _config.get("sumatra_path") or os.environ.get("SUMATRA_PATH") or r"C:\\Users\\DELL\\AppData\\Local\\SumatraPDF\\SumatraPDF.exe"
    if not os.path.exists(sumatra_path):
        sumatra_path = windows_printer.find_sumatra("") or sumatra_path

    if not os.path.exists(sumatra_path):
        raise HTTPException(
            status_code=500,
            detail=f"SumatraPDF executable not found. Expected at {sumatra_path}"
        )'''

# Normalize and replace in shop_admin.py
crlf = "\r\n" in shop_admin_code
shop_admin_norm = shop_admin_code.replace("\r\n", "\n")
old_get_norm = old_get_printers.replace("\r\n", "\n")
new_get_norm = new_get_printers.replace("\r\n", "\n")
old_test_norm = old_test_func.replace("\r\n", "\n")
new_test_norm = new_test_func.replace("\r\n", "\n")

if old_get_norm in shop_admin_norm:
    shop_admin_norm = shop_admin_norm.replace(old_get_norm, new_get_norm, 1)
    print("shop_admin: Replaced get_system_printers")
else:
    print("Warning: old_get_printers not matched in shop_admin.py")

if old_test_norm in shop_admin_norm:
    shop_admin_norm = shop_admin_norm.replace(old_test_norm, new_test_norm, 1)
    print("shop_admin: Replaced test_shop_printer")
else:
    print("Warning: old_test_func not matched in shop_admin.py")

if crlf:
    shop_admin_norm = shop_admin_norm.replace("\n", "\r\n")

with open("backend/app/shop_admin.py", "w", encoding="utf-8") as f:
    f.write(shop_admin_norm)


# 2. Update backend/app/windows_printer.py to check physical status before printing customer orders
with open("backend/app/windows_printer.py", "r", encoding="utf-8") as f:
    win_printer_code = f.read()

win_crlf = "\r\n" in win_printer_code
win_norm = win_printer_code.replace("\r\n", "\n")

old_win_block = '''def print_order(
    order,
    *,
    sumatra_path: str,
    printer_name: str,
    timeout_seconds: int = 180,
) -> None:
    """
    Print one order. Raises an error with a short readable reason if
    anything goes wrong.
    """

    program = find_sumatra(sumatra_path)'''

new_win_block = '''def print_order(
    order,
    *,
    sumatra_path: str,
    printer_name: str,
    timeout_seconds: int = 180,
) -> None:
    """
    Print one order. Raises an error with a short readable reason if
    anything goes wrong.
    """
    # Pre-check if target printer is online before sending to spooler
    try:
        from .shop_admin import get_system_printers
        printers = get_system_printers()
        target_p = next((p for p in printers if p["name"].lower() == (printer_name or "").lower()), None)
        if target_p and not target_p.get("is_online", True):
            raise RuntimeError(
                f"Printer '{printer_name}' is {target_p.get('status_text', 'disconnected / turned off')}. "
                "Please connect the printer cable or turn it ON."
            )
    except RuntimeError:
        raise
    except Exception as e:
        log.warning("Could not pre-check printer status: %s", e)

    program = find_sumatra(sumatra_path)'''

if old_win_block.replace("\r\n", "\n") in win_norm:
    win_norm = win_norm.replace(old_win_block.replace("\r\n", "\n"), new_win_block.replace("\r\n", "\n"), 1)
    print("windows_printer: Added physical connectivity pre-check")
else:
    print("Warning: old_win_block not matched in windows_printer.py")

if win_crlf:
    win_norm = win_norm.replace("\n", "\r\n")

with open("backend/app/windows_printer.py", "w", encoding="utf-8") as f:
    f.write(win_norm)

print("Backend files updated successfully!")
