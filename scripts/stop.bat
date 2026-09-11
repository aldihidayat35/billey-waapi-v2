@echo off
chcp 65001 >nul
title 🛑 Stop WhatsApp API
color 0C

echo.
echo Menghentikan aplikasi pada port 8080...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8080 ^| findstr LISTENING') do (
    taskkill /PID %%a /F >nul 2>&1
)
echo.
echo Aplikasi dihentikan.
pause
