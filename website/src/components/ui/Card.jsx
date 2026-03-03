/**
 * Reusable card container: padding, border, radius, shadow. Use for feature cards, pricing, etc.
 */
import './Card.css';

export function Card({ children, className = '', as: Component = 'div', ...props }) {
  return (
    <Component className={`card ${className}`.trim()} {...props}>
      {children}
    </Component>
  );
}
