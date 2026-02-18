/**
 * Append highlighted quote and source to a Google Doc via Docs API batchUpdate.
 * Inserts in academic style: quoted paragraph, then "Source: [title](url)" and timestamp.
 * Uses endOfSegmentLocation to append (avoids index/segment mismatch with tabs).
 */

const DOCS_API_BASE = 'https://docs.googleapis.com/v1/documents';

/**
 * Get the end index of the document body (0-based, position after last character).
 * @param {string} documentId
 * @param {string} accessToken
 * @returns {Promise<number>}
 */
async function getDocumentEndIndex(documentId, accessToken) {
  const url = `${DOCS_API_BASE}/${documentId}?fields=body.content(endIndex)`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 401) {
    throw new Error('SESSION_EXPIRED');
  }
  if (!res.ok) {
    const body = await res.text();
    let message = `Docs API error: ${res.status}`;
    try {
      const json = JSON.parse(body);
      if (json.error?.message) message = json.error.message;
    } catch (_) {
      if (body) message += ` ${body.slice(0, 200)}`;
    }
    throw new Error(message);
  }

  const data = await res.json();
  const content = data.body?.content || [];
  return content.length === 0 ? 0 : Math.max(...content.map((c) => c.endIndex || 0));
}

/** Match bullet prefix: •, -, *, ·, ▪, ◦, or tab/space + same; strip it and return { content, isBullet }. */
const BULLET_PATTERN = /^[\s\t]*([•·▪◦\-*]\s+)/;
/** Match numbered prefix: "1. ", "2) ", "1) ", etc.; strip it and return { content, isNumbered }. */
const NUMBERED_PATTERN = /^[\s\t]*(\d+[.)]\s+)/;

/**
 * Parse selected text into lines; classify bullet/numbered and strip prefix for list lines.
 * @returns {{ textToInsert: string, bulletRanges: Array<{ start: number, end: number }>, numberedRanges: Array<{ start: number, end: number }> }}
 */
function parseSelectionForInsert(selectedText, sourceLabel, title, timeStr) {
  const lines = selectedText.split(/\n/);
  const parts = [];
  const bulletRanges = [];
  const numberedRanges = [];
  let offset = 1; // after leading \n

  for (const line of lines) {
    const bulletMatch = line.match(BULLET_PATTERN);
    const numberedMatch = !bulletMatch && line.match(NUMBERED_PATTERN);
    let content = line;
    let lineLen = line.length + 1; // +1 for \n

    if (bulletMatch) {
      content = line.replace(BULLET_PATTERN, '').trimStart();
      content = content || ' '; // avoid empty paragraph
      lineLen = content.length + 1;
      bulletRanges.push({ start: offset, end: offset + content.length + 1 }); // include trailing \n for paragraph
    } else if (numberedMatch) {
      content = line.replace(NUMBERED_PATTERN, '').trimStart();
      content = content || ' ';
      lineLen = content.length + 1;
      numberedRanges.push({ start: offset, end: offset + content.length + 1 });
    } else {
      content = content || ' ';
    }

    parts.push(content);
    offset += lineLen;
  }

  const quoteText = parts.join('\n');
  const fullText = '\n' + quoteText + sourceLabel + title + timeStr;
  return { textToInsert: fullText, bulletRanges, numberedRanges, quoteLen: quoteText.length };
}

/**
 * Insert highlighted text and source link into the connected Google Doc.
 * Preserves bullet and numbered list lines as Doc lists.
 */
export async function insertHighlightToDoc(documentId, accessToken, data) {
  const { selectedText, pageUrl, pageTitle, timestamp } = data;
  const title = pageTitle || 'Untitled';
  const text = selectedText || '';
  const sourceLabel = '\nSource: ';
  const timeStr = ` ${timestamp}`;

  const { textToInsert: fullText, bulletRanges, numberedRanges, quoteLen } = parseSelectionForInsert(
    text,
    sourceLabel,
    title,
    timeStr
  );

  const requests = [
    {
      insertText: {
        endOfSegmentLocation: { segmentId: '' },
        text: fullText,
      },
    },
  ];

  const batchUrl = `${DOCS_API_BASE}/${documentId}:batchUpdate`;
  let res = await fetch(batchUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests }),
  });

  if (res.status === 401) {
    throw new Error('SESSION_EXPIRED');
  }
  if (!res.ok) {
    const body = await res.text();
    let message = `Docs API error: ${res.status}`;
    try {
      const json = JSON.parse(body);
      if (json.error?.message) message = json.error.message;
    } catch (_) {
      if (body) message += ` ${body.slice(0, 200)}`;
    }
    throw new Error(message);
  }

  const endAfterInsert = await getDocumentEndIndex(documentId, accessToken);
  const insertStart = endAfterInsert - fullText.length;

  const extraRequests = [];

  if (bulletRanges.length > 0) {
    const first = bulletRanges[0];
    const last = bulletRanges[bulletRanges.length - 1];
    extraRequests.push({
      createParagraphBullets: {
        range: {
          startIndex: insertStart + first.start,
          endIndex: insertStart + last.end,
        },
        bulletPreset: 'BULLET_DISC_CIRCLE_SQUARE',
      },
    });
  }
  if (numberedRanges.length > 0) {
    const first = numberedRanges[0];
    const last = numberedRanges[numberedRanges.length - 1];
    extraRequests.push({
      createParagraphBullets: {
        range: {
          startIndex: insertStart + first.start,
          endIndex: insertStart + last.end,
        },
        bulletPreset: 'NUMBERED_DECIMAL_ALPHA_ROMAN',
      },
    });
  }

  if (extraRequests.length > 0) {
    res = await fetch(batchUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests: extraRequests }),
    });
    if (res.status === 401) throw new Error('SESSION_EXPIRED');
    if (!res.ok) {
      const body = await res.text();
      let message = `Docs API error: ${res.status}`;
      try {
        const json = JSON.parse(body);
        if (json.error?.message) message = json.error.message;
      } catch (_) {
        if (body) message += ` ${body.slice(0, 200)}`;
      }
      throw new Error(message);
    }
  }

  const textLen = fullText.length;
  const sourceStart = endAfterInsert - textLen + 1 + quoteLen + sourceLabel.length;
  const sourceEnd = sourceStart + title.length;
  const linkRequests = [
    {
      updateTextStyle: {
        range: { startIndex: sourceStart, endIndex: sourceEnd },
        textStyle: { link: { url: pageUrl || '#' } },
        fields: 'link',
      },
    },
  ];

  res = await fetch(batchUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests: linkRequests }),
  });

  if (res.status === 401) {
    throw new Error('SESSION_EXPIRED');
  }
  if (!res.ok) {
    const body = await res.text();
    let message = `Docs API error: ${res.status}`;
    try {
      const json = JSON.parse(body);
      if (json.error?.message) message = json.error.message;
    } catch (_) {
      if (body) message += ` ${body.slice(0, 200)}`;
    }
    throw new Error(message);
  }
}

/**
 * Insert an inline image and source caption into the Google Doc.
 * @param {string} documentId - Google Doc id
 * @param {string} accessToken - OAuth access token
 * @param {{ imageUrl: string, imageWidthPt: number, imageHeightPt: number, pageUrl: string, pageTitle: string, timestamp: string }} data
 */
export async function insertImageWithSource(documentId, accessToken, data) {
  const { imageUrl, imageWidthPt, imageHeightPt, pageUrl, pageTitle, timestamp } = data;
  const title = pageTitle || 'Untitled';
  const sourceText = '\nSource: ' + title + ' ' + timestamp;

  const requests = [
    {
      insertInlineImage: {
        uri: imageUrl,
        objectSize: {
          width: { magnitude: imageWidthPt, unit: 'PT' },
          height: { magnitude: imageHeightPt, unit: 'PT' },
        },
        endOfSegmentLocation: { segmentId: '' },
      },
    },
    {
      insertText: {
        endOfSegmentLocation: { segmentId: '' },
        text: sourceText,
      },
    },
  ];

  const batchUrl = `${DOCS_API_BASE}/${documentId}:batchUpdate`;
  let res = await fetch(batchUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests }),
  });

  if (res.status === 401) {
    throw new Error('SESSION_EXPIRED');
  }
  if (!res.ok) {
    const body = await res.text();
    let message = `Docs API error: ${res.status}`;
    try {
      const json = JSON.parse(body);
      if (json.error?.message) message = json.error.message;
    } catch (_) {
      if (body) message += ` ${body.slice(0, 200)}`;
    }
    throw new Error(message);
  }

  const endAfterInsert = await getDocumentEndIndex(documentId, accessToken);
  const sourceLen = sourceText.length;
  const linkStart = endAfterInsert - sourceLen + 9;
  const linkEnd = linkStart + title.length;
  const linkRequests = [
    {
      updateTextStyle: {
        range: { startIndex: linkStart, endIndex: linkEnd },
        textStyle: { link: { url: pageUrl || '#' } },
        fields: 'link',
      },
    },
  ];

  res = await fetch(batchUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests: linkRequests }),
  });

  if (res.status === 401) {
    throw new Error('SESSION_EXPIRED');
  }
  if (!res.ok) {
    const body = await res.text();
    let message = `Docs API error: ${res.status}`;
    try {
      const json = JSON.parse(body);
      if (json.error?.message) message = json.error.message;
    } catch (_) {
      if (body) message += ` ${body.slice(0, 200)}`;
    }
    throw new Error(message);
  }
}
