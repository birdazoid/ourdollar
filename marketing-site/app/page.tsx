import Link from 'next/link';
import { Nav } from './components/nav';
import { Footer } from './components/footer';
import { StoreBadges } from './components/store-badges';
import { PhoneMock } from './components/phone-mock';
import { siteConfig } from '@/site.config';

// Stagger helper: sets the --reveal-delay custom property consumed by
// [data-reveal] in globals.css. (csstype doesn't type custom properties.)
const delay = (s: string): React.CSSProperties =>
  ({ '--reveal-delay': s }) as React.CSSProperties;

// The flagship feature carries the section; the rest live in a quiet side column.
const sideFeatures = [
  {
    title: 'Bills that never sneak up',
    body: 'Every recurring bill in one checklist — due dates, paid status, overdue flags. Nothing forgotten.',
  },
  {
    title: 'Everyone stays in sync',
    body: 'When a housemate logs a spend, the others get a quiet heads-up with the amount and what’s left.',
  },
  {
    title: 'Savings goals with progress',
    body: 'Set what you’re saving toward, chip away monthly, watch the ring fill — right beside your bills.',
  },
  {
    title: 'See where it all goes',
    body: 'A month-at-a-glance breakdown and spending trends over time. The calm view, not a wall of numbers.',
  },
  {
    title: 'Private by design',
    body: 'No ads, no third-party trackers, no bank connection. Export or delete everything, yourself, anytime.',
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
            <p className="eyebrow" data-reveal>
              Household budgeting, made calm
            </p>
            <h1 data-reveal style={delay('0.06s')}>
              Budgeting that works for your whole household.
            </h1>
            <p
              className="lead"
              data-reveal
              style={delay('0.14s')}
            >
              {siteConfig.description}
            </p>
            <div
              className="hero-cta"
              id="get"
              data-reveal
              style={delay('0.22s')}
            >
              <StoreBadges />
            </div>
            <p
              className="hero-note"
              data-reveal
              style={delay('0.3s')}
            >
              Free to start · Works solo or with a full house · iOS &amp; Android
            </p>
          </div>
          <PhoneMock />
        </div>
      </section>

      {/* Editorial statement (replaces the boxed value strip) */}
      <section className="section-tight">
        <div className="container statement-grid">
          <div data-reveal>
            <p className="eyebrow" style={{ marginBottom: 0 }}>
              The idea
            </p>
            <div className="statement-rule" />
          </div>
          <p className="statement" data-reveal style={delay('0.08s')}>
            Two jobs, done well: <strong>track the bills</strong> that repeat every
            month, and <strong>manage the spending</strong> that doesn’t — one shared,
            honest picture of your money.
          </p>
        </div>
      </section>

      {/* Features — asymmetric: 63% flagship + minimal side column */}
      <section className="section" id="features">
        <div className="container feat-wrap">
          <div className="feat-flagship" data-reveal>
            <p className="eyebrow">The number that runs everything</p>
            <h2 className="feat-title">A weekly allowance you can actually trust.</h2>
            <p className="feat-lead">
              OurDollar takes your income, sets aside the bills, goals, and fun money,
              and splits what’s left into a self-replenishing weekly number. Spend it
              down to zero without the guilt — it refills next week, every week.
            </p>

            <div className="feat-figure" data-image-reveal>
              <div>
                <div className="ff-amount">$247.50</div>
                <div className="ff-cap">Left this week</div>
              </div>
              <p className="ff-formula">
                <b>Income</b> − bills − goals − fun money, <b>÷ 4</b>. Recalculated
                for you.
              </p>
            </div>
          </div>

          <div className="feat-side">
            <ol className="feat-list">
              {sideFeatures.map((f, i) => (
                <li
                  key={f.title}
                  data-reveal
                  style={delay(`${i * 0.06}s`)}
                >
                  <span className="feat-index">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <h3>{f.title}</h3>
                    <p>{f.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* How it works — staggered */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div data-reveal>
            <p className="eyebrow">How it works</p>
            <h2 style={{ maxWidth: '18ch', marginBottom: 56 }}>
              Set it up once. Check in for seconds.
            </h2>
          </div>
          <div className="steps">
            <div className="step" data-reveal>
              <div className="step-num">01</div>
              <h3>Add your income</h3>
              <p>
                Tell OurDollar what comes in. It’s the one number everything else is
                built from — no guesswork.
              </p>
            </div>
            <div className="step" data-reveal style={delay('0.1s')}>
              <div className="step-num">02</div>
              <h3>Set bills &amp; goals</h3>
              <p>
                List what repeats and what you’re saving toward. The app does the math
                and hands back a weekly allowance.
              </p>
            </div>
            <div className="step" data-reveal style={delay('0.2s')}>
              <div className="step-num">03</div>
              <h3>Spend your week</h3>
              <p>
                Log spending with a tap. Watch the number drain, stay in sync with your
                household, repeat.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Privacy callout — asymmetric dark band */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="callout" data-reveal>
            <div>
              <p className="eyebrow">A quiet promise</p>
              <h2>Your money is nobody else’s business.</h2>
            </div>
            <div>
              <p>
                No ad networks. No third-party tracking SDKs. It never connects to your
                bank, and it never sells your data — everything you enter stays scoped
                to your household.
              </p>
              <Link href="/privacy" className="link-arrow">
                Read the privacy policy →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container statement-grid">
          <div data-reveal>
            <p className="eyebrow" style={{ marginBottom: 0 }}>
              Pricing
            </p>
            <div className="statement-rule" />
          </div>
          <div data-reveal style={delay('0.08s')}>
            <h2 style={{ fontSize: 'clamp(28px, 3.6vw, 40px)', marginBottom: 14 }}>
              Genuinely free to start.
            </h2>
            <p className="lead" style={{ marginBottom: 24 }}>
              Run your real budget on the free tier and mean it. Premium adds scale and
              depth for people who want more.
            </p>
            <Link href="/pricing" className="btn btn-ghost" data-magnetic="0.25">
              See what’s included
            </Link>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="section-tight">
        <div className="container" style={{ textAlign: 'center' }}>
          <h2 data-reveal style={{ marginBottom: 24 }}>
            Ready when you are.
          </h2>
          <div style={{ display: 'inline-flex' }} data-reveal>
            <StoreBadges />
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
