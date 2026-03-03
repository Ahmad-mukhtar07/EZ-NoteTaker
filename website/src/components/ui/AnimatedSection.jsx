import { useInView } from '../../hooks/useInView';
import './AnimatedSection.css';

/**
 * Wraps content and adds a subtle entrance animation when the element scrolls into view.
 * Respects prefers-reduced-motion. Use around section content for fade-in / slide-up.
 */
export function AnimatedSection({ children, className = '', as: Component = 'div', ...props }) {
  const [ref, isInView] = useInView({ threshold: 0.05, rootMargin: '0px 0px -5% 0px', once: true });
  return (
    <Component
      ref={ref}
      className={`animated-section ${isInView ? 'animated-section--in-view' : ''} ${className}`.trim()}
      {...props}
    >
      {children}
    </Component>
  );
}
