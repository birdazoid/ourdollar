-- OurDollar — row-level security. Every household-owned table is scoped through
-- household_members: an account can only touch data for households it belongs to.

-- Membership check. SECURITY DEFINER so it reads household_members with RLS
-- bypassed — this is what prevents infinite recursion when household_members'
-- own policies need to check membership.
create or replace function public.is_household_member(hid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from household_members hm
    where hm.household_id = hid
      and hm.account_id = auth.uid()
  );
$$;

-- Does auth.uid() own this household? (used for the bootstrap case where a
-- freshly-created household has no members yet).
create or replace function public.owns_household(hid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from households h
    where h.id = hid
      and h.owner_account_id = auth.uid()
  );
$$;

alter table public.accounts            enable row level security;
alter table public.households          enable row level security;
alter table public.household_members   enable row level security;
alter table public.push_tokens         enable row level security;
alter table public.income_sources      enable row level security;
alter table public.extra_income        enable row level security;
alter table public.bills               enable row level security;
alter table public.goals               enable row level security;
alter table public.fun_money_settings  enable row level security;
alter table public.fun_money_people    enable row level security;
alter table public.transactions        enable row level security;
alter table public.activity_log        enable row level security;

-- accounts — a user sees and manages only their own row.
create policy accounts_select on public.accounts
  for select using (id = auth.uid());
create policy accounts_insert on public.accounts
  for insert with check (id = auth.uid());
create policy accounts_update on public.accounts
  for update using (id = auth.uid()) with check (id = auth.uid());
create policy accounts_delete on public.accounts
  for delete using (id = auth.uid());

-- households — visible to members and the owner; only the owner mutates the row.
create policy households_select on public.households
  for select using (owner_account_id = auth.uid() or public.is_household_member(id));
create policy households_insert on public.households
  for insert with check (owner_account_id = auth.uid());
create policy households_update on public.households
  for update using (owner_account_id = auth.uid()) with check (owner_account_id = auth.uid());
create policy households_delete on public.households
  for delete using (owner_account_id = auth.uid());

-- household_members — any member can read/manage the roster; the owner can seed
-- the first member row before membership exists.
create policy household_members_select on public.household_members
  for select using (public.is_household_member(household_id) or public.owns_household(household_id));
create policy household_members_insert on public.household_members
  for insert with check (public.is_household_member(household_id) or public.owns_household(household_id));
create policy household_members_update on public.household_members
  for update using (public.is_household_member(household_id) or public.owns_household(household_id))
  with check (public.is_household_member(household_id) or public.owns_household(household_id));
create policy household_members_delete on public.household_members
  for delete using (public.is_household_member(household_id) or public.owns_household(household_id));

-- push_tokens — a user manages only their own device tokens.
create policy push_tokens_all on public.push_tokens
  for all using (account_id = auth.uid()) with check (account_id = auth.uid());

-- Household-owned data tables: full access scoped to household membership.
-- (owns_household included so the owner can populate a brand-new household.)
create policy income_sources_all on public.income_sources
  for all using (public.is_household_member(household_id) or public.owns_household(household_id))
  with check (public.is_household_member(household_id) or public.owns_household(household_id));

create policy extra_income_all on public.extra_income
  for all using (public.is_household_member(household_id) or public.owns_household(household_id))
  with check (public.is_household_member(household_id) or public.owns_household(household_id));

create policy bills_all on public.bills
  for all using (public.is_household_member(household_id) or public.owns_household(household_id))
  with check (public.is_household_member(household_id) or public.owns_household(household_id));

create policy goals_all on public.goals
  for all using (public.is_household_member(household_id) or public.owns_household(household_id))
  with check (public.is_household_member(household_id) or public.owns_household(household_id));

create policy fun_money_settings_all on public.fun_money_settings
  for all using (public.is_household_member(household_id) or public.owns_household(household_id))
  with check (public.is_household_member(household_id) or public.owns_household(household_id));

create policy fun_money_people_all on public.fun_money_people
  for all using (public.is_household_member(household_id) or public.owns_household(household_id))
  with check (public.is_household_member(household_id) or public.owns_household(household_id));

create policy transactions_all on public.transactions
  for all using (public.is_household_member(household_id) or public.owns_household(household_id))
  with check (public.is_household_member(household_id) or public.owns_household(household_id));

create policy activity_log_all on public.activity_log
  for all using (public.is_household_member(household_id) or public.owns_household(household_id))
  with check (public.is_household_member(household_id) or public.owns_household(household_id));
