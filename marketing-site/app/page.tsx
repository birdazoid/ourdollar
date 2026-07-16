import Link from 'next/link';
import { Nav } from './components/nav';
import { Footer } from './components/footer';
import { StoreBadges } from './components/store-badges';
import { PhoneMock } from './components/phone-mock';
import { siteConfig } from '@/site.config';

const features = [
  {
    icon: '🧾',
    tint: 't-terracotta',
    title: 'Bills that never sneak up',
    body: 'Every recurring bill in one checklist — what’s due, when, and whether it’s been paid. Overdue items stand out; paid ones fade back.',
  },
  {
    icon: '💸',
    tint: 't-sage',
    title: 'A weekly number you can trust',
    body: 'Income minus bills, goals, and fun money, split into a self-replenishing weekly allowance. Spend it down to zero without guilt.',
  },
  {
    icon: '🔔',
    tint: 't-sand',
    title: 'Everyone stays in sync',
    body: 'When someone in your household logs a spend, the others get a gentle heads-up with the amount and what’s left — no spreadsheet check-ins.',
  },
  {
    icon: '🎯',
    tint: 't-sage',
    title: 'Savings goals with progress',
    body: 'Set what you’re saving toward, chip away each month, and watch the ring fill. Goals sit right alongside your bills.',
  },
  {
    icon: '📊',
    tint: 't-ink',
    title: 'See where it all goes',
    body: 'A month-at-a-glance breakdown and spending trends over time — the calm, big-picture view, not a wall of numbers.',
  },
  {
    icon: '🔒',
    tint: 't-terracotta',
    title: 'Private by design',
    body: 'No ads. No third-party trackers. It’s your financial data — delete your account and everything with it, anytime, from inside the app.',
  },
];

export default function Home() {
  return (
    <>
      <Nav />

      {/* Hero */}
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <p className="eyebrow">Household budgeting, made calm</p>
            <h1>Budgeting that works for your whole household.</h1>
            <p className="lead">{siteConfig.description}</p>
            <div className="hero-cta" id="get">
              <StoreBadges />
            </div>
            <p className="hero-note">
              Free to start · Works solo or with a full house · iOS &amp; Android
            </p>
          </div>
          <PhoneMock />
        </div>
      </section>

      {/* Value prop strip */}
      <section className="section-tight">
        <div className="container">
          <div className="card" style={{ textAlign: 'center', padding: '30px 28px' }}>
            <p className="lead" style={{ maxWidth: '58ch', margin: '0 auto', fontSize: 21 }}>
              Two jobs, done well: <strong>track the bills</strong> that repeat every
              month, and <strong>manage the everyday spending</strong> that doesn’t.
              One shared, honest picture of your money.
            </p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="section" id="features">
        <div className="container">
          <p className="eyebrow" style={{ textAlign: 'center' }}>
            What you get
          </p>
          <h2 style={{ textAlign: 'center', marginBottom: 40 }}>
            Everything a household budget needs — nothing it doesn’t.
          </h2>
          <div className="grid grid-3">
            {features.map((f) => (
              <div className="card" key={f.title}>
                <div className={`feature-icon ${f.tint}`}>{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <p className="eyebrow" style={{ textAlign: 'center' }}>
            How it works
          </p>
          <h2 style={{ textAlign: 'center', marginBottom: 44 }}>
            Set it up once. Check in for seconds.
          </h2>
          <div className="steps">
            <div className="step">
              <div className="step-num">1</div>
              <h3>Add your income</h3>
              <p>
                Tell OurDollar what comes in. It’s the one number everything else is
                calculated from — no guesswork.
              </p>
            </div>
            <div className="step">
              <div className="step-num">2</div>
              <h3>Set bills &amp; goals</h3>
              <p>
                List the recurring bills and what you’re saving toward. The app does
                the math and hands you a weekly allowance.
              </p>
            </div>
            <div className="step">
              <div className="step-num">3</div>
              <h3>Spend your week</h3>
              <p>
                Log spending with a tap. Watch the weekly number drain, stay in sync
                with your household, repeat.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Privacy callout */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="callout">
            <p className="eyebrow">A quiet promise</p>
            <h2>Your money is nobody else’s business.</h2>
            <p>
              OurDollar has no ad networks and no third-party tracking SDKs. It never
              connects to your bank, and it never sells your data. Everything you enter
              stays scoped to your household — and you can export or delete all of it,
              yourself, whenever you want.
            </p>
            <p style={{ marginTop: 20 }}>
              <Link href="/privacy" style={{ color: 'var(--sand)', fontWeight: 700 }}>
                Read the privacy policy →
              </Link>
            </p>
          </div>
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container" style={{ textAlign: 'center' }}>
          <p className="eyebrow">Simple pricing</p>
          <h2>Genuinely free to start.</h2>
          <p className="lead" style={{ margin: '0 auto 26px' }}>
            Run your real budget on the free tier and mean it. Premium adds scale and
            depth for people who want more.
          </p>
          <Link href="/pricing" className="btn btn-ghost">
            See what’s included
          </Link>
        </div>
      </section>

      {/* Final CTA */}
      <section className="section-tight">
        <div className="container" style={{ textAlign: 'center' }}>
          <h2 style={{ marginBottom: 22 }}>Ready when you are.</h2>
          <div style={{ display: 'inline-flex' }}>
            <StoreBadges />
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
