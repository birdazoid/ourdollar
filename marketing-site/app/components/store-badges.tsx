import Image from 'next/image';
import Link from 'next/link';
import { siteConfig } from '@/site.config';

export function StoreBadges() {
  const stores = [
    { href: siteConfig.stores.ios, src: '/badges/app-store-badge.svg', alt: 'Download on the App Store', width: 162 },
    { href: siteConfig.stores.android, src: '/badges/google-play-badge.svg', alt: 'Get it on Google Play', width: 182 },
  ];
  const available = stores.filter((store) => store.href);
  if (!available.length) {
    return (
      <div>
        <div className="launch-actions">
          <Link href="/#how-it-works" className="btn btn-primary">See how it works</Link>
          <Link href="/#faq" className="btn btn-ghost">Questions? Start here</Link>
        </div>
        <p className="launch-note">Coming soon to iPhone and Android. Free, with no subscriptions.</p>
      </div>
    );
  }
  return (
    <div>
      <div className="store-badges">
        {available.map((store) => (
          <a key={store.src} className="store-badge-img" href={store.href} target="_blank" rel="noopener noreferrer">
            <Image src={store.src} alt={store.alt} width={store.width} height={54} style={{ height: 54, width: 'auto' }} unoptimized />
          </a>
        ))}
      </div>
      {available.length < stores.length && <p className="launch-note">{siteConfig.stores.ios ? 'Android' : 'iPhone'} version coming soon.</p>}
    </div>
  );
}
