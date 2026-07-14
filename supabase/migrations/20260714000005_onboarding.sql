-- OurDollar — Phase 4 (onboarding wizard).
-- Track whether an account has been through first-run setup, so the wizard
-- auto-launches exactly once. Defaults false; set true when the wizard is
-- finished or dismissed. Existing seeded accounts stay false but won't see the
-- wizard because their household already has income/bills (the client also
-- gates on an empty household).
alter table public.accounts
  add column if not exists onboarded boolean not null default false;
