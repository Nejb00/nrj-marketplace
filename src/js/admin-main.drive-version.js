import '../css/admin.css';
import '../css/chat.css';
import { fetchProducts } from './api.js';
import { handleAdminLogin, handleLogout, checkAdminSession, addProduct, deleteProduct } from './admin.js';
import { initAdminChat } from './admin-chat.js';

document.getElementById('adminLoginBtn').addEventListener('click', handleAdminLogin);
document.getElementById('logoutBtn').addEventListener('click', handleLogout);
document.getElementById('addProductBtn').addEventListener('click', addProduct);
document.getElementById('backToCatalogueBtn').addEventListener('click', () => { window.location.href = 'index.html'; });

document.addEventListener('click', e => {
    if (e.target.matches('[data-action="admin-remove"]')) deleteProduct(parseInt(e.target.dataset.id));
});

async function init() {
    await fetchProducts();
    await checkAdminSession();
    await initAdminChat();
}

init();
