import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  // Resolve project root: vite may run config from a temp dir, so prefer cwd (where npm run build was executed)
  const projectRoot = process.cwd();
  const env = loadEnv(mode, projectRoot, '');
  const envDirs = [projectRoot, __dirname];

  function readEnvVar(name) {
    let val = env[name] || '';
    for (const dir of envDirs) {
      const envPath = path.resolve(dir, '.env');
      if (!val && fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        const m = envContent.match(new RegExp(name + '=(.+)'));
        if (m) {
          val = m[1].trim().replace(/^["']|["']$/g, '');
          break;
        }
      }
    }
    return val;
  }
  function getClientId() {
    return readEnvVar('VITE_OAUTH_CLIENT_ID');
  }
  const outDir = path.resolve(projectRoot, 'build');

  return {
    plugins: [
      react(),
      {
        name: 'manifest-env',
        closeBundle() {
          const cwd = process.cwd();
          const clientIdValue = getClientId();
          const manifestPath = path.resolve(cwd, 'public/manifest.json');
          const destPath = path.resolve(cwd, 'build/manifest.json');
          if (!fs.existsSync(manifestPath)) {
            console.warn('[manifest-env] public/manifest.json not found at', manifestPath);
            return;
          }
          let content = fs.readFileSync(manifestPath, 'utf-8');
          content = content.replace(/__VITE_OAUTH_CLIENT_ID__/g, clientIdValue);
          fs.writeFileSync(destPath, content, 'utf-8');
          if (!clientIdValue) {
            console.warn('[manifest-env] VITE_OAUTH_CLIENT_ID is empty; OAuth will fail. Set it in .env');
          }
        },
      },
      viteStaticCopy({
        targets: [
          {
            src: 'src/content/snipOverlay.js',
            dest: '.',
            rename: 'snipOverlay.js',
          },
          {
            src: 'src/content/docsDocPaste.js',
            dest: '.',
            rename: 'docsDocPaste.js',
          },
        ],
      }),
    ],
    build: {
      outDir: 'build',
      rollupOptions: {
        input: {
          main: './index.html',
        },
      },
    },
  };
});