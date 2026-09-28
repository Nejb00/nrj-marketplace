// ═══ Admin — authentification (login, logout, session) ═══
// Éclaté de admin.js (refacto-archi) — logique strictement identique.
import { state } from '../../core/state.js';
import { supabaseClient } from '../../core/config.js';
import { showToast } from '../../utils/dom-helpers.js';
import { loadCategoryDropdowns } from './category-dropdowns.js';
import { renderAdminList, renderAdminStats } from './admin-list.js';

export async function handleAdminLogin() {
  try {
    const { error } = await supabaseClient.auth.signInWithPassword({
      email: document.getElementById('adminEmail').value.trim(),
      password: document.getElementById('adminPassword').value
    });
    if (error) throw error;
    state.isAdminLoggedIn = true;
    document.getElementById('adminPanel').classList.add('active');
    document.getElementById('loginPanel').style.display = 'none';
    document.getElementById('logoutBtn').classList.add('visible');
    await loadCategoryDropdowns();
    renderAdminList();
    renderAdminStats();
    showToast('🔓 Connecté');
  } catch (err) {
    document.getElementById('adminError').textContent = err.message;
  }
}

export async function handleLogout() {
  await supabaseClient.auth.signOut();
  state.isAdminLoggedIn = false;
  document.getElementById('adminPanel').classList.remove('active');
  document.getElementById('loginPanel').style.display = 'block';
  document.getElementById('logoutBtn').classList.remove('visible');
  showToast('👋 Déconnecté');
}

export async function checkAdminSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  // Admin = compte marqué role 'admin' (app_metadata) — pas les sessions
  // anonymes du chat ni les éventuels comptes créés par des visiteurs.
  const user = session?.user;
  if (user && user.app_metadata?.role === 'admin') {
    state.isAdminLoggedIn = true;
    document.getElementById('adminPanel').classList.add('active');
    document.getElementById('loginPanel').style.display = 'none';
    document.getElementById('logoutBtn').classList.add('visible');
    await loadCategoryDropdowns();
    renderAdminList();
    renderAdminStats();
  }
  return state.isAdminLoggedIn;
}
