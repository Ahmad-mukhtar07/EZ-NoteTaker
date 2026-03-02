/**
 * Primary and secondary buttons with consistent sizing and accent.
 */
import './Button.css';

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  as: Component = 'button',
  ...props
}) {
  const variantClass = `btn--${variant}`;
  const sizeClass = `btn--${size}`;
  return (
    <Component
      className={`btn ${variantClass} ${sizeClass} ${className}`.trim()}
      {...props}
    >
      {children}
    </Component>
  );
}
