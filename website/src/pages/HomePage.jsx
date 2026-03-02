import { Container } from '../components/ui/Container';
import { Section } from '../components/ui/Section';
import { Hero } from '../components/Hero';
import './HomePage.css';

export function HomePage() {
  return (
    <>
      <Hero />
      <Section>
        <Container>
          <p className="home__placeholder">Landing content sections will go here.</p>
        </Container>
      </Section>
    </>
  );
}
