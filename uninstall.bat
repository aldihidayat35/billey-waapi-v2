@echo off
chcp 65001 >nul
title 🗑️ Uninstall WhatsApp API
color 0E

echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║              Uninstall WhatsApp Multi-Session API            ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.
echo PERINGATAN: Ini akan menghentikan server.
echo Data session WhatsApp TIDAK akan dihapus.
echo.
set /p confirm="Lanjutkan? (Y/N): "
if /i not "%confirm%"=="Y" exit /b

echo.
echo [1/1] Menghentikan server...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8080" ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>&1
)
echo [✓] Server dihentikan

echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║               ✅ Uninstall selesai                           ║
echo ╠══════════════════════════════════════════════════════════════╣
echo ║  Data session masih tersimpan di folder:                     ║
echo ║  - data/                                                     ║
echo ║  - baileys_auth_info_*/                                      ║
echo ║                                                              ║
echo ║  Untuk install ulang, jalankan: install.bat                  ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.
pause
