/** 1 → "1st", 2 → "2nd", 23 → "23rd", etc. */
export function ordinal(d: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = d % 100;
  return d + (s[(v - 20) % 10] || s[v] || s[0]);
}
