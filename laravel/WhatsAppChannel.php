<?php

namespace App\Notifications;

use App\Services\WhatsAppService;
use Illuminate\Notifications\Notification;

/**
 * WhatsApp Notification Channel untuk Laravel
 * 
 * Penggunaan di Model:
 * 
 * public function routeNotificationForWhatsapp(): string
 * {
 *     return $this->phone; // field nomor telepon di model
 * }
 * 
 * Penggunaan di Notification:
 * 
 * public function via($notifiable): array
 * {
 *     return [WhatsAppChannel::class];
 * }
 * 
 * public function toWhatsapp($notifiable): array
 * {
 *     return [
 *         'message' => 'Pesan WhatsApp Anda',
 *         'session' => 'default', // optional
 *     ];
 * }
 */
class WhatsAppChannel
{
    protected WhatsAppService $whatsapp;

    public function __construct(WhatsAppService $whatsapp)
    {
        $this->whatsapp = $whatsapp;
    }

    /**
     * Send the given notification.
     */
    public function send($notifiable, Notification $notification): void
    {
        // Dapatkan nomor telepon dari notifiable
        $phone = $notifiable->routeNotificationFor('whatsapp');
        
        if (!$phone) {
            return;
        }

        // Dapatkan data pesan dari notification
        $data = $notification->toWhatsapp($notifiable);

        if (is_string($data)) {
            $data = ['message' => $data];
        }

        $message = $data['message'] ?? '';
        $session = $data['session'] ?? 'default';
        $type = $data['type'] ?? 'text';

        match ($type) {
            'image' => $this->whatsapp->sendImage(
                $phone, 
                $data['media_url'] ?? '', 
                $message, 
                $session
            ),
            'document' => $this->whatsapp->sendDocument(
                $phone, 
                $data['media_url'] ?? '', 
                $data['filename'] ?? '', 
                $session
            ),
            default => $this->whatsapp->sendText($phone, $message, $session),
        };
    }
}
