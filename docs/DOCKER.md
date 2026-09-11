# 🐳 Docker Installation Guide

Panduan menjalankan WhatsApp Multi-Session API dengan Docker.

---

## 📋 Persyaratan

- [Docker](https://docs.docker.com/get-docker/) (v20.10+)
- [Docker Compose](https://docs.docker.com/compose/install/) (v2.0+)

---

## 🚀 Quick Start

### 1. Clone Repository

```bash
git clone https://github.com/aldihidayat35/billey-waapi-v2.git
cd billey-waapi-v2
```

### 2. Jalankan dengan Docker Compose

```bash
# Build dan start
docker-compose up -d

# Lihat logs
docker-compose logs -f
```

### 3. Akses Dashboard

Buka browser: **http://localhost:8080**

---

## 📦 Docker Commands

### Start / Stop

```bash
# Start (background)
docker-compose up -d

# Stop
docker-compose down

# Restart
docker-compose restart

# Stop dan hapus volumes
docker-compose down -v
```

### Logs & Monitoring

```bash
# Lihat logs realtime
docker-compose logs -f

# Lihat logs 100 baris terakhir
docker-compose logs --tail=100

# Status container
docker-compose ps

# Resource usage
docker stats whatsapp-api
```

### Build & Update

```bash
# Rebuild image
docker-compose build --no-cache

# Update dari repository
git pull
docker-compose up -d --build
```

### Masuk ke Container

```bash
# Bash shell
docker exec -it whatsapp-api sh

# Jalankan command
docker exec whatsapp-api ls -la /app/data
```

---

## 🔧 Konfigurasi

### Environment Variables

Edit di `docker-compose.yml`:

```yaml
environment:
  - NODE_ENV=production
  - PORT=8080
  - TZ=Asia/Jakarta
  # Tambahkan variabel lain sesuai kebutuhan
```

### Custom Port

Ubah port mapping di `docker-compose.yml`:

```yaml
ports:
  - "3000:8080"  # Akses via localhost:3000
```

### Volumes (Data Persistence)

Data disimpan di folder lokal:

| Container Path | Host Path | Isi |
|----------------|-----------|-----|
| `/app/data` | `./data` | Database SQLite |
| `/app/baileys_auth_info` | `./baileys_auth_info` | Session WhatsApp |

**⚠️ Jangan hapus folder ini jika ingin data tetap tersimpan!**

---

## 🌐 Deploy ke Server

### 1. Copy ke Server

```bash
# Dari lokal ke server
scp -r . user@server:/opt/whatsapp-api/
```

### 2. Di Server

```bash
cd /opt/whatsapp-api
docker-compose up -d
```

### 3. Setup Reverse Proxy (Nginx)

```nginx
server {
    listen 80;
    server_name wa-api.yourdomain.com;

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 4. SSL dengan Certbot

```bash
sudo certbot --nginx -d wa-api.yourdomain.com
```

---

## 🔄 Auto-Restart

Docker Compose sudah dikonfigurasi dengan `restart: unless-stopped`.
Container akan otomatis restart jika crash atau setelah server reboot.

Untuk memastikan Docker service auto-start:

```bash
sudo systemctl enable docker
```

---

## 🐛 Troubleshooting

### Container tidak bisa start

```bash
# Cek logs
docker-compose logs

# Rebuild
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Permission denied pada volume

```bash
# Fix permissions
sudo chown -R 1000:1000 ./data ./baileys_auth_info
```

### Out of memory

Tambahkan limit di `docker-compose.yml`:

```yaml
services:
  whatsapp-api:
    # ... config lain
    deploy:
      resources:
        limits:
          memory: 512M
```

### Port sudah digunakan

```bash
# Cari proses yang menggunakan port
sudo lsof -i :8080

# Atau ubah port di docker-compose.yml
ports:
  - "8081:8080"
```

---

## 📊 Health Check

API memiliki endpoint health check:

```bash
curl http://localhost:8080/api/health
```

Response jika OK:
```json
{
  "status": "ok",
  "uptime": 12345
}
```

---

## 🗑️ Cleanup

```bash
# Hapus container, network, tapi SIMPAN data
docker-compose down

# Hapus container, network, DAN volumes (DATA HILANG!)
docker-compose down -v

# Hapus image
docker rmi whatsapp-api

# Cleanup Docker system
docker system prune -a
```

---

## 📝 Docker Compose untuk Production

Untuk production, gunakan file terpisah:

```bash
# Buat docker-compose.prod.yml
docker-compose -f docker-compose.prod.yml up -d
```

Contoh `docker-compose.prod.yml`:

```yaml
services:
  whatsapp-api:
    image: whatsapp-api:latest
    container_name: whatsapp-api
    restart: always
    ports:
      - "127.0.0.1:8080:8080"  # Hanya localhost
    volumes:
      - /opt/whatsapp-data:/app/data
      - /opt/whatsapp-sessions:/app/baileys_auth_info
    environment:
      - NODE_ENV=production
      - PORT=8080
      - TZ=Asia/Jakarta
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```
