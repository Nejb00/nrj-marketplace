// ═══ Admin — import produit intelligent (PR #2) ═══
import { showToast } from '../../utils/dom-helpers.js';
import { analyzeProductImport, classifyProductImport, fetchProductImports, insertProductImport, deleteProductImport } from '../../api/api.js';

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
let imageDataUrl = null;
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
  imageDataUrl = null;
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  }
  if (preview) {
    preview.hidden = true;
    preview.innerHTML = '';
  }
}

async function buildAnalysisImage(file) {
  if (!file) return null;
  if (!file.type.startsWith('image/')) throw new Error('Le fichier sélectionné n’est pas une image.');
  if (file.size > 8 * 1024 * 1024) throw new Error('Image trop volumineuse. Limite : 8 Mo.');

  const source = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = source;
    await image.decode();

    const maxSide = 1600;
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Préparation de l’image impossible.');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    if (dataUrl.length > 15 * 1024 * 1024) throw new Error('Image encore trop volumineuse après compression.');
    imageDataUrl = dataUrl;
    return dataUrl;
  } finally {
    URL.revokeObjectURL(source);
  }
}

function renderAnalysis(analysis, classification = null) {
  const panel = byId('productImportAnalysis');
  const grid = byId('productImportAnalysisGrid');
  const variants = byId('productImportAnalysisVariants');
  const confidence = byId('productImportConfidence');
  const classificationPanel = byId('productImportClassification');
  const classificationHint = byId('productImportClassificationHint');
  if (!panel || !grid || !variants || !confidence) return;

  const pct = Math.round(Number(classification?.classification?.overall_confidence ?? analysis?.overall_confidence ?? 0) * 100);
  confidence.textContent = pct + '% de confiance';

  const fields = [
    ['Nom', analysis?.product_name || '—'],
    ['Description', analysis?.description || '—'],
    ['Prix fournisseur', analysis?.supplier_price != null ? String(analysis.supplier_price) + ' ' + (analysis.supplier_currency || '') : '—'],
    ['MOQ', analysis?.moq || '—'],
    ['Indice visuel', analysis?.visual_category_hint || '—']
  ];

  grid.innerHTML = fields.map(([label, value]) =>
    '<div><dt>' + escapeHtml(label) + '</dt><dd>' + escapeHtml(value) + '</dd></div>'
  ).join('');

  const colors = Array.isArray(analysis?.variants?.colors) ? analysis.variants.colors : [];
  const sizes = Array.isArray(analysis?.variants?.sizes) ? analysis.variants.sizes : [];
  const extras = Array.isArray(analysis?.variants?.other) ? analysis.variants.other : [];
  if (classificationPanel && classificationHint) {
    const category = classification?.category;
    const meta = classification?.classification;
    const path = category
      ? (category.parent_name ? category.parent_name + ' > ' + category.name : category.name)
      : 'Aucune catégorie fiable';

    classificationPanel.hidden = false;
    classificationHint.innerHTML =
      '<strong>' + escapeHtml(path) + '</strong>' +
      '<span>' +
        (meta?.auto_publish_eligible
          ? 'Classification automatique ≥ 90%'
          : meta?.review_required
            ? 'Validation humaine recommandée (70–89%)'
            : 'Blocage : confiance insuffisante') +
      '</span>' +
      (meta?.reason ? '<small>' + escapeHtml(meta.reason) + '</small>' : '');
  }

  variants.innerHTML =
    '<strong>Variantes</strong>' +
    '<div class="product-import-variant-lines">' +
      '<span>Couleurs : ' + escapeHtml(colors.length ? colors.join(', ') : '—') + '</span>' +
      '<span>Tailles : ' + escapeHtml(sizes.length ? sizes.join(', ') : '—') + '</span>' +
      '<span>Autres : ' + escapeHtml(extras.length ? extras.join(', ') : '—') + '</span>' +
    '</div>';

  panel.hidden = false;
}

function clearAnalysis() {
  const panel = byId('productImportAnalysis');
  if (panel) panel.hidden = true;
  const grid = byId('productImportAnalysisGrid');
  if (grid) grid.innerHTML = '';
  const variants = byId('productImportAnalysisVariants');
  if (variants) variants.innerHTML = '';
}

async function renderPreview(file) {
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

  if (!selectedFile) {
    setStatus('Ajoute une capture pour l’analyse Vision. Le texte Alibaba reste facultatif.', 'error');
    return;
  }

  const button = byId('productImportPrepareBtn');
  if (button) {
    button.disabled = true;
    button.textContent = 'Préparation…';
  }
  setStatus('Création du dossier sécurisé…');

  try {
    const data = imageDataUrl || await buildAnalysisImage(selectedFile);

    const row = await insertProductImport({
      source_image: sourceUrl || null,
      raw_text: rawText || null,
      status: 'RECEIVED'
    });

    setStatus('Import ' + row.id.slice(0, 8) + '… reçu. Analyse Vision en cours…');
    const result = await analyzeProductImport(row.id, data, rawText);
    renderAnalysis(result.analysis);

    setStatus('Analyse terminée. Classement contre le catalogue en cours…');
    const classification = await classifyProductImport(row.id);
    renderAnalysis(result.analysis, classification);

    const confidence = Number(classification?.classification?.overall_confidence || 0);
    setStatus(
      confidence >= 0.9
        ? 'Catégorie validée automatiquement : ' + Math.round(confidence * 100) + '%.'
        : confidence >= 0.7
          ? 'Catégorie trouvée : validation humaine recommandée (' + Math.round(confidence * 100) + '%).'
          : 'Import bloqué : classification insuffisamment fiable (' + Math.round(confidence * 100) + '%.',
      confidence >= 0.7 ? 'success' : 'error'
    );
    showToast('🧠 Analyse + classification terminées');
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
      button.textContent = 'Analyser avec l’IA →';
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

  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0] || null;
    selectedFile = file;
    clearAnalysis();
    if (file) {
      try {
        await renderPreview(file);
        setStatus('Capture prête. Elle sera compressée puis envoyée temporairement à l’IA.', 'success');
      } catch (err) {
        selectedFile = null;
        resetPreview();
        fileInput.value = '';
        setStatus(err?.message || 'Image invalide.', 'error');
      }
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
