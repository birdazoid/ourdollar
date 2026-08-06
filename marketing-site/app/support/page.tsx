import type { Metadata } from 'next';
import { Nav } from '../components/nav';
import { Footer } from '../components/footer';
import { siteConfig } from '@/site.config';

export const metadata: Metadata = {
  title: 'Support',
  description: 'Get help with OurDollar, or contact us with a question.',
};

const faqs = [
  {
    q: 'Is OurDollar connected to my bank?',
    a: 'No. OurDollar doesn’t connect to, hold, or move money. You (and anyone in your household) log income, bills, and spending yourself, and the app calculates a weekly spending number from what you enter.',
  },
  {
    q: 'How do I invite someone to my household?',
    a: 'Open Profile, then use “Add a household member” under your active household. You can invite them by email so they can create their own login, or add them as a “fun money only” member with just a name and allowance.',
  },
  {
    q: 'I forgot my password. How do I get back in?',
    a: 'On the sign-in screen, tap “Forgot password?” and enter your email. We’ll send you a link to set a new password.',
  },
  {
    q: 'How do I change my email or password?',
    a: 'Go to Profile → Security. Both Change email and Change password ask you to re-enter your current password first, for security.',
  },
  {
    q: 'Can I use Face ID or Touch ID to unlock the app?',
    a: 'Yes. Profile → Security → “Unlock with Face ID” (the label matches whatever biometric your device supports). Once enabled, the app locks on launch and whenever it returns from the background.',
  },
  {
    q: 'How do I delete my account?',
    a: 'Go to Profile → Account → Delete account. This permanently removes your account and any households you own, along with their bills, goals, income, and history. It can’t be undone.',
  },
  {
    q: 'Is my household’s data private from other households?',
    a: 'Yes. Data you enter is only visible to members of your own household. See our Privacy Policy for details on what we collect and how it’s used.',
  },
];

export default function SupportPage() {
  return (
    <>
      <Nav />
      <section className="section" style={{ paddingBottom: 20 }}>
        <div className="container" style={{ textAlign: 'center' }} data-reveal>
          <p className="eyebrow">Support</p>
          <h2 style={{ marginBottom: 14 }}>How can we help?</h2>
          <p className="lead" style={{ margin: '0 auto' }}>
            Answers to common questions below. Don’t see yours? Just email us.
          </p>
        </div>
      </section>

      <section className="section-tight">
        <div className="container" style={{ maxWidth: '70ch', margin: '0 auto' }}>
          {faqs.map((item) => (
            <details
              key={item.q}
              style={{
                borderBottom: '1px solid var(--hairline, rgba(0,0,0,0.1))',
                padding: '18px 0',
              }}
            >
              <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{item.q}</summary>
              <p style={{ marginTop: 10, color: 'var(--ink-soft)' }}>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="callout">
        <div className="container" style={{ textAlign: 'center' }}>
          <p className="eyebrow">Still stuck?</p>
          <h2>Email us and we’ll help you out.</h2>
          <p>
            <a className="link-arrow" href={`mailto:${siteConfig.legal.contactEmail}`}>
              {siteConfig.legal.contactEmail} →
            </a>
          </p>
        </div>
      </section>

      <Footer />
    </>
  );
}
