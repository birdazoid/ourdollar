-- OurDollar — carry a bill's corrected amount forward as next month's estimate.
--
-- A bill estimated at $421 that actually came in at $483 was, until now, reset
-- to a $421 estimate every single month: the household re-learned the same
-- surprise indefinitely, and the weekly allowance was re-derived from a figure
-- known to be wrong. Closing a month now promotes the paid figure to the
-- estimate, so next month is planned against what the bill actually costs.
--
-- Only bills that HAD an estimate are promoted. A `varies` bill is deliberately
-- estimate-less (its amount is null and the UI shows a dash); writing last
-- month's figure into it would silently turn it into a fixed bill.
--
-- Everything else about close_month is unchanged — see
-- 20260720000016_atomic_close_month.sql for why it's one function body.

create or replace function public.close_month(
  p_household_id uuid,
  p_month date,
  p_total_income numeric,
  p_total_fixed numeric,
  p_goals_monthly numeric,
  p_goals_saved_total numeric,
  p_fun_total numeric,
  p_weekly_allowance numeric
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
    goals_saved_total, fun_total, weekly_allowance,
    bills_paid_amount, bills_total_amount, bills_paid_count, bills_total_count
  )
  values (
    p_household_id, p_month, p_total_income, p_total_fixed, p_goals_monthly,
    p_goals_saved_total, p_fun_total, p_weekly_allowance,
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

  return 'closed';
end;
$$;

grant execute on function public.close_month(uuid, date, numeric, numeric, numeric, numeric, numeric, numeric) to authenticated;
