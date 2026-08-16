-- OurDollar — what each week was actually worth.
--
-- The app never recorded a week's weekly allowance. It recalculated it on every
-- view from TODAY'S income and bills, so editing your income rewrote history:
-- a week settled at $563.25 over later read as $592.75 over, because a pay rise
-- had raised the weekly figure by $78 after the fact.
--
-- Standard practice, in budgeting apps and in accounting generally, is to
-- adjust forward and never restate a closed period. This table is that record.
-- The current week's figure is refreshed while the week is running; once the
-- week ends nothing touches it again.
--
-- Only weekly_allowance is stored because it is the only floating input. Spend
-- comes from transactions, which can't be edited outside the current week, and
-- money carried in is already persisted on week_rollovers.

create table if not exists public.week_results (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  week_start date not null, -- always a week-start day for this household
  weekly_allowance numeric(12, 2) not null, -- what the week was worth AT THE TIME
  recorded_at timestamptz not null default now(),
  unique (household_id, week_start)
);

create index if not exists idx_week_results_household on public.week_results (household_id);
create index if not exists idx_week_results_week on public.week_results (household_id, week_start);

alter table public.week_results enable row level security;

create policy week_results_all on public.week_results
  for all using (public.is_household_member(household_id) or public.owns_household(household_id))
  with check (public.is_household_member(household_id) or public.owns_household(household_id));
