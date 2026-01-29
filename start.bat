@echo off
chcp 65001 >nul
title ⚡ Quick Start - WhatsApp API
color 0B

echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║           WhatsApp Multi-Session API - Quick Start           ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.

:: Check if PM2 is installed
where pm2 >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] PM2 tidak ditemukan. Menjalankan dengan npx tsx...
    echo.
    npx tsx web-server.ts
    pause
    exit /b
)

:: Check if already running
pm2 describe baileys-waapi >nul 2>&1
if %errorLevel% equ 0 (
    echo [i] Aplikasi sudah berjalan. Melakukan restart...
    pm2 restart baileys-waapi
) else (
    echo [i] Memulai aplikasi...
    pm2 start web-server.ts --name baileys-waapi --interpreter ./node_modules/.bin/tsx
)

echo.
pm2 status
echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║  ✅ Aplikasi berjalan di: http://localhost:8080              ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.
echo Tekan Enter untuk membuka browser...
pause >nul
start http://localhost:8080
