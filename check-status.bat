@echo off
title Check Baileys WhatsApp API Status
color 0A

echo ============================================
echo   Baileys WhatsApp API - Status Check
echo ============================================
echo.

echo [1] Checking PM2 Process...
pm2 list

echo.
echo [2] Process Details...
pm2 show baileys-waapi

echo.
echo [3] Testing Application...
curl -s http://localhost:8080 >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Application is responding at http://localhost:8080
) else (
    echo [ERROR] Application is not responding!
)

echo.
echo [4] Recent Logs...
pm2 logs baileys-waapi --lines 15 --nostream

echo.
echo ============================================
echo   Commands:
echo   - pm2 restart baileys-waapi  (Restart app)
echo   - pm2 logs baileys-waapi     (View logs)
echo   - pm2 monit                  (Monitor)
echo ============================================
echo.
pause
