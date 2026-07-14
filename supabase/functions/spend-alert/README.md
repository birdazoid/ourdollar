# spend-alert edge function

Sends the real-time spend alert (design-brief §2). Fired by a Database Webhook
on `transactions` INSERT: when a member logs an expense, every *other* household
member who has an account, a registered push token, and `notify_on_spend = true`
gets an Expo push naming the spender, amount, category, and the updated weekly
balance. Solo households and accountless members are a no-op; the spender never
notifies themselves.

It runs with the service role (auto-injected by Supabase) because reading other
members' `push_tokens` is deliberately blocked for the client by RLS.

## Status

- ✅ Logic verified against the live DB via `npm run verify:spend-alert`
  (recipient selection, weekly-balance math, message text, Expo send accepted —
  a real push was delivered to the primary device).
- ⬜ Not yet deployed, and the Database Webhook is not yet created.
- ⬜ True multi-device delivery (a genuinely separate recipient) needs a 2nd
  account signed in on a 2nd device.

## Deploy (needs the Supabase CLI or dashboard — the CLI isn't installed here)

The function imports `./logic.ts`, so deploy with the CLI, which bundles both
files automatically:

```bash
npx supabase login                                   # opens a browser
npx supabase link --project-ref cxrjlqzvfvubvcrftihq
npx supabase functions deploy spend-alert --no-verify-jwt
```

`--no-verify-jwt` lets the Database Webhook call it without minting a user JWT.
The endpoint only acts on webhook payloads and does no client-trusting reads, so
this is acceptable for now; a shared-secret header can be added later to harden.

## Create the Database Webhook

Supabase dashboard → **Database → Webhooks → Create a new hook**:

- **Table:** `transactions`, **Events:** `Insert`
- **Type:** *Supabase Edge Functions* → select **spend-alert**
  (this sends `{ type, table, record, ... }` with the new row as `record`)
- Method `POST`, default timeout is fine.

## Verify on device

1. Sign a *second* account into the app on a *second* device and let it register
   for push (Profile → make sure that member has an account and Spend alerts on).
2. From a *different* member, log an expense on the Week screen.
3. The second device should receive: *"{name} spent {amount} on {category} —
   {balance} left this week"*.

Until then, `npm run verify:spend-alert` exercises the same logic server-side and
sends to whichever recipient device is registered.
