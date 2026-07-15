# Legal documents — DRAFTS

`privacy-policy.md` and `terms-of-service.md` are **drafts** tailored to what
OurDollar actually does (Supabase backend, Expo push, Resend email, no ad SDKs
or trackers, in-app account deletion, household-shared data). They are the
source of truth that the marketing site (Phase 7) and the in-app links render.

## ⚠️ Before publishing or submitting to the App Store

**Have these reviewed by a lawyer or a reputable service** (e.g. Termly,
iubenda, TermsFeed, or a real attorney). This is a financial-data app, so a
generic template is not enough. This draft is written to make that review
cheaper and faster — not to replace it. Nothing here is legal advice.

## Placeholders you must fill in

Search both files for `[[ ... ]]` and replace:

- `[[LEGAL_ENTITY]]` — who provides the app (your name, or a company/LLC if you form one)
- `[[CONTACT_EMAIL]]` — a support/privacy contact address (e.g. privacy@yourdomain)
- `[[WEBSITE_URL]]` — the marketing site domain once live (e.g. https://ourdollar.app)
- `[[JURISDICTION]]` — governing law (e.g. "the State of Texas, USA")
- `[[EFFECTIVE_DATE]]` — the date you publish them
- `[[MIN_AGE]]` — minimum age to hold an account (commonly 18, or 13/16 with limits)
- `[[COMPANY_ADDRESS]]` — a contact/mailing address if your reviewer says one is required

## Decisions to confirm with your reviewer

- **Payments:** monetization is deferred, so the current app takes no payments.
  The drafts describe subscriptions as *"if/when offered, billed by Apple/Google."*
  If you never charge, that section can be trimmed; if you do, confirm the
  auto-renewal disclosures Apple requires.
- **Region / international transfer:** data currently lives in Supabase's
  `us-east-2` (USA). If you'll have EU/UK users, your reviewer will want the
  GDPR transfer language checked.
- **Children:** kids can be added as *fun-money-only members* (a name, by an
  adult) but never create accounts. The drafts state the service isn't directed
  to children under `[[MIN_AGE]]`; confirm this matches your intent.
