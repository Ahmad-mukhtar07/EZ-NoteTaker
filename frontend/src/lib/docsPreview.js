/**
 * Fetch a Google Doc and parse body.content into formatted blocks (headings, lists, bold/italic, images).
 */

const DOCS_API_BASE = 'https://docs.googleapis.com/v1/documents';

/** Map API namedStyleType to a short style key for the UI. */
const NAMED_STYLE_MAP = {
  HEADING_1: 'heading1',
  HEADING_2: 'heading2',
  HEADING_3: 'heading3',
  HEADING_4: 'heading4',
  HEADING_5: 'heading5',
  HEADING_6: 'heading6',
  NORMAL_TEXT: 'normal',
  TITLE: 'title',
  SUBTITLE: 'subtitle',
};

function getImageUrlFromInlineObject(inlineObjects, inlineObjectId) {
  if (!inlineObjects || !inlineObjectId) return null;
  const obj = inlineObjects[inlineObjectId];
  const uri =
    obj?.inlineObjectProperties?.embeddedObject?.imageProperties?.sourceUri ||
    obj?.inlineObjectProperties?.embeddedObject?.imageProperties?.contentUri;
  return typeof uri === 'string' && uri.length > 0 ? uri : null;
}

/**
 * Extract formatted blocks: paragraphs with style (heading/normal), list flag, and inline content (text + bold/italic, images).
 * @returns {Array<{ type: 'paragraph', style: string, listItem: boolean, children: Array<{ type: 'text', value: string, bold?: boolean, italic?: boolean, underline?: boolean, strikethrough?: boolean } | { type: 'image', url: string }> } | { type: 'image', url: string }>}
 */
function extractBlocks(content, inlineObjects) {
  if (!Array.isArray(content)) return [];
  const blocks = [];
  for (const el of content) {
    const para = el.paragraph;
    if (!para) continue;

    const namedStyleType = para.paragraphStyle?.namedStyleType;
    const style = NAMED_STYLE_MAP[namedStyleType] ?? 'normal';
    const listItem = Boolean(para.bullet);

    const children = [];
    if (Array.isArray(para.elements)) {
      for (const elem of para.elements) {
        if (elem.textRun?.content !== undefined) {
          const value = elem.textRun.content;
          const ts = elem.textRun.textStyle || {};
          children.push({
            type: 'text',
            value,
            bold: ts.bold === true,
            italic: ts.italic === true,
            underline: ts.underline === true,
            strikethrough: ts.strikethrough === true,
          });
        }
        if (elem.inlineObjectElement?.inlineObjectId) {
          const url = getImageUrlFromInlineObject(inlineObjects, elem.inlineObjectElement.inlineObjectId);
          if (url) children.push({ type: 'image', url });
        }
      }
    }

    // Skip empty paragraphs (only newline/whitespace) unless they're list items (spacing)
    const hasContent = children.some(
      (c) => c.type === 'image' || (c.type === 'text' && c.value.trim() !== '')
    );
    if (hasContent || listItem) {
      blocks.push({ type: 'paragraph', style, listItem, children });
    }
  }
  return blocks;
}

/**
 * Fetch document with formatting (paragraph styles, bullets, text styles) and return title + blocks.
 */
export async function fetchDocPreview(documentId, accessToken) {
  const fields = [
    'title',
    'body.content(paragraph(elements(textRun(content,textStyle(bold,italic,underline,strikethrough)),inlineObjectElement(inlineObjectId)),paragraphStyle(namedStyleType),bullet))',
    'inlineObjects',
  ].join(',');
  const url = `${DOCS_API_BASE}/${documentId}?fields=${encodeURIComponent(fields)}`;
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
  const title = data.title ?? 'Untitled';
  const content = data.body?.content ?? [];
  const inlineObjects = data.inlineObjects ?? {};
  const blocks = extractBlocks(content, inlineObjects);
  return { title, blocks };
}
