-- OurDollar: settling a week can be changed.
--
-- The "last week wrapped up" sheet recorded "just move on" when it was closed
-- with the X. A household closed it meaning "not now", the overage was written
-- off, and nothing on screen said so or offered a way back. A decision about
-- real money has to be visible afterwards and changeable.
--
-- Two things make a decision undoable exactly:
--   * goal_applied: what the goal ACTUALLY moved by. The goal is clamped
--     between 0 and its target, so the week's amount isn't always what moved;
--     undoing by the week's amount would hand back money the goal never gave.
--   * catchup_entry_id: the catch-up row this settlement wrote, so undoing it
--     removes that row and nothing else.
--
-- Both writes now happen in one function, so a settlement can't half-land
-- (catch-up written, week not marked settled, prompt shows again, and a
-- second tap writes the overage to catch-up twice).

alter table public.week_rollovers
  add column if not exists goal_applied numeric(12, 2), -- null on rows settled before this migration
  add column if not exists catchup_entry_id uuid references public.catchup_entries (id) on delete set null;

-- ------------------------------------------------------------------ settle --

create or replace function public.settle_week_rollover(
  p_household_id uuid,
  p_from date,
  p_to date,
  p_amount numeric,
  p_resolution text,
  p_goal_id uuid default null,
  p_member_id uuid default null,
  p_note text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_saved numeric(12, 2);
  v_target numeric(12, 2);
  v_goal_applied numeric(12, 2);
  v_owed numeric(12, 2);
  v_pay numeric(12, 2);
  v_catchup_id uuid;
  v_id uuid;
begin
  if p_resolution = 'goal' then
    select saved_amount, target_amount into v_saved, v_target
      from public.goals
     where id = p_goal_id and household_id = p_household_id
       for update;
    if not found then
      raise exception 'That savings goal is no longer there.';
    end if;
    v_goal_applied := greatest(0, case when v_target > 0 then least(v_target, v_saved + p_amount) else v_saved + p_amount end) - v_saved;
    update public.goals set saved_amount = v_saved + v_goal_applied where id = p_goal_id;

  elsif p_resolution = 'catch_up' then
    if p_amount < 0 then
      -- An overage becomes a positive amount owed.
      insert into public.catchup_entries (household_id, amount, kind, note, source_week_start, created_by_member_id)
      values (p_household_id, -p_amount, 'week_overage', p_note, p_from, p_member_id)
      returning id into v_catchup_id;
    else
      -- Never pay off more than is owed, or the balance would go negative and
      -- read as the household being owed money.
      select coalesce(sum(amount), 0) into v_owed
        from public.catchup_entries where household_id = p_household_id;
      v_pay := least(p_amount, greatest(v_owed, 0));
      if v_pay > 0 then
        insert into public.catchup_entries (household_id, amount, kind, note, source_week_start, created_by_member_id)
        values (p_household_id, -v_pay, 'payment', p_note, p_from, p_member_id)
        returning id into v_catchup_id;
      end if;
    end if;
  end if;

  insert into public.week_rollovers (
    household_id, from_week_start, to_week_start, amount, resolution,
    applied_amount, goal_id, goal_applied, catchup_entry_id, settled_by_member_id
  ) values (
    p_household_id, p_from, p_to, p_amount, p_resolution,
    case when p_resolution = 'carry_forward' then p_amount else 0 end,
    case when p_resolution = 'goal' then p_goal_id end,
    v_goal_applied, v_catchup_id, p_member_id
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- ------------------------------------------------------------------ reopen --

-- Puts everything a settlement did back the way it was and removes the
-- settlement, so the week asks its question again.
create or replace function public.reopen_week_rollover(p_household_id uuid, p_from date)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  r public.week_rollovers%rowtype;
begin
  select * into r
    from public.week_rollovers
   where household_id = p_household_id and from_week_start = p_from
     for update;
  if not found then
    return;
  end if;

  if r.resolution = 'goal' and r.goal_id is not null then
    -- Rows settled before goal_applied existed fall back to the week's amount,
    -- kept inside the goal's 0..target range.
    update public.goals
       set saved_amount = greatest(0, case when target_amount > 0
             then least(target_amount, saved_amount - coalesce(r.goal_applied, r.amount))
             else saved_amount - coalesce(r.goal_applied, r.amount) end)
     where id = r.goal_id;
  end if;

  if r.resolution = 'catch_up' then
    if r.catchup_entry_id is not null then
      delete from public.catchup_entries where id = r.catchup_entry_id;
    else
      -- Settled before catchup_entry_id existed: the settlement's row is the
      -- one naming this week as its source. Only settlements write a source
      -- week, one per week, so this can't pick up anything else.
      delete from public.catchup_entries
       where id = (
         select id from public.catchup_entries
          where household_id = p_household_id
            and source_week_start = p_from
            and kind in ('week_overage', 'payment')
          order by created_at desc
          limit 1
       );
    end if;
  end if;

  delete from public.week_rollovers where id = r.id;
end;
$$;

grant execute on function public.settle_week_rollover(uuid, date, date, numeric, text, uuid, uuid, text) to authenticated;
grant execute on function public.reopen_week_rollover(uuid, date) to authenticated;
