// ═══ Admin — sélecteur multi-choix réutilisable (couleurs & tailles) ═══
// Composant générique : bouton + menu déroulant à cases à cocher, recherche,
// puces (tags) sous le bouton, option "＋ Autre…" pour les valeurs personnalisées.
// Valeur exposée = chaîne "A, B, C" (format identique au stockage Supabase).

/** Nettoyage d'une valeur saisie manuellement : trim, suppression des virgules. */
function cleanValue(raw) {
  return String(raw || '').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
}

const escapeHtml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// ── Listes de départ ──────────────────────────────────────────────────────
export const DEFAULT_COULEURS = [
  { name: 'Noir', hex: '#000000' },
  { name: 'Blanc', hex: '#ffffff' },
  { name: 'Gris', hex: '#808080' },
  { name: 'Gris clair', hex: '#d3d3d3' },
  { name: 'Rouge', hex: '#e53935' },
  { name: 'Bordeaux', hex: '#7b1f2b' },
  { name: 'Rose', hex: '#ff6fa5' },
  { name: 'Fuchsia', hex: '#d500f5' },
  { name: 'Orange', hex: '#ff8c42' },
  { name: 'Jaune', hex: '#ffd93d' },
  { name: 'Or', hex: '#c9a227' },
  { name: 'Beige', hex: '#d9c6a5' },
  { name: 'Kaki', hex: '#6b6b3a' },
  { name: 'Vert', hex: '#2e9e4f' },
  { name: 'Vert menthe', hex: '#98ffc9' },
  { name: 'Vert armée', hex: '#4b5320' },
  { name: 'Turquoise', hex: '#2ec4b6' },
  { name: 'Cyan', hex: '#00bcd4' },
  { name: 'Bleu ciel', hex: '#87ceeb' },
  { name: 'Bleu roi', hex: '#2b5fb0' },
  { name: 'Bleu', hex: '#1e6fd9' },
  { name: 'Bleu marine', hex: '#1b2a4a' },
  { name: 'Marine', hex: '#14213d' },
  { name: 'Violet', hex: '#7e3ff2' },
  { name: 'Lavande', hex: '#b39ddb' },
  { name: 'Marron', hex: '#7b4b2a' },
  { name: 'Camel', hex: '#c19a6b' },
  { name: 'Argent', hex: '#c0c0c0' },
  { name: 'Doré', hex: '#d4af37' },
  { name: 'Champagne', hex: '#f7e7ce' },
  { name: 'Anthracite', hex: '#383838' },
  { name: 'Multicolore', hex: '' }, // pas de pastille fiable → initiale
];

export const DEFAULT_TAILLES = [
  'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL',
  '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46',
  'Taille unique',
];

// Normalise une liste (objets couleur ou chaînes taille) en [{name, hex}]
function normalizeOptions(list) {
  return list.map(o => (typeof o === 'string' ? { name: o, hex: null } : { name: o.name, hex: o.hex || null }));
}

export class MultiSelect {
  /**
   * @param {HTMLElement} container Élément hôte (ex. <div id="adminCouleurs">)
   * @param {Object} opts
   *   - options {Array<string|{name,hex}>} Liste de départ
   *   - placeholder {string} Texte du bouton quand rien n'est sélectionné
   *   - withColorPicker {boolean} Afficher <input type=color> dans "＋ Autre…"
   *   - searchPlaceholder {string}
   */
  constructor(container, opts = {}) {
    this.container = container;
    this.withColorPicker = !!opts.withColorPicker;
    this.placeholder = opts.placeholder || 'Sélectionner…';
    this.searchPlaceholder = opts.searchPlaceholder || 'Rechercher…';
    this.options = normalizeOptions(opts.options || []);
    this.selected = []; // [{name, hex}] — ordre de sélection conservé
    this._open = false;
    this._render();
  }

  // ── API publique ────────────────────────────────────────────────────────
  /** Chaîne "A, B, C" (format de stockage inchangé). */
  getValue() {
    return this.selected.map(o => o.name).join(', ');
  }

  /** Recharge la sélection depuis une chaîne "A, B, C". */
  setValue(str) {
    this.selected = String(str || '')
      .split(',')
      .map(s => cleanValue(s))
      .filter(Boolean)
      .map(name => {
        const known = this.options.find(o => o.name.toLowerCase() === name.toLowerCase());
        return known ? { ...known } : { name, hex: null };
      });
    // Les noms inconnus rejoignent la liste pour la session
    this.selected.forEach(sel => this._ensureInList(sel));
    this._renderTags();
  }

  /** Vide la sélection. */
  reset() {
    this.selected = [];
    if (this._open) this._close();
    this._renderTags();
  }

  // ── Rendu ───────────────────────────────────────────────────────────────
  _render() {
    this.container.classList.add('ms');
    this.container.innerHTML = `
      <button type="button" class="ms-btn" aria-haspopup="listbox" aria-expanded="false">
        <span class="ms-btn-label">${escapeHtml(this.placeholder)}</span>
        <span class="ms-arrow" aria-hidden="true">▾</span>
      </button>
      <div class="ms-menu" role="listbox" hidden>
        <input type="text" class="ms-search" placeholder="${escapeHtml(this.searchPlaceholder)}" aria-label="Rechercher">
        <div class="ms-list"></div>
        <button type="button" class="ms-other">＋ Autre…</button>
        <div class="ms-custom" hidden>
          ${this.withColorPicker ? '<input type="color" class="ms-color-input" value="#808080" aria-label="Teinte">' : ''}
          <input type="text" class="ms-name-input" placeholder="Nom personnalisé" maxlength="40">
          <button type="button" class="ms-add-btn">Ajouter</button>
        </div>
      </div>
      <div class="ms-tags"></div>
    `;
    this.btn = this.container.querySelector('.ms-btn');
    this.btnLabel = this.container.querySelector('.ms-btn-label');
    this.menu = this.container.querySelector('.ms-menu');
    this.searchInput = this.container.querySelector('.ms-search');
    this.listEl = this.container.querySelector('.ms-list');
    this.otherBtn = this.container.querySelector('.ms-other');
    this.customRow = this.container.querySelector('.ms-custom');
    this.nameInput = this.container.querySelector('.ms-name-input');
    this.colorInput = this.container.querySelector('.ms-color-input');
    this.addBtn = this.container.querySelector('.ms-add-btn');
    this.tagsEl = this.container.querySelector('.ms-tags');

    this.btn.addEventListener('click', () => (this._open ? this._close() : this._show()));
    this.searchInput.addEventListener('input', () => this._renderList());
    this.otherBtn.addEventListener('click', () => this._openCustom());
    this.addBtn.addEventListener('click', () => this._addCustom());
    this.nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this._addCustom(); } });
    this.menu.addEventListener('keydown', (e) => { if (e.key === 'Escape') this._close(); });

    // Fermeture : clic dehors / Échap global
    this._onDocClick = (e) => {
      if (this._open && !this.container.contains(e.target)) this._close();
    };
    this._onDocKey = (e) => {
      if (this._open && e.key === 'Escape') this._close();
    };
    document.addEventListener('click', this._onDocClick);
    document.addEventListener('keydown', this._onDocKey);

    this._renderList();
    this._renderTags();
  }

  _swatchHtml(opt) {
    if (opt.hex) return `<span class="ms-swatch" style="background:${escapeHtml(opt.hex)}"></span>`;
    return `<span class="ms-swatch ms-swatch-none">${escapeHtml((opt.name.charAt(0) || '?').toUpperCase())}</span>`;
  }

  _renderList() {
    const q = cleanValue(this.searchInput.value).toLowerCase();
    const filtered = q
      ? this.options.filter(o => o.name.toLowerCase().includes(q))
      : this.options;
    if (!filtered.length) {
      this.listEl.innerHTML = '<div class="ms-empty">Aucun résultat — « ＋ Autre… » pour créer</div>';
      return;
    }
    this.listEl.innerHTML = filtered.map(o => {
      const checked = this.selected.some(s => s.name.toLowerCase() === o.name.toLowerCase());
      return `
        <label class="ms-option${checked ? ' checked' : ''}">
          <input type="checkbox" value="${escapeHtml(o.name)}"${checked ? ' checked' : ''}>
          ${this._swatchHtml(o)}
          <span class="ms-option-name">${escapeHtml(o.name)}</span>
        </label>`;
    }).join('');
    this.listEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => this._toggle(cb.value, cb.checked));
    });
  }

  _renderTags() {
    this.tagsEl.innerHTML = this.selected.map((o, i) => `
      <span class="ms-tag">
        ${o.hex ? `<span class="ms-swatch ms-swatch-sm" style="background:${escapeHtml(o.hex)}"></span>` : ''}
        <span class="ms-tag-name">${escapeHtml(o.name)}</span>
        <button type="button" class="ms-tag-x" data-i="${i}" aria-label="Retirer ${escapeHtml(o.name)}">×</button>
      </span>`).join('');
    this.tagsEl.querySelectorAll('.ms-tag-x').forEach(btn => {
      btn.addEventListener('click', () => this._removeAt(parseInt(btn.dataset.i, 10)));
    });
    this.btnLabel.textContent = this.selected.length
      ? `${this.selected.length} sélection${this.selected.length > 1 ? 's' : ''}`
      : this.placeholder;
    this.btn.classList.toggle('has-value', this.selected.length > 0);
  }

  // ── Logique ─────────────────────────────────────────────────────────────
  _toggle(name, on) {
    const norm = cleanValue(name);
    if (on) {
      if (!this.selected.some(s => s.name.toLowerCase() === norm.toLowerCase())) {
        const opt = this.options.find(o => o.name.toLowerCase() === norm.toLowerCase()) || { name: norm, hex: null };
        this.selected.push({ ...opt }); // ordre de sélection = ordre de la valeur finale
      }
    } else {
      this.selected = this.selected.filter(s => s.name.toLowerCase() !== norm.toLowerCase());
    }
    this._renderList();
    this._renderTags();
  }

  _removeAt(i) {
    const removed = this.selected[i];
    if (!removed) return;
    this.selected.splice(i, 1);
    this._renderList();
    this._renderTags();
  }

  _ensureInList(opt) {
    if (!this.options.some(o => o.name.toLowerCase() === opt.name.toLowerCase())) {
      this.options.push({ ...opt });
    }
  }

  _openCustom() {
    this.customRow.hidden = false;
    this.otherBtn.hidden = true;
    this.nameInput.focus();
  }

  _addCustom() {
    const name = cleanValue(this.nameInput.value);
    if (!name) { this.nameInput.focus(); return; }
    const exists = this.options.find(o => o.name.toLowerCase() === name.toLowerCase());
    const opt = exists
      ? { ...exists }
      : { name, hex: this.colorInput ? this.colorInput.value : null };
    this._ensureInList(opt);
    if (!this.selected.some(s => s.name.toLowerCase() === name.toLowerCase())) {
      this.selected.push(opt); // ajout à la sélection + liste (session)
    }
    this.nameInput.value = '';
    this.customRow.hidden = true;
    this.otherBtn.hidden = false;
    this._renderList();
    this._renderTags();
  }

  _show() {
    this._open = true;
    this.menu.hidden = false;
    this.container.classList.add('open');
    this.btn.setAttribute('aria-expanded', 'true');
    this.searchInput.value = '';
    this._renderList();
    this.searchInput.focus();
  }

  _close() {
    this._open = false;
    this.menu.hidden = true;
    this.container.classList.remove('open');
    this.btn.setAttribute('aria-expanded', 'false');
    this.customRow.hidden = true;
    this.otherBtn.hidden = false;
  }
}

/**
 * Fabrique un MultiSelect dans le conteneur donné.
 * kind: 'couleurs' | 'tailles'
 */
export function initMultiSelect(containerId, kind) {
  const el = document.getElementById(containerId);
  if (!el) return null;
  const ms = kind === 'couleurs'
    ? new MultiSelect(el, {
        options: DEFAULT_COULEURS,
        placeholder: 'Choisir les couleurs…',
        searchPlaceholder: 'Rechercher une couleur…',
        withColorPicker: true,
      })
    : new MultiSelect(el, {
        options: DEFAULT_TAILLES,
        placeholder: 'Choisir les tailles…',
        searchPlaceholder: 'Rechercher une taille…',
        withColorPicker: false,
      });
  el._multiSelect = ms; // accès direct depuis product-form.js
  return ms;
}

/** Récupère l'instance associée à un conteneur. */
export function getMultiSelect(containerId) {
  const el = document.getElementById(containerId);
  return el ? el._multiSelect || null : null;
}
