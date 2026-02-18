import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  const clientId = env.VITE_OAUTH_CLIENT_ID || '';

  return {
    plugins: [
      react(),
      {
        name: 'manifest-env',
        generateBundle() {
          const manifestPath = path.resolve(__dirname, 'public/manifest.json');
          const envDirs = [__dirname, process.cwd()];
          let clientIdValue = clientId;
          for (const dir of envDirs) {
            const envPath = path.resolve(dir, '.env');
            if (!clientIdValue && fs.existsSync(envPath)) {
              const envContent = fs.readFileSync(envPath, 'utf-8');
              const m = envContent.match(/VITE_OAUTH_CLIENT_ID=(.+)/);
              if (m) {
                clientIdValue = m[1].trim().replace(/^["']|["']$/g, '');
                break;
              }
            }
          }
          let content = fs.readFileSync(manifestPath, 'utf-8');
          content = content.replace(/__VITE_OAUTH_CLIENT_ID__/g, clientIdValue);
          this.emitFile({ type: 'asset', fileName: 'manifest.json', source: content });
        },
      },
      viteStaticCopy({
        targets: [
          {
            src: 'src/content/snipOverlay.js',
            dest: '.',
            rename: 'snipOverlay.js',
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