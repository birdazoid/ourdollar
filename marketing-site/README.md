# OurDollar — marketing site

Next.js (App Router) marketing site for OurDollar: landing page, pricing, and
the hosted Privacy Policy / Terms of Service that the app links to.

Kept intentionally separate from the Expo app — it has its own `package.json`
and deploys independently on Vercel.

## Develop

```bash
cd marketing-site
npm install
npm run dev        # http://localhost:3000
```

## Pages

| Route      | Purpose                                             |
| ---------- | --------------------------------------------------- |
| `/`        | Landing — value prop, features, how-it-works, CTA   |
| `/pricing` | Free vs Premium plans                               |
| `/privacy` | Privacy Policy (rendered from vendored legal doc)   |
| `/terms`   | Terms of Service (rendered from vendored legal doc) |

## Legal content

The canonical legal docs live in the repo root at **`../legal/*.md`**. Because
Vercel only deploys files inside this site's root directory, a build-time copy
is vendored here at `content/legal/`. Refresh it whenever the source changes:

```bash
npm run sync-legal
```

Placeholder tokens (`[[LEGAL_ENTITY]]`, `[[CONTACT_EMAIL]]`, etc.) are filled at
render time from `site.config.ts` → `legal`. Until those are filled and a lawyer
has reviewed the docs, a visible **draft** banner shows on both legal pages.
Set `siteConfig.legal.reviewed = true` to remove it.

## Before going live

Edit `site.config.ts`:

- `url` — the real domain
- `stores.ios` / `stores.android` — real App Store / Play Store URLs (the badges
  are inert placeholders until these are set)
- `pricing.premiumLive` — set `true` when subscriptions ship (flips the pricing
  page from "coming soon" to live prices)
- `legal.*` — fill every value, then set `legal.reviewed = true` after review

## Deploy (Vercel)

This is a **subdirectory** of the OurDollar repo, so set the project's **Root
Directory** to `marketing-site` in Vercel (Project Settings → General → Root
Directory). Next.js is auto-detected; no other config needed.

```bash
# from marketing-site/, after `vercel link`
vercel        # preview
vercel --prod # production
```
