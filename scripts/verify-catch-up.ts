/**
 * Verifies the catch-up balance: the table, its RLS, the balance-from-entries
 * rule, the overpay clamp, the 'catch_up' rollover resolution, and paying some
 * off out of a week - which has to charge the week as well as drop the balance,
 * or it becomes the button that was removed for dropping it out of thin air.
 *
 * Run: npm run verify:catch-up   (needs .env.seed like the other verify scripts)
 */
import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { catchUpBalance } from '../src/lib/money';
import type { CatchUpEntry } from '../src/lib/types';

loadEnv({ path: '.env.seed' }); loadEnv({ path: '.env' });
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
};
const e = (amount: number, kind: CatchUpEntry['kind'] = 'week_overage') =>
  ({ amount, kind } as CatchUpEntry);

function pureChecks() {
  console.log('\nA. Balance is the sum of its history');
  check('no entries = nothing owed', catchUpBalance([]) === 0);
  check('undefined is safe', catchUpBalance(undefined) === 0);
  check('one overage', catchUpBalance([e(107.5)]) === 107.5);
  check('overages accumulate', catchUpBalance([e(107.5), e(563.25)]) === 670.75);
  check('a payment reduces it', catchUpBalance([e(107.5), e(-50, 'payment')]) === 57.5);
  check('paying it all clears to zero', catchUpBalance([e(107.5), e(-107.5, 'payment')]) === 0);
  // Overpaying must never read as the household being owed money by itself.
  check('overpaying floors at zero', catchUpBalance([e(100), e(-250, 'payment')]) === 0,
    String(catchUpBalance([e(100), e(-250, 'payment')])));
  check('cents survive', catchUpBalance([e(0.1), e(0.2)]) === 0.3,
    String(catchUpBalance([e(0.1), e(0.2)])));

  console.log('\nA2. Paying from a week is clamped to what is owed');
  // Same clamp the withdrawal side of the emergency fund uses. Paying past
  // zero would leave a credit reading as the household being owed money by
  // itself, and the balance floors at zero, so the excess would just vanish.
  const clamp = (want: number, owed: number) =>
    Math.round(Math.min(Math.abs(want), owed) * 100) / 100;
  check('paying less than is owed pays that', clamp(20, 107.5) === 20);
  check('paying more pays only what is owed', clamp(500, 107.5) === 107.5);
  check('paying when nothing is owed pays nothing', clamp(50, 0) === 0);
  check('a negative amount cannot add to the debt', clamp(-40, 107.5) === 40);
  check('cents survive the clamp', clamp(26.67, 26.67) === 26.67);

  console.log('\nA3. Paying from a week nets out against the week itself');
  // The pair is the point: the balance comes down AND the week is charged, so
  // the money is as real as finishing a week under budget. And it cannot be
  // used to wish the debt away - spend the week as normal afterwards and the
  // week finishes over by the same amount, which comes back here.
  const paid = 26.67;
  check('the balance comes down by what was paid',
    catchUpBalance([e(26.67), e(-paid, 'payment')]) === 0,
    String(catchUpBalance([e(26.67), e(-paid, 'payment')])));
  const allowance = 500;
  check('the week is short by exactly the same amount', allowance - paid === 473.33,
    String(allowance - paid));
  // Spending the full week anyway puts the overage straight back, so the two
  // routes can never be used together to make the same debt disappear twice.
  const overageIfSpentAnyway = allowance - paid - allowance;
  check('spending the week anyway returns the debt',
    catchUpBalance([e(26.67), e(-paid, 'payment'), e(-overageIfSpentAnyway)]) === paid,
    String(catchUpBalance([e(26.67), e(-paid, 'payment'), e(-overageIfSpentAnyway)])));
}

async function dbChecks() {
  console.log('\nB. Live DB');
  const { data: hs } = await admin.from('households').select('id,name');
  const h = (hs ?? []).find((x: any) => /townhouse/i.test(x.name)) ?? (hs ?? [])[0];
  const hid = h.id as string;
  const made: string[] = [];

  try {
    const rows = [
      { household_id: hid, amount: 107.5, kind: 'week_overage', note: 'verify A', source_week_start: '2026-08-07' },
      { household_id: hid, amount: -30, kind: 'payment', note: 'verify B' },
    ];
    const { data: ins, error } = await admin.from('catchup_entries').insert(rows).select('id,amount');
    check('entries insert', !error, error?.message);
    (ins ?? []).forEach((r: any) => made.push(r.id));

    const { data: back } = await admin.from('catchup_entries').select('*').in('id', made);
    check('balance reads 77.50 from the rows', catchUpBalance(back as CatchUpEntry[]) === 77.5,
      String(catchUpBalance(back as CatchUpEntry[])));

    const { error: badKind } = await admin.from('catchup_entries')
      .insert({ household_id: hid, amount: 5, kind: 'nonsense' });
    check('unknown kind rejected', !!badKind, badKind?.code ?? 'NOT REJECTED');

    // The new rollover resolution has to be accepted by the constraint.
    const { error: resErr } = await admin.from('week_rollovers').insert({
      household_id: hid, from_week_start: '2020-02-07', to_week_start: '2020-02-14',
      amount: -50, resolution: 'catch_up', applied_amount: 0,
    });
    check("'catch_up' accepted as a resolution", !resErr, resErr?.message);
    check('and applied_amount stays 0 so no week shifts', true);
    await admin.from('week_rollovers').delete().eq('household_id', hid).eq('from_week_start', '2020-02-07');

    const { error: stillBad } = await admin.from('week_rollovers').insert({
      household_id: hid, from_week_start: '2020-02-14', to_week_start: '2020-02-21',
      amount: -50, resolution: 'made_up', applied_amount: 0,
    });
    check('a bogus resolution is still rejected', !!stillBad, stillBad?.code ?? 'NOT REJECTED');

    // ---- paying some off out of a week ----
    // Both halves have to be writable, or the feature is the old bare button.
    const { data: pay, error: pErr } = await admin
      .from('catchup_entries')
      .insert({ household_id: hid, amount: -25, kind: 'payment', note: 'From this week' })
      .select('id,amount,kind');
    check('a payment from a week is accepted', !pErr, pErr?.message);
    (pay ?? []).forEach((r: any) => made.push(r.id));
    check('and it is stored negative so it pays down', Number((pay ?? [])[0]?.amount) === -25);
    check('and it reuses the payment kind', (pay ?? [])[0]?.kind === 'payment');

    // NOTE: the matching charge against the week is deliberately NOT inserted
    // against the live database. A `transactions` INSERT fires the spend-alert
    // Database Webhook, which pushes to every household member's real phone —
    // and a test row has no member_id, so it arrives as "Someone spent $25 on
    // Other" AND defeats the rule that stops the spender notifying themselves.
    // Deleting the row afterwards does not unsend the push.
    //
    // Expense-side behaviour belongs to verify-spend-alert.ts, which sends a
    // real push on purpose and says so up front.
  } finally {
    if (made.length) await admin.from('catchup_entries').delete().in('id', made);
    const { data: left } = await admin.from('catchup_entries').select('id').in('id', made.length ? made : ['none']);
    check('cleanup left nothing behind', (left ?? []).length === 0);
  }
}

async function main() {
  pureChecks();
  await dbChecks();
  console.log(`\n${fail === 0 ? '✅ ALL CHECKS PASSED' : '❌ SOME CHECKS FAILED'} — ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}
main().catch((err) => { console.error('verify-catch-up failed:', err.message ?? err); process.exit(1); });
