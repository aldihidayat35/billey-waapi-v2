<?php

namespace App\Http\Controllers;

use App\Services\WhatsAppService;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use RuntimeException;

/**
 * Contoh Controller untuk WhatsApp API
 * Copy dan sesuaikan dengan kebutuhan Anda.
 *
 * Catatan:
 * - sendImage / sendDocument sekarang menerima PATH FILE LOKAL (string), bukan URL.
 *   Untuk kirim dari URL publik, gunakan sendMediaUrl() lewat route /whatsapp/send-media-url.
 * - Endpoint yang panggil method deprecated di service akan return HTTP 501
 *   dengan pesan error yang jelas (lihat LARAVEL-INTEGRATION.md).
 */
class WhatsAppController extends Controller
{
    protected WhatsAppService $whatsapp;

    public function __construct(WhatsAppService $whatsapp)
    {
        $this->whatsapp = $whatsapp;
    }

    /**
     * Kirim pesan teks.
     * POST /whatsapp/send
     */
    public function send(Request $request): JsonResponse
    {
        $request->validate([
            'phone' => 'required|string',
            'message' => 'required|string',
            'session' => 'nullable|string',
        ]);

        return $this->safeCall(fn () => $this->whatsapp->sendText(
            $request->phone,
            $request->message,
            $request->session
        ));
    }

    /**
     * Kirim gambar dari file lokal (multipart upload).
     * POST /whatsapp/send-image
     * Body: multipart/form-data, field 'file' = binary, 'phone' = nomor, 'caption' = optional
     */
    public function sendImage(Request $request): JsonResponse
    {
        $request->validate([
            'phone' => 'required|string',
            'file' => 'required|file',
            'caption' => 'nullable|string',
            'session' => 'nullable|string',
        ]);

        return $this->safeCall(fn () => $this->whatsapp->sendImage(
            $request->phone,
            $request->file('file')->getRealPath(),
            $request->caption ?? '',
            $request->session
        ));
    }

    /**
     * Kirim dokumen dari file lokal (multipart upload).
     * POST /whatsapp/send-document
     * Body: multipart/form-data, field 'file' = binary, 'phone', 'filename'?, 'caption'?
     */
    public function sendDocument(Request $request): JsonResponse
    {
        $request->validate([
            'phone' => 'required|string',
            'file' => 'required|file',
            'filename' => 'nullable|string',
            'caption' => 'nullable|string',
            'session' => 'nullable|string',
        ]);

        return $this->safeCall(fn () => $this->whatsapp->sendDocument(
            $request->phone,
            $request->file('file')->getRealPath(),
            $request->filename,
            $request->caption,
            $request->session
        ));
    }

    /**
     * Kirim media dari URL publik. Server yang download & dispatch
     * ke sendImage/sendVideo/sendDocument sesuai MIME type.
     * POST /whatsapp/send-media-url
     * Body (JSON): { phone, file_url, message?, caption?, mimetype?, filename?, session? }
     */
    public function sendMediaUrl(Request $request): JsonResponse
    {
        $request->validate([
            'phone' => 'required|string',
            'file_url' => 'required|url',
            'message' => 'nullable|string',
            'caption' => 'nullable|string',
            'mimetype' => 'nullable|string',
            'filename' => 'nullable|string',
            'session' => 'nullable|string',
        ]);

        return $this->safeCall(fn () => $this->whatsapp->sendMediaUrl(
            $request->phone,
            $request->file_url,
            $request->message,
            $request->caption,
            $request->mimetype,
            $request->filename,
            $request->session
        ));
    }

    /**
     * Cek status koneksi WhatsApp.
     * GET /whatsapp/status
     */
    public function status(): JsonResponse
    {
        return $this->safeCall(fn () => $this->whatsapp->getStatus());
    }

    /**
     * List semua session.
     * GET /whatsapp/sessions
     */
    public function sessions(): JsonResponse
    {
        return $this->safeCall(fn () => $this->whatsapp->getSessions());
    }

    /**
     * Trigger webhook order-status ke server.
     * POST /whatsapp/webhook/order-status
     */
    public function orderStatusWebhook(Request $request): JsonResponse
    {
        $request->validate([
            'order_id' => 'required|string',
            'status' => 'required|string',
            'nomor_client' => 'required|string',
            'session' => 'nullable|string',
        ]);

        return $this->safeCall(fn () => $this->whatsapp->webhookOrderStatus(
            $request->order_id,
            $request->status,
            $request->nomor_client,
            $request->session
        ));
    }

    /**
     * Broadcast ke banyak nomor — tidak didukung server.
     * Iterasi sendText() di sisi Laravel, atau gunakan queue.
     * POST /whatsapp/broadcast
     */
    public function broadcast(Request $request): JsonResponse
    {
        return $this->notSupported('broadcast');
    }

    /**
     * Kirim pesan ke grup — endpoint tidak tersedia di server.
     * POST /whatsapp/groups/send
     */
    public function sendToGroup(Request $request): JsonResponse
    {
        return $this->notSupported('sendToGroup');
    }

    /**
     * List semua grup — endpoint tidak tersedia di server.
     * GET /whatsapp/groups/{session?}
     */
    public function groups(string $session = 'default'): JsonResponse
    {
        return $this->notSupported('getGroups');
    }

    /**
     * Dapatkan QR Code — endpoint tidak tersedia. Scan QR lewat dashboard.
     * GET /whatsapp/qr/{session}
     */
    public function qrCode(string $session): JsonResponse
    {
        return $this->notSupported('getQRCode');
    }

    /**
     * Cek nomor terdaftar — endpoint tidak tersedia di server.
     * GET /whatsapp/check/{phone}
     */
    public function checkNumber(string $phone): JsonResponse
    {
        return $this->notSupported('isRegistered');
    }

    /**
     * Bungkus call ke service: kalau service throw RuntimeException
     * (method deprecated / tidak ada endpoint), balikin HTTP 501.
     * Kalau server return error (4xx/5xx), service udah balikin
     * array { success: false, ... } — teruskan apa adanya.
     */
    protected function safeCall(callable $fn): JsonResponse
    {
        try {
            $result = $fn();
            $status = is_array($result) && isset($result['status']) && is_int($result['status']) && $result['status'] >= 400
                ? $result['status']
                : 200;
            return response()->json($result, $status);
        } catch (RuntimeException $e) {
            return response()->json([
                'success' => false,
                'error' => $e->getMessage(),
            ], 501);
        }
    }

    protected function notSupported(string $method): JsonResponse
    {
        return response()->json([
            'success' => false,
            'error' => "WhatsAppService::{$method}() tidak didukung oleh server. Lihat LARAVEL-INTEGRATION.md untuk endpoint yang tersedia.",
        ], 501);
    }
}
