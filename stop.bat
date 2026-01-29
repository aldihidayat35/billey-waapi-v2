@echo off
chcp 65001 >nul
title 🛑 Stop WhatsApp API
color 0C

echo.
echo Menghentikan aplikasi...
pm2 stop baileys-waapi
echo.
pm2 status
echo.
echo Aplikasi dihentikan.
pause
