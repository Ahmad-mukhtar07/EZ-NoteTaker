import { Button } from './ui/Button';
import { Container } from './ui/Container';
import './Hero.css';

export function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-heading">
      <Container className="hero__container">
        <div className="hero__content">
          <h1 id="hero-heading" className="hero__headline">
            Turn messy research into structured, source-backed Google Docs
          </h1>
          <p className="hero__support">
            Capture text and image snippets from any webpage and insert them straight into Google Docs—with clean, trackable sources and optional Pro reference formatting. One extension. Less friction.
          </p>
          <div className="hero__ctas">
            <Button as="a" href="#" variant="primary" size="lg" className="hero__cta hero__cta--primary">
              Get the Chrome Extension
            </Button>
            <Button as="a" href="#demo" variant="secondary" size="lg" className="hero__cta hero__cta--secondary">
              See How It Works
            </Button>
          </div>
        </div>
        <div className="hero__mockup-wrap">
          <div className="hero__mockup" aria-hidden>
            <div className="hero__mockup-chrome">
              <span className="hero__mockup-dots" aria-hidden>
                <span /><span /><span />
              </span>
              <span className="hero__mockup-bar">Product preview</span>
            </div>
            <div className="hero__mockup-content">
              <img
                src="https://picsum.photos/seed/docsourced-mockup/640/400"
                alt="Product preview placeholder — replace with extension screenshot"
                className="hero__mockup-img"
                width={640}
                height={400}
                loading="lazy"
              />
            </div>
          </div>
        </div>
      </Container>

      {/* Structured space for demo video or GIF — replace src/poster when you have final asset */}
      <div id="demo" className="hero__demo-slot" aria-label="Product demo">
        <Container>
          <h2 className="hero__demo-title">See it in action</h2>
          <div className="hero__demo-inner">
            <video
              className="hero__demo-video"
              controls
              poster="https://picsum.photos/seed/docsourced-demo/1280/720"
              preload="metadata"
              aria-label="Product demo video"
            >
              <source
                src="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4"
                type="video/mp4"
              />
              Your browser does not support the video tag.
            </video>
          </div>
        </Container>
      </div>
    </section>
  );
}
