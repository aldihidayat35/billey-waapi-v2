# 🚀 Baileys WhatsApp API - Auto-Start Setup Complete!

## ✅ Status Setup

Aplikasi Baileys WhatsApp API Anda sudah dikonfigurasi untuk **auto-start** menggunakan PM2!

### Yang Sudah Dikonfigurasi:
1. ✅ PM2 terinstall global
2. ✅ PM2 Windows Startup terinstall
3. ✅ Aplikasi running dengan PM2 (process name: **baileys-waapi**)
4. ✅ Auto-restart jika crash
5. ✅ Auto-start saat Windows boot
6. ✅ Process list tersimpan

---

## 🎯 Cara Kerja

### Saat Komputer Restart:
1. Windows boot → PM2 service auto-start
2. PM2 membaca konfigurasi tersimpan
3. Aplikasi **baileys-waapi** otomatis berjalan
4. Akses langsung di: **http://localhost:8080**

### Saat Laragon Start:
- Tidak perlu jalankan `npm start` lagi
- Aplikasi sudah berjalan via PM2
- PM2 berjalan independent dari Laragon

---

## 📋 File Bantuan

### 1. **start-baileys.bat**
Double-click untuk start/resurrect PM2 process
```
Jalankan jika aplikasi belum start setelah restart
```

### 2. **check-status.bat**
Double-click untuk cek status aplikasi lengkap
```
Menampilkan status, logs, dan health check
```

### 3. **ecosystem.config.cjs**
Konfigurasi PM2 untuk aplikasi
```
Berisi setting: name, script, logs, auto-restart, dll
```

---

## 🔧 Perintah PM2 Penting

### Status & Monitoring
```bash
# Lihat semua process
pm2 list

# Detail process
pm2 show baileys-waapi

# Monitor CPU & Memory real-time
pm2 monit

# Status summary
pm2 status
```

### Logs & Debugging
```bash
# Lihat logs real-time
pm2 logs baileys-waapi

# Lihat 50 baris terakhir
pm2 logs baileys-waapi --lines 50

# Lihat hanya error
pm2 logs baileys-waapi --err

# Clear logs
pm2 flush
```

### Kontrol Aplikasi
```bash
# Restart aplikasi
pm2 restart baileys-waapi

# Stop aplikasi
pm2 stop baileys-waapi

# Start aplikasi
pm2 start baileys-waapi

# Reload dengan zero-downtime
pm2 reload baileys-waapi

# Delete dari PM2
pm2 delete baileys-waapi
```

### Management
```bash
# Save current process list
pm2 save

# Resurrect saved processes
pm2 resurrect

# Reset all
pm2 kill
```

---

## 🔄 Workflow Setelah Update Code

```bash
# 1. Navigate ke folder
cd C:\laragon\www\Baileys\Baileys

# 2. Pull update (jika pakai git)
git pull

# 3. Install dependencies baru (jika ada)
npm install

# 4. Restart aplikasi
pm2 restart baileys-waapi

# 5. Check logs
pm2 logs baileys-waapi --lines 20
```

---

## 🧪 Testing Auto-Start

### Test 1: Restart PM2
```bash
pm2 kill
pm2 resurrect
# Aplikasi harus kembali online
```

### Test 2: Restart Windows
```bash
1. Restart komputer
2. Tunggu Windows boot selesai
3. Buka browser: http://localhost:8080
4. Aplikasi harus sudah jalan
```

### Test 3: Crash Recovery
```bash
pm2 stop baileys-waapi
pm2 start baileys-waapi
# Harus kembali online otomatis
```

---

## 📁 Lokasi Files & Logs

### PM2 Process Config
```
C:\laragon\www\Baileys\Baileys\ecosystem.config.cjs
```

### Application Logs
```
C:\laragon\www\Baileys\Baileys\logs\pm2-out.log    (stdout)
C:\laragon\www\Baileys\Baileys\logs\pm2-error.log  (stderr)
C:\laragon\www\Baileys\Baileys\logs\pm2-combined.log
```

### PM2 Data
```
C:\Users\[USER]\.pm2\
├── dump.pm2          (Saved process list)
├── pm2.log           (PM2 daemon log)
└── pids\             (Process IDs)
```

---

## ⚙️ Konfigurasi Saat Ini

```javascript
{
  name: 'baileys-waapi',
  script: 'web-server.ts',
  interpreter: 'npx',
  interpreter_args: 'tsx',
  instances: 1,
  autorestart: true,
  max_memory_restart: '1G',
  env: { NODE_ENV: 'production' }
}
```

---

## 🚨 Troubleshooting

### Aplikasi tidak start setelah restart komputer?
```bash
# Check PM2 service
pm2 list

# Resurrect processes
pm2 resurrect

# Re-install startup
pm2-startup install
pm2 save
```

### Aplikasi crash terus-menerus?
```bash
# Lihat error logs
pm2 logs baileys-waapi --err --lines 100

# Check memory usage
pm2 monit

# Increase memory limit
pm2 delete baileys-waapi
# Edit ecosystem.config.cjs, ubah max_memory_restart
pm2 start ecosystem.config.cjs
```

### Port 8080 sudah dipakai?
```bash
# Check apa yang pakai port 8080
netstat -ano | findstr :8080

# Kill process
taskkill /PID [PID] /F

# Atau edit web-server.ts ganti port
```

### Ingin ganti port atau config?
```bash
# 1. Stop aplikasi
pm2 stop baileys-waapi

# 2. Edit file konfigurasi
# - web-server.ts (port)
# - ecosystem.config.cjs (PM2 config)

# 3. Restart
pm2 restart baileys-waapi

# 4. Save
pm2 save
```

---

## 🔓 Uninstall Auto-Start

Jika ingin menon-aktifkan auto-start:

```bash
# 1. Stop aplikasi
pm2 stop baileys-waapi

# 2. Delete dari PM2
pm2 delete baileys-waapi

# 3. Uninstall PM2 startup
pm2-startup uninstall

# 4. (Optional) Uninstall PM2
npm uninstall -g pm2 pm2-windows-startup
```

---

## 📞 Quick Commands Reference

| Task | Command |
|------|---------|
| Status | `pm2 list` |
| Logs | `pm2 logs baileys-waapi` |
| Restart | `pm2 restart baileys-waapi` |
| Stop | `pm2 stop baileys-waapi` |
| Start | `pm2 start baileys-waapi` |
| Monitor | `pm2 monit` |
| Details | `pm2 show baileys-waapi` |
| Save | `pm2 save` |
| Resurrect | `pm2 resurrect` |

---

## ✨ Keuntungan Menggunakan PM2

1. ✅ **Auto-restart** - Crash? Langsung restart otomatis
2. ✅ **Auto-start** - Boot Windows? Aplikasi otomatis jalan
3. ✅ **Zero-downtime** - Reload tanpa downtime
4. ✅ **Logging** - Log tersentralisir dan rapi
5. ✅ **Monitoring** - CPU & Memory real-time
6. ✅ **Clustering** - Bisa run multiple instances (jika perlu)

---

## 🎉 Setup Complete!

Aplikasi Anda sekarang:
- ✅ Running di: http://localhost:3000
- ✅ Auto-start saat Windows boot
- ✅ Auto-restart jika crash
- ✅ Monitored oleh PM2
- ✅ Logs terorganisir

**Tidak perlu lagi jalankan `npm start` manual!**

---

*Last updated: January 28, 2026*
