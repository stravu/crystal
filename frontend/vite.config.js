import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
    plugins: [react()],
    server: {
        port: 4521,
        strictPort: true,
        proxy: {
            '/api': {
                target: 'http://localhost:3001',
                changeOrigin: true,
            }
        }
    },
    base: './',
    build: {
        // Ensure assets are copied and paths are relative
        assetsDir: 'assets',
        // Copy public files to dist
        copyPublicDir: true
    }
});
