# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Connect Google Docs (account picker)

**You only need two OAuth client IDs for this extension.** Any third ID (e.g. `VITE_OAUTH_CLIENT_LOGIN_ID`) is not used by this codebase—remove it from `.env` unless you need it for something else (e.g. Supabase Google login is configured in the Supabase Dashboard, not via that env var).

- **`VITE_OAUTH_CLIENT_ID`** – **Chrome application** client (Credentials → Create → Chrome application, use your extension ID). This goes in the manifest and is used by Chrome’s built-in auth.
- **`VITE_GOOGLE_DOCS_WEB_CLIENT_ID`** – **Web application** client (Credentials → Create → Web application) with a **redirect URI** (see below). Used only when you click “Connect Google Docs” so you can choose which Google account to use.

The “Connect Google Docs” flow uses `launchWebAuthFlow`, which needs a Web client with a redirect URI. For Google OAuth the redirect URI must use the path **`/oauth2`**: `https://<extension-id>.chromiumapp.org/oauth2`

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create a **Web application** OAuth client (if you don’t have one).
2. In that client, open **Authorized redirect URIs** and add **exactly** (replace `<extension-id>` with your ID from `chrome://extensions`):
   - `https://<extension-id>.chromiumapp.org/oauth2`
   Or after a failed Connect, the extension shows the redirect URI to use—copy that string into Google Console with no changes.
3. In `.env` set:
   ```env
   VITE_GOOGLE_DOCS_WEB_CLIENT_ID=your-web-application-client-id.apps.googleusercontent.com
   ```
4. Rebuild (`npm run build`) and reload the extension.

**Error 400: redirect_uri_mismatch** means the URI in Google Console does not match exactly. After you click “Connect Google Docs” and see an error, the extension will show “Add this exact URI…”; copy that full URI (including `https://` and trailing `/`) into the Web client’s Authorized redirect URIs, then save. If your extension ID changes (e.g. after reloading an unpacked extension), the redirect URI changes too—either add a `key` to `manifest.json` to keep a stable ID, or add the new redirect URI to the same Web client.
