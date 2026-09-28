// ═══ Fiche produit — options (tailles + couleurs avec steppers) ═══
// Éclaté de product-modal.js (refacto-archi) — logique strictement identique.
import { escapeHtml } from '../../utils/escape-html.js';
import { thumbImg } from '../../utils/images.js';
import { modalCtx } from './modal-state.js';
import { goToImageForColor } from './modal-carousel.js';
import { getTotalColorQty, updateTotal } from './modal-total.js';

function renderOptions(ct, opts, sel, ty) {
    ct.innerHTML = '';
    opts.forEach(o => {
        const b = document.createElement('button');
        b.className = 'option-btn' + (o === sel ? ' selected' : '');
        b.textContent = o;
        b.onclick = () => {
            ct.querySelectorAll('.option-btn').forEach(x => x.classList.remove('selected'));
            b.classList.add('selected');
            if (ty === 'taille') modalCtx.sT = o; else modalCtx.sC = o;
        };
        ct.appendChild(b);
    });
}

export function renderTailleOptions() {
    document.getElementById('modalTailleGroup').style.display = modalCtx.tailles.length ? 'block' : 'none';
    if (modalCtx.tailles.length) renderOptions(document.getElementById('modalTailleOptions'), modalCtx.tailles, modalCtx.sT, 'taille');
}

export function renderCouleurOptions() {
    const couleurs = modalCtx.couleurs;
    const imgs = modalCtx.imgs;
    const couleurGroup = document.getElementById('modalCouleurGroup');
    const couleurOpts = document.getElementById('modalCouleurOptions');

    if (couleurs.length && couleurGroup && couleurOpts) {
        couleurGroup.style.display = 'block';
        const label = couleurGroup.querySelector('label');
        if (label) label.textContent = `Couleurs — choisis les quantités`;

        couleurOpts.className = 'option-buttons color-variant-list';
        modalCtx.colorQtys = {};
        couleurOpts.innerHTML = couleurs.map((c, i) => {
            const imgSrc = imgs[i] || imgs[0] || '';
            const thumbHtml = imgSrc ? thumbImg(imgSrc, c, 52, 52) : '';
            modalCtx.colorQtys[c] = 0;
            return `
            <div class="color-variant-row" data-val="${escapeHtml(c)}" data-idx="${i}">
                <button type="button" class="color-variant-thumb" title="${escapeHtml(c)}" aria-label="Voir ${escapeHtml(c)}">
                    ${thumbHtml ? `<span class="swatch-img">${thumbHtml}</span>` : `<span class="swatch-fallback">${escapeHtml(c.charAt(0).toUpperCase())}</span>`}
                </button>
                <div class="color-variant-info">
                    <span class="color-variant-name">${escapeHtml(c)}</span>
                </div>
                <div class="mini-qty-stepper">
                    <button type="button" class="mini-qty-btn" data-action="minus" data-color="${escapeHtml(c)}" aria-label="Diminuer">−</button>
                    <span class="mini-qty-value" data-color="${escapeHtml(c)}">0</span>
                    <button type="button" class="mini-qty-btn" data-action="plus" data-color="${escapeHtml(c)}" aria-label="Augmenter">+</button>
                </div>
            </div>`;
        }).join('');

        couleurOpts.querySelectorAll('.color-variant-thumb').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const row = btn.closest('.color-variant-row');
                const idx = Number(row.dataset.idx);
                goToImageForColor(idx);
                couleurOpts.querySelectorAll('.color-variant-row').forEach(r => r.classList.remove('active-preview'));
                row.classList.add('active-preview');
                modalCtx.sC = row.dataset.val;
            };
        });

        couleurOpts.querySelectorAll('.mini-qty-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const color = btn.dataset.color;
                const action = btn.dataset.action;
                let q = Number(modalCtx.colorQtys[color]) || 0;
                if (action === 'plus') q += 1;
                else q = Math.max(0, q - 1);
                modalCtx.colorQtys[color] = q;

                const valEl = couleurOpts.querySelector(`.mini-qty-value[data-color="${CSS.escape(color)}"]`);
                if (valEl) valEl.textContent = String(q);

                const row = btn.closest('.color-variant-row');
                if (row) row.classList.toggle('has-qty', q > 0);

                if (label) {
                    const total = getTotalColorQty();
                    if (total > 0) {
                        const parts = Object.entries(modalCtx.colorQtys)
                            .filter(([, qty]) => qty > 0)
                            .map(([c, qty]) => `${c} ×${qty}`);
                        label.textContent = `Couleurs (${total} pcs) : ${parts.join(', ')}`;
                    } else {
                        label.textContent = `Couleurs — choisis les quantités`;
                    }
                }
                updateTotal();
            };
        });

        const firstRow = couleurOpts.querySelector('.color-variant-row');
        if (firstRow) {
            firstRow.classList.add('active-preview');
            goToImageForColor(0);
        }
    } else if (couleurGroup) {
        couleurGroup.style.display = 'none';
    }
}
