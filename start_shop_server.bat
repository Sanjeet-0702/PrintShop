@echo off
title PrintShop Local Server & USB Printer Hub
echo =======================================================
echo         PrintShop Local Server ^& USB Printer Hub
echo =======================================================
echo.
echo [1/2] Starting local backend server on port 8000...
start "PrintShop Backend" /min cmd /c "cd /d %~dp0backend && .venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000"
timeout /t 3 /nobreak >nul

echo [2/2] Connecting Cloudflare Tunnel to the internet...
echo.
echo =======================================================
echo Copy the https://....trycloudflare.com URL shown below:
echo and paste it as VITE_API_URL in your Vercel settings!
echo =======================================================
echo.
"%~dp0scripts\cloudflared.exe" tunnel --url http://127.0.0.1:8000
pause
