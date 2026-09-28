// ═══ Chat — état partagé de la session (source de vérité unique) ═══
// Éclaté de chat.js (refacto-archi). Les anciennes variables de module
// (closures) vivent ici dans chatCtx — importé par tous les modules chat.
export const SESSION_KEY = 'fluochat_sid';
export const NAME_KEY = 'fluo_customer_name';

export const chatCtx = {
    sessionId: null,
    channel: null,
    channelStarted: false,
    isOpen: false,
    unread: 0,
    lastTypingSent: 0,
    typingTimer: null,
    pendingProduct: null, // contexte produit quand ouvert depuis la modale
    aiTimer: null,
    aiSettings: { ai_enabled: true, admin_away: false, ai_delay_seconds: 120 },
};

export const $ = (id) => document.getElementById(id);

export function fmtTime(iso) {
    try {
        return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    } catch {
        return '';
    }
}
