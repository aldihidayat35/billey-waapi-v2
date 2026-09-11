@echo off
title Baileys WhatsApp API - Status Check
color 0A

echo ============================================
echo   Baileys WhatsApp API - Status Check
echo ============================================
echo.

echo [1] Checking port 8080...
netstat -aon | findstr :8080 | findstr LISTENING
if %errorlevel% equ 0 (
    echo [OK] Server process is running on port 8080
) else (
    echo [WARNING] No process found on port 8080
)

echo.
echo [2] Testing Application...
curl -s http://localhost:8080 >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Application is responding at http://localhost:8080
) else (
    echo [ERROR] Application is not responding!
)

echo.
echo ============================================
echo   Commands:
echo   - start.bat   (Start server)
echo   - stop.bat    (Stop server)
echo ============================================
echo.
pause
