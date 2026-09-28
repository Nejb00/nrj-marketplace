// ═══ Chat — temps réel (postgres_changes) ═══
// Éclaté de chat.js (refacto-archi) — logique strictement identique.
import { supabaseClient } from '../../core/config.js';
import { chatCtx, $ } from './chat-state.js';
import { buildBubble } from './chat-bubbles.js';
import { scrollDown, updateBadge } from './chat-display.js';
import { markCustomerRead } from './chat-send.js';
import { clearAIRelay } from './chat-ai.js';
import { showTyping, clearTyping } from './chat-typing.js';

export function startChannel() {
    if (chatCtx.channelStarted || !chatCtx.sessionId) return;
    chatCtx.channelStarted = true;

    chatCtx.channel = supabaseClient
        .channel(`fluo-chat-${chatCtx.sessionId}`)
        .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `session_id=eq.${chatCtx.sessionId}` },
            (payload) => onNewMessage(payload.new)
        )
        .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `session_id=eq.${chatCtx.sessionId}` },
            (payload) => onMessageUpdate(payload.new)
        )
        .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'chat_sessions', filter: `id=eq.${chatCtx.sessionId}` },
            (payload) => onSessionUpdate(payload.new)
        )
        .subscribe();
}

function onNewMessage(m) {
    if (m.sender === 'client') {
        const box = $('chatMessages');
        if (!box) return;
        // Adopte la bulle optimiste en attente (race temps réel vs réponse INSERT)
        let el = box.querySelector(`[data-id="${m.id}"]`);
        if (!el) {
            box.querySelectorAll('.msg.pending').forEach((p) => {
                if (!el && p.childNodes[0] && p.childNodes[0].textContent === (m.content || '')) el = p;
            });
        }
        if (el) {
            el.dataset.id = m.id;
            el.classList.remove('pending');
            const tk = el.querySelector('.ticks');
            if (tk) tk.classList.toggle('read', !!m.read_by_admin);
            return;
        }
        // Message envoyé depuis un autre onglet/appareil
        box.appendChild(buildBubble(m, 'client'));
        scrollDown();
        return;
    }

    // Réponse du vendeur (ou de l'IA) → bulle entrante + l'humain/IA reprend la main
    clearAIRelay();
    $('chatMessages')?.querySelector('.offline-note')?.remove();
    $('chatMessages').appendChild(buildBubble(m, 'client'));
    clearTyping();
    scrollDown();
    if (chatCtx.isOpen) markCustomerRead();
    else { chatCtx.unread++; updateBadge(); }
}

function onMessageUpdate(m) {
    // Passe les ✓✓ au bleu quand le vendeur lit notre message
    if (m.sender !== 'client') return;
    const el = $('chatMessages')?.querySelector(`[data-id="${m.id}"]`);
    const tk = el?.querySelector('.ticks');
    if (tk) tk.classList.toggle('read', !!m.read_by_admin);
}

function onSessionUpdate(s) {
    const at = s.admin_typing_at ? new Date(s.admin_typing_at).getTime() : 0;
    const fresh = Date.now() - at < 5000;
    if (fresh) showTyping();
    else if (!fresh) clearTyping();
}
