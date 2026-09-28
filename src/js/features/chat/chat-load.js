// ═══ Chat — chargement de l'historique ═══
// Éclaté de chat.js (refacto-archi) — logique strictement identique.
import { supabaseClient } from '../../core/config.js';
import { chatCtx, $ } from './chat-state.js';
import { buildBubble } from './chat-bubbles.js';
import { scrollDown } from './chat-display.js';

export async function loadMessages() {
    const { data, error } = await supabaseClient
        .from('chat_messages')
        .select('*')
        .eq('session_id', chatCtx.sessionId)
        .order('created_at', { ascending: true })
        .limit(200);
    if (error) throw error;

    const box = $('chatMessages');
    // Nettoye tout, y compris une éventuelle note « offline » d'une tentative précédente
    box.querySelectorAll('.msg').forEach((el) => el.remove());
    (data || []).forEach((m) => box.appendChild(buildBubble(m, 'client')));
    scrollDown();
}
