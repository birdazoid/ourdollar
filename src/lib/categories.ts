// Fixed app-side taxonomies (design-brief §7/§8; ported from the prototype).
// Stored on rows as text ids/names — not DB tables.

export const BILL_CATS = [
  'Housing',
  'Loans',
  'Bills & Utilities',
  'Education',
  'Kids',
  'Subscriptions',
  'Medical',
  'Donations',
  'Other',
] as const;

export type BillCategory = (typeof BILL_CATS)[number];

export const BILL_EMOJI: Record<string, string> = {
  Housing: '🏠',
  Loans: '🏦',
  'Bills & Utilities': '💡',
  Education: '🎓',
  Kids: '🧒',
  Subscriptions: '📺',
  Medical: '🩺',
  Donations: '💝',
  Other: '📦',
};

export const billEmoji = (cat: string) => BILL_EMOJI[cat] ?? '📦';

export const catRank = (cat: string) => {
  const i = (BILL_CATS as readonly string[]).indexOf(cat);
  return i === -1 ? BILL_CATS.length : i;
};

export const GOAL_EMOJI_OPTIONS = ['🎁', '🚗', '🏕️', '🏠', '✈️', '🎓', '💍', '🩺', '🐾', '🎉'] as const;

// Variable-spending categories for transactions (Week / Add Expense).
export const TX_CATEGORIES = [
  { id: 'groceries', name: 'Groceries', color: '#81B29A', emoji: '🛒' },
  { id: 'fuel', name: 'Fuel', color: '#7A7E9C', emoji: '⛽' },
  { id: 'dining', name: 'Dining', color: '#E07A5F', emoji: '🌮' },
  { id: 'household', name: 'Household', color: '#A3C9B2', emoji: '🧺' },
  { id: 'kids', name: 'Kids', color: '#F2CC8F', emoji: '🧒' },
  { id: 'pets', name: 'Pets', color: '#B0785A', emoji: '🐾' },
  { id: 'personal', name: 'Personal', color: '#C9A96A', emoji: '🛍️' },
  { id: 'entertainment', name: 'Entertainment', color: '#3D405B', emoji: '🎮' },
  { id: 'other', name: 'Other', color: '#B8B29B', emoji: '📦' },
] as const;

export const txCategoryById = (id: string | null) =>
  TX_CATEGORIES.find((c) => c.id === id) ?? TX_CATEGORIES[TX_CATEGORIES.length - 1];
