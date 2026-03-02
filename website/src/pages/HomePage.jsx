import { Container } from '../components/ui/Container';
import { Section } from '../components/ui/Section';
import './HomePage.css';

export function HomePage() {
  return (
    <>
      <Section variant="hero">
        <Container>
          <h1 className="home__title">DocSourced</h1>
          <p className="home__subtitle">
            Structured research in Google Docs. Capture, plug, and cite — with minimal friction.
          </p>
        </Container>
      </Section>
      <Section>
        <Container>
          <p className="home__placeholder">Landing content sections will go here.</p>
        </Container>
      </Section>
    </>
  );
}
