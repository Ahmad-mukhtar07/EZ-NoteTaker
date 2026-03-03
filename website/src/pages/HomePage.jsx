import { Container } from '../components/ui/Container';
import { Section } from '../components/ui/Section';
import { AnimatedSection } from '../components/ui/AnimatedSection';
import { Hero } from '../components/Hero';
import { HowItWorks } from '../components/HowItWorks';
import { Features } from '../components/Features';
import { DemoSection } from '../components/DemoSection';
import { Pricing } from '../components/Pricing';
import { FAQ } from '../components/FAQ';
import { CTASection } from '../components/CTASection';
import './HomePage.css';

export function HomePage() {
  return (
    <>
      <Hero />
      <AnimatedSection>
        <HowItWorks />
      </AnimatedSection>
      <AnimatedSection>
        <Features />
      </AnimatedSection>
      <AnimatedSection>
        <DemoSection />
      </AnimatedSection>
      <AnimatedSection>
        <Pricing />
      </AnimatedSection>
      <AnimatedSection>
        <FAQ />
      </AnimatedSection>
      <AnimatedSection>
        <CTASection />
      </AnimatedSection>
      <Section>
        <Container>
          <p className="home__placeholder">Landing content sections will go here.</p>
        </Container>
      </Section>
    </>
  );
}
