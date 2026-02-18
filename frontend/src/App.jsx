import { useState, useEffect } from 'react';
import { getAuthTokenSilent } from './lib/auth.js';
import { getSelectedDocumentId, getSelectedDocumentName } from './lib/storage.js';
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

  // Load persisted selected document on mount
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [id, name] = await Promise.all([
          getSelectedDocumentId(),
          getSelectedDocumentName(),
        ]);
        if (!cancelled && id) setSelectedDoc({ id, name: name || 'Untitled' });
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

  const handleChangeDocument = async () => {
    const silentToken = await getAuthTokenSilent();
    if (silentToken) {
      setToken(silentToken);
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
          <h1 className="app__title">EZ-Note</h1>
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
        <h1 className="app__title">EZ-Note</h1>
      </header>
      <main className="app__body">
        {hasSelectedDoc && (
          <>
            <ConnectedDocument
              documentName={selectedDoc.name}
              onChangeDocument={handleChangeDocument}
            />
            <DocPreview />
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
