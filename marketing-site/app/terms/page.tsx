import type { Metadata } from 'next';
import { Nav } from '../components/nav';
import { Footer } from '../components/footer';
import { LegalDoc } from '../components/legal-doc';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The terms that govern your use of OurDollar.',
};

export default function TermsPage() {
  return (
    <>
      <Nav />
      <LegalDoc file="terms-of-service.md" title="Terms of Service" />
      <Footer />
    </>
  );
}
