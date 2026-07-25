import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    // GitHub Pages sert le repo sous /nrj-marketplace/ — à adapter si le nom du repo change
    base: '/nrj-marketplace/',
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                admin: resolve(__dirname, 'admin.html')
            }
        }
    }
});
