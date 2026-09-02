-- OurDollar — give the emergency fund a target and a monthly amount.
--
-- 20260824000024 argued that a goal is the wrong shape for this fund, and the
-- parts that mattered are still true: it must never refuse money, and taking
-- money out is the whole point. What it left out is the part of a goal that
-- actually BUILDS a balance — a figure you're aiming at, and an amount set
-- aside every month before the week is divided up. Until now the only way in
-- was to tag arriving income, so a household with steady pay and no windfalls
-- could never start one.
--
-- Both halves are added here, minus the two goal rules that don't fit:
--
--   * The target is a marker, not a ceiling. Passing it changes the words on
--     screen and nothing else — a deposit is never refused, because the day
--     you need the fund is not the day you wanted to be told it was full.
--   * The monthly amount keeps being set aside after the target is passed.
--     What counts as "enough" moves with a household's own costs, and a
--     contribution that silently stopped would show up as a weekly allowance
--     that grew for no visible reason. Stop it by setting it to zero.

create table if not exists public.emergency_fund_settings (
  household_id uuid primary key references public.households (id) on delete cascade,
  -- What the household is aiming to have set aside. 0 means "no target yet",
  -- which is the honest starting state rather than a target of nothing.
  target_amount numeric(12, 2) not null default 0,
  -- Held back from the monthly plan before the weekly allowance is divided,
  -- exactly the way a savings goal's monthly amount is. This is what makes the
  -- fund grow on its own instead of only on the months something arrives.
  monthly_amount numeric(12, 2) not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.emergency_fund_settings enable row level security;

create policy emergency_fund_settings_all on public.emergency_fund_settings
  for all using (public.is_household_member(household_id) or public.owns_household(household_id))
  with check (public.is_household_member(household_id) or public.owns_household(household_id));

-- The planned monthly contribution is its own kind of movement, not a plain
-- deposit. It's the one that was already withheld from the weekly allowance,
-- so it must never also be charged to a week — and the history should say so
-- rather than leaving the household to work out which deposits cost them a
-- week's spending and which didn't.
alter table public.emergency_fund_entries
  drop constraint if exists emergency_fund_entries_kind_check;

alter table public.emergency_fund_entries
  add constraint emergency_fund_entries_kind_check
  check (kind in ('deposit', 'withdrawal', 'adjustment', 'monthly'));

-- Which month a planned contribution belongs to, as 'YYYY-MM'. Stored rather
-- than sliced out of created_at, which is UTC: a household putting December's
-- amount in on the evening of the 31st would otherwise have it recorded
-- against January and be asked for it twice.
alter table public.emergency_fund_entries
  add column if not exists month_key text;

-- One planned contribution per month, enforced here rather than in the app.
-- Goals track "did we pay this month" in a boolean that a migration once had
-- to go back and reset (20260720000016); a unique index can't drift, and it
-- also makes a double tap on two devices a no-op instead of a double charge.
create unique index if not exists idx_emergency_fund_monthly_once
  on public.emergency_fund_entries (household_id, month_key)
  where kind = 'monthly';

-- ---- The monthly amount has to reach the month's record too ----
--
-- A closed month stores its plan so a past month can still be explained. Its
-- weekly_allowance already reflects the fund (it's derived from what's left
-- after everything committed), but without its own column the Overview
-- breakdown for that month would have an unexplained gap exactly the size of
-- the contribution, and the "unallocated" row would quietly absorb it.
alter table public.month_snapshots
  add column if not exists emergency_monthly numeric(12, 2) not null default 0;

-- close_month gains that one argument. Dropped and recreated rather than
-- overloaded, so there's only ever one close_month to call. Everything else in
-- the body is unchanged — see 20260731000017 for the rest of the story.
drop function if exists public.close_month(uuid, date, numeric, numeric, numeric, numeric, numeric, numeric);

create or replace function public.close_month(
  p_household_id uuid,
  p_month date,
  p_total_income numeric,
  p_total_fixed numeric,
  p_goals_monthly numeric,
  p_goals_saved_total numeric,
  p_fun_total numeric,
  p_weekly_allowance numeric,
  p_emergency_monthly numeric default 0
)
returns text -- 'closed' | 'already-closed' | 'not-authorized'
language plpgsql
as $$
declare
  v_paid_amount numeric := 0;
  v_total_amount numeric := 0;
  v_paid_count integer := 0;
  v_total_count integer := 0;
  v_inserted integer := 0;
begin
  if not (public.is_household_member(p_household_id) or public.owns_household(p_household_id)) then
    return 'not-authorized';
  end if;

  -- Mirrors billMonthlyCost(): a paid bill counts what was actually paid,
  -- an unpaid one counts what it's expected to be.
  select
    coalesce(sum(case when paid then coalesce(paid_amount, amount, 0) else 0 end), 0),
    coalesce(sum(case when paid then coalesce(paid_amount, amount, 0) else coalesce(amount, 0) end), 0),
    count(*) filter (where paid),
    count(*)
  into v_paid_amount, v_total_amount, v_paid_count, v_total_count
  from public.bills
  where household_id = p_household_id;

  insert into public.month_snapshots (
    household_id, month, total_income, total_fixed, goals_monthly,
    goals_saved_total, fun_total, weekly_allowance, emergency_monthly,
    bills_paid_amount, bills_total_amount, bills_paid_count, bills_total_count
  )
  values (
    p_household_id, p_month, p_total_income, p_total_fixed, p_goals_monthly,
    p_goals_saved_total, p_fun_total, p_weekly_allowance, coalesce(p_emergency_monthly, 0),
    v_paid_amount, v_total_amount, v_paid_count, v_total_count
  )
  on conflict (household_id, month) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    -- Another device already closed this month; it also did the resets below.
    return 'already-closed';
  end if;

  -- Every bill still unpaid becomes its own carryover reminder.
  insert into public.bill_carryovers (household_id, bill_id, name, category, amount, from_month)
  select household_id, id, name, category, amount, p_month
  from public.bills
  where household_id = p_household_id
    and paid = false;

  -- Reset for the new month, promoting a corrected amount to the estimate.
  -- The snapshot above is already written, so the month just closed keeps its
  -- own history — only the forward-looking plan changes.
  update public.bills
     set amount = case
                    when paid and paid_amount is not null and amount is not null
                      then paid_amount
                    else amount
                  end,
         paid = false,
         paid_amount = null,
         paid_on = null,
         paid_by_member_id = null
   where household_id = p_household_id;

  update public.goals
     set paid_this_month = false
   where household_id = p_household_id
     and paid_this_month = true;

  -- The emergency fund deliberately has nothing to reset. "Has this month's
  -- amount gone in?" is answered by looking for a 'monthly' entry carrying
  -- this month's key, so there's no flag here to forget to clear.

  return 'closed';
end;
$$;

grant execute on function public.close_month(uuid, date, numeric, numeric, numeric, numeric, numeric, numeric, numeric) to authenticated;
