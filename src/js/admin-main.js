import '../css/components/admin.css';
import '../css/components/chat.css';
import { fetchProducts } from './api/api.js';
import { handleAdminLogin, handleLogout, checkAdminSession } from './features/admin/admin-auth.js';
import { addProduct } from './features/admin/product-form.js';
import { deleteProduct } from './features/admin/product-delete.js';
import { initAdminChat } from './features/chat/admin-chat.js';
import { initProductImportUI } from './features/admin/product-import.js';
import { initProductVariantsAdminUI, openProductVariantsEditor } from './features/admin/product-variants-admin-ui.js';

document.getElementById('adminLoginBtn').addEventListener('click', handleAdminLogin);
document.getElementById('logoutBtn').addEventListener('click', handleLogout);
document.getElementById('addProductBtn').addEventListener('click', addProduct);
document.getElementById('backToCatalogueBtn').addEventListener('click', () => { window.location.href = 'index.html'; });

document.addEventListener('click', e => {
    if (e.target.matches('[data-action="admin-remove"]')) {
        deleteProduct(parseInt(e.target.dataset.id));
        return;
    }

    const variantsButton = e.target.closest('[data-action="admin-edit-variants"]');
    if (variantsButton) {
        openProductVariantsEditor(parseInt(variantsButton.dataset.id));
    }
});

async function init() {
    await fetchProducts();
    const isAdmin = await checkAdminSession();
    if (isAdmin) {
        initProductImportUI();
        initProductVariantsAdminUI();
    }
    await initAdminChat();
}

init();
