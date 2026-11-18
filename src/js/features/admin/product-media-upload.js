import { supabaseClient } from '../../core/config.js';

export const MAX_PRODUCT_MEDIA_FILES = 6;
export const MAX_PRODUCT_MEDIA_FILE_BYTES = 9_500_000;

const ALLOWED_PRODUCT_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIGNATURE_PATTERN = /^[0-9a-f]{40}$/i;
const PRODUCT_MEDIA_PREFIX = 'nrj-marketplace/products/';

let selectedFiles = [];
let initialized = false;
let isUploading = false;

function byId(id) {
  return document.getElementById(id);
}

function setProductMediaStatus(message = '', tone = '') {
  const status = byId('productMediaStatus');
  if (!status) return;
  status.textContent = message;
  status.className = 'admin-product-media-status' + (tone ? ' is-' + tone : '');
}

function revokePreview(entry) {
  if (entry?.previewUrl) {
    URL.revokeObjectURL(entry.previewUrl);
    entry.previewUrl = null;
  }
}

function validateProductMediaFiles(files) {
  const list = Array.from(files || []);
  if (list.length > MAX_PRODUCT_MEDIA_FILES) {
    throw new Error('Tu peux sélectionner 6 images maximum.');
  }
  for (const file of list) {
    if (!ALLOWED_PRODUCT_MEDIA_TYPES.has(file.type)) {
      throw new Error('Format non accepté pour « ' + file.name + ' ». Utilise JPEG, PNG ou WEBP.');
    }
    if (file.size > MAX_PRODUCT_MEDIA_FILE_BYTES) {
      throw new Error('« ' + file.name + ' » dépasse la limite de 9,5 Mo.');
    }
  }
  return list;
}

function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' Ko';
  return (bytes / (1024 * 1024)).toFixed(1).replace('.', ',') + ' Mo';
}

function renderSelectedFiles() {
  const preview = byId('productMediaPreview');
  if (!preview) return;
  preview.replaceChildren();
  preview.hidden = selectedFiles.length === 0;

  selectedFiles.forEach((entry, index) => {
    const card = document.createElement('article');
    card.className = 'admin-product-media-item';

    const image = document.createElement('img');
    image.className = 'admin-product-media-item__image';
    image.src = entry.previewUrl;
    image.alt = 'Aperçu de ' + entry.file.name;
    image.loading = 'lazy';

    const info = document.createElement('div');
    info.className = 'admin-product-media-item__info';
    const name = document.createElement('span');
    name.className = 'admin-product-media-item__name';
    name.textContent = entry.file.name;
    const size = document.createElement('span');
    size.className = 'admin-product-media-item__size';
    size.textContent = formatFileSize(entry.file.size);
    info.append(name, size);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'admin-product-media-item__remove';
    remove.textContent = 'Retirer';
    remove.setAttribute('aria-label', 'Retirer ' + entry.file.name);
    remove.disabled = isUploading;
    remove.addEventListener('click', () => removeSelectedFile(index));

    const order = document.createElement('span');
    order.className = 'admin-product-media-item__order';
    order.textContent = String(index + 1);
    order.setAttribute('aria-label', 'Image numéro ' + (index + 1));

    card.append(image, order, info, remove);
    preview.appendChild(card);
  });
}

function removeSelectedFile(index) {
  if (isUploading || !Number.isInteger(index) || index < 0 || index >= selectedFiles.length) return;
  const [removed] = selectedFiles.splice(index, 1);
  revokePreview(removed);
  renderSelectedFiles();
  setProductMediaStatus(selectedFiles.length + ' image(s) sélectionnée(s).', 'success');
}

function handleFileSelection(event) {
  const input = event.currentTarget;
  const files = Array.from(input.files || []);
  input.value = '';

  try {
    validateProductMediaFiles(files);
    selectedFiles.forEach(revokePreview);
    selectedFiles = files.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }));
    renderSelectedFiles();
    setProductMediaStatus(
      selectedFiles.length
        ? selectedFiles.length + ' image(s) prête(s). Elles seront envoyées à la création du produit.'
        : 'Aucune image sélectionnée.',
      selectedFiles.length ? 'success' : ''
    );
  } catch (error) {
    setProductMediaStatus(error?.message || 'Sélection d’images invalide.', 'error');
  }
}

function setSubmitButtonBusy(busy) {
  const button = byId('addProductBtn');
  if (!button) return () => {};
  const wasDisabled = button.disabled;
  if (busy) {
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
  }
  return () => {
    button.disabled = wasDisabled;
    button.removeAttribute('aria-busy');
  };
}

function validateSignedManifest(data, expectedCount) {
  if (!data?.ok || typeof data.cloud_name !== 'string' || !/^[a-z0-9_-]+$/i.test(data.cloud_name)) {
    throw new Error('Réponse de signature Cloudinary invalide.');
  }
  if (typeof data.api_key !== 'string' || !data.api_key.trim()) {
    throw new Error('Clé publique Cloudinary absente de la réponse.');
  }
  if (typeof data.upload_preset !== 'string' || !data.upload_preset.trim()) {
    throw new Error('Preset Cloudinary non configuré.');
  }
  if (typeof data.batch_id !== 'string' || !UUID_PATTERN.test(data.batch_id)) {
    throw new Error('Identifiant de lot Cloudinary invalide.');
  }
  if (!Array.isArray(data.uploads) || data.uploads.length !== expectedCount) {
    throw new Error('Le nombre de signatures Cloudinary ne correspond pas aux images.');
  }

  const uploads = data.uploads.map((upload, index) => {
    const expectedSlot = index + 1;
    const expectedPublicId = PRODUCT_MEDIA_PREFIX + data.batch_id + '/' + expectedSlot;
    if (upload?.slot !== expectedSlot || upload.public_id !== expectedPublicId) {
      throw new Error('Identifiant média signé inattendu.');
    }
    if (!Number.isInteger(upload.timestamp) || upload.timestamp <= 0) {
      throw new Error('Horodatage de signature invalide.');
    }
    if (upload.overwrite !== 'false' || !SIGNATURE_PATTERN.test(upload.signature || '')) {
      throw new Error('Signature Cloudinary invalide.');
    }
    return upload;
  });

  return {
    cloudName: data.cloud_name,
    apiKey: data.api_key,
    uploadPreset: data.upload_preset,
    uploads,
  };
}

async function uploadOneFile(file, upload, manifest) {
  const form = new FormData();
  form.append('file', file);
  form.append('api_key', manifest.apiKey);
  form.append('timestamp', String(upload.timestamp));
  form.append('public_id', upload.public_id);
  form.append('overwrite', upload.overwrite);
  form.append('upload_preset', manifest.uploadPreset);
  form.append('signature', upload.signature);

  const endpoint = 'https://api.cloudinary.com/v1_1/' + manifest.cloudName + '/image/upload';
  const response = await fetch(endpoint, { method: 'POST', body: form });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error('Cloudinary a renvoyé une réponse illisible.');
  }

  if (!response.ok || result?.error) {
    throw new Error(result?.error?.message || 'Échec de l’envoi de « ' + file.name + ' ».');
  }
  if (result?.public_id !== upload.public_id) {
    throw new Error('Cloudinary a retourné un identifiant média inattendu.');
  }

  let secureUrl;
  try {
    secureUrl = new URL(result.secure_url);
  } catch {
    throw new Error('URL sécurisée Cloudinary absente ou invalide.');
  }
  const expectedPath = '/' + manifest.cloudName + '/image/upload/';
  if (secureUrl.protocol !== 'https:' || secureUrl.hostname !== 'res.cloudinary.com' || !secureUrl.pathname.startsWith(expectedPath)) {
    throw new Error('Cloudinary a retourné une URL média non autorisée.');
  }

  return secureUrl.href;
}

export function initProductMediaUploader() {
  if (initialized) return;
  const input = byId('productMediaFiles');
  const preview = byId('productMediaPreview');
  const status = byId('productMediaStatus');
  if (!input || !preview || !status) return;

  input.addEventListener('change', handleFileSelection);
  initialized = true;
}

export function getSelectedProductMediaFiles() {
  return selectedFiles.map((entry) => entry.file);
}

export async function cleanupProductMediaUploads(publicIds) {
  const ids = Array.from(new Set(Array.isArray(publicIds) ? publicIds : []));
  if (!ids.length) return;
  if (ids.length > MAX_PRODUCT_MEDIA_FILES || ids.some((id) => typeof id !== 'string' || !id.startsWith(PRODUCT_MEDIA_PREFIX))) {
    throw new Error('Identifiants de nettoyage Cloudinary invalides.');
  }

  const { data, error } = await supabaseClient.functions.invoke('cleanup-product-media-uploads', {
    body: { public_ids: ids },
  });
  if (error) {
    throw new Error('Nettoyage Cloudinary impossible : ' + (error.message || 'erreur réseau.'));
  }
  if (!data?.ok) {
    throw new Error('Certaines images temporaires n’ont pas pu être nettoyées.');
  }
}

export async function uploadSelectedProductMedia() {
  if (isUploading) throw new Error('Un envoi d’images est déjà en cours.');
  const files = getSelectedProductMediaFiles();
  if (!files.length) return { urls: [], publicIds: [] };
  validateProductMediaFiles(files);

  isUploading = true;
  const restoreSubmitButton = setSubmitButtonBusy(true);
  let signedPublicIds = [];
  setProductMediaStatus('Préparation sécurisée de l’envoi…', 'loading');

  try {
    const { data, error } = await supabaseClient.functions.invoke('sign-product-media-uploads', {
      body: { count: files.length },
    });
    if (error) {
      throw new Error('Signature Cloudinary impossible : ' + (error.message || 'vérifie ta connexion.'));
    }

    const manifest = validateSignedManifest(data, files.length);
    signedPublicIds = manifest.uploads.map((upload) => upload.public_id);
    const urls = [];

    for (let index = 0; index < files.length; index += 1) {
      setProductMediaStatus('Envoi de l’image ' + (index + 1) + '/' + files.length + ' vers Cloudinary…', 'loading');
      urls.push(await uploadOneFile(files[index], manifest.uploads[index], manifest));
    }

    setProductMediaStatus(files.length + ' image(s) envoyée(s) vers Cloudinary.', 'success');
    return { urls, publicIds: signedPublicIds.slice() };
  } catch (error) {
    const uploadError = error instanceof Error ? error : new Error('Envoi Cloudinary interrompu.');
    if (signedPublicIds.length) {
      try {
        await cleanupProductMediaUploads(signedPublicIds);
      } catch (cleanupError) {
        const cleanupMessage = cleanupError instanceof Error ? cleanupError.message : 'nettoyage incomplet.';
        const combinedError = new Error(uploadError.message + ' Le nettoyage automatique a échoué : ' + cleanupMessage);
        setProductMediaStatus(combinedError.message, 'error');
        throw combinedError;
      }
    }
    setProductMediaStatus(uploadError.message, 'error');
    throw uploadError;
  } finally {
    isUploading = false;
    restoreSubmitButton();
    renderSelectedFiles();
  }
}

export function resetProductMediaUploader() {
  if (isUploading) return;
  selectedFiles.forEach(revokePreview);
  selectedFiles = [];
  const input = byId('productMediaFiles');
  if (input) input.value = '';
  renderSelectedFiles();
  setProductMediaStatus('');
}
