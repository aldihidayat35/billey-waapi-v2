# Quick Start - Multi Session WhatsApp

## 🚀 Cara Cepat Memulai

### 1. Install & Jalankan

```bash
# Install dependencies (jika belum)
npm install

# Jalankan server
npm run web
```

Server akan berjalan di **http://localhost:3000**

### 2. Akses Web Interface

Buka browser dan kunjungi: **http://localhost:3000**

### 3. Buat Session Pertama

1. Di form **Session Manager**, ketik ID session: `session1`
2. Klik **➕ Create Session**
3. Session akan muncul di daftar

### 4. Connect WhatsApp

**Pilihan A - QR Code (Lebih Mudah):**
1. Klik tombol **🔌 Connect** pada session1
2. Pilih session1 di dropdown
3. Tab **QR Code** → Klik **📷 Connect with QR Code**
4. Scan QR dengan WhatsApp di HP:
   - Buka WhatsApp
   - Menu (⋮) → Linked Devices
   - Link a Device
   - Scan QR code yang muncul

**Pilihan B - Pairing Code:**
1. Klik tombol **🔌 Connect** pada session1
2. Pilih session1 di dropdown
3. Tab **Pairing Code**
4. Masukkan nomor HP (contoh: `628123456789`)
5. Klik **🔗 Get Pairing Code**
6. Masukkan kode 8 digit ke WhatsApp di HP

### 5. Kirim Pesan Test

1. Setelah connected, pilih session di dropdown **Send Message**
2. Masukkan nomor tujuan: `628123456789`
3. Ketik pesan: `Hello from multi-session!`
4. Klik **📤 Send Message**

## 📝 Contoh Penggunaan Multi Session

### Skenario 1: Personal + Business

```
Session 1: "personal" → Akun WhatsApp pribadi
Session 2: "business" → Akun WhatsApp bisnis
```

1. Buat session "personal" dan "business"
2. Connect keduanya dengan QR code
3. Pilih session yang sesuai saat mengirim pesan

### Skenario 2: Multiple Bots

```
Session 1: "bot-customer-service"
Session 2: "bot-marketing"
Session 3: "bot-notifications"
```

Setiap bot bisa mengirim pesan dari akun yang berbeda secara bersamaan.

### Skenario 3: Testing Environment

```
Session 1: "production"
Session 2: "staging"
Session 3: "development"
```

Test fitur dengan berbagai akun tanpa logout/login berulang kali.

## 🎯 Fitur Utama

✅ **Unlimited Sessions** - Buat sebanyak mungkin session (sesuai kapasitas server)
✅ **Independent Auth** - Setiap session punya credentials terpisah
✅ **Real-time Status** - Monitor semua session dalam satu dashboard
✅ **Easy Switching** - Ganti session dengan 1 klik
✅ **Auto Reconnect** - Session otomatis reconnect jika terputus
✅ **QR & Pairing** - Dua cara connect untuk fleksibilitas

## 📊 Monitoring

### Activity Log
Semua aktivitas dicatat di panel **Activity Log**:
- Session created/deleted
- Connection status changes
- Messages sent/received
- Errors dan warnings

### Session List
Panel **Session Manager** menampilkan:
- 🟢 Connected - Session aktif
- 🔴 Disconnected - Session tidak aktif
- User info (nama & nomor)
- Tombol connect/delete

## ⚙️ Tips & Tricks

### 1. Naming Convention
Gunakan nama yang jelas untuk session:
- ✅ `customer-service`, `bot-notifications`, `personal`
- ❌ `s1`, `test`, `abc123`

### 2. Keep It Running
Server harus tetap berjalan agar session tetap connected:
- Gunakan process manager (PM2) untuk production
- Gunakan screen/tmux untuk development

### 3. Backup Credentials
Backup folder auth sessions secara berkala:
```bash
cp -r baileys_auth_info_* /backup/location/
```

### 4. Clean Up
Hapus session yang tidak digunakan:
- Klik **🗑️ Delete** pada session
- Folder auth akan terhapus

### 5. Multiple Devices
Setiap akun WhatsApp bisa connect max ~5 devices.
Jika sudah penuh, logout dari device lain dulu.

## 🔧 Troubleshooting

### QR Code Tidak Muncul
```
✅ Refresh halaman
✅ Cek console browser (F12)
✅ Pastikan server running
✅ Coba disconnect lalu connect lagi
```

### Session Tidak Connect
```
✅ Pastikan internet stabil
✅ Scan QR dalam 60 detik
✅ Logout dan login ulang
✅ Delete session dan buat ulang
```

### Pesan Tidak Terkirim
```
✅ Cek session status (harus Connected)
✅ Verifikasi nomor tujuan (dengan kode negara)
✅ Lihat Activity Log untuk error
✅ Test dengan nomor yang sudah save di HP
```

## 🌐 API Usage

Untuk integrasi dengan aplikasi lain, gunakan Socket.IO:

```javascript
const socket = io('http://localhost:3000')

// Buat session
socket.emit('create-session', 'my-bot')

// Connect dengan QR
socket.emit('start-session-qr', 'my-bot')

// Kirim pesan
socket.emit('send-message', {
    sessionId: 'my-bot',
    phone: '628123456789',
    message: 'Hello from API!'
})
```

Lihat file `multi-session-example.ts` untuk contoh lengkap.

## 📚 Dokumentasi Lengkap

Baca `MULTI-SESSION.md` untuk dokumentasi lengkap API dan advanced usage.

## ❓ FAQ

**Q: Berapa banyak session yang bisa dibuat?**  
A: Tidak ada batasan hard limit, tergantung resources server. Untuk penggunaan normal, 5-10 session tidak masalah.

**Q: Apakah session tersimpan setelah restart?**  
A: Ya, credentials tersimpan di folder `baileys_auth_info_*` dan akan auto-reconnect.

**Q: Bisa kirim gambar/video/file?**  
A: Saat ini hanya support text message. Untuk media, perlu develop custom endpoint.

**Q: Apakah aman?**  
A: Credentials disimpan lokal di server. Pastikan server Anda aman dan jangan expose ke public tanpa authentication.

**Q: Bisa dipakai untuk production?**  
A: Ya, tapi tambahkan:
- Authentication/authorization
- Rate limiting
- Error handling yang lebih robust
- Database untuk logging
- Process manager (PM2)

---

**Happy Multi-Session WhatsApp! 🚀📱**
