import { useState, useCallback, useEffect } from 'react';
import './DocPreview.css';

/**
 * Renders a single paragraph's children (text runs with bold/italic, images).
 * When replaceImagesWithPlaceholder is true, images are shown as "<img>" text.
 */
function ParagraphContent({ children, replaceImagesWithPlaceholder }) {
  if (!Array.isArray(children) || children.length === 0) return null;
  return (
    <>
      {children.map((child, i) => {
        if (child.type === 'text') {
          let content = child.value;
          if (content.trim() === '') return <span key={i}>{content}</span>;
          if (child.bold && child.italic) {
            return <strong key={i}><em>{content}</em></strong>;
          }
          if (child.bold) return <strong key={i}>{content}</strong>;
          if (child.italic) return <em key={i}>{content}</em>;
          if (child.underline) return <span key={i} className="doc-preview__underline">{content}</span>;
          if (child.strikethrough) return <span key={i} className="doc-preview__strikethrough">{content}</span>;
          return <span key={i}>{content}</span>;
        }
        if (child.type === 'image') {
          if (replaceImagesWithPlaceholder) {
            return (
              <span key={i} className="doc-preview__img-placeholder">
                &lt;img&gt;
              </span>
            );
          }
          if (child.url) {
            return (
              <img
                key={i}
                src={child.url}
                alt=""
                className="doc-preview__img"
                referrerPolicy="no-referrer"
                loading="lazy"
              />
            );
          }
        }
        return null;
      })}
    </>
  );
}

/**
 * Renders blocks, grouping consecutive list items into one <ul>.
 */
function PreviewBlocks({ blocks, replaceImagesWithPlaceholder }) {
  const out = [];
  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i];
    if (block.type !== 'paragraph') {
      i++;
      continue;
    }
    if (block.listItem) {
      const listItems = [];
      while (i < blocks.length && blocks[i].type === 'paragraph' && blocks[i].listItem) {
        const p = blocks[i];
        listItems.push(
          <li key={i} className={`doc-preview__li doc-preview__li--${p.style}`}>
            <ParagraphContent children={p.children} replaceImagesWithPlaceholder={replaceImagesWithPlaceholder} />
          </li>
        );
        i++;
      }
      out.push(<ul key={`ul-${i}`} className="doc-preview__ul">{listItems}</ul>);
      continue;
    }
    const style = block.style;
    const Tag = style === 'heading1' ? 'h1' : style === 'heading2' ? 'h2' : style === 'heading3' ? 'h3' : style === 'heading4' ? 'h4' : style === 'heading5' ? 'h5' : style === 'heading6' ? 'h6' : 'p';
    out.push(
      <Tag key={i} className={`doc-preview__block doc-preview__block--${style}`}>
        <ParagraphContent children={block.children} replaceImagesWithPlaceholder={replaceImagesWithPlaceholder} />
      </Tag>
    );
    i++;
  }
  return <div className="doc-preview__blocks">{out}</div>;
}

const AUTO_REFRESH_MS = 4000;

const DOCS_EDIT_URL = (id) => `https://docs.google.com/document/d/${id}/edit`;

export function DocPreview({ documentId }) {
  const [previewMode, setPreviewMode] = useState(null); // null | 'full' | 'noImages'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) return;
    const listener = (msg) => {
      if (msg.type !== 'DOC_PREVIEW_RESULT') return;
      setLoading(false);
      if (msg.error) {
        setError(msg.error);
        setPreview(null);
      } else {
        setError(null);
        const blocks = Array.isArray(msg.blocks) ? msg.blocks : [];
        setPreview({ title: msg.title ?? 'Untitled', blocks });
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const fetchPreview = useCallback((silent = false) => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return;
    if (!silent) {
      setLoading(true);
      setError(null);
      setPreview(null);
    }
    chrome.runtime.sendMessage({ type: 'GET_DOC_PREVIEW' });
  }, []);

  // Auto-refresh when in "Preview without Images" mode (interval only; initial load is from button handler)
  useEffect(() => {
    if (previewMode !== 'noImages') return;
    const id = setInterval(() => fetchPreview(true), AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [previewMode, fetchPreview]);

  const showPreview = previewMode !== null;
  const isNoImagesMode = previewMode === 'noImages';

  const handlePreviewFull = () => {
    if (previewMode === 'full') {
      setPreviewMode(null);
      return;
    }
    setPreviewMode('full');
    if (!preview && !loading) fetchPreview();
  };

  const handlePreviewNoImages = () => {
    if (previewMode === 'noImages') {
      setPreviewMode(null);
      return;
    }
    setPreviewMode('noImages');
    if (!preview && !loading) fetchPreview();
  };

  const handleHidePreview = () => {
    setPreviewMode(null);
  };

  const handleRefresh = () => {
    fetchPreview();
  };

  const handleOpenDoc = () => {
    if (documentId) {
      const url = DOCS_EDIT_URL(documentId);
      if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
        chrome.tabs.create({ url });
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    }
  };

  return (
    <div className="doc-preview">
      <p className="doc-preview__section-label">Preview</p>
      <div className="doc-preview__toggles" role="group" aria-label="Preview mode">
        <button
          type="button"
          className={`doc-preview__toggle ${previewMode === 'full' ? 'doc-preview__toggle--active' : ''}`}
          onClick={handlePreviewFull}
          aria-pressed={previewMode === 'full'}
        >
          Full
        </button>
        <span className="doc-preview__toggle-divider" aria-hidden="true" />
        <button
          type="button"
          className={`doc-preview__toggle ${previewMode === 'noImages' ? 'doc-preview__toggle--active' : ''}`}
          onClick={handlePreviewNoImages}
          aria-pressed={previewMode === 'noImages'}
        >
          Text only
        </button>
      </div>
      {showPreview && (
        <div className="doc-preview__body">
          {loading && <p className="doc-preview__loading">Loading…</p>}
          {error && !loading && (
            <div className="doc-preview__error">
              <p>{error}</p>
              <button type="button" className="doc-preview__refresh" onClick={handleRefresh}>
                Retry
              </button>
            </div>
          )}
          {preview && !loading && (
            <>
              <div className="doc-preview__toolbar">
                {documentId && (
                  <button type="button" className="doc-preview__open-doc" onClick={handleOpenDoc} title="Open in Google Docs">
                    Open doc
                  </button>
                )}
                {!isNoImagesMode ? (
                  <button type="button" className="doc-preview__refresh" onClick={handleRefresh}>
                    Refresh
                  </button>
                ) : (
                  <span className="doc-preview__auto-refresh">Auto-refresh {AUTO_REFRESH_MS / 1000}s</span>
                )}
                <button type="button" className="doc-preview__hide" onClick={handleHidePreview}>
                  Close
                </button>
              </div>
              <div className="doc-preview__content">
                <h3 className="doc-preview__title">{preview.title}</h3>
                {preview.blocks.length === 0 ? (
                  <p className="doc-preview__empty">(Empty document)</p>
                ) : (
                  <PreviewBlocks
                    blocks={preview.blocks}
                    replaceImagesWithPlaceholder={isNoImagesMode}
                  />
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
