import { useState } from 'react';
import './Accordion.css';

/**
 * Reusable accordion: single or multiple items open. Use for FAQ, details lists.
 * @param {{ items: Array<{ id: string, question: string, answer: string }>, allowMultiple?: boolean }}
 */
export function Accordion({ items, allowMultiple = false }) {
  const [openIds, setOpenIds] = useState(() => (allowMultiple ? [] : null));

  const isOpen = (id) =>
    allowMultiple ? openIds.includes(id) : openIds === id;

  const toggle = (id) => {
    if (allowMultiple) {
      setOpenIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      );
    } else {
      setOpenIds((prev) => (prev === id ? null : id));
    }
  };

  return (
    <div className="accordion" role="list">
      {items.map((item) => {
        const open = isOpen(item.id);
        return (
          <div
            key={item.id}
            className={`accordion__item ${open ? 'accordion__item--open' : ''}`}
            role="listitem"
          >
            <button
              type="button"
              className="accordion__trigger"
              onClick={() => toggle(item.id)}
              aria-expanded={open}
              aria-controls={`accordion-answer-${item.id}`}
              id={`accordion-question-${item.id}`}
            >
              <span className="accordion__question">{item.question}</span>
              <span className="accordion__icon" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </span>
            </button>
            <div
              id={`accordion-answer-${item.id}`}
              className="accordion__answer-wrap"
              role="region"
              aria-labelledby={`accordion-question-${item.id}`}
              hidden={!open}
            >
              <div className="accordion__answer">{item.answer}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
