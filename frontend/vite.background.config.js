import { defineConfig, loadEnv } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Builds the background service worker as a single self-contained file. */
export default defineConfig(({ mode }) => {
  const projectRoot = process.cwd();
  const env = loadEnv(mode, projectRoot, '');
  const envDirs = [projectRoot, __dirname];

  function getClientId() {
    let clientId = env.VITE_OAUTH_CLIENT_ID || '';
    for (const dir of envDirs) {
      const envPath = path.resolve(dir, '.env');
      if (!clientId && fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        const m = envContent.match(/VITE_OAUTH_CLIENT_ID=(.+)/);
        if (m) clientId = m[1].trim().replace(/^["']|["']$/g, '');
        if (clientId) break;
      }
    }
    return clientId;
  }

  return {
    plugins: [
      {
        name: 'manifest-env',
        closeBundle() {
          const cwd = process.cwd();
          const manifestPath = path.resolve(cwd, 'public/manifest.json');
          const destPath = path.resolve(cwd, 'build/manifest.json');
          if (!fs.existsSync(manifestPath)) return;
          let content = fs.readFileSync(manifestPath, 'utf-8');
          content = content.replace(/__VITE_OAUTH_CLIENT_ID__/g, getClientId());
          fs.writeFileSync(destPath, content, 'utf-8');
        },
      },
    ],
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
  };
});
