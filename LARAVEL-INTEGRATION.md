# 🔗 Integrasi WhatsApp API dengan Laravel

Panduan menggunakan WhatsApp Multi-Session API di proyek Laravel.

## Persyaratan

- WhatsApp API sudah berjalan di `http://localhost:8080`
- Laravel 8+ dengan Guzzle HTTP Client

---

## 📦 Instalasi di Laravel

### 1. Install Guzzle (jika belum ada)

```bash
composer require guzzlehttp/guzzle
```

### 2. Copy File Service

Copy file `WhatsAppService.php` ke folder `app/Services/` di proyek Laravel Anda.

```
app/
└── Services/
    └── WhatsAppService.php
```

### 3. Konfigurasi Environment

Tambahkan di file `.env` Laravel:

```env
WHATSAPP_API_URL=http://localhost:8080
WHATSAPP_API_KEY=your-api-key-here
```

Tambahkan di `config/services.php`:

```php
'whatsapp' => [
    'api_url' => env('WHATSAPP_API_URL', 'http://localhost:8080'),
    'api_key' => env('WHATSAPP_API_KEY', ''),
],
```

---

## 🚀 Cara Penggunaan

### Basic Usage

```php
use App\Services\WhatsAppService;

// Inisialisasi
$wa = new WhatsAppService();

// Kirim pesan teks
$wa->sendText('6281234567890', 'Halo dari Laravel!', 'session1');

// Kirim gambar
$wa->sendImage('6281234567890', 'https://example.com/image.jpg', 'Caption gambar', 'session1');

// Kirim dokumen
$wa->sendDocument('6281234567890', 'https://example.com/file.pdf', 'document.pdf', 'session1');
```

### Di Controller

```php
<?php

namespace App\Http\Controllers;

use App\Services\WhatsAppService;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    protected $whatsapp;

    public function __construct(WhatsAppService $whatsapp)
    {
        $this->whatsapp = $whatsapp;
    }

    public function sendOrderNotification(Request $request)
    {
        $phone = $request->phone;
        $orderId = $request->order_id;
        
        $message = "🛒 *Pesanan Baru!*\n\n";
        $message .= "Order ID: #{$orderId}\n";
        $message .= "Terima kasih telah berbelanja!";

        $result = $this->whatsapp->sendText($phone, $message);

        return response()->json($result);
    }
}
```

### Dengan Dependency Injection (Service Provider)

Buat file `app/Providers/WhatsAppServiceProvider.php`:

```php
<?php

namespace App\Providers;

use App\Services\WhatsAppService;
use Illuminate\Support\ServiceProvider;

class WhatsAppServiceProvider extends ServiceProvider
{
    public function register()
    {
        $this->app->singleton(WhatsAppService::class, function ($app) {
            return new WhatsAppService();
        });
    }
}
```

Daftarkan di `config/app.php`:

```php
'providers' => [
    // ...
    App\Providers\WhatsAppServiceProvider::class,
],
```

---

## 📋 Contoh Kasus Penggunaan

### 1. Notifikasi Order E-Commerce

```php
public function orderCreated(Order $order)
{
    $message = "🛍️ *Pesanan Diterima*\n\n";
    $message .= "No. Pesanan: #{$order->id}\n";
    $message .= "Total: Rp " . number_format($order->total) . "\n";
    $message .= "Status: Menunggu Pembayaran\n\n";
    $message .= "Silakan selesaikan pembayaran dalam 24 jam.";

    $this->whatsapp->sendText($order->customer_phone, $message);
}
```

### 2. OTP Verification

```php
public function sendOTP($phone)
{
    $otp = rand(100000, 999999);
    
    // Simpan OTP ke cache/database
    Cache::put("otp_{$phone}", $otp, now()->addMinutes(5));

    $message = "🔐 Kode OTP Anda: *{$otp}*\n\n";
    $message .= "Berlaku 5 menit.\n";
    $message .= "Jangan bagikan kode ini kepada siapapun.";

    return $this->whatsapp->sendText($phone, $message);
}
```

### 3. Reminder/Scheduler

```php
// Di app/Console/Commands/SendReminder.php
public function handle()
{
    $wa = new WhatsAppService();
    
    $appointments = Appointment::where('date', today()->addDay())->get();
    
    foreach ($appointments as $apt) {
        $message = "⏰ *Pengingat Jadwal*\n\n";
        $message .= "Anda memiliki jadwal besok:\n";
        $message .= "📅 {$apt->date->format('d M Y')}\n";
        $message .= "🕐 {$apt->time}\n";
        $message .= "📍 {$apt->location}";

        $wa->sendText($apt->phone, $message);
    }
}
```

### 4. Broadcast ke Banyak Nomor

```php
public function broadcastPromo()
{
    $wa = new WhatsAppService();
    
    $customers = Customer::where('subscribe_promo', true)->get();
    $phones = $customers->pluck('phone')->toArray();

    $message = "🎉 *PROMO SPESIAL!*\n\n";
    $message .= "Diskon 50% untuk semua produk!\n";
    $message .= "Berlaku sampai akhir bulan.";

    // Broadcast dengan delay otomatis
    return $wa->broadcast($phones, $message, 'default', 2000);
}
```

### 5. Kirim Invoice PDF

```php
public function sendInvoice(Invoice $invoice)
{
    // Generate PDF
    $pdf = PDF::loadView('invoices.pdf', compact('invoice'));
    $pdfPath = storage_path("app/invoices/INV-{$invoice->id}.pdf");
    $pdf->save($pdfPath);

    // Upload dan kirim via WhatsApp
    $wa = new WhatsAppService();
    
    // Kirim teks dulu
    $wa->sendText($invoice->customer_phone, "📄 Berikut invoice Anda:");
    
    // Kirim dokumen (perlu endpoint upload file)
    // Atau gunakan URL publik jika ada
}
```

---

## 🔧 Endpoint API yang Tersedia

| Method | Endpoint | Fungsi |
|--------|----------|--------|
| GET | `/api/sessions` | List semua session |
| POST | `/api/sessions` | Buat session baru |
| GET | `/api/sessions/{id}/status` | Status session |
| GET | `/api/sessions/{id}/qr` | Dapatkan QR code |
| POST | `/api/send-message` | Kirim pesan teks |
| POST | `/api/send-image` | Kirim gambar |
| POST | `/api/send-document` | Kirim dokumen |
| POST | `/api/send-video` | Kirim video |
| POST | `/api/send-audio` | Kirim audio |
| POST | `/api/broadcast` | Broadcast ke banyak nomor |
| GET | `/api/groups/{session}` | List grup |
| POST | `/api/groups/{session}/{groupId}/send` | Kirim ke grup |

---

## ⚠️ Tips & Best Practices

1. **Gunakan Queue untuk Bulk Send**
   ```php
   // Dispatch ke queue agar tidak blocking
   SendWhatsAppJob::dispatch($phone, $message);
   ```

2. **Handle Error dengan Try-Catch**
   ```php
   try {
       $result = $wa->sendText($phone, $message);
   } catch (\Exception $e) {
       Log::error('WhatsApp Error: ' . $e->getMessage());
   }
   ```

3. **Validasi Nomor Telepon**
   ```php
   // Format: 628xxx (tanpa + atau 0)
   $phone = preg_replace('/^(\+62|62|0)/', '62', $phone);
   ```

4. **Rate Limiting**
   - Jangan kirim terlalu cepat (minimal delay 1-2 detik antar pesan)
   - Gunakan broadcast endpoint untuk banyak nomor

5. **Session Management**
   - Pastikan session sudah connected sebelum kirim
   - Cek status session secara berkala

---

## 🆘 Troubleshooting

### Connection Refused
- Pastikan WhatsApp API berjalan di port 8080
- Cek dengan: `pm2 status`

### Session Not Connected
- Scan ulang QR code di dashboard: http://localhost:8080

### Pesan Tidak Terkirim
- Cek format nomor (harus 628xxx)
- Cek logs: `pm2 logs baileys-waapi`
