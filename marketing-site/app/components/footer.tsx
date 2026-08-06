import Image from 'next/image';
import Link from 'next/link';
import { siteConfig } from '@/site.config';

export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div>
          <Link href="/" className="brand" style={{ fontSize: 19 }}>
            <span className="brand-mark" style={{ width: 28, height: 28 }}>
              <Image src="/brand/ourdollar-logo.svg" alt="" width={15} height={15} />
            </span>
            {siteConfig.name}
          </Link>
          <p style={{ margin: '10px 0 0', maxWidth: '34ch' }}>
            <small>
              A private, calm way to budget with the people you share money with.
              Not a bank. Not financial advice.
            </small>
          </p>
        </div>
        <nav className="footer-links">
          <Link href="/pricing">Pricing</Link>
          <Link href="/support">Support</Link>
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms of Service</Link>
        </nav>
      </div>
      <div className="container" style={{ marginTop: 24 }}>
        <small>
          © {new Date().getFullYear()} {siteConfig.name}. All rights reserved.
        </small>
      </div>
    </footer>
  );
}
