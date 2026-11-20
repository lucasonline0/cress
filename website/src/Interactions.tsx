import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { documentation, repository } from './site';

export function Reveal({ children, className = '', delay = 0 }: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || !('IntersectionObserver' in window)) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (element.getBoundingClientRect().top < window.innerHeight) return;

    element.dataset.reveal = 'pending';
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      element.dataset.reveal = 'visible';
      observer.disconnect();
    }, { threshold: 0.05 });
    observer.observe(element);
    return () => {
      observer.disconnect();
      delete element.dataset.reveal;
    };
  }, []);

  return (
    <div ref={ref} className={`reveal ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

export function AnimatedLine({ text, offset = 0 }: { text: string; offset?: number }) {
  let index = offset;
  return (
    <span className="animated-line" aria-hidden="true">
      {text.split(' ').map((word, position) => (
        <span className="animated-word" key={word}>
          {position > 0 && ' '}
          {Array.from(word, (character) => {
            const order = index++;
            return <span className="hero-character" key={order} style={{ '--order': order } as CSSProperties}>{character}</span>;
          })}
        </span>
      ))}
    </span>
  );
}

export function Demo() {
  const [after, setAfter] = useState(false);
  return (
    <Reveal className="demo">
      <div className="demo-controls" role="group" aria-label="Choose a code revision">
        <button type="button" aria-pressed={!after} onClick={() => setAfter(false)}>Before</button>
        <button type="button" aria-pressed={after} onClick={() => setAfter(true)}>After</button>
      </div>
      <div className="demo-body">
        <div className="demo-code">
          <pre key={String(after)} aria-label={after ? 'Working tree code' : 'Baseline code'}><code>
            <span className="code-line"><span aria-hidden="true">1</span>@Get(<i>'users'</i>)</span>
            {!after && <span className="code-line"><span aria-hidden="true">2</span>@Roles(<i>'ADMIN'</i>)</span>}
            <span className="code-line"><span aria-hidden="true">{after ? 2 : 3}</span>findAll() {'{'}</span>
            <span className="code-line"><span aria-hidden="true">{after ? 3 : 4}</span><b>{'  // ...'}</b></span>
            <span className="code-line"><span aria-hidden="true">{after ? 4 : 5}</span>{'}'}</span>
          </code></pre>
        </div>
        <div className="demo-result" role="status">
          <p className="eyebrow">Cress result</p>
          <strong>Declared role restriction removed.</strong>
          <p>Effective access remains unknown. Review required.</p>
        </div>
      </div>
    </Reveal>
  );
}

const questions: { question: string; answer: ReactNode }[] = [
  {
    question: 'What is Cress?',
    answer: 'Cress is a technical alpha for examining NestJS authorization declarations and comparing them with a local Git baseline. It includes a desktop access explorer and a CLI.',
  },
  {
    question: 'Is Cress open source?',
    answer: <>Yes. Cress is released under the <a href={repository + '/blob/main/LICENSE'}>MIT license</a>.</>,
  },
  {
    question: 'Does Cress upload my code?',
    answer: 'No. The analyzer reads project files on your machine. Git comparisons use local revisions and do not fetch from remotes.',
  },
  {
    question: 'Does Cress detect vulnerabilities?',
    answer: 'No. Cress reports declarations it observes in source. It does not execute the application, establish effective runtime access, or prove that an endpoint is public or vulnerable.',
  },
  {
    question: 'Which frameworks are supported?',
    answer: 'The current analyzer is designed for NestJS projects written in TypeScript. Dynamic expressions and custom decorator behavior can require manual review.',
  },
  {
    question: 'How do I get started?',
    answer: <>Follow the <a href={documentation}>repository README</a> for desktop builds and instructions for running the CLI from source.</>,
  },
  {
    question: 'Can I contribute?',
    answer: <>Yes. Start with the <a href={repository + '/blob/main/CONTRIBUTING.md'}>contribution guide</a> on GitHub.</>,
  },
];

export function FaqList() {
  const [active, setActive] = useState<number | null>(null);
  return (
    <Reveal className="faq-list">
      {questions.map(({ question, answer }, index) => {
        const expanded = active === index;
        const id = `faq-answer-${index}`;
        return (
          <div className="faq-item" key={question}>
            <h3>
              <button type="button" aria-expanded={expanded} aria-controls={id}
                onClick={() => setActive(expanded ? null : index)}>
                {question}<Plus aria-hidden size={13} />
              </button>
            </h3>
            <div id={id} className="faq-answer" aria-hidden={!expanded} inert={!expanded}>
              <div><p>{answer}</p></div>
            </div>
          </div>
        );
      })}
    </Reveal>
  );
}
