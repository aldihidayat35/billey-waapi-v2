@echo off
echo Starting Baileys WhatsApp API with PM2...
cd /d C:\laragon\www\Baileys\Baileys
pm2 resurrect
pm2 list
echo.
echo Baileys WhatsApp API is running!
echo Access at: http://localhost:8080
