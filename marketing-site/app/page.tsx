import Image from 'next/image';
import Link from 'next/link';
import { Nav } from './components/nav';
import { Footer } from './components/footer';
import { StoreBadges } from './components/store-badges';
import { PhoneMock } from './components/phone-mock';
import { IconBills, IconSubscriptions, IconSave, IconGraph } from './components/feature-icons';

// Stagger helper: sets the --reveal-delay custom property consumed by
// [data-reveal] in globals.css. (csstype doesn't type custom properties.)
const delay = (s: string): React.CSSProperties =>
  ({ '--reveal-delay': s }) as React.CSSProperties;

// The flagship feature carries the section; the rest live in a quiet side column.
const sideFeatures = [
  {
    icon: IconBills,
    title: 'Bills that never sneak up',
    body: 'Every recurring bill in one checklist — due dates, paid status, overdue flags. Nothing forgotten.',
  },
  {
    icon: IconSubscriptions,
    title: 'Everyone stays in sync',
    body: 'When a housemate logs a spend, the others get a quiet heads-up with the amount and what’s left.',
  },
  {
    icon: IconSave,
    title: 'Savings goals with progress',
    body: 'Set what you’re saving toward, chip away monthly, watch the ring fill — right beside your bills.',
  },
  {
    icon: IconGraph,
    title: 'See where it all goes',
    body: 'A month-at-a-glance breakdown and spending trends over time. The calm view, not a wall of numbers.',
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
            <p className="eyebrow">
              Free household budgeting
            </p>
            <h1>
              Know what your household can spend this week.
            </h1>
            <p className="lead">
              Set aside money for bills and savings, then see what’s left for the week.
              One shared budget, whether you live solo or with a full house.
            </p>
            <div className="hero-cta" id="get">
              <StoreBadges />
            </div>
            <p className="hero-note">Completely free · No bank connection · No ads</p>
          </div>
          <PhoneMock />
        </div>
      </section>

      {/* Editorial statement (replaces the boxed value strip) */}
      <section className="section-tight">
        <div className="container statement-grid statement-grid--photo">
          <div className="statement-photo" data-image-reveal>
            <Image
              src="/screenshots/hands-holding-phone.jpg"
              alt="Someone checking their household's OurDollar profile on their phone at home"
              width={752}
              height={1160}
            />
          </div>
          <p className="statement" data-reveal style={delay('0.08s')}>
            <strong>Track the bills</strong> that repeat every month, and{' '}
            <strong>manage the spending</strong> that doesn’t. OurDollar provides one
            shared, honest picture of your money.
          </p>
        </div>
      </section>

      {/* Features — asymmetric: 63% flagship + minimal side column */}
      <section className="section" id="features">
        <div className="container feat-wrap">
          <div className="feat-flagship" data-reveal>
            <h2 className="feat-title">A weekly allowance you can actually trust.</h2>
            <p className="feat-lead">
              OurDollar takes your income, sets aside the bills and savings goals, and
              splits what’s left into a weekly amount. You and your household always
              know where your money is going.
            </p>

            <div className="budget-example" aria-label="Illustrative household budget">
              <p className="eyebrow">A simple example</p>
              <dl className="budget-breakdown">
                <div><dt>Monthly income</dt><dd>$3,900</dd></div>
                <div><dt>Set aside for bills</dt><dd>−$2,300</dd></div>
                <div><dt>Set aside for savings</dt><dd>−$300</dd></div>
                <div className="budget-remainder"><dt>Left for spending each month</dt><dd>$1,300</dd></div>
              </dl>
              <div className="budget-result">
                <span>Your weekly spending amount</span>
                <strong>$300<small> / week</small></strong>
              </div>
              <p className="budget-caption">Illustrative amounts. $1,300 a month × 12 ÷ 52 weeks = $300 a week.</p>
            </div>
          </div>

          <div className="feat-side">
            <ol className="feat-list">
              {sideFeatures.map((f, i) => {
                const Icon = f.icon;
                return (
                  <li
                    key={f.title}
                    data-reveal
                    style={delay(`${i * 0.06}s`)}
                  >
                    <span className="feat-index">
                      <Icon />
                    </span>
                    <div>
                      <h3>{f.title}</h3>
                      <p>{f.body}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </section>

      {/* How it works — staggered */}
      <section className="section" id="how-it-works" style={{ paddingTop: 0 }}>
        <div className="container">
          <div data-reveal>
            <p className="eyebrow">How it works</p>
            <h2 style={{ maxWidth: '18ch', marginBottom: 56 }}>
              Set it up once. Check in for seconds.
            </h2>
          </div>
          <div className="steps">
            <div className="step" data-reveal>
              <div className="step-illo">
                <Image
                  src="/illustrations/onboarding-income.svg"
                  alt=""
                  width={315}
                  height={322}
                />
              </div>
              <h3>Add your income</h3>
              <p>
                Tell OurDollar what comes in. It’s the one number everything else is
                built from.
              </p>
            </div>
            <div className="step" data-reveal style={delay('0.1s')}>
              <div className="step-illo">
                <Image
                  src="/illustrations/onboarding-fixed-expenses.svg"
                  alt=""
                  width={313}
                  height={238}
                />
              </div>
              <h3>Set bills &amp; goals</h3>
              <p>
                List what repeats and what you’re saving toward. The app does the math
                and hands back a weekly allowance.
              </p>
            </div>
            <div className="step" data-reveal style={delay('0.2s')}>
              <div className="step-illo">
                <Image
                  src="/illustrations/onboarding-planned-spending.svg"
                  alt=""
                  width={292}
                  height={264}
                />
              </div>
              <h3>Spend your week</h3>
              <p>
                Log spending with a tap. Stay in sync with your household, repeat.
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
              <h2>Your money is nobody else’s business.</h2>
            </div>
            <div>
              <p>
                No ad networks. No third-party tracking SDKs. It never connects to your
                bank, and it never sells your data. Everything you enter stays scoped to
                your household.
              </p>
              <Link href="/privacy" className="link-arrow">
                Read the privacy policy →
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="faq" style={{ paddingTop: 0 }}>
        <div className="container faq-layout">
          <div data-reveal>
            <p className="eyebrow">Good to know</p>
            <h2>A little clarity before you start.</h2>
            <p className="lead">A shared picture of your money, with less guesswork.</p>
          </div>
          <div className="faq-list">
            <details>
              <summary>Is OurDollar free?</summary>
              <p>Yes. OurDollar is free, with no paid plans or subscriptions.</p>
            </details>
            <details>
              <summary>Do I need to connect my bank?</summary>
              <p>No. You enter your income, bills, savings goals, and spending yourself. OurDollar uses those entries to calculate your weekly spending amount. It doesn’t connect to, hold, or move your money.</p>
            </details>
            <details>
              <summary>Can I share a budget with someone?</summary>
              <p>Yes. Invite someone to your household from Profile. Each person can use their own login to keep your shared budget up to date.</p>
            </details>
            <details>
              <summary>Can I use it on my own?</summary>
              <p>Absolutely. The same weekly budget works for one person, a couple, or a household.</p>
            </details>
            <Link href="/support" className="link-arrow">More questions? Visit support →</Link>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="section-tight">
        <div className="container" style={{ textAlign: 'center' }}>
          <h2 data-reveal style={{ marginBottom: 24 }}>
            A clearer week. A shared budget. Always free.
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
