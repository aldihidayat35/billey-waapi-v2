@echo off
chcp 65001 >nul
title 🗑️ Uninstall WhatsApp API
color 0E

echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║              Uninstall WhatsApp Multi-Session API            ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.
echo PERINGATAN: Ini akan menghapus aplikasi dari PM2
echo Data session WhatsApp TIDAK akan dihapus.
echo.
set /p confirm="Lanjutkan? (Y/N): "
if /i not "%confirm%"=="Y" exit /b

echo.
echo [1/3] Menghentikan aplikasi...
pm2 stop baileys-waapi >nul 2>&1
echo [✓] Aplikasi dihentikan

echo [2/3] Menghapus dari PM2...
pm2 delete baileys-waapi >nul 2>&1
echo [✓] Dihapus dari PM2

echo [3/3] Menyimpan konfigurasi...
pm2 save >nul 2>&1
echo [✓] Konfigurasi disimpan

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
