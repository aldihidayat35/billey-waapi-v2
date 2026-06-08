(function () {
    function normalizeChat(chat) {
        return {
            sessionId: chat && (chat.sessionId || chat.session_id || chat.session || ''),
            contact: chat && (chat.contact || chat.remoteJid || chat.remote_jid || chat.chatId || chat.chat_id || '')
        };
    }

    function chatKey(chat) {
        const normalized = normalizeChat(chat);
        return normalized.sessionId && normalized.contact ? `${normalized.sessionId}::${normalized.contact}` : '';
    }

    function hasAssignmentData(detail) {
        const workers = Array.isArray(detail && detail.assignedWorkers) ? detail.assignedWorkers.filter(Boolean) : [];
        const assignment = detail && detail.assignment ? detail.assignment : null;
        return workers.length > 0 || !!assignment;
    }

    function createAssignmentPanelController(options) {
        const opts = options || {};
        const cache = opts.cache || new Map();
        let requestId = 0;
        let activeKey = '';
        let activeAbort = null;

        function isCurrent(id, key) {
            const current = normalizeChat(opts.getActiveChat ? opts.getActiveChat() : {});
            return id === requestId && key === activeKey && key === chatKey(current);
        }

        async function load(chat, loadOptions) {
            const normalized = normalizeChat(chat);
            const key = chatKey(normalized);
            const loadOpts = loadOptions || {};
            const id = ++requestId;
            activeKey = key;

            if (activeAbort && typeof activeAbort.abort === 'function') {
                activeAbort.abort();
            }
            activeAbort = typeof AbortController !== 'undefined' ? new AbortController() : null;

            if (!key) {
                if (opts.renderEmpty) opts.renderEmpty(normalized);
                return null;
            }

            const cached = cache.get(key);
            if (cached && !loadOpts.force) {
                if (opts.onAssignment) opts.onAssignment(cached);
                if (hasAssignmentData(cached)) {
                    if (opts.renderDetail) opts.renderDetail(cached, { cached: true });
                } else if (opts.renderEmpty) {
                    opts.renderEmpty(normalized, cached);
                }
            } else if (!loadOpts.background && opts.renderLoading) {
                opts.renderLoading(normalized);
            }

            try {
                const detail = await opts.fetchDetail(normalized.sessionId, normalized.contact, {
                    signal: activeAbort ? activeAbort.signal : undefined
                });
                if (!isCurrent(id, key)) return null;
                if (!detail || detail.success === false) {
                    throw new Error((detail && detail.error) || 'Failed to load assignment detail');
                }

                cache.set(key, detail);
                if (opts.onAssignment) opts.onAssignment(detail);
                if (hasAssignmentData(detail)) {
                    if (opts.renderDetail) opts.renderDetail(detail, { cached: false });
                } else if (opts.renderEmpty) {
                    opts.renderEmpty(normalized, detail);
                }
                return detail;
            } catch (error) {
                if (error && error.name === 'AbortError') return null;
                if (!isCurrent(id, key)) return null;
                const fallback = opts.getFallbackDetail ? opts.getFallbackDetail(normalized, error) : null;
                if (fallback && hasAssignmentData(fallback)) {
                    const detail = {
                        ...fallback,
                        success: fallback.success !== false,
                        sessionId: fallback.sessionId || normalized.sessionId,
                        contact: fallback.contact || normalized.contact
                    };
                    cache.set(key, detail);
                    if (opts.onAssignment) opts.onAssignment(detail);
                    if (opts.renderDetail) opts.renderDetail(detail, { fallback: true, error });
                    return detail;
                }
                if (opts.renderError) opts.renderError(normalized, error);
                return null;
            }
        }

        function refresh() {
            const chat = normalizeChat(opts.getActiveChat ? opts.getActiveChat() : {});
            return load(chat, { force: true });
        }

        function reset() {
            requestId += 1;
            activeKey = '';
            if (activeAbort && typeof activeAbort.abort === 'function') {
                activeAbort.abort();
            }
            activeAbort = null;
            if (opts.renderEmpty) opts.renderEmpty(normalizeChat({}));
        }

        return { load, refresh, reset, getActiveKey: () => activeKey, cache };
    }

    window.MemberAssignmentPanel = {
        createAssignmentPanelController,
        chatKey,
        hasAssignmentData
    };
})();
