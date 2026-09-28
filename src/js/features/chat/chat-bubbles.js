// ═══ Chat — bulles (rendu des messages + carte produit) ═══
// Éclaté de chat.js (refacto-archi) — logique strictement identique.
// NB : import dynamique de la modale produit → recâblé vers features/product/.
import { escapeHtml } from '../../utils/escape-html.js';
import { thumb } from '../../utils/images.js';
import { NAME_KEY, chatCtx, $, fmtTime } from './chat-state.js';
import { scrollDown } from './chat-display.js';
import { saveNameFromPrompt } from './chat-session.js';
import { closeChat } from './chat-ui.js';

export function buildBubble(m, perspective) {
    const own = (m.sender === perspective);
    const el = document.createElement('div');
    el.className = `msg ${own ? 'out' : 'in'}` + (m.sender === 'bot' ? ' bot' : '');
    if (m.id) el.dataset.id = m.id;

    if (m.sender === 'bot') {
        const tag = document.createElement('div');
        tag.className = 'msg-bot-tag';
        tag.textContent = '🤖 Assistant NRJ';
        el.appendChild(tag);
    }

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
            import('../product/modal-render.js').then((mod) => {
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

export function renderWelcomeIfEmpty() {
    const box = $('chatMessages');
    if (box.querySelector('.msg:not(.offline-note)')) return;
    box.querySelectorAll('.msg').forEach((el) => el.remove());

    const hello = document.createElement('div');
    hello.className = 'msg in';
    const name = localStorage.getItem(NAME_KEY);
    hello.innerHTML =
        `👋 ${name ? `Bonjour ${escapeHtml(name)} !` : 'Bonjour et bienvenue chez'} <b>NRJ Marketplace</b> !<br>` +
        `Posez votre question ici — nous répondons rapidement (Chine 🇨🇳 / Congo 🇨🇬).<br>` +
        `Occupés ? Notre assistant IA 🤖 vous répond en attendant.<br>` +
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

    if (chatCtx.pendingProduct) {
        const ctx = document.createElement('div');
        ctx.className = 'msg system';
        ctx.textContent = `Vous discutez au sujet de : ${chatCtx.pendingProduct.name}`;
        box.appendChild(ctx);
    }

    scrollDown();
}
