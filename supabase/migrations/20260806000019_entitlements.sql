-- OurDollar — plan entitlements.
--
-- Builds on the subscription_status/subscription_tier stub from the initial
-- schema rather than adding a parallel concept. Three things land here:
--
--   1. The account columns needed to answer "is this person Premium right now".
--   2. A single-row app_config holding the free-tier limits and, crucially, a
--      master switch that is OFF. Every code path exists and is exercised, but
--      nothing is refused until enforce_entitlements flips to true.
--   3. BEFORE INSERT triggers that enforce the counts server-side.
--
-- Triggers rather than RLS policies for the count limits: a WITH CHECK that
-- counts sibling rows re-enters the same table's policies, and an RLS denial
-- surfaces as an opaque "violates row-level security" with no way to tell the
-- user *which* limit they hit. A trigger raises a specific message under
-- SQLSTATE OD001, which the client can map to an upgrade prompt.
--
-- Limits are keyed to the household OWNER's tier, so one payer upgrades the
-- whole household rather than every member needing their own subscription.

-- ---------------------------------------------------------------- accounts --

alter table public.accounts
  add column if not exists plan_source text,
  add column if not exists plan_expires_at timestamptz,
  -- Defaults TRUE deliberately. Every account that exists before Premium ships
  -- is a founding user and keeps current behaviour permanently, honouring the
  -- pricing page's "use the free tier for as long as you like". Flip this
  -- default to false in the same migration that turns enforcement on; existing
  -- rows keep the true they were created with.
  add column if not exists founding_user boolean not null default true;

-- conname is only unique per table, so each guard is scoped to accounts.
do $$
declare
  rel constant oid := 'public.accounts'::regclass;
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = rel and conname = 'accounts_subscription_tier_check'
  ) then
    alter table public.accounts
      add constraint accounts_subscription_tier_check
      check (subscription_tier in ('free', 'premium'));
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = rel and conname = 'accounts_subscription_status_check'
  ) then
    alter table public.accounts
      add constraint accounts_subscription_status_check
      check (subscription_status in ('free', 'active', 'in_grace', 'expired', 'cancelled'));
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = rel and conname = 'accounts_plan_source_check'
  ) then
    alter table public.accounts
      add constraint accounts_plan_source_check
      check (plan_source is null or plan_source in ('app_store', 'play', 'grandfathered', 'manual'));
  end if;
end $$;

-- Counting a person's households is now a hot path for the limit check.
create index if not exists idx_households_owner on public.households (owner_account_id);

-- -------------------------------------------------------------- app_config --

-- Single row, enforced by a primary key that can only ever be true.
create table if not exists public.app_config (
  id boolean primary key default true check (id),
  enforce_entitlements boolean not null default false,
  free_max_households smallint not null default 1,
  free_max_members smallint not null default 2,
  free_max_goals smallint not null default 2,
  updated_at timestamptz not null default now()
);

insert into public.app_config (id) values (true) on conflict (id) do nothing;

alter table public.app_config enable row level security;

-- Readable by any signed-in user so the UI can show "2 of 2 goals used".
-- No insert/update/delete policies exist, so writes are service-role only.
drop policy if exists app_config_select on public.app_config;
create policy app_config_select on public.app_config
  for select to authenticated using (true);

-- --------------------------------------------------------------- functions --

-- The tier that actually applies to an account right now, accounting for
-- founding status and expiry. SECURITY DEFINER because the caller is usually
-- checking a *household owner* who is not themselves.
create or replace function public.effective_tier(uid uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select case
    when a.founding_user then 'premium'
    when a.subscription_tier = 'premium'
      and (a.plan_expires_at is null or a.plan_expires_at > now()) then 'premium'
    else 'free'
  end
  from public.accounts a
  where a.id = uid;
$$;

create or replace function public.household_tier(hid uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(public.effective_tier(h.owner_account_id), 'free')
  from public.households h
  where h.id = hid;
$$;

-- Convenience for the client: the caller's own effective tier.
create or replace function public.my_tier()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(public.effective_tier(auth.uid()), 'free');
$$;

-- ---------------------------------------------------------------- triggers --

create or replace function public.check_household_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg public.app_config;
  used integer;
begin
  select * into cfg from public.app_config where id;
  if cfg is null or not cfg.enforce_entitlements then
    return new;
  end if;

  if coalesce(public.effective_tier(new.owner_account_id), 'free') = 'premium' then
    return new;
  end if;

  select count(*) into used
    from public.households
   where owner_account_id = new.owner_account_id;

  if used >= cfg.free_max_households then
    raise exception
      'Free plan includes % household. Upgrade to Premium to add more.', cfg.free_max_households
      using errcode = 'OD001';
  end if;

  return new;
end;
$$;

-- Counts pending invites as members: the seat is spoken for the moment it is
-- offered, otherwise a household could park unlimited outstanding invitations.
create or replace function public.check_member_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg public.app_config;
  used integer;
begin
  select * into cfg from public.app_config where id;
  if cfg is null or not cfg.enforce_entitlements then
    return new;
  end if;

  if public.household_tier(new.household_id) = 'premium' then
    return new;
  end if;

  select count(*) into used
    from public.household_members
   where household_id = new.household_id;

  if used >= cfg.free_max_members then
    raise exception
      'Free plan includes % household members. Upgrade to Premium to add more.', cfg.free_max_members
      using errcode = 'OD001';
  end if;

  return new;
end;
$$;

create or replace function public.check_goal_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg public.app_config;
  used integer;
begin
  select * into cfg from public.app_config where id;
  if cfg is null or not cfg.enforce_entitlements then
    return new;
  end if;

  if public.household_tier(new.household_id) = 'premium' then
    return new;
  end if;

  select count(*) into used
    from public.goals
   where household_id = new.household_id;

  if used >= cfg.free_max_goals then
    raise exception
      'Free plan includes % savings goals. Upgrade to Premium to add more.', cfg.free_max_goals
      using errcode = 'OD001';
  end if;

  return new;
end;
$$;

drop trigger if exists households_limit on public.households;
create trigger households_limit
  before insert on public.households
  for each row execute function public.check_household_limit();

drop trigger if exists household_members_limit on public.household_members;
create trigger household_members_limit
  before insert on public.household_members
  for each row execute function public.check_member_limit();

drop trigger if exists goals_limit on public.goals;
create trigger goals_limit
  before insert on public.goals
  for each row execute function public.check_goal_limit();

-- ------------------------------------------------------------------ grants --

grant execute on function public.effective_tier(uuid) to authenticated;
grant execute on function public.household_tier(uuid) to authenticated;
grant execute on function public.my_tier() to authenticated;
