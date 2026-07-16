-- OurDollar — Phase 8+ (weekly envelopes / "planned spending").
--
-- Constant weekly variable costs (groceries ~$250, gas ~$100) are predictable
-- but not truly free — they should be reserved out of the weekly allowance so
-- the leftover is the honest free-to-spend number. An envelope is simply an
-- existing transaction CATEGORY given a weekly dollar target; it auto-drains
-- from logged (non-fun) expenses whose category matches (computed client-side).
--
-- Household-level, one envelope per category. `skipped_week_start` is a
-- self-resetting "skip this week" flag: an envelope counts as skipped only when
-- the stored date equals the current week's start date, so it clears itself on
-- the next week with no cron/cleanup.

create table if not exists public.weekly_envelopes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  category text not null,
  weekly_amount numeric(12, 2) not null default 0,
  skipped_week_start date,
  created_at timestamptz not null default now(),
  unique (household_id, category)
);

create index if not exists idx_weekly_envelopes_household
  on public.weekly_envelopes (household_id);

alter table public.weekly_envelopes enable row level security;

-- Same household-scoped access as every other household-owned table
-- (owns_household included so an owner can seed envelopes in a brand-new one).
create policy weekly_envelopes_all on public.weekly_envelopes
  for all using (public.is_household_member(household_id) or public.owns_household(household_id))
  with check (public.is_household_member(household_id) or public.owns_household(household_id));
