// ═══ Admin — import produit intelligent (PR #2) ═══
import { showToast } from '../../utils/dom-helpers.js';
import { fetchProductImports, insertProductImport, processProductImport, uploadProductImportMedia, publishProductImport, deleteProductImport } from '../../api/api.js';

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
let currentImportId = null;
let pricingReady = false;
let mediaReady = false;

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
  const classificationPanel = byId('productImportClassification');
  if (classificationPanel) classificationPanel.hidden = true;
  const grid = byId('productImportAnalysisGrid');
  if (grid) grid.innerHTML = '';
  const variants = byId('productImportAnalysisVariants');
  if (variants) variants.innerHTML = '';
  const classificationHint = byId('productImportClassificationHint');
  if (classificationHint) classificationHint.innerHTML = '';
  const pricingPanel = byId('productImportPricing');
  if (pricingPanel) pricingPanel.hidden = true;
  const pricingResult = byId('productImportPriceResult');
  if (pricingResult) pricingResult.textContent = '';
  currentImportId = null;
  pricingReady = false;
  mediaReady = false;
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

function setPricingDefaults(analysis) {
  const currency = String(analysis?.supplier_currency || '').trim().toUpperCase();
  const fx = byId('productImportFxRate');
  const margin = byId('productImportMargin');
  const rounding = byId('productImportRounding');
  if (margin && !margin.value) margin.value = '30';
  if (rounding && !rounding.value) rounding.value = '500';
  if (fx) fx.value = currency === 'XAF' ? '1' : '';
}

function showPricingPanel(analysis, classification) {
  const panel = byId('productImportPricing');
  const button = byId('productImportPriceBtn');
  const note = byId('productImportPricingNote');
  if (!panel) return;

  const confidence = Number(classification?.classification?.overall_confidence || 0);
  const categoryReady = Boolean(classification?.category) && confidence >= 0.70;
  panel.hidden = false;
  setPricingDefaults(analysis);

  if (note) {
    note.textContent = categoryReady
      ? 'Paramètres modifiables. Pour une devise étrangère, saisis le taux vers XAF.'
      : 'Le calcul reste verrouillé tant qu’une catégorie fiable n’est pas validée.';
  }
  pricingReady = categoryReady && Boolean(currentImportId);
  if (button) button.disabled = !pricingReady;
}

function showMediaPanel(ready = false) {
  const panel = byId('productImportMedia');
  const button = byId('productImportMediaBtn');
  const note = byId('productImportMediaNote');
  if (!panel) return;

  panel.hidden = false;
  mediaReady = Boolean(ready);
  if (note) {
    note.textContent = ready
      ? 'Image persistante enregistrée dans Cloudinary.'
      : 'L’image sera envoyée à Cloudinary après le calcul du prix.';
  }
  if (button) {
    button.disabled = !currentImportId || !pricingReady || mediaReady;
    button.textContent = ready ? 'Média prêt ✓' : 'Finaliser le média →';
  }
}

function renderMedia(media) {
  const note = byId('productImportMediaNote');
  const button = byId('productImportMediaBtn');
  if (!media) return;
  mediaReady = true;
  if (note) {
    const url = media?.images?.[0]?.delivery_url || media?.images?.[0]?.secure_url || '';
    note.innerHTML = url
      ? 'Cloudinary OK · <a href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer">voir l’image optimisée</a>.'
      : 'Image persistante enregistrée dans Cloudinary.';
  }
  if (button) {
    button.disabled = true;
    button.textContent = 'Média prêt ✓';
  }
}

async function uploadImportMedia() {
  if (!currentImportId || mediaReady) return;
  const button = byId('productImportMediaBtn');
  if (button) {
    button.disabled = true;
    button.textContent = 'Reprise…';
  }
  try {
    if (!imageDataUrl) throw new Error('Capture locale indisponible pour la reprise Cloudinary.');
    const result = await processProductImport(currentImportId, imageDataUrl, null, false);
    if (result?.status === 'PUBLISHED') {
      showToast('🚀 Produit publié automatiquement');
      setStatus('Produit publié dans le catalogue (#' + result.productId + ').', 'success');
    } else if (result?.status === 'MEDIA_READY') {
      if (result.media) renderMedia(result.media);
      setStatus(
        result.review_required
          ? 'Média prêt. Validation admin requise avant publication.'
          : 'Média persistant prêt.',
        'success'
      );
      showToast('☁️ Média Cloudinary prêt');
    } else {
      setStatus('Reprise terminée au statut ' + (result?.status || 'inconnu') + '.', 'success');
    }
    await refreshProductImports();

    if (result?.status === 'PUBLISHED' || result?.media) {
      currentImportId = null;
      pricingReady = false;
      mediaReady = result?.status === 'MEDIA_READY' || Boolean(result?.media);
      imageDataUrl = null;
      selectedFile = null;
      resetPreview();
      const fileInput = byId('productImportFile');
      if (fileInput) fileInput.value = '';
    }
  } catch (err) {
    setStatus(err?.message || 'Reprise Cloudinary impossible.', 'error');
    showToast('❌ Reprise interrompue');
  } finally {
    if (button) {
      button.disabled = !currentImportId || !pricingReady || mediaReady;
      button.textContent = mediaReady ? 'Média prêt ✓' : 'Finaliser le média →';
    }
  }
}

async function calculateImportPrice() {
  if (!currentImportId) return;
  const pricing = {
    fx_rate_to_xaf: byId('productImportFxRate')?.value,
    logistics_xaf: byId('productImportLogistics')?.value,
    duty_rate: Number(byId('productImportDuty')?.value || 0) / 100,
    marketplace_fee_rate: Number(byId('productImportFee')?.value || 0) / 100,
    target_margin_rate: Number(byId('productImportMargin')?.value || 0) / 100,
    rounding_increment_xaf: byId('productImportRounding')?.value
  };
  const button = byId('productImportPriceBtn');
  if (button) {
    button.disabled = true;
    button.textContent = 'Pipeline…';
  }

  try {
    const result = await processProductImport(currentImportId, imageDataUrl, pricing, false);
    if (result?.pricing) await renderPrice(result.pricing);

    if (result?.status === 'PUBLISHED') {
      showToast('🚀 Produit publié automatiquement');
      setStatus('Pipeline terminée. Produit publié dans le catalogue (#' + result.productId + ').', 'success');
      currentImportId = null;
      pricingReady = false;
      mediaReady = true;
      imageDataUrl = null;
      selectedFile = null;
      resetPreview();
      const fileInput = byId('productImportFile');
      if (fileInput) fileInput.value = '';
      await refreshProductImports();
      return;
    }

    if (result?.status === 'MEDIA_READY') {
      if (result.media) renderMedia(result.media);
      showToast(result.review_required ? '☁️ Média prêt · validation requise' : '☁️ Média prêt');
      setStatus(
        result.review_required
          ? 'Pipeline arrêtée : approbation admin requise avant publication.'
          : 'Pipeline terminée : média prêt.',
        'success'
      );
      if (result.media) {
        currentImportId = null;
        pricingReady = false;
        imageDataUrl = null;
        selectedFile = null;
        resetPreview();
        const fileInput = byId('productImportFile');
        if (fileInput) fileInput.value = '';
      }
      await refreshProductImports();
      return;
    }

    setStatus(
      result?.status === 'CLASSIFIED'
        ? 'Classification terminée. Paramètres de prix prêts.'
        : 'Pipeline reprise au statut ' + (result?.status || 'inconnu') + '.',
      'success'
    );
    await refreshProductImports();
  } catch (err) {
    setStatus(err?.message || 'Pipeline import impossible.', 'error');
    showToast('❌ Pipeline interrompue');
  } finally {
    if (button) {
      button.disabled = !pricingReady || mediaReady;
      button.textContent = 'Lancer la pipeline →';
    }
  }
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
    const price = row.calculated_price != null
      ? 'Prix : ' + String(row.calculated_price) + ' XAF'
      : '';
    return (
      '<article class="product-import-row">' +
        '<div class="product-import-row-main">' +
          '<div class="product-import-row-title">' + escapeHtml(title) + '</div>' +
          '<div class="product-import-row-meta">' +
            '<span class="product-import-status-pill status-' + escapeHtml(String(row.status || '').toLowerCase()) + '">' + escapeHtml(status) + '</span>' +
            '<span>' + escapeHtml(source) + '</span>' +
            (price ? '<span>' + escapeHtml(price) + '</span>' : '') +
            '<span>' + escapeHtml(formatDate(row.created_at)) + '</span>' +
          '</div>' +
        '<div class="product-import-row-actions">' +
          ((row.status === 'MEDIA_READY' || row.status === 'READY') ? '<button type="button" class="product-import-publish" data-publish-import-id="' + escapeHtml(row.id) + '">Publier</button>' : '') +
          '<button type="button" class="product-import-delete" data-import-id="' + escapeHtml(row.id) + '" aria-label="Supprimer cet import">🗑️</button>' +
          '</div>' +
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
    setStatus('Ajoute une capture pour lancer la pipeline Vision.', 'error');
    return;
  }

  const button = byId('productImportPrepareBtn');
  if (button) {
    button.disabled = true;
    button.textContent = 'Pipeline…';
  }
  setStatus('Création du dossier sécurisé…');

  try {
    const data = imageDataUrl || await buildAnalysisImage(selectedFile);

    const row = await insertProductImport({
      source_image: sourceUrl || null,
      raw_text: rawText || null,
      status: 'RECEIVED'
    });

    currentImportId = row.id;
    setStatus('Import ' + row.id.slice(0, 8) + '… · Vision + classification automatiques…');

    const result = await processProductImport(row.id, data, null, false);

    const analysis = result?.analysis || null;
    const classification = result?.classification
      ? {
          classification: result.classification,
          category: result.category
            ? {
                name: result.category.name,
                parent_name: result.category.parent_name
              }
            : null
        }
      : null;

    if (analysis) renderAnalysis(analysis, classification);
    if (classification) showPricingPanel(analysis || {}, classification);
    showMediaPanel(false);

    if (result?.status === 'LOW_CONFIDENCE') {
      setStatus('Import bloqué automatiquement : confiance insuffisante (' +
        Math.round(Number(result?.classification?.overall_confidence || 0) * 100) + '%).', 'error');
    } else if (result?.status === 'CLASSIFIED') {
      setStatus(
        Number(result?.classification?.overall_confidence || 0) >= 0.9
          ? 'Classification automatique validée. Paramètres de prix prêts.'
          : 'Classification trouvée. Validation humaine recommandée avant publication.',
        'success'
      );
    } else {
      setStatus('Pipeline reprise au statut ' + (result?.status || 'inconnu') + '.', 'success');
    }

    showToast('🤖 Pipeline Vision + classification terminée');
    await refreshProductImports();

    byId('productImportSourceUrl').value = '';
    byId('productImportRawText').value = '';
    selectedFile = null;
    // Conserver la data URL compressée pour le pricing/media/retry pendant cette session.
    const preparedImageDataUrl = imageDataUrl;
    resetPreview();
    imageDataUrl = preparedImageDataUrl;

    const fileInput = byId('productImportFile');
    if (fileInput) fileInput.value = '';
  } catch (err) {
    setStatus(err?.message || 'Pipeline import impossible.', 'error');
    showToast('❌ Pipeline interrompue');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = 'Lancer la pipeline →';
    }
  }
}


async function handlePublishImport(id) {
  if (!id) return;
  try {
    const result = await publishProductImport(id, true);
    showToast(result.mode === 'AUTO' ? '🚀 Produit publié automatiquement' : '✅ Produit publié');
    setStatus('Produit publié dans le catalogue (#' + result.productId + ').', 'success');
    await refreshProductImports();
  } catch (err) {
    setStatus(err?.message || 'Publication impossible.', 'error');
    showToast('❌ Publication impossible');
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
  byId('productImportPriceBtn')?.addEventListener('click', calculateImportPrice);
  byId('productImportMediaBtn')?.addEventListener('click', uploadImportMedia);

  list?.addEventListener('click', event => {
    const publishButton = event.target.closest('[data-publish-import-id]');
    if (publishButton) {
      handlePublishImport(publishButton.dataset.publishImportId);
      return;
    }
    const button = event.target.closest('[data-import-id]');
    if (button) handleDeleteImport(button.dataset.importId);
  });

  refreshProductImports();
}
