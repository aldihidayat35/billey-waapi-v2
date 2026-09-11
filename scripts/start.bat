npx tsx src/web-server.ts
@echo off
chcp 65001 >nul
title ⚡ WhatsApp API Server
color 0B

echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║           WhatsApp Multi-Session API - Quick Start           ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.

echo [i] Memulai server...
echo.
npx tsx src/new-path/web-server.ts
pause
