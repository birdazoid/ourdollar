import Image from 'next/image';
import { siteConfig } from '@/site.config';

/**
 * Official Apple/Google badge artwork (public/badges/*.svg — Apple's
 * "Download on the App Store" US/UK badge and Google's "Get it on Google
 * Play" badge). These already carry their own background/shape per each
 * platform's brand guidelines, so they render as plain linked images rather
 * than the site's own button chrome.
 */
export function StoreBadges({ compact = false }: { compact?: boolean }) {
  const badge = (href: string, src: string, alt: string, width: number) => {
    const disabled = !href;
    const img = (
      <Image
        src={src}
        alt={alt}
        width={width}
        height={54}
        style={{ height: 54, width: 'auto' }}
        unoptimized
        priority
      />
    );
    if (disabled) {
      return (
        <span
          className="store-badge-img is-disabled"
          aria-label={`${alt} (coming soon)`}
          title="Coming soon"
          data-magnetic="0.22"
        >
          {img}
        </span>
      );
    }
    return (
      <a
        className="store-badge-img"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        data-magnetic="0.3"
      >
        {img}
      </a>
    );
  };

  return (
    <div>
      <div className="store-badges">
        {badge(
          siteConfig.stores.ios,
          '/badges/app-store-badge.svg',
          'Download on the App Store',
          162,
        )}
        {badge(
          siteConfig.stores.android,
          '/badges/google-play-badge.svg',
          'Get it on Google Play',
          182,
        )}
      </div>
      {!compact && (!siteConfig.stores.ios || !siteConfig.stores.android) && (
        <p className="badge-soon" style={{ marginTop: 12 }}>
          Launching soon — links go live the day the app ships.
        </p>
      )}
    </div>
  );
}
