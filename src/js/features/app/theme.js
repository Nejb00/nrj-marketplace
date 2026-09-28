// ═══ App — thème clair/sombre ═══
// Éclaté de main.js (refacto-archi) — logique strictement identique.
export function initThemeToggle() {
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  if (!themeToggleBtn) return;

  const savedTheme = localStorage.getItem('nrj_theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const initialTheme = savedTheme || (prefersDark ? 'dark' : 'light');

  applyTheme(initialTheme);

  themeToggleBtn.addEventListener('click', () => {
    const currentTheme = document.documentElement.classList.contains('light-theme') ? 'light' : 'dark';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    applyTheme(newTheme);
    localStorage.setItem('nrj_theme', newTheme);
  });
}

export function applyTheme(theme) {
  const html = document.documentElement;
  const themeToggleBtn = document.getElementById('themeToggleBtn');

  if (theme === 'light') {
    html.classList.add('light-theme');
    if (themeToggleBtn) themeToggleBtn.textContent = '☀️';
  } else {
    html.classList.remove('light-theme');
    if (themeToggleBtn) themeToggleBtn.textContent = '🌙';
  }
}
