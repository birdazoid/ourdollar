import Link from 'next/link';
import { siteConfig } from '@/site.config';

export function Nav() {
  return (
    <header className="nav">
      <div className="container nav-inner">
        <Link href="/" className="brand">
          <span className="brand-mark">◐</span>
          {siteConfig.name}
        </Link>
        <nav className="nav-links">
          <Link href="/#features" className="nav-hide-sm">
            Features
          </Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/privacy" className="nav-hide-sm">
            Privacy
          </Link>
          <Link href="/#get" className="nav-hide-sm">
            Get the app
          </Link>
        </nav>
      </div>
    </header>
  );
}
