import type { Metadata } from 'next';
import { Nav } from '../components/nav';
import { Footer } from '../components/footer';
import { LegalDoc } from '../components/legal-doc';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How OurDollar collects, uses, and protects your information.',
};

export default function PrivacyPage() {
  return (
    <>
      <Nav />
      <LegalDoc file="privacy-policy.md" title="Privacy Policy" />
      <Footer />
    </>
  );
}
