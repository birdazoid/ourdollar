// A per-household accent color used by the header pill + the Profile switcher so
// each household is visually distinct and switching is obvious. The owner can
// pick one (stored as a palette key on households.color); with none set, we fall
// back to a stable choice hashed from the household id (never changes).

export type HouseholdColor = { key: string; dot: string; tint: string };

export const HOUSEHOLD_COLORS: HouseholdColor[] = [
  { key: 'sage', dot: '#5E8F77', tint: 'rgba(129,178,154,0.18)' },
  { key: 'sand', dot: '#C9974A', tint: 'rgba(242,204,143,0.28)' },
  { key: 'terracotta', dot: '#C25A40', tint: 'rgba(224,122,95,0.18)' },
  { key: 'ink', dot: '#3D405B', tint: 'rgba(61,64,91,0.10)' },
  { key: 'slate', dot: '#7A7E9C', tint: 'rgba(122,126,156,0.16)' },
];

export function householdColor(h: { id: string; color?: string | null }): HouseholdColor {
  if (h.color) {
    const chosen = HOUSEHOLD_COLORS.find((c) => c.key === h.color);
    if (chosen) return chosen;
  }
  let n = 0;
  for (let i = 0; i < h.id.length; i++) n = (n * 31 + h.id.charCodeAt(i)) >>> 0;
  return HOUSEHOLD_COLORS[n % HOUSEHOLD_COLORS.length];
}
