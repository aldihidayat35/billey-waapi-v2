# 📦 Panduan Instalasi WhatsApp Multi-Session API

## Persyaratan Sistem
- **Laragon** (sudah terinstall)
- **Node.js** v18+ (akan diinstall via Laragon atau manual)
- **Git** (biasanya sudah include di Laragon)

---

## 🚀 Cara Instalasi (Pilih Salah Satu)

### Opsi A: Instalasi Otomatis (Recommended)
1. Clone repository:
   ```bash
   cd C:/laragon/www
   git clone https://github.com/aldihidayat35/billey-waapi-v2.git Baileys
   cd Baileys
   ```

2. Jalankan script instalasi:
   - **Double-click** file `install.bat`
   - Atau jalankan di terminal: `install.bat`

3. Selesai! Aplikasi akan otomatis jalan saat Windows startup.

---

### Opsi B: Instalasi Manual

#### Step 1: Install Node.js
1. Download Node.js dari https://nodejs.org/ (versi LTS)
2. Install dengan opsi default
3. Restart Laragon terminal

#### Step 2: Clone Repository
```bash
cd C:/laragon/www
git clone https://github.com/aldihidayat35/billey-waapi-v2.git Baileys
cd Baileys
```

#### Step 3: Install Dependencies
```bash
npm install
```

#### Step 4: Install PM2 Global
```bash
npm install -g pm2
npm install -g pm2-windows-startup
```

#### Step 5: Setup PM2 Auto-Start
```bash
# Start aplikasi dengan PM2
pm2 start web-server.ts --name baileys-waapi --interpreter ./node_modules/.bin/tsx

# Save konfigurasi PM2
pm2 save

# Setup Windows startup
pm2-startup install
```

#### Step 6: Verifikasi
```bash
pm2 status
```

---

## 🌐 Akses Aplikasi

Setelah instalasi selesai:
- **Dashboard**: http://localhost:8080
- **API Docs**: http://localhost:8080/api

---

## 📝 Perintah PM2 Berguna

```bash
# Lihat status
pm2 status

# Lihat logs
pm2 logs baileys-waapi

# Restart aplikasi
pm2 restart baileys-waapi

# Stop aplikasi
pm2 stop baileys-waapi

# Hapus dari PM2
pm2 delete baileys-waapi
```

---

## 🔧 Troubleshooting

### Error: 'npm' is not recognized
- Pastikan Node.js sudah terinstall
- Restart terminal Laragon

### Error: Port 8080 already in use
- Ubah port di file `web-server.ts` atau stop aplikasi yang menggunakan port 8080

### PM2 tidak auto-start saat Windows boot
```bash
pm2-startup install
pm2 save
```

### Aplikasi crash terus-menerus
```bash
pm2 logs baileys-waapi --lines 100
```

---

## 📂 Struktur Folder Penting

```
Baileys/
├── data/               # Database SQLite
├── public/             # Frontend files
├── src/                # Source code Baileys
├── web-server.ts       # Main server file
├── install.bat         # Script instalasi otomatis
└── start-baileys.bat   # Script start manual
```

---

## 🔄 Update Aplikasi

```bash
cd C:/laragon/www/Baileys
git pull origin main
npm install
pm2 restart baileys-waapi
```
