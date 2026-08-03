import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  // Vercel sert à la racine '/' — plus de sous-chemin GitHub Pages.
  base: '/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html')
      }
    }
  }
});
