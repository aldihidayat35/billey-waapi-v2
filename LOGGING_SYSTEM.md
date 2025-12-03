# Sistem Logging WhatsApp API

## 📋 Deskripsi

Sistem logging otomatis untuk merekam semua aktivitas session dan pesan di aplikasi WhatsApp API.

## 🎯 Fitur Logging

### 1. **Session Logs** (Login/Logout)
Merekam semua aktivitas session:
- ✅ Login berhasil
- ✅ Logout
- ✅ Disconnect
- ✅ Reconnect
- ✅ Informasi user (ID, nama)
- ✅ Timestamp lengkap

### 2. **Message Logs** (Pesan Masuk & Keluar)
Merekam semua pesan yang diterima dan dikirim:
- ✅ Pesan text
- ✅ Gambar/foto (dengan info file)
- ✅ Video (dengan durasi)
- ✅ GIF
- ✅ Sticker
- ✅ Dokumen (dengan nama file & ukuran)
- ✅ Audio/Voice note
- ✅ Contact
- ✅ Location
- ✅ Direction (incoming/outgoing)
- ✅ Timestamp akurat

## 📂 Lokasi File Log

Log disimpan di folder:
```
Baileys/logs/
├── sessions.log    # Log aktivitas session
└── messages.log    # Log semua pesan
```

## 📊 Format Log

### Session Log Format
```json
{
  "timestamp": "2025-11-30T12:34:56.789Z",
  "sessionId": "joki-1",
  "action": "login",
  "status": "connected",
  "user": {
    "id": "6283121866599:25@s.whatsapp.net",
    "name": "John Doe"
  },
  "details": {
    "type": "qr",
    "connectedAt": "2025-11-30T12:34:56.789Z"
  }
}
```

### Message Log Format
```json
{
  "timestamp": "2025-11-30T12:35:10.123Z",
  "sessionId": "joki-1",
  "direction": "incoming",
  "from": "6281234567890@s.whatsapp.net",
  "to": "6283121866599:25@s.whatsapp.net",
  "messageType": "text",
  "content": "Hello, this is a test message",
  "status": "received"
}
```

### Message dengan Media
```json
{
  "timestamp": "2025-11-30T12:36:20.456Z",
  "sessionId": "joki-1",
  "direction": "outgoing",
  "from": "6283121866599:25@s.whatsapp.net",
  "to": "6281234567890@s.whatsapp.net",
  "messageType": "image",
  "content": "Foto produk",
  "mediaInfo": {
    "mimetype": "image/jpeg",
    "size": 177198,
    "filename": "product.jpg"
  },
  "status": "sent"
}
```

## 🔌 API Endpoints

### 1. Get Session Logs
```
GET /api/logs/sessions?limit=100
```
Response:
```json
{
  "success": true,
  "data": [...],
  "count": 50
}
```

### 2. Get Message Logs
```
GET /api/logs/messages?sessionId=joki-1&limit=100
```
Response:
```json
{
  "success": true,
  "data": [...],
  "count": 150
}
```

### 3. Get Statistics
```
GET /api/logs/statistics?sessionId=joki-1
```
Response:
```json
{
  "success": true,
  "data": {
    "totalMessages": 500,
    "incoming": 300,
    "outgoing": 200,
    "messageTypes": {
      "text": 350,
      "image": 80,
      "video": 40,
      "document": 30
    },
    "sessions": 2
  }
}
```

### 4. Get Logs by Date
```
GET /api/logs/date/2025-11-30?type=message
```
Response:
```json
{
  "success": true,
  "data": [...],
  "count": 75
}
```

## 💻 Console Output

Sistem juga menampilkan log real-time di console:

### Session Login
```
📋 [SESSION LOGIN] joki-1 - connected
   👤 User: John Doe (6283121866599:25@s.whatsapp.net)
```

### Session Logout
```
📋 [SESSION LOGOUT] joki-1 - disconnected
   👤 User: John Doe (6283121866599:25@s.whatsapp.net)
```

### Incoming Message
```
📨 [INCOMING] joki-1
   💬 text: 6281234567890@s.whatsapp.net → 6283121866599:25@s.whatsapp.net
   💬 "Hello, this is a test message"
```

### Outgoing Message
```
📤 [OUTGOING] joki-1
   📷 image: 6283121866599:25@s.whatsapp.net → 6281234567890@s.whatsapp.net
   💬 "Foto produk"
   📎 product.jpg (173 KB)
```

## 🖥️ Web Interface

Akses halaman **Log Activity** di:
```
http://localhost:3000/log-activity.html
```

### Fitur Web Interface:
- ✅ View session logs (login/logout)
- ✅ View message logs (incoming/outgoing)
- ✅ Filter by type (text, image, video, dll)
- ✅ Search messages
- ✅ Statistics dashboard
- ✅ Real-time updates (refresh setiap 10 detik)
- ✅ Export logs

## 🗄️ Storage Management

### Auto-cleanup
Log otomatis dibersihkan untuk log yang lebih lama dari 30 hari.

Untuk membersihkan manual:
```javascript
import { logger } from './logger'

// Clear logs older than 30 days
logger.clearOldLogs(30)
```

## 📈 Monitoring

### Real-time Monitoring
Log dapat dimonitor secara real-time melalui:
1. Console output
2. Web interface (auto-refresh setiap 10 detik)
3. API endpoints

### Performance
- Log file menggunakan JSON per line untuk performa optimal
- Tidak mempengaruhi kecepatan pengiriman pesan
- Async writes untuk non-blocking operations

## 🔒 Security

- Log disimpan secara lokal di server
- Tidak ada data yang dikirim ke pihak ketiga
- File log dapat di-encrypt jika diperlukan

## 📝 Contoh Penggunaan

### Tracking Pesan User Tertentu
```javascript
// Filter messages from specific user
const logs = await fetch('/api/logs/messages?limit=1000')
  .then(r => r.json())
  
const userMessages = logs.data.filter(msg => 
  msg.from.includes('6281234567890') || 
  msg.to.includes('6281234567890')
)
```

### Analisis Penggunaan Per Session
```javascript
const stats = await fetch('/api/logs/statistics?sessionId=joki-1')
  .then(r => r.json())
  
console.log('Total messages:', stats.data.totalMessages)
console.log('Message types:', stats.data.messageTypes)
```

## 🎯 Best Practices

1. **Regular Cleanup**: Jalankan cleanup rutin untuk menghapus log lama
2. **Backup**: Backup file log secara berkala
3. **Monitoring**: Pantau ukuran file log
4. **Analysis**: Gunakan statistik untuk analisis penggunaan

## 🐛 Troubleshooting

### Log tidak tersimpan
- Pastikan folder `logs/` memiliki permission write
- Check console untuk error

### File log terlalu besar
- Jalankan `logger.clearOldLogs(30)` untuk cleanup
- Kurangi retention period

### Statistics tidak akurat
- Refresh browser atau panggil API lagi
- Check apakah semua session terhubung

## 📞 Support

Jika ada masalah atau pertanyaan, check:
1. Console output untuk error messages
2. File log untuk detail aktivitas
3. Web interface untuk monitoring

---

**Happy Logging! 📊**
