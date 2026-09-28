// ═══ Chat — interface (FAB, panneau, ouverture/fermeture) ═══
// Éclaté de chat.js (refacto-archi) — logique strictement identique.
import { supabaseClient, WHATSAPP_NUMBER } from '../../core/config.js';
import { chatCtx, $ } from './chat-state.js';
import { restoreSession, ensureSession } from './chat-session.js';
import { startChannel } from './chat-channel.js';
import { loadMessages } from './chat-load.js';
import { renderWelcomeIfEmpty } from './chat-bubbles.js';
import { sendMessage, markCustomerRead } from './chat-send.js';
import { signalCustomerTyping } from './chat-typing.js';
import { loadAISettings } from './chat-ai.js';

export function initChat() {
    const fab = $('chatFab');
    const panel = $('chatPanel');
    if (!fab || !panel) return;

    fab.addEventListener('click', () => (chatCtx.isOpen ? closeChat() : openChat()));

    $('chatCloseBtn').addEventListener('click', closeChat);
    $('chatSendBtn').addEventListener('click', () => sendMessage());
    $('chatInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); sendMessage(); }
    });
    $('chatInput').addEventListener('input', () => signalCustomerTyping());

    $('chatWaBtn').addEventListener('click', () => {
        const p = chatCtx.pendingProduct;
        const txt = p
            ? `Bonjour NRJ Marketplace 👋, je vous contacte depuis le chat du site au sujet de « ${p.name} » (ID: ${p.id}).`
            : 'Bonjour NRJ Marketplace 👋, je vous contacte depuis le chat du site NRJ Marketplace.';
        window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(txt)}`, '_blank');
    });

    document.querySelectorAll('#chatQuick .chat-quick-chip').forEach((chip) => {
        chip.addEventListener('click', () => {
            $('chatInput').value = chip.textContent.replace(/^\S+\s/, '');
            $('chatInput').focus();
        });
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && chatCtx.isOpen) closeChat();
    });

    // Reprise silencieuse : restaure la session (badge non-lus) si elle existe.
    restoreSession().catch(() => {});
}

export function openChat(ctx) {
    const panel = $('chatPanel');
    if (!panel) return;
    panel.classList.add('open');
    chatCtx.isOpen = true;

    if (ctx && ctx.product) {
        chatCtx.pendingProduct = {
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
            loadAISettings(); // non bloquant
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
    chatCtx.isOpen = false;
}

export function isChatOpen() {
    return chatCtx.isOpen;
}
