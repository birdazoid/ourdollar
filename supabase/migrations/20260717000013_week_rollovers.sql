-- OurDollar — week rollover / overage settlement.
--
-- When a new week starts, if the just-ended week finished with money left over
-- or over budget, the household is asked what to do with it: carry it into the
-- new week's free-to-spend, put it toward (or take it from) a savings goal, or
-- just reset clean. One row per (household, ended week) — recorded once so the
-- prompt never repeats for that week, and `applied_amount` (only set for
-- carry_forward) is summed into whichever week it targets.

create table if not exists public.week_rollovers (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  from_week_start date not null, -- the week that just ended
  to_week_start date not null, -- the week the resolution applies to (usually from_week_start + 7d)
  amount numeric(12, 2) not null, -- signed: positive = leftover, negative = overage
  resolution text not null check (resolution in ('carry_forward', 'goal', 'dismiss')),
  applied_amount numeric(12, 2) not null default 0, -- non-zero only for carry_forward
  goal_id uuid references public.goals (id) on delete set null,
  settled_by_member_id uuid references public.household_members (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (household_id, from_week_start)
);

create index if not exists idx_week_rollovers_household on public.week_rollovers (household_id);
create index if not exists idx_week_rollovers_to_week on public.week_rollovers (household_id, to_week_start);

alter table public.week_rollovers enable row level security;

create policy week_rollovers_all on public.week_rollovers
  for all using (public.is_household_member(household_id) or public.owns_household(household_id))
  with check (public.is_household_member(household_id) or public.owns_household(household_id));
