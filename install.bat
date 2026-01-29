@echo off
chcp 65001 >nul
title 🚀 WhatsApp Multi-Session API - Installer
color 0A

echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║     WhatsApp Multi-Session API - Automatic Installer         ║
echo ║                    by Billey WA-API                          ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.

:: Check if running as admin for PM2 startup
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] Untuk auto-start Windows, jalankan sebagai Administrator
    echo [!] Klik kanan install.bat ^> Run as administrator
    echo.
    echo Lanjutkan instalasi tanpa auto-start? (Y/N)
    set /p continue="> "
    if /i not "%continue%"=="Y" exit /b
)

:: Step 1: Check Node.js
echo [1/6] Mengecek Node.js...
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo [X] Node.js tidak ditemukan!
    echo.
    echo Silakan install Node.js terlebih dahulu:
    echo 1. Download dari: https://nodejs.org/
    echo 2. Install dengan opsi default
    echo 3. Restart komputer
    echo 4. Jalankan install.bat lagi
    echo.
    echo Atau tekan Enter untuk membuka halaman download Node.js...
    pause
    start https://nodejs.org/en/download/
    exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo [✓] Node.js terdeteksi: %NODE_VERSION%

:: Step 2: Check npm
echo.
echo [2/6] Mengecek npm...
where npm >nul 2>&1
if %errorLevel% neq 0 (
    echo [X] npm tidak ditemukan!
    exit /b 1
)
for /f "tokens=*" %%i in ('npm -v') do set NPM_VERSION=%%i
echo [✓] npm terdeteksi: v%NPM_VERSION%

:: Step 3: Install dependencies
echo.
echo [3/6] Menginstall dependencies...
echo      Ini mungkin memakan waktu beberapa menit...
call npm install
if %errorLevel% neq 0 (
    echo [X] Gagal install dependencies!
    pause
    exit /b 1
)
echo [✓] Dependencies berhasil diinstall

:: Step 4: Install PM2
echo.
echo [4/6] Menginstall PM2...
call npm install -g pm2 pm2-windows-startup
if %errorLevel% neq 0 (
    echo [X] Gagal install PM2!
    pause
    exit /b 1
)
echo [✓] PM2 berhasil diinstall

:: Step 5: Create data folder
echo.
echo [5/6] Menyiapkan folder data...
if not exist "data" mkdir data
echo [✓] Folder data siap

:: Step 6: Setup PM2
echo.
echo [6/6] Mengkonfigurasi PM2...

:: Stop existing if any
call pm2 delete baileys-waapi >nul 2>&1

:: Start with PM2
call pm2 start web-server.ts --name baileys-waapi --interpreter ./node_modules/.bin/tsx
if %errorLevel% neq 0 (
    echo [X] Gagal start aplikasi dengan PM2!
    echo Mencoba metode alternatif...
    call pm2 start "npx tsx web-server.ts" --name baileys-waapi
)

:: Save PM2 config
call pm2 save

:: Setup Windows startup
echo.
echo Mengkonfigurasi auto-start Windows...
call pm2-startup install >nul 2>&1
call pm2 save

echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║                   ✅ INSTALASI SELESAI!                      ║
echo ╠══════════════════════════════════════════════════════════════╣
echo ║                                                              ║
echo ║  📍 Akses Dashboard: http://localhost:8080                   ║
echo ║                                                              ║
echo ║  📋 Perintah berguna:                                        ║
echo ║     pm2 status          - Lihat status                       ║
echo ║     pm2 logs            - Lihat logs                         ║
echo ║     pm2 restart all     - Restart aplikasi                   ║
echo ║                                                              ║
echo ║  🔄 Aplikasi akan otomatis jalan saat Windows startup        ║
echo ║                                                              ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.

:: Show PM2 status
echo Status PM2:
call pm2 status

echo.
echo Tekan Enter untuk membuka dashboard di browser...
pause >nul
start http://localhost:8080

exit /b 0
