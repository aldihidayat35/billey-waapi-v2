# Setup PM2 Auto-Start dengan Laragon

## Status Saat Ini
✅ PM2 sudah terinstall  
✅ Aplikasi sudah berjalan dengan PM2  
✅ PM2 process list sudah disimpan  
✅ PM2 Windows startup sudah terkonfigurasi  

## Aplikasi Running
- **Nama Process**: baileys-waapi
- **Status**: Online
- **URL**: http://localhost:3000

## Perintah PM2 Berguna

### Melihat status aplikasi:
```bash
pm2 list
```

### Melihat logs real-time:
```bash
pm2 logs baileys-waapi
```

### Restart aplikasi:
```bash
pm2 restart baileys-waapi
```

### Stop aplikasi:
```bash
pm2 stop baileys-waapi
```

### Start aplikasi:
```bash
pm2 start baileys-waapi
```

### Hapus dari PM2:
```bash
pm2 delete baileys-waapi
```

### Melihat detail proses:
```bash
pm2 show baileys-waapi
```

### Monitoring:
```bash
pm2 monit
```

## Auto-Start Saat Komputer Hidup

PM2 sudah dikonfigurasi untuk auto-start dengan Windows:
1. PM2 akan otomatis mulai saat Windows boot
2. Aplikasi Baileys akan otomatis dijalankan

## Menggunakan dengan Laragon

### Opsi 1: Klik File Batch
Double-click file `start-baileys.bat` di folder ini

### Opsi 2: Tambahkan ke Laragon Startup
1. Buka Laragon
2. Klik kanan tray icon Laragon
3. Preferences > Services & Ports
4. Tambahkan script startup di Laragon

## Troubleshooting

### Aplikasi tidak jalan setelah restart:
```bash
pm2 resurrect
```

### Reset PM2 startup:
```bash
pm2 save
pm2-startup install
```

### Melihat error logs:
```bash
pm2 logs baileys-waapi --err --lines 50
```

### Membersihkan logs:
```bash
pm2 flush
```

## Konfigurasi File

- **PM2 Config**: `ecosystem.config.cjs`
- **Logs Location**: `./logs/`
- **Startup Script**: `start-baileys.bat`

## Update Kode

Setelah update kode, restart aplikasi:
```bash
cd C:\laragon\www\Baileys\Baileys
git pull  # jika menggunakan git
pm2 restart baileys-waapi
```

## Uninstall PM2 Auto-Start

Jika ingin menonaktifkan auto-start:
```bash
pm2-startup uninstall
pm2 delete baileys-waapi
```
