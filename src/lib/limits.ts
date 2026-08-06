// Plan entitlements, mirroring the 20260806000019_entitlements migration.
//
// The database is authoritative. Everything here exists so the UI can show
// "2 of 2 goals used" and disable an action before a write round-trips, not to
// decide who is allowed to do what. Changing a number in this file does NOT
// change enforcement; update public.app_config to do that.
//
// Both sides currently ship permissive: ENTITLEMENTS_ENFORCED is false and
// app_config.enforce_entitlements is false, so nothing is refused at launch.
// Switching them on is docs/premium-launch.md; read it first, because the
// client flag has to ship before the database one.

import type { Account } from '@/lib/types';

export const TIERS = ['free', 'premium'] as const;
export type Tier = (typeof TIERS)[number];

/**
 * Mirrors public.app_config.enforce_entitlements. Keep the two in step, and
 * flip this one first. See docs/premium-launch.md.
 */
export const ENTITLEMENTS_ENFORCED = false;

/** Mirrors the free_max_* defaults in public.app_config. */
export const FREE_LIMITS = {
  households: 1,
  membersPerHousehold: 2,
  goalsPerHousehold: 2,
} as const;

export type LimitKind = keyof typeof FREE_LIMITS;

/** Premium is uncapped on every countable resource. */
export const PREMIUM_LIMITS: Record<LimitKind, number> = {
  households: Infinity,
  membersPerHousehold: Infinity,
  goalsPerHousehold: Infinity,
};

/**
 * The tier that actually applies right now. Mirrors public.effective_tier():
 * founding users are permanently Premium, and a paid tier only counts while it
 * hasn't expired.
 */
export function effectiveTier(account: Account | null | undefined): Tier {
  if (!account) return 'free';
  if (account.founding_user) return 'premium';
  if (
    account.subscription_tier === 'premium' &&
    (account.plan_expires_at == null || new Date(account.plan_expires_at) > new Date())
  ) {
    return 'premium';
  }
  return 'free';
}

export const limitFor = (tier: Tier, kind: LimitKind): number =>
  tier === 'premium' ? PREMIUM_LIMITS[kind] : FREE_LIMITS[kind];

/**
 * Whether `used` has reached the cap. Always false while enforcement is off, so
 * call sites can gate UI on this today and get launch's permissive behaviour
 * without a second flag of their own.
 */
export const isAtLimit = (tier: Tier, kind: LimitKind, used: number): boolean =>
  ENTITLEMENTS_ENFORCED && used >= limitFor(tier, kind);

/** How many more are allowed; Infinity on Premium. */
export const remaining = (tier: Tier, kind: LimitKind, used: number): number =>
  ENTITLEMENTS_ENFORCED ? Math.max(0, limitFor(tier, kind) - used) : Infinity;

/**
 * SQLSTATE raised by the limit triggers. A write can still fail this way even
 * when the client thinks there's room (a second device added the row first), so
 * mutations should catch it and show the upgrade prompt rather than a generic
 * error.
 */
export const LIMIT_ERROR_CODE = 'OD001';

export const isLimitError = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: string }).code === LIMIT_ERROR_CODE;
