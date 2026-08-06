# Turning Premium on

Everything needed to enforce plan limits is already deployed and switched off.
This is the checklist for switching it on. Written 2026-08-06, when the
entitlements migration went live.

## What's already in place

- `public.app_config` holds the free-tier limits and the master switch. One row.
- `BEFORE INSERT` triggers on `households`, `household_members` and `goals` check
  those limits and raise under SQLSTATE `OD001`. They return early while the
  switch is off.
- `public.effective_tier()` / `household_tier()` / `my_tier()` resolve who is
  Premium. Limits key off the **household owner's** tier, so one payer covers a
  whole household.
- [`src/lib/limits.ts`](../src/lib/limits.ts) mirrors the thresholds for the UI.

## The flip

```sql
update public.app_config set enforce_entitlements = true;
alter table public.accounts alter column founding_user set default false;
```

Plus `ENTITLEMENTS_ENFORCED = true` in [`src/lib/limits.ts`](../src/lib/limits.ts).

**Run the two SQL statements as one unit.** They are separable but shouldn't be
separated. `founding_user` currently defaults to `true`, which is what
grandfathers everyone who signs up before Premium exists, honouring the pricing
page's "use the free tier for as long as you like". Anyone created while the
default is still `true` keeps Premium permanently; existing rows are never
touched by the `alter`.

Leave a gap between the two and you get a cohort who are neither grandfathered
nor aware limits exist, which is the group that writes one-star reviews when
their third savings goal stops saving.

## Order of operations

Ship the client change **before** the database change.

| Client | Database | Result |
| --- | --- | --- |
| enforced | not enforced | UI blocks at the limit, DB would allow. Harmless. |
| not enforced | enforced | UI offers the action, DB rejects it. Ugly. |

So: release the build with `ENTITLEMENTS_ENFORCED = true`, give it time to reach
people, then run the SQL. Old app versions will always exist in the wild, which
is what `isLimitError()` is for. Any mutation that can hit a limit should catch
it and show the upgrade prompt rather than a generic failure.

## Before any of that

- [ ] **Test the refusal path.** It has never been exercised. Needs Docker:
      `npx supabase start`, flip `enforce_entitlements` locally, confirm a third
      goal fails with `OD001` and that the message reaches the UI.
- [ ] **Wire the call sites.** Nothing imports `limits.ts` yet. The add-goal,
      add-member and create-household flows need to check `isAtLimit()` and
      catch `isLimitError()`.
- [ ] **Decide on pending invites.** `check_member_limit` counts them against the
      seat cap, on the reasoning that an offered seat is spoken for. If you'd
      rather only count accepted members, it's one `where` clause.
- [ ] **RevenueCat.** Nothing writes `subscription_tier`, `plan_source` or
      `plan_expires_at` yet. Until a purchase can set them, the only route to
      Premium is `founding_user`.
- [ ] **The non-countable tiers.** History depth, CSV/PDF export and configurable
      reminders are on the pricing page but aren't counts, so they need feature
      flags rather than these triggers.

## Rollback

The switch is the rollback. Nothing is destructive and no rows are deleted.

```sql
update public.app_config set enforce_entitlements = false;
```

Limits stop applying immediately, including for people mid-action. Restoring the
`founding_user` default is separate and only matters if you also want new
signups grandfathered again:

```sql
alter table public.accounts alter column founding_user set default true;
```

## Granting Premium by hand

`founding_user` survives as a manual override, for support gestures or comping
an account:

```sql
update public.accounts set founding_user = true where email = 'someone@example.com';
```
