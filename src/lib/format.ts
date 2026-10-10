/** 1 → "1st", 2 → "2nd", 23 → "23rd", etc. */
export function ordinal(d: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = d % 100;
  return d + (s[(v - 20) % 10] || s[v] || s[0]);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-10" → "Oct 10". Read straight from the string, so no time zone can shift the day. */
export function shortDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return m && d ? `${MONTHS[m - 1]} ${d}` : iso;
}
