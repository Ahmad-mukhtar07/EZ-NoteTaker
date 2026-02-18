import { useState, useEffect } from 'react';
import { getAuthToken, getAuthTokenSilent, removeCachedAuthToken, clearAllCachedAuthTokens, clearStoredAccessToken } from './lib/auth.js';
import { getSelectedDocumentId, getSelectedDocumentName, clearSelectedDocument } from './lib/storage.js';
import { ConnectGoogleDocsButton } from './components/ConnectGoogleDocsButton';
import { DocsList } from './components/DocsList';
import { ConnectedDocument } from './components/ConnectedDocument';
import { DocPreview } from './components/DocPreview';
import './App.css';

function App() {
  const [token, setToken] = useState(null);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [showDocList, setShowDocList] = useState(false);
  const [initializing, setInitializing] = useState(true);

  // Load persisted selected document and token on mount (token needed for "Change document")
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [id, name, silentToken] = await Promise.all([
          getSelectedDocumentId(),
          getSelectedDocumentName(),
          getAuthTokenSilent(),
        ]);
        if (!cancelled && id) setSelectedDoc({ id, name: name || 'Untitled' });
        if (!cancelled && silentToken) {
          setToken(silentToken);
          // If we have a token but no saved doc, show doc list so user can pick one
          if (!id) setShowDocList(true);
        }
      } catch (_) {
        // ignore
      } finally {
        if (!cancelled) setInitializing(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const handleConnectSuccess = (accessToken) => {
    setToken(accessToken);
    setShowDocList(true);
  };

  const handleDocumentSelected = (doc) => {
    setSelectedDoc(doc);
    setShowDocList(false);
  };

  const handleLogout = async () => {
    if (token) {
      try {
        await removeCachedAuthToken(token);
      } catch (_) {
        // ignore
      }
      try {
        await clearAllCachedAuthTokens();
      } catch (_) {
        // ignore (e.g. Chrome < 87)
      }
      await clearStoredAccessToken();
    }
    await clearSelectedDocument();
    setToken(null);
    setSelectedDoc(null);
    setShowDocList(false);
  };

  const handleChangeDocument = async () => {
    let t = await getAuthTokenSilent();
    if (!t) {
      try {
        t = await getAuthToken();
      } catch (_) {
        setToken(null);
        setShowDocList(false);
        return;
      }
    }
    if (t) {
      setToken(t);
      setShowDocList(true);
    } else {
      setToken(null);
      setShowDocList(false);
    }
  };

  if (initializing) {
    return (
      <div className="app app--popup">
        <header className="app__header">
          <h1 className="app__title">EZ-NoteTaker</h1>
        </header>
        <div className="app__body">Loading…</div>
      </div>
    );
  }

  const isConnected = Boolean(token);
  const hasSelectedDoc = Boolean(selectedDoc && !showDocList);

  return (
    <div className="app app--popup">
      <header className="app__header">
        <h1 className="app__title">EZ-NoteTaker</h1>
        {isConnected && (
          <button
            type="button"
            className="app__logout"
            onClick={handleLogout}
          >
            Sign out
          </button>
        )}
      </header>
      <main className="app__body">
        {hasSelectedDoc && (
          <>
            <ConnectedDocument
              documentName={selectedDoc.name}
              onChangeDocument={handleChangeDocument}
            />
            <DocPreview documentId={selectedDoc?.id} />
          </>
        )}

        {!hasSelectedDoc && !isConnected && (
          <ConnectGoogleDocsButton onSuccess={handleConnectSuccess} />
        )}

        {isConnected && showDocList && (
          <DocsList
            accessToken={token}
            onSelectDocument={handleDocumentSelected}
            onError={() => setToken(null)}
          />
        )}
      </main>
    </div>
  );
}

export default App;
