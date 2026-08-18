import { defineConfig } from 'vite';
import { resolve } from 'path';

// Plugin minimal : après le build, génère precache-manifest.json (liste des
// assets hashés à pré-cacher) pour que le Service Worker puisse les mettre en
// cache au moment de l'installation → vrai hors ligne dès la 1re visite.
function precacheManifestPlugin() {
  return {
    name: 'precache-manifest',
    apply: 'build',
    generateBundle(_, bundle) {
      const assets = Object.keys(bundle)
        .filter(k => k.endsWith('.js') || k.endsWith('.css'))
        .map(k => '/' + k);
      const json = JSON.stringify(assets);
      this.emitFile({
        type: 'asset',
        fileName: 'precache-manifest.json',
        source: json
      });
    }
  };
}

export default defineConfig({
  // Vercel sert à la racine '/' — plus de sous-chemin GitHub Pages.
  base: '/',
  build: {
    // Code splitting : sépare les gros vendors dans des chunks dédiés.
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html')
      },
      output: {
        manualChunks: {
          supabase: ['@supabase/supabase-js']
        }
      }
    }
  },
  plugins: [precacheManifestPlugin()]
});
