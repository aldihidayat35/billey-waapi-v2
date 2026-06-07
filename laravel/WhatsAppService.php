<?php

namespace App\Services;

use GuzzleHttp\Client;
use GuzzleHttp\Exception\GuzzleException;
use GuzzleHttp\Psr7\Utils;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * WhatsApp Service untuk integrasi dengan billey-waapi-v2 (Node.js + Baileys).
 *
 * Kontrak server mengikuti endpoint di web-server.ts:
 *   - Auth: header X-Api-Key (atau ?api_key= query)
 *   - Text:  POST /api/wa/send              (application/json)
 *   - Image: POST /api/wa/send-image        (multipart/form-data)
 *   - Doc:   POST /api/wa/send-document     (multipart/form-data)
 *   - Fwd:   POST /api/wa/forward           (application/json, support url/base64/multipart)
 *   - Stat:  GET  /api/wa/status
 *   - Sess:  GET  /api/sessions
 *   - Hook:  POST /api/webhook/order-status
 *
 * @author Billey WA-API
 * @version 2.0.0
 */
class WhatsAppService
{
    public const EP_SEND_TEXT = '/api/wa/send';
    public const EP_SEND_IMAGE = '/api/wa/send-image';
    public const EP_SEND_DOC = '/api/wa/send-document';
    public const EP_FORWARD = '/api/wa/forward';
    public const EP_STATUS = '/api/wa/status';
    public const EP_SESSIONS = '/api/sessions';
    public const EP_WEBHOOK = '/api/webhook/order-status';

    protected Client $client;
    protected string $baseUrl;
    protected string $apiKey;
    protected string $defaultSession;
    protected int $timeout;

    public function __construct()
    {
        $this->baseUrl = rtrim((string) config('services.whatsapp.api_url', 'http://localhost:8080'), '/');
        $this->apiKey = (string) config('services.whatsapp.api_key', '');
        $this->defaultSession = (string) config('services.whatsapp.default_session', 'default');
        $this->timeout = (int) config('services.whatsapp.timeout', 30);

        $this->client = new Client([
            'base_uri' => $this->baseUrl,
            'timeout' => $this->timeout,
            'http_errors' => false,
            'headers' => [
                'Accept' => 'application/json',
                'X-Api-Key' => $this->apiKey,
                'User-Agent' => 'Billey-Laravel-WA/2.0',
            ],
        ]);
    }

    public function formatPhone(string $phone): string
    {
        $phone = preg_replace('/[^0-9]/', '', $phone);
        if (str_starts_with($phone, '0')) {
            $phone = '62' . substr($phone, 1);
        }
        if ($phone === '' || !str_starts_with($phone, '62')) {
            $phone = '62' . $phone;
        }
        return $phone;
    }

    public function sendText(string $phone, string $message, ?string $session = null): array
    {
        return $this->request('POST', self::EP_SEND_TEXT, [
            'headers' => ['Content-Type' => 'application/json'],
            'json' => [
                'to' => $this->formatPhone($phone),
                'message' => $message,
                'session_id' => $session ?? $this->defaultSession,
            ],
        ]);
    }

    public function sendImage(string $phone, string $localFilePath, string $caption = '', ?string $session = null): array
    {
        if (!is_readable($localFilePath)) {
            throw new RuntimeException("File tidak ditemukan / tidak readable: {$localFilePath}");
        }

        $mime = mime_content_type($localFilePath) ?: 'application/octet-stream';

        return $this->request('POST', self::EP_SEND_IMAGE, [
            'multipart' => [
                ['name' => 'to', 'contents' => $this->formatPhone($phone)],
                ['name' => 'caption', 'contents' => $caption],
                ['name' => 'session_id', 'contents' => $session ?? $this->defaultSession],
                [
                    'name' => 'file',
                    'contents' => Utils::tryFopen($localFilePath, 'r'),
                    'filename' => basename($localFilePath),
                    'headers' => ['Content-Type' => $mime],
                ],
            ],
        ]);
    }

    public function sendDocument(string $phone, string $localFilePath, ?string $filename = null, ?string $caption = null, ?string $session = null): array
    {
        if (!is_readable($localFilePath)) {
            throw new RuntimeException("File tidak ditemukan / tidak readable: {$localFilePath}");
        }

        $mime = mime_content_type($localFilePath) ?: 'application/octet-stream';
        $displayName = $filename ?: basename($localFilePath);

        return $this->request('POST', self::EP_SEND_DOC, [
            'multipart' => [
                ['name' => 'to', 'contents' => $this->formatPhone($phone)],
                ['name' => 'filename', 'contents' => $displayName],
                ['name' => 'caption', 'contents' => $caption ?? ''],
                ['name' => 'session_id', 'contents' => $session ?? $this->defaultSession],
                [
                    'name' => 'file',
                    'contents' => Utils::tryFopen($localFilePath, 'r'),
                    'filename' => $displayName,
                    'headers' => ['Content-Type' => $mime],
                ],
            ],
        ]);
    }

    public function sendMediaUrl(
        string $phone,
        ?string $fileUrl = null,
        ?string $message = null,
        ?string $caption = null,
        ?string $mimetype = null,
        ?string $filename = null,
        ?string $session = null
    ): array {
        $body = [
            'to' => $this->formatPhone($phone),
            'session_id' => $session ?? $this->defaultSession,
        ];
        if ($message !== null) {
            $body['message'] = $message;
        }
        if ($fileUrl !== null) {
            $body['file_url'] = $fileUrl;
        }
        if ($caption !== null) {
            $body['caption'] = $caption;
        }
        if ($mimetype !== null) {
            $body['mimetype'] = $mimetype;
        }
        if ($filename !== null) {
            $body['filename'] = $filename;
        }

        return $this->request('POST', self::EP_FORWARD, [
            'headers' => ['Content-Type' => 'application/json'],
            'json' => $body,
        ]);
    }

    public function forwardFromBase64(
        string $phone,
        string $base64,
        ?string $mimetype = null,
        ?string $filename = null,
        ?string $message = null,
        ?string $caption = null,
        ?string $session = null
    ): array {
        $body = [
            'to' => $this->formatPhone($phone),
            'file_base64' => $base64,
            'session_id' => $session ?? $this->defaultSession,
        ];
        if ($message !== null) {
            $body['message'] = $message;
        }
        if ($caption !== null) {
            $body['caption'] = $caption;
        }
        if ($mimetype !== null) {
            $body['mimetype'] = $mimetype;
        }
        if ($filename !== null) {
            $body['filename'] = $filename;
        }

        return $this->request('POST', self::EP_FORWARD, [
            'headers' => ['Content-Type' => 'application/json'],
            'json' => $body,
        ]);
    }

    public function getStatus(): array
    {
        return $this->request('GET', self::EP_STATUS);
    }

    public function getSessions(): array
    {
        return $this->request('GET', self::EP_SESSIONS);
    }

    public function webhookOrderStatus(string $orderId, string $status, string $clientPhone, ?string $session = null): array
    {
        $body = [
            'order_id' => $orderId,
            'status' => $status,
            'nomor_client' => $this->formatPhone($clientPhone),
        ];
        if ($session !== null) {
            $body['session_id'] = $session;
        }

        return $this->request('POST', self::EP_WEBHOOK, [
            'headers' => ['Content-Type' => 'application/json'],
            'json' => $body,
        ]);
    }

    /** @deprecated Endpoint tidak tersedia di server. Gunakan sendMediaUrl() untuk video dari URL publik. */
    public function sendVideo(string $phone, string $videoUrl, string $caption = '', ?string $session = null): array
    {
        $this->throwUnsupported(__FUNCTION__);
    }

    /** @deprecated Endpoint tidak tersedia di server. Gunakan sendMediaUrl() untuk audio dari URL publik. */
    public function sendAudio(string $phone, string $audioUrl, ?string $session = null): array
    {
        $this->throwUnsupported(__FUNCTION__);
    }

    /** @deprecated Endpoint /api/send-location tidak tersedia di server. */
    public function sendLocation(string $phone, float $latitude, float $longitude, string $name = '', ?string $session = null): array
    {
        $this->throwUnsupported(__FUNCTION__);
    }

    /** @deprecated Endpoint /api/send-contact tidak tersedia di server. */
    public function sendContact(string $phone, string $contactName, string $contactPhone, ?string $session = null): array
    {
        $this->throwUnsupported(__FUNCTION__);
    }

    /** @deprecated Endpoint /api/send-buttons tidak tersedia di server. */
    public function sendButtons(string $phone, string $text, array $buttons, string $footer = '', ?string $session = null): array
    {
        $this->throwUnsupported(__FUNCTION__);
    }

    /** @deprecated Endpoint /api/send-list tidak tersedia di server. */
    public function sendList(string $phone, string $text, string $buttonText, array $sections, string $footer = '', ?string $session = null): array
    {
        $this->throwUnsupported(__FUNCTION__);
    }

    /** @deprecated Endpoint /api/broadcast tidak tersedia di server. Iterasi sendText() di sisi Laravel. */
    public function broadcast(array $phones, string $message, ?string $session = null, int $delay = 2000): array
    {
        $this->throwUnsupported(__FUNCTION__);
    }

    /** @deprecated Endpoint /api/groups/{session}/{groupId}/send tidak tersedia di server. */
    public function sendToGroup(string $groupId, string $message, ?string $session = null): array
    {
        $this->throwUnsupported(__FUNCTION__);
    }

    /** @deprecated Endpoint /api/groups/{session} tidak tersedia di server. */
    public function getGroups(?string $session = null): array
    {
        $this->throwUnsupported(__FUNCTION__);
    }

    /** @deprecated Endpoint /api/check-number tidak tersedia di server. */
    public function isRegistered(string $phone, ?string $session = null): array
    {
        $this->throwUnsupported(__FUNCTION__);
    }

    /** @deprecated Endpoint /api/profile tidak tersedia di server. */
    public function getProfile(string $phone, ?string $session = null): array
    {
        $this->throwUnsupported(__FUNCTION__);
    }

    /** @deprecated Server membuat session via UI/dashboard, bukan API. */
    public function createSession(string $sessionId): array
    {
        $this->throwUnsupported(__FUNCTION__);
    }

    /** @deprecated Server menghapus session via UI/dashboard, bukan API. */
    public function deleteSession(string $sessionId): array
    {
        $this->throwUnsupported(__FUNCTION__);
    }

    /** @deprecated Endpoint /api/sessions/{id}/qr tidak tersedia di server. Scan QR lewat dashboard. */
    public function getQRCode(string $sessionId): array
    {
        $this->throwUnsupported(__FUNCTION__);
    }

    /** @deprecated Endpoint /api/sessions/{id}/status tidak tersedia. Gunakan getStatus() untuk status global. */
    public function getSessionStatus(string $sessionId): array
    {
        $this->throwUnsupported(__FUNCTION__);
    }

    public function setDefaultSession(string $sessionId): self
    {
        $this->defaultSession = $sessionId;
        return $this;
    }

    public function getDefaultSession(): string
    {
        return $this->defaultSession;
    }

    protected function request(string $method, string $endpoint, array $options = []): array
    {
        try {
            $response = $this->client->request($method, $endpoint, $options);
            $status = $response->getStatusCode();
            $body = (string) $response->getBody();
            $decoded = json_decode($body, true);

            if ($status >= 400) {
                $err = is_array($decoded) ? ($decoded['error'] ?? $body) : $body;
                Log::warning('WhatsApp API non-2xx', [
                    'endpoint' => $endpoint,
                    'method' => $method,
                    'status' => $status,
                    'error' => $err,
                ]);
                return [
                    'success' => false,
                    'status' => $status,
                    'error' => $err,
                    'data' => is_array($decoded) ? ($decoded['data'] ?? null) : null,
                ];
            }

            return is_array($decoded) ? $decoded : ['success' => true, 'data' => $body];
        } catch (GuzzleException $e) {
            Log::error('WhatsApp API transport error', [
                'endpoint' => $endpoint,
                'method' => $method,
                'error' => $e->getMessage(),
            ]);
            return [
                'success' => false,
                'status' => $e->getCode() ?: 0,
                'error' => $e->getMessage(),
            ];
        }
    }

    protected function throwUnsupported(string $methodName): never
    {
        throw new RuntimeException(sprintf(
            'WhatsAppService::%s() tidak didukung oleh server saat ini. '
            . 'Lihat LARAVEL-INTEGRATION.md untuk endpoint yang tersedia. '
            . 'Untuk kirim media dari URL, gunakan sendMediaUrl(). '
            . 'Untuk broadcast ke banyak nomor, iterasi sendText() di sisi Laravel.',
            $methodName
        ));
    }
}
