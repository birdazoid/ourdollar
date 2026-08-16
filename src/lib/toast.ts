// A tiny pub/sub for transient messages.
//
// Deliberately not a React context: the QueryClient's MutationCache is built
// before anything renders, so the handler that reports a failed write can't
// reach a hook. A module-level emitter can be called from anywhere.

export type ToastKind = 'error' | 'info';
export type ToastMessage = { id: number; kind: ToastKind; text: string };

type Listener = (message: ToastMessage) => void;

const listeners = new Set<Listener>();
let nextId = 1;

export function showToast(text: string, kind: ToastKind = 'error'): void {
  const message: ToastMessage = { id: nextId++, kind, text };
  listeners.forEach((listen) => listen(message));
}

export function subscribeToToasts(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Everything a thrown value can tell us about what went wrong.
 *
 * Supabase rejects with a PLAIN OBJECT ({ message, details, hint, code }), not
 * an Error, and `queries.ts` rethrows it untouched. Checking `instanceof Error`
 * therefore missed every real database failure and stringified it to
 * "[object Object]", so each specific case below silently fell through to the
 * generic message. The code field matters too: RLS denials arrive as 42501
 * with wording that varies.
 */
function readErrorText(error: unknown): string {
  if (error == null) return '';
  if (typeof error === 'string') return error;
  if (typeof error !== 'object') return String(error);
  const e = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
  return [e.message, e.details, e.hint, e.code].filter((p) => typeof p === 'string' || typeof p === 'number').join(' ');
}

/**
 * A failed write, in words the household can act on.
 *
 * Supabase surfaces Postgres codes and internal phrasing that mean nothing to
 * a person mid-shop. What matters is whether to try again, so that's what each
 * message says.
 */
export function describeWriteError(error: unknown): string {
  const raw = readErrorText(error);

  if (/network|fetch|timeout|timed out|offline|econn/i.test(raw)) {
    return "Couldn't save. Check your connection and try again.";
  }
  if (/duplicate key|23505|already exists/i.test(raw)) {
    return 'That one already exists.';
  }
  if (/row-level security|permission|not authorized|42501/i.test(raw)) {
    return "You don't have permission to change that.";
  }
  if (/jwt|token|session|401/i.test(raw)) {
    return 'Your session expired. Sign in again to save this.';
  }
  return "Couldn't save your change. Please try again.";
}
