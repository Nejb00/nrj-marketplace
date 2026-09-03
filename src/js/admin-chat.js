/**
 * 💬 ADMIN — boîte de réception du Chat FLUO
 *
 * - Liste des conversations (chat_sessions) avec badge messages non lus
 * - Vue conversation + réponse en direct (temps réel postgres_changes)
 * - Indicateur « le client est en train d'écrire… »
 */

import { supabaseClient } from './config.js';
import { escapeHtml, thumb, formatPrice } from './utils.js';

let sessions = [];
let unreadMap = {};
let activeConvId = null;
let channel = null;
let channelStarted = false;
let lastTypingSent = 0;
let typingTimer = null;

const $ = (id) => document.getElementById(id);

function fmtTime(iso) {
    try { return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
}

function fmtListTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return fmtTime(iso);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

function initialsOf(name) {
    if (!name) return '👤';
    const parts = name.trim().split(/\s+/).slice(0, 2);
    return parts.map(p => p[0].toUpperCase()).join('');
}

// ─── Rendu des bulles (perspective admin : admin = sortie/droite) ───────────

function productCardHTML(meta) {
    const p = meta && meta.product;
    if (!p) return '';
    const img = p.image ? thumb(p.image, 96, 96) : '';
    return `
        <div class="msg-product-card" data-open-product="${p.id}">
            ${img ? `<img src="${escapeHtml(img)}" alt="" loading="lazy">` : '<div class="msg-product-noimg">📦</div>'}
            <div class="msg-product-infos">
                <div class="msg-product-name">${escapeHtml(p.name || '')}</div>
                ${p.price != null ? `<div class="msg-product-price">${escapeHtml(formatPrice(p.price))}</div>` : ''}
            </div>
        </div>`;
}

function appendMsg(m, { container }) {
    const box = container || $('acConvMessages');
    if (!box || box.querySelector(`[data-id="${m.id}"]`)) return;
    const out = m.sender === 'admin';
    const div = document.createElement('div');
    div.className = 'msg ' + (out ? 'out' : 'in');
    div.dataset.id = m.id;
    const ticks = m.sender === 'admin'
        ? (m.read_by_customer ? '<span class="ticks read">✓✓</span>' : '<span class="ticks">✓✓</span>')
        : '';
    div.innerHTML = `${productCardHTML(m.metadata)}<div class="msg-text"></div><div class="msg-meta">${fmtTime(m.created_at)} ${ticks}</div>`;
    div.querySelector('.msg-text').textContent = m.content || '';
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

// ─── Liste des conversations ────────────────────────────────────────────────

function renderList() {
    const list = $('acList');
    if (!list) return;
    if (!sessions.length) {
        list.innerHTML = '<div class="ac-empty">Aucune conversation pour le moment — elles apparaîtront ici dès qu\'un client écrit 💬</div>';
        return;
    }
    list.innerHTML = '';
    sessions.forEach(s => {
        const n = unreadMap[s.id] || 0;
        const row = document.createElement('div');
        row.className = 'ac-row' + (s.id === activeConvId ? ' active' : '');
        row.dataset.sid = s.id;
        row.innerHTML = `
            <div class="ac-row-avatar">${initialsOf(s.customer_name)}</div>
            <div class="ac-row-main">
                <div class="ac-row-top"><span class="ac-row-name"></span><span class="ac-row-time">${fmtListTime(s.last_message_at)}</span></div>
                <div class="ac-row-preview"></div>
            </div>
            ${n > 0 ? `<span class="ac-row-badge">${n > 99 ? '99+' : n}</span>` : ''}`;
        row.querySelector('.ac-row-name').textContent = s.customer_name || 'Client anonyme';
        row.querySelector('.ac-row-preview').textContent = s.last_message_preview || 'Nouveau client';
        row.addEventListener('click', () => openConv(s.id));
        list.appendChild(row);
    });
}

async function refreshSessions() {
    const { data, error } = await supabaseClient
        .from('chat_sessions')
        .select('id, customer_name, last_message_at, last_message_preview, status')
        .order('last_message_at', { ascending: false })
        .limit(50);
    if (error) { console.error('chat sessions:', error); return; }
    sessions = data || [];

    const { data: unread } = await supabaseClient
        .from('chat_messages')
        .select('session_id')
        .eq('sender', 'customer')
        .eq('read_by_admin', false)
        .limit(2000);
    unreadMap = {};
    (unread || []).forEach(r => { unreadMap[r.session_id] = (unreadMap[r.session_id] || 0) + 1; });

    renderList();
}

function bumpRow(message, convOpen) {
    // Message d'un client : remonte sa conversation en tête de liste
    let s = sessions.find(x => x.id === message.session_id);
    if (!s) {
        s = { id: message.session_id, customer_name: null, last_message_at: message.created_at, last_message_preview: '', status: 'open' };
        sessions.unshift(s);
    } else {
        sessions = [s, ...sessions.filter(x => x.id !== s.id)];
    }
    s.last_message_at = message.created_at;
    s.last_message_preview = (message.content || '').slice(0, 80);
    // Badge non-lu seulement si la conversation n'est pas ouverte à l'écran
    if (!convOpen) unreadMap[message.session_id] = (unreadMap[message.session_id] || 0) + 1;
    renderList();
}

// ─── Conversation ───────────────────────────────────────────────────────────

async function openConv(sessionId) {
    activeConvId = sessionId;
    const s = sessions.find(x => x.id === sessionId);
    $('acConv').style.display = 'flex';
    $('acList').style.display = 'none';
    $('acConvName').textContent = (s && s.customer_name) || 'Client anonyme';
    $('acConvAvatar').textContent = initialsOf(s && s.customer_name);
    setConvStatus(null);

    const { data: msgs, error } = await supabaseClient
        .from('chat_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })
        .limit(500);
    if (error) { console.error('chat messages:', error); return; }
    const box = $('acConvMessages');
    box.innerHTML = '';
    (msgs || []).forEach(m => appendMsg(m, { container: box }));

    await markAdminRead(sessionId);
    subscribeChannel();
}

async function markAdminRead(sessionId) {
    const isActive = sessionId === activeConvId;
    await supabaseClient
        .from('chat_messages')
        .update({ read_by_admin: true })
        .eq('session_id', sessionId)
        .eq('sender', 'customer')
        .eq('read_by_admin', false);
    if (unreadMap[sessionId]) { unreadMap[sessionId] = 0; renderList(); }
}

function setConvStatus(text) {
    const el = $('acConvStatus');
    if (!el) return;
    if (!text) {
        const nb = $('acConvMessages').children.length;
        el.innerHTML = `<span class="status-online">●</span> ${nb} message${nb > 1 ? 's' : ''}`;
    } else {
        el.textContent = text;
    }
}

function showCustomerTyping(fresh) {
    if (typingTimer) clearTimeout(typingTimer);
    if (fresh) {
        setConvStatus('saisie…');
        typingTimer = setTimeout(() => setConvStatus(null), 4000);
    } else {
        setConvStatus(null);
    }
}

async function sendAdminMsg() {
    const input = $('acMsgInput');
    const text = input.value.trim();
    if (!text || !activeConvId) return;
    input.value = '';

    const optimistic = {
        id: 'tmp-' + Date.now(),
        session_id: activeConvId,
        sender: 'admin',
        content: text,
        created_at: new Date().toISOString(),
        read_by_customer: false,
        metadata: null
    };
    appendMsg(optimistic, { container: $('acConvMessages') });

    const { data, error } = await supabaseClient
        .from('chat_messages')
        .insert({
            session_id: activeConvId,
            sender: 'admin',
            content: text,
            read_by_admin: true,
            read_by_customer: false
        })
        .select()
        .single();
    if (error) { console.error('send:', error); input.value = text; return; }

    const tmp = $('acConvMessages').querySelector(`[data-id="${optimistic.id}"]`);
    if (tmp) { tmp.dataset.id = data.id; }

    await supabaseClient
        .from('chat_sessions')
        .update({ last_message_at: data.created_at, last_message_preview: text.slice(0, 80) })
        .eq('id', activeConvId);
    setConvStatus(null);
}

function throttledAdminTyping() {
    const now = Date.now();
    if (!activeConvId || now - lastTypingSent < 2500) return;
    lastTypingSent = now;
    supabaseClient
        .from('chat_sessions')
        .update({ admin_typing_at: new Date().toISOString() })
        .eq('id', activeConvId)
        .then(() => {}, () => {});
}

// ─── Temps réel ─────────────────────────────────────────────────────────────

function subscribeChannel() {
    if (channelStarted) return;
    channelStarted = true;
    channel = supabaseClient
        .channel('admin-inbox')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => {
            const m = payload.new;
            if (m.sender !== 'customer') return;
            const convOpen = (m.session_id === activeConvId && $('acConv') && $('acConv').style.display !== 'none');
            if (convOpen) {
                appendMsg(m, { container: $('acConvMessages') });
                markAdminRead(m.session_id);
                showCustomerTyping(false);
            }
            bumpRow(m, convOpen);
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages' }, (payload) => {
            // Nos messages passent en ✓✓ bleus quand le client les lit
            const m = payload.new;
            if (m.sender !== 'admin') return;
            const el = $('acConvMessages')?.querySelector(`[data-id="${m.id}"]`);
            const tk = el?.querySelector('.ticks');
            if (tk) tk.classList.toggle('read', !!m.read_by_customer);
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_sessions' }, (payload) => {
            const s = payload.new;
            // Indicateur de frappe du client
            if (s.id === activeConvId && $('acConv') && $('acConv').style.display !== 'none') {
                const fresh = s.customer_typing_at && (Date.now() - new Date(s.customer_typing_at).getTime() < 5000);
                showCustomerTyping(fresh);
            }
            // MAJ preview/name de la liste
            const row = sessions.find(x => x.id === s.id);
            if (row) {
                row.customer_name = s.customer_name;
                if (s.last_message_at > (row.last_message_at || '')) {
                    row.last_message_at = s.last_message_at;
                    row.last_message_preview = s.last_message_preview;
                }
                renderList();
            }
        })
        .subscribe();
}

// ─── Init ───────────────────────────────────────────────────────────────────

export async function initAdminChat() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return; // pas connecté : la section reste cachée

    const section = $('adminChatSection');
    if (section) section.style.display = 'block';

    $('acBackBtn')?.addEventListener('click', () => {
        activeConvId = null;
        $('acConv').style.display = 'none';
        $('acList').style.display = 'flex';
        refreshSessions();
    });

    $('acSendBtn')?.addEventListener('click', sendAdminMsg);
    $('acMsgInput')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAdminMsg(); }
    });
    $('acMsgInput')?.addEventListener('input', throttledAdminTyping);

    // Clic sur une carte produit dans une bulle → ouvre la modale produit
    $('acConvMessages')?.addEventListener('click', (e) => {
        const card = e.target.closest('[data-open-product]');
        if (card) {
            const id = parseInt(card.dataset.openProduct, 10);
            if (window.openProductFromAdmin) window.openProductFromAdmin(id);
        }
    });

    await refreshSessions();
    subscribeChannel();
}
