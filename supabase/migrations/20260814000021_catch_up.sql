-- OurDollar — the catch-up balance.
--
-- A week that finishes badly over had only two honest endings before this:
-- carry the whole overage into next week, or write it off. Carrying works for
-- $20 and collapses under $563 — next week starts negative, so it overspends
-- too, and the number grows. So households dismissed it, and the money left
-- the books entirely with no record it had ever been owed.
--
-- The catch-up balance is the third ending. It records what was overspent
-- without any single week absorbing it, and it can be paid down over time from
-- weeks that finish under or from real money (selling something, a bonus).
--
-- It deliberately does NOT touch the weekly allowance. That is the whole point:
-- a bad week can't cascade into the next one. The trade is that a debt costing
-- nothing week to week is easy to ignore, which is why it's shown on Bills
-- beside the savings goals and surfaced again at month close.
--
-- No balance column anywhere: the balance is the SUM of these rows, so it can
-- never drift out of step with its own history.

create table if not exists public.catchup_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  -- Signed. Positive ADDS to what's owed (an overage), negative pays it down.
  amount numeric(12, 2) not null,
  kind text not null check (kind in ('week_overage', 'payment', 'adjustment')),
  note text,
  -- Set when kind = 'week_overage', so an entry can name the week it came from.
  source_week_start date,
  created_by_member_id uuid references public.household_members (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_catchup_household on public.catchup_entries (household_id, created_at desc);

alter table public.catchup_entries enable row level security;

create policy catchup_entries_all on public.catchup_entries
  for all using (public.is_household_member(household_id) or public.owns_household(household_id))
  with check (public.is_household_member(household_id) or public.owns_household(household_id));

-- Settling a week can now send the result to catch-up instead of carrying it
-- into next week or writing it off.
alter table public.week_rollovers
  drop constraint if exists week_rollovers_resolution_check;

alter table public.week_rollovers
  add constraint week_rollovers_resolution_check
  check (resolution in ('carry_forward', 'goal', 'dismiss', 'catch_up'));
