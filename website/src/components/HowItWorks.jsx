import { Container } from './ui/Container';
import { Section } from './ui/Section';
import { howItWorks } from '../content/placeholders';
import './HowItWorks.css';

const STEP_ICONS = [
  <svg key="1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" /></svg>,
  <svg key="2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M9 15l2 2 4-4" /></svg>,
  <svg key="3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 6h16M4 12h10M4 18h16M14 12l4 4 4-4" /></svg>,
  <svg key="4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>,
];

export function HowItWorks() {
  const steps = howItWorks.steps.map((step, i) => ({ ...step, icon: STEP_ICONS[i] }));

  return (
    <Section id="how-it-works" className="how-it-works">
      <Container>
        <p className="how-it-works__lead">{howItWorks.lead}</p>
        <h2 className="how-it-works__title">{howItWorks.title}</h2>
        <div className="how-it-works__grid" role="list">
          {steps.map((step) => (
            <article
              key={step.number}
              className="how-it-works__card"
              role="listitem"
            >
              <span className="how-it-works__number" aria-hidden>
                {step.number}
              </span>
              <div className="how-it-works__icon" aria-hidden>
                {step.icon}
              </div>
              <h3 className="how-it-works__card-title">{step.title}</h3>
              <p className="how-it-works__card-desc">{step.description}</p>
            </article>
          ))}
        </div>
      </Container>
    </Section>
  );
}
