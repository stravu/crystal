import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    electron([
      {
        entry: 'main/src/index.ts',
        onstart(options) {
          if (process.env.NODE_ENV === 'development') {
            options.startup();
          }
        },
        vite: {
          build: {
            sourcemap: true,
            minify: process.env.NODE_ENV === 'production',
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron', ...require('module').builtinModules.flatMap(m => [m, `node:${m}`])],
            },
          },
        },
      },
      {
        entry: 'main/src/preload.ts',
        onstart(options) {
          options.reload();
        },
        vite: {
          build: {
            sourcemap: true,
            minify: process.env.NODE_ENV === 'production',
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron', ...require('module').builtinModules.flatMap(m => [m, `node:${m}`])],
            },
          },
        },
      }
    ]),
    renderer(),
  ],
  server: {
    port: 4521,
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'frontend/index.html'),
      },
    },
  },
});