-- OurDollar — per-household week start day (TestFlight feedback).
-- 0 = Sunday … 6 = Saturday. Used to compute "this week" on the Week screen and
-- the add-expense day picker. Defaults to Sunday to match prior behaviour.
alter table public.households
  add column if not exists week_start_day smallint not null default 0
  check (week_start_day between 0 and 6);
