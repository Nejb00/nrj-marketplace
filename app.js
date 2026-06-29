(function() {
    const SUPABASE_URL = 'https://peojyqliwrtghomyukwn.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_Fy-Q_BAginf2p6UdUtxDMA_V1hP8Slt';
    const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const BASE_URL = 'https://nejb00.github.io/nrj-marketplace/';
    const WHATSAPP_NUMBER = '242066271882';
    const PRODUCTS_PER_PAGE = 20;

    function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
    function formatPrice(a) { return 'XAF ' + a.toLocaleString('fr-FR'); }
    function removeEmojis(s) { return s.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2300}-\u{23FF}\u{2B50}\u{2B55}\u{2934}\u{2935}\u{25AA}\u{25AB}\u{25FE}\u{25FD}\u{25FB}\u{25FC}\u{25B6}\u{25C0}\u{3030}\u{303D}\u{3297}\u{3299}\u{FE0F}\u{200D}]/gu, '').trim(); }

    let products = [];
    let cart = JSON.parse(localStorage.getItem('nrj_cart_v32') || '[]');
    let favorites = JSON.parse(localStorage.getItem('nrj_favorites') || '[]');
    let currentFilter = 'all';
    let searchQuery = '';
    let searchTimeout = null;
    let currentProductId = null;
    let modalOpen = false;
    let displayedCount = 0;
    let currentFilteredProducts = [];
    let observer = null;

    function saveFavorites() { localStorage.setItem('nrj_favorites', JSON.stringify(favorites)); }
    async function fetchProducts() {
        const { data, error } = await supabaseClient.from('products').select('*').order('id', { ascending: true });
        if (error) { products = []; } else { products = data; }
    }
    async function insertProduct(p) {
        const { data, error } = await supabaseClient.from('products').insert([p]).select();
        if (error) throw error;
        return data;
    }
    async function deleteProductFromSupabase(id) {
        const { error } = await supabaseClient.from('products').delete().eq('id', id);
        if (error) throw error;
    }

    function getFilteredProducts() {
        let filtered = currentFilter === 'favorites'
            ? products.filter(p => favorites.includes(p.id))
            : (currentFilter === 'all' ? products : products.filter(p => p.category === currentFilter));
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
            grid.innerHTML = '<div class="empty-fav" style="color:#666;text-align:center;padding:3rem;">Aucun produit trouvé</div>';
            document.getElementById('loadMoreSentinel').style.display = 'none';
            document.getElementById('loadingMessage').style.display = 'none';
            return;
        }
        appendProducts(0, PRODUCTS_PER_PAGE);
        updateSentinelVisibility();
    }

    function appendProducts(start, count) {
        const grid = document.getElementById('productsGrid');
        const slice = currentFilteredProducts.slice(start, start + count);
        slice.forEach(p => {
            const firstImage = p.image || '';
            const imgContent = firstImage ? `<img src="${escapeHtml(firstImage)}" alt="" loading="lazy" onerror="this.style.display='none';">` : '';
            const isFav = favorites.includes(p.id);
            const card = document.createElement('div');
            card.className = 'product-card';
            card.dataset.productId = p.id;
            card.innerHTML = `
                ${imgContent}
                <div class="product-card-info">
                    <div class="product-card-text">
                        <div class="product-card-name">${escapeHtml(p.name)}</div>
                        <div class="product-card-price">${formatPrice(p.price)}</div>
                    </div>
                </div>
                <button class="product-card-add" data-action="add-to-cart" data-id="${p.id}">+</button>
                <button class="fav-icon" data-action="toggle-favorite" data-id="${p.id}">${isFav ? '❤️' : '🤍'}</button>
            `;
            grid.appendChild(card);
        });
        displayedCount += slice.length;
        document.getElementById('loadingMessage').style.display = 'none';
        updateSentinelVisibility();
    }

    function loadMoreProducts() {
        if (displayedCount >= currentFilteredProducts.length) return;
        document.getElementById('loadingMessage').style.display = 'block';
        setTimeout(() => { appendProducts(displayedCount, PRODUCTS_PER_PAGE); }, 100);
    }

    function updateSentinelVisibility() {
        const sentinel = document.getElementById('loadMoreSentinel');
        sentinel.style.display = displayedCount >= currentFilteredProducts.length ? 'none' : 'block';
    }

    function setupObserver() {
        if (observer) observer.disconnect();
        const sentinel = document.getElementById('loadMoreSentinel');
        if (!sentinel) return;
        observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && displayedCount < currentFilteredProducts.length) loadMoreProducts();
            });
        }, { rootMargin: '200px' });
        observer.observe(sentinel);
    }

    function refreshCatalogue() {
        renderInitialProducts();
        setupObserver();
    }

    function applyFilter(category) {
        currentFilter = category;
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        const activeBtn = document.querySelector(`.filter-btn[data-category="${category}"]`);
        if (activeBtn) activeBtn.classList.add('active');
        refreshCatalogue();
    }

    document.getElementById('searchInput').addEventListener('input', function(e) {
        const v = e.target.value.trim();
        searchQuery = v;
        clearTimeout(searchTimeout);
        if (v && /^\d+$/.test(v) && products.some(p => p.id === parseInt(v))) {
            searchTimeout = setTimeout(() => {
                const id = parseInt(v);
                openProductModal(id);
                e.target.value = '';
                searchQuery = '';
                refreshCatalogue();
            }, 600);
            return;
        }
        refreshCatalogue();
    });

    // Gestion des clics (correction avec closest)
    document.addEventListener('click', e => {
        const fb = e.target.closest('.filter-btn');
        if (fb) {
            applyFilter(fb.dataset.category);
            return;
        }

        const addBtn = e.target.closest('[data-action="add-to-cart"]');
        if (addBtn) {
            e.stopPropagation();
            addToCart(parseInt(addBtn.dataset.id));
            return;
        }

        const favBtn = e.target.closest('[data-action="toggle-favorite"]');
        if (favBtn) {
            e.stopPropagation();
            toggleFavorite(parseInt(favBtn.dataset.id));
            return;
        }

        const removeBtn = e.target.closest('[data-action="cart-remove"]');
        if (removeBtn) {
            e.stopPropagation();
            removeCartItem(parseInt(removeBtn.dataset.index));
            return;
        }

        const increaseBtn = e.target.closest('[data-action="cart-increase"]');
        if (increaseBtn) {
            changeQty(parseInt(increaseBtn.dataset.index), 1);
            return;
        }

        const decreaseBtn = e.target.closest('[data-action="cart-decrease"]');
        if (decreaseBtn) {
            changeQty(parseInt(decreaseBtn.dataset.index), -1);
            return;
        }

        const card = e.target.closest('.product-card');
        if (card && !e.target.closest('.product-card-add') && !e.target.closest('.fav-icon')) {
            openProductModal(parseInt(card.dataset.productId));
        }
    });

    function addToCart(pid, t = '', c = '') {
        const p = products.find(pr => pr.id === pid);
        if (!p) return;
        const moq = Number(p.moq) || 1;
        const exist = cart.find(i => i.productId === pid && i.taille === t && i.couleur === c);
        if (exist) exist.quantity = Number(exist.quantity) + moq;
        else cart.push({ productId: pid, quantity: moq, taille: t, couleur: c, moq });
        saveCart();
        refreshCartDisplay();
        showToast('🛒 Ajouté au panier');
    }

    function changeQty(idx, d) {
        const it = cart[idx];
        if (!it) return;
        const moq = Number(it.moq) || 1;
        const n = Number(it.quantity) + d;
        it.quantity = n >= moq ? n : moq;
        saveCart();
        refreshCartDisplay();
    }

    function removeCartItem(idx) { cart.splice(idx, 1); saveCart(); refreshCartDisplay(); }
    function saveCart() { localStorage.setItem('nrj_cart_v32', JSON.stringify(cart)); }

    function refreshCartDisplay() {
        const cnt = cart.reduce((s, i) => s + Number(i.quantity), 0);
        const tot = cart.reduce((s, i) => {
            const p = products.find(pr => pr.id === i.productId);
            return s + (p ? p.price * Number(i.quantity) : 0);
        }, 0);
        document.getElementById('cartCount').textContent = cnt;
        document.getElementById('cartTotal').textContent = formatPrice(tot);
        document.getElementById('checkoutBtn').disabled = cart.length === 0;
        const ctr = document.getElementById('cartItems');
        if (cart.length === 0) { ctr.innerHTML = '<div class="cart-empty">Panier vide</div>'; return; }
        ctr.innerHTML = cart.map((it, idx) => {
            const p = products.find(pr => pr.id === it.productId);
            if (!p) return '';
            const img = p.image ? `<img src="${escapeHtml(p.image)}">` : '📦';
            let vars = [];
            if (it.couleur) vars.push(`Couleur: ${it.couleur}`);
            if (it.taille) vars.push(`Taille: ${it.taille}`);
            const dis = Number(it.quantity) <= (Number(it.moq) || 1);
            return `<div class="cart-item">
                <div class="cart-item-img">${img}</div>
                <div class="cart-item-info">
                    <h4>${escapeHtml(p.name)}</h4>
                    ${vars.length ? `<div class="cart-item-variants">${escapeHtml(vars.join(', '))}</div>` : ''}
                    <span class="cart-item-price">${formatPrice(p.price)}</span>
                    <div class="cart-item-qty">
                        <button class="qty-btn" data-action="cart-decrease" data-index="${idx}" ${dis ? 'disabled' : ''}>−</button>
                        <span>${Number(it.quantity)}</span>
                        <button class="qty-btn" data-action="cart-increase" data-index="${idx}">+</button>
                    </div>
                </div>
                <button class="remove-item-btn" data-action="cart-remove" data-index="${idx}">🗑️</button>
            </div>`;
        }).join('');
    }

    function openOrderModal() {
        if (cart.length === 0) return;
        let tot = 0;
        const items = cart.map(i => {
            const p = products.find(pr => pr.id === i.productId);
            if (!p) return '';
            tot += p.price * Number(i.quantity);
            return `• ${escapeHtml(p.name)} [ID: ${p.id}] x${Number(i.quantity)}`;
        }).filter(Boolean).join('<br>');
        document.getElementById('orderSummary').innerHTML = `${items}<br><br><strong>Total : ${formatPrice(tot)}</strong>`;
        document.getElementById('customerName').value = localStorage.getItem('nrj_customer_name') || '';
        document.getElementById('orderModalOverlay').classList.add('open');
        document.getElementById('cartPanel').classList.remove('open');
        document.getElementById('cartOverlay').classList.remove('open');
    }

    function sendWhatsAppOrder() {
        const name = document.getElementById('customerName').value.trim();
        if (!name) return alert('Entre ton nom');
        localStorage.setItem('nrj_customer_name', name);
        let msg = `Bonjour NRJ Marketplace International, je suis ${encodeURIComponent(name)}. Ma commande :%0A`;
        let tot = 0;
        cart.forEach(i => {
            const p = products.find(pr => pr.id === i.productId);
            if (p) {
                let d = `${encodeURIComponent(p.name)} [ID: ${p.id}]`;
                if (i.couleur || i.taille) d += ` (${[i.couleur, i.taille].filter(Boolean).join(', ')})`;
                msg += `- ${d} x${Number(i.quantity)} = ${formatPrice(p.price * Number(i.quantity))}%0A  🔗 ${encodeURIComponent(BASE_URL + '?id=' + p.id)}%0A`;
                tot += p.price * Number(i.quantity);
            }
        });
        msg += `%0ATotal : ${formatPrice(tot)}%0AMerci !`;
        window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`, '_blank');
        cart = [];
        saveCart();
        refreshCartDisplay();
        document.getElementById('orderModalOverlay').classList.remove('open');
        showToast('📤 Commande envoyée');
    }

    function toggleFavorite(pid) {
        const idx = favorites.indexOf(pid);
        if (idx > -1) favorites.splice(idx, 1);
        else favorites.push(pid);
        saveFavorites();
        document.querySelectorAll(`.fav-icon[data-id="${pid}"]`).forEach(icon => { icon.textContent = favorites.includes(pid) ? '❤️' : '🤍'; });
        if (document.getElementById('modalFavBtn') && currentProductId === pid) document.getElementById('modalFavBtn').textContent = favorites.includes(pid) ? '❤️' : '🤍';
        if (currentFilter === 'favorites') refreshCatalogue();
    }

    function openProductModal(pid, t = null, c = null) {
        const p = products.find(pr => pr.id === pid);
        if (!p) return;
        currentProductId = pid;
        const tailles = (p.tailles || '').split(',').map(s => s.trim()).filter(Boolean),
              couleurs = (p.couleurs || '').split(',').map(s => s.trim()).filter(Boolean);
        let sT = tailles.length ? (t && tailles.includes(t) ? t : tailles[0]) : '',
            sC = couleurs.length ? (c && couleurs.includes(c) ? c : couleurs[0]) : '';
        const moq = Number(p.moq) || 1,
              uPrice = Number(p.price),
              tMin = uPrice * moq;

        document.getElementById('modalPrice').textContent = formatPrice(uPrice);
        document.getElementById('modalMoq').textContent = `Minimum d'achat : ${moq} pièce(s)`;
        document.getElementById('modalTotal').textContent = `Total minimum : ${formatPrice(tMin)}`;
        document.getElementById('modalDesc').textContent = p.description || '';
        document.getElementById('modalProductIdBadge').textContent = `[ID: ${p.id}]`;
        document.getElementById('modalFavBtn').textContent = favorites.includes(p.id) ? '❤️' : '🤍';
        document.getElementById('modalFavBtn').onclick = () => toggleFavorite(p.id);
        document.getElementById('modalShareBtn').onclick = () => {
            const url = BASE_URL + '?id=' + p.id;
            const txt = `${formatPrice(uPrice)}\nMinimum d'achat : ${moq} pièce(s)\nTotal minimum : ${formatPrice(tMin)}\nDécouvre "${p.name}" sur NRJ Marketplace International ${url}`;
            if (navigator.share) navigator.share({ title: p.name, text: txt, url }).catch(() => {});
            else navigator.clipboard.writeText(txt).then(() => showToast('🔗 Copié !'));
        };

        const imgs = [p.image, p.image2, p.image3, p.image4, p.image5, p.image6].filter(u => u && u.trim());
        const sc = document.getElementById('modalCarouselScroll'), dc = document.getElementById('modalCarouselDots');
        sc.innerHTML = ''; dc.innerHTML = '';
        if (imgs.length === 0) {
            sc.innerHTML = '<div class="carousel-slide"><div class="carousel-emoji-slide">📦</div></div>';
            dc.innerHTML = '<button class="carousel-dot active"></button>';
        } else {
            imgs.forEach((u, i) => {
                sc.innerHTML += `<div class="carousel-slide"><img src="${escapeHtml(u)}" onerror="this.style.display='none';"></div>`;
                dc.innerHTML += `<button class="carousel-dot${i === 0 ? ' active' : ''}" data-index="${i}"></button>`;
            });
        }

        function ro(ct, opts, sel, ty) {
            ct.innerHTML = '';
            opts.forEach(o => {
                const b = document.createElement('button');
                b.className = 'option-btn' + (o === sel ? ' selected' : '');
                b.textContent = o;
                b.onclick = () => {
                    ct.querySelectorAll('.option-btn').forEach(x => x.classList.remove('selected'));
                    b.classList.add('selected');
                    if (ty === 'taille') sT = o; else sC = o;
                };
                ct.appendChild(b);
            });
        }

        if (tailles.length) {
            document.getElementById('modalTailleGroup').style.display = 'block';
            ro(document.getElementById('modalTailleOptions'), tailles, sT, 'taille');
        } else document.getElementById('modalTailleGroup').style.display = 'none';

        if (couleurs.length) {
            document.getElementById('modalCouleurGroup').style.display = 'block';
            ro(document.getElementById('modalCouleurOptions'), couleurs, sC, 'couleur');
        } else document.getElementById('modalCouleurGroup').style.display = 'none';

        document.getElementById('addToCartStickyBtn').onclick = () => addToCart(p.id, sT, sC);
        document.getElementById('directOrderStickyBtn').onclick = () => {
            if (tailles.length && !sT) return showToast('⚠️ Sélectionnez une taille');
            window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(`Bonjour NRJ Marketplace, je souhaite commander directement ce produit : ${p.name} (ID: ${p.id}), Taille: ${sT || 'N/A'}, Quantité: ${moq}, Total minimum: ${formatPrice(tMin)}. Voici le lien : ${BASE_URL}?id=${p.id}`)}`, '_blank');
        };

        let rec = products.filter(pr => pr.category === p.category && pr.id !== p.id);
        if (rec.length < 6) rec = [...rec, ...products.filter(pr => pr.id !== p.id && !rec.includes(pr))].slice(0, 6);
        document.getElementById('modalRecCarousel').innerHTML = rec.map(r => `<div class="rec-card" data-product-id="${r.id}"><img src="${escapeHtml(r.image || '')}" onerror="this.style.display='none';"><div class="rec-card-overlay"><div><div class="rec-card-name">${escapeHtml(r.name)}</div><div class="rec-card-price">${formatPrice(r.price)}</div></div></div></div>`).join('');

        document.getElementById('productModal').classList.add('open');
        document.getElementById('stickyBottomBar').classList.add('visible');
        if (!modalOpen) {
            history.pushState({ modalOpen: true }, '', `?id=${p.id}`);
            modalOpen = true;
        }
    }

    function closeProductModal() {
        document.getElementById('productModal').classList.remove('open');
        document.getElementById('stickyBottomBar').classList.remove('visible');
        modalOpen = false;
    }

    document.getElementById('modalCloseBtn').addEventListener('click', () => {
        if (modalOpen) history.back();
    });

    window.addEventListener('popstate', function(e) {
        if (modalOpen) {
            closeProductModal();
        }
    });

    // Sourcing modal
    document.getElementById('modalSourcingBtn').addEventListener('click', () => document.getElementById('modalSourcingFileInput').click());
    document.getElementById('modalSourcingFileInput').addEventListener('change', async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        document.getElementById('modalSourcingStatus').textContent = '⏳ Téléversement...';
        try {
            const fd = new FormData(); fd.append('upload', f);
            const r = await fetch('https://postimages.org/json', { method: 'POST', body: fd });
            const d = await r.json();
            const url = d.url || d.direct_link;
            document.getElementById('modalSourcingStatus').textContent = '✅ Redirection WhatsApp...';
            window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(`Bonjour NRJ Marketplace, je recherche un produit similaire à cette photo : ${url}`)}`, '_blank');
            document.getElementById('modalSourcingStatus').textContent = '';
        } catch (er) { document.getElementById('modalSourcingStatus').textContent = '❌ Échec'; }
        e.target.value = '';
    });
    document.getElementById('modalDescSourcingBtn').addEventListener('click', () => {
        window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("Bonjour NRJ Marketplace International, je recherche un produit spécifique mais je n'ai pas de photo sous la main. J'aimerais vous décrire ce que je cherche pour que vous puissiez vérifier auprès de vos fournisseurs !")}`, '_blank');
    });

    // Auth
    async function handleAdminLogin() {
        const em = document.getElementById('adminEmail').value.trim(),
              pw = document.getElementById('adminPassword').value;
        try {
            const { error } = await supabaseClient.auth.signInWithPassword({ email: em, password: pw });
            if (error) throw error;
            document.getElementById('adminPanel').classList.add('active');
            document.getElementById('adminModalOverlay').classList.remove('open');
            document.getElementById('logoutBtn').classList.add('visible');
            renderAdminList();
            showToast('🔓 Connecté');
        } catch (err) { document.getElementById('adminError').textContent = err.message; }
    }
    async function handleLogout() {
        await supabaseClient.auth.signOut();
        document.getElementById('adminPanel').classList.remove('active');
        document.getElementById('logoutBtn').classList.remove('visible');
        showToast('👋 Déconnecté');
    }
    document.getElementById('adminLoginBtn').addEventListener('click', handleAdminLogin);
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    document.getElementById('adminTrigger').addEventListener('click', () => document.getElementById('adminModalOverlay').classList.add('open'));
    document.getElementById('cancelAdminBtn').addEventListener('click', () => document.getElementById('adminModalOverlay').classList.remove('open'));

    async function addProduct() {
        const name = document.getElementById('adminName').value.trim(),
              category = document.getElementById('adminCategory').value.trim(),
              price = parseInt(document.getElementById('adminPrice').value),
              image = document.getElementById('adminImage').value.trim(),
              image2 = document.getElementById('adminImage2').value.trim(),
              image3 = document.getElementById('adminImage3').value.trim(),
              image4 = document.getElementById('adminImage4').value.trim(),
              image5 = document.getElementById('adminImage5').value.trim(),
              image6 = document.getElementById('adminImage6').value.trim(),
              tailles = document.getElementById('adminTailles').value.trim(),
              couleurs = document.getElementById('adminCouleurs').value.trim(),
              moq = parseInt(document.getElementById('adminMoq').value) || 1,
              desc = document.getElementById('adminDesc').value.trim();
        if (!name || !category || isNaN(price)) return alert('Remplis nom, catégorie et prix.');
        const prod = { name, price, category: removeEmojis(category), emoji: '', image, image2, image3, image4, image5, image6, tailles, couleurs, moq, description: desc };
        try {
            await insertProduct(prod);
            alert('✅ Produit ajouté dans Supabase !');
            ['adminName','adminCategory','adminPrice','adminImage','adminImage2','adminImage3','adminImage4','adminImage5','adminImage6','adminTailles','adminCouleurs','adminMoq','adminDesc'].forEach(id => document.getElementById(id).value = '');
            document.getElementById('adminMoq').value = '1';
            await fetchProducts();
            refreshCatalogue();
            renderAdminList();
            showToast('✅ Catalogue mis à jour');
        } catch (err) { alert('❌ Erreur : ' + err.message); }
    }
    async function deleteProduct(id) {
        if (!confirm('Supprimer ?')) return;
        await deleteProductFromSupabase(id);
        await fetchProducts();
        cart = cart.filter(i => products.some(p => p.id === i.productId));
        saveCart();
        refreshCatalogue();
        renderAdminList();
        refreshCartDisplay();
    }
    function renderAdminList() {
        document.getElementById('adminProductsList').innerHTML = products.map(p => `<li><span>${escapeHtml(p.name)} [ID: ${p.id}] (${formatPrice(p.price)})</span><button class="btn-sm" data-action="admin-remove" data-id="${p.id}">🗑️</button></li>`).join('');
    }
    document.addEventListener('click', e => { if (e.target.matches('[data-action="admin-remove"]')) deleteProduct(parseInt(e.target.dataset.id)); });
    document.getElementById('addProductBtn').addEventListener('click', addProduct);

    // Cart toggles
    document.getElementById('cartToggleBtn').addEventListener('click', () => { document.getElementById('cartPanel').classList.add('open'); document.getElementById('cartOverlay').classList.add('open'); refreshCartDisplay(); });
    document.getElementById('cartCloseBtn').addEventListener('click', () => { document.getElementById('cartPanel').classList.remove('open'); document.getElementById('cartOverlay').classList.remove('open'); });
    document.getElementById('cartOverlay').addEventListener('click', () => { document.getElementById('cartPanel').classList.remove('open'); document.getElementById('cartOverlay').classList.remove('open'); });
    document.getElementById('checkoutBtn').addEventListener('click', openOrderModal);
    document.getElementById('sendWhatsAppBtn').addEventListener('click', sendWhatsAppOrder);
    document.getElementById('cancelOrderBtn').addEventListener('click', () => document.getElementById('orderModalOverlay').classList.remove('open'));

    // Bottom nav
    document.querySelectorAll('.nav-item').forEach(btn => { btn.addEventListener('click', function() {
        document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        const nav = this.dataset.nav;
        if (nav === 'home') { if (modalOpen) history.back(); window.scrollTo(0, 0); }
        if (nav === 'categories') { document.querySelector('.filter-bar').scrollIntoView({ behavior: 'smooth' }); }
        if (nav === 'cart') { document.getElementById('cartPanel').classList.add('open'); document.getElementById('cartOverlay').classList.add('open'); refreshCartDisplay(); }
        if (nav === 'admin') { document.getElementById('adminModalOverlay').classList.add('open'); }
        if (nav === 'profile') { showToast('👤 Profil - Connectez-vous en admin'); }
    });});

    function showToast(m) { const t = document.getElementById('toast'); t.textContent = m; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2000); }

    async function init() {
        await fetchProducts();
        const cats = [...new Set(products.map(p => removeEmojis(p.category)))];
        let filterHTML = '<button class="filter-btn active" data-category="all">Tout voir</button>';
        filterHTML += '<button class="filter-btn fav-btn" data-category="favorites">❤️ Favoris</button>';
        cats.forEach(c => filterHTML += `<button class="filter-btn" data-category="${escapeHtml(c)}">${escapeHtml(c)}</button>`);
        document.getElementById('filterBar').innerHTML = filterHTML;
        refreshCatalogue();
        refreshCartDisplay();
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session) { document.getElementById('adminPanel').classList.add('active'); document.getElementById('logoutBtn').classList.add('visible'); renderAdminList(); }
        const urlP = new URLSearchParams(window.location.search).get('id');
        if (urlP) { const p = products.find(pr => pr.id === parseInt(urlP)); if (p) openProductModal(parseInt(urlP)); }
    }
    init();
})();
