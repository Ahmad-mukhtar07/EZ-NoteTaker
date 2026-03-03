import { useState } from 'react';
import { Container } from './ui/Container';
import { Section } from './ui/Section';
import './FAQ.css';

const items = [
  {
    id: 'edit-automatically',
    question: 'Does this edit my Google Doc automatically?',
    answer: 'No. We only insert content when you choose to—for example, when you click "Plug it in" or "Snip and Plug" and pick a place in the doc. The extension never changes your document without your action.',
  },
  {
    id: 'undo-inserts',
    question: 'Can I undo inserts?',
    answer: 'Yes. Use "Undo Last Insert" in the extension to remove the most recent plug or snip (including its source line) from your document. You stay in control.',
  },
  {
    id: 'references',
    question: 'How are references handled?',
    answer: 'Every insert gets a clean source line (linked to the original page). Pro users can run "Format References" to replace inline sources with superscript numbers and a deduplicated Sources section at the bottom of the doc.',
  },
  {
    id: 'data-security',
    question: 'Is my data stored securely?',
    answer: 'Snip metadata (URLs, titles, etc.) is stored in Supabase with authentication. We don’t read or store your full document content. Image snips are stored in your own Google Drive.',
  },
  {
    id: 'multiple-docs',
    question: 'Can I use multiple documents?',
    answer: 'Free users can connect one Google Doc at a time. Pro users can connect multiple docs and switch between them instantly in the extension.',
  },
  {
    id: 'pro-features',
    question: 'What features are Pro-only?',
    answer: 'Pro includes multi-document support, Format References, Snip History (view and reinsert past snips), and unlimited snips per month. Free includes one doc, 25 snips/month, source links, and Undo Last Insert.',
  },
];

export function FAQ() {
  const [openId, setOpenId] = useState(null);

  const toggle = (id) => {
    setOpenId((current) => (current === id ? null : id));
  };

  return (
    <Section id="faq" className="faq-section">
      <Container>
        <h2 className="faq-section__title">Frequently asked questions</h2>
        <p className="faq-section__support">
          Everything you need to know about the extension.
        </p>
        <div className="faq-section__list" role="list">
          {items.map((item) => {
            const isOpen = openId === item.id;
            return (
              <div
                key={item.id}
                className={`faq-section__item ${isOpen ? 'faq-section__item--open' : ''}`}
                role="listitem"
              >
                <button
                  type="button"
                  className="faq-section__trigger"
                  onClick={() => toggle(item.id)}
                  aria-expanded={isOpen}
                  aria-controls={`faq-answer-${item.id}`}
                  id={`faq-question-${item.id}`}
                >
                  <span className="faq-section__question">{item.question}</span>
                  <span className="faq-section__icon" aria-hidden>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </span>
                </button>
                <div
                  id={`faq-answer-${item.id}`}
                  className="faq-section__answer-wrap"
                  role="region"
                  aria-labelledby={`faq-question-${item.id}`}
                  hidden={!isOpen}
                >
                  <p className="faq-section__answer">{item.answer}</p>
                </div>
              </div>
            );
          })}
        </div>
      </Container>
    </Section>
  );
}
