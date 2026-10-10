import type { Metadata } from 'next';
import { Nav } from '../components/nav';
import { Footer } from '../components/footer';
import { ConfirmStatus } from './confirm-status';

// Where Supabase sends someone after they tap the link in their sign-up email
// (Authentication > URL Configuration > Site URL). Before this page existed the
// Site URL was still Supabase's default, http://localhost:3000, so the link
// opened a "can't connect" error on a phone even though the account had been
// confirmed, and people reasonably assumed sign-up had failed.
export const metadata: Metadata = {
  title: 'Email confirmed',
  description: 'Your OurDollar account is ready. Open the app to sign in.',
  robots: { index: false, follow: false },
};

export default function ConfirmedPage() {
  return (
    <>
      <Nav />
      <section className="section">
        <div className="container" style={{ textAlign: 'center', maxWidth: '60ch', margin: '0 auto' }}>
          <ConfirmStatus />
        </div>
      </section>
      <Footer />
    </>
  );
}
