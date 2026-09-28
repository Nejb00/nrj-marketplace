// ═══ Chat — indicateur « saisie… » + signal client en train d'écrire ═══
// Éclaté de chat.js (refacto-archi) — logique strictement identique.
import { supabaseClient } from '../../core/config.js';
import { chatCtx, $ } from './chat-state.js';

export function showTyping() {
    const st = $('chatHeaderStatus');
    if (!st || st.dataset.typing === '1') return;
    st.dataset.typing = '1';
    st.dataset.prev = st.innerHTML;
    st.innerHTML = 'saisie… <span class="typing-dots"><span></span><span></span><span></span></span>';
}

export function clearTyping() {
    const st = $('chatHeaderStatus');
    if (!st || st.dataset.typing !== '1') return;
    st.dataset.typing = '0';
    st.innerHTML = st.dataset.prev;
    clearTimeout(chatCtx.typingTimer);
}

export function signalCustomerTyping() {
    if (!chatCtx.sessionId) return;
    const now = Date.now();
    if (now - chatCtx.lastTypingSent < 2500) return;
    chatCtx.lastTypingSent = now;
    supabaseClient
        .from('chat_sessions')
        .update({ customer_typing_at: new Date().toISOString() })
        .eq('id', chatCtx.sessionId)
        .then(() => {});
}
