<?php

namespace App\Jobs;

use App\Services\WhatsAppService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

/**
 * Job untuk mengirim WhatsApp secara async (queue)
 * 
 * Penggunaan:
 * SendWhatsAppJob::dispatch('6281234567890', 'Pesan Anda');
 * SendWhatsAppJob::dispatch('6281234567890', 'Pesan', 'session1', 'image', 'https://url.com/img.jpg');
 */
class SendWhatsAppJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;
    public int $backoff = 10;

    protected string $phone;
    protected string $message;
    protected string $session;
    protected string $type;
    protected ?string $mediaUrl;
    protected ?string $filename;

    /**
     * Create a new job instance.
     */
    public function __construct(
        string $phone,
        string $message,
        string $session = 'default',
        string $type = 'text',
        ?string $mediaUrl = null,
        ?string $filename = null
    ) {
        $this->phone = $phone;
        $this->message = $message;
        $this->session = $session;
        $this->type = $type;
        $this->mediaUrl = $mediaUrl;
        $this->filename = $filename;
    }

    /**
     * Execute the job.
     */
    public function handle(WhatsAppService $whatsapp): void
    {
        try {
            $result = match ($this->type) {
                'image' => $whatsapp->sendImage($this->phone, $this->mediaUrl, $this->message, $this->session),
                'document' => $whatsapp->sendDocument($this->phone, $this->mediaUrl, $this->filename ?? '', $this->session),
                'video' => $whatsapp->sendVideo($this->phone, $this->mediaUrl, $this->message, $this->session),
                'audio' => $whatsapp->sendAudio($this->phone, $this->mediaUrl, $this->session),
                default => $whatsapp->sendText($this->phone, $this->message, $this->session),
            };

            if (!$result['success']) {
                Log::warning('WhatsApp job completed with error', [
                    'phone' => $this->phone,
                    'error' => $result['error'] ?? 'Unknown error',
                ]);
            }
        } catch (\Exception $e) {
            Log::error('WhatsApp job failed', [
                'phone' => $this->phone,
                'error' => $e->getMessage(),
            ]);
            throw $e;
        }
    }

    /**
     * Handle job failure
     */
    public function failed(\Throwable $exception): void
    {
        Log::error('WhatsApp job permanently failed', [
            'phone' => $this->phone,
            'message' => $this->message,
            'error' => $exception->getMessage(),
        ]);
    }
}
