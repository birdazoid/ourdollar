-- OurDollar — give arriving money a job.
--
-- Extra income had two paths and both assumed it was spending money. Logged on
-- a week it raised that week's free-to-spend; added in Setup it raised EVERY
-- week in the period. So selling something specifically to dig out of a hole
-- made the app announce you had more to spend, which is exactly backwards.
--
-- The app already asks this question correctly for money left OVER: the
-- rollover prompt offers next week, a goal, catch-up, or nothing. Money
-- arriving deserves the identical question and never got asked. This column is
-- that answer.
--
-- NULL means "this week", which is what every existing income row did, so old
-- rows keep behaving exactly as they always have.

alter table public.transactions
  add column if not exists income_destination text;

alter table public.transactions
  drop constraint if exists transactions_income_destination_check;

alter table public.transactions
  add constraint transactions_income_destination_check
  check (
    income_destination is null
    or income_destination in ('this_week', 'catch_up', 'goal', 'month')
  );

comment on column public.transactions.income_destination is
  'For type=income only: where the money was assigned. NULL is treated as this_week. Only this_week raises the week''s free-to-spend.';
