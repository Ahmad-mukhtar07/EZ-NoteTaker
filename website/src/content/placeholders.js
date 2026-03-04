/**
 * DocSourced landing content. Product name and tagline are used site-wide.
 * Section copy reflects the extension: capture text/image snips from the web,
 * plug into a connected Google Doc with source links; Pro adds Format References
 * and multi-document support.
 */

/** Product name and tagline (extension branding) */
export const productName = 'DocSourced';
export const productTagline = 'Snip from the web, plug into Google Docs—every insert with a linked source.';

export const hero = {
  headline: productName,
  support: productTagline,
  ctaPrimary: 'Get the Chrome Extension',
  ctaSecondary: 'See How It Works',
  mockupAlt: 'DocSourced extension — capture and format research in Google Docs',
  mockupImageUrl: '../../public/DocSourced-coverpng.png',
};

export const heroDemoSlot = {
  title: 'See DocSourced in action',
  youtubeVideoId: 'bezXrhutj6I',
  placeholderLabel: 'Demo video or GIF',
  placeholderHint: 'Watch how to capture snippets and plug them into your Google Doc with linked sources.',
};

export const howItWorks = {
  lead: 'Turn any webpage into structured research in your Google Doc. Connect a doc, capture snips, and plug them in with one click—each with a clean, hyperlinked source line.',
  title: 'How it works',
  steps: [
    {
      number: 1,
      title: 'Connect a Google Doc',
      description: 'Link DocSourced to the Google Doc you’re building. Your doc becomes a structured research workspace; every snip stays tied to its source.',
    },
    {
      number: 2,
      title: 'Capture text or image snips',
      description: 'Select text or capture an image from any webpage. The extension stores the snip and metadata (source URL, page title, domain) so you can plug it in later.',
    },
    {
      number: 3,
      title: 'Plug snips into your doc',
      description: 'Insert snips into your doc with one click. Each insert gets a clean, hyperlinked source line. Snips are grouped per document so you can see “Sources Used in This Document” by domain.',
    },
    {
      number: 4,
      title: 'Format references (Pro)',
      description: 'Pro users can run “Format References” to replace inline source lines with superscript citation numbers and a deduplicated Sources section at the bottom—publication-ready in one click.',
    },
  ],
};

export const features = {
  title: 'Built for research that flows',
  subtitle: 'Capture from the web, plug into Google Docs, and keep every source linked and organized.',
  items: [
    {
      id: '1',
      tier: 'free',
      title: 'Capture text & images',
      description: 'Snip text snippets or images from any webpage. Metadata (source URL, page title, domain) is stored so each insert gets a clean source line.',
    },
    {
      id: '2',
      tier: 'free',
      title: 'Insert with source links',
      description: 'Plug snips into your connected Google Doc with one click. Every insert includes a hyperlinked source line; named ranges in the doc map to your Supabase-backed snip records.',
    },
    {
      id: '3',
      tier: 'free',
      title: 'Undo last insert',
      description: 'Remove the most recent plug (including its source line) from your doc with one click. You stay in control of every change.',
    },
    {
      id: '4',
      tier: 'pro',
      title: 'Sources panel per document',
      description: 'View “Sources Used in This Document” organized by domain. Snip history is grouped per doc so you can see what you’ve captured and where it came from.',
    },
    {
      id: '5',
      tier: 'pro',
      title: 'Format References',
      description: 'Scan the doc, detect source markers, replace inline source lines with superscript citation numbers, deduplicate by URL, and generate a consolidated Sources section at the bottom.',
    },
    {
      id: '6',
      tier: 'pro',
      title: 'Multi-document support',
      description: 'Connect multiple Google Docs and switch between them in the extension. Each doc keeps its own snip history and sources panel.',
    },
  ],
};

export const demo = {
  title: 'See it in action',
  support: 'Watch how to capture snippets from any page and plug them into your Google Doc with linked sources—and how Pro turns them into formatted references.',
  placeholderLabel: 'Demo video or GIF',
  placeholderHint: 'Add your walkthrough video or GIF here.',
};
