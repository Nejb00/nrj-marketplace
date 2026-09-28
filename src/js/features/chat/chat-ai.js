// ═══ Chat — IA de secours (Assistant NRJ 🤖) ═══
// Éclaté de chat.js (refacto-archi) — logique strictement identique.
import { supabaseClient, CHAT_AI_ENDPOINT } from '../../core/config.js';
import { chatCtx } from './chat-state.js';

export async function loadAISettings() {
    try {
        const { data } = await supabaseClient
            .from('chat_settings')
            .select('*')
            .eq('id', 1)
            .maybeSingle();
        if (data) chatCtx.aiSettings = { ...chatCtx.aiSettings, ...data };
    } catch { /* table absente : valeurs par défaut */ }
    // Échapatoire de test (dev) : localStorage 'fluochat_ai_debug'
    try {
        const dbg = JSON.parse(localStorage.getItem('fluochat_ai_debug') || 'null');
        if (dbg) chatCtx.aiSettings = { ...chatCtx.aiSettings, ...dbg };
    } catch { /* ignoré */ }
}

export async function triggerAIReply() {
    if (!chatCtx.sessionId) return;
    try {
        window.__aiAttempted = Date.now(); // observabilité/debug
        const { data: { session } } = await supabaseClient.auth.getSession();
        await fetch(CHAT_AI_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
            },
            body: JSON.stringify({ sessionId: chatCtx.sessionId }),
        });
    } catch { /* silencieux : l'IA retentera au prochain message */ }
}

export function scheduleAIReply() {
    clearTimeout(chatCtx.aiTimer);
    if (!chatCtx.aiSettings.ai_enabled) return;
    const delay = chatCtx.aiSettings.admin_away
        ? 12000
        : Math.max(15, (chatCtx.aiSettings.ai_delay_seconds || 120) * 1000);
    chatCtx.aiTimer = setTimeout(triggerAIReply, delay);
}

export function clearAIRelay() {
    // Le vendeur (ou l'IA) a répondu : l'humain reprend la main
    clearTimeout(chatCtx.aiTimer);
}
