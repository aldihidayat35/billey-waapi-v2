<?php

namespace App\Notifications;

use App\Notifications\WhatsAppChannel;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/**
 * Contoh Notification menggunakan WhatsApp Channel
 * 
 * Penggunaan:
 * $user->notify(new OrderConfirmation($order));
 */
class OrderConfirmation extends Notification
{
    use Queueable;

    protected $order;

    public function __construct($order)
    {
        $this->order = $order;
    }

    public function via($notifiable): array
    {
        return [WhatsAppChannel::class];
    }

    public function toWhatsapp($notifiable): array
    {
        $message = "🛒 *Konfirmasi Pesanan*\n\n";
        $message .= "Halo {$notifiable->name}!\n\n";
        $message .= "Pesanan Anda telah kami terima:\n";
        $message .= "━━━━━━━━━━━━━━━\n";
        $message .= "📋 No. Order: #{$this->order->id}\n";
        $message .= "📅 Tanggal: " . $this->order->created_at->format('d M Y H:i') . "\n";
        $message .= "💰 Total: Rp " . number_format($this->order->total, 0, ',', '.') . "\n";
        $message .= "━━━━━━━━━━━━━━━\n\n";
        $message .= "Status: *Menunggu Pembayaran*\n\n";
        $message .= "Silakan selesaikan pembayaran dalam 24 jam.\n\n";
        $message .= "Terima kasih! 🙏";

        return [
            'message' => $message,
            'session' => 'default',
        ];
    }
}
