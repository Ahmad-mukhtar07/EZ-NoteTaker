import { Container } from './ui/Container';
import { Section } from './ui/Section';
import { features as featuresContent } from '../content/placeholders';
import './Features.css';

const FEATURE_ICONS = [
  <svg key="1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" /></svg>,
  <svg key="2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>,
  <svg key="3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>,
  <svg key="4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 10h10a5 5 0 0 1 5 5v2M3 10l4-4M3 10l4 4" /></svg>,
  <svg key="5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M4 13h6M4 17h6M14 13h2M14 17h2" /></svg>,
  <svg key="6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 6h16M4 12h10M4 18h16M16 12l3 3-3 3M19 15v-6" /></svg>,
];

export function Features() {
  const features = featuresContent.items.map((item, i) => ({ ...item, icon: FEATURE_ICONS[i] }));

  return (
    <Section id="features" className="features">
      <Container>
        <h2 className="features__title">{featuresContent.title}</h2>
        <p className="features__subtitle">{featuresContent.subtitle}</p>
        <div className="features__grid" role="list">
          {features.map((feature) => (
            <article
              key={feature.id}
              className={`features__card features__card--${feature.tier}`}
              role="listitem"
            >
              <span className={`features__badge features__badge--${feature.tier}`}>
                {feature.tier === 'pro' ? 'Pro' : 'Free'}
              </span>
              <div className="features__icon" aria-hidden>
                {feature.icon}
              </div>
              <h3 className="features__card-title">{feature.title}</h3>
              <p className="features__card-desc">{feature.description}</p>
            </article>
          ))}
        </div>
      </Container>
    </Section>
  );
}
