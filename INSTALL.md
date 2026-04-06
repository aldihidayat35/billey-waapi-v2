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
   git clone https://github.com/aldihidayat35/billey-waapi-v2.git
   cd billey-waapi-v2
   ```

2. Jalankan script instalasi:
   - **Double-click** file `install.bat`
   - Atau jalankan di terminal: `install.bat`

3. Selesai! Buka http://localhost:8080

---

### Opsi B: Instalasi Manual

#### Step 1: Install Node.js
1. Download Node.js dari https://nodejs.org/ (versi LTS)
2. Install dengan opsi default
3. Restart Laragon terminal

#### Step 2: Clone Repository
```bash
cd C:/laragon/www
git clone https://github.com/aldihidayat35/billey-waapi-v2.git
cd billey-waapi-v2
```

#### Step 3: Install Dependencies
```bash
npm install
```

#### Step 4: Jalankan Server
```bash
npx tsx web-server.ts
```

#### Step 5: Verifikasi
Buka browser ke http://localhost:8080

---

## 🌐 Akses Aplikasi

Setelah instalasi selesai:
- **Dashboard**: http://localhost:8080
- **API Docs**: http://localhost:8080/api

---

## 📋 Perintah

```bash
# Start server
start.bat
# atau: npx tsx web-server.ts

# Stop server
stop.bat

# Check status
check-status.bat
```

---

## 🔧 Troubleshooting

### Error: 'npm' is not recognized
- Pastikan Node.js sudah terinstall
- Restart terminal Laragon

### Error: Port 8080 already in use
- Ubah port di file `web-server.ts` atau stop aplikasi yang menggunakan port 8080
- Atau jalankan `stop.bat` untuk menghentikan proses di port 8080

### Aplikasi crash terus-menerus
- Cek log error di terminal tempat server dijalankan

---

## 📂 Struktur Folder Penting

```
billey-waapi-v2/
├── data/               # Database SQLite
├── public/             # Frontend files
├── src/                # Source code Baileys
├── web-server.ts       # Main server file
├── install.bat         # Script instalasi otomatis
├── start.bat           # Start server
└── stop.bat            # Stop server
```

---

## 🔄 Update Aplikasi

```bash
cd C:/laragon/www/billey-waapi-v2
git pull origin main
npm install
# Restart server (stop.bat lalu start.bat)
```
