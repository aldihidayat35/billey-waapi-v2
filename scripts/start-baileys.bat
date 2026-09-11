@echo off
echo Starting Baileys WhatsApp API...
cd /d %~dp0
npx tsx web-server.ts
pause
