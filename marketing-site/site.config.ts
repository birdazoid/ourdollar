/**
 * Central site configuration.
 *
 * The legal.* values fill the [[PLACEHOLDER]] tokens in the vendored legal
 * markdown (content/legal/*.md) at render time. Fill these in — and set
 * legal.reviewed to true only AFTER a lawyer or reputable service has reviewed
 * the documents — before publishing the site or submitting to the App Store.
 * See ../legal/README.md.
 */

export const siteConfig = {
  name: 'OurDollar',
  // Canonical marketing-site domain. Update once the real domain is live.
  url: 'https://ourdollar.app',
  tagline: 'Budgeting for your whole household.',
  description:
    'Track the bills, spend a weekly allowance you can trust, and keep everyone in your household on the same page — solo or with a full house.',

  // App store links — placeholders until the apps are live. Set to real URLs
  // and the badges become clickable.
  stores: {
    ios: '', // e.g. 'https://apps.apple.com/app/ourdollar/id6790992459'
    android: '', // e.g. 'https://play.google.com/store/apps/details?id=com.adriantownsend.ourdollar'
  },

  // Planned monetization (deferred — see build plan Phase 5). While Premium is
  // not yet live, the pricing page frames it as "coming soon". Flip
  // premium.live to true when subscriptions ship.
  pricing: {
    premiumLive: false,
    monthly: '$4.99',
    annual: '$29.99',
    annualPerMonth: '$2.50',
  },

  legal: {
    // Set true ONLY after professional legal review. While false, a visible
    // "draft" banner is shown on the Privacy and Terms pages.
    reviewed: false,
    effectiveDate: 'July 24, 2026',
    legalEntity: '[[LEGAL_ENTITY]]',
    contactEmail: '[[CONTACT_EMAIL]]',
    websiteUrl: 'https://ourdollar.app',
    jurisdiction: '[[JURISDICTION]]',
    minAge: '[[MIN_AGE]]',
    companyAddress: '[[COMPANY_ADDRESS]]',
  },
} as const;

/** Map of legal placeholder tokens → configured values, for substitution. */
export const legalTokens: Record<string, string> = {
  EFFECTIVE_DATE: siteConfig.legal.effectiveDate,
  LEGAL_ENTITY: siteConfig.legal.legalEntity,
  CONTACT_EMAIL: siteConfig.legal.contactEmail,
  WEBSITE_URL: siteConfig.legal.websiteUrl,
  JURISDICTION: siteConfig.legal.jurisdiction,
  MIN_AGE: siteConfig.legal.minAge,
  COMPANY_ADDRESS: siteConfig.legal.companyAddress,
};
