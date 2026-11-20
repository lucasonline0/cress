import { useEffect, useRef, useState } from 'react';
import { Github, Menu, X } from 'lucide-react';
import { documentation, image, repository } from './site';

export function Header() {
  const header = useRef<HTMLElement>(null);
  const menu = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const sync = () => header.current?.classList.toggle('is-compact', window.scrollY > 72);
    sync();
    window.addEventListener('scroll', sync, { passive: true });
    return () => window.removeEventListener('scroll', sync);
  }, []);

  return (
    <>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <header
        ref={header}
        className="site-header"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && open) {
            setOpen(false);
            menu.current?.focus();
          }
        }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
        }}
      >
        <div className="nav-shell">
          <a className="brand" href="#top" aria-label="Cress home" onClick={() => setOpen(false)}>
            <img src={image('cress-mascot-black.png')} alt="" width="15" height="22" />
            <span aria-hidden="true">cress.</span>
          </a>
          <button
            ref={menu}
            className="menu-toggle"
            type="button"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="primary-navigation"
            onClick={() => setOpen(!open)}
          >
            {open ? <X aria-hidden size={20} /> : <Menu aria-hidden size={20} />}
          </button>
          <nav id="primary-navigation" aria-label="Primary navigation" data-open={open}>
            <a href="#features" onClick={() => setOpen(false)}>Features</a>
            <a href="#how-it-works" onClick={() => setOpen(false)}>How it works</a>
            <a href={documentation}>Documentation</a>
            <a className="github-link" href={repository} aria-label="GitHub">
              <Github size={19} aria-hidden />
              <span>GitHub</span>
            </a>
          </nav>
        </div>
      </header>
    </>
  );
}
