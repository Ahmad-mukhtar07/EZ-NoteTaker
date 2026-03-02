/**
 * Vertical section with consistent padding. Optional variant for hero/CTA.
 */
import './Section.css';

export function Section({ children, className = '', variant, as: Component = 'section', ...props }) {
  const variantClass = variant ? `section--${variant}` : '';
  return (
    <Component
      className={`section ${variantClass} ${className}`.trim()}
      {...props}
    >
      {children}
    </Component>
  );
}
