-- OurDollar: one membership per person per household.
--
-- Nothing stopped a person from being in the same household twice. Inviting
-- an email that already belongs to a member made a placeholder row, and
-- accepting it linked that row to an account that already had one. The
-- roster then showed the person twice, and their spending split between the
-- two rows depending on which one a transaction happened to name.
--
-- Four locks, each covering a different door:
--   1. Existing duplicates are merged into one row (everything that pointed at
--      the extra row is moved to the kept one first, so no history is lost).
--   2. A unique index: one row per account per household. This is the lock
--      that can't drift, whatever path a row arrives by.
--   3. A unique index: one waiting invite per email per household.
--   4. An insert check that refuses an invite to someone already in the
--      household, or one that's already waiting, with words a person can read.
-- And accepting an invite to a household you're already in now just tidies
-- the stray invite away instead of linking a second row.

-- --------------------------------------------------------- 1. merge copies --

do $$
declare
  r record;
  fk record;
begin
  -- Keep the admin row if there is one, otherwise the oldest.
  for r in
    select id as dup_id, keeper_id
      from (
        select id,
               first_value(id) over w as keeper_id,
               row_number() over w as rn
          from public.household_members
         where account_id is not null
        window w as (partition by household_id, account_id order by is_admin desc, created_at asc)
      ) ranked
     where rn > 1
  loop
    -- fun_money_people allows one allotment per member. If the kept row has
    -- one, the extra row's allotment goes rather than colliding.
    delete from public.fun_money_people f
     where f.member_id = r.dup_id
       and exists (
         select 1 from public.fun_money_people k
          where k.member_id = r.keeper_id and k.household_id = f.household_id
       );

    -- Repoint every column that references a member row. Read from the
    -- catalog so a table added later can't be missed.
    for fk in
      select c.conrelid::regclass as tbl, a.attname as col
        from pg_constraint c
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
       where c.contype = 'f'
         and c.confrelid = 'public.household_members'::regclass
    loop
      execute format('update %s set %I = $1 where %I = $2', fk.tbl, fk.col, fk.col)
        using r.keeper_id, r.dup_id;
    end loop;

    delete from public.household_members where id = r.dup_id;
  end loop;
end;
$$;

-- --------------------------------------------------------- 2 + 3. indexes --

create unique index if not exists idx_household_members_one_per_account
  on public.household_members (household_id, account_id)
  where account_id is not null;

create unique index if not exists idx_household_members_one_invite_per_email
  on public.household_members (household_id, lower(trim(invite_email)))
  where invite_pending and invite_email is not null;

-- ------------------------------------------------------- 4. invite checks --

-- SECURITY DEFINER because a member's email lives in auth.users, which the
-- inviter can't read. Only a yes/no ever leaves this function.
create or replace function public.check_invite_not_duplicate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(new.invite_email));
begin
  if v_email is null or v_email = '' or new.account_id is not null then
    return new;
  end if;

  if exists (
    select 1
      from public.household_members hm
      join auth.users u on u.id = hm.account_id
     where hm.household_id = new.household_id
       and lower(trim(u.email)) = v_email
  ) then
    raise exception 'That person is already in this household.'
      using errcode = 'OD002';
  end if;

  if exists (
    select 1
      from public.household_members hm
     where hm.household_id = new.household_id
       and hm.invite_pending
       and lower(trim(hm.invite_email)) = v_email
  ) then
    raise exception 'That email already has an invite waiting.'
      using errcode = 'OD002';
  end if;

  return new;
end;
$$;

drop trigger if exists household_members_invite_check on public.household_members;
create trigger household_members_invite_check
  before insert on public.household_members
  for each row execute function public.check_invite_not_duplicate();

-- ------------------------------------------------------ accepting invites --

-- Same as 20260716000010, plus: if the caller is already in that household,
-- the invite is spent. Remove the placeholder and report success, since the
-- person is in the household either way.
create or replace function public.accept_invite(p_member_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_name text;
  v_avatar text;
  v_household uuid;
  v_updated integer;
begin
  select lower(trim(email)) into v_email from auth.users where id = auth.uid();
  if v_email is null then
    return false;
  end if;

  select hm.household_id into v_household
    from public.household_members hm
   where hm.id = p_member_id
     and hm.account_id is null
     and hm.invite_email is not null
     and lower(trim(hm.invite_email)) = v_email;
  if v_household is null then
    return false;
  end if;

  if exists (
    select 1 from public.household_members
     where household_id = v_household and account_id = auth.uid()
  ) then
    delete from public.household_members where id = p_member_id;
    return true;
  end if;

  select name, avatar into v_name, v_avatar from public.accounts where id = auth.uid();

  update public.household_members hm
     set account_id     = auth.uid(),
         has_account    = true,
         invite_pending = false,
         name           = coalesce(v_name, hm.name),
         avatar         = coalesce(v_avatar, hm.avatar)
   where hm.id = p_member_id
     and hm.account_id is null;

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

-- The older auto-claim (20260714000004), kept for tests. Same rule: invites to
-- a household the caller is already in are removed, not linked.
create or replace function public.claim_pending_invites()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_count integer;
begin
  select lower(trim(email)) into v_email from auth.users where id = auth.uid();
  if v_email is null then
    return 0;
  end if;

  delete from public.household_members hm
   where hm.account_id is null
     and hm.invite_email is not null
     and lower(trim(hm.invite_email)) = v_email
     and exists (
       select 1 from public.household_members mine
        where mine.household_id = hm.household_id and mine.account_id = auth.uid()
     );

  with claimed as (
    update public.household_members hm
       set account_id     = auth.uid(),
           has_account    = true,
           invite_pending = false
     where hm.account_id is null
       and hm.invite_email is not null
       and lower(trim(hm.invite_email)) = v_email
    returning hm.id
  )
  select count(*) into v_count from claimed;

  return coalesce(v_count, 0);
end;
$$;
