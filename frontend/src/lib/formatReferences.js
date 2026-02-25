/**
 * Format References: scan doc for SNIP_REF_ named ranges, replace inline source lines with
 * superscript numbers, and append a deduplicated Sources list at the bottom. Pro-only (enforced by UI).
 */

const DOCS_API_BASE = 'https://docs.googleapis.com/v1/documents';
const SNIP_REF_PREFIX = 'SNIP_REF_';
const SOURCES_HEADER = '\n\nSources\n\n';

/** Superscript digits for reference numbers (1–9, then ⁰ for 0 in 10, 11, ...). */
const SUPERSCRIPT = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];

function numberToSuperscript(n) {
  if (n < 1) return '⁰';
  const s = String(n);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    out += SUPERSCRIPT[parseInt(s[i], 10)];
  }
  return out;
}

/** Exported for use when inserting with formatted refs (auto-format). */
export { numberToSuperscript };

/**
 * Get document with named ranges, body end index, and start index of existing "Sources" section (if any).
 */
async function getDocumentWithNamedRanges(documentId, accessToken) {
  const fields = 'namedRanges,body.content(startIndex,endIndex,paragraph(elements(textRun(content))))';
  const url = `${DOCS_API_BASE}/${documentId}?fields=${encodeURIComponent(fields)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 401) throw new Error('SESSION_EXPIRED');
  if (!res.ok) {
    const body = await res.text();
    let msg = `Docs API error: ${res.status}`;
    try {
      const j = JSON.parse(body);
      if (j.error?.message) msg = j.error.message;
    } catch (_) {}
    throw new Error(msg);
  }
  const doc = await res.json();
  const content = doc.body?.content || [];
  const endIndex = content.length === 0 ? 0 : Math.max(...content.map((c) => c.endIndex || 0));

  let fullText = '';
  for (const el of content) {
    if (el.paragraph?.elements) {
      for (const e of el.paragraph.elements) {
        if (e.textRun?.content) fullText += e.textRun.content;
      }
    }
  }
  const markerIdx = fullText.indexOf(SOURCES_HEADER);
  let sourcesSectionStart = null;
  if (markerIdx !== -1) {
    let pos = 0;
    for (const el of content) {
      const start = el.startIndex ?? 0;
      let text = '';
      if (el.paragraph?.elements) {
        for (const e of el.paragraph.elements) {
          if (e.textRun?.content) text += e.textRun.content;
        }
      }
      const nextPos = pos + text.length;
      if (markerIdx >= pos && markerIdx < nextPos) {
        sourcesSectionStart = start + (markerIdx - pos);
        break;
      }
      pos = nextPos;
    }
  }

  return {
    namedRanges: doc.namedRanges || {},
    endIndex,
    sourcesSectionStart,
    sourcesSectionEnd: sourcesSectionStart != null && fullText.length >= markerIdx + SOURCES_HEADER.length
      ? sourcesSectionStart + SOURCES_HEADER.length + fullText.slice(markerIdx + SOURCES_HEADER.length).length
      : null,
    sourcesSectionText: sourcesSectionStart != null ? fullText.slice(markerIdx + SOURCES_HEADER.length) : null,
  };
}

/** Parse existing "Sources" section text into list of { page_title, domain }. */
function parseExistingSourcesSection(sourcesText) {
  const entries = [];
  const lines = sourcesText.split(/\n/);
  for (const line of lines) {
    const m = line.match(/^\d+\.\s+(.+)$/);
    if (!m) continue;
    const label = m[1].trim();
    if (!label) continue;
    const paren = label.lastIndexOf(' (');
    const closeParen = label.lastIndexOf(')');
    let page_title = label;
    let domain = '';
    if (paren !== -1 && closeParen > paren && closeParen === label.length - 1) {
      page_title = label.slice(0, paren).trim();
      domain = label.slice(paren + 2, closeParen).trim();
    }
    entries.push({ page_title: page_title || 'Untitled', domain });
  }
  return entries;
}

/**
 * Get existing Sources section info for auto-format on insert.
 */
export async function getSourcesSectionInfo(documentId, accessToken) {
  const { sourcesSectionStart, sourcesSectionEnd, sourcesSectionText } = await getDocumentWithNamedRanges(documentId, accessToken);
  const hasSourcesSection = sourcesSectionStart != null && sourcesSectionEnd != null;
  const existingEntries = hasSourcesSection && sourcesSectionText ? parseExistingSourcesSection(sourcesSectionText) : [];
  return {
    hasSourcesSection: !!hasSourcesSection,
    sourcesSectionStart: sourcesSectionStart ?? null,
    sourcesSectionEnd: sourcesSectionEnd ?? null,
    existingEntries,
  };
}

/**
 * Collect all SNIP_REF_* named ranges with their ranges.
 */
function collectSnipRefRanges(namedRanges) {
  const list = [];
  for (const [name, value] of Object.entries(namedRanges)) {
    if (!name || !name.startsWith(SNIP_REF_PREFIX)) continue;
    const snipId = name.slice(SNIP_REF_PREFIX.length);
    const entries = value?.namedRanges || (value?.ranges ? [{ ranges: value.ranges }] : []);
    const ranges = Array.isArray(entries) ? entries.flatMap((e) => e.ranges || []) : [];
    for (const r of ranges) {
      const start = r.startIndex;
      const end = r.endIndex;
      if (typeof start === 'number' && typeof end === 'number') {
        list.push({ name, snipId, startIndex: start, endIndex: end });
      }
    }
  }
  return list;
}

/**
 * Return true if (page_title, domain) is already in existingEntries.
 */
function isAlreadyInExisting(page_title, domain, existingEntries) {
  return existingEntries.some(
    (e) => (e.page_title || '').trim() === (page_title || '').trim() && (e.domain || '').trim() === (domain || '').trim()
  );
}

/**
 * Format References: replace inline source lines with superscript refs and append Sources list.
 * When the doc already has a Sources section, only existing entries are kept (no duplication from named ranges).
 */
export async function formatReferences(documentId, accessToken, fetchSnipsMetadata) {
  const { namedRanges, endIndex, sourcesSectionStart, sourcesSectionText } = await getDocumentWithNamedRanges(documentId, accessToken);
  const rangeList = collectSnipRefRanges(namedRanges);

  const existingEntries = sourcesSectionText ? parseExistingSourcesSection(sourcesSectionText) : [];

  if (rangeList.length === 0 && existingEntries.length === 0) {
    return { success: true, message: 'No references to format.', refsCount: 0 };
  }

  const requests = [];

  if (rangeList.length === 0) {
    return { success: true, message: 'No new references to format.', refsCount: existingEntries.length };
  }

  if (sourcesSectionStart != null && sourcesSectionStart < endIndex) {
    const deleteEnd = Math.max(sourcesSectionStart, endIndex - 1);
    if (deleteEnd > sourcesSectionStart) {
      requests.push({
        deleteContentRange: {
          range: { startIndex: sourcesSectionStart, endIndex: deleteEnd, segmentId: '' },
        },
      });
    }
  }

  const snipIds = [...new Set(rangeList.map((r) => r.snipId))];
  const metadataList = await fetchSnipsMetadata(snipIds);
  const metaById = new Map(metadataList.map((m) => [m.id, m]));

  const sortedByPosition = [...rangeList].sort((a, b) => a.startIndex - b.startIndex);
  const newUniqueSources = [];
  const sourceUrlToRefNumber = new Map();

  for (const r of sortedByPosition) {
    const meta = metaById.get(r.snipId);
    const page_title = (meta?.page_title || 'Untitled').trim();
    const domain = (meta?.domain || '').trim();
    const url = (meta?.source_url || '').trim() || null;

    if (existingEntries.length > 0 && isAlreadyInExisting(page_title, domain, existingEntries)) {
      continue;
    }
    if (sourceUrlToRefNumber.has(url)) continue;

    const refNumber = existingEntries.length + newUniqueSources.length + 1;
    sourceUrlToRefNumber.set(url, refNumber);
    newUniqueSources.push({
      refNumber,
      source_url: meta?.source_url ?? null,
      page_title: meta?.page_title ?? 'Untitled',
      domain: meta?.domain ?? null,
    });
  }

  const snipIdToRefNumber = new Map();
  for (const r of rangeList) {
    const meta = metaById.get(r.snipId);
    const page_title = (meta?.page_title || 'Untitled').trim();
    const domain = (meta?.domain || '').trim();
    const url = (meta?.source_url || '').trim() || null;

    if (existingEntries.length > 0 && isAlreadyInExisting(page_title, domain, existingEntries)) {
      const idx = existingEntries.findIndex((e) => (e.page_title || '').trim() === page_title && (e.domain || '').trim() === domain);
      if (idx !== -1) snipIdToRefNumber.set(r.snipId, idx + 1);
      continue;
    }
    const num = sourceUrlToRefNumber.get(url);
    if (num != null) snipIdToRefNumber.set(r.snipId, num);
  }

  const uniqueSources = [
    ...existingEntries.map((e, i) => ({ refNumber: i + 1, page_title: e.page_title, domain: e.domain, source_url: null })),
    ...newUniqueSources,
  ];

  const sortedRanges = [...rangeList].sort((a, b) => b.startIndex - a.startIndex);

  for (const r of sortedRanges) {
    const num = snipIdToRefNumber.get(r.snipId);
    if (num == null) continue;
    const insertText = '\u00A0[' + num + ']';
    requests.push({
      deleteContentRange: {
        range: { startIndex: r.startIndex, endIndex: r.endIndex, segmentId: '' },
      },
    });
    requests.push({
      insertText: {
        location: { index: r.startIndex },
        text: insertText,
      },
    });
    requests.push({
      updateTextStyle: {
        range: { startIndex: r.startIndex, endIndex: r.startIndex + insertText.length },
        textStyle: { baselineOffset: 'SUPERSCRIPT' },
        fields: 'baselineOffset',
      },
    });
  }

  const sourcesLines = ['\n\nSources\n\n'];
  let refNum = 1;
  for (const s of uniqueSources) {
    const title = (s.page_title || 'Untitled').trim();
    const domain = (s.domain || '').trim();
    const label = domain ? `${title} (${domain})` : title;
    const line = `${refNum}. ${label}\n`;
    sourcesLines.push(line);
    refNum++;
  }
  const sourcesText = sourcesLines.join('');

  requests.push({
    insertText: {
      endOfSegmentLocation: { segmentId: '' },
      text: sourcesText,
    },
  });

  for (const r of rangeList) {
    requests.push({
      deleteNamedRange: { name: r.name },
    });
  }

  const batchUrl = `${DOCS_API_BASE}/${documentId}:batchUpdate`;
  const batchRes = await fetch(batchUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests }),
  });

  if (batchRes.status === 401) throw new Error('SESSION_EXPIRED');
  if (!batchRes.ok) {
    const body = await batchRes.text();
    let message = `Docs API error: ${batchRes.status}`;
    try {
      const j = JSON.parse(body);
      if (j.error?.message) message = j.error.message;
    } catch (_) {}
    throw new Error(message);
  }

  // Ensure the Sources block is normal text (not superscript). Inserting at endOfSegmentLocation
  // can inherit the previous paragraph's superscript; reset baseline for the Sources range.
  const endUrl = `${DOCS_API_BASE}/${documentId}?fields=body.content(endIndex)`;
  const endRes = await fetch(endUrl, { method: 'GET', headers: { Authorization: `Bearer ${accessToken}` } });
  if (endRes.ok) {
    const endData = await endRes.json();
    const content = endData.body?.content || [];
    const newEndIndex = content.length === 0 ? 0 : Math.max(...content.map((c) => c.endIndex || 0));
    const sourcesStart = Math.max(1, newEndIndex - sourcesText.length);
    if (sourcesStart < newEndIndex) {
      await fetch(batchUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [{
            updateTextStyle: {
              range: { startIndex: sourcesStart, endIndex: newEndIndex },
              textStyle: { baselineOffset: 'NONE' },
              fields: 'baselineOffset',
            },
          }],
        }),
      });
    }
  }

  return {
    success: true,
    message: `Formatted ${rangeList.length} reference(s) into ${uniqueSources.length} source(s).`,
    refsCount: uniqueSources.length,
  };
}
