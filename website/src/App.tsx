import { ArrowRight, CodeXml, FileText, GitCompare, List, Shield } from 'lucide-react';
import { Header } from './Header';
import { AnimatedLine, Demo, FaqList, Reveal } from './Interactions';
import { documentation, image, repository } from './site';

function Button({ href, children, secondary = false }: {
  href: string;
  children: string;
  secondary?: boolean;
}) {
  return (
    <a className={`button ${secondary ? 'button-secondary' : ''}`} href={href}>
      {children}{!secondary && <ArrowRight aria-hidden size={13} />}
    </a>
  );
}

function Hero() {
  return (
    <section className="hero" id="top">
      <img className="hero-art" src={image('hero-landscape.webp')} alt="" fetchPriority="high" />
      <div className="hero-copy content">
        <p className="eyebrow">An open-source tool for API access review</p>
        <h1 aria-label="Make access understandable.">
          <AnimatedLine text="Make access" />
          <em><AnimatedLine text="understandable." offset={10} /></em>
        </h1>
        <p className="hero-description">
          Explore API routes and authorization declarations across supported frameworks. Review what changed. Keep your code local.
        </p>
        <div className="actions">
          <Button href={documentation}>Get Cress</Button>
          <Button href="#how-it-works" secondary>Explore Cress</Button>
        </div>
      </div>
    </section>
  );
}

function Introduction() {
  return (
    <section className="intro content" aria-labelledby="intro-heading">
      <Reveal>
        <p className="eyebrow">The problem</p>
        <h2 id="intro-heading">Authorization is rarely <em>in one place.</em></h2>
        <p className="intro-description">
          Authorization logic can be scattered across routes, middleware, guards, roles, and application code. Cress brings
          these declarations into a clearer view, helping you understand what&apos;s defined and what changed.
        </p>
        <ul className="tags" aria-label="Project characteristics">
          {['NestJS', 'Next.js', 'Go / Chi', 'Local-first', 'Open source'].map((tag) => <li key={tag}>{tag}</li>)}
        </ul>
      </Reveal>
    </section>
  );
}

const steps = [
  ['Point to your code', 'Open a local project and let Cress discover supported API frameworks.'],
  ['Explore declarations', 'Inspect recognized routes, guards, middleware, roles, and source locations.'],
  ['Review changes', 'Compare declarations against local Git revisions and export readable reports.'],
];

function HowItWorks() {
  return (
    <section className="content ruled split workflow" id="how-it-works" aria-labelledby="workflow-heading">
      <Reveal className="section-title">
        <p className="eyebrow">How it works</p>
        <h2 id="workflow-heading">A clearer way <em>to review access.</em></h2>
      </Reveal>
      <ol className="steps">
        {steps.map(([title, description], index) => (
          <li key={title}>
            <Reveal delay={index * 75}>
              <img src={image(`step-0${index + 1}.webp`)} width="165" height="107" alt="" loading="lazy" decoding="async" />
              <div className="step-copy">
                <h3><span>0{index + 1}.</span> {title}</h3>
                <p>{description}</p>
              </div>
            </Reveal>
          </li>
        ))}
      </ol>
    </section>
  );
}

const features = [
  { icon: List, title: 'Route inventory', description: 'Discover recognized API endpoints across supported frameworks.' },
  { icon: Shield, title: 'Guards and middleware', description: 'Inspect observed guards, roles, middleware, and authorization-related declarations.' },
  { icon: CodeXml, title: 'Source traceability', description: 'Trace findings back to their source files and line numbers.' },
  { icon: GitCompare, title: 'Git comparison', description: 'Review declaration changes between local Git revisions.' },
  { icon: FileText, title: 'Offline reports', description: 'Export structured JSON and standalone HTML reports.' },
];

function Features() {
  return (
    <section className="content ruled split features" id="features" aria-labelledby="features-heading">
      <Reveal className="section-title">
        <p className="eyebrow">Features</p>
        <h2 id="features-heading">More than a <em>list of routes.</em></h2>
      </Reveal>
      <ul className="feature-list">
        {features.map(({ icon: Icon, title, description }) => (
          <li key={title}>
            <Reveal>
              <span className="feature-icon"><Icon aria-hidden size={16} strokeWidth={1.8} /></span>
              <h3>{title}</h3>
              <p>{description}</p>
            </Reveal>
          </li>
        ))}
      </ul>
    </section>
  );
}


function DesktopPreview() {
  return (
    <section className="content ruled split desktop-preview" id="desktop-app" aria-labelledby="desktop-heading">
      <Reveal className="section-title">
        <p className="eyebrow">The desktop app</p>
        <h2 id="desktop-heading">Explore access <em>at the source.</em></h2>
        <p className="desktop-intro">
          Open a local project, inspect recognized routes and authorization declarations,
          then review changes without running your application.
        </p>
        <div className="desktop-links"><Button href={documentation}>Get Cress</Button></div>
      </Reveal>
      <Reveal className="desktop-window" delay={80}>
        <img
          src={image('access-explorer.png')}
          width="1280"
          height="754"
          loading="lazy"
          decoding="async"
          alt="Real Cress Desktop access explorer showing NestJS API routes, source locations, observed guards and roles, and review warnings"
        />
        <p>Actual desktop application · NestJS example project</p>
      </Reveal>
    </section>
  );
}

function LocalFirst() {
  return (
    <section className="local-first" aria-labelledby="local-heading">
      <img src={image('local-first-landscape.webp')} alt="" loading="lazy" decoding="async" />
      <div className="content local-content">
        <Reveal>
          <p className="eyebrow">Local-first</p>
          <h2 id="local-heading">Your code. <em>Your machine.</em></h2>
          <p>Cress runs locally, with no account, no hosted backend, and no project-source uploads. Your code stays with you.</p>
          <Button href={documentation}>Learn more</Button>
        </Reveal>
      </div>
    </section>
  );
}

function Closing() {
  return (
    <section className="closing content" aria-labelledby="closing-heading">
      <Reveal>
        <p className="eyebrow">Get started</p>
        <h2 id="closing-heading">Stop guessing. <em>Start understanding.</em></h2>
        <div className="actions">
          <Button href={documentation}>Get Cress</Button>
          <Button href={repository} secondary>View on GitHub</Button>
        </div>
      </Reveal>
    </section>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <img className="footer-art" src={image('footer-landscape.webp')} alt="" loading="lazy" decoding="async" />
      <div className="footer-content">
        <Reveal className="footer-wordmark"><a href="#top" aria-label="Cress home">cress.</a></Reveal>
        <nav aria-label="Footer navigation">
          <a href={repository}>GitHub</a>
          <a href={documentation}>Documentation</a>
          <a href={repository + '/blob/main/LICENSE'}>License</a>
        </nav>
      </div>
    </footer>
  );
}

export function App() {
  return (
    <>
      <Header />
      <main id="main-content" tabIndex={-1}>
        <Hero />
        <Introduction />
        <HowItWorks />
        <Features />
        <DesktopPreview />
        <LocalFirst />
        <section className="content split demonstration" aria-labelledby="demo-heading">
          <Reveal className="section-title">
            <p className="eyebrow">Demonstration</p>
            <h2 id="demo-heading">See what <em>changed.</em></h2>
          </Reveal>
          <Demo />
        </section>
        <section className="content ruled split faq" aria-labelledby="faq-heading">
          <Reveal className="section-title">
            <p className="eyebrow">FAQ</p>
            <h2 id="faq-heading">Frequently<br /> asked <em>questions.</em></h2>
          </Reveal>
          <FaqList />
        </section>
        <Closing />
      </main>
      <Footer />
    </>
  );
}
