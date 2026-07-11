# OurDollar

Household budgeting app — recurring bill tracking and a self-replenishing weekly spending allowance, for one person or a whole household. React Native (Expo) + Supabase.

See `Resources/Claude Files/design-brief.md` and `claude-code-build-plan.md` (in the parent project folder) for the product spec and build sequence.

## Getting started

```bash
npm install
cp .env.example .env   # fill in your Supabase project URL/anon key
npm start
```

## Stack

- Expo (React Native) + TypeScript + Expo Router
- Supabase (Postgres, Auth, Realtime, RLS)
- RevenueCat for subscriptions (added in Phase 5)
