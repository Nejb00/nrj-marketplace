// ═══ Utils — échappement HTML ═══
// Éclaté de utils.js (refacto-archi).
export function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
