// ═══ Chat — session anonyme Supabase + identité client ═══
// Éclaté de chat.js (refacto-archi) — logique strictement identique.
import { supabaseClient } from '../../core/config.js';
import { SESSION_KEY, NAME_KEY, chatCtx, $ } from './chat-state.js';
import { updateBadge, scrollDown } from './chat-display.js';
import { startChannel } from './chat-channel.js';

export async function restoreSession() {
    // L'identité anonyme est restaurée automatiquement par supabase-js
    // (persistée en localStorage). uid = propriétaire de la session de chat.
    const { data: { session: authSession } } = await supabaseClient.auth.getSession();
    const user = authSession?.user;
    if (!user) return;

    const id = user.id;
    const { data } = await supabaseClient
        .from('chat_sessions')
        .select('id, customer_name')
        .eq('id', id)
        .maybeSingle();
    if (!data) { localStorage.setItem(SESSION_KEY, id); return; } // conversation créée à la première ouverture
    chatCtx.sessionId = id;
    localStorage.setItem(SESSION_KEY, id);
    if (data.customer_name) localStorage.setItem(NAME_KEY, data.customer_name);
    const { data: msgs } = await supabaseClient
        .from('chat_messages')
        .select('sender, read_by_customer')
        .eq('session_id', id)
        .neq('sender', 'client')
        .limit(500);
    chatCtx.unread = (msgs || []).filter((m) => !m.read_by_customer).length;
    updateBadge();
    startChannel();
}

export async function ensureSession() {
    if (chatCtx.sessionId) return chatCtx.sessionId;

    // Identité anonyme Supabase : chaque visiteur possède SA conversation
    // (RLS : personne d'autre ne peut la lire). Si une session existe déjà
    // (anonyme ou compte réel), on l'utilise.
    const { data: { session: authSession } } = await supabaseClient.auth.getSession();
    let user = authSession?.user;
    if (!user) {
        const { data: authData, error: authError } = await supabaseClient.auth.signInAnonymously();
        if (authError) throw authError;
        user = authData.user;
    }

    const id = user.id;
    chatCtx.sessionId = id;
    localStorage.setItem(SESSION_KEY, id);

    const { data: existing } = await supabaseClient
        .from('chat_sessions')
        .select('id')
        .eq('id', id)
        .maybeSingle();

    if (!existing) {
        const { error } = await supabaseClient.from('chat_sessions').insert({
            id,
            customer_user_id: id, // colonne NOT NULL (lien auth.users)
            customer_name: localStorage.getItem(NAME_KEY) || null,
            status: 'open',
            last_message_preview: '',
            last_message_at: new Date().toISOString(),
        });
        if (error) throw error;
    }
    return id;
}

export async function saveNameFromPrompt() {
    const input = $('chatNameInput');
    const name = (input?.value || '').trim();
    if (!name) return;
    localStorage.setItem(NAME_KEY, name);
    const prompt = input.closest('.msg-name-prompt');
    prompt?.remove();
    try {
        await ensureSession();
        await supabaseClient.from('chat_sessions').update({ customer_name: name }).eq('id', chatCtx.sessionId);
        const thx = document.createElement('div');
        thx.className = 'msg in';
        thx.textContent = `Enchanté ${name} ! 😄 Comment pouvons-nous vous aider ?`;
        $('chatMessages').appendChild(thx);
        scrollDown();
    } catch { /* silencieux */ }
}
