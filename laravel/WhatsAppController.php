<?php

namespace App\Http\Controllers;

use App\Services\WhatsAppService;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

/**
 * Contoh Controller untuk WhatsApp API
 * Copy dan sesuaikan dengan kebutuhan Anda
 */
class WhatsAppController extends Controller
{
    protected WhatsAppService $whatsapp;

    public function __construct(WhatsAppService $whatsapp)
    {
        $this->whatsapp = $whatsapp;
    }

    /**
     * Kirim pesan teks
     * POST /whatsapp/send
     */
    public function send(Request $request): JsonResponse
    {
        $request->validate([
            'phone' => 'required|string',
            'message' => 'required|string',
            'session' => 'nullable|string',
        ]);

        $result = $this->whatsapp->sendText(
            $request->phone,
            $request->message,
            $request->session
        );

        return response()->json($result);
    }

    /**
     * Kirim gambar
     * POST /whatsapp/send-image
     */
    public function sendImage(Request $request): JsonResponse
    {
        $request->validate([
            'phone' => 'required|string',
            'image_url' => 'required|url',
            'caption' => 'nullable|string',
            'session' => 'nullable|string',
        ]);

        $result = $this->whatsapp->sendImage(
            $request->phone,
            $request->image_url,
            $request->caption ?? '',
            $request->session
        );

        return response()->json($result);
    }

    /**
     * Kirim dokumen
     * POST /whatsapp/send-document
     */
    public function sendDocument(Request $request): JsonResponse
    {
        $request->validate([
            'phone' => 'required|string',
            'document_url' => 'required|url',
            'filename' => 'nullable|string',
            'session' => 'nullable|string',
        ]);

        $result = $this->whatsapp->sendDocument(
            $request->phone,
            $request->document_url,
            $request->filename ?? '',
            $request->session
        );

        return response()->json($result);
    }

    /**
     * Broadcast ke banyak nomor
     * POST /whatsapp/broadcast
     */
    public function broadcast(Request $request): JsonResponse
    {
        $request->validate([
            'phones' => 'required|array|min:1',
            'phones.*' => 'required|string',
            'message' => 'required|string',
            'session' => 'nullable|string',
            'delay' => 'nullable|integer|min:1000',
        ]);

        $result = $this->whatsapp->broadcast(
            $request->phones,
            $request->message,
            $request->session,
            $request->delay ?? 2000
        );

        return response()->json($result);
    }

    /**
     * Cek status session
     * GET /whatsapp/status/{session?}
     */
    public function status(string $session = 'default'): JsonResponse
    {
        $result = $this->whatsapp->getSessionStatus($session);
        return response()->json($result);
    }

    /**
     * List semua session
     * GET /whatsapp/sessions
     */
    public function sessions(): JsonResponse
    {
        $result = $this->whatsapp->getSessions();
        return response()->json($result);
    }

    /**
     * Dapatkan QR Code
     * GET /whatsapp/qr/{session}
     */
    public function qrCode(string $session): JsonResponse
    {
        $result = $this->whatsapp->getQRCode($session);
        return response()->json($result);
    }

    /**
     * List semua grup
     * GET /whatsapp/groups/{session?}
     */
    public function groups(string $session = 'default'): JsonResponse
    {
        $result = $this->whatsapp->getGroups($session);
        return response()->json($result);
    }

    /**
     * Kirim pesan ke grup
     * POST /whatsapp/groups/send
     */
    public function sendToGroup(Request $request): JsonResponse
    {
        $request->validate([
            'group_id' => 'required|string',
            'message' => 'required|string',
            'session' => 'nullable|string',
        ]);

        $result = $this->whatsapp->sendToGroup(
            $request->group_id,
            $request->message,
            $request->session
        );

        return response()->json($result);
    }

    /**
     * Cek nomor terdaftar di WhatsApp
     * GET /whatsapp/check/{phone}
     */
    public function checkNumber(string $phone): JsonResponse
    {
        $result = $this->whatsapp->isRegistered($phone);
        return response()->json($result);
    }
}
