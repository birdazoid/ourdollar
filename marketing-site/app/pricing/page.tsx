import type { Metadata } from 'next';
import { Nav } from '../components/nav';
import { Footer } from '../components/footer';
import { StoreBadges } from '../components/store-badges';
import { siteConfig } from '@/site.config';

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'OurDollar is genuinely free to start. Premium unlocks unlimited goals, multiple households, more members, full history, and data export.',
};

const freePerks = [
  'One household budget',
  'Recurring bill tracking',
  'Self-replenishing weekly allowance',
  'Real-time household spend alerts',
  'Up to 2 savings goals',
  'Up to 2 household members',
  'A rolling few months of history',
  'Basic due-date reminders',
];

const premiumPerks = [
  'Unlimited savings goals',
  'Multiple households on one account',
  'Unlimited household members',
  'Full history & longer trend charts',
  'Data export (CSV / PDF)',
  'Configurable reminders & overdue nudges',
  'Everything in Free',
];

export default function Pricing() {
  const { premiumLive, monthly, annual, annualPerMonth } = siteConfig.pricing;

  return (
    <>
      <Nav />
      <section className="section" style={{ paddingBottom: 40 }}>
        <div className="container" style={{ textAlign: 'center' }}>
          <p className="eyebrow">Pricing</p>
          <h2 style={{ marginBottom: 14 }}>Free to start. Fair to upgrade.</h2>
          <p className="lead" style={{ margin: '0 auto' }}>
            No hard paywall, no trial countdown. Use the free tier for as long as you
            like — upgrade only if you want more room.
          </p>
        </div>
      </section>

      <section style={{ paddingBottom: 64 }}>
        <div className="container">
          <div className="price-grid">
            {/* Free */}
            <div className="plan">
              <h3>Free</h3>
              <div className="price">
                $0<small> / forever</small>
              </div>
              <div className="price-sub">
                Everything you need to run a real household budget.
              </div>
              <ul>
                {freePerks.map((p) => (
                  <li key={p}>
                    <span className="check">✓</span>
                    {p}
                  </li>
                ))}
              </ul>
            </div>

            {/* Premium */}
            <div className="plan featured">
              <span className="plan-tag">{premiumLive ? 'Best value' : 'Coming soon'}</span>
              <h3>Premium</h3>
              {premiumLive ? (
                <>
                  <div className="price">
                    {annualPerMonth}
                    <small> / mo</small>
                  </div>
                  <div className="price-sub">
                    Billed annually at {annual}, or {monthly}/mo month-to-month.
                  </div>
                </>
              ) : (
                <>
                  <div className="price" style={{ fontSize: 30 }}>
                    Planned: ~{annualPerMonth}/mo
                  </div>
                  <div className="price-sub">
                    Around {annual}/yr or {monthly}/mo. Premium isn’t live yet — the
                    app is fully usable free while we finalize it.
                  </div>
                </>
              )}
              <ul>
                {premiumPerks.map((p) => (
                  <li key={p}>
                    <span className="check">✓</span>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p
            style={{
              textAlign: 'center',
              color: 'var(--ink-soft)',
              fontSize: 15,
              maxWidth: '60ch',
              margin: '28px auto 0',
            }}
          >
            {premiumLive
              ? 'Subscriptions are billed through the App Store or Google Play and can be managed or cancelled anytime from your device settings. Prices shown in USD.'
              : 'When Premium launches it’ll be billed through the App Store or Google Play, with price and renewal terms shown clearly before you buy — and always cancellable from your device settings.'}
          </p>
        </div>
      </section>

      <section className="section-tight">
        <div className="container" style={{ textAlign: 'center' }}>
          <h2 style={{ marginBottom: 20 }}>Start with free.</h2>
          <div style={{ display: 'inline-flex' }}>
            <StoreBadges />
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
