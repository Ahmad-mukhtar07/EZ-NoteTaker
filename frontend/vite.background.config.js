import { defineConfig } from 'vite';

/** Builds the background service worker as a single self-contained file. */
export default defineConfig({
  build: {
    outDir: 'build',
    emptyOutDir: false,
    lib: {
      entry: 'src/background.js',
      formats: ['iife'],
      name: 'Background',
      fileName: () => 'background.js',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
