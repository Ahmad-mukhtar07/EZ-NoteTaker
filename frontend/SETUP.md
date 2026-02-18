# EZ-Note – Google OAuth setup

To use “Connect Google Docs” you must configure a Google OAuth 2.0 client and set its ID in the extension manifest.

1. **Google Cloud Console**
   - Go to [Google Cloud Console](https://console.cloud.google.com/) and create or select a project.
   - Enable **Google Drive API** and **Google Docs API** for the project.

2. **OAuth consent screen**
   - Open **APIs & Services → OAuth consent screen**.
   - Choose **External** (or Internal for workspace), fill in app name and support email, and save.

3. **Create OAuth client ID**
   - Open **APIs & Services → Credentials → Create credentials → OAuth client ID**.
   - Application type: **Chrome app**.
   - Name it (e.g. “EZ-Note Extension”).
   - **Application ID**: use your extension’s ID from `chrome://extensions` (e.g. `abcdefghijklmnopqrstuvwxyzabcdef`). Load the unpacked extension once to see the ID.
   - Create and copy the **Client ID** (e.g. `123456789-xxx.apps.googleusercontent.com`).

4. **Put Client ID in .env**
   - Copy `frontend/.env.example` to `frontend/.env`.
   - Set `VITE_OAUTH_CLIENT_ID` to your full Client ID (e.g. `123456789-xxx.apps.googleusercontent.com`).

5. **Rebuild and reload**
   - Run `npm run build`, then in `chrome://extensions` click **Reload** on EZ-Note.

After this, “Connect Google Docs” in the popup will open Google sign-in and then list your Google Docs for selection.
