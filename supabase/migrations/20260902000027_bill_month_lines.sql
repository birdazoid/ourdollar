-- OurDollar — remember what each bill cost, month by month.
--
-- Until now a closed month recorded only its TOTAL (month_snapshots.total_fixed),
-- so "my bills are $686 lower than August" could be shown but never explained.
-- Which bill? Bills reset at close — paid, paid_amount, paid_on and
-- paid_by_member_id are all cleared, and the corrected amount is promoted to
-- next month's estimate — so once a month closes, that month's per-bill outcome
-- is gone for good.
--
-- Month close is therefore the only moment this can be captured, which is why
-- the insert below sits inside close_month, before the reset, in the same
-- transaction as the snapshot it belongs to. Either both land or neither does.
--
-- This cannot be backfilled. Months that closed before this migration have no
-- per-bill record and never will; the history starts at the next close.

create table if not exists public.bill_month_lines (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  month date not null, -- 'YYYY-MM-01', the month that closed
  -- Nulled rather than deleted when the bill itself is removed: the history of
  -- what a household paid stays true even once they stop paying it.
  bill_id uuid references public.bills (id) on delete set null,
  -- Copied, not joined. A renamed or recategorised bill must not silently
  -- rewrite what last March's statement said it was.
  name text not null,
  category text not null,
  -- What it was budgeted at when the month was planned. Null for a `varies`
  -- bill, which deliberately has no estimate.
  estimate numeric(12, 2),
  -- What it actually cost: the paid figure where known, else the estimate.
  -- Mirrors billMonthlyCost() in src/lib/money.ts.
  actual numeric(12, 2),
  paid boolean not null default false,
  created_at timestamptz not null default now(),
  -- One line per bill per month. close_month is already idempotent via the
  -- snapshot's own unique constraint; this is the second lock on the door.
  unique (household_id, month, bill_id)
);

-- The two ways this gets read: one bill down the months (its detail sheet),
-- and one month across the bills (explaining a total).
create index if not exists idx_bill_month_lines_bill
  on public.bill_month_lines (household_id, bill_id, month desc);
create index if not exists idx_bill_month_lines_month
  on public.bill_month_lines (household_id, month);

alter table public.bill_month_lines enable row level security;

create policy bill_month_lines_all on public.bill_month_lines
  for all using (public.is_household_member(household_id) or public.owns_household(household_id))
  with check (public.is_household_member(household_id) or public.owns_household(household_id));

-- ---- close_month captures the lines ----
--
-- Same signature as 20260902000025, so this replaces that body rather than
-- adding an overload. Everything else is unchanged; the only addition is the
-- bill_month_lines insert, placed after the snapshot (so it never runs on an
-- already-closed month) and before the reset (so it can still see the truth).

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

  -- Per-bill history for the month just closed. This is the last moment the
  -- per-bill outcome exists: the reset further down clears paid/paid_amount
  -- and promotes the corrected figure, after which only the total survives.
  -- `actual` mirrors billMonthlyCost(), so a line and the snapshot total it
  -- contributed to are always derived the same way.
  insert into public.bill_month_lines (
    household_id, month, bill_id, name, category, estimate, actual, paid
  )
  select
    household_id,
    p_month,
    id,
    name,
    category,
    amount,
    case when paid then coalesce(paid_amount, amount) else amount end,
    paid
  from public.bills
  where household_id = p_household_id
  on conflict (household_id, month, bill_id) do nothing;

  -- Every bill still unpaid becomes its own carryover reminder.
  insert into public.bill_carryovers (household_id, bill_id, name, category, amount, from_month)
  select household_id, id, name, category, amount, p_month
  from public.bills
  where household_id = p_household_id
    and paid = false;

  -- Reset for the new month, promoting a corrected amount to the estimate.
  -- The snapshot and the bill lines above are already written, so the month
  -- just closed keeps its own history — only the forward-looking plan changes.
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

-- ---- resolving a carryover has to correct the line too ----
--
-- A bill still unpaid when its month closed is recorded as paid = false, which
-- is true at that instant. Paying it later already credits the month's totals
-- (that's the whole point of resolve_carryover); without the matching update
-- below, the per-bill line would go on saying "unpaid" forever while the
-- month total said otherwise — two records of the same fact, disagreeing.

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
  v_bill_id uuid;
begin
  update public.bill_carryovers
     set resolved = true,
         resolved_amount = case when p_mark_paid then p_paid_amount else null end,
         resolved_by_member_id = p_settled_by_member_id,
         resolved_on = current_date
   where id = p_carryover_id
     and resolved = false
   returning household_id, from_month, bill_id
   into v_household_id, v_from_month, v_bill_id;

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

    -- And the bill's own line for that month. coalesce keeps the estimate as
    -- the actual when a `varies` bill is settled without an amount, rather
    -- than blanking a figure that was already the best one available.
    if v_bill_id is not null then
      update public.bill_month_lines
         set paid = true,
             actual = coalesce(p_paid_amount, actual)
       where household_id = v_household_id
         and month = v_from_month
         and bill_id = v_bill_id;
    end if;
  end if;

  return true;
end;
$$;

grant execute on function public.resolve_carryover(uuid, boolean, numeric, uuid) to authenticated;
