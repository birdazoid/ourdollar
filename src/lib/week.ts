// Date-based weeks (Sunday-start) for the Week screen. Transactions carry an
// occurred_on date ('YYYY-MM-DD'); "this week" is computed, not manually archived.

export type WeekDay = {
  date: string; // YYYY-MM-DD
  dayNum: number; // day of month
  short: string; // Su, Mo, ...
  isToday: boolean;
  isPast: boolean;
};

const SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Local YYYY-MM-DD for today (avoids UTC off-by-one from toISOString). */
export function todayISO(): string {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

/**
 * The Sunday-start week `offset` weeks from the current one (0 = this week,
 * -1 = last week). Returns the 7 days and the [start,end] ISO bounds.
 */
export function getWeek(offset = 0) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - now.getDay() + offset * 7);

  const today = todayISO();
  const days: WeekDay[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    const iso = toISODateLocal(d);
    return {
      date: iso,
      dayNum: d.getDate(),
      short: SHORT[i],
      isToday: iso === today,
      isPast: iso < today,
    };
  });

  return { start: days[0].date, end: days[6].date, days };
}

// Local-timezone YYYY-MM-DD (Date.toISOString is UTC).
function toISODateLocal(d: Date): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function weekRangeLabel(days: WeekDay[]): string {
  const fmt = (iso: string) => {
    const [, m, day] = iso.split('-');
    const monthName = new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short' });
    return `${monthName} ${Number(day)}`;
  };
  return `${fmt(days[0].date)} – ${fmt(days[6].date)}`;
}

/** "Monday", "Today", "Yesterday" heading for a given ISO date. */
export function dayHeading(iso: string): string {
  const today = todayISO();
  if (iso === today) return 'Today';
  const t = new Date(`${iso}T00:00:00`);
  const y = new Date(`${today}T00:00:00`);
  const diff = Math.round((y.getTime() - t.getTime()) / 86400000);
  if (diff === 1) return 'Yesterday';
  return LONG[t.getDay()];
}

export const dayShort = (iso: string) => SHORT[new Date(`${iso}T00:00:00`).getDay()];
