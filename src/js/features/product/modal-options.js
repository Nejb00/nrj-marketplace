// ═══ Fiche produit — options (tailles + couleurs avec steppers) ═══
// Éclaté de product-modal.js (refacto-archi) — logique strictement identique.
import { escapeHtml } from '../../utils/escape-html.js';
import { formatPrice } from '../../utils/format.js';
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
            b.animate([{transform:'scale(.96)'},{transform:'scale(1)'}], {duration:160, easing:'ease-out'});
            updateTotal();
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
        const qtySummary = document.getElementById('modalColorQtySummary');
        const moqStatus = document.getElementById('modalColorMoqStatus');
        const progressBar = document.getElementById('modalColorProgressBar');

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
                    <span class="color-variant-subtotal" data-color-total="${escapeHtml(c)}">XAF 0</span>
                </div>
                <div class="mini-qty-stepper" aria-label="Quantité pour ${escapeHtml(c)}">
                    <button type="button" class="mini-qty-btn" data-action="minus" data-color="${escapeHtml(c)}" aria-label="Diminuer ${escapeHtml(c)}">−</button>
                    <span class="mini-qty-value" data-color="${escapeHtml(c)}" aria-live="polite">0</span>
                    <button type="button" class="mini-qty-btn" data-action="plus" data-color="${escapeHtml(c)}" aria-label="Augmenter ${escapeHtml(c)}">+</button>
                </div>
            </div>`;
        }).join('');

        const updateColorSummary = () => {
            const total = getTotalColorQty();
            const moq = modalCtx.moq;
            const remaining = Math.max(0, moq - total);
            if (qtySummary) {
                qtySummary.textContent = total === 0
                    ? '0 pièce'
                    : `${total} pièce${total > 1 ? 's' : ''}`;
                qtySummary.classList.toggle('ready', total >= moq);
            }
            if (moqStatus) {
                if (total >= moq) {
                    moqStatus.textContent = `✓ Minimum atteint · ${total} pcs`;
                    moqStatus.classList.add('ready');
                    moqStatus.classList.remove('pending');
                } else if (total > 0) {
                    moqStatus.textContent = `Encore ${remaining} pièce${remaining > 1 ? 's' : ''} pour atteindre le minimum`;
                    moqStatus.classList.add('pending');
                    moqStatus.classList.remove('ready');
                } else {
                    moqStatus.textContent = `Minimum : ${moq} pièce${moq > 1 ? 's' : ''}`;
                    moqStatus.classList.remove('pending', 'ready');
                }
            }
            if (progressBar) {
                progressBar.style.width = `${Math.min(100, moq > 0 ? (total / moq) * 100 : 0)}%`;
            }
        };

        const updateColorRow = (row, color, q) => {
            row?.classList.toggle('has-qty', q > 0);
            row?.classList.toggle('is-selected', q > 0);
            const valEl = row?.querySelector('.mini-qty-value');
            if (valEl) valEl.textContent = String(q);
            const totalEl = row?.querySelector(`[data-color-total="${CSS.escape(color)}"]`);
            if (totalEl) totalEl.textContent = formatPrice(modalCtx.uPrice * q);
            const minusBtn = row?.querySelector('.mini-qty-btn[data-action="minus"]');
            if (minusBtn) minusBtn.disabled = q <= 0;
        };

        const refreshColorUI = () => {
            couleurOpts.querySelectorAll('.color-variant-row').forEach(row => {
                const color = row.dataset.val;
                updateColorRow(row, color, Number(modalCtx.colorQtys[color]) || 0);
            });
            updateColorSummary();
        };

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

                const row = btn.closest('.color-variant-row');
                updateColorRow(row, color, q);
                updateColorSummary();

                if (label) {
                    const total = getTotalColorQty();
                    label.textContent = total > 0
                        ? `Couleurs — ${total} pièce${total > 1 ? 's' : ''}`
                        : 'Couleurs';
                }
                updateTotal();
            };
        });

        const firstRow = couleurOpts.querySelector('.color-variant-row');
        if (firstRow) {
            firstRow.classList.add('active-preview');
            goToImageForColor(0);
        }
        refreshColorUI();
    } else if (couleurGroup) {
        couleurGroup.style.display = 'none';
    }
}
