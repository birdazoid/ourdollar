-- OurDollar — marketing/product-update email consent (Phase 6, compliance).
-- Opt-in only (default false). Export for a mailing list must filter on this
-- column so people who never opted in are never emailed marketing.
alter table public.accounts
  add column if not exists marketing_opt_in boolean not null default false;
