-- OurDollar — initial schema (design-brief §9)
-- Person fields (income "who", bill "paid_by", transaction "who", fun-money person)
-- reference household_members(id) rather than storing names, so renames and
-- duplicate names are handled correctly. Transaction/bill *categories* are fixed
-- app-side constants (with colors/emoji) and stored as text ids, not DB tables.

-- accounts — one row per authenticated user (id mirrors auth.users.id).
-- subscription_* are stubbed here; real values come from RevenueCat in Phase 5.
create table if not exists public.accounts (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  subscription_status text not null default 'free',
  subscription_tier text not null default 'free',
  created_at timestamptz not null default now()
);

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_account_id uuid not null references public.accounts (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- household_members — the join between accounts and households. account_id is
-- nullable so a fun-money-only / invited-but-not-yet-registered person can exist
-- as a member with just a name.
create table if not exists public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  account_id uuid references public.accounts (id) on delete set null,
  name text not null,
  avatar text,
  is_admin boolean not null default false,
  has_account boolean not null default false,
  invite_email text,
  invite_pending boolean not null default false,
  notify_on_spend boolean not null default true,
  created_at timestamptz not null default now()
);

-- push_tokens — Expo push tokens per device, keyed to an account (design-brief §2).
create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  expo_push_token text not null unique,
  device_platform text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.income_sources (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  member_id uuid references public.household_members (id) on delete set null,
  amount numeric(12, 2) not null,
  frequency text not null default 'monthly'
    check (frequency in ('monthly', 'semimonthly')),
  created_at timestamptz not null default now()
);

create table if not exists public.extra_income (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  member_id uuid references public.household_members (id) on delete set null,
  source text not null,
  amount numeric(12, 2) not null,
  occurred_on date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists public.bills (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  amount numeric(12, 2),
  category text not null default 'Other',
  due_day smallint check (due_day between 1 and 31),
  due_label text,
  varies boolean not null default false,
  paid boolean not null default false,
  paid_amount numeric(12, 2),
  paid_by_member_id uuid references public.household_members (id) on delete set null,
  paid_on date,
  created_at timestamptz not null default now()
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  emoji text,
  target_amount numeric(12, 2) not null,
  monthly_amount numeric(12, 2) not null default 0,
  saved_amount numeric(12, 2) not null default 0,
  paid_this_month boolean not null default false,
  created_at timestamptz not null default now()
);

-- One settings row per household (household_id is the PK).
create table if not exists public.fun_money_settings (
  household_id uuid primary key references public.households (id) on delete cascade,
  enabled boolean not null default false
);

create table if not exists public.fun_money_people (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  member_id uuid references public.household_members (id) on delete cascade,
  monthly_amount numeric(12, 2) not null default 0,
  unique (household_id, member_id)
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  member_id uuid references public.household_members (id) on delete set null,
  amount numeric(12, 2) not null,
  category text,
  label text,
  type text not null default 'expense' check (type in ('expense', 'income')),
  is_fun_money boolean not null default false,
  occurred_on date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  text text not null,
  amount numeric(12, 2),
  occurred_at timestamptz not null default now()
);

-- Indexes on foreign keys used for household-scoped reads.
create index if not exists idx_household_members_household on public.household_members (household_id);
create index if not exists idx_household_members_account on public.household_members (account_id);
create index if not exists idx_push_tokens_account on public.push_tokens (account_id);
create index if not exists idx_income_sources_household on public.income_sources (household_id);
create index if not exists idx_extra_income_household on public.extra_income (household_id);
create index if not exists idx_bills_household on public.bills (household_id);
create index if not exists idx_goals_household on public.goals (household_id);
create index if not exists idx_fun_money_people_household on public.fun_money_people (household_id);
create index if not exists idx_transactions_household on public.transactions (household_id);
create index if not exists idx_transactions_occurred_on on public.transactions (household_id, occurred_on);
create index if not exists idx_activity_log_household on public.activity_log (household_id, occurred_at);
