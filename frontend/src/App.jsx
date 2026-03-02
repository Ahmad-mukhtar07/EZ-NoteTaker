import { useState, useEffect, useCallback } from 'react';
import { getAuthStatus, authConnect, authDisconnect, getDocsList, setSelectedDoc } from './popup/messages.js';
import { ConnectGoogleDocsButton } from './components/ConnectGoogleDocsButton';
import { DocsList } from './components/DocsList';
import { DocumentManager } from './components/DocumentManager';
import { ConnectedDocument } from './components/ConnectedDocument';
import { DocPreview } from './components/DocPreview';
import { LoginPage } from './components/LoginPage';
import { UpgradeModal } from './components/UpgradeModal';
import { useAuth } from './hooks/useAuth';
import { isSupabaseConfigured, supabaseUrl, supabaseAnonKey } from './config/supabase-config.js';
import { addConnectedDoc, getConnectedDocs, removeConnectedDoc } from './lib/connectedDocsService.js';
import docSourcedLogo from './assets/DocSourced-logo.png';
import './App.css';

if (isSupabaseConfigured && supabaseUrl && typeof chrome?.storage?.local?.set === 'function') {
  chrome.storage.local.set({
    eznote_supabase_url: supabaseUrl,
    eznote_supabase_anon_key: supabaseAnonKey,
  });
}

const STATUS = {
  NOT_CONNECTED: 'not_connected',
  CONNECTED: 'connected',
  DOCUMENT_SELECTED: 'document_selected',
};

function App() {
  const { user: supabaseUser, loading: authLoading, logout: supabaseLogout, tier } = useAuth();
  const [status, setStatus] = useState(STATUS.NOT_CONNECTED);
  const [documentId, setDocumentId] = useState(null);
  const [documentName, setDocumentName] = useState(null);
  const [showDocList, setShowDocList] = useState(false);
  const [showDocumentManager, setShowDocumentManager] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [apiLoading, setApiLoading] = useState(false);
  const [upgradeModal, setUpgradeModal] = useState({ open: false, reason: 'snip_limit' });

  // Route guard: only show login when auth is resolved and there is no session (no flash).
  const showSupabaseLogin = isSupabaseConfigured && !authLoading && !supabaseUser;

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

  const handleDocumentSelected = useCallback(async (doc) => {
    if (isSupabaseConfigured && supabaseUser) {
      try {
        await addConnectedDoc(doc.id, doc.name || 'Untitled');
      } catch (e) {
        if (e?.code === 'DOC_LIMIT_REACHED') {
          try {
            const connected = await getConnectedDocs();
            // Free tier: allow "replace" — remove existing doc and add the one they just picked.
            if (connected.length === 1) {
              await removeConnectedDoc(connected[0].id);
              await addConnectedDoc(doc.id, doc.name || 'Untitled');
              // Fall through to setSelectedDoc below
            } else if (connected.length > 1) {
              setUpgradeModal({ open: true, reason: 'doc_limit' });
              return;
            }
            // connected.length === 0: backend said limit but we see none — still set selection
          } catch (_) {
            // Replace failed or getConnectedDocs failed; still try to set selection so user can use the doc
          }
        }
        // Other errors: still try to set selection
      }
    }
    const res = await setSelectedDoc(doc.id, doc.name || 'Untitled');
    if (!res?.success) return;
    setDocumentId(doc.id);
    setDocumentName(doc.name || 'Untitled');
    setStatus(STATUS.DOCUMENT_SELECTED);
    setShowDocList(false);
    setShowDocumentManager(false);
  }, [supabaseUser]);

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
    if (isSupabaseConfigured && supabaseUser) {
      setShowDocumentManager(true);
    } else {
      setShowDocList(true);
    }
  };

  const handleDocumentRemoved = useCallback(async () => {
    await setSelectedDoc('', '');
    setDocumentId(null);
    setDocumentName(null);
    setStatus(STATUS.CONNECTED);
    setShowDocList(true);
    setShowDocumentManager(false);
  }, []);

  // (1) Unauthenticated → login only
  if (showSupabaseLogin) {
    return <LoginPage />;
  }

  // (2) Session check on load: show loading until auth resolved, then dashboard
  if (authLoading || initializing) {
    return (
      <div className="app app--popup">
        <header className="app__header">
          <img src={docSourcedLogo} alt="" className="app__logo" aria-hidden />
          <h1 className="app__title">DocSourced</h1>
        </header>
        <div className="app__body">Loading…</div>
      </div>
    );
  }

  const hasSelectedDoc = status === STATUS.DOCUMENT_SELECTED && !showDocList && !showDocumentManager;
  const isConnected = status !== STATUS.NOT_CONNECTED;

  return (
    <div className="app app--popup">
      <UpgradeModal
        open={upgradeModal.open}
        onClose={() => setUpgradeModal((m) => ({ ...m, open: false }))}
        reason={upgradeModal.reason}
      />
      <header className="app__header">
        <div className="app__header-left">
          <img src={docSourcedLogo} alt="" className="app__logo" aria-hidden />
          <div className="app__title-wrap">
            <h1 className="app__title">DocSourced</h1>
            <p className="app__tagline">Capture fast. Format clean. Reference intelligently.</p>
          </div>
        </div>
        <div className="app__header-actions">
          {isSupabaseConfigured && supabaseUser && (
            <button
              type="button"
              className="app__logout"
              onClick={supabaseLogout}
              aria-label="Sign out of account"
            >
              Sign out
            </button>
          )}
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
        </div>
      </header>
      <main className="app__body">
        {hasSelectedDoc && (
          <>
            <ConnectedDocument
              documentId={documentId}
              documentName={documentName || 'Untitled'}
              onChangeDocument={handleChangeDocument}
              onSwitchDocument={(doc) => {
                setDocumentId(doc.id);
                setDocumentName(doc.name || 'Untitled');
              }}
              onDocumentRemoved={handleDocumentRemoved}
              disabled={apiLoading}
            />
            <DocPreview documentId={documentId} />
          </>
        )}

        {status === STATUS.NOT_CONNECTED && (
          <ConnectGoogleDocsButton onSuccess={handleConnectSuccess} disabled={apiLoading} />
        )}

        {isConnected && showDocumentManager && (
          <DocumentManager
            currentDocumentId={documentId}
            onSelectDocument={handleDocumentSelected}
            onDocumentRemoved={handleDocumentRemoved}
            onClose={() => setShowDocumentManager(false)}
            disabled={apiLoading}
          />
        )}

        {isConnected && showDocList && !showDocumentManager && (
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
