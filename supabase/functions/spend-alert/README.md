# spend-alert edge function

Sends the real-time spend alert (design-brief §2). Fired by a Database Webhook
on `transactions` INSERT: when a member logs an expense, every *other* household
member who has an account, a registered push token, and `notify_on_spend = true`
gets an Expo push naming the spender, amount, category, and the updated weekly
balance. Solo households and accountless members are a no-op; the spender never
notifies themselves.

It runs with the service role (auto-injected by Supabase) because reading other
members' `push_tokens` is deliberately blocked for the client by RLS.

## The balance in the message

The figure has to be the *same* number the Week screen shows, or the push is
worse than no push. Every input the Week screen uses has to be replicated here,
because Deno can't import `src/lib/*`:

| Input | Source |
| --- | --- |
| Income, incl. biweekly (26/12) and weekly (52/12) | `income_sources`, `extra_income` |
| Bills at their **estimate**, variance spread over the weeks left | `bills` |
| Goals and fun money | `goals`, `fun_money_settings`, `fun_money_people` |
| Weeks in the period (4 or 5, never a fixed 4) | derived, see `logic.ts` |
| Planned-category reservations and overages | `weekly_envelopes` |
| **Money carried in from settling last week** | `week_rollovers.applied_amount` |
| The week's own spending and money back | `transactions` |

All date math is anchored to the new transaction's `occurred_on`, which the app
writes as the household's **local** date. The server clock is UTC, so anchoring
to it dated an evening expense to tomorrow and, on the last day of a week or
period, quoted a different week than the app was showing.

`npm run verify:spend-alert` pins every one of these to the client's own
functions and fails on any drift. Add a guard there before changing this math.

## Status

- ✅ Logic verified against the live DB via `npm run verify:spend-alert`
  (recipient selection, weekly-balance math, message text, Expo send accepted —
  a real push was delivered to the primary device).
- ✅ Deployed, with the Database Webhook live.
- ⚠️ `logic.ts` changes need a **redeploy** to take effect (see below) — the
  verify script exercises the local copy, not what Supabase is running.
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
