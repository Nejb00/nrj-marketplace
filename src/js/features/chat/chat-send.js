// ═══ Chat — envoi de messages + marquage lu ═══
// Éclaté de chat.js (refacto-archi) — logique strictement identique.
import { supabaseClient } from '../../core/config.js';
import { NAME_KEY, chatCtx, $ } from './chat-state.js';
import { showToast } from '../../utils/dom-helpers.js';
import { ensureSession } from './chat-session.js';
import { buildBubble } from './chat-bubbles.js';
import { scrollDown, updateBadge } from './chat-display.js';
import { scheduleAIReply } from './chat-ai.js';

export async function sendMessage() {
    const input = $('chatInput');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    const meta = chatCtx.pendingProduct ? { product: chatCtx.pendingProduct } : null;
    const temp = {
        id: `tmp-${Date.now()}`,
        sender: 'client',
        content: text,
        metadata: meta,
        created_at: new Date().toISOString(),
        read_by_admin: false,
        _pending: true,
    };

    const box = $('chatMessages');
    const el = buildBubble(temp, 'client');
    el.classList.add('pending');
    box.appendChild(el);
    scrollDown();

    try {
        await ensureSession();
        const { data, error } = await supabaseClient
            .from('chat_messages')
            .insert({
                session_id: chatCtx.sessionId,
                sender: 'client',
                content: text,
                metadata: meta,
                read_by_customer: true,
                read_by_admin: false,
            })
            .select()
            .single();
        if (error) throw error;

        el.dataset.id = data.id;
        el.classList.remove('pending');
        // ✓ (envoi) → ✓✓ (stocké) ; passera au bleu via onMessageUpdate quand lu
        const tk = el.querySelector('.ticks');
        if (tk) { tk.textContent = '✓✓'; tk.classList.toggle('read', !!data.read_by_admin); }
        chatCtx.pendingProduct = null;

        // Met à jour l'aperçu côté boîte de réception vendeur.
        supabaseClient
            .from('chat_sessions')
            .update({
                last_message_preview: text.slice(0, 90),
                last_message_at: data.created_at,
                customer_name: localStorage.getItem(NAME_KEY) || null,
            })
            .eq('id', chatCtx.sessionId)
            .then(() => {});

        // 🤖 Si personne ne répond d'ici {delay}, l'Assistant NRJ prend le relais
        scheduleAIReply();
    } catch {
        el.classList.add('failed');
        showToast('⚠️ Message non envoyé — vérifiez la connexion.');
    }
}

export async function markCustomerRead() {
    if (!chatCtx.sessionId) return;
    chatCtx.unread = 0;
    updateBadge();
    // RPC SECURITY DEFINER (évite la récursion RLS chat_messages → chat_messages)
    await supabaseClient.rpc('mark_customer_read');
}
