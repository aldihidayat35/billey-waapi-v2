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

:: Step 1: Check Node.js
echo [1/4] Mengecek Node.js...
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
echo [2/4] Mengecek npm...
where npm >nul 2>&1
if %errorLevel% neq 0 (
    echo [X] npm tidak ditemukan!
    exit /b 1
)
for /f "tokens=*" %%i in ('npm -v') do set NPM_VERSION=%%i
echo [✓] npm terdeteksi: v%NPM_VERSION%

:: Step 3: Install dependencies
echo.
echo [3/4] Menginstall dependencies...
echo      Ini mungkin memakan waktu beberapa menit...
call npm install
if %errorLevel% neq 0 (
    echo [X] Gagal install dependencies!
    pause
    exit /b 1
)
echo [✓] Dependencies berhasil diinstall

:: Step 4: Create data folder
echo.
echo [4/4] Menyiapkan folder data...
if not exist "data" mkdir data
echo [✓] Folder data siap

:: Start server
echo.
echo Memulai server...
start "WhatsApp API" cmd /c "npx tsx web-server.ts"

echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║                   ✅ INSTALASI SELESAI!                      ║
echo ╠══════════════════════════════════════════════════════════════╣
echo ║                                                              ║
echo ║  📍 Akses Dashboard: http://localhost:8080                   ║
echo ║                                                              ║
echo ║  📋 Perintah:                                                ║
echo ║     start.bat  - Jalankan server                             ║
echo ║     stop.bat   - Hentikan server                             ║
echo ║                                                              ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.
echo Tekan Enter untuk membuka dashboard di browser...
pause >nul
start http://localhost:8080

exit /b 0
