import { useEnsureMonthClosed } from '@/lib/month-close';

/**
 * Invisible. Mounted once at the app root (see (app)/_layout.tsx) so a
 * completed month gets closed out — bills reset, unpaid ones flagged as
 * reminders, a plan snapshot written — the moment the app is opened in a new
 * month, regardless of whether the household ever opens the review wizard.
 */
export function MonthAutoClose() {
  useEnsureMonthClosed(true);
  return null;
}
