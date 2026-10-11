import type { Metadata } from 'next';
import { Fraunces, Karla } from 'next/font/google';
import { siteConfig } from '@/site.config';
import { SiteEffects } from './components/site-effects';
import './globals.css';

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-fraunces',
  display: 'swap',
});

const karla = Karla({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-karla',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: `${siteConfig.name} | Free household budgeting`,
    template: `%s | ${siteConfig.name}`,
  },
  description: 'Free household budgeting. Track bills, savings, and weekly spending together, with no subscriptions or bank connection.',
  openGraph: {
    title: `${siteConfig.name} | Free household budgeting`,
    description: siteConfig.description,
    url: siteConfig.url,
    siteName: siteConfig.name,
    type: 'website',
  },
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${karla.variable}`}>
      <body>
        {children}
        <SiteEffects />
      </body>
    </html>
  );
}
