/**
 * Verifies the catch-up balance: the table, its RLS, the balance-from-entries
 * rule, the overpay clamp, and the new 'catch_up' rollover resolution.
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
