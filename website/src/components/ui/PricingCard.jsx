/**
 * Pricing tier card: name, price, description, features list, CTA.
 */
import { Link } from 'react-router-dom';
import './PricingCard.css';

export function PricingCard({
  name,
  price,
  period = '/month',
  description,
  features = [],
  ctaLabel,
  ctaHref,
  onCtaClick,
  highlighted = false,
  className = '',
}) {
  const baseClass = `pricing-card__cta btn btn--md ${highlighted ? 'btn--primary' : 'btn--secondary'}`;
  const cta = ctaLabel && (
    onCtaClick
      ? (
          <button type="button" className={baseClass} onClick={onCtaClick}>
            {ctaLabel}
          </button>
        )
      : ctaHref?.startsWith('/')
        ? (
            <Link to={ctaHref} className={baseClass}>
              {ctaLabel}
            </Link>
          )
        : (
            <a href={ctaHref || '#'} className={baseClass}>
              {ctaLabel}
            </a>
          )
  );

  return (
    <article
      className={`pricing-card ${highlighted ? 'pricing-card--highlighted' : ''} ${className}`.trim()}
    >
      <h3 className="pricing-card__name">{name}</h3>
      <div className="pricing-card__price">
        <span className="pricing-card__amount">{price}</span>
        {period && <span className="pricing-card__period">{period}</span>}
      </div>
      {description && <p className="pricing-card__description">{description}</p>}
      {features.length > 0 && (
        <ul className="pricing-card__features" role="list">
          {features.map((feature, i) => (
            <li key={i} className="pricing-card__feature">
              {feature}
            </li>
          ))}
        </ul>
      )}
      {cta && <div className="pricing-card__cta-wrap">{cta}</div>}
    </article>
  );
}
