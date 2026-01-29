<?php

namespace App\Services;

use GuzzleHttp\Client;
use GuzzleHttp\Exception\GuzzleException;
use Illuminate\Support\Facades\Log;

/**
 * WhatsApp Service untuk integrasi dengan Baileys WhatsApp API
 * 
 * @author Billey WA-API
 * @version 1.0.0
 */
class WhatsAppService
{
    protected Client $client;
    protected string $baseUrl;
    protected string $apiKey;
    protected string $defaultSession;

    public function __construct()
    {
        $this->baseUrl = config('services.whatsapp.api_url', 'http://localhost:8080');
        $this->apiKey = config('services.whatsapp.api_key', '');
        $this->defaultSession = config('services.whatsapp.default_session', 'default');

        $this->client = new Client([
            'base_uri' => $this->baseUrl,
            'timeout' => 30,
            'headers' => [
                'Content-Type' => 'application/json',
                'Accept' => 'application/json',
                'Authorization' => 'Bearer ' . $this->apiKey,
            ],
        ]);
    }

    /**
     * Format nomor telepon ke format WhatsApp (628xxx)
     */
    public function formatPhone(string $phone): string
    {
        // Hapus spasi, dash, dan karakter non-angka
        $phone = preg_replace('/[^0-9]/', '', $phone);
        
        // Konversi 08xxx ke 628xxx
        if (str_starts_with($phone, '0')) {
            $phone = '62' . substr($phone, 1);
        }
        
        // Pastikan dimulai dengan 62
        if (!str_starts_with($phone, '62')) {
            $phone = '62' . $phone;
        }

        return $phone;
    }

    /**
     * Kirim pesan teks
     */
    public function sendText(string $phone, string $message, ?string $session = null): array
    {
        return $this->request('POST', '/api/send-message', [
            'sessionId' => $session ?? $this->defaultSession,
            'to' => $this->formatPhone($phone),
            'text' => $message,
        ]);
    }

    /**
     * Kirim gambar dengan caption
     */
    public function sendImage(string $phone, string $imageUrl, string $caption = '', ?string $session = null): array
    {
        return $this->request('POST', '/api/send-image', [
            'sessionId' => $session ?? $this->defaultSession,
            'to' => $this->formatPhone($phone),
            'imageUrl' => $imageUrl,
            'caption' => $caption,
        ]);
    }

    /**
     * Kirim dokumen/file
     */
    public function sendDocument(string $phone, string $documentUrl, string $filename = '', ?string $session = null): array
    {
        return $this->request('POST', '/api/send-document', [
            'sessionId' => $session ?? $this->defaultSession,
            'to' => $this->formatPhone($phone),
            'documentUrl' => $documentUrl,
            'filename' => $filename ?: basename($documentUrl),
        ]);
    }

    /**
     * Kirim video
     */
    public function sendVideo(string $phone, string $videoUrl, string $caption = '', ?string $session = null): array
    {
        return $this->request('POST', '/api/send-video', [
            'sessionId' => $session ?? $this->defaultSession,
            'to' => $this->formatPhone($phone),
            'videoUrl' => $videoUrl,
            'caption' => $caption,
        ]);
    }

    /**
     * Kirim audio/voice note
     */
    public function sendAudio(string $phone, string $audioUrl, ?string $session = null): array
    {
        return $this->request('POST', '/api/send-audio', [
            'sessionId' => $session ?? $this->defaultSession,
            'to' => $this->formatPhone($phone),
            'audioUrl' => $audioUrl,
        ]);
    }

    /**
     * Kirim lokasi
     */
    public function sendLocation(string $phone, float $latitude, float $longitude, string $name = '', ?string $session = null): array
    {
        return $this->request('POST', '/api/send-location', [
            'sessionId' => $session ?? $this->defaultSession,
            'to' => $this->formatPhone($phone),
            'latitude' => $latitude,
            'longitude' => $longitude,
            'name' => $name,
        ]);
    }

    /**
     * Kirim contact/vCard
     */
    public function sendContact(string $phone, string $contactName, string $contactPhone, ?string $session = null): array
    {
        return $this->request('POST', '/api/send-contact', [
            'sessionId' => $session ?? $this->defaultSession,
            'to' => $this->formatPhone($phone),
            'contactName' => $contactName,
            'contactPhone' => $this->formatPhone($contactPhone),
        ]);
    }

    /**
     * Kirim pesan dengan tombol (buttons)
     */
    public function sendButtons(string $phone, string $text, array $buttons, string $footer = '', ?string $session = null): array
    {
        return $this->request('POST', '/api/send-buttons', [
            'sessionId' => $session ?? $this->defaultSession,
            'to' => $this->formatPhone($phone),
            'text' => $text,
            'footer' => $footer,
            'buttons' => $buttons,
        ]);
    }

    /**
     * Kirim pesan dengan list menu
     */
    public function sendList(string $phone, string $text, string $buttonText, array $sections, string $footer = '', ?string $session = null): array
    {
        return $this->request('POST', '/api/send-list', [
            'sessionId' => $session ?? $this->defaultSession,
            'to' => $this->formatPhone($phone),
            'text' => $text,
            'footer' => $footer,
            'buttonText' => $buttonText,
            'sections' => $sections,
        ]);
    }

    /**
     * Broadcast pesan ke banyak nomor
     */
    public function broadcast(array $phones, string $message, ?string $session = null, int $delay = 2000): array
    {
        $formattedPhones = array_map(fn($phone) => $this->formatPhone($phone), $phones);

        return $this->request('POST', '/api/broadcast', [
            'sessionId' => $session ?? $this->defaultSession,
            'phones' => $formattedPhones,
            'message' => $message,
            'delay' => $delay,
        ]);
    }

    /**
     * Kirim pesan ke grup
     */
    public function sendToGroup(string $groupId, string $message, ?string $session = null): array
    {
        return $this->request('POST', "/api/groups/{$session}/{$groupId}/send", [
            'sessionId' => $session ?? $this->defaultSession,
            'message' => $message,
        ]);
    }

    /**
     * Dapatkan semua grup
     */
    public function getGroups(?string $session = null): array
    {
        $sessionId = $session ?? $this->defaultSession;
        return $this->request('GET', "/api/groups/{$sessionId}");
    }

    /**
     * Dapatkan semua session
     */
    public function getSessions(): array
    {
        return $this->request('GET', '/api/sessions');
    }

    /**
     * Buat session baru
     */
    public function createSession(string $sessionId): array
    {
        return $this->request('POST', '/api/sessions', [
            'sessionId' => $sessionId,
        ]);
    }

    /**
     * Dapatkan status session
     */
    public function getSessionStatus(string $sessionId): array
    {
        return $this->request('GET', "/api/sessions/{$sessionId}/status");
    }

    /**
     * Dapatkan QR code untuk login
     */
    public function getQRCode(string $sessionId): array
    {
        return $this->request('GET', "/api/sessions/{$sessionId}/qr");
    }

    /**
     * Hapus/logout session
     */
    public function deleteSession(string $sessionId): array
    {
        return $this->request('DELETE', "/api/sessions/{$sessionId}");
    }

    /**
     * Cek apakah nomor terdaftar di WhatsApp
     */
    public function isRegistered(string $phone, ?string $session = null): array
    {
        return $this->request('GET', '/api/check-number', [
            'sessionId' => $session ?? $this->defaultSession,
            'phone' => $this->formatPhone($phone),
        ]);
    }

    /**
     * Dapatkan info profil nomor
     */
    public function getProfile(string $phone, ?string $session = null): array
    {
        return $this->request('GET', '/api/profile', [
            'sessionId' => $session ?? $this->defaultSession,
            'phone' => $this->formatPhone($phone),
        ]);
    }

    /**
     * Internal: Kirim HTTP request ke API
     */
    protected function request(string $method, string $endpoint, array $data = []): array
    {
        try {
            $options = [];

            if ($method === 'GET' && !empty($data)) {
                $options['query'] = $data;
            } elseif (!empty($data)) {
                $options['json'] = $data;
            }

            $response = $this->client->request($method, $endpoint, $options);
            $body = $response->getBody()->getContents();

            return [
                'success' => true,
                'status' => $response->getStatusCode(),
                'data' => json_decode($body, true),
            ];
        } catch (GuzzleException $e) {
            Log::error('WhatsApp API Error', [
                'endpoint' => $endpoint,
                'method' => $method,
                'error' => $e->getMessage(),
            ]);

            return [
                'success' => false,
                'status' => $e->getCode(),
                'error' => $e->getMessage(),
            ];
        }
    }

    /**
     * Set default session
     */
    public function setDefaultSession(string $sessionId): self
    {
        $this->defaultSession = $sessionId;
        return $this;
    }

    /**
     * Get default session
     */
    public function getDefaultSession(): string
    {
        return $this->defaultSession;
    }
}
