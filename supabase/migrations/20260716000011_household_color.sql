-- OurDollar — user-chosen household accent color.
--
-- The header pill + Profile switcher color-code each household. Previously the
-- color was derived from the household id; now the owner can pick one. Stored as
-- a palette key (e.g. 'sage', 'sand'); a null falls back to the id-hash default.

alter table public.households
  add column if not exists color text;
