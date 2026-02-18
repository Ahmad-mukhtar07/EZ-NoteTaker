import { useState, useEffect, useCallback } from 'react';
import { getAuthStatus, authConnect, authDisconnect, getDocsList, setSelectedDoc } from './popup/messages.js';
import { ConnectGoogleDocsButton } from './components/ConnectGoogleDocsButton';
import { DocsList } from './components/DocsList';
import { ConnectedDocument } from './components/ConnectedDocument';
import { DocPreview } from './components/DocPreview';
import './App.css';

const STATUS = {
  NOT_CONNECTED: 'not_connected',
  CONNECTED: 'connected',
  DOCUMENT_SELECTED: 'document_selected',
};

function App() {
  const [status, setStatus] = useState(STATUS.NOT_CONNECTED);
  const [documentId, setDocumentId] = useState(null);
  const [documentName, setDocumentName] = useState(null);
  const [showDocList, setShowDocList] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [apiLoading, setApiLoading] = useState(false);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await getAuthStatus();
      const connected = !!res?.connected;
      const docId = res?.documentId ?? null;
      const docName = res?.documentName ?? null;
      setDocumentId(docId);
      setDocumentName(docName);
      if (connected && docId) setStatus(STATUS.DOCUMENT_SELECTED);
      else if (connected) setStatus(STATUS.CONNECTED);
      else setStatus(STATUS.NOT_CONNECTED);
      if (connected && !docId) setShowDocList(true);
      else setShowDocList(false);
    } catch (_) {
      setStatus(STATUS.NOT_CONNECTED);
      setDocumentId(null);
      setDocumentName(null);
      setShowDocList(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getAuthStatus();
        if (cancelled) return;
        const connected = !!res?.connected;
        const docId = res?.documentId ?? null;
        const docName = res?.documentName ?? null;
        setDocumentId(docId);
        setDocumentName(docName);
        if (connected && docId) setStatus(STATUS.DOCUMENT_SELECTED);
        else if (connected) setStatus(STATUS.CONNECTED);
        else setStatus(STATUS.NOT_CONNECTED);
        if (connected && !docId) setShowDocList(true);
      } catch (_) {
        if (!cancelled) setStatus(STATUS.NOT_CONNECTED);
      } finally {
        if (!cancelled) setInitializing(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleConnectSuccess = () => {
    setStatus(STATUS.CONNECTED);
    setShowDocList(true);
  };

  const handleDocumentSelected = (doc) => {
    setDocumentId(doc.id);
    setDocumentName(doc.name || 'Untitled');
    setStatus(STATUS.DOCUMENT_SELECTED);
    setShowDocList(false);
  };

  const handleDisconnect = async () => {
    setApiLoading(true);
    try {
      await authDisconnect();
      setStatus(STATUS.NOT_CONNECTED);
      setDocumentId(null);
      setDocumentName(null);
      setShowDocList(false);
    } catch (_) {
      await refreshStatus();
    } finally {
      setApiLoading(false);
    }
  };

  const handleChangeDocument = () => {
    setShowDocList(true);
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

  const hasSelectedDoc = status === STATUS.DOCUMENT_SELECTED && !showDocList;
  const isConnected = status !== STATUS.NOT_CONNECTED;
  const statusLabel =
    status === STATUS.DOCUMENT_SELECTED
      ? 'Document Selected'
      : status === STATUS.CONNECTED
        ? 'Connected'
        : 'Not Connected';

  return (
    <div className="app app--popup">
      <header className="app__header">
        <div className="app__header-left">
          <h1 className="app__title">EZ-NoteTaker</h1>
          <span className="app__status" role="status" aria-live="polite">
            <span className={`app__status-dot app__status-dot--${status === STATUS.NOT_CONNECTED ? 'off' : 'on'}`} />
            {statusLabel}
          </span>
        </div>
        {isConnected && (
          <button
            type="button"
            className="app__logout"
            onClick={handleDisconnect}
            disabled={apiLoading}
            aria-busy={apiLoading}
          >
            Disconnect
          </button>
        )}
      </header>
      <main className="app__body">
        {hasSelectedDoc && (
          <>
            <ConnectedDocument
              documentName={documentName || 'Untitled'}
              onChangeDocument={handleChangeDocument}
              disabled={apiLoading}
            />
            <DocPreview documentId={documentId} />
          </>
        )}

        {status === STATUS.NOT_CONNECTED && (
          <ConnectGoogleDocsButton onSuccess={handleConnectSuccess} disabled={apiLoading} />
        )}

        {isConnected && showDocList && (
          <DocsList
            onSelectDocument={handleDocumentSelected}
            onError={() => setStatus(STATUS.NOT_CONNECTED)}
            disabled={apiLoading}
          />
        )}
      </main>
    </div>
  );
}

export default App;
