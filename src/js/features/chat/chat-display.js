// ═══ Chat — affichage (scroll + badge non-lus) ═══
// Éclaté de chat.js (refacto-archi) — logique strictement identique.
import { chatCtx, $ } from './chat-state.js';

export function scrollDown() {
    const box = $('chatMessages');
    requestAnimationFrame(() => { box.scrollTop = box.scrollHeight; });
}

export function updateBadge() {
    const badge = $('chatFabBadge');
    if (!badge) return;
    badge.textContent = chatCtx.unread > 99 ? '99+' : String(chatCtx.unread);
    badge.classList.toggle('visible', chatCtx.unread > 0);
}
