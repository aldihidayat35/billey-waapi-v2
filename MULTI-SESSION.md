# Multi-Session WhatsApp Web UI

Dokumentasi untuk fitur multi-session pada WhatsApp Web UI menggunakan Baileys.

## Fitur Utama

✅ **Multi Session Support** - Kelola beberapa akun WhatsApp secara bersamaan
✅ **Session Management** - Buat, hapus, dan kelola session dengan mudah
✅ **QR Code & Pairing Code** - Dua metode koneksi untuk setiap session
✅ **Independent Sessions** - Setiap session memiliki auth credentials terpisah
✅ **Real-time Status** - Monitor status koneksi semua session secara real-time
✅ **Send from Any Session** - Kirim pesan dari session mana saja yang aktif

## Cara Menggunakan

### 1. Menjalankan Server

```bash
# Install dependencies (jika belum)
npm install

# Build project
npm run build

# Jalankan server
npx ts-node web-server.ts
```

Server akan berjalan di `http://localhost:3000`

### 2. Membuat Session Baru

1. Buka aplikasi di browser
2. Di panel **Session Manager**, masukkan ID session (contoh: `session1`, `wa-bot`, `my-account`)
3. Klik tombol **➕ Create Session**
4. Session baru akan muncul di daftar session

### 3. Menghubungkan Session

#### Menggunakan QR Code:
1. Pilih session dari dropdown atau klik tombol **Connect** pada session yang diinginkan
2. Pilih tab **QR Code**
3. Klik **📷 Connect with QR Code**
4. Scan QR code dengan WhatsApp di HP Anda (WhatsApp > Linked Devices > Link a Device)

#### Menggunakan Pairing Code:
1. Pilih session dari dropdown atau klik tombol **Connect** pada session yang diinginkan
2. Pilih tab **Pairing Code**
3. Masukkan nomor HP (dengan kode negara, tanpa +). Contoh: `628123456789`
4. Klik **🔗 Get Pairing Code**
5. Masukkan kode yang muncul ke WhatsApp di HP Anda (WhatsApp > Linked Devices > Link a Device)

### 4. Mengirim Pesan

1. Di panel **Send Message**, pilih session yang ingin digunakan untuk mengirim
2. Masukkan nomor penerima (dengan kode negara). Contoh: `628123456789`
3. Ketik pesan Anda
4. Klik **📤 Send Message**

### 5. Mengelola Session

- **Select Session**: Klik tombol **✅ Select** untuk memilih session aktif
- **Logout Session**: Pilih session, lalu klik tombol logout di panel Connection
- **Delete Session**: Klik tombol **🗑️ Delete** pada session (akan menghapus session dan credentials)

## Struktur File

```
Baileys/
├── web-server.ts              # Server utama dengan multi-session support
├── session-manager.ts         # Class untuk mengelola multiple sessions
├── public/
│   ├── index.html            # UI dengan session manager
│   ├── app.js                # Client-side logic untuk multi-session
│   └── style.css             # Styling dengan session UI components
└── baileys_auth_info_*/      # Folder auth untuk setiap session
```

## API Socket Events

### Client to Server:

- `create-session` - Membuat session baru
  ```js
  socket.emit('create-session', 'session1')
  ```

- `get-sessions` - Mendapatkan semua session
  ```js
  socket.emit('get-sessions')
  ```

- `start-session-qr` - Mulai session dengan QR
  ```js
  socket.emit('start-session-qr', 'session1')
  ```

- `start-session-pairing` - Mulai session dengan pairing code
  ```js
  socket.emit('start-session-pairing', { 
    sessionId: 'session1', 
    phoneNumber: '628123456789' 
  })
  ```

- `send-message` - Kirim pesan dari session tertentu
  ```js
  socket.emit('send-message', {
    sessionId: 'session1',
    phone: '628123456789',
    message: 'Hello from session1!'
  })
  ```

- `logout` - Logout session
  ```js
  socket.emit('logout', 'session1')
  ```

- `delete-session` - Hapus session
  ```js
  socket.emit('delete-session', 'session1')
  ```

### Server to Client:

- `all-sessions` - Daftar semua session
- `session-status` - Update status session
- `qr` - QR code untuk session
- `pairing-code` - Pairing code untuk session
- `message-sent` - Konfirmasi pesan terkirim
- `message-received` - Pesan masuk
- `message` - Pesan info
- `error` - Error message

## Authentication Storage

Setiap session menyimpan credentials di folder terpisah:
- `baileys_auth_info_session1/`
- `baileys_auth_info_session2/`
- `baileys_auth_info_my-account/`
- dst.

File-file dalam folder auth:
- `creds.json` - Credentials WhatsApp
- `app-state-sync-*.json` - State sync data
- `pre-key-*.json` - Pre-keys untuk enkripsi
- `device-list-*.json` - Daftar devices
- `lid-mapping-*.json` - LID mapping

## Tips & Best Practices

1. **Session ID**: Gunakan nama yang deskriptif untuk session (contoh: `personal`, `business`, `customer-service`)
2. **Monitoring**: Pantau Activity Log untuk melihat aktivitas semua session
3. **Reconnection**: Session akan otomatis reconnect jika terputus (kecuali logout manual)
4. **Cleanup**: Hapus session yang tidak digunakan untuk menghemat resources
5. **Backup**: Backup folder `baileys_auth_info_*` untuk menyimpan session credentials

## Troubleshooting

### Session tidak connect
- Pastikan QR code di-scan dalam 60 detik
- Coba logout dan connect ulang
- Periksa koneksi internet

### QR code tidak muncul
- Refresh halaman
- Cek console untuk error
- Pastikan server berjalan dengan baik

### Pesan tidak terkirim
- Pastikan session dalam status "Connected"
- Verifikasi nomor penerima (harus dengan kode negara)
- Cek Activity Log untuk error details

### Session hilang setelah restart
- Session akan otomatis reconnect jika credentials masih ada
- Jika credentials terhapus, perlu connect ulang

## Batasan

- Setiap akun WhatsApp hanya bisa memiliki maksimal beberapa linked devices
- Performa server akan terpengaruh jika terlalu banyak session aktif bersamaan
- Setiap session memerlukan memory dan network resources

## Support

Untuk pertanyaan dan issue, silakan buka issue di repository Baileys atau hubungi developer.

---

**Powered by Baileys** - WhatsApp Web API
