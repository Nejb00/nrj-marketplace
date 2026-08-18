import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  // Vercel sert à la racine '/' — plus de sous-chemin GitHub Pages.
  base: '/',
  build: {
    // Code splitting : sépare les gros vendors dans des chunks dédiés.
    // - @supabase/supabase-js mis en cache séparément par le SW + navigateur,
    //   partagé entre index et admin sans re-téléchargement.
    // - Code admin isolé : les visiteurs du catalogue ne le téléchargent jamais.
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
  }
});
