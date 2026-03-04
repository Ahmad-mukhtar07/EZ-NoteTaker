import { useState, useEffect } from 'react';

const defaultIds = ['hero', 'how-it-works', 'features', 'pricing', 'faq', 'cta', 'footer'];

/**
 * Returns the id of the section currently in view (for nav highlight).
 * The section whose top has passed the offset (from top of viewport) is active; last such in doc order wins.
 */
export function useScrollSpy(sectionIds = defaultIds, offsetTop = 100) {
  const [activeId, setActiveId] = useState('');

  useEffect(() => {
    const getActiveId = () => {
      let current = '';
      for (const id of sectionIds) {
        const el = document.getElementById(id);
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        if (top <= offsetTop) current = id;
      }
      return current || (sectionIds[0] ?? '');
    };

    const onScroll = () => {
      setActiveId((prev) => {
        const next = getActiveId();
        return next !== prev ? next : prev;
      });
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [sectionIds.join(','), offsetTop]);

  return activeId;
}
