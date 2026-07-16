(function() {
    const SUPABASE_URL = 'https://peojyqliwrtghomyukwn.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_Fy-Q_BAginf2p6UdUtxDMA_V1hP8Slt';
    const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const BASE_URL = 'https://nejb00.github.io/nrj-marketplace/';
    const WHATSAPP_NUMBER = '242066271882';
    const PRODUCTS_PER_PAGE = 20;
    const NEW_PRODUCT_DAYS = 7;
    const POPULAR_THRESHOLD = 20;
    const MAX_SEARCH_RESULTS = 7;
    const SEARCH_HISTORY_KEY = 'nrj_search_history';
    const MAX_HISTORY_ITEMS = 5;

    const basePlaceholders = ["Rechercher un produit...", "Tendances de Chine 🇨🇳", "Arrivages de Turquie 🇹🇷", "Sélection France 🇫🇷", "Grossiste direct..."];
    let rotationList = [...basePlaceholders];
    let currentPlaceholderIndex = 0;
    let searchDebounceTimer = null;
    let isVoiceListening = false;

    // État pour la page de recherche dédiée
    let searchViewState = {
        query: '',
        filters: { priceMin: null, priceMax: null, categories: [], sizes: [], colors: [] },
        sortBy: 'relevance',
        viewMode: 'grid'
    };
    let searchViewInitialized = false;

    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => { clearTimeout(timeout); func(...args); };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    function trackViewedItem(name) {
        if (!name) return;
        const formattedName = name.length > 22 ? name.substring(0, 22) + "..." : name;
        rotationList = rotationList.filter(item => item !== formattedName);
        rotationList.unshift(formattedName);
        if (rotationList.length > 8) rotationList.pop();
    }

    function initPlaceholderRotation() {
        const input = document.getElementById('searchInput');
        if (!input) return;
        setInterval(() => {
            if (document.activeElement !== input && input.value === '') {
                currentPlaceholderIndex = (currentPlaceholderIndex + 1) % rotationList.length;
                input.placeholder = rotationList[currentPlaceholderIndex];
            }
        }, 3500);
    }

    function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
    function formatPrice(a) { return 'XAF ' + a.toLocaleString('fr-FR'); }
    function removeEmojis(s) { return s.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2300}-\u{23FF}\u{2B50}\u{2B55}\u{2934}\u{2935}\u{25AA}\u{25AB}\u{25FE}\u{25FD}\u{25FB}\u{25FC}\u{25B6}\u{25C0}\u{3030}\u{303D}\u{3297}\u{3299}\u{FE0F}\u{200D}]/gu, '').trim(); }

    function trackPopularity(productId, points) {
        supabaseClient.rpc('increment_popularity', { product_id: productId, amount: points }).then(({ error }) => {
            if (error) console.warn('Erreur tracking popularité:', error);
        });
    }

    function isNewProduct(p) { if (!p.created_at) return false; return (Date.now() - new Date(p.created_at).getTime()) / (1000 * 60 * 60 * 24) <= NEW_PRODUCT_DAYS; }
    function isBestSeller(p) { return (Number(p.popularity_score) || 0) >= POPULAR_THRESHOLD; }

    function generateBadgesHTML(p, isModal = false) {
        const isNew = isNewProduct(p);
        const isBest = isBestSeller(p);
        if (!isModal) {
            if (isBest) return '<div class="badge-container"><span class="badge badge-best-seller">🔥 Populaire</span></div>';
            if (isNew) return '<div class="badge-container"><span class="badge badge-new">✨ Nouveau</span></div>';
            return '';
        }
        let html = '<div class="badge-container">';
        if (isNew) html += '<span class="badge badge-new">✨ Nouveau</span>';
        if (isBest) html += '<span class="badge badge-best-seller">🔥 Populaire</span>';
        html += '</div>';
        return (isNew || isBest) ? html : '';
    }

    function showToast(m) { const t = document.getElementById('toast'); t.textContent = m; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2000); }

    function getCategoryIcon(category) {
        if (!category) return '📦';
        const cat = category.toLowerCase();
        if (cat.includes('chaussure') || cat.includes('basket') || cat.includes('sneaker') || cat.includes('sport')) return '👟';
        if (cat.includes('électronique') || cat.includes('electronique') || cat.includes('tech') || cat.includes('phone') || cat.includes('mobile')) return '📱';
        if (cat.includes('mode') || cat.includes('vêtement') || cat.includes('vetement') || cat.includes('fashion')) return '👕';
        if (cat.includes('bijou') || cat.includes('accessoire')) return '💍';
        if (cat.includes('maison') || cat.includes('déco') || cat.includes('deco')) return '🏠';
        if (cat.includes('beauté') || cat.includes('beaute') || cat.includes('cosmétique')) return '💄';
        if (cat.includes('enfant') || cat.includes('jouet')) return '🧸';
        if (cat.includes('livre') || cat.includes('book')) return '📚';
        return '📦';
    }

    function normalizeString(str) {
        return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    }

    function calculateSearchScore(query, product) {
        const normalizedQuery = normalizeString(query);
        const queryWords = normalizedQuery.split(' ').filter(w => w.length > 0);
        const name = normalizeString(product.name || '');
        const category = normalizeString(product.category || '');
        const description = normalizeString(product.description || '');
        const tailles = normalizeString(product.tailles || '');
        const couleurs = normalizeString(product.couleurs || '');
        const id = String(product.id);
        let score = 0;
        if (id === query.trim()) score += 2000;
        if (name === normalizedQuery) score += 1000;
        else if (name.startsWith(normalizedQuery)) score += 500;
        else if (name.includes(normalizedQuery)) score += 200;
        queryWords.forEach(word => {
            if (word.length < 2) return;
            if (name.includes(word)) score += 100;
            if (category.includes(word)) score += 50;
            if (description.includes(word)) score += 20;
            if (tailles.includes(word)) score += 30;
            if (couleurs.includes(word)) score += 30;
            const wordRegex = new RegExp(`\\b${word}`, 'i');
            if (wordRegex.test(name)) score += 30;
        });
        if (score === 0 && queryWords.length === 1) {
            const queryWord = queryWords[0];
            const nameWords = name.split(' ');
            for (const nameWord of nameWords) {
                if (nameWord.length < 3) continue;
                const distance = levenshteinDistance(queryWord, nameWord);
                const maxLen = Math.max(queryWord.length, nameWord.length);
                const similarity = 1 - (distance / maxLen);
                if (similarity > 0.7) { score += Math.round(similarity * 80); break; }
            }
        }
        if (isBestSeller(product)) score += 15;
        if (isNewProduct(product)) score += 10;
        return score;
    }

    function levenshteinDistance(a, b) {
        if (a.length === 0) return b.length;
        if (b.length === 0) return a.length;
        const matrix = [];
        for (let i = 0; i <= b.length; i++) matrix[i] = [i];
        for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) matrix[i][j] = matrix[i - 1][j - 1];
                else matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
            }
        }
        return matrix[b.length][a.length];
    }

    function fuzzySearch(query, products) {
        if (!query || query.trim().length === 0) return [];
        const scored = products.map(p => ({ product: p, score: calculateSearchScore(query, p) })).filter(item => item.score > 0);
        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, MAX_SEARCH_RESULTS).map(item => item.product);
    }

    function highlightMatch(text, query) {
        if (!query || !text) return escapeHtml(text || '');
        const escapedText = escapeHtml(text);
        const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return escapedText.replace(regex, '<span class="highlight">$1</span>');
    }

    function getSearchHistory() {
        try { return JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || '[]'); } catch (e) { return []; }
    }
    function saveSearchToHistory(query) {
        if (!query || query.trim().length < 2) return;
        let history = getSearchHistory();
        history = history.filter(h => h.toLowerCase() !== query.toLowerCase());
        history.unshift(query.trim());
        if (history.length > MAX_HISTORY_ITEMS) history = history.slice(0, MAX_HISTORY_ITEMS);
        try { localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history)); } catch (e) {}
    }
    function clearSearchHistory() {
        try { localStorage.removeItem(SEARCH_HISTORY_KEY); } catch (e) {}
    }

    function initVoiceSearch() {
        const voiceBtn = document.getElementById('searchVoice');
        const searchInput = document.getElementById('searchInput');
        if (!voiceBtn || !searchInput) return;
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) { voiceBtn.style.display = 'none'; return; }
        const recognition = new SpeechRecognition();
        recognition.lang = 'fr-FR';
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.onstart = () => { isVoiceListening = true; voiceBtn.classList.add('listening'); searchInput.placeholder = '🎤 Parlez maintenant...'; };
        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            searchInput.value = transcript;
            searchInput.dispatchEvent(new Event('input'));
            showToast(`🎤 "${transcript}"`);
        };
        recognition.onerror = (event) => {
            console.warn('Erreur reconnaissance vocale:', event.error);
            if (event.error === 'no-speech') showToast('❌ Aucune parole détectée');
            else if (event.error === 'not-allowed') showToast('❌ Accès au microphone refusé');
            else showToast('❌ Erreur de reconnaissance vocale');
        };
        recognition.onend = () => { isVoiceListening = false; voiceBtn.classList.remove('listening'); searchInput.placeholder = rotationList[currentPlaceholderIndex]; };
        voiceBtn.addEventListener('click', () => {
            if (isVoiceListening) recognition.stop();
            else { try { recognition.start(); } catch (e) { console.warn('Impossible de démarrer la reconnaissance vocale:', e); } }
        });
    }

    function showSearchDropdown(query) {
        const dropdown = document.getElementById('searchDropdown');
        const clearBtn = document.getElementById('searchClear');
        const loader = document.getElementById('searchLoader');
        if (!query || query.trim().length === 0) {
            const history = getSearchHistory();
            if (history.length > 0) {
                let html = `<div class="dropdown-header"><span>🕐 Recherches récentes</span><button onclick="window.clearSearchHistory && window.clearSearchHistory()">Effacer</button></div>`;
                history.forEach(h => { html += `<div class="dropdown-history-item" data-query="${escapeHtml(h)}"><span class="dropdown-history-icon">🕐</span><span class="dropdown-history-text">${escapeHtml(h)}</span></div>`; });
                dropdown.innerHTML = html;
                dropdown.style.display = 'block';
                dropdown.querySelectorAll('.dropdown-history-item').forEach(item => {
                    item.addEventListener('click', () => {
                        const q = item.dataset.query;
                        document.getElementById('searchInput').value = q;
                        performSearch(q);
                        hideSearchDropdown();
                    });
                });
            } else hideSearchDropdown();
            if (clearBtn) clearBtn.style.display = 'none';
            if (loader) loader.style.display = 'none';
            return;
        }
        if (clearBtn) clearBtn.style.display = 'block';
        if (loader) loader.style.display = 'block';
        setTimeout(() => {
            const results = fuzzySearch(query, products);
            if (loader) loader.style.display = 'none';
            if (results.length === 0) {
                dropdown.innerHTML = `<div class="dropdown-no-results"><div class="dropdown-no-results-icon">🔍</div><div>Aucun produit trouvé pour "${escapeHtml(query)}"</div></div>`;
                dropdown.style.display = 'block';
                return;
            }
            let html = `<div class="dropdown-header"><span>${results.length} résultat${results.length > 1 ? 's' : ''}</span></div>`;
            results.forEach(p => {
                const img = p.image ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}">` : `<span>${getCategoryIcon(p.category)}</span>`;
                html += `<div class="dropdown-item" data-product-id="${p.id}"><div class="dropdown-item-img">${img}</div><div class="dropdown-item-info"><div class="dropdown-item-name">${highlightMatch(p.name, query)}</div><div class="dropdown-item-category">${getCategoryIcon(p.category)} ${escapeHtml(p.category || 'Sans catégorie')}</div></div><div class="dropdown-item-price">${formatPrice(p.price)}</div></div>`;
            });
            dropdown.innerHTML = html;
            dropdown.style.display = 'block';
            dropdown.querySelectorAll('.dropdown-item').forEach(item => {
                item.addEventListener('click', () => {
                    const id = parseInt(item.dataset.productId);
                    hideSearchDropdown();
                    openProductModal(id);
                    document.getElementById('searchInput').blur();
                });
            });
        }, 150);
    }

    function hideSearchDropdown() { const d = document.getElementById('searchDropdown'); if (d) d.style.display = 'none'; }

    function performSearch(query) {
        searchQuery = query;
        refreshCatalogue();
        saveSearchToHistory(query);
    }

    // ----- Gestion de la vue recherche dédiée (superposée) -----
    function switchToSearchView(query) {
        const searchView = document.getElementById('searchView');
        if (!searchView) return;
        searchView.style.display = 'flex';
        document.getElementById('searchViewInput').value = query || '';
        document.getElementById('searchViewClear').style.display = query ? 'block' : 'none';
        searchViewState.query = query || '';
        if (query) window.history.pushState({ search: true }, '', `?search=${encodeURIComponent(query)}`);
        if (!searchViewInitialized) {
            initializeSearchFilters();
            searchViewInitialized = true;
        }
        performAdvancedSearch();
    }

    function switchFromSearchView() {
        const searchView = document.getElementById('searchView');
        if (searchView) searchView.style.display = 'none';
        window.history.replaceState({}, '', window.location.pathname);
    }

    function closeSearchIfOpen() {
        const searchView = document.getElementById('searchView');
        if (searchView && searchView.style.display === 'flex') {
            switchFromSearchView();
        }
    }

    function initializeSearchFilters() {
        const categories = [...new Set(products.map(p => p.category).filter(Boolean))].sort();
        const sizes = [...new Set(products.flatMap(p => (p.tailles || '').split(',').map(s => s.trim()).filter(Boolean)))].sort();
        const colors = [...new Set(products.flatMap(p => (p.couleurs || '').split(',').map(s => s.trim()).filter(Boolean)))].sort();

        document.getElementById('categoryFilters').innerHTML = categories.map(cat => {
            const count = products.filter(p => p.category === cat).length;
            return `<label class="filter-checkbox"><input type="checkbox" value="${escapeHtml(cat)}" data-filter="category"><span>${escapeHtml(cat)}</span><span class="count">${count}</span></label>`;
        }).join('');
        document.getElementById('sizeFilters').innerHTML = sizes.map(size => {
            const count = products.filter(p => (p.tailles || '').includes(size)).length;
            return `<label class="filter-checkbox"><input type="checkbox" value="${escapeHtml(size)}" data-filter="size"><span>${escapeHtml(size)}</span><span class="count">${count}</span></label>`;
        }).join('');
        document.getElementById('colorFilters').innerHTML = colors.map(color => {
            const count = products.filter(p => (p.couleurs || '').includes(color)).length;
            return `<label class="filter-checkbox"><input type="checkbox" value="${escapeHtml(color)}" data-filter="color"><span>${escapeHtml(color)}</span><span class="count">${count}</span></label>`;
        }).join('');

        attachSearchViewListeners();
    }

    let searchViewListenersAttached = false;
    function attachSearchViewListeners() {
        if (searchViewListenersAttached) return;
        searchViewListenersAttached = true;

        document.getElementById('priceMin').addEventListener('input', debounce(() => {
            searchViewState.filters.priceMin = parseFloat(document.getElementById('priceMin').value) || null;
            performAdvancedSearch();
        }, 500));
        document.getElementById('priceMax').addEventListener('input', debounce(() => {
            searchViewState.filters.priceMax = parseFloat(document.getElementById('priceMax').value) || null;
            performAdvancedSearch();
        }, 500));

        document.querySelectorAll('.price-preset').forEach(btn => {
            btn.addEventListener('click', () => {
                const min = btn.dataset.min;
                const max = btn.dataset.max;
                document.getElementById('priceMin').value = min;
                document.getElementById('priceMax').value = max;
                searchViewState.filters.priceMin = parseFloat(min) || null;
                searchViewState.filters.priceMax = parseFloat(max) || null;
                document.querySelectorAll('.price-preset').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                performAdvancedSearch();
            });
        });

        document.querySelectorAll('[data-filter]').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                const filterType = checkbox.dataset.filter;
                const value = checkbox.value;
                if (filterType === 'category') {
                    if (checkbox.checked) searchViewState.filters.categories.push(value);
                    else searchViewState.filters.categories = searchViewState.filters.categories.filter(c => c !== value);
                } else if (filterType === 'size') {
                    if (checkbox.checked) searchViewState.filters.sizes.push(value);
                    else searchViewState.filters.sizes = searchViewState.filters.sizes.filter(s => s !== value);
                } else if (filterType === 'color') {
                    if (checkbox.checked) searchViewState.filters.colors.push(value);
                    else searchViewState.filters.colors = searchViewState.filters.colors.filter(c => c !== value);
                }
                performAdvancedSearch();
            });
        });

        document.getElementById('sortBy').addEventListener('change', (e) => {
            searchViewState.sortBy = e.target.value;
            performAdvancedSearch();
        });

        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                searchViewState.viewMode = btn.dataset.view;
                const grid = document.getElementById('searchResultsGrid');
                if (searchViewState.viewMode === 'list') grid.classList.add('list-view');
                else grid.classList.remove('list-view');
            });
        });

        document.getElementById('backFromSearchBtn').addEventListener('click', switchFromSearchView);
        document.getElementById('searchViewInput').addEventListener('input', debounce((e) => {
            searchViewState.query = e.target.value;
            document.getElementById('searchViewClear').style.display = e.target.value ? 'block' : 'none';
            performAdvancedSearch();
        }, 300));
        document.getElementById('searchViewClear').addEventListener('click', () => {
            document.getElementById('searchViewInput').value = '';
            searchViewState.query = '';
            document.getElementById('searchViewClear').style.display = 'none';
            performAdvancedSearch();
        });
        document.getElementById('clearAllFilters').addEventListener('click', () => {
            searchViewState.filters = { priceMin: null, priceMax: null, categories: [], sizes: [], colors: [] };
            document.getElementById('priceMin').value = '';
            document.getElementById('priceMax').value = '';
            document.querySelectorAll('[data-filter]').forEach(cb => cb.checked = false);
            document.querySelectorAll('.price-preset').forEach(b => b.classList.remove('active'));
            performAdvancedSearch();
        });
        document.getElementById('resetSearchBtn').addEventListener('click', () => {
            document.getElementById('searchViewInput').value = '';
            searchViewState.query = '';
            document.getElementById('clearAllFilters').click();
        });
        document.getElementById('mobileFilterToggle').addEventListener('click', () => {
            document.getElementById('searchFiltersSidebar').classList.add('active');
            document.getElementById('filtersOverlay').classList.add('active');
        });
        document.getElementById('filtersOverlay').addEventListener('click', () => {
            document.getElementById('searchFiltersSidebar').classList.remove('active');
            document.getElementById('filtersOverlay').classList.remove('active');
        });
    }

    function performAdvancedSearch() {
        let results = [...products];
        if (searchViewState.query.trim()) {
            const scored = results.map(p => ({ product: p, score: calculateSearchScore(searchViewState.query, p) })).filter(item => item.score > 0);
            scored.sort((a, b) => b.score - a.score);
            results = scored.map(item => item.product);
        }
        if (searchViewState.filters.priceMin !== null) results = results.filter(p => p.price >= searchViewState.filters.priceMin);
        if (searchViewState.filters.priceMax !== null) results = results.filter(p => p.price <= searchViewState.filters.priceMax);
        if (searchViewState.filters.categories.length) results = results.filter(p => searchViewState.filters.categories.includes(p.category));
        if (searchViewState.filters.sizes.length) {
            results = results.filter(p => {
                const productSizes = (p.tailles || '').split(',').map(s => s.trim());
                return searchViewState.filters.sizes.some(size => productSizes.includes(size));
            });
        }
        if (searchViewState.filters.colors.length) {
            results = results.filter(p => {
                const productColors = (p.couleurs || '').split(',').map(s => s.trim());
                return searchViewState.filters.colors.some(color => productColors.includes(color));
            });
        }
        results = sortResults(results, searchViewState.sortBy);
        displaySearchResults(results);
    }

    function sortResults(results, sortBy) {
        const sorted = [...results];
        switch (sortBy) {
            case 'price-asc': sorted.sort((a, b) => a.price - b.price); break;
            case 'price-desc': sorted.sort((a, b) => b.price - a.price); break;
            case 'newest': sorted.sort((a, b) => (b.created_at ? new Date(b.created_at).getTime() : 0) - (a.created_at ? new Date(a.created_at).getTime() : 0)); break;
            case 'popular': sorted.sort((a, b) => (b.popularity_score || 0) - (a.popularity_score || 0)); break;
        }
        return sorted;
    }

    // ----- NOUVELLE FONCTION : crée une carte produit identique à celle de l'accueil -----
    function createProductCardElement(p) {
        const isFav = favorites.includes(p.id);
        const img = p.image
            ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" loading="lazy" onload="this.classList.add('loaded')" onerror="this.style.display='none'">`
            : '';
        const tailles = (p.tailles || '').split(',').map(s => s.trim()).filter(Boolean);
        const couleurs = (p.couleurs || '').split(',').map(s => s.trim()).filter(Boolean);
        let details = [];
        if (tailles.length) details.push(`${tailles.length} taille${tailles.length > 1 ? 's' : ''}`);
        if (couleurs.length) details.push(`${couleurs.length} couleur${couleurs.length > 1 ? 's' : ''}`);
        if (details.length) details.push('En stock');
        const detailsHTML = details.length
            ? `<div class="product-card-details">${details.map(d => `<span class="product-card-detail-item">${escapeHtml(d)}</span>`).join('')}</div>`
            : '';

        const card = document.createElement('div');
        card.className = 'product-card';
        card.dataset.productId = p.id;
        card.setAttribute('role', 'listitem');
        card.innerHTML = `
            ${img}
            ${generateBadgesHTML(p, false)}
            <div class="product-card-info">
                <div class="product-card-text">
                    <div class="product-card-name">${escapeHtml(p.name)}</div>
                    <div class="product-card-price">${formatPrice(p.price)}</div>
                    ${detailsHTML}
                </div>
            </div>
            <button class="product-card-add" data-action="add-to-cart" data-id="${p.id}" aria-label="Ajouter au panier">
                <svg viewBox="0 0 24 24"><path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z"/></svg>
            </button>
            <button class="fav-icon" data-action="toggle-favorite" data-id="${p.id}" aria-label="Ajouter aux favoris">
                <svg viewBox="0 0 24 24" class="fav-icon-svg"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
            </button>
        `;
        const svg = card.querySelector('.fav-icon-svg');
        if (svg) svg.style.fill = isFav ? 'var(--favorites)' : 'currentColor';

        if (isAdminLoggedIn) {
            const editBtn = document.createElement('button');
            editBtn.className = 'product-edit-btn';
            editBtn.dataset.action = 'edit-product';
            editBtn.dataset.id = p.id;
            editBtn.textContent = '✏️';
            card.appendChild(editBtn);
        }
        return card;
    }

    function displaySearchResults(results) {
        const grid = document.getElementById('searchResultsGrid');
        const noResults = document.getElementById('searchNoResults');
        const countEl = document.getElementById('searchResultsCount');
        countEl.textContent = `${results.length} résultat${results.length !== 1 ? 's' : ''}`;
        if (results.length === 0) {
            grid.style.display = 'none';
            noResults.style.display = 'block';
            return;
        }
        grid.style.display = 'grid';
        noResults.style.display = 'none';
        grid.innerHTML = '';
        results.forEach(p => {
            const card = createProductCardElement(p);
            if (scrollObserver) scrollObserver.observe(card);
            grid.appendChild(card);
        });
    }

    // Variables globales
    let products = [];
    let cart = JSON.parse(localStorage.getItem('nrj_cart_v32') || '[]');
    let favorites = JSON.parse(localStorage.getItem('nrj_favorites') || '[]');
    let currentFilter = 'all';
    let currentQuickFilter = 'all';
    let searchQuery = '';
    let currentProductId = null;
    let modalOpen = false;
    let displayedCount = 0;
    let currentFilteredProducts = [];
    let observer = null;
    let scrollObserver = null;
    let isAdminLoggedIn = false;

    window.addEventListener('scroll', () => {
        const btn = document.getElementById('scrollToTopBtn');
        if (btn) btn.classList.toggle('visible', window.scrollY > 300);
    }, { passive: true });

    function saveFavorites() { localStorage.setItem('nrj_favorites', JSON.stringify(favorites)); updateNavFavBadge(); }
    async function fetchProducts() {
        try {
            const { data, error } = await supabaseClient.from('products').select('*').order('created_at', { ascending: false });
            if (error) throw error;
            products = data || [];
        } catch (err) {
            console.error('Erreur fetch products:', err);
            products = [];
            showToast('❌ Erreur de connexion.');
            document.getElementById('productsGrid').innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:3rem;"><div style="font-size:3rem;margin-bottom:1rem;">⚠️</div><h3 style="color:var(--text);margin-bottom:0.5rem;">Impossible de charger les produits</h3><button onclick="location.reload()" style="background:var(--primary);color:white;border:none;padding:0.8rem 2rem;border-radius:50px;font-weight:700;cursor:pointer;">🔄 Réessayer</button></div>';
        }
    }
    async function insertProduct(p) { const { data, error } = await supabaseClient.from('products').insert([p]).select(); if (error) throw error; return data; }
    async function deleteProductFromSupabase(id) { const { error } = await supabaseClient.from('products').delete().eq('id', id); if (error) throw error; }

    function getFilteredProducts() {
        let filtered = currentFilter === 'favorites' ? products.filter(p => favorites.includes(p.id)) : (currentFilter === 'all' ? products : products.filter(p => p.category === currentFilter));
        if (currentQuickFilter === 'new') filtered = filtered.filter(p => isNewProduct(p));
        else if (currentQuickFilter === 'bestseller') filtered = filtered.filter(p => (p.popularity_score || 0) > 0).sort((a, b) => (b.popularity_score || 0) - (a.popularity_score || 0));
        if (searchQuery && !(/^\d+$/.test(searchQuery) && products.some(p => p.id === parseInt(searchQuery)))) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(p => p.name.toLowerCase().includes(q) || (p.category && p.category.toLowerCase().includes(q)));
        }
        return filtered;
    }

    function renderInitialProducts() {
        currentFilteredProducts = getFilteredProducts();
        displayedCount = 0;
        const grid = document.getElementById('productsGrid');
        grid.innerHTML = '';
        if (currentFilteredProducts.length === 0) {
            grid.innerHTML = '<div style="color:#666;text-align:center;padding:3rem;grid-column:1/-1;">Aucun produit trouvé</div>';
            document.getElementById('loadMoreSentinel').style.display = 'none';
            document.getElementById('loadingMessage').style.display = 'none';
            return;
        }
        appendProducts(0, PRODUCTS_PER_PAGE);
        updateSentinelVisibility();
    }

    function setupScrollObserver() {
        if (scrollObserver) scrollObserver.disconnect();
        scrollObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('visible'); scrollObserver.unobserve(entry.target); } });
        }, { rootMargin: '50px' });
    }

    function appendProducts(start, count) {
        if (!scrollObserver) setupScrollObserver();
        const grid = document.getElementById('productsGrid');
        const fragment = document.createDocumentFragment();
        const slice = currentFilteredProducts.slice(start, start + count);
        slice.forEach(p => {
            const card = createProductCardElement(p);
            fragment.appendChild(card);
            scrollObserver.observe(card);
        });
        grid.appendChild(fragment);
        displayedCount += slice.length;
        document.getElementById('loadingMessage').style.display = 'none';
        updateSentinelVisibility();
    }

    function loadMoreProducts() {
        if (displayedCount >= currentFilteredProducts.length) return;
        document.getElementById('loadingMessage').style.display = 'block';
        setTimeout(() => appendProducts(displayedCount, PRODUCTS_PER_PAGE), 100);
    }

    function updateSentinelVisibility() {
        const s = document.getElementById('loadMoreSentinel');
        s.style.display = displayedCount >= currentFilteredProducts.length ? 'none' : 'block';
    }

    function setupObserver() {
        if (observer) observer.disconnect();
        const s = document.getElementById('loadMoreSentinel');
        if (!s) return;
        observer = new IntersectionObserver((entries) => { entries.forEach(e => { if (e.isIntersecting && displayedCount < currentFilteredProducts.length) loadMoreProducts(); }); }, { rootMargin: '200px' });
        observer.observe(s);
    }

    function refreshCatalogue() { renderInitialProducts(); setupObserver(); }

    function applyFilter(category) {
        currentFilter = category;
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        const btn = document.querySelector(`.filter-btn[data-category="${category}"]`);
        if (btn) btn.classList.add('active');
        closeSearchIfOpen();
        refreshCatalogue();
    }

    document.querySelectorAll('.filter-chip').forEach(chip => {
        chip.addEventListener('click', function() {
            document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            currentQuickFilter = this.dataset.filter;
            closeSearchIfOpen();
            refreshCatalogue();
        });
    });

    const searchInput = document.getElementById('searchInput');
    const searchClear = document.getElementById('searchClear');

    searchInput.addEventListener('input', function(e) {
        const v = e.target.value.trim();
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => { showSearchDropdown(v); }, 300);
        clearTimeout(searchTimeout);
        if (v && /^\d+$/.test(v) && products.some(p => p.id === parseInt(v))) {
            searchTimeout = setTimeout(() => { openProductModal(parseInt(v)); e.target.value = ''; searchQuery = ''; hideSearchDropdown(); refreshCatalogue(); }, 600);
            return;
        }
        searchQuery = v;
        refreshCatalogue();
    });

    searchInput.addEventListener('focus', function() { showSearchDropdown(this.value.trim()); });
    searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            const v = this.value.trim();
            if (v) {
                hideSearchDropdown();
                switchToSearchView(v);
            }
        } else if (e.key === 'Escape') { hideSearchDropdown(); this.blur(); }
    });

    searchClear.addEventListener('click', function() {
        searchInput.value = '';
        searchQuery = '';
        hideSearchDropdown();
        refreshCatalogue();
        searchInput.focus();
    });

    document.addEventListener('click', function(e) {
        const dropdown = document.getElementById('searchDropdown');
        const searchBar = document.querySelector('.search-bar');
        if (!searchBar.contains(e.target) && !dropdown.contains(e.target)) hideSearchDropdown();
    });

    // Gestion centralisée des clics (délégation)
    document.addEventListener('click', e => {
        const fb = e.target.closest('.filter-btn'); if (fb) { applyFilter(fb.dataset.category); return; }
        const addBtn = e.target.closest('[data-action="add-to-cart"]'); if (addBtn) { e.stopPropagation(); addToCart(parseInt(addBtn.dataset.id)); return; }
        const favBtn = e.target.closest('[data-action="toggle-favorite"]'); if (favBtn) { e.stopPropagation(); toggleFavorite(parseInt(favBtn.dataset.id)); return; }
        const editBtn = e.target.closest('[data-action="edit-product"]'); if (editBtn) { e.stopPropagation(); openEditModal(parseInt(editBtn.dataset.id)); return; }
        const removeBtn = e.target.closest('[data-action="cart-remove"]'); if (removeBtn) { e.stopPropagation(); removeCartItem(parseInt(removeBtn.dataset.index)); return; }
        const incBtn = e.target.closest('[data-action="cart-increase"]'); if (incBtn) { changeQty(parseInt(incBtn.dataset.index), 1); return; }
        const decBtn = e.target.closest('[data-action="cart-decrease"]'); if (decBtn) { changeQty(parseInt(decBtn.dataset.index), -1); return; }
        const recCard = e.target.closest('.rec-card'); if (recCard) { closeSearchIfOpen(); openProductModal(parseInt(recCard.dataset.productId)); return; }
        const card = e.target.closest('.product-card');
        if (card && !e.target.closest('.product-card-add') && !e.target.closest('.fav-icon')) { closeSearchIfOpen(); openProductModal(parseInt(card.dataset.productId)); }
    });

    async function addToCart(pid, t = '', c = '') {
        const p = products.find(pr => pr.id === pid); if (!p) return;
        const moq = Number(p.moq) || 1;
        const exist = cart.find(i => i.productId === pid && i.taille === t && i.couleur === c);
        if (exist) exist.quantity = Number(exist.quantity) + moq;
        else cart.push({ productId: pid, quantity: moq, taille: t, couleur: c, moq });
        trackPopularity(pid, 5);
        saveCart(); refreshCartDisplay(); showToast('🛒 Ajouté au panier');
    }
    function changeQty(idx, d) { const it = cart[idx]; if (!it) return; const moq = Number(it.moq) || 1; it.quantity = Math.max(moq, Number(it.quantity) + d); saveCart(); refreshCartDisplay(); }
    function removeCartItem(idx) { cart.splice(idx, 1); saveCart(); refreshCartDisplay(); }
    function saveCart() { localStorage.setItem('nrj_cart_v32', JSON.stringify(cart)); }

    function updateNavCartBadge() {
        const cnt = cart.reduce((s, i) => s + Number(i.quantity), 0);
        const b = document.getElementById('navCartBadge');
        if (b) { b.textContent = cnt > 99 ? '99+' : cnt; b.style.display = cnt > 0 ? 'flex' : 'none'; }
    }
    function updateNavFavBadge() {
        const cnt = favorites.length;
        const b = document.getElementById('navFavBadge');
        if (b) { b.textContent = cnt > 99 ? '99+' : cnt; b.style.display = cnt > 0 ? 'flex' : 'none'; }
    }
    function refreshCartDisplay() {
        const tot = cart.reduce((s, i) => { const p = products.find(pr => pr.id === i.productId); return s + (p ? p.price * Number(i.quantity) : 0); }, 0);
        document.getElementById('cartTotal').textContent = formatPrice(tot);
        document.getElementById('checkoutBtn').disabled = cart.length === 0;
        const ctr = document.getElementById('cartItems');
        if (!cart.length) { ctr.innerHTML = '<div class="cart-empty">Panier vide</div>'; updateNavCartBadge(); return; }
        ctr.innerHTML = cart.map((it, idx) => {
            const p = products.find(pr => pr.id === it.productId); if (!p) return '';
            const img = p.image ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}">` : '📦';
            let vars = []; if (it.couleur) vars.push(`Couleur: ${it.couleur}`); if (it.taille) vars.push(`Taille: ${it.taille}`);
            const dis = Number(it.quantity) <= (Number(it.moq) || 1);
            return `<div class="cart-item"><div class="cart-item-img">${img}</div><div class="cart-item-info"><h4>${escapeHtml(p.name)}</h4>${vars.length ? `<div class="cart-item-variants">${escapeHtml(vars.join(', '))}</div>` : ''}<span class="cart-item-price">${formatPrice(p.price)}</span><div class="cart-item-qty"><button class="qty-btn" data-action="cart-decrease" data-index="${idx}" ${dis ? 'disabled' : ''}>−</button><span>${Number(it.quantity)}</span><button class="qty-btn" data-action="cart-increase" data-index="${idx}">+</button></div></div><button class="remove-item-btn" data-action="cart-remove" data-index="${idx}">🗑️</button></div>`;
        }).join('');
        updateNavCartBadge();
    }

    function openOrderModal() {
        if (!cart.length) return;
        let tot = 0;
        const items = cart.map(i => { const p = products.find(pr => pr.id === i.productId); if (!p) return ''; tot += p.price * Number(i.quantity); return `• ${escapeHtml(p.name)} [ID: ${p.id}] x${Number(i.quantity)}`; }).filter(Boolean).join('<br>');
        document.getElementById('orderSummary').innerHTML = `${items}<br><br><strong>Total : ${formatPrice(tot)}</strong>`;
        document.getElementById('customerName').value = localStorage.getItem('nrj_customer_name') || '';
        document.getElementById('orderModalOverlay').classList.add('open');
        document.getElementById('cartPanel').classList.remove('open');
        document.getElementById('cartOverlay').classList.remove('open');
    }

    function sendWhatsAppOrder() {
        const name = document.getElementById('customerName').value.trim(); if (!name) return alert('Entre ton nom');
        localStorage.setItem('nrj_customer_name', name);
        let msg = `Bonjour NRJ Marketplace International, je suis ${name}. Ma commande :\n`, tot = 0;
        cart.forEach(i => { const p = products.find(pr => pr.id === i.productId); if (p) { let d = `${p.name} [ID: ${p.id}]`; if (i.couleur || i.taille) d += ` (${[i.couleur, i.taille].filter(Boolean).join(', ')})`; msg += `- ${d} x${Number(i.quantity)} = ${formatPrice(p.price * Number(i.quantity))}\n  🔗 ${BASE_URL}?id=${p.id}\n`; tot += p.price * Number(i.quantity); } });
        msg += `\nTotal : ${formatPrice(tot)}\nMerci !`;
        window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');
        cart = []; saveCart(); refreshCartDisplay();
        document.getElementById('orderModalOverlay').classList.remove('open');
        showToast('📤 Commande envoyée');
    }

    function toggleFavorite(pid) {
        const idx = favorites.indexOf(pid);
        if (idx > -1) favorites.splice(idx, 1); else favorites.push(pid);
        saveFavorites();
        document.querySelectorAll(`.fav-icon[data-id="${pid}"]`).forEach(icon => { const svg = icon.querySelector('.fav-icon-svg'); if (svg) svg.style.fill = favorites.includes(pid) ? 'var(--favorites)' : 'currentColor'; });
        if (document.getElementById('modalFavBtn') && currentProductId === pid) { const svg = document.getElementById('modalFavBtn').querySelector('.fav-icon-svg'); if (svg) svg.style.fill = favorites.includes(pid) ? 'var(--favorites)' : 'currentColor'; }
        if (currentFilter === 'favorites') refreshCatalogue();
    }

    function updateCarouselDots(sc, dc, index) { dc.querySelectorAll('.carousel-dot').forEach((d, i) => d.classList.toggle('active', i === index)); }

    function openProductModal(pid) {
        closeSearchIfOpen();
        const p = products.find(pr => pr.id === pid); if (!p) return;
        currentProductId = pid;
        trackPopularity(pid, 1);
        trackViewedItem(p.name);
        const tailles = (p.tailles || '').split(',').map(s => s.trim()).filter(Boolean);
        const couleurs = (p.couleurs || '').split(',').map(s => s.trim()).filter(Boolean);
        let sT = tailles.length ? tailles[0] : '', sC = couleurs.length ? couleurs[0] : '';
        const moq = Number(p.moq) || 1, uPrice = Number(p.price);
        document.getElementById('modalPrice').textContent = formatPrice(uPrice);
        document.getElementById('modalMoq').textContent = `Minimum d'achat : ${moq} pièce(s)`;
        document.getElementById('modalTotal').textContent = `Total minimum : ${formatPrice(uPrice * moq)}`;
        document.getElementById('modalDesc').textContent = p.description || '';
        document.getElementById('modalProductIdBadge').textContent = `[ID: ${p.id}]`;
        document.getElementById('modalBadges').innerHTML = generateBadgesHTML(p, true);
        const favSvg = document.getElementById('modalFavBtn').querySelector('.fav-icon-svg');
        if (favSvg) favSvg.style.fill = favorites.includes(p.id) ? 'var(--favorites)' : 'currentColor';
        document.getElementById('modalFavBtn').onclick = () => toggleFavorite(p.id);
        document.getElementById('modalShareBtn').onclick = () => {
            const url = BASE_URL + '?id=' + p.id;
            const txt = `${formatPrice(uPrice)}\nMinimum d'achat : ${moq} pièce(s)\nDécouvre "${p.name}" sur NRJ Marketplace ${url}`;
            navigator.share ? navigator.share({ title: p.name, text: txt, url }).catch(() => {}) : navigator.clipboard.writeText(txt).then(() => showToast('🔗 Copié !'));
        };
        const imgs = [p.image, p.image2, p.image3, p.image4, p.image5, p.image6].filter(u => u && u.trim());
        const sc = document.getElementById('modalCarouselScroll'), dc = document.getElementById('modalCarouselDots');
        sc.innerHTML = ''; dc.innerHTML = '';
        if (!imgs.length) { sc.innerHTML = '<div class="carousel-slide"><div class="carousel-emoji-slide">📦</div></div>'; dc.innerHTML = '<button class="carousel-dot active"></button>'; }
        else { imgs.forEach((u, i) => { sc.innerHTML += `<div class="carousel-slide"><img src="${escapeHtml(u)}" onload="this.classList.add('loaded')" onerror="this.style.display='none'"></div>`; dc.innerHTML += `<button class="carousel-dot${i === 0 ? ' active' : ''}" data-index="${i}"></button>`; }); }
        if (!sc.dataset.bound) { sc.addEventListener('scroll', () => updateCarouselDots(sc, dc, Math.round(sc.scrollLeft / sc.offsetWidth))); sc.dataset.bound = '1'; }
        if (!dc.dataset.bound) { dc.addEventListener('click', e => { if (e.target.classList.contains('carousel-dot')) sc.scrollTo({ left: sc.offsetWidth * parseInt(e.target.dataset.index), behavior: 'smooth' }); }); dc.dataset.bound = '1'; }
        function renderOptions(ct, opts, sel, ty) {
            ct.innerHTML = '';
            opts.forEach(o => { const b = document.createElement('button'); b.className = 'option-btn' + (o === sel ? ' selected' : ''); b.textContent = o; b.onclick = () => { ct.querySelectorAll('.option-btn').forEach(x => x.classList.remove('selected')); b.classList.add('selected'); if (ty === 'taille') sT = o; else sC = o; }; ct.appendChild(b); });
        }
        document.getElementById('modalTailleGroup').style.display = tailles.length ? 'block' : 'none';
        if (tailles.length) renderOptions(document.getElementById('modalTailleOptions'), tailles, sT, 'taille');
        document.getElementById('modalCouleurGroup').style.display = couleurs.length ? 'block' : 'none';
        if (couleurs.length) renderOptions(document.getElementById('modalCouleurOptions'), couleurs, sC, 'couleur');
        document.getElementById('addToCartStickyBtn').onclick = () => addToCart(p.id, sT, sC);
        document.getElementById('directOrderStickyBtn').onclick = () => {
            if (tailles.length && !sT) return showToast('⚠️ Sélectionnez une taille');
            trackPopularity(p.id, 10);
            window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(`Bonjour NRJ Marketplace, je souhaite commander : ${p.name} (ID: ${p.id}), Taille: ${sT || 'N/A'}, Quantité: ${moq}. Lien : ${BASE_URL}?id=${p.id}`)}`, '_blank');
        };
        let rec = products.filter(pr => pr.category === p.category && pr.id !== p.id);
        if (rec.length < 6) rec = [...rec, ...products.filter(pr => pr.id !== p.id && !rec.includes(pr))].slice(0, 6);
        document.getElementById('modalRecCarousel').innerHTML = rec.map(r => `<div class="rec-card" data-product-id="${r.id}"><img src="${escapeHtml(r.image || '')}" onload="this.classList.add('loaded')" onerror="this.style.display='none'"><div class="rec-card-overlay"><div><div class="rec-card-name">${escapeHtml(r.name)}</div><div class="rec-card-price">${formatPrice(r.price)}</div></div></div></div>`).join('');
        document.getElementById('productModal').style.zIndex = '600';
        document.getElementById('productModal').classList.add('open');
        document.getElementById('stickyBottomBar').classList.add('visible');
        if (!modalOpen) { history.pushState({ modalOpen: true }, '', `?id=${p.id}`); modalOpen = true; }
    }

    function closeProductModal() {
        document.getElementById('productModal').classList.remove('open');
        document.getElementById('stickyBottomBar').classList.remove('visible');
        document.getElementById('productModal').style.zIndex = '';
        modalOpen = false;
    }

    document.getElementById('modalCloseBtn').addEventListener('click', () => { if (modalOpen) history.back(); });
    window.addEventListener('popstate', (e) => {
        if (e.state && e.state.search) {
            switchToSearchView(searchViewState.query);
        } else if (modalOpen) {
            closeProductModal();
        }
    });

    document.getElementById('modalSourcingBtn').addEventListener('click', () => window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("Bonjour NRJ Marketplace, je recherche un produit. Je vous envoie une photo juste après 📸")}`, '_blank'));
    document.getElementById('modalDescSourcingBtn').addEventListener('click', () => window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("Bonjour NRJ Marketplace International, je recherche un produit spécifique...")}`, '_blank'));

    async function handleAdminLogin() {
        try {
            const { error } = await supabaseClient.auth.signInWithPassword({ email: document.getElementById('adminEmail').value.trim(), password: document.getElementById('adminPassword').value });
            if (error) throw error;
            isAdminLoggedIn = true;
            document.getElementById('adminPanel').classList.add('active');
            document.getElementById('adminModalOverlay').classList.remove('open');
            document.getElementById('logoutBtn').classList.add('visible');
            renderAdminList();
            renderAdminListDedicated();
            refreshCatalogue();
            showToast('🔓 Connecté');
        } catch (err) { document.getElementById('adminError').textContent = err.message; }
    }

    async function handleLogout() {
        await supabaseClient.auth.signOut();
        isAdminLoggedIn = false;
        document.getElementById('adminPanel').classList.remove('active');
        document.getElementById('logoutBtn').classList.remove('visible');
        refreshCatalogue();
        showToast('👋 Déconnecté');
    }

    document.getElementById('adminLoginBtn').addEventListener('click', handleAdminLogin);
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    document.getElementById('cancelAdminBtn').addEventListener('click', () => document.getElementById('adminModalOverlay').classList.remove('open'));

    async function addProduct() {
        const name = document.getElementById('adminName').value.trim(), category = document.getElementById('adminCategory').value.trim(), price = parseInt(document.getElementById('adminPrice').value);
        if (!name || !category || isNaN(price)) return alert('Remplis nom, catégorie et prix.');
        try {
            await insertProduct({ name, price, category: removeEmojis(category), image: document.getElementById('adminImage').value.trim(), image2: document.getElementById('adminImage2').value.trim(), image3: document.getElementById('adminImage3').value.trim(), image4: document.getElementById('adminImage4').value.trim(), image5: document.getElementById('adminImage5').value.trim(), image6: document.getElementById('adminImage6').value.trim(), tailles: document.getElementById('adminTailles').value.trim(), couleurs: document.getElementById('adminCouleurs').value.trim(), moq: parseInt(document.getElementById('adminMoq').value) || 1, description: document.getElementById('adminDesc').value.trim(), popularity_score: 0 });
            alert('✅ Produit ajouté !');
            ['adminName','adminCategory','adminPrice','adminImage','adminImage2','adminImage3','adminImage4','adminImage5','adminImage6','adminTailles','adminCouleurs','adminMoq','adminDesc'].forEach(id => document.getElementById(id).value = '');
            document.getElementById('adminMoq').value = '1';
            await fetchProducts(); refreshCatalogue(); renderAdminList();
        } catch (err) { alert('❌ Erreur : ' + err.message); }
    }

    async function deleteProduct(id) { if (!confirm('Supprimer ?')) return; await deleteProductFromSupabase(id); await fetchProducts(); cart = cart.filter(i => products.some(p => p.id === i.productId)); saveCart(); refreshCatalogue(); renderAdminList(); renderAdminListDedicated(); refreshCartDisplay(); }

    function renderAdminList() {
        const list = document.getElementById('adminProductsList');
        if (!list) return;
        list.innerHTML = products.map(p => `<li><span>${escapeHtml(p.name)} [ID: ${p.id}]</span><button class="btn-sm" data-action="admin-remove" data-id="${p.id}">🗑️</button></li>`).join('');
    }

    async function addProductDedicated() {
        const name = document.getElementById('adminNameDedicated')?.value.trim();
        const category = document.getElementById('adminCategoryDedicated')?.value.trim();
        const price = parseInt(document.getElementById('adminPriceDedicated')?.value);
        if (!name || !category || isNaN(price)) return alert('Remplis nom, catégorie et prix.');
        try {
            await insertProduct({ name, price, category: removeEmojis(category), image: document.getElementById('adminImageDedicated')?.value.trim() || '', image2: document.getElementById('adminImage2Dedicated')?.value.trim() || '', image3: document.getElementById('adminImage3Dedicated')?.value.trim() || '', image4: document.getElementById('adminImage4Dedicated')?.value.trim() || '', image5: document.getElementById('adminImage5Dedicated')?.value.trim() || '', image6: document.getElementById('adminImage6Dedicated')?.value.trim() || '', tailles: document.getElementById('adminTaillesDedicated')?.value.trim() || '', couleurs: document.getElementById('adminCouleursDedicated')?.value.trim() || '', moq: parseInt(document.getElementById('adminMoqDedicated')?.value) || 1, description: document.getElementById('adminDescDedicated')?.value.trim() || '', popularity_score: 0 });
            showToast('✅ Produit ajouté !');
            ['adminNameDedicated','adminCategoryDedicated','adminPriceDedicated','adminImageDedicated','adminImage2Dedicated','adminImage3Dedicated','adminImage4Dedicated','adminImage5Dedicated','adminImage6Dedicated','adminTaillesDedicated','adminCouleursDedicated','adminDescDedicated'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
            const moqEl = document.getElementById('adminMoqDedicated'); if (moqEl) moqEl.value = '1';
            await fetchProducts();
            renderAdminList();
            renderAdminListDedicated();
        } catch (err) { alert('❌ Erreur : ' + err.message); }
    }

    function renderAdminListDedicated() {
        const list = document.getElementById('adminProductsListDedicated');
        if (!list) return;
        list.innerHTML = products.map(p => `<li><span>${escapeHtml(p.name)} [ID: ${p.id}]</span><button class="btn-sm" data-action="admin-remove-dedicated" data-id="${p.id}">🗑️</button></li>`).join('');
    }

    document.addEventListener('click', e => {
        if (e.target.matches('[data-action="admin-remove"]')) deleteProduct(parseInt(e.target.dataset.id));
        if (e.target.matches('[data-action="admin-remove-dedicated"]')) deleteProduct(parseInt(e.target.dataset.id));
    });

    document.getElementById('addProductBtn').addEventListener('click', addProduct);
    document.getElementById('addProductBtnDedicated').addEventListener('click', addProductDedicated);

    function openEditModal(productId) {
        const p = products.find(pr => pr.id === productId);
        if (!p) return;
        document.getElementById('editProductId').value = p.id;
        document.getElementById('editName').value = p.name || '';
        document.getElementById('editCategory').value = p.category || '';
        document.getElementById('editPrice').value = p.price || '';
        document.getElementById('editImage').value = p.image || '';
        document.getElementById('editImage2').value = p.image2 || '';
        document.getElementById('editImage3').value = p.image3 || '';
        document.getElementById('editImage4').value = p.image4 || '';
        document.getElementById('editImage5').value = p.image5 || '';
        document.getElementById('editImage6').value = p.image6 || '';
        document.getElementById('editTailles').value = p.tailles || '';
        document.getElementById('editCouleurs').value = p.couleurs || '';
        document.getElementById('editMoq').value = p.moq || 1;
        document.getElementById('editDesc').value = p.description || '';
        document.getElementById('editError').textContent = '';
        document.getElementById('editProductModalOverlay').classList.add('open');
    }

    async function updateProduct() {
        const id = parseInt(document.getElementById('editProductId').value);
        const name = document.getElementById('editName').value.trim();
        const category = document.getElementById('editCategory').value.trim();
        const price = parseInt(document.getElementById('editPrice').value);
        if (!name || !category || isNaN(price)) {
            document.getElementById('editError').textContent = 'Remplis nom, catégorie et prix.';
            return;
        }
        const updates = {
            name, price, category: removeEmojis(category),
            image: document.getElementById('editImage').value.trim(),
            image2: document.getElementById('editImage2').value.trim(),
            image3: document.getElementById('editImage3').value.trim(),
            image4: document.getElementById('editImage4').value.trim(),
            image5: document.getElementById('editImage5').value.trim(),
            image6: document.getElementById('editImage6').value.trim(),
            tailles: document.getElementById('editTailles').value.trim(),
            couleurs: document.getElementById('editCouleurs').value.trim(),
            moq: parseInt(document.getElementById('editMoq').value) || 1,
            description: document.getElementById('editDesc').value.trim()
        };
        try {
            const { error } = await supabaseClient.from('products').update(updates).eq('id', id);
            if (error) throw error;
            showToast('✅ Produit mis à jour');
            document.getElementById('editProductModalOverlay').classList.remove('open');
            await fetchProducts();
            refreshCatalogue();
            renderAdminList();
            renderAdminListDedicated();
        } catch (err) {
            document.getElementById('editError').textContent = 'Erreur : ' + err.message;
        }
    }

    document.getElementById('saveEditBtn').addEventListener('click', updateProduct);
    document.getElementById('cancelEditBtn').addEventListener('click', () => {
        document.getElementById('editProductModalOverlay').classList.remove('open');
    });

    function switchView(v) {
        const cv = document.getElementById('categoriesView'), hv = document.getElementById('catalogueView');
        if (v === 'categories') { closeSearchIfOpen(); renderCategories(); cv.style.display = 'block'; hv.style.display = 'none'; }
        else { cv.style.display = 'none'; hv.style.display = 'block'; }
    }

    function renderCategories() {
        const grid = document.getElementById('categoriesGrid'); if (!grid) return;
        const cats = [...new Set(products.map(p => p.category).filter(Boolean))];
        if (!cats.length) { grid.innerHTML = '<p style="text-align:center;color:var(--text-secondary);">Aucune catégorie disponible.</p>'; return; }
        grid.innerHTML = cats.map(cat => {
            const lp = [...products].reverse().find(p => p.category === cat && p.image);
            return `<div class="category-card" data-category="${escapeHtml(cat)}">${lp ? `<img src="${escapeHtml(lp.image)}" class="category-card-bg" alt="${escapeHtml(cat)}" loading="lazy" onload="this.classList.add('loaded')">` : ''}<div class="category-card-overlay"></div><div class="category-card-content"><div class="category-name">${escapeHtml(cat)}</div><div class="category-count">${products.filter(p => p.category === cat).length} article${products.filter(p => p.category === cat).length > 1 ? 's' : ''}</div></div></div>`;
        }).join('');
        grid.querySelectorAll('.category-card').forEach(card => card.addEventListener('click', () => { trackViewedItem(card.dataset.category); applyFilter(card.dataset.category); switchView('home'); }));
    }

    document.getElementById('backToHomeBtn').addEventListener('click', () => switchView('home'));

    function initAdminDedicatedView() {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('admin') === 'true') {
            document.body.classList.add('admin-mode');
        }
        const backBtn = document.getElementById('backToCatalogueBtn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                document.body.classList.remove('admin-mode');
                window.history.replaceState({}, '', window.location.pathname);
            });
        }
    }

    document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', function() {
        document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        const nav = this.dataset.nav;
        if (nav === 'home') {
            closeSearchIfOpen();
            if (modalOpen) history.back();
            switchView('home');
            currentFilter = 'all';
            currentQuickFilter = 'all';
            searchQuery = '';
            const inp = document.getElementById('searchInput');
            if (inp) { inp.value = ''; inp.placeholder = rotationList[0]; }
            document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            document.querySelector('.filter-chip[data-filter="all"]')?.classList.add('active');
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            document.querySelector('.filter-btn[data-category="all"]')?.classList.add('active');
            refreshCatalogue();
            hideSearchDropdown();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        if (nav === 'categories') { closeSearchIfOpen(); switchView('categories'); window.scrollTo(0, 0); }
        if (nav === 'cart') { closeSearchIfOpen(); document.getElementById('cartPanel').classList.add('open'); document.getElementById('cartOverlay').classList.add('open'); refreshCartDisplay(); }
        if (nav === 'favorites') { closeSearchIfOpen(); switchView('home'); currentFilter = 'favorites'; refreshCatalogue(); window.scrollTo(0, 0); }
        if (nav === 'profile') {
            closeSearchIfOpen();
            if (isAdminLoggedIn) {
                window.location.href = window.location.pathname + '?admin=true';
            } else {
                document.getElementById('adminModalOverlay').classList.add('open');
            }
        }
    }));

    async function init() {
        await fetchProducts();
        const cats = [...new Set(products.map(p => removeEmojis(p.category)))];
        let html = `<button class="filter-btn active" data-category="all">Tout voir <span class="filter-count">(${products.length})</span></button>`;
        cats.forEach(c => html += `<button class="filter-btn" data-category="${escapeHtml(c)}">${escapeHtml(c)} <span class="filter-count">(${products.filter(p => p.category === c).length})</span></button>`);
        document.getElementById('filterBar').innerHTML = html;

        initPlaceholderRotation();
        initVoiceSearch();
        initAdminDedicatedView();
        renderAdminList();
        renderAdminListDedicated();
        refreshCatalogue();
        refreshCartDisplay();
        updateNavFavBadge();

        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session) {
            isAdminLoggedIn = true;
            document.getElementById('adminPanel').classList.add('active');
            document.getElementById('logoutBtn').classList.add('visible');
            renderAdminList();
            renderAdminListDedicated();
            refreshCatalogue();
        }

        const urlParams = new URLSearchParams(window.location.search);
        const searchParam = urlParams.get('search');
        const idParam = urlParams.get('id');
        if (searchParam) {
            switchToSearchView(searchParam);
        } else if (idParam) {
            const p = products.find(pr => pr.id === parseInt(idParam));
            if (p) openProductModal(parseInt(idParam));
        }
    }

    init();
})();
