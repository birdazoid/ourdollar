-- OurDollar — mark the expenses that aren't spending.
--
-- Two flows now write an expense row that isn't a purchase: money put into the
-- emergency fund by hand, and paying catch-up down out of a week. Both have to
-- charge the week, because the money genuinely leaves it — that is the whole
-- point of them. But neither is spending ON anything, and until now nothing
-- said so, which meant both landed in the Overview category breakdown as
-- "Other" and inflated the monthly spending trend. A household putting $200 a
-- month into their fund would read as spending $200 a month more than they do.
--
-- A flag rather than a reserved category. A category would appear in the Add
-- Expense picker, inviting people to file real purchases under it, and it
-- would still be counted as spending everywhere that groups by category.
--
-- The split this creates, in the client:
--
--   isWeekExpense()      money that left the week    — INCLUDES transfers
--   isVariableExpense()  spending on things          — EXCLUDES transfers
--
-- The first is what the weekly allowance is measured against, so a transfer
-- still reduces what's left to spend. The second is what the category
-- breakdown, the monthly trend and the month review are built from.
--
-- Transfers deliberately do NOT count toward a planned-spending envelope
-- either: moving $200 to the fund should come out of free money, not out of
-- the Groceries budget. Since a transfer carries no category it falls into the
-- un-enveloped remainder, which is exactly where it belongs.

alter table public.transactions
  add column if not exists transfer boolean not null default false;

-- Existing rows are all real spending: the two flows that write transfers were
-- added after this column, so no backfill is needed and `false` is correct for
-- everything already recorded.

-- Partial index: transfers are a small minority of rows and are only ever
-- looked up to be excluded, so this keeps the common "not a transfer" scan
-- cheap without carrying an index over the whole table.
create index if not exists idx_transactions_transfer
  on public.transactions (household_id, occurred_on)
  where transfer = true;
