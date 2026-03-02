# DocSourced marketing website

Production-ready React + Vite landing page for the DocSourced Chrome extension. Mobile-first, minimal design system, reusable components.

## Setup

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Build

```bash
npm run build
```

Output in `dist/`. Preview with `npm run preview`.

## Structure

- `src/components/layout/` — Navbar, Footer, Layout (global shell)
- `src/components/ui/` — Button, Container, Section, FeatureCard, PricingCard
- `src/pages/` — Route-level pages (HomePage)
- `src/styles/` — Design tokens (`tokens.css`), base styles (`index.css`)

Design system: neutral palette + teal accent, DM Sans, 4px spacing scale. Add sections and content as needed; layout and components are ready for scaling.
