(function () {
    const h = React.createElement;

    function IconButton({ id, icon, title, className = '', style, onClick }) {
        return h('button', {
            id,
            title,
            type: 'button',
            style,
            onClick,
            className: `inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 ${className}`
        }, h('i', { className: `bi ${icon}` }));
    }

    function TopBar() {
        return h('header', { className: 'flex h-[72px] shrink-0 items-center gap-4 border-b border-slate-200 bg-white/95 px-5 shadow-sm backdrop-blur' }, [
            h('div', { key: 'brand', className: 'flex min-w-0 items-center gap-3' }, [
                h('div', { key: 'logo', className: 'flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500 text-2xl text-white shadow-lg shadow-emerald-500/25' },
                    h('i', { className: 'bi bi-whatsapp' })
                ),
                h('div', { key: 'text', className: 'min-w-0' }, [
                    h('div', { key: 'title', className: 'truncate text-xl font-extrabold tracking-tight text-slate-950 md:text-2xl' }, 'Message Center'),
                    h('div', { key: 'sub', className: 'hidden text-xs font-semibold text-slate-500 sm:block' }, 'WhatsApp API member workspace')
                ])
            ]),
            h('div', { key: 'sessions', id: 'session-tabs', className: 'wa-tabs mx-auto hidden md:flex' }),
            h('div', { key: 'status', className: 'desktop-only hidden items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-extrabold text-emerald-700 lg:flex' }, [
                h('span', { key: 'dot', className: 'h-3 w-3 rounded-full bg-emerald-500 shadow-[0_0_0_6px_rgba(16,185,129,.14)]' }),
                'Connected'
            ]),
            h('div', { key: 'actions', className: 'ml-auto flex items-center gap-2' }, [
                IconButton({ key: 'admin-dashboard', id: 'btn-admin-dashboard', icon: 'bi-house-door-fill', title: 'Dashboard Admin', style: { display: 'none' }, onClick: () => { location.href = '/'; } }),
                IconButton({ key: 'admin-penugasan', id: 'btn-admin-penugasan', icon: 'bi-person-check-fill', title: 'Penugasan Worker', style: { display: 'none' }, onClick: () => { location.href = '/penugasan.html'; } }),
                IconButton({ key: 'refresh', id: 'btn-refresh', icon: 'bi-arrow-clockwise', title: 'Refresh', className: 'desktop-only' }),
                IconButton({ key: 'read-all', id: 'btn-read-all', icon: 'bi-check2-all', title: 'Tandai semua dibaca', className: 'desktop-only' }),
                IconButton({ key: 'pwa', id: 'btn-pwa-install', icon: 'bi-download', title: 'Install Aplikasi', style: { display: 'none' } }),
                h('div', { key: 'profile', className: 'desktop-only ml-1 hidden items-center gap-3 rounded-2xl border border-slate-200 bg-white py-1.5 pl-1.5 pr-3 shadow-sm lg:flex' }, [
                    h('div', { key: 'avatar', className: 'flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-slate-200 to-slate-300 text-sm font-extrabold text-slate-700' },
                        h('i', { className: 'bi bi-person-fill' })
                    ),
                    h('span', { key: 'name', id: 'topbar-name', className: 'max-w-[150px] truncate text-sm font-extrabold text-slate-900' }, 'Admin'),
                    h('i', { key: 'chev', className: 'bi bi-chevron-down text-xs text-slate-500' })
                ]),
                IconButton({ key: 'logout', id: 'btn-logout', icon: 'bi-box-arrow-right', title: 'Keluar' })
            ])
        ]);
    }

    function ChatList() {
        return h('aside', { id: 'conv-panel', className: 'wa-conv flex w-[378px] shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white' }, [
            h('div', { key: 'mobile-tabs', id: 'session-tabs-mobile', className: 'md:hidden border-b border-slate-100 p-3 text-xs font-bold text-slate-500' }, 'Session aktif tampil di header desktop'),
            h('div', { key: 'head', className: 'border-b border-slate-100 p-5' }, [
                h('div', { key: 'row', className: 'mb-5 flex items-center justify-between' }, [
                    h('div', { key: 'title' }, [
                        h('h2', { key: 'h', className: 'text-lg font-extrabold tracking-tight text-slate-950' }, 'Daftar Chat'),
                        h('p', { key: 'p', className: 'mt-1 text-xs font-semibold text-slate-500' }, 'Percakapan dari session yang ditugaskan')
                    ]),
                    h('button', { key: 'new', type: 'button', className: 'flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-500' },
                        h('i', { className: 'bi bi-three-dots-vertical' })
                    )
                ]),
                h('label', { key: 'search', className: 'flex h-12 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 transition focus-within:border-emerald-300 focus-within:bg-white focus-within:ring-4 focus-within:ring-emerald-100' }, [
                    h('i', { key: 'icon', className: 'bi bi-search text-slate-500' }),
                    h('input', { key: 'input', id: 'conv-search-input', className: 'w-full bg-transparent text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-400', type: 'text', placeholder: 'Cari nomor atau nama...' })
                ]),
                h('div', { key: 'filters', className: 'mt-4 flex gap-2 overflow-x-auto' }, [
                    h('button', { key: 'all', type: 'button', className: 'rounded-xl border border-emerald-400 bg-emerald-50 px-4 py-2 text-sm font-extrabold text-emerald-700' }, 'Semua'),
                    h('button', { key: 'unread', type: 'button', className: 'rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600' }, 'Belum Dibaca'),
                    h('button', { key: 'media', type: 'button', className: 'rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600' }, 'Media')
                ])
            ]),
            h('div', { key: 'list', id: 'conv-list', className: 'wa-conv-list min-h-0 flex-1 overflow-y-auto' }, h(ConversationSkeleton))
        ]);
    }

    function ConversationSkeleton() {
        const rows = [0, 1, 2, 3, 4];
        return h('div', { id: 'conv-loading', className: 'space-y-4 p-5' }, rows.map(i =>
            h('div', { key: i, className: 'flex gap-3' }, [
                h('div', { key: 'a', className: 'skel h-14 w-14 rounded-full' }),
                h('div', { key: 'b', className: 'flex-1 pt-1' }, [
                    h('div', { key: 'b1', className: 'skel mb-3 h-3 w-2/3' }),
                    h('div', { key: 'b2', className: 'skel h-3 w-5/6' })
                ])
            ])
        ));
    }

    function ChatWindow() {
        return h('main', { id: 'chat-panel', className: 'wa-chat mob-hide relative flex min-w-0 flex-1 flex-col overflow-hidden bg-white' }, [
            h('div', { key: 'hdr', id: 'chat-hdr', className: 'chat-hdr d-none flex h-[84px] shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-6' }, [
                h('button', { key: 'back', id: 'btn-back', type: 'button', className: 'btn-back hidden h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600' },
                    h('i', { className: 'bi bi-arrow-left' })
                ),
                h('div', { key: 'avatar', id: 'chat-hdr-avatar', className: 'hdr-ava bg-emerald-500' }),
                h('div', { key: 'info', className: 'hdr-info' }, [
                    h('div', { key: 'name', id: 'chat-hdr-name', className: 'hdr-name truncate text-base font-extrabold text-slate-950' }, '-'),
                    h('div', { key: 'phone', id: 'chat-hdr-phone', className: 'hdr-sub mt-1 truncate text-sm font-semibold text-slate-500' }, '-')
                ]),
                h('span', { key: 'note', id: 'chat-hdr-note', className: 'note-icon-hdr d-none', title: 'Catatan penugasan' }, h('i', { className: 'bi bi-sticky-fill' })),
                h('span', { key: 'report', id: 'chat-hdr-report', className: 'report-icon-hdr', title: 'Laporan' }, h('i', { className: 'bi bi-flag-fill' })),
                h('button', { key: 'more', type: 'button', className: 'desktop-only flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-500' },
                    h('i', { className: 'bi bi-three-dots-vertical' })
                )
            ]),
            h('div', { key: 'banner', id: 'assignment-banner', className: 'assignment-banner d-none' }),
            h('section', { key: 'empty', id: 'chat-empty', className: 'chat-empty chat-surface flex flex-1 items-center justify-center p-8 text-center' }, [
                h('div', { key: 'content', className: 'max-w-sm' }, [
                    h('div', { key: 'icon', className: 'mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-50 text-4xl text-emerald-600 shadow-soft' },
                        h('i', { className: 'bi bi-chat-dots-fill' })
                    ),
                    h('h2', { key: 'title', className: 'text-xl font-extrabold text-slate-950' }, 'Pilih percakapan'),
                    h('p', { key: 'copy', className: 'mt-2 text-sm font-medium leading-6 text-slate-500' }, 'Buka kontak dari daftar chat untuk melihat riwayat pesan, media, dan catatan pelanggan.')
                ])
            ]),
            h('div', { key: 'messages', id: 'chat-messages', className: 'chat-msgs chat-surface d-none' }),
            h('div', { key: 'input', id: 'input-bar', className: 'chat-input d-none relative shrink-0 border-t border-slate-200 bg-white/95 px-5 py-4 backdrop-blur' }, [
                h(AttachmentMenu, { key: 'menu' }),
                h('button', { key: 'attach', id: 'btn-attach', type: 'button', className: 'btn-attach flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-xl text-slate-600 shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700', title: 'Lampirkan file' },
                    h('i', { className: 'bi bi-paperclip' })
                ),
                h('button', { key: 'tpl', id: 'btn-template', type: 'button', className: 'btn-template flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-lg text-amber-500 shadow-sm transition hover:border-amber-200 hover:bg-amber-50', title: 'Template Chat' },
                    h('i', { className: 'bi bi-lightning-charge-fill' })
                ),
                h('input', { key: 'file', type: 'file', id: 'file-input', style: { display: 'none' }, accept: 'image/*,video/*,audio/*,application/pdf,application/msword,.doc,.docx,.xlsx,.xls,.pptx,.ppt' }),
                h('textarea', { key: 'text', id: 'msg-input', rows: 1, placeholder: 'Ketik pesan...', className: 'min-h-[48px] flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 text-sm font-semibold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-300 focus:bg-white focus:ring-4 focus:ring-emerald-100' }),
                h('button', { key: 'send', id: 'btn-send', type: 'button', className: 'btn-send flex h-12 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-500 text-xl text-white shadow-lg shadow-emerald-500/25 transition hover:bg-emerald-600' },
                    h('i', { className: 'bi bi-send-fill' })
                )
            ])
        ]);
    }

    function AttachmentMenu() {
        const options = [
            ['image', 'bi-image-fill', 'Gambar', 'image/*'],
            ['video', 'bi-camera-video-fill', 'Video', 'video/*'],
            ['document', 'bi-file-earmark-text-fill', 'Dokumen', 'application/pdf,application/msword,.doc,.docx,.xlsx,.xls,.pptx,.ppt'],
            ['audio', 'bi-mic-fill', 'Audio', 'audio/*']
        ];
        return h('div', { id: 'attach-menu', className: 'attachment-menu' },
            options.map(([type, icon, label, accept]) =>
                h('button', { key: type, type: 'button', className: `attachment-option ${type}`, 'data-accept': accept }, [
                    h('i', { key: 'i', className: `bi ${icon}` }),
                    h('span', { key: 's' }, label)
                ])
            )
        );
    }

    function ContactDetailPanel() {
        const media = [
            ['image', 'bi-image-fill', 'Foto produk', 'Gambar'],
            ['video', 'bi-play-circle-fill', 'Video detail', 'Video'],
            ['document', 'bi-file-earmark-pdf-fill', 'Katalog produk', 'Dokumen'],
            ['audio', 'bi-volume-up-fill', 'Voice note', 'Audio']
        ];
        const activity = ['Pesan masuk diterima', 'Riwayat pesan disimpan', 'Media dapat diunduh'];

        return h('aside', { className: 'contact-panel flex w-[386px] shrink-0 flex-col overflow-y-auto border-l border-slate-200 bg-white p-5' }, [
            h('h2', { key: 'title', className: 'mb-5 text-lg font-extrabold text-slate-950' }, 'Detail Kontak'),
            h('section', { key: 'info', className: 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm' }, [
                h('div', { key: 'top', className: 'mb-4 flex items-center gap-3' }, [
                    h('div', { key: 'avatar', id: 'detail-avatar', className: 'flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-lg font-extrabold text-emerald-700' }, 'WA'),
                    h('div', { key: 'text', className: 'min-w-0' }, [
                        h('div', { key: 'name', id: 'detail-name', className: 'truncate text-base font-extrabold text-slate-950' }, 'Belum ada kontak'),
                        h('div', { key: 'phone', id: 'detail-phone', className: 'mt-1 truncate text-sm font-semibold text-slate-500' }, 'Pilih percakapan')
                    ])
                ]),
                h('div', { key: 'meta', className: 'space-y-3 text-sm font-semibold text-slate-600' }, [
                    h('div', { key: 'user', className: 'flex items-center gap-3' }, [h('i', { className: 'bi bi-person text-slate-400' }), h('span', { id: 'detail-name-line' }, '-')]),
                    h('div', { key: 'phone', className: 'flex items-center gap-3' }, [h('i', { className: 'bi bi-telephone text-slate-400' }), h('span', { id: 'detail-phone-line' }, '-')])
                ])
            ]),
            h('section', { key: 'media', className: 'mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm' }, [
                h('div', { key: 'h', className: 'mb-4 flex items-center justify-between' }, [
                    h('h3', { key: 't', className: 'font-extrabold text-slate-950' }, 'Riwayat Media'),
                    h('span', { key: 'l', className: 'text-xs font-extrabold text-emerald-600' }, 'lihat semua')
                ]),
                h('div', { key: 'list', id: 'detail-media-list', className: 'space-y-3' }, media.map(([type, icon, name, label]) =>
                    h('div', { key: type, className: 'flex items-center gap-3' }, [
                        h('div', { key: 'thumb', className: `flex h-12 w-12 items-center justify-center rounded-xl ${type === 'image' ? 'bg-emerald-100 text-emerald-600' : type === 'video' ? 'bg-indigo-100 text-indigo-600' : type === 'document' ? 'bg-red-100 text-red-600' : 'bg-lime-100 text-lime-600'}` },
                            h('i', { className: `bi ${icon} text-xl` })
                        ),
                        h('div', { key: 'body', className: 'min-w-0 flex-1' }, [
                            h('div', { key: 'name', className: 'truncate text-sm font-extrabold text-slate-800' }, name),
                            h('div', { key: 'meta', className: 'text-xs font-semibold text-slate-500' }, `${label}  •  siap ditampilkan`)
                        ]),
                        h('i', { key: 'dl', className: 'bi bi-download text-slate-400' })
                    ])
                ))
            ]),
            h('section', { key: 'note', className: 'mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm' }, [
                h('div', { key: 'h', className: 'mb-3 flex items-center justify-between' }, [
                    h('h3', { key: 't', className: 'font-extrabold text-slate-950' }, 'Catatan'),
                    h('i', { key: 'i', className: 'bi bi-pencil text-slate-500' })
                ]),
                h('div', { id: 'detail-note', className: 'min-h-[76px] rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-medium leading-6 text-slate-600' }, 'Catatan penugasan akan tampil melalui ikon catatan pada chat jika tersedia.'),
                h('div', { className: 'mt-3 text-xs font-semibold text-slate-400' }, 'Disinkronkan dari data penugasan')
            ]),
            h('section', { key: 'activity', className: 'mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm' }, [
                h('h3', { key: 't', className: 'mb-4 font-extrabold text-slate-950' }, 'Aktivitas Sistem'),
                h('div', { key: 'list', className: 'space-y-4' }, activity.map((item, idx) =>
                    h('div', { key: item, className: 'flex gap-3' }, [
                        h('i', { key: 'i', className: 'bi bi-check-circle-fill mt-0.5 text-emerald-500' }),
                        h('div', { key: 'b' }, [
                            h('div', { key: 'name', className: 'text-sm font-extrabold text-slate-700' }, item),
                            h('div', { key: 'time', className: 'mt-1 text-xs font-semibold text-slate-400' }, idx === 0 ? 'Saat chat dibuka' : 'Realtime')
                        ])
                    ])
                ))
            ])
        ]);
    }

    function EmptyNoSession() {
        return h('div', { id: 'no-sessions', className: 'wa-no-sess d-none flex flex-1 flex-col items-center justify-center gap-4 bg-white p-10 text-center text-slate-500' }, [
            h('div', { key: 'icon', className: 'flex h-20 w-20 items-center justify-center rounded-3xl bg-slate-50 text-4xl text-slate-300' }, h('i', { className: 'bi bi-phone-x' })),
            h('h2', { key: 'title', className: 'text-lg font-extrabold text-slate-950' }, 'Belum ada session'),
            h('p', { key: 'copy', className: 'max-w-sm text-sm font-medium leading-6' }, 'Hubungi admin untuk mendapatkan akses session WhatsApp.')
        ]);
    }

    function MediaOverlay() {
        return h('div', { className: 'media-overlay', id: 'media-overlay' },
            h('div', { className: 'media-box' }, [
                h('div', { key: 'h', className: 'media-box-hdr' }, [
                    h('h6', { key: 't' }, 'Kirim File'),
                    h('button', { key: 'x', className: 'media-close-btn', id: 'media-close', type: 'button' }, h('i', { className: 'bi bi-x' }))
                ]),
                h('div', { key: 'p', className: 'media-preview', id: 'media-preview' }),
                h('input', { key: 'c', className: 'media-caption-inp', type: 'text', id: 'media-caption', placeholder: 'Tambahkan keterangan...' }),
                h('div', { key: 'prog', id: 'upload-progress', style: { display: 'none', padding: '0 0 12px' } }, [
                    h('div', { key: 'row', className: 'mb-2 flex justify-between text-xs' }, [
                        h('small', { key: 's', id: 'upload-status', className: 'font-bold text-slate-500' }, 'Mengunggah...'),
                        h('small', { key: 'p', id: 'upload-percent', className: 'font-extrabold text-slate-800' }, '0%')
                    ]),
                    h('div', { key: 'track', className: 'h-2 overflow-hidden rounded-full bg-slate-100' },
                        h('div', { id: 'upload-bar', className: 'h-full rounded-full bg-emerald-500 transition-all', style: { width: '0%' } })
                    )
                ]),
                h('button', { key: 'send', className: 'media-send-btn', id: 'media-send', type: 'button' }, [h('i', { key: 'i', className: 'bi bi-send-fill' }), 'Kirim'])
            ])
        );
    }

    function NoteModal() {
        return h('div', { className: 'note-modal-overlay', id: 'note-modal-overlay' },
            h('div', { className: 'note-modal', id: 'note-modal' }, [
                h('div', { key: 'h', className: 'note-modal-hdr' }, [
                    h('div', { key: 'l', className: 'note-modal-hdr-left' }, [h('i', { className: 'bi bi-sticky-fill note-modal-icon' }), h('span', { className: 'note-modal-title' }, 'Catatan Penugasan')]),
                    h('button', { key: 'x', className: 'note-modal-close', id: 'note-modal-close', type: 'button' }, h('i', { className: 'bi bi-x' }))
                ]),
                h('div', { key: 'b', className: 'note-modal-body' }, [
                    h('div', { key: 'badge', className: 'note-priority-badge', id: 'note-priority-badge' }, 'Low'),
                    h('div', { key: 'content', className: 'note-content', id: 'note-content' }, '-'),
                    h('div', { key: 'deadline', id: 'note-deadline-info', className: 'mt-3 text-sm font-bold text-slate-500' })
                ])
            ])
        );
    }

    function ReportModal() {
        return h('div', { className: 'report-modal-overlay', id: 'report-modal-overlay' },
            h('div', { className: 'report-modal', id: 'report-modal' }, [
                h('div', { key: 'h', className: 'report-modal-hdr' }, [
                    h('div', { key: 'l', className: 'report-modal-hdr-left' }, [h('i', { className: 'bi bi-flag-fill report-modal-icon text-blue-600' }), h('span', { className: 'report-modal-title' }, 'Laporan Client')]),
                    h('button', { key: 'x', className: 'report-modal-close', id: 'report-modal-close', type: 'button' }, h('i', { className: 'bi bi-x' }))
                ]),
                h('div', { key: 'b', className: 'report-modal-body' }, [
                    h('label', { key: 'lw' }, 'Nama Worker'),
                    h('input', { key: 'worker', type: 'text', id: 'report-worker-name', readOnly: true }),
                    h('label', { key: 'lc' }, 'Nomor Client'),
                    h('input', { key: 'client', type: 'text', id: 'report-client-phone', readOnly: true }),
                    h('label', { key: 'lr' }, 'Laporan'),
                    h('textarea', { key: 'text', id: 'report-text', placeholder: 'Tulis laporan di sini...' }),
                    h('button', { key: 'send', className: 'report-send-btn', id: 'report-send-btn', type: 'button' }, [h('i', { key: 'i', className: 'bi bi-whatsapp' }), 'Kirim via WhatsApp'])
                ])
            ])
        );
    }

    function TemplatePicker() {
        return h('div', { className: 'tpl-overlay', id: 'tpl-overlay' },
            h('div', { className: 'tpl-panel' }, [
                h('div', { key: 'h', className: 'tpl-hdr' }, [
                    h('i', { key: 'i', className: 'bi bi-lightning-charge-fill' }),
                    h('span', { key: 't', className: 'tpl-hdr-title flex-1' }, 'Pilih Template'),
                    h('button', { key: 'x', className: 'tpl-hdr-close', id: 'tpl-close', type: 'button' }, h('i', { className: 'bi bi-x' }))
                ]),
                h('div', { key: 's', className: 'tpl-search' }, h('input', { type: 'text', id: 'tpl-search-input', placeholder: 'Cari template...' })),
                h('div', { key: 'l', className: 'tpl-list', id: 'tpl-list' }, h('div', { className: 'tpl-empty' }, [h('i', { key: 'i', className: 'bi bi-hourglass-split' }), 'Memuat template...']))
            ])
        );
    }

    function ImageViewer() {
        return h('div', { className: 'img-viewer', id: 'image-viewer' }, [
            h('button', { key: 'x', className: 'img-viewer-close', id: 'img-viewer-close', type: 'button' }, h('i', { className: 'bi bi-x' })),
            h('img', { key: 'img', id: 'image-viewer-img', alt: '' })
        ]);
    }

    function PwaSheet() {
        return h(React.Fragment, null, [
            h('div', { key: 'backdrop', className: 'pwa-backdrop', id: 'pwa-backdrop' }),
            h('div', { key: 'sheet', className: 'pwa-sheet', id: 'pwa-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Install aplikasi' }, [
                h('div', { key: 'handle', className: 'pwa-handle' }),
                h('div', { key: 'body', className: 'pwa-body' }, [
                    h('div', { key: 'icon', className: 'pwa-icon-wrap', id: 'pwa-icon-wrap' }, h('i', { className: 'bi bi-whatsapp pwa-icon-fallback', id: 'pwa-icon-fallback' })),
                    h('p', { key: 'title', className: 'pwa-title', id: 'pwa-app-name' }, 'Billey WA'),
                    h('p', { key: 'desc', className: 'pwa-desc' }, 'Install aplikasi untuk akses cepat, notifikasi real-time, dan tampilan fullscreen.'),
                    h('div', { key: 'actions', className: 'pwa-actions' }, [
                        h('button', { key: 'later', className: 'pwa-btn-later', id: 'pwa-btn-later', type: 'button' }, 'Nanti'),
                        h('button', { key: 'install', className: 'pwa-btn-install', id: 'pwa-btn-install-sheet', type: 'button' }, [h('i', { key: 'i', className: 'bi bi-download' }), ' Install Sekarang'])
                    ]),
                    h('span', { key: 'hint', className: 'pwa-hint' }, [h('i', { key: 'i', className: 'bi bi-shield-check' }), ' Gratis, tanpa storage ekstra'])
                ])
            ])
        ]);
    }

    function DashboardLayout() {
        return h('div', { className: 'wa-app flex flex-col bg-slate-100' }, [
            h(TopBar, { key: 'top' }),
            h('div', { key: 'body', className: 'wa-body flex min-h-0 flex-1 overflow-hidden rounded-none border-slate-200 bg-white shadow-soft xl:m-0' }, [
                h(EmptyNoSession, { key: 'none' }),
                h(ChatList, { key: 'list' }),
                h(ChatWindow, { key: 'chat' }),
                h(ContactDetailPanel, { key: 'contact' })
            ]),
            h(MediaOverlay, { key: 'media' }),
            h(ImageViewer, { key: 'viewer' }),
            h(NoteModal, { key: 'note' }),
            h(ReportModal, { key: 'report' }),
            h(TemplatePicker, { key: 'tpl' }),
            h(PwaSheet, { key: 'pwa' })
        ]);
    }

    function syncContactPanel() {
        const name = document.getElementById('chat-hdr-name')?.textContent?.trim() || 'Belum ada kontak';
        const phone = document.getElementById('chat-hdr-phone')?.textContent?.trim() || '-';
        const avatar = document.getElementById('chat-hdr-avatar')?.textContent?.trim() || 'WA';
        const bg = document.getElementById('chat-hdr-avatar')?.style?.background || '';
        const targets = [
            ['detail-name', name],
            ['detail-phone', phone],
            ['detail-name-line', name],
            ['detail-phone-line', phone]
        ];
        targets.forEach(([id, text]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = text;
        });
        const detailAvatar = document.getElementById('detail-avatar');
        if (detailAvatar) {
            detailAvatar.textContent = avatar;
            if (bg) {
                detailAvatar.style.background = bg;
                detailAvatar.style.color = '#fff';
            }
        }
    }

    function installPanelSync() {
        const header = document.getElementById('chat-hdr');
        const messages = document.getElementById('chat-messages');
        if (header) new MutationObserver(syncContactPanel).observe(header, { childList: true, subtree: true, attributes: true });
        if (messages) new MutationObserver(() => {
            const count = messages.querySelectorAll('.msg-media, .msg-doc').length;
            const note = document.getElementById('detail-note');
            if (note && count > 0) note.textContent = `${count} item media/dokumen terlihat pada percakapan aktif.`;
        }).observe(messages, { childList: true, subtree: true });
    }

    ReactDOM.createRoot(document.getElementById('member-dashboard-root')).render(h(DashboardLayout));
    requestAnimationFrame(installPanelSync);
})();
