-- OurDollar — allow weekly and every-two-weeks income.
--
-- Income could only be 'monthly' or 'semimonthly', so anyone paid every two
-- weeks had to pick "twice a month" as the nearest option. Those are NOT the
-- same: biweekly is 26 paychecks a year, semimonthly is 24. A $1,000 biweekly
-- paycheck is $2,166.67 a month, not $2,000, so the app understated that
-- household's income by 8.3%, roughly one whole paycheck a year, and every
-- downstream figure (weekly allowance included) inherited the error.
--
-- Monthly-equivalent multipliers, mirrored in FREQ in src/lib/money.ts:
--   weekly       52/12 = 4.3333
--   biweekly     26/12 = 2.1667
--   semimonthly  2
--   monthly      1

alter table public.income_sources
  drop constraint if exists income_sources_frequency_check;

alter table public.income_sources
  add constraint income_sources_frequency_check
  check (frequency in ('monthly', 'semimonthly', 'biweekly', 'weekly'));
