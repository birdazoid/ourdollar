-- OurDollar — stop handing out permanent Premium by default.
--
-- founding_user defaulted to TRUE, and public.effective_tier() treats it as
-- Premium with no expiry. Every account ever created was therefore permanently
-- Premium, which is a pricing decision being made now, before there is a price.
-- Each signup quietly removed an option that can't be taken back.
--
-- Nothing changes today: ENTITLEMENTS_ENFORCED is false in the app, so no
-- limits are enforced either way. What changes is that the decision stops being
-- made automatically.
--
-- The option is not lost. accounts.created_at already records who was early, so
-- founding status can be granted later, deliberately, once there's a plan and
-- real numbers to price against:
--
--   update public.accounts set founding_user = true
--   where created_at < '<launch date>';
--
-- The standard advice on lifetime access is to BOUND it from the start — an
-- expiry, or the feature set as it stands at launch — and to say so up front.
-- Unbounded is the version people regret, because costs scale with users while
-- a one-off grant does not.
--
-- Existing accounts keep what they have: ALTER COLUMN ... SET DEFAULT does not
-- touch rows that already exist. The households already using the app were the
-- testers, and they stay founding.

alter table public.accounts
  alter column founding_user set default false;

comment on column public.accounts.founding_user is
  'Permanently Premium, no expiry (see public.effective_tier). Defaults to false: grant it deliberately, and prefer bounding any grant by date or feature set.';
