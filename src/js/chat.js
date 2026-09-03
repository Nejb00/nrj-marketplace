/**
 * 💬 CHAT FLUO — chat client style WhatsApp
 *
 * - Identité : utilisateur ANONYME Supabase (auth.uid() = id de la session
 *   de chat) → RLS : chaque visiteur ne voit que SA conversation.
 * - Messages dans chat_messages (sender: 'customer' | 'admin' | 'bot').
 * - Temps réel via postgres_changes : les réponses du vendeur arrivent seules.
 * - Bulles à la WhatsApp : ticks ✓/✓✓, indicateur « saisie… », carte produit
 *   quand le chat est ouvert depuis la modale d'un article.
 */

import { supabaseClient, WHATSAPP_NUMBER } from './config.js';
import { escapeHtml, thumb, showToast } from './utils.js';

const SESSION_KEY = 'fluochat_sid';
const NAME_KEY = 'fluo_customer_name';

let sessionId = null;
let channel = null;
let channelStarted = false;
let isOpen = false;
let unread = 0;
let lastTypingSent = 0;
let typingTimer = null;
let pendingProduct = null; // contexte produit quand ouvert depuis la modale

const $ = (id) => document.getElementById(id);

function fmtTime(iso) {
    try {
        return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    } catch {
        return '';
    }
}

// ── Interface ───────────────────────────────────────────────────────────────

export function initChat() {
    const fab = $('chatFab');
    const panel = $('chatPanel');
    if (!fab || !panel) return;

    fab.addEventListener('click', () => (isOpen ? closeChat() : openChat()));

    $('chatCloseBtn').addEventListener('click', closeChat);
    $('chatSendBtn').addEventListener('click', () => sendMessage());
    $('chatInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); sendMessage(); }
    });
    $('chatInput').addEventListener('input', () => signalCustomerTyping());

    $('chatWaBtn').addEventListener('click', () => {
        const p = pendingProduct;
        const txt = p
            ? `Bonjour FLUO 👋, je vous contacte depuis le chat du site au sujet de « ${p.name} » (ID: ${p.id}).`
            : 'Bonjour FLUO 👋, je vous contacte depuis le chat du site FLUO.';
        window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(txt)}`, '_blank');
    });

    document.querySelectorAll('#chatQuick .chat-quick-chip').forEach((chip) => {
        chip.addEventListener('click', () => {
            $('chatInput').value = chip.textContent.replace(/^\S+\s/, '');
            $('chatInput').focus();
        });
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isOpen) closeChat();
    });

    // Reprise silencieuse : restaure la session (badge non-lus) si elle existe.
    restoreSession().catch(() => {});
}

export function openChat(ctx) {
    const panel = $('chatPanel');
    if (!panel) return;
    panel.classList.add('open');
    isOpen = true;

    if (ctx && ctx.product) {
        pendingProduct = {
            id: ctx.product.id,
            name: ctx.product.name,
            price: ctx.product.price,
            image: ctx.product.image || '',
        };
        const input = $('chatInput');
        if (!input.value.trim()) {
            const t = ctx.taille ? ` (Taille : ${ctx.taille})` : '';
            input.value = `Bonjour, je suis intéressé(e) par « ${ctx.product.name} »${t} ✨`;
        }
    }

    (async () => {
        try {
            await ensureSession();
            await loadMessages();
            startChannel();
            renderWelcomeIfEmpty();
            markCustomerRead();
        } catch {
            const m = $('chatMessages');
            if (m && !m.querySelector('.offline-note')) {
                const el = document.createElement('div');
                el.className = 'msg system offline-note';
                el.textContent = '📡 Connexion au chat… réessayez dans un instant.';
                m.appendChild(el);
            }
        }
    })();
}

export function closeChat() {
    $('chatPanel')?.classList.remove('open');
    isOpen = false;
}

export function isChatOpen() {
    return isOpen;
}

// ── Session & données ───────────────────────────────────────────────────────

async function restoreSession() {
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
    sessionId = id;
    localStorage.setItem(SESSION_KEY, id);
    if (data.customer_name) localStorage.setItem(NAME_KEY, data.customer_name);
    const { data: msgs } = await supabaseClient
        .from('chat_messages')
        .select('sender, read_by_customer')
        .eq('session_id', id)
        .neq('sender', 'customer')
        .limit(500);
    unread = (msgs || []).filter((m) => !m.read_by_customer).length;
    updateBadge();
    startChannel();
}

async function ensureSession() {
    if (sessionId) return sessionId;

    // Identité anonyme Supabase : chaque visiteur possède SA conversation
    // (RLS : personne d'autre ne peut la lire). Si une session existe déjà
    // (anonyme ou compte réel — ex. le vendeur testant son site), on l'utilise.
    const { data: { session: authSession } } = await supabaseClient.auth.getSession();
    let user = authSession?.user;
    if (!user) {
        const { data: authData, error: authError } = await supabaseClient.auth.signInAnonymously();
        if (authError) throw authError;
        user = authData.user;
    }

    const id = user.id;
    sessionId = id;
    localStorage.setItem(SESSION_KEY, id);

    const { data: existing } = await supabaseClient
        .from('chat_sessions')
        .select('id')
        .eq('id', id)
        .maybeSingle();

    if (!existing) {
        const { error } = await supabaseClient.from('chat_sessions').insert({
            id,
            customer_name: localStorage.getItem(NAME_KEY) || null,
            status: 'open',
            last_message_preview: '',
            last_message_at: new Date().toISOString(),
        });
        if (error) throw error;
    }
    return id;
}

async function loadMessages() {
    const { data, error } = await supabaseClient
        .from('chat_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })
        .limit(200);
    if (error) throw error;

    const box = $('chatMessages');
    box.querySelectorAll('.msg:not(.offline-note)').forEach((el) => el.remove());
    (data || []).forEach((m) => box.appendChild(buildBubble(m, 'customer')));
    scrollDown();
}

// ── Temps réel ──────────────────────────────────────────────────────────────

function startChannel() {
    if (channelStarted || !sessionId) return;
    channelStarted = true;

    channel = supabaseClient
        .channel(`fluo-chat-${sessionId}`)
        .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `session_id=eq.${sessionId}` },
            (payload) => onNewMessage(payload.new)
        )
        .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `session_id=eq.${sessionId}` },
            (payload) => onMessageUpdate(payload.new)
        )
        .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'chat_sessions', filter: `id=eq.${sessionId}` },
            (payload) => onSessionUpdate(payload.new)
        )
        .subscribe();
}

function onNewMessage(m) {
    if (m.sender === 'customer') {
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
        box.appendChild(buildBubble(m, 'customer'));
        scrollDown();
        return;
    }

    // Réponse du vendeur (ou de l'IA) → bulle entrante.
    $('chatMessages')?.querySelector('.offline-note')?.remove();
    $('chatMessages').appendChild(buildBubble(m, 'customer'));
    clearTyping();
    scrollDown();
    if (isOpen) markCustomerRead();
    else { unread++; updateBadge(); }
}

function onMessageUpdate(m) {
    // Passe les ✓✓ au bleu quand le vendeur lit notre message
    if (m.sender !== 'customer') return;
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

function showTyping() {
    const st = $('chatHeaderStatus');
    if (!st || st.dataset.typing === '1') return;
    st.dataset.typing = '1';
    st.dataset.prev = st.innerHTML;
    st.innerHTML = 'saisie… <span class="typing-dots"><span></span><span></span><span></span></span>';
}

function clearTyping() {
    const st = $('chatHeaderStatus');
    if (!st || st.dataset.typing !== '1') return;
    st.dataset.typing = '0';
    st.innerHTML = st.dataset.prev;
    clearTimeout(typingTimer);
}

// ── Envoi ───────────────────────────────────────────────────────────────────

async function sendMessage() {
    const input = $('chatInput');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    const meta = pendingProduct ? { product: pendingProduct } : null;
    const temp = {
        id: `tmp-${Date.now()}`,
        sender: 'customer',
        content: text,
        metadata: meta,
        created_at: new Date().toISOString(),
        read_by_admin: false,
        _pending: true,
    };

    const box = $('chatMessages');
    const el = buildBubble(temp, 'customer');
    el.classList.add('pending');
    box.appendChild(el);
    scrollDown();

    try {
        await ensureSession();
        const { data, error } = await supabaseClient
            .from('chat_messages')
            .insert({
                session_id: sessionId,
                sender: 'customer',
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
        pendingProduct = null;

        // Met à jour l'aperçu côté boîte de réception vendeur.
        supabaseClient
            .from('chat_sessions')
            .update({
                last_message_preview: text.slice(0, 90),
                last_message_at: data.created_at,
                customer_name: localStorage.getItem(NAME_KEY) || null,
            })
            .eq('id', sessionId)
            .then(() => {});
    } catch {
        el.classList.add('failed');
        showToast('⚠️ Message non envoyé — vérifiez la connexion.');
    }
}

function signalCustomerTyping() {
    if (!sessionId) return;
    const now = Date.now();
    if (now - lastTypingSent < 2500) return;
    lastTypingSent = now;
    supabaseClient
        .from('chat_sessions')
        .update({ customer_typing_at: new Date().toISOString() })
        .eq('id', sessionId)
        .then(() => {});
}

async function markCustomerRead() {
    if (!sessionId) return;
    unread = 0;
    updateBadge();
    await supabaseClient
        .from('chat_messages')
        .update({ read_by_customer: true })
        .eq('session_id', sessionId)
        .neq('sender', 'customer')
        .eq('read_by_customer', false);
}

// ── Rendu ───────────────────────────────────────────────────────────────────

function buildBubble(m, perspective) {
    const own = (m.sender === perspective);
    const el = document.createElement('div');
    el.className = `msg ${own ? 'out' : 'in'}`;
    if (m.id) el.dataset.id = m.id;

    const meta = m.metadata || {};
    if (meta.product && meta.product.name) {
        const p = meta.product;
        const card = document.createElement('div');
        card.className = 'msg-product-card';
        card.innerHTML =
            (p.image
                ? `<img src="${escapeHtml(thumb(p.image, 104, 104))}" alt="" loading="lazy">`
                : `<img src="" alt="" onerror="this.style.display='none'">`) +
            `<div class="msg-product-info">` +
            `<div class="msg-product-name">${escapeHtml(p.name)}</div>` +
            (p.price != null ? `<div class="msg-product-price">${Number(p.price).toLocaleString('fr-FR')} FCFA</div>` : '') +
            `</div>`;
        if (p.id) card.addEventListener('click', () => {
            import('./product-modal.js').then((mod) => {
                closeChat();
                mod.openProductModal(p.id);
            });
        });
        el.appendChild(card);
    }

    const txt = document.createElement('span');
    txt.textContent = m.content || '';
    el.appendChild(txt);

    if (own) {
        const metaEl = document.createElement('span');
        metaEl.className = 'msg-meta';
        const ticks = m._pending ? '✓' : '✓✓';
        metaEl.innerHTML = `${fmtTime(m.created_at)} <span class="ticks${!m._pending && m.read_by_admin ? ' read' : ''}">${ticks}</span>`;
        if (m._pending) el.classList.add('pending');
        el.appendChild(metaEl);
    } else {
        const metaEl = document.createElement('span');
        metaEl.className = 'msg-meta';
        metaEl.textContent = fmtTime(m.created_at);
        el.appendChild(metaEl);
    }

    return el;
}

function renderWelcomeIfEmpty() {
    const box = $('chatMessages');
    if (box.querySelector('.msg:not(.offline-note)')) return;
    box.querySelectorAll('.msg').forEach((el) => el.remove());

    const hello = document.createElement('div');
    hello.className = 'msg in';
    const name = localStorage.getItem(NAME_KEY);
    hello.innerHTML =
        `👋 ${name ? `Bonjour ${escapeHtml(name)} !` : 'Bonjour et bienvenue chez'} <b>FLUO</b> !<br>` +
        `Posez votre question ici — nous répondons rapidement (Chine 🇨🇳 / Congo 🇨🇬).<br>` +
        `Vous préférez WhatsApp ? Touchez l'icône en haut à droite ✆`;
    box.appendChild(hello);

    if (!name) {
        const prompt = document.createElement('div');
        prompt.className = 'msg-name-prompt';
        prompt.innerHTML =
            `<label>Pour mieux vous répondre, comment vous appelez-vous ?</label>` +
            `<div class="msg-name-row"><input type="text" id="chatNameInput" placeholder="Votre prénom" maxlength="40">` +
            `<button id="chatNameOk">OK</button></div>`;
        box.appendChild(prompt);
        prompt.querySelector('#chatNameOk').addEventListener('click', saveNameFromPrompt);
        prompt.querySelector('#chatNameInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') saveNameFromPrompt();
        });
    }

    if (pendingProduct) {
        const ctx = document.createElement('div');
        ctx.className = 'msg system';
        ctx.textContent = `Vous discutez au sujet de : ${pendingProduct.name}`;
        box.appendChild(ctx);
    }

    scrollDown();
}

async function saveNameFromPrompt() {
    const input = $('chatNameInput');
    const name = (input?.value || '').trim();
    if (!name) return;
    localStorage.setItem(NAME_KEY, name);
    const prompt = input.closest('.msg-name-prompt');
    prompt?.remove();
    try {
        await ensureSession();
        await supabaseClient.from('chat_sessions').update({ customer_name: name }).eq('id', sessionId);
        const thx = document.createElement('div');
        thx.className = 'msg in';
        thx.textContent = `Enchanté ${name} ! 😄 Comment pouvons-nous vous aider ?`;
        $('chatMessages').appendChild(thx);
        scrollDown();
    } catch { /* silencieux */ }
}

function scrollDown() {
    const box = $('chatMessages');
    requestAnimationFrame(() => { box.scrollTop = box.scrollHeight; });
}

function updateBadge() {
    const badge = $('chatFabBadge');
    if (!badge) return;
    badge.textContent = unread > 99 ? '99+' : String(unread);
    badge.classList.toggle('visible', unread > 0);
}
