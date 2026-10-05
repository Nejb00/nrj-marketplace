// ═══ Admin — import produit intelligent (PR #2) ═══
import { showToast } from '../../utils/dom-helpers.js';
import { fetchProductImports, insertProductImport, deleteProductImport } from '../../api/api.js';

const STATUS_LABELS = {
  RECEIVED: 'Reçu',
  ANALYZING: 'Analyse IA',
  CLASSIFIED: 'Catégorisé',
  PRICED: 'Prix calculé',
  MEDIA_READY: 'Média prêt',
  READY: 'Prêt',
  PUBLISHED: 'Publié',
  LOW_CONFIDENCE: 'Confiance faible',
  FAILED: 'Échec',
  CANCELLED: 'Annulé'
};

let selectedFile = null;
let previewUrl = null;
let initialized = false;

function byId(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDate(value) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(value));
  } catch {
    return '—';
  }
}

function setStatus(message = '', tone = '') {
  const el = byId('productImportStatus');
  if (!el) return;
  el.className = 'product-import-status' + (tone ? ' is-' + tone : '');
  el.textContent = message;
}

function resetPreview() {
  const preview = byId('productImportPreview');
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  }
  if (preview) {
    preview.hidden = true;
    preview.innerHTML = '';
  }
}

function renderPreview(file) {
  const preview = byId('productImportPreview');
  if (!preview || !file) return;

  resetPreview();
  previewUrl = URL.createObjectURL(file);
  preview.hidden = false;
  preview.innerHTML =
    '<img src="' + previewUrl + '" alt="Aperçu de la capture importée">' +
    '<div class="product-import-preview-meta">' +
      '<strong>' + escapeHtml(file.name) + '</strong>' +
      '<span>' + Math.max(1, Math.round(file.size / 1024)) + ' Ko</span>' +
    '</div>';
}

function renderImports(rows) {
  const list = byId('productImportsList');
  if (!list) return;

  if (!rows.length) {
    list.innerHTML = '<div class="product-import-empty">Aucun import en attente.</div>';
    return;
  }

  list.innerHTML = rows.map(row => {
    const status = STATUS_LABELS[row.status] || row.status || 'Inconnu';
    const title = row.product_name || (row.raw_text ? row.raw_text.split(/\r?\n/)[0] : '') || 'Import sans titre';
    const source = row.source_image ? 'Source image enregistrée' : 'Capture locale / texte';
    return (
      '<article class="product-import-row">' +
        '<div class="product-import-row-main">' +
          '<div class="product-import-row-title">' + escapeHtml(title) + '</div>' +
          '<div class="product-import-row-meta">' +
            '<span class="product-import-status-pill status-' + escapeHtml(String(row.status || '').toLowerCase()) + '">' + escapeHtml(status) + '</span>' +
            '<span>' + escapeHtml(source) + '</span>' +
            '<span>' + escapeHtml(formatDate(row.created_at)) + '</span>' +
          '</div>' +
        '</div>' +
        '<button type="button" class="product-import-delete" data-import-id="' + escapeHtml(row.id) + '" aria-label="Supprimer cet import">🗑️</button>' +
      '</article>'
    );
  }).join('');
}

export async function refreshProductImports() {
  const list = byId('productImportsList');
  if (list) list.innerHTML = '<div class="product-import-empty">Chargement…</div>';

  const rows = await fetchProductImports(10);
  renderImports(rows);
}

async function prepareProductImport() {
  const sourceUrl = byId('productImportSourceUrl')?.value.trim() || '';
  const rawText = byId('productImportRawText')?.value.trim() || '';

  if (!selectedFile && !sourceUrl && !rawText) {
    setStatus('Ajoute une capture, une URL source ou du texte Alibaba.', 'error');
    return;
  }

  const button = byId('productImportPrepareBtn');
  if (button) {
    button.disabled = true;
    button.textContent = 'Préparation…';
  }
  setStatus('Création du dossier sécurisé…');

  try {
    const row = await insertProductImport({
      source_image: sourceUrl || null,
      raw_text: rawText || null,
      status: 'RECEIVED'
    });

    setStatus('Import ' + row.id.slice(0, 8) + '… reçu. Prêt pour l’analyse IA.', 'success');
    showToast('✅ Import placé dans le sas');
    await refreshProductImports();

    byId('productImportSourceUrl').value = '';
    byId('productImportRawText').value = '';
    selectedFile = null;
    resetPreview();
    const fileInput = byId('productImportFile');
    if (fileInput) fileInput.value = '';
  } catch (err) {
    setStatus(err?.message || 'Impossible de créer l’import.', 'error');
    showToast('❌ Impossible de préparer l’import');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = 'Préparer l’analyse →';
    }
  }
}

async function handleDeleteImport(id) {
  if (!id) return;
  try {
    await deleteProductImport(id);
    showToast('🗑️ Import supprimé');
    await refreshProductImports();
  } catch (err) {
    setStatus(err?.message || 'Suppression impossible.', 'error');
  }
}

export function initProductImportUI() {
  if (initialized) return;
  initialized = true;

  const chooseBtn = byId('productImportChooseBtn');
  const fileInput = byId('productImportFile');
  const prepareBtn = byId('productImportPrepareBtn');
  const refreshBtn = byId('productImportRefreshBtn');
  const list = byId('productImportsList');

  chooseBtn?.addEventListener('click', () => fileInput?.click());

  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0] || null;
    selectedFile = file;
    if (file) {
      renderPreview(file);
      setStatus('Capture prête. Elle sera envoyée durablement lors de la pipeline média.', 'success');
    } else {
      resetPreview();
    }
  });

  prepareBtn?.addEventListener('click', prepareProductImport);
  refreshBtn?.addEventListener('click', refreshProductImports);

  list?.addEventListener('click', event => {
    const button = event.target.closest('[data-import-id]');
    if (button) handleDeleteImport(button.dataset.importId);
  });

  refreshProductImports();
}
