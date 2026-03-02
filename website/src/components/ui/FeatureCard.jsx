/**
 * Card for feature highlights: icon/title/description. Reusable for features grid.
 */
import './FeatureCard.css';

export function FeatureCard({ title, description, icon: Icon, className = '' }) {
  return (
    <article className={`feature-card ${className}`.trim()}>
      {Icon && (
        <div className="feature-card__icon" aria-hidden>
          <Icon />
        </div>
      )}
      <h3 className="feature-card__title">{title}</h3>
      {description && <p className="feature-card__description">{description}</p>}
    </article>
  );
}
