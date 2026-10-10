-- OurDollar: money writes that can't be lost, doubled or half-done.
--
-- Two problems shared one cause: the phone worked out a balance and wrote the
-- answer, or did one logical save as several requests.
--
--   * Goals were updated as "saved = what this phone last saw + amount". With
--     two phones, or one left open on the Bills tab, the second write erased
--     the first: a partner's $500 vanished from the goal while the ledger
--     still said it went there.
--   * Income was a transaction insert followed by a second write to wherever
--     it was sent. A dropped signal between the two left money recorded as
--     "went to the goal" that never reached it.
--
-- Both now happen here, in one transaction, against the row as it actually is.
--
-- log_income also takes the id the phone generated for this entry. If a save
-- reached the database but its reply was lost, the household sees "Couldn't
-- save" and taps Save again; the second call finds that id already written and
-- does nothing, instead of logging the money twice.
--
-- Both are SECURITY INVOKER: they run as the caller, so the existing household
-- row-level security decides what they may read and write, exactly as the
-- direct table writes they replace did.

-- -------------------------------------------------------------- log_income --

create or replace function public.log_income(
  p_id uuid,
  p_household_id uuid,
  p_member_id uuid,
  p_amount numeric,
  p_category text,
  p_label text,
  p_occurred_on date,
  p_destination text,
  p_goal_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_amount numeric := round(p_amount, 2);
  v_dest text := coalesce(p_destination, 'this_week');
  v_room numeric;
  v_applied numeric;
  v_overflow numeric;
  v_note text := coalesce(nullif(trim(p_label), ''), 'Money in');
begin
  if v_amount is null or v_amount <= 0 then
    raise exception 'Income must be more than zero' using errcode = '22023';
  end if;
  if v_dest not in ('this_week', 'catch_up', 'goal', 'month', 'emergency_fund') then
    raise exception 'Unknown income destination %', v_dest using errcode = '22023';
  end if;

  -- One income at a time per household, so two arriving together can't both
  -- see the same room in a goal or the same catch-up balance and overfill it.
  perform pg_advisory_xact_lock(hashtextextended(p_household_id::text, 30));

  -- Already written: a retry of a save whose reply was lost.
  if exists (select 1 from transactions where id = p_id) then
    return jsonb_build_object('duplicate', true);
  end if;

  -- How much the destination can take. Goals stop at their target and
  -- catch-up at what's owed; the rest has no ceiling.
  if v_dest = 'goal' then
    select greatest(0, target_amount - saved_amount)
      into v_room
      from goals
     where id = p_goal_id and household_id = p_household_id
       for update;
    if not found then
      raise exception 'That goal no longer exists' using errcode = 'P0002';
    end if;
  elsif v_dest = 'catch_up' then
    select greatest(0, coalesce(sum(amount), 0))
      into v_room
      from catchup_entries
     where household_id = p_household_id;
  else
    v_room := v_amount;
  end if;

  v_applied := least(v_amount, v_room);
  v_overflow := v_amount - v_applied;

  -- What the destination can't absorb comes into this week as its own row,
  -- rather than disappearing. The entry's id goes on the first row written,
  -- which is what a retry checks for.
  if v_applied > 0 then
    insert into transactions
      (id, household_id, member_id, amount, category, label, type, is_fun_money, occurred_on, income_destination)
    values
      (p_id, p_household_id, p_member_id, v_applied, p_category, p_label, 'income', false, p_occurred_on, v_dest);
  end if;
  if v_overflow > 0 then
    insert into transactions
      (id, household_id, member_id, amount, category, label, type, is_fun_money, occurred_on, income_destination)
    values
      (case when v_applied > 0 then gen_random_uuid() else p_id end,
       p_household_id, p_member_id, v_overflow, p_category, p_label, 'income', false, p_occurred_on, 'this_week');
  end if;

  if v_applied > 0 then
    if v_dest = 'goal' then
      update goals set saved_amount = round(saved_amount + v_applied, 2) where id = p_goal_id;
    elsif v_dest = 'catch_up' then
      insert into catchup_entries (household_id, amount, kind, note, created_by_member_id)
      values (p_household_id, -v_applied, 'payment', v_note, p_member_id);
    elsif v_dest = 'emergency_fund' then
      insert into emergency_fund_entries (household_id, amount, kind, note, created_by_member_id)
      values (p_household_id, v_applied, 'deposit', v_note, p_member_id);
    elsif v_dest = 'month' then
      insert into extra_income (household_id, member_id, source, amount, occurred_on)
      values (p_household_id, p_member_id, coalesce(nullif(trim(p_label), ''), 'Extra income'), v_applied, p_occurred_on);
    end if;
  end if;

  return jsonb_build_object('duplicate', false, 'applied', v_applied, 'overflow', v_overflow);
end;
$$;

grant execute on function public.log_income(uuid, uuid, uuid, numeric, text, text, date, text, uuid) to authenticated;

-- ------------------------------------------------------ contribute_to_goal --

-- "Mark paid" on a goal: add this month's contribution, once. The amount comes
-- from the goal row itself, and the paid_this_month guard means two phones
-- tapping it (or one tapping twice on a slow connection) add it only once.
-- Returns the new saved amount, or null if it was already paid this month.
create or replace function public.contribute_to_goal(p_goal_id uuid)
returns numeric
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_saved numeric;
begin
  update goals
     set saved_amount = least(target_amount, round(saved_amount + monthly_amount, 2)),
         paid_this_month = true
   where id = p_goal_id
     and not paid_this_month
  returning saved_amount into v_saved;
  return v_saved;
end;
$$;

grant execute on function public.contribute_to_goal(uuid) to authenticated;
