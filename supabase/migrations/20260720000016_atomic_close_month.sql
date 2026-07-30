-- OurDollar — make closing a month atomic, and reset goals too.
--
-- Fixes two real bugs found in review:
--
-- 1. NON-ATOMIC CLOSE. The client did snapshot → carryovers → bill reset as
--    three separate requests. If it died after the snapshot landed (network
--    drop, backgrounded app, or the 15s request timeout), the month was
--    recorded as closed but bills were never reset and carryovers were lost —
--    and since pendingReviewMonth() then sees the month as already reviewed,
--    it never retried. The original "bills never reset" bug came back
--    permanently, with no recovery path. Doing the whole thing in one function
--    body makes it a single transaction: all of it happens, or none of it does.
--
-- 2. goals.paid_this_month WAS NEVER RESET. Contributing to a goal set it true
--    and nothing ever set it false, so the contribute action stayed hidden
--    forever after the first contribution. Same bug class as bills; now reset
--    as part of the same atomic close.
--
-- The bill figures are derived HERE rather than passed in, so the snapshot can
-- never disagree with the reset it's paired with. Plan figures (income, goals,
-- fun, allowance) still come from the client, which owns that math in
-- computeBudget() — no point duplicating it in SQL and risking drift.
--
-- SECURITY INVOKER (the default): runs as the caller, so household-scoped RLS
-- applies to every statement exactly as if the client had issued them.

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

  update public.bills
     set paid = false, paid_amount = null, paid_on = null, paid_by_member_id = null
   where household_id = p_household_id;

  update public.goals
     set paid_this_month = false
   where household_id = p_household_id
     and paid_this_month = true;

  return 'closed';
end;
$$;

grant execute on function public.close_month(uuid, date, numeric, numeric, numeric, numeric, numeric, numeric) to authenticated;

-- 3. "MARK PAID" ON A VARIES-AMOUNT CARRYOVER SILENTLY ACTED AS "DISMISS".
--    The old signature overloaded a null amount to mean "dismissed", so a bill
--    with no fixed amount could never actually be marked paid — the ✓ and
--    Dismiss buttons did the same thing. Paid-vs-dismissed is now an explicit
--    flag, and a paid-but-unknown-amount bill still credits the count (adding
--    0 to the amount, which is honest — we genuinely don't know what it was).
drop function if exists public.resolve_carryover(uuid, numeric, uuid);

create or replace function public.resolve_carryover(
  p_carryover_id uuid,
  p_mark_paid boolean,
  p_paid_amount numeric,
  p_settled_by_member_id uuid
)
returns boolean
language plpgsql
as $$
declare
  v_household_id uuid;
  v_from_month date;
begin
  update public.bill_carryovers
     set resolved = true,
         resolved_amount = case when p_mark_paid then p_paid_amount else null end,
         resolved_by_member_id = p_settled_by_member_id,
         resolved_on = current_date
   where id = p_carryover_id
     and resolved = false
   returning household_id, from_month into v_household_id, v_from_month;

  if v_household_id is null then
    return false;
  end if;

  -- Credit the month it was originally owed for, not the month it got paid in.
  if p_mark_paid then
    update public.month_snapshots
       set bills_paid_amount = bills_paid_amount + coalesce(p_paid_amount, 0),
           bills_paid_count = bills_paid_count + 1
     where household_id = v_household_id
       and month = v_from_month;
  end if;

  return true;
end;
$$;

grant execute on function public.resolve_carryover(uuid, boolean, numeric, uuid) to authenticated;
