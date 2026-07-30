-- OurDollar — end-of-month review & bill carryovers.
--
-- Bills track only their CURRENT cycle (paid/paid_amount/paid_on) — there's no
-- history once a bill resets for a new month. Two small additive tables give the
-- month-review wizard what it needs without changing how `bills` works day to day:
--
--   bill_month_snapshots — one row per household per CLOSED month, written when
--     the household finishes reviewing it. This is the only durable record of a
--     month's bill totals, since bills.paid resets on close. Used for "vs last
--     month" comparisons in later reviews.
--
--   bill_carryovers — one row per bill that was still unpaid when a month closed
--     AND the household chose to carry it forward. Shown as its own "Unpaid from
--     [Month]" reminder on the Bills screen, separate from the bill's fresh new
--     cycle (which always resets clean regardless of this choice).

create table if not exists public.bill_month_snapshots (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  month date not null, -- first-of-month, the month being closed
  bills_paid_amount numeric(12, 2) not null default 0,
  bills_total_amount numeric(12, 2) not null default 0,
  bills_paid_count integer not null default 0,
  bills_total_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (household_id, month)
);

create table if not exists public.bill_carryovers (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  bill_id uuid references public.bills (id) on delete set null,
  name text not null,
  category text not null,
  amount numeric(12, 2),
  from_month date not null,
  resolved boolean not null default false,
  resolved_amount numeric(12, 2),
  resolved_by_member_id uuid references public.household_members (id) on delete set null,
  resolved_on date,
  created_at timestamptz not null default now()
);

create index if not exists idx_bill_month_snapshots_household on public.bill_month_snapshots (household_id);
create index if not exists idx_bill_carryovers_household on public.bill_carryovers (household_id, resolved);

alter table public.bill_month_snapshots enable row level security;
alter table public.bill_carryovers enable row level security;

create policy bill_month_snapshots_all on public.bill_month_snapshots
  for all using (public.is_household_member(household_id) or public.owns_household(household_id))
  with check (public.is_household_member(household_id) or public.owns_household(household_id));

create policy bill_carryovers_all on public.bill_carryovers
  for all using (public.is_household_member(household_id) or public.owns_household(household_id))
  with check (public.is_household_member(household_id) or public.owns_household(household_id));
