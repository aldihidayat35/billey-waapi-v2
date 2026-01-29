<?php

/**
 * Routes untuk WhatsApp API
 * Tambahkan di routes/api.php atau routes/web.php
 */

use App\Http\Controllers\WhatsAppController;
use Illuminate\Support\Facades\Route;

Route::prefix('whatsapp')->group(function () {
    // Session management
    Route::get('/sessions', [WhatsAppController::class, 'sessions']);
    Route::get('/status/{session?}', [WhatsAppController::class, 'status']);
    Route::get('/qr/{session}', [WhatsAppController::class, 'qrCode']);

    // Kirim pesan
    Route::post('/send', [WhatsAppController::class, 'send']);
    Route::post('/send-image', [WhatsAppController::class, 'sendImage']);
    Route::post('/send-document', [WhatsAppController::class, 'sendDocument']);
    Route::post('/broadcast', [WhatsAppController::class, 'broadcast']);

    // Grup
    Route::get('/groups/{session?}', [WhatsAppController::class, 'groups']);
    Route::post('/groups/send', [WhatsAppController::class, 'sendToGroup']);

    // Utilitas
    Route::get('/check/{phone}', [WhatsAppController::class, 'checkNumber']);
});
