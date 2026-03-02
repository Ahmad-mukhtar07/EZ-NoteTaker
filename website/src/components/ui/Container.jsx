/**
 * Max-width container with responsive horizontal padding.
 */
import './Container.css';

export function Container({ children, className = '', as: Component = 'div', ...props }) {
  return (
    <Component
      className={`container ${className}`.trim()}
      {...props}
    >
      {children}
    </Component>
  );
}
