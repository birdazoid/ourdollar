-- OurDollar — broaden the month-close snapshot to the full budget plan, and add
-- atomic retroactive credit for late-paid carryovers.
--
-- `bill_month_snapshots` (added last migration) only captured bill totals. For
-- "how has spending/income changed over time" insights, the household's whole
-- plan needs to be captured too — income, fixed bills, goals, fun money, weekly
-- allowance. Renaming while the table is brand new (no real households have
-- written to it yet) rather than carrying a bill-specific name forward.

alter table public.bill_month_snapshots rename to month_snapshots;
alter policy bill_month_snapshots_all on public.month_snapshots rename to month_snapshots_all;

alter table public.month_snapshots
  add column if not exists total_income numeric(12, 2) not null default 0,
  add column if not exists total_fixed numeric(12, 2) not null default 0,
  add column if not exists goals_monthly numeric(12, 2) not null default 0,
  add column if not exists goals_saved_total numeric(12, 2) not null default 0, -- point-in-time sum of goals.saved_amount
  add column if not exists fun_total numeric(12, 2) not null default 0,
  add column if not exists weekly_allowance numeric(12, 2) not null default 0;

-- bill_carryovers.bill_id still points at a real bills row (or null if that bill
-- was since deleted) — no changes needed there.

-- Resolving a carryover as PAID should credit the amount back to the month it
-- was originally owed for (from_month), not the month it happened to get paid
-- in. SECURITY INVOKER (the default) — runs with the caller's own privileges, so
-- the existing household-scoped RLS on both tables applies exactly as if the
-- caller ran these updates directly. Wrapping both updates in one function call
-- makes them atomic (a function body is one implicit transaction), avoiding a
-- lost-update race if two members resolve carryovers for the same month at once.
create or replace function public.resolve_carryover(
  p_carryover_id uuid,
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
         resolved_amount = p_paid_amount,
         resolved_by_member_id = p_settled_by_member_id,
         resolved_on = current_date
   where id = p_carryover_id
     and resolved = false
   returning household_id, from_month into v_household_id, v_from_month;

  if v_household_id is null then
    return false;
  end if;

  if p_paid_amount is not null then
    update public.month_snapshots
       set bills_paid_amount = bills_paid_amount + p_paid_amount,
           bills_paid_count = bills_paid_count + 1
     where household_id = v_household_id
       and month = v_from_month;
  end if;

  return true;
end;
$$;

grant execute on function public.resolve_carryover(uuid, numeric, uuid) to authenticated;
