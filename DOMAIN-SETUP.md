# 🌐 Setup Local Domain - wa-api.api

## 📋 Cara Setup Domain Lokal

### Langkah 1: Jalankan Setup Script

**Klik kanan** pada file **`setup-domain.bat`** → **Run as Administrator**

Script akan:
1. ✅ Menambahkan entry ke Windows hosts file
2. ✅ Flush DNS cache
3. ✅ Verifikasi domain resolution

### Langkah 2: Verifikasi

Setelah setup selesai, test dengan:

```bash
# Test DNS resolution
ping wa-api.api

# Akses di browser
http://wa-api.api:8080
```

---

## 🔧 Manual Setup (Alternative)

Jika script tidak berfungsi, Anda bisa setup manual:

### 1. Buka Notepad as Administrator
- Tekan `Win + S`
- Ketik "notepad"
- Klik kanan → Run as administrator

### 2. Buka Hosts File
File → Open → Navigate ke:
```
C:\Windows\System32\drivers\etc\hosts
```
*Note: Pilih "All Files (*.*)" di dropdown untuk melihat file hosts*

### 3. Tambahkan Entry
Di akhir file, tambahkan baris ini:
```
# Baileys WhatsApp API Local Domain
127.0.0.1	wa-api.api
```

### 4. Save & Close
- Save file (Ctrl+S)
- Close Notepad

### 5. Flush DNS
Buka Command Prompt as Admin, jalankan:
```cmd
ipconfig /flushdns
```

---

## ✅ Testing

### Test DNS Resolution
```cmd
ping wa-api.api
```
Harus reply dari `127.0.0.1`

### Test di Browser
Buka browser dan akses:
```
http://wa-api.api:8080
```

### Test dengan CURL
```bash
curl http://wa-api.api:8080
```

---

## 🌐 URL Akses

Setelah setup, Anda bisa akses aplikasi dengan:

| Method | URL |
|--------|-----|
| **Domain Lokal** | `http://wa-api.api:8080` |
| Localhost | `http://localhost:8080` |
| IP Local | `http://127.0.0.1:8080` |

**Login Credentials:**
- Email: `admin@admin.com`
- Password: `admin123`

---

## 🗑️ Menghapus Domain

Jika ingin menghapus domain lokal:

**Klik kanan** pada **`remove-domain.bat`** → **Run as Administrator**

Atau manual:
1. Buka hosts file as Administrator
2. Hapus baris yang berisi `wa-api.api`
3. Save & flush DNS

---

## 📝 Catatan Penting

### Windows Defender / Antivirus
- Beberapa antivirus mungkin mem-block perubahan hosts file
- Pastikan script dijalankan sebagai Administrator
- Jika gagal, lakukan manual setup

### Domain Format
- ✅ Domain: `wa-api.api`
- ✅ URL: `http://wa-api.api:8080`
- ❌ Jangan lupa port `:8080`
- ❌ Tidak ada https (gunakan http)

### DNS Cache
- Jika domain tidak resolve, coba:
  ```cmd
  ipconfig /flushdns
  ipconfig /registerdns
  ```
- Restart browser setelah flush DNS
- Coba gunakan Incognito/Private mode

### Firewall
- Pastikan port 8080 tidak diblok firewall
- Jika perlu, tambahkan exception untuk port 8080

---

## 🔍 Troubleshooting

### Domain tidak resolve?
```bash
# 1. Check hosts file
notepad C:\Windows\System32\drivers\etc\hosts

# 2. Verify entry exists
findstr "wa-api.api" C:\Windows\System32\drivers\etc\hosts

# 3. Flush DNS
ipconfig /flushdns

# 4. Restart browser
```

### Browser tidak bisa akses?
```bash
# 1. Check port 8080 listening
netstat -ano | findstr :8080

# 2. Test with curl
curl http://wa-api.api:8080

# 3. Try localhost instead
http://localhost:8080
```

### "Access Denied" saat edit hosts?
- Pastikan run Notepad as Administrator
- Atau gunakan script `setup-domain.bat` (run as Admin)
- Check antivirus tidak memblok

---

## 📁 File Hosts Location

```
C:\Windows\System32\drivers\etc\hosts
```

**Format Entry:**
```
IP_ADDRESS    DOMAIN_NAME
127.0.0.1     wa-api.api
```

---

## 🎯 Contoh Lengkap

### After Setup Success:

```bash
# Test ping
> ping wa-api.api
Pinging wa-api.api [127.0.0.1] with 32 bytes of data:
Reply from 127.0.0.1: bytes=32 time<1ms TTL=128

# Access in browser
Browser: http://wa-api.api:8080
Status: ✅ Success - Login page loaded

# API Test
> curl http://wa-api.api:8080/api/sessions
Response: {"success":true,"sessions":[...]}
```

---

## ✨ Benefits

Menggunakan domain lokal `wa-api.api`:

1. ✅ **Lebih mudah diingat** daripada localhost:8080
2. ✅ **Professional** untuk demo/development
3. ✅ **Consistent** dengan production domain pattern
4. ✅ **Bookmark friendly** di browser
5. ✅ **Sharing** - mudah share URL dengan team

---

## 🔄 Update Domain

Jika ingin ganti domain:

1. Edit hosts file
2. Ganti `wa-api.api` dengan domain baru
3. Flush DNS
4. Update dokumentasi & bookmarks

**Contoh domain alternatif:**
- `baileys.local`
- `whatsapp-api.local`
- `wa.dev`
- `api.local`

---

*Setup Complete! Enjoy your custom domain!* 🎉
