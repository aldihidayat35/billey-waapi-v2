<?php

/**
 * Contoh penggunaan langsung WhatsApp Service di berbagai kasus
 * Tanpa Controller - bisa digunakan di mana saja
 */

use App\Services\WhatsAppService;
use Illuminate\Support\Facades\Cache;

// =====================================================
// 1. BASIC: Kirim Pesan Sederhana
// =====================================================

$wa = new WhatsAppService();

// Kirim teks
$wa->sendText('08123456789', 'Halo, ini pesan dari Laravel!');

// Kirim dengan session tertentu
$wa->sendText('08123456789', 'Pesan dari session2', 'session2');


// =====================================================
// 2. OTP VERIFICATION
// =====================================================

function sendOTP(string $phone): array
{
    $wa = new WhatsAppService();
    $otp = rand(100000, 999999);
    
    // Simpan OTP ke cache (5 menit)
    Cache::put("otp_{$phone}", $otp, now()->addMinutes(5));
    
    $message = "🔐 *Kode Verifikasi*\n\n";
    $message .= "Kode OTP Anda: *{$otp}*\n\n";
    $message .= "⏰ Berlaku 5 menit\n";
    $message .= "⚠️ Jangan bagikan kode ini";
    
    return $wa->sendText($phone, $message);
}

function verifyOTP(string $phone, string $inputOtp): bool
{
    $storedOtp = Cache::get("otp_{$phone}");
    
    if ($storedOtp && $storedOtp == $inputOtp) {
        Cache::forget("otp_{$phone}");
        return true;
    }
    
    return false;
}


// =====================================================
// 3. ORDER NOTIFICATION
// =====================================================

function notifyNewOrder($order): void
{
    $wa = new WhatsAppService();
    
    $message = "🛍️ *Pesanan Baru!*\n\n";
    $message .= "Order: #{$order->id}\n";
    $message .= "Pelanggan: {$order->customer_name}\n";
    $message .= "Total: Rp " . number_format($order->total) . "\n\n";
    $message .= "Item:\n";
    
    foreach ($order->items as $item) {
        $message .= "• {$item->name} x{$item->qty}\n";
    }
    
    // Kirim ke pelanggan
    $wa->sendText($order->customer_phone, $message);
    
    // Kirim ke admin
    $wa->sendText('6281234567890', "📦 Order baru #{$order->id} masuk!");
}


// =====================================================
// 4. PAYMENT REMINDER (Scheduler)
// =====================================================

// Di app/Console/Kernel.php:
// $schedule->call(function () {
//     sendPaymentReminders();
// })->dailyAt('09:00');

function sendPaymentReminders(): void
{
    $wa = new WhatsAppService();
    
    // Ambil invoice yang belum dibayar dan jatuh tempo besok
    $invoices = \App\Models\Invoice::where('status', 'unpaid')
        ->whereDate('due_date', today()->addDay())
        ->get();
    
    foreach ($invoices as $invoice) {
        $message = "⏰ *Pengingat Pembayaran*\n\n";
        $message .= "Invoice: #{$invoice->id}\n";
        $message .= "Jumlah: Rp " . number_format($invoice->amount) . "\n";
        $message .= "Jatuh tempo: *BESOK*\n\n";
        $message .= "Segera lakukan pembayaran untuk menghindari denda.\n\n";
        $message .= "Terima kasih 🙏";
        
        $wa->sendText($invoice->customer_phone, $message);
        
        // Delay 2 detik antar pesan
        sleep(2);
    }
}


// =====================================================
// 5. BROADCAST PROMO
// =====================================================

function broadcastPromo(string $promoText, array $customerPhones): array
{
    $wa = new WhatsAppService();
    
    // Gunakan fitur broadcast bawaan (dengan delay otomatis)
    return $wa->broadcast($customerPhones, $promoText, 'default', 3000);
}

// Atau manual dengan queue:
function broadcastWithQueue(string $message): void
{
    $customers = \App\Models\Customer::where('subscribe_promo', true)->get();
    
    foreach ($customers as $index => $customer) {
        // Dispatch dengan delay bertingkat
        \App\Jobs\SendWhatsAppJob::dispatch($customer->phone, $message)
            ->delay(now()->addSeconds($index * 3));
    }
}


// =====================================================
// 6. SHIPPING UPDATE
// =====================================================

function notifyShippingUpdate($order, string $status, string $trackingInfo = ''): void
{
    $wa = new WhatsAppService();
    
    $statusEmoji = match($status) {
        'processing' => '📦',
        'shipped' => '🚚',
        'in_transit' => '🛣️',
        'delivered' => '✅',
        default => '📋',
    };
    
    $statusText = match($status) {
        'processing' => 'Sedang Diproses',
        'shipped' => 'Telah Dikirim',
        'in_transit' => 'Dalam Perjalanan',
        'delivered' => 'Telah Diterima',
        default => $status,
    };
    
    $message = "{$statusEmoji} *Update Pengiriman*\n\n";
    $message .= "Order: #{$order->id}\n";
    $message .= "Status: *{$statusText}*\n";
    
    if ($trackingInfo) {
        $message .= "Resi: {$trackingInfo}\n";
    }
    
    $wa->sendText($order->customer_phone, $message);
}


// =====================================================
// 7. CUSTOMER SERVICE AUTO-REPLY (Webhook)
// =====================================================

// Di Controller yang menerima webhook dari WhatsApp API:
function handleIncomingMessage(array $data): void
{
    $wa = new WhatsAppService();
    
    $from = $data['from'];
    $message = strtolower($data['message']);
    
    // Simple keyword matching
    $reply = match(true) {
        str_contains($message, 'harga') => "💰 Untuk info harga, silakan kunjungi: https://website.com/price",
        str_contains($message, 'jam') || str_contains($message, 'buka') => "🕐 Jam operasional kami:\nSenin-Jumat: 08:00-17:00\nSabtu: 08:00-12:00",
        str_contains($message, 'alamat') || str_contains($message, 'lokasi') => "📍 Alamat kami:\nJl. Contoh No. 123\nJakarta Selatan",
        str_contains($message, 'order') || str_contains($message, 'pesan') => "🛒 Untuk pemesanan, silakan klik:\nhttps://website.com/order",
        default => "Halo! 👋\n\nTerima kasih telah menghubungi kami.\n\nKetik:\n• *harga* - Info harga\n• *jam* - Jam buka\n• *alamat* - Lokasi kami\n• *order* - Cara pemesanan\n\nAtau tunggu admin kami membalas.",
    };
    
    $wa->sendText($from, $reply);
}


// =====================================================
// 8. REPORT/INVOICE PDF
// =====================================================

function sendInvoicePDF($invoice): void
{
    $wa = new WhatsAppService();
    
    // Generate PDF (contoh dengan DomPDF)
    $pdf = \PDF::loadView('invoices.pdf', compact('invoice'));
    $filename = "Invoice-{$invoice->id}.pdf";
    
    // Simpan ke storage
    $path = "invoices/{$filename}";
    \Storage::put("public/{$path}", $pdf->output());
    
    // Dapatkan URL publik
    $url = url("storage/{$path}");
    
    // Kirim pesan + dokumen
    $message = "📄 *Invoice #{$invoice->id}*\n\n";
    $message .= "Total: Rp " . number_format($invoice->total) . "\n";
    $message .= "Jatuh tempo: " . $invoice->due_date->format('d M Y');
    
    $wa->sendText($invoice->customer_phone, $message);
    
    // Delay sedikit lalu kirim PDF
    sleep(1);
    $wa->sendDocument($invoice->customer_phone, $url, $filename);
}
