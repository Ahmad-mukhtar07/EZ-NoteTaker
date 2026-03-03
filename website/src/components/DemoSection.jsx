import { Container } from './ui/Container';
import { Section } from './ui/Section';
import { demo } from '../content/placeholders';
import './DemoSection.css';

export function DemoSection() {
  return (
    <Section id="demo" className="demo-section">
      <Container>
        <h2 className="demo-section__title">{demo.title}</h2>
        <p className="demo-section__support">{demo.support}</p>
        <div className="demo-section__card">
          {/* Replace this placeholder with your video/GIF embed (e.g. <video>, <iframe>) */}
          <div className="demo-section__placeholder">
            <span className="demo-section__play" aria-hidden>
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
            <span className="demo-section__placeholder-label">{demo.placeholderLabel}</span>
            <span className="demo-section__placeholder-hint">{demo.placeholderHint}</span>
          </div>
        </div>
      </Container>
    </Section>
  );
}
