import { siteConfig } from '@/site.config';

const AppleIcon = () => (
  <svg viewBox="0 0 384 512" fill="currentColor" aria-hidden="true">
    <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
  </svg>
);

const PlayIcon = () => (
  <svg viewBox="0 0 512 512" aria-hidden="true">
    <path fill="#00D9FF" d="M47 21.9C40 25.6 35 32.8 33.4 42L34 470c1 8.6 5.9 15.9 12.9 19.7L288 256 47 21.9z" />
    <path fill="#FFD400" d="M389.6 195.6 300.7 145 47 21.9c-.3.2 242 234.1 242 234.1l100.6-60.4z" />
    <path fill="#FF3333" d="M289 256 46.9 489.7c.6.3 1.2.7 1.9 1 7.4 3.9 16.3 3.6 24.6-1L389.6 316.4 289 256z" />
    <path fill="#00F076" d="M479 234.7 389.6 195.6 289 256l100.6 60.4L479 277.3c9.7-5.3 15.6-14.4 15.6-21.3s-5.9-16-15.6-21.3z" />
  </svg>
);

export function StoreBadges({ compact = false }: { compact?: boolean }) {
  const badge = (
    href: string,
    top: string,
    main: string,
    icon: React.ReactNode,
  ) => {
    const disabled = !href;
    const inner = (
      <>
        {icon}
        <span>
          <span className="sb-top">{top}</span>
          <br />
          <span className="sb-main">{main}</span>
        </span>
      </>
    );
    if (disabled) {
      return (
        <span
          className="store-badge is-disabled"
          aria-label={`${main} (coming soon)`}
          title="Coming soon"
        >
          {inner}
        </span>
      );
    }
    return (
      <a
        className="store-badge"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
      >
        {inner}
      </a>
    );
  };

  return (
    <div>
      <div className="store-badges">
        {badge(siteConfig.stores.ios, 'Download on the', 'App Store', <AppleIcon />)}
        {badge(siteConfig.stores.android, 'Get it on', 'Google Play', <PlayIcon />)}
      </div>
      {!compact && (!siteConfig.stores.ios || !siteConfig.stores.android) && (
        <p className="badge-soon" style={{ marginTop: 12 }}>
          Launching soon — links go live the day the app ships.
        </p>
      )}
    </div>
  );
}
