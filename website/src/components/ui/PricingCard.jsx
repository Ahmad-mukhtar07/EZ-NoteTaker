/**
 * Pricing tier card: name, price, description, features list, CTA.
 */
import './PricingCard.css';

export function PricingCard({
  name,
  price,
  period = '/month',
  description,
  features = [],
  ctaLabel,
  ctaHref,
  highlighted = false,
  className = '',
}) {
  const cta = ctaLabel && (
    <a
      href={ctaHref || '#'}
      className={`pricing-card__cta btn btn--md ${highlighted ? 'btn--primary' : 'btn--secondary'}`}
    >
      {ctaLabel}
    </a>
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
