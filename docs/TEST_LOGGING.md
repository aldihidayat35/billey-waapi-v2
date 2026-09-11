# 📋 Test Logging System

## Status: ✅ AKTIF

Server berjalan di: http://localhost:3000

## Cara Test:

### 1. Test Session Logs
- Buka http://localhost:3000
- Buat session baru atau scan QR existing session
- Setelah login, buka: http://localhost:3000/log-activity.html
- Lihat section "Log Session Login/Logout" → harusnya ada data login

### 2. Test Message Logs  
- Kirim pesan dari inbox
- Atau terima pesan dari WhatsApp ke nomor yang tersambung
- Refresh halaman log-activity.html
- Lihat section "Riwayat Pesan" → harusnya ada log pesan masuk/keluar

### 3. Test Statistics
- Lihat 4 kartu statistik di atas:
  - **Pesan Terkirim**: Total pesan outgoing
  - **Session Aktif**: Jumlah session yang login
  - **Error Terjadi**: 0 (belum ditrack)
  - **Total Aktivitas**: Total semua pesan

### 4. Test Filter
- Klik tombol filter: "Semua", "Pesan", "Session", dll
- Gunakan search box untuk cari session ID atau nomor

### 5. Lihat File Log Langsung
```bash
# Session logs
cat Baileys/logs/sessions.log

# Message logs  
cat Baileys/logs/messages.log
```

## Format Log:

### Session Log (sessions.log)
```json
{
  "timestamp": "2025-11-30T10:30:00.000Z",
  "sessionId": "joki-1",
  "action": "login",
  "user": {
    "id": "6283197544429:16@s.whatsapp.net",
    "name": "jokiin35"
  },
  "status": "connected"
}
```

### Message Log (messages.log)
```json
{
  "timestamp": "2025-11-30T10:31:00.000Z",
  "sessionId": "joki-1",
  "direction": "outgoing",
  "from": "6283197544429:16@s.whatsapp.net",
  "to": "628867867867@s.whatsapp.net",
  "messageType": "text",
  "content": "Hello",
  "status": "sent"
}
```

## Console Output:
Saat logging aktif, Anda akan lihat di terminal:

```
📋 [SESSION LOGIN] joki-1 - connected
   👤 User: jokiin35 (6283197544429:16@s.whatsapp.net)

📤 [OUTGOING] joki-1
   💬 text: 6283197544429:16@s.whatsapp.net → 628867867867@s.whatsapp.net
   💬 "Hello"
```

## Troubleshooting:

### Log tidak muncul di UI?
1. Cek browser console (F12) untuk error
2. Pastikan file `logs/sessions.log` dan `logs/messages.log` ada
3. Test API langsung:
   - http://localhost:3000/api/logs/sessions
   - http://localhost:3000/api/logs/messages
   - http://localhost:3000/api/logs/statistics

### Duplicate message di inbox?
✅ FIXED - handleReplySubmit tidak lagi add ke cache lokal

### "Unsupported message" error?
✅ FIXED - Pesan yang tidak didukung di-skip silently (console log saja)

### View log tidak ada data?
✅ FIXED - DOM elements sekarang diload setelah components ready

## API Endpoints:

- `GET /api/logs/sessions?limit=100` - Get session logs
- `GET /api/logs/messages?limit=100&sessionId=xxx` - Get message logs
- `GET /api/logs/statistics?sessionId=xxx` - Get statistics
- `GET /api/logs/date/2025-11-30?type=message` - Get logs by date

## Perbaikan Yang Dilakukan:

1. ✅ Fixed duplicate message di inbox UI
2. ✅ Fixed "Unsupported message" tidak ditampilkan
3. ✅ Fixed log-activity.js DOM loading issue
4. ✅ Fixed applyFilters menggunakan field yang benar
5. ✅ Fixed statistics mapping yang akurat
6. ✅ Added console logging untuk semua events
