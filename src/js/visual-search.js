// ─── PHASE 3 📷 — « Montre-moi, je trouve » : recherche visuelle par photo ──
// 100 % navigateur : TensorFlow.js + MobileNet chargés à la demande (CDN),
// empreintes visuelles en localStorage, similarité cosinus.
// Aucune clé API, aucun serveur, aucun coût.

import { state } from './state.js';
import { escapeHtml, formatPrice, thumbImg, showToast, thumb } from './utils.js';

const INDEX_KEY = 'nrj_visual_index';
const TF_CDN = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.20.0/dist/tf.min.js';
const MB_CDN = 'https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.1/dist/mobilenet.min.js';

let model = null;
let busy = false;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = resolve; s.onerror = () => reject(new Error('cdn'));
    document.head.appendChild(s);
  });
}

async function loadModel() {
  if (model) return model;
  if (!window.tf) await loadScript(TF_CDN);
  if (!window.mobilenet) await loadScript(MB_CDN);
  model = await window.mobilenet.load({ version: 2, alpha: 0.5 });
  return model;
}

function loadImg(src, cross = true) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (cross) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function embed(imgEl) {
  const t = model.infer(imgEl, true);
  const arr = Array.from(await t.data());
  t.dispose();
  const norm = Math.sqrt(arr.reduce((s, v) => s + v * v, 0)) || 1;
  // Quantification Int8 → chaîne compacte (1024 caractères)
  let str = '';
  for (let i = 0; i < arr.length; i++) {
    const q = Math.max(-127, Math.min(127, Math.round((arr[i] / norm) * 127)));
    str += String.fromCharCode(q + 128);
  }
  return str;
}

function dequant(str) {
  const a = new Array(str.length);
  for (let i = 0; i < str.length; i++) a[i] = str.charCodeAt(i) - 128;
  return a;
}

function cosine(aStr, bStr) {
  const a = dequant(aStr), b = dequant(bStr);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / ((Math.sqrt(na) * Math.sqrt(nb)) || 1);
}

function readIndex() {
  try { return JSON.parse(localStorage.getItem(INDEX_KEY) || '{}'); } catch { return {}; }
}
function writeIndex(idx) {
  try { localStorage.setItem(INDEX_KEY, JSON.stringify(idx)); return true; } catch { return false; }
}

async function indexProducts(list, onProgress) {
  const idx = readIndex();
  let done = 0;
  for (const p of list) {
    if (!idx[p.id]) {
      try {
        const img = await loadImg(thumb(p.image, 224, 224));
        idx[p.id] = await embed(img);
        writeIndex(idx);
      } catch {}
    }
    done++;
    if (onProgress && done % 10 === 0) onProgress(done, list.length);
  }
  return idx;
}

// ─── UI injectée (styles + panneau + bouton caméra) ────────────────────────
const style = document.createElement('style');
style.textContent = `
#visualOverlay{position:fixed;inset:0;z-index:500;background:rgba(10,10,12,0.75);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);display:none;overflow-y:auto;padding:1rem;}
#visualOverlay.open{display:block;}
.visual-panel{max-width:720px;margin:0 auto;background:rgba(16,16,20,0.9);border:1px solid rgba(255,255,255,0.08);border-radius:22px;padding:1rem;}
.visual-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:0.8rem;}
.visual-title{font-weight:800;color:var(--text);font-size:1rem;}
#visualCloseBtn{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:var(--text);width:36px;height:36px;border-radius:50%;cursor:pointer;font-size:1rem;}
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
      <div class="visual-title">📷 Produits visuellement similaires</div>
      <button id="visualCloseBtn" aria-label="Fermer">✕</button>
    </div>
    <div class="visual-grid" id="visualGrid"></div>
  </div>`;
document.body.appendChild(overlay);
overlay.querySelector('#visualCloseBtn').addEventListener('click', () => overlay.classList.remove('open'));
overlay.addEventListener('click', e => { if (e.target.closest('.rec-card')) overlay.classList.remove('open'); });

// ✅ Bouton caméra dans la barre de recherche (même style que le micro)
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
    showToast('📥 Moteur visuel…');
    model = await loadModel();

    // Index visuel : les plus populaires d'abord, le reste en arrière-plan
    const ordered = [...state.products].filter(p => p.image)
      .sort((a, b) => (Number(b.popularity_score) || 0) - (Number(a.popularity_score) || 0));
    const missing = ordered.filter(p => !readIndex()[p.id]);
    const firstBatch = missing.slice(0, 60);
    if (firstBatch.length) {
      await indexProducts(firstBatch, (d, n) => showToast(`🧠 Index ${d}/${n}`));
    }

    const userImg = await loadImg(URL.createObjectURL(file), false);
    const userEmb = await embed(userImg);

    const idx = readIndex();
    const results = Object.entries(idx)
      .map(([id, emb]) => ({ id: Number(id), score: cosine(userEmb, emb) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map(s => state.products.find(p => p.id === s.id))
      .filter(Boolean);

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
      : '<div class="visual-empty">Aucune similarité trouvée 😅 Essaie une autre photo.</div>';
    overlay.classList.add('open');

    // Le reste du catalogue s'indexe en arrière-plan pour la prochaine fois
    const rest = missing.slice(60);
    if (rest.length) setTimeout(() => { indexProducts(rest).catch(() => {}); }, 3000);
  } catch (e) {
    console.error('visual search', e);
    showToast('❌ Recherche visuelle indisponible');
  } finally {
    busy = false;
  }
                      }
