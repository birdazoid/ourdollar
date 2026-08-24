-- OurDollar — the emergency fund.
--
-- A pot you add to and take from. Close to a savings goal, but three things
-- make a goal the wrong shape for it:
--
--   1. A goal clamps at its target, so it refuses money once "finished". An
--      emergency fund is never finished.
--   2. A goal has no withdrawal. Taking money out is the entire point here.
--   3. "Funded! 🎉" is the wrong story for money you hope never to spend.
--
-- Same shape as catchup_entries, and for the same reason: the balance is the
-- SUM of its rows rather than a stored number, so the figure and its own
-- history can never drift apart.
--
-- Taking money out also raises the week it's taken in, via an ordinary income
-- transaction. That's what makes an emergency cost nothing from the weekly
-- budget: $500 out of the fund and a $500 repair logged against the week
-- cancel each other exactly.

create table if not exists public.emergency_fund_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  -- Signed. Positive puts money in, negative takes it out.
  amount numeric(12, 2) not null,
  kind text not null check (kind in ('deposit', 'withdrawal', 'adjustment')),
  note text,
  created_by_member_id uuid references public.household_members (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_emergency_fund_household
  on public.emergency_fund_entries (household_id, created_at desc);

alter table public.emergency_fund_entries enable row level security;

create policy emergency_fund_entries_all on public.emergency_fund_entries
  for all using (public.is_household_member(household_id) or public.owns_household(household_id))
  with check (public.is_household_member(household_id) or public.owns_household(household_id));

-- Arriving money can now be sent to the fund.
alter table public.transactions
  drop constraint if exists transactions_income_destination_check;

alter table public.transactions
  add constraint transactions_income_destination_check
  check (
    income_destination is null
    or income_destination in ('this_week', 'catch_up', 'goal', 'month', 'emergency_fund')
  );
