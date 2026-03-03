import { useState, useEffect, useRef } from 'react';

/**
 * Returns true when the element is in view (with optional threshold and rootMargin).
 * Use for scroll-triggered entrance animations.
 * @param {Object} options
 * @param {number} [options.threshold=0.1] — ratio of element visible (0–1)
 * @param {string} [options.rootMargin='0px 0px -10% 0px'] — offset from viewport
 * @param {boolean} [options.once=true] — only trigger once when first in view
 */
export function useInView(options = {}) {
  const { threshold = 0.1, rootMargin = '0px 0px -10% 0px', once = true } = options;
  const [isInView, setIsInView] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          if (once && el) observer.unobserve(el);
        } else if (!once) {
          setIsInView(false);
        }
      },
      { threshold, rootMargin }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, rootMargin, once]);

  return [ref, isInView];
}
