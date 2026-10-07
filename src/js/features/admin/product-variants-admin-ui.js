import { state } from '../../core/state.js';
import { escapeHtml } from '../../utils/escape-html.js';
import {
    deleteProductVariant,
    loadProductVariantGraph,
    normalizeVariantEditorInput,
    saveProductVariantGraph
} from './product-variants-admin.js';

let initialized = false;
let currentProductId = null;
let currentVariantId = null;
let currentVariants = [];

const $ = (id) => document.getElementById(id);

function setStatus(message = '', tone = '') {
    const el = $('adminVariantsStatus');
    if (!el) return;
    el.textContent = message;
    el.className = 'admin-variants-status' + (tone ? ' is-' + tone : '');
}

function getProduct(id) {
    return state.products.find((product) => Number(product.id) === Number(id)) || null;
}

function populateProducts(selectedId = null) {
    const select = $('adminVariantsProduct');
    if (!select) return;

    const products = [...state.products]
        .filter((product) => product && product.id != null)
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'fr'));

    select.replaceChildren();
    for (const product of products) {
        const option = document.createElement('option');
        option.value = String(product.id);
        option.textContent = product.name + ' [ID: ' + product.id + ']';
        if (String(product.id) === String(selectedId ?? currentProductId ?? '')) option.selected = true;
        select.appendChild(option);
    }
}

function resetEditor() {
    currentVariantId = null;
    $('adminVariantId').value = '';
    $('adminVariantKey').value = '';
    $('adminVariantLabel').value = '';
    $('adminVariantColor').value = '';
    $('adminVariantSize').value = '';
    $('adminVariantSku').value = '';
    $('adminVariantPrice').value = '';
    $('adminVariantMoq').value = '';
    $('adminVariantSort').value = '0';
    $('adminVariantActive').checked = true;
    $('adminVariantMedia').value = '';
    $('adminVariantSaveBtn').textContent = 'Enregistrer la variante';
}

function fillEditor(variant) {
    currentVariantId = variant.id;
    $('adminVariantId').value = String(variant.id);
    $('adminVariantKey').value = variant.variant_key || '';
    $('adminVariantLabel').value = variant.label || '';
    $('adminVariantColor').value = variant.color || '';
    $('adminVariantSize').value = variant.size || '';
    $('adminVariantSku').value = variant.sku || '';
    $('adminVariantPrice').value = variant.price ?? '';
    $('adminVariantMoq').value = variant.moq ?? '';
    $('adminVariantSort').value = String(variant.sort_order ?? 0);
    $('adminVariantActive').checked = variant.active !== false;
    $('adminVariantMedia').value = (variant.media || []).map((item) => item.url).join('\n');
    $('adminVariantSaveBtn').textContent = 'Mettre à jour la variante';
}

function renderVariants() {
    const list = $('adminVariantsList');
    if (!list) return;

    list.replaceChildren();

    if (!currentVariants.length) {
        const empty = document.createElement('div');
        empty.className = 'admin-variants-empty';
        empty.textContent = 'Aucune variante V2 personnalisée. Le produit utilise encore son modèle legacy.';
        list.appendChild(empty);
        return;
    }

    for (const variant of currentVariants) {
        const article = document.createElement('article');
        article.className = 'admin-variant-row' + (variant.active ? '' : ' is-inactive');

        const title = document.createElement('div');
        title.className = 'admin-variant-title';
        title.textContent = variant.label || variant.variant_key;

        const meta = document.createElement('div');
        meta.className = 'admin-variant-meta';
        const dimensions = [variant.color, variant.size].filter(Boolean).join(' · ');
        meta.textContent = [
            dimensions || 'Attributs libres',
            variant.sku ? 'SKU ' + variant.sku : '',
            variant.price != null ? new Intl.NumberFormat('fr-FR').format(variant.price) + ' XAF' : 'Prix produit',
            variant.moq ? 'MOQ ' + variant.moq : 'MOQ produit'
        ].filter(Boolean).join(' · ');

        const media = document.createElement('div');
        media.className = 'admin-variant-media-count';
        media.textContent = String((variant.media || []).length) + ' média' + ((variant.media || []).length > 1 ? 's' : '');

        const actions = document.createElement('div');
        actions.className = 'admin-variant-actions';

        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'admin-variant-edit';
        edit.dataset.variantId = String(variant.id);
        edit.textContent = 'Modifier';

        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'admin-variant-delete';
        del.dataset.variantId = String(variant.id);
        del.textContent = 'Supprimer';

        actions.append(edit, del);
        article.append(title, meta, media, actions);
        list.appendChild(article);
    }
}

async function loadSelectedProduct(productId) {
    const product = getProduct(productId);
    if (!product) {
        setStatus('Produit introuvable dans le catalogue chargé.', 'error');
        return;
    }

    currentProductId = Number(product.id);
    currentVariants = [];

    const productName = $('adminVariantsProductName');
    if (productName) productName.textContent = product.name || 'Produit';

    resetEditor();
    setStatus('Chargement des variantes…');

    try {
        const graph = await loadProductVariantGraph(currentProductId);
        currentVariants = graph.variants;
        renderVariants();
        setStatus(
            currentVariants.length
                ? currentVariants.length + ' variante' + (currentVariants.length > 1 ? 's' : '') + ' V2 chargée' + (currentVariants.length > 1 ? 's' : '') + '.'
                : 'Aucune variante V2 personnalisée pour ce produit.',
            'success'
        );
    } catch (error) {
        currentVariants = [];
        renderVariants();
        setStatus(error?.message || 'Chargement des variantes impossible.', 'error');
    }
}

async function handleSave() {
    if (!currentProductId) return;

    const input = normalizeVariantEditorInput({
        key: $('adminVariantKey').value,
        label: $('adminVariantLabel').value,
        color: $('adminVariantColor').value,
        size: $('adminVariantSize').value,
        sku: $('adminVariantSku').value,
        price: $('adminVariantPrice').value,
        moq: $('adminVariantMoq').value,
        sort_order: $('adminVariantSort').value,
        active: $('adminVariantActive').checked,
        mediaUrls: $('adminVariantMedia').value
    });

    if (!input.label) {
        setStatus('Ajoute un libellé à la variante.', 'error');
        $('adminVariantLabel').focus();
        return;
    }

    const save = $('adminVariantSaveBtn');
    if (save) {
        save.disabled = true;
        save.textContent = 'Enregistrement…';
    }

    try {
        const result = await saveProductVariantGraph(currentProductId, input);
        setStatus(
            'Variante enregistrée · ' + Number(result?.media_count || 0) + ' média(s).',
            'success'
        );
        await loadSelectedProduct(currentProductId);
    } catch (error) {
        setStatus(error?.message || 'Enregistrement impossible.', 'error');
    } finally {
        if (save) save.disabled = false;
    }
}

async function handleDelete(variantId) {
    const variant = currentVariants.find((item) => String(item.id) === String(variantId));
    if (!variant) return;

    if (!confirm('Supprimer la variante « ' + (variant.label || variant.variant_key) + ' » et tous ses médias ?')) return;

    try {
        await deleteProductVariant(variantId);
        setStatus('Variante supprimée.', 'success');
        resetEditor();
        await loadSelectedProduct(currentProductId);
    } catch (error) {
        setStatus(error?.message || 'Suppression impossible.', 'error');
    }
}

export function openProductVariantsEditor(productId) {
    const id = Number(productId);
    if (!Number.isSafeInteger(id) || id <= 0) return;

    const section = $('adminVariantsSection');
    if (!section) return;
    section.hidden = false;

    populateProducts(id);
    $('adminVariantsProduct').value = String(id);
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    loadSelectedProduct(id);
}

export function initProductVariantsAdminUI() {
    if (initialized) return;
    initialized = true;

    const section = $('adminVariantsSection');
    const select = $('adminVariantsProduct');
    if (!section || !select) return;

    populateProducts();

    select.addEventListener('change', () => {
        loadSelectedProduct(select.value);
    });

    $('adminVariantsNewBtn')?.addEventListener('click', () => {
        resetEditor();
        $('adminVariantLabel')?.focus();
    });

    $('adminVariantSaveBtn')?.addEventListener('click', handleSave);

    $('adminVariantsList')?.addEventListener('click', (event) => {
        const edit = event.target.closest('[data-variant-id]');
        if (!edit) return;

        const variant = currentVariants.find((item) => String(item.id) === String(edit.dataset.variantId));
        if (!variant) return;

        if (edit.classList.contains('admin-variant-edit')) {
            fillEditor(variant);
            $('adminVariantLabel')?.focus();
        } else if (edit.classList.contains('admin-variant-delete')) {
            handleDelete(edit.dataset.variantId);
        }
    });

    section.hidden = false;
    if (state.products.length) {
        const firstProduct = state.products[0];
        select.value = String(firstProduct.id);
        loadSelectedProduct(firstProduct.id);
    }
}
