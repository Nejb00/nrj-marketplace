// ─── PHASE 3 📷 v2 — « Montre-moi, je trouve » (précision boostée) ─────────
// Boosts : CDN de secours, center-crop, signature couleur, diagnostic visible.

import { state } from './state.js';
import { escapeHtml, formatPrice, thumbImg, showToast, thumb } from './utils.js';

const INDEX_KEY = 'nrj_visual_index';
const TF_CDNS = [
  'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.20.0/dist/tf.min.js',
  'https://unpkg.com/@tensorflow/tfjs@4.20.0/dist/tf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/tfjs/4.20.0/tf.min.js'
];
const MB_CDNS = [
  'https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.1/dist/mobilenet.min.js',
  'https://unpkg.com/@tensorflow-models/mobilenet@2.1.1/dist/mobilenet.min.js'
];

let model = null;
let busy = false;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = resolve; s.onerror = () => reject(new Error('CDN: ' + src));
    document.head.appendChild(s);
  });
}

async function loadScriptWithFallback(list) {
  let lastErr = null;
  for (const src of list) {
    try { await loadScript(src); return; } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('Tous les CDN ont échoué');
}

async function loadModel() {
  if (model) return model;
  showToast('📥 Téléchargement du moteur visuel…');
  if (!window.tf) await loadScriptWithFallback(TF_CDNS);
  if (!window.mobilenet) await loadScriptWithFallback(MB_CDNS);
  model = await window.mobilenet.load({ version: 2, alpha: 0.5 });
  return model;
}

function loadImg(src, cross = true) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (cross) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image illisible'));
    img.src = src;
  });
}

// ✅ Center-crop carré (comme les vignettes du catalogue) → comparaison cohérente
function croppedTensor(imgEl) {
  return window.tf.tidy(() => {
    let x = window.tf.browser.fromPixels(imgEl);
    const h = x.shape[0], w = x.shape[1];
    const s = Math.min(h, w);
    x = x.slice([Math.floor((h - s) / 2), Math.floor((w - s) / 2), 0], [s, s, 3]);
    return window.tf.image.resizeBilinear(x, [224, 224]).toFloat();
  });
}

async function embed(imgEl) {
  const t = croppedTensor(imgEl);
  const out = model.infer(t, true);
  const arr = Array.from(await out.data());
  out.dispose(); t.dispose();
  const norm = Math.sqrt(arr.reduce((s, v) => s + v * v, 0)) || 1;
  let str = '';
  for (let i = 0; i < arr.length; i++) {
    const q = Math.max(-127, Math.min(127, Math.round((arr[i] / norm) * 127)));
    str += String.fromCharCode(q + 128);
  }
  return str;
}

// ✅ Signature couleur (64 teintes) — le juge de paix anti-faux positifs
function colorSig(imgEl) {
  try {
    const c = document.createElement('canvas');
    c.width = 32; c.height = 32;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const w = imgEl.naturalWidth || imgEl.width, h = imgEl.naturalHeight || imgEl.height;
    const s = Math.min(h, w);
    ctx.drawImage(imgEl, Math.floor((w - s) / 2), Math.floor((h - s) / 2), s, s, 0, 0, 32, 32);
    const d = ctx.getImageData(0, 0, 32, 32).data;
    const bins = new Array(64).fill(0);
    for (let i = 0; i < d.length; i += 4) bins[((d[i] >> 6) << 4) | ((d[i + 1] >> 6) << 2) | (d[i + 2] >> 6)]++;
    const total = d.length / 4;
    let str = '';
    for (let i = 0; i < 64; i++) str += String.fromCharCode(Math.min(255, Math.round((bins[i] / total) * 255)));
    return str;
  } catch { return ''; }
}

function dequant(str) {
  const a = new Array(str.length);
  for (let i = 0; i < str.length; i++) a[i] = str.charCodeAt(i) - 128;
  return a;
}

function cosine(aStr, bStr) {
  if (!aStr || !bStr || aStr.length !== bStr.length) return 0;
  const a = dequant(aStr), b = dequant(bStr);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / ((Math.sqrt(na) * Math.sqrt(nb)) || 1);
}

function readIndex() {
  try {
    const raw = JSON.parse(localStorage.getItem(INDEX_KEY) || '{}');
    // Migration v1 : les anciennes entrées "string" deviennent { e, c }
    for (const k of Object.keys(raw)) if (typeof raw[k] === 'string') raw[k] = { e: raw[k], c: '' };
    return raw;
  } catch { return {}; }
}
function writeIndex(idx) {
  try { localStorage.setItem(INDEX_KEY, JSON.stringify(idx)); return true; } catch { return false; }
}

async function indexProducts(list, onProgress) {
  const idx = readIndex();
  let done = 0;
  for (const p of list) {
    if (!idx[p.id] || !idx[p.id].e) {
      try {
        const img = await loadImg(thumb(p.image, 224, 224));
        idx[p.id] = { e: await embed(img), c: colorSig(img) };
        writeIndex(idx);
      } catch {}
    }
    done++;
    if (onProgress && done % 10 === 0) onProgress(done, list.length);
  }
  return idx;
}

// ─── UI injectée ────────────────────────────────────────────────────────────
const style = document.createElement('style');
style.textContent = `
#visualOverlay{position:fixed;inset:0;z-index:500;background:rgba(10,10,12,0.75);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);display:none;overflow-y:auto;padding:1rem;}
#visualOverlay.open{display:block;}
.visual-panel{max-width:720px;margin:0 auto;background:rgba(16,16,20,0.9);border:1px solid rgba(255,255,255,0.08);border-radius:22px;padding:1rem;}
.visual-head{display:flex;align-items:center;justify-content:space-between;gap:0.5rem;margin-bottom:0.8rem;}
.visual-title{font-weight:800;color:var(--text);font-size:0.95rem;}
.visual-conf{font-size:0.72rem;color:var(--text-secondary);font-weight:600;margin-top:0.15rem;}
#visualCloseBtn{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:var(--text);width:36px;height:36px;border-radius:50%;cursor:pointer;font-size:1rem;flex-shrink:0;}
.visual-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:0.8rem;}
@media(min-width:768px){.visual-grid{grid-template-columns:repeat(3,1fr);}}
.visual-empty{grid-column:1/-1;text-align:center;color:var(--text-secondary);padding:2rem 0;}
`;
document.head.appendChild(style);

const overlay = document.createElement('div');
overlay.id = 'visualOverlay';
overlay.innerHTML = `
  <div class="visual-panel">
    <div class="visual-head">
      <div>
        <div class="visual-title">📷 Produits visuellement similaires</div>
        <div class="visual-conf" id="visualConf"></div>
      </div>
      <button id="visualCloseBtn" aria-label="Fermer">✕</button>
    </div>
    <div class="visual-grid" id="visualGrid"></div>
  </div>`;
document.body.appendChild(overlay);
overlay.querySelector('#visualCloseBtn').addEventListener('click', () => overlay.classList.remove('open'));
overlay.addEventListener('click', e => { if (e.target.closest('.rec-card')) overlay.classList.remove('open'); });

const micBtn = document.querySelector('.search-bar .search-voice');
if (micBtn && !document.getElementById('visualSearchBtn')) {
  const cam = document.createElement('button');
  cam.id = 'visualSearchBtn';
  cam.className = 'search-voice';
  cam.setAttribute('aria-label', 'Recherche par photo');
  cam.title = 'Recherche par photo';
  cam.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M9 3 7.17 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.17L15 3H9zm3 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-2a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/></svg>';
  micBtn.parentNode.insertBefore(cam, micBtn);

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);
  cam.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const f = fileInput.files && fileInput.files[0];
    if (f) searchByImage(f);
    fileInput.value = '';
  });
}

async function searchByImage(file) {
  if (busy) return;
  busy = true;
  try {
    model = await loadModel();

    const ordered = [...state.products].filter(p => p.image)
      .sort((a, b) => (Number(b.popularity_score) || 0) - (Number(a.popularity_score) || 0));
    const missing = ordered.filter(p => !readIndex()[p.id] || !readIndex()[p.id].e);
    const firstBatch = missing.slice(0, 60);
    if (firstBatch.length) {
      await indexProducts(firstBatch, (d, n) => showToast(`🧠 Index ${d}/${n}`));
    }

    showToast('🔍 Analyse de ta photo…');
    const userImg = await loadImg(URL.createObjectURL(file), false);
    const userEmb = await embed(userImg);
    const userCol = colorSig(userImg);

    const idx = readIndex();
    const scored = Object.entries(idx)
      .filter(([, v]) => v.e)
      .map(([id, v]) => {
        const e = cosine(userEmb, v.e);
        const c = userCol && v.c ? cosine(userCol, v.c) : 0;
        return { id: Number(id), emb: e, score: 0.65 * e + 0.35 * c };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);

    const results = scored.map(s => state.products.find(p => p.id === s.id)).filter(Boolean);

    // ✅ Niveau de confiance affiché (plus de silence !)
    const top = scored[0] ? scored[0].emb : 0;
    const conf = top > 0.85 ? '🟢 Correspondance forte' : top > 0.55 ? '🟡 Similarité moyenne' : '🔴 Similarité faible — prends une photo du produit, centrée et nette';
    overlay.querySelector('#visualConf').textContent = `${conf} · ${results.length} résultat(s)`;

    const grid = overlay.querySelector('#visualGrid');
    grid.innerHTML = results.length
      ? results.map(r => `
        <div class="rec-card" data-product-id="${r.id}">
          <div class="rec-card-img">${r.image ? thumbImg(r.image, r.name, 300, 400) : '📦'}</div>
          <div class="rec-card-overlay">
            <div class="rec-card-name">${escapeHtml(r.name)}</div>
            <div class="rec-card-bottom">
              <div class="rec-card-price">${formatPrice(r.price)}</div>
              <div class="rec-card-moq">Min. ${Number(r.moq) || 1} pcs</div>
            </div>
          </div>
        </div>`).join('')
      : '<div class="visual-empty">Index vide 😅 Le moteur n\'a pas pu indexer les produits (réseau ?). Réessaie.</div>';
    overlay.classList.add('open');

    const rest = missing.slice(60);
    if (rest.length) setTimeout(() => { indexProducts(rest).catch(() => {}); }, 3000);
  } catch (e) {
    console.error('visual search', e);
    showToast('❌ ' + (e && e.message ? e.message : 'Moteur visuel indisponible'));
  } finally {
    busy = false;
  }
}